# backend/config_constants.py
"""
Константы конфигурации для бэкенда
"""
import zipfile

# === ПАГИНАЦИЯ ===
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MIN_PAGE_SIZE = 5

# === ЗАГРУЗКА ФАЙЛОВ ===
MAX_UPLOAD_ATTEMPTS = 10
SHORT_ID_LENGTH = 6
HASH_LENGTH = 64  # SHA-256 hash length in characters

# === ПРЕВЬЮ ===
PREVIEW_IMAGE_SIZE = 300  # pixels (max dimension)
PREVIEW_JPEG_QUALITY = 60  # 0-100, higher = better quality
PREVIEW_CACHE_MAX_AGE = 86400  # seconds (24 hours)

# === RATE LIMITING ===
RATE_LIMIT_LOGIN = "10 per minute"
RATE_LIMIT_API_LOGIN = "5 per minute"
RATE_LIMIT_UPLOAD = "1000 per minute"
RATE_LIMIT_DELETE = "20 per minute"
RATE_LIMIT_BULK_DELETE = "10 per minute"
RATE_LIMIT_CHECK_FILE = "30 per minute"
RATE_LIMIT_PREVIEW = "60 per minute"
RATE_LIMIT_LIST_FILES = "600 per minute"
RATE_LIMIT_DOWNLOAD_FOLDER = "5 per minute"

# === СЕССИИ ===
SESSION_LIFETIME_DAYS = 30
SESSION_COOKIE_NAME = 'session'

# === ЛОГИРОВАНИЕ ===
LOG_FORMAT = '%(asctime)s - %(levelname)s - %(name)s - %(message)s'
CLIENT_LOG_FORMAT = '%(asctime)s - %(levelname)s - %(message)s'

# === ZIP АРХИВАЦИЯ ===
ZIP_COMPRESSION_LEVEL = zipfile.ZIP_DEFLATED

# === БЕЗОПАСНОСТЬ ===
ALLOWED_SORT_FIELDS = ['upload_date', 'original_filename', 'file_size', 'folder_path']
DEFAULT_SORT_FIELD = 'upload_date'
DEFAULT_SORT_ORDER = 'DESC'

# === МАППИНГ СОРТИРОВКИ (защита от SQL-инъекций) ===
# Ключи - значения от пользователя, Значения - реальные колонки БД
SORT_FIELD_MAPPING = {
    'date': 'upload_date',
    'upload_date': 'upload_date',
    'name': 'original_filename',
    'original_filename': 'original_filename',
    'filename': 'original_filename',
    'size': 'file_size',
    'file_size': 'file_size',
    'type': 'folder_path',
    'folder_path': 'folder_path',
    'folder': 'folder_path',
}

SORT_ORDER_MAPPING = {
    'asc': 'ASC',
    'ASC': 'ASC',
    'desc': 'DESC',
    'DESC': 'DESC',
    'ascending': 'ASC',
    'descending': 'DESC',
}

# === ВАЛИДАЦИЯ ПУТЕЙ ===
FOLDER_PATH_REGEX = r'^[a-zA-Z0-9_\-/\.]+$'
MAX_FOLDER_DEPTH = 10
MAX_FILENAME_LENGTH = 255

# Запрещённые паттерны в путях (защита от path traversal)
DANGEROUS_PATH_PATTERNS = [
    '..',      # Обход директорий
]