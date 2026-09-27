import sqlite3
import logging
from datetime import datetime
from .config import DB_PATH
from werkzeug.security import generate_password_hash, check_password_hash

logger = logging.getLogger(__name__)

_files_count_cache = {}
_CACHE_TTL = 300  # 5 минут

def _invalidate_count_cache(user_id=None):
    """
    Инвалидирует кэш количества файлов.
    
    Args:
        user_id: ID пользователя (если None, очищает весь кэш)
    """
    #global _files_count_cache
    
    if user_id:
        _files_count_cache.pop(user_id, None)
        logger.debug(f"Invalidated count cache for user {user_id}")
    else:
        _files_count_cache.clear()
        logger.debug("Invalidated all count cache")

def _get_cached_count(user_id):
    """
    Получает количество файлов из кэша если он актуален.
    
    Returns:
        int или None если кэш отсутствует/устарел
    """
    if user_id in _files_count_cache:
        cache_entry = _files_count_cache[user_id]
        age = datetime.now().timestamp() - cache_entry['timestamp']
        
        if age < _CACHE_TTL:
            logger.debug(
                f"[DB CACHE] HIT for user {user_id}: {cache_entry['count']} files "
                f"(age: {age:.1f}s, TTL: {_CACHE_TTL}s)"
            )
            return cache_entry['count']
        else:
            logger.debug(
                f"[DB CACHE] EXPIRED for user {user_id}: "
                f"age={age:.1f}s > TTL={_CACHE_TTL}s, will query DB"
            )
            del _files_count_cache[user_id]
    else:
        logger.debug(f"[DB CACHE] MISS for user {user_id}: no cache entry exists")
    
    return None

def _set_cached_count(user_id, count):
    """Сохраняет количество файлов в кэш."""
    #global _files_count_cache
    
    _files_count_cache[user_id] = {
        'count': count,
        'timestamp': datetime.now().timestamp()
    }
    logger.debug(f"Cached file count for user {user_id}: {count}")

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
def insert_file(short_id, unique_name, original_filename, file_hash, file_size, owner_id, folder_path=''):
    """
    Добавляет запись о файле в базу данных.
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        c.execute('''
            INSERT INTO files (short_id, unique_name, original_filename, file_hash, 
                             file_size, owner_id, folder_path, upload_date, download_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (short_id, unique_name, original_filename, file_hash, 
              file_size, owner_id, folder_path, datetime.now().isoformat(), 0))
        
        conn.commit()
        
        # ✅ НОВЫЙ ЛОГ: успешная вставка
        logger.info(
            f"[DB INSERT] File record created: {short_id} | "
            f"Owner: {owner_id}, Size: {file_size} bytes, Folder: '{folder_path}'"
        )
        
        # ✅ Инвалидируем кэш для этого пользователя
        if owner_id in _files_count_cache:
            del _files_count_cache[owner_id]
            logger.debug(f"[DB CACHE] Invalidated cache for user {owner_id} after file insert")
        
    except Exception as e:
        logger.error(f"[DB ERROR] Failed to insert file {short_id}: {e}")
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
    """
    Удаляет запись о файле из базы данных.
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Получаем owner_id для инвалидации кэша
        c.execute("SELECT owner_id FROM files WHERE short_id = ?", (short_id,))
        result = c.fetchone()
        
        if result:
            owner_id = result[0]
            
            c.execute("DELETE FROM files WHERE short_id = ?", (short_id,))
            conn.commit()
            
            # ✅ НОВЫЙ ЛОГ: успешное удаление
            logger.info(f"[DB DELETE] File record deleted: {short_id} | Owner: {owner_id}")
            
            # Инвалидируем кэш
            if owner_id in _files_count_cache:
                del _files_count_cache[owner_id]
                logger.debug(f"[DB CACHE] Invalidated cache for user {owner_id} after file delete")
        else:
            logger.warning(f"[DB DELETE] File not found in DB: {short_id}")
            
    except Exception as e:
        logger.error(f"[DB ERROR] Failed to delete file {short_id}: {e}")
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
        logger.error(f"Error getting file by hash: {e}")
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
        
        # Инвалидируем кэш количества файлов
        _invalidate_count_cache(user_id)
        
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

import time  # Добавьте в начало файла, если ещё не импортирован

def get_files_paginated(user_id, page=1, per_page=20, sort_field='upload_date', sort_order='DESC', folder_path=None):
    """
    Получает файлы с пагинацией и сортировкой с оптимизированным COUNT.
    """
    from .config_constants import SORT_FIELD_MAPPING, SORT_ORDER_MAPPING
    
    conn = None
    start_time = time.time()  # ✅ Засекаем время начала
    
    try:
        offset = (page - 1) * per_page
        
        safe_sort_field = SORT_FIELD_MAPPING.get(sort_field, 'upload_date')
        safe_sort_order = SORT_ORDER_MAPPING.get(str(sort_order).upper(), 'DESC')
        
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        if folder_path:
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
        
        # ОПТИМИЗАЦИЯ: Проверяем кэш для общего количества
        cache_used = False
        if not folder_path:
            cached_count = _get_cached_count(user_id)
            if cached_count is not None:
                total_count = cached_count
                cache_used = True
                # ✅ НОВЫЙ ЛОГ: кэш использован
                logger.debug(
                    f"[DB QUERY] Using cached count for user {user_id}: {total_count} files"
                )
            else:
                # ✅ НОВЫЙ ЛОГ: кэш не использован, выполняем запрос
                logger.debug(
                    f"[DB QUERY] Cache miss for user {user_id}, executing COUNT(*) query"
                )
                c.execute(f'SELECT COUNT(*) {base_query}', count_params)
                total_count = c.fetchone()[0]
                _set_cached_count(user_id, total_count)
        else:
            # Для фильтров по папке всегда делаем запрос
            logger.debug(
                f"[DB QUERY] Folder filter active, executing COUNT(*) for user {user_id}, folder: '{folder_path}'"
            )
            c.execute(f'SELECT COUNT(*) {base_query}', count_params)
            total_count = c.fetchone()[0]
        
        # БЕЗОПАСНАЯ сборка запроса
        query = f'''
            SELECT short_id, original_filename, file_size, upload_date, download_count, folder_path
            {base_query}
            ORDER BY {safe_sort_field} {safe_sort_order}
            LIMIT ? OFFSET ?
        '''
        c.execute(query, data_params)
        files = [dict(row) for row in c.fetchall()]
        
        # ✅ НОВЫЙ ЛОГ: замер времени выполнения
        elapsed_ms = (time.time() - start_time) * 1000
        
        if elapsed_ms > 100:  # Если запрос занял больше 100 мс
            logger.warning(
                f"[DB SLOW QUERY] get_files_paginated took {elapsed_ms:.2f}ms | "
                f"User: {user_id}, Page: {page}, Total: {total_count}, "
                f"Cache used: {cache_used}, Folder: '{folder_path or 'root'}'"
            )
        else:
            logger.debug(
                f"[DB QUERY] get_files_paginated completed in {elapsed_ms:.2f}ms | "
                f"User: {user_id}, Files: {len(files)}, Cache: {cache_used}"
            )
        
        return files, total_count
    
    except Exception as e:
        logger.error(f"[DB ERROR] Error getting paginated files: {e}")
        if conn:
            conn.rollback()
        return [], 0
    finally:
        if conn:
            conn.close()


def init_admin_db():
    """Инициализирует таблицу администраторов."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        ''')
        conn.commit()
        logger.info("✓ Admin users table initialized")
    except Exception as e:
        logger.error(f"Failed to initialize admin users table: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

def get_admin_by_username(username):
    """Получает администратора по имени."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM admin_users WHERE username = ?', (username,))
        row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error getting admin {username}: {e}")
        return None
    finally:
        if conn:
            conn.close()

def create_admin(username, password):
    """Создает нового администратора."""
    from werkzeug.security import generate_password_hash
    
    password_hash = generate_password_hash(password)
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)',
                  (username, password_hash, datetime.now().isoformat()))
        conn.commit()
        logger.info(f"Admin created: {username}")
        return True
    except sqlite3.IntegrityError:
        logger.warning(f"Admin username already exists: {username}")
        if conn:
            conn.rollback()
        return False
    except Exception as e:
        logger.error(f"Error creating admin {username}: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def list_all_users(sort_by='id', order='DESC'):
    """Возвращает список всех пользователей сайта с сортировкой."""
    conn = None
    try:
        # Защита от SQL-инъекций: разрешаем сортировать только по этим полям
        allowed_sort = {'id', 'username', 'created_at'}
        allowed_order = {'ASC', 'DESC'}
        
        sort_by = sort_by if sort_by in allowed_sort else 'id'
        order = order.upper() if order.upper() in allowed_order else 'DESC'

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Динамический ORDER BY (безопасный, так как значения из белого списка)
        query = f'SELECT id, username, created_at FROM users ORDER BY {sort_by} {order}'
        c.execute(query)
        
        return [dict(row) for row in c.fetchall()]
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        return []
    finally:
        if conn:
            conn.close()

def delete_user_by_id(user_id):
    """Удаляет пользователя и все его файлы."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        # Сначала удаляем все файлы пользователя
        c.execute('DELETE FROM files WHERE owner_id = ?', (user_id,))
        
        # Затем удаляем самого пользователя
        c.execute('DELETE FROM users WHERE id = ?', (user_id,))
        
        conn.commit()
        logger.info(f"User {user_id} and all their files deleted")
        return True
    except Exception as e:
        logger.error(f"Error deleting user {user_id}: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def reset_user_password(user_id, new_password):
    """Сбрасывает пароль пользователя."""
    from werkzeug.security import generate_password_hash
    
    password_hash = generate_password_hash(new_password)
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('UPDATE users SET password_hash = ? WHERE id = ?', (password_hash, user_id))
        conn.commit()
        logger.info(f"Password reset for user {user_id}")
        return True
    except Exception as e:
        logger.error(f"Error resetting password for user {user_id}: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def get_user_by_id(user_id):
    """Получает пользователя по ID."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT id, username, created_at FROM users WHERE id = ?', (user_id,))
        row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error getting user {user_id}: {e}")
        return None
    finally:
        if conn:
            conn.close()

def count_all_users():
    """Возвращает общее количество пользователей сайта."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('SELECT COUNT(*) FROM users')
        return c.fetchone()[0]
    except Exception as e:
        logger.error(f"Error counting users: {e}")
        return 0
    finally:
        if conn:
            conn.close()

def init_invite_codes_table():
    """Инициализирует таблицу кодов приглашений."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS invite_codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                used_by INTEGER DEFAULT NULL,
                used_at TEXT DEFAULT NULL,
                is_active INTEGER DEFAULT 1,
                FOREIGN KEY(created_by) REFERENCES admin_users(id),
                FOREIGN KEY(used_by) REFERENCES users(id)
            )
        ''')
        conn.commit()
        logger.info("✓ Invite codes table initialized")
    except Exception as e:
        logger.error(f"Failed to initialize invite codes table: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

def create_invite_code(code, admin_id):
    """Создает новый код приглашения."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('INSERT INTO invite_codes (code, created_by, created_at, is_active) VALUES (?, ?, ?, 1)',
                  (code.upper(), admin_id, datetime.now().isoformat()))
        conn.commit()
        logger.info(f"Invite code created: {code} by admin {admin_id}")
        return True
    except sqlite3.IntegrityError:
        logger.warning(f"Invite code already exists: {code}")
        if conn:
            conn.rollback()
        return False
    except Exception as e:
        logger.error(f"Error creating invite code: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def validate_invite_code(code):
    """Проверяет, действителен ли код приглашения."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM invite_codes WHERE code = ? AND is_active = 1', (code.upper(),))
        row = c.fetchone()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error validating invite code: {e}")
        return None
    finally:
        if conn:
            conn.close()

def mark_invite_code_used(code_id, user_id):
    """Отмечает код как использованный."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('UPDATE invite_codes SET used_by = ?, used_at = ?, is_active = 0 WHERE id = ?',
                  (user_id, datetime.now().isoformat(), code_id))
        conn.commit()
        logger.info(f"Invite code {code_id} marked as used by user {user_id}")
        return True
    except Exception as e:
        logger.error(f"Error marking invite code as used: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def list_invite_codes():
    """Возвращает список всех кодов приглашений."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('''
            SELECT ic.*, u.username as used_by_username
            FROM invite_codes ic
            LEFT JOIN users u ON ic.used_by = u.id
            ORDER BY ic.created_at DESC
        ''')
        return [dict(row) for row in c.fetchall()]
    except Exception as e:
        logger.error(f"Error listing invite codes: {e}")
        return []
    finally:
        if conn:
            conn.close()

def delete_invite_code(code_id):
    """Удаляет код приглашения."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('DELETE FROM invite_codes WHERE id = ?', (code_id,))
        conn.commit()
        logger.info(f"Invite code {code_id} deleted")
        return True
    except Exception as e:
        logger.error(f"Error deleting invite code: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()