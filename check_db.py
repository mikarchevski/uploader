#!/usr/bin/env python3
"""
Скрипт для диагностики состояния базы данных
"""
import sqlite3
import os
from datetime import datetime

# Путь к базе данных - проверяем оба возможных расположения
DB_PATHS = [
    '/opt/filebrowser/data/uploads.db',  # Основной путь (где реально лежит БД)
    '/opt/uploader/data/uploads.db',      # Альтернативный путь из config.py
    'data/uploads.db',                     # Относительный путь
    'uploads.db'                           # В корне проекта
]

def find_database():
    """Находит существующую базу данных"""
    for path in DB_PATHS:
        if os.path.exists(path):
            return os.path.abspath(path)
    return None

def check_database(db_path):
    """Проверяет состояние базы данных"""
    print("=" * 60)
    print("🔍 ДИАГНОСТИКА БАЗЫ ДАННЫХ")
    print("=" * 60)
    
    print(f"\n📍 Путь к БД: {db_path}")
    print(f"   Размер файла: {os.path.getsize(db_path)} bytes")
    print(f"   Последнее изменение: {datetime.fromtimestamp(os.path.getmtime(db_path))}")
    print("-" * 60)
    
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Проверяем наличие таблицы files
        c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='files'")
        if not c.fetchone():
            print("\n❌ Таблица 'files' не существует!")
            print("   База данных повреждена или не инициализирована")
            return
        
        # 1. Общее количество файлов
        c.execute('SELECT COUNT(*) as total FROM files')
        total = c.fetchone()['total']
        print(f"\n📊 ОБЩЕЕ КОЛИЧЕСТВО ФАЙЛОВ В БД: {total}")
        
        if total == 0:
            print("⚠️  База данных пуста! Нет загруженных файлов.")
            return
        
        # 2. Количество файлов по пользователям
        print("\n👥 ФАЙЛЫ ПО ПОЛЬЗОВАТЕЛЯМ:")
        c.execute('''
            SELECT owner_id, COUNT(*) as count 
            FROM files 
            GROUP BY owner_id 
            ORDER BY count DESC
        ''')
        for row in c.fetchall():
            owner = row['owner_id'] if row['owner_id'] else 'NULL/Anonymous'
            print(f"   User {owner}: {row['count']} файлов")
        
        # 3. Последние 10 загруженных файлов
        print("\n📁 ПОСЛЕДНИЕ 10 ЗАГРУЖЕННЫХ ФАЙЛОВ:")
        c.execute('''
            SELECT short_id, original_filename, file_size, upload_date, owner_id, folder_path
            FROM files 
            ORDER BY upload_date DESC 
            LIMIT 10
        ''')
        for i, row in enumerate(c.fetchall(), 1):
            print(f"   {i}. {row['original_filename']}")
            print(f"      ID: {row['short_id']}")
            print(f"      Размер: {row['file_size']} bytes")
            print(f"      Дата: {row['upload_date']}")
            print(f"      Владелец: {row['owner_id']}")
            print(f"      Папка: '{row['folder_path']}'")
            print()
        
        # 4. Проверка на дубликаты short_id
        print("\n🔍 ПРОВЕРКА НА ДУБЛИКАТЫ short_id:")
        c.execute('''
            SELECT short_id, COUNT(*) as count 
            FROM files 
            GROUP BY short_id 
            HAVING count > 1
        ''')
        duplicates = c.fetchall()
        if duplicates:
            print(f"   ⚠️  Найдено {len(duplicates)} дубликатов:")
            for dup in duplicates:
                print(f"      {dup['short_id']}: {dup['count']} записей")
        else:
            print("   ✓ Дубликатов не найдено")
        
        # 5. Файлы с пустым owner_id
        print("\n🔍 ФАЙЛЫ БЕЗ ВЛАДЕЛЬЦА (owner_id IS NULL):")
        c.execute('SELECT COUNT(*) as count FROM files WHERE owner_id IS NULL')
        no_owner = c.fetchone()['count']
        print(f"   Количество: {no_owner}")
        
        if no_owner > 0:
            print("   Первые 5 таких файлов:")
            c.execute('''
                SELECT short_id, original_filename 
                FROM files 
                WHERE owner_id IS NULL 
                LIMIT 5
            ''')
            for row in c.fetchall():
                print(f"      - {row['original_filename']} ({row['short_id']})")
        
        # 6. Статистика по папкам
        print("\n📂 СТАТИСТИКА ПО ПАПКАМ:")
        c.execute('''
            SELECT 
                CASE 
                    WHEN folder_path = '' OR folder_path IS NULL THEN '(root)'
                    ELSE folder_path 
                END as folder,
                COUNT(*) as count
            FROM files
            GROUP BY folder
            ORDER BY count DESC
            LIMIT 10
        ''')
        for row in c.fetchall():
            print(f"   {row['folder']}: {row['count']} файлов")
        
        # 7. Проверка физических файлов на диске
        print("\n💾 ПРОВЕРКА ФИЗИЧЕСКИХ ФАЙЛОВ:")
        from backend.config import UPLOAD_FOLDER
        print(f"   Директория загрузок: {UPLOAD_FOLDER}")
        
        if os.path.exists(UPLOAD_FOLDER):
            physical_files = len([f for f in os.listdir(UPLOAD_FOLDER) if os.path.isfile(os.path.join(UPLOAD_FOLDER, f))])
            print(f"   Физических файлов на диске: {physical_files}")
            
            if physical_files != total:
                print(f"   ⚠️  ВНИМАНИЕ: Несовпадение! В БД: {total}, на диске: {physical_files}")
                
                # Проверяем какие файлы из БД отсутствуют на диске
                c.execute('SELECT short_id, unique_name, original_filename FROM files')
                db_files = c.fetchall()
                
                missing_on_disk = []
                for db_file in db_files:
                    file_path = os.path.join(UPLOAD_FOLDER, db_file['unique_name'])
                    if not os.path.exists(file_path):
                        missing_on_disk.append(db_file)
                
                if missing_on_disk:
                    print(f"\n   ❌ Файлов в БД, но отсутствующих на диске: {len(missing_on_disk)}")
                    print("   Первые 5:")
                    for mf in missing_on_disk[:5]:
                        print(f"      - {mf['original_filename']} (unique: {mf['unique_name']})")
        else:
            print(f"   ❌ Директория загрузок не существует: {UPLOAD_FOLDER}")
        
        print("\n" + "=" * 60)
        print("✅ Диагностика завершена")
        
    except Exception as e:
        print(f"❌ Ошибка при проверке БД: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    db_path = find_database()
    
    if not db_path:
        print("❌ База данных не найдена ни в одном из ожидаемых расположений:")
        for path in DB_PATHS:
            exists = "✓" if os.path.exists(path) else "✗"
            print(f"   {exists} {path}")
        print("\n💡 Создайте базу данных:")
        print("   cd /opt/uploader")
        print("   python3 -c 'from backend.database import init_db; init_db()'")
    else:
        check_database(db_path)