# config.py
import os

UPLOAD_FOLDER = '/opt/filebrowser/data/uploads'
DB_PATH = '/opt/filebrowser/data/uploads.db'

# Создаем директорию для загрузок, если её нет
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Создаем директорию для сессий
SESSION_FOLDER = '/tmp/sessions'
os.makedirs(SESSION_FOLDER, exist_ok=True)