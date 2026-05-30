# config.py
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

# Базовая директория проекта
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))
DB_PATH = os.environ.get('DB_PATH', os.path.join(BASE_DIR, 'data', 'uploads.db'))

# Создаем директории, если их нет
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


# Директория для кэша превью (вне проекта)
PREVIEW_CACHE_FOLDER = os.environ.get(
    'PREVIEW_CACHE_FOLDER', 
    '/opt/filebrowser/data/previews'
)
os.makedirs(PREVIEW_CACHE_FOLDER, exist_ok=True)

# Создаем директорию для сессий
SESSION_FOLDER = '/tmp/sessions'
os.makedirs(SESSION_FOLDER, exist_ok=True)