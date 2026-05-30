import sqlite3
import logging
from datetime import datetime
from .config import DB_PATH
from werkzeug.security import generate_password_hash, check_password_hash

logger = logging.getLogger(__name__)

def init_db():
    """Инициализирует базу данных и создает таблицу, если она не существует."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
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
                download_count INTEGER DEFAULT 0,
                FOREIGN KEY(owner_id) REFERENCES users(id)
            )
        ''')

        # Проверка и добавление колонки owner_id, если она отсутствует (для старых баз)
        try:
            c.execute("SELECT owner_id FROM files LIMIT 1")
        except sqlite3.OperationalError:
            logger.info("Adding owner_id column to files table...")
            c.execute("ALTER TABLE files ADD COLUMN owner_id INTEGER")

        # Проверка и добавление колонки download_count, если она отсутствует
        try:
            c.execute("SELECT download_count FROM files LIMIT 1")
        except sqlite3.OperationalError:
            logger.info("Adding download_count column to files table...")
            c.execute("ALTER TABLE files ADD COLUMN download_count INTEGER DEFAULT 0")

        # Проверка и добавление колонки folder_path, если она отсутствует
        try:
            c.execute("SELECT folder_path FROM files LIMIT 1")
        except sqlite3.OperationalError:
            logger.info("Adding folder_path column to files table...")
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
        logger.info("✓ Database initialized successfully")
    
    except Exception as e:
        logger.error(f"❌ Failed to initialize database: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

def get_file_by_hash(file_hash):
    """Получает данные файла по хешу."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM files WHERE file_hash = ?', (file_hash,))
        row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error getting file by hash: {e}")
        return None
    finally:
        if conn:
            conn.close()

def get_file_by_short_id(short_id):
    """Получает данные файла по короткому ID."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM files WHERE short_id = ?', (short_id,))
        row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error getting file by short_id: {e}")
        return None
    finally:
        if conn:
            conn.close()
def insert_file(short_id, unique_name, original_filename, file_hash, file_size, owner_id=None, folder_path=''):
    """
    Добавляет новый файл в базу данных с явной транзакцией.
    
    Raises:
        sqlite3.IntegrityError: Если short_id уже существует
        Exception: При других ошибках БД
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Явная транзакция
        c.execute('''
            INSERT INTO files (short_id, unique_name, original_filename, file_hash, file_size, upload_date, owner_id, folder_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (short_id, unique_name, original_filename, file_hash, file_size, datetime.now().isoformat(), owner_id, folder_path))
        
        conn.commit()
        logger.debug(f"File inserted: {short_id}")
    
    except sqlite3.IntegrityError as e:
        logger.error(f"Integrity error inserting file {short_id}: {e}")
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        logger.error(f"Error inserting file {short_id}: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

def increment_download_count(short_id):
    """Увеличивает счетчик скачиваний с явной транзакцией."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('UPDATE files SET download_count = download_count + 1 WHERE short_id = ?', (short_id,))
        conn.commit()
    except Exception as e:
        logger.error(f"Error incrementing download count for {short_id}: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

def list_all_files():
    """Возвращает список всех файлов, отсортированных по дате загрузки (новые сверху)."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT short_id, original_filename, file_size, upload_date, download_count FROM files ORDER BY upload_date DESC')
        return [dict(row) for row in c.fetchall()]
    except Exception as e:
        logger.error(f"Error listing all files: {e}")
        return []
    finally:
        if conn:
            conn.close()

def list_files_by_user(user_id):
    """Возвращает список файлов конкретного пользователя."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        if not user_id:
            return []
            
        try:
            c.execute('''
                SELECT short_id, original_filename, file_size, upload_date, download_count, folder_path 
                FROM files 
                WHERE owner_id = ? 
                ORDER BY upload_date DESC
            ''', (user_id,))
            return [dict(row) for row in c.fetchall()]
        except sqlite3.OperationalError as e:
            logger.error(f"[DB ERROR] SQL Query failed: {e}")
            # Fallback для старых схем БД
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
    except Exception as e:
        logger.error(f"Error listing files for user {user_id}: {e}")
        return []
    finally:
        if conn:
            conn.close()
def get_user_by_username(username):
    """Получает пользователя по имени."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM users WHERE username = ?', (username,))
        row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error getting user {username}: {e}")
        return None
    finally:
        if conn:
            conn.close()

def create_user(username, password):
    """Создает нового пользователя с явной транзакцией."""
    password_hash = generate_password_hash(password)
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
                  (username, password_hash, datetime.now().isoformat()))
        conn.commit()
        logger.info(f"User created: {username}")
        return True
    except sqlite3.IntegrityError:
        logger.warning(f"Username already exists: {username}")
        if conn:
            conn.rollback()
        return False
    except Exception as e:
        logger.error(f"Error creating user {username}: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def verify_password(stored_hash, password):
    """Проверяет пароль."""
    return check_password_hash(stored_hash, password)

def delete_file_by_short_id(short_id):
    """Удаляет запись о файле из БД с явной транзакцией."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('DELETE FROM files WHERE short_id = ?', (short_id,))
        conn.commit()
        logger.debug(f"File deleted from DB: {short_id}")
    except Exception as e:
        logger.error(f"Error deleting file {short_id} from DB: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

def get_files_by_hash(file_hash):
    """Получает ВСЕ записи файлов с данным хешем (для подсчета ссылок)."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM files WHERE file_hash = ?', (file_hash,))
        return [dict(row) for row in c.fetchall()]
    except Exception as e:
        logger.error(f"Error getting files by hash: {e}")
        return []
    finally:
        if conn:
            conn.close()

def get_unique_name_by_hash(file_hash):
    """Получает unique_name по хешу (физическое имя файла на диске)."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT unique_name FROM files WHERE file_hash = ? LIMIT 1', (file_hash,))
        row = c.fetchone()
        return row['unique_name'] if row else None
    except Exception as e:
        logger.error(f"Error getting unique_name by hash: {e}")
        return None
    finally:
        if conn:
            conn.close()

# ============================================================================
# НОВЫЕ HELPER-ФУНКЦИИ ДЛЯ РАБОТЫ С ПАПКАМИ
# ============================================================================

def get_files_in_folder(user_id, folder_path, include_subfolders=False):
    """
    Получает файлы из указанной папки.
    
    Args:
        user_id: ID пользователя
        folder_path: Путь к папке
        include_subfolders: Если True, включает файлы из подпапок
    
    Returns:
        Список словарей с данными файлов
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        if include_subfolders:
            c.execute('''
                SELECT * FROM files 
                WHERE owner_id = ? AND (folder_path = ? OR folder_path LIKE ?)
                ORDER BY upload_date DESC
            ''', (user_id, folder_path, folder_path + '/%'))
        else:
            c.execute('''
                SELECT * FROM files 
                WHERE owner_id = ? AND folder_path = ?
                ORDER BY upload_date DESC
            ''', (user_id, folder_path))
        
        return [dict(row) for row in c.fetchall()]
    except Exception as e:
        logger.error(f"Error getting files in folder {folder_path}: {e}")
        return []
    finally:
        if conn:
            conn.close()

def get_file_by_hash_and_folder(file_hash, user_id, folder_path):
    """
    Проверяет существование файла с указанным хешем в конкретной папке у пользователя.
    
    Args:
        file_hash: SHA-256 хеш файла
        user_id: ID пользователя
        folder_path: Путь к папке
    
    Returns:
        Словарь с данными файла или None
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('''
            SELECT * FROM files 
            WHERE file_hash = ? AND owner_id = ? AND folder_path = ?
        ''', (file_hash, user_id, folder_path))
        row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error checking file existence: {e}")
        return None
    finally:
        if conn:
            conn.close()

def delete_files_in_folder(user_id, folder_path, include_subfolders=False):
    """
    Удаляет все файлы из указанной папки с явной транзакцией.
    
    Args:
        user_id: ID пользователя
        folder_path: Путь к папке
        include_subfolders: Если True, удаляет файлы из подпапок
    
    Returns:
        Список short_id удалённых файлов
    """
    deleted_ids = []
    conn = None
    
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Сначала получаем список файлов для удаления
        if include_subfolders:
            c.execute('''
                SELECT short_id FROM files 
                WHERE owner_id = ? AND (folder_path = ? OR folder_path LIKE ?)
            ''', (user_id, folder_path, folder_path + '/%'))
        else:
            c.execute('''
                SELECT short_id FROM files 
                WHERE owner_id = ? AND folder_path = ?
            ''', (user_id, folder_path))
        
        files_to_delete = [row['short_id'] for row in c.fetchall()]
        
        if not files_to_delete:
            return []
        
        # Начинаем транзакцию
        for short_id in files_to_delete:
            c.execute('DELETE FROM files WHERE short_id = ?', (short_id,))
            deleted_ids.append(short_id)
        
        # Фиксируем транзакцию
        conn.commit()
        logger.info(f"Deleted {len(deleted_ids)} files from folder: {folder_path}")
        
        return deleted_ids
    
    except Exception as e:
        logger.error(f"Error deleting files in folder {folder_path}: {e}")
        if conn:
            conn.rollback()
            logger.warning("Transaction rolled back")
        return deleted_ids  # Возвращаем частично удалённые IDs
    finally:
        if conn:
            conn.close()

def get_folder_list(user_id):
    """
    Получает список уникальных папок пользователя.
    
    Args:
        user_id: ID пользователя
    
    Returns:
        Список уникальных путей к папкам
    """
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('''
            SELECT DISTINCT folder_path FROM files 
            WHERE owner_id = ? AND folder_path != ''
            ORDER BY folder_path
        ''', (user_id,))
        return [row[0] for row in c.fetchall()]

def count_files_in_folder(user_id, folder_path, include_subfolders=False):
    """
    Подсчитывает количество файлов в папке.
    
    Args:
        user_id: ID пользователя
        folder_path: Путь к папке
        include_subfolders: Если True, включает файлы из подпапок
    
    Returns:
        Количество файлов
    """
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        
        if include_subfolders:
            c.execute('''
                SELECT COUNT(*) FROM files 
                WHERE owner_id = ? AND (folder_path = ? OR folder_path LIKE ?)
            ''', (user_id, folder_path, folder_path + '/%'))
        else:
            c.execute('''
                SELECT COUNT(*) FROM files 
                WHERE owner_id = ? AND folder_path = ?
            ''', (user_id, folder_path))
        
        return c.fetchone()[0]

# ... existing code ...

# ... existing code ...

def get_files_paginated(user_id, page=1, per_page=20, sort_field='upload_date', sort_order='DESC', folder_path=None):
    """
    Получает файлы с пагинацией и сортировкой.
    
    Args:
        user_id: ID пользователя
        page: Номер страницы (начиная с 1)
        per_page: Количество файлов на странице
        sort_field: Поле для сортировки
        sort_order: Порядок сортировки ('ASC' или 'DESC')
        folder_path: Фильтр по папке (None = все файлы)
    
    Returns:
        Кортеж (список файлов, общее количество)
    """
    from .config_constants import SORT_FIELD_MAPPING, SORT_ORDER_MAPPING
    
    conn = None
    try:
        offset = (page - 1) * per_page
        
        # БЕЗОПАСНЫЙ маппинг: получаем реальное имя колонки из словаря
        # Если передано неизвестное значение → используем default
        safe_sort_field = SORT_FIELD_MAPPING.get(sort_field, 'upload_date')
        
        # Безопасный маппинг порядка сортировки
        safe_sort_order = SORT_ORDER_MAPPING.get(str(sort_order).upper(), 'DESC')
        
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        if folder_path:
            # Фильтрация по папке (включая подпапки)
            base_query = '''
                FROM files 
                WHERE owner_id = ? AND (folder_path = ? OR folder_path LIKE ?)
            '''
            count_params = (user_id, folder_path, folder_path + '/%')
            data_params = (user_id, folder_path, folder_path + '/%', per_page, offset)
        else:
            base_query = '''
                FROM files 
                WHERE owner_id = ?
            '''
            count_params = (user_id,)
            data_params = (user_id, per_page, offset)
        
        # Получаем общее количество
        c.execute(f'SELECT COUNT(*) {base_query}', count_params)
        total_count = c.fetchone()[0]
        
        # БЕЗОПАСНАЯ сборка запроса
        # safe_sort_field и safe_sort_order гарантированно содержат только разрешённые значения
        query = f'''
            SELECT short_id, original_filename, file_size, upload_date, download_count, folder_path
            {base_query}
            ORDER BY {safe_sort_field} {safe_sort_order}
            LIMIT ? OFFSET ?
        '''
        c.execute(query, data_params)
        files = [dict(row) for row in c.fetchall()]
        
        return files, total_count
    
    except Exception as e:
        logger.error(f"Error getting paginated files: {e}")
        if conn:
            conn.rollback()
        return [], 0
    finally:
        if conn:
            conn.close()