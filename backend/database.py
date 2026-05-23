# database.py
import sqlite3
from datetime import datetime
from .config import DB_PATH
from werkzeug.security import generate_password_hash, check_password_hash # Не забудьте этот импорт!

# ... existing code ...

def init_db():
    """Инициализирует базу данных и создает таблицу, если она не существует."""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                short_id TEXT UNIQUE NOT NULL,
                unique_name TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                upload_date TEXT NOT NULL,
                owner_id INTEGER,
                folder_path TEXT DEFAULT '', 
                FOREIGN KEY(owner_id) REFERENCES users(id)
            )
        ''')

         # Проверка и добавление колонки owner_id, если она отсутствует (для старых баз)
        try:
            c.execute("SELECT owner_id FROM files LIMIT 1")
        except sqlite3.OperationalError:
            print("Adding owner_id column to files table...")
            c.execute("ALTER TABLE files ADD COLUMN owner_id INTEGER")

        # Проверка и добавление колонки download_count, если она отсутствует
        try:
            c.execute("SELECT download_count FROM files LIMIT 1")
        except sqlite3.OperationalError:
            print("Adding download_count column to files table...")
            c.execute("ALTER TABLE files ADD COLUMN download_count INTEGER DEFAULT 0")

        # Проверка и добавление колонки folder_path, если она отсутствует
        try:
            c.execute("SELECT folder_path FROM files LIMIT 1")
        except sqlite3.OperationalError:
            print("Adding folder_path column to files table...")
            c.execute("ALTER TABLE files ADD COLUMN folder_path TEXT DEFAULT ''")

         # Новая таблица пользователей
        c.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        ''')
        conn.commit()

# ... existing code ...

# ... existing code ...

def get_file_by_hash(file_hash):
    """Получает данные файла по хешу."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM files WHERE file_hash = ?', (file_hash,))
        row = c.fetchone()
        return dict(row) if row else None

def get_file_by_short_id(short_id):
    """Получает данные файла по короткому ID."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM files WHERE short_id = ?', (short_id,))
        row = c.fetchone()
        return dict(row) if row else None

def insert_file(short_id, unique_name, original_filename, file_hash, file_size, owner_id=None, folder_path=''):
    """Добавляет новый файл в базу данных."""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('''
            INSERT INTO files (short_id, unique_name, original_filename, file_hash, file_size, upload_date, owner_id, folder_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (short_id, unique_name, original_filename, file_hash, file_size, datetime.now().isoformat(), owner_id, folder_path))
        conn.commit()

def increment_download_count(short_id):
    """Увеличивает счетчик скачиваний."""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('UPDATE files SET download_count = download_count + 1 WHERE short_id = ?', (short_id,))
        conn.commit()

def list_all_files():
    """Возвращает список всех файлов, отсортированных по дате загрузки (новые сверху)."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT short_id, original_filename, file_size, upload_date, download_count FROM files ORDER BY upload_date DESC')
        return [dict(row) for row in c.fetchall()]

# ... existing code ...
# ... existing code ...
def list_files_by_user(user_id):
    """Возвращает список файлов конкретного пользователя."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        if not user_id:
            return []
            
        # Убедись, что folder_path здесь есть!
        try:
            c.execute('''
                SELECT short_id, original_filename, file_size, upload_date, download_count, folder_path 
                FROM files 
                WHERE owner_id = ? 
                ORDER BY upload_date DESC
            ''', (user_id,))
            return [dict(row) for row in c.fetchall()]
        except sqlite3.OperationalError as e:
            print(f"[DB ERROR] SQL Query failed: {e}")
            # Если колонки нет, пробуем запрос без неё (для совместимости)
            c.execute('''
                SELECT short_id, original_filename, file_size, upload_date, download_count 
                FROM files 
                WHERE owner_id = ? 
                ORDER BY upload_date DESC
            ''', (user_id,))
            rows = [dict(row) for row in c.fetchall()]
            for r in rows:
                r['folder_path'] = ''
            return rows
# ... existing code ...
# ... existing code ...
def get_user_by_username(username):
    """Получает пользователя по имени."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM users WHERE username = ?', (username,))
        row = c.fetchone()
        return dict(row) if row else None

def create_user(username, password):
    """Создает нового пользователя."""
    password_hash = generate_password_hash(password)
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
                      (username, password_hash, datetime.now().isoformat()))
            conn.commit()
            return True
    except sqlite3.IntegrityError:
        return False # Пользователь уже существует

def verify_password(stored_hash, password):
    """Проверяет пароль."""
    return check_password_hash(stored_hash, password)

def delete_file_by_short_id(short_id):
    """Удаляет запись о файле из БД"""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('DELETE FROM files WHERE short_id = ?', (short_id,))
        conn.commit()

def get_files_by_hash(file_hash):
    """Получает ВСЕ записи файлов с данным хешем (для подсчета ссылок)"""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM files WHERE file_hash = ?', (file_hash,))
        return [dict(row) for row in c.fetchall()]

def get_unique_name_by_hash(file_hash):
    """Получает unique_name по хешу (физическое имя файла на диске)"""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT unique_name FROM files WHERE file_hash = ? LIMIT 1', (file_hash,))
        row = c.fetchone()
        return row['unique_name'] if row else None