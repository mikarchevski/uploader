# app.py
import sys
import os
import logging
from datetime import timedelta
from flask import Flask
from flask_session import Session
from flask_cors import CORS

# --- НАЧАЛО БЛОКА ЛОГИРОВАНИЯ ---
log_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'flask_debug.log')
logging.basicConfig(
    filename=log_file_path,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logger.info("--- FLASK SERVER RESTARTED & LOGGING INITIALIZED ---")
# --- КОНЕЦ БЛОКА ЛОГИРОВАНИЯ ---

# Добавляем текущую директорию в пути, чтобы Python видел пакет backend
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Импортируем функцию создания приложения из пакета backend
# Мы переименовали импорт в backend_create_app, чтобы избежать конфликта имен
from backend import create_app as backend_create_app 

def create_app():
    # 1. Создаем базовое приложение (маршруты, БД) через фабрику из backend
    app = backend_create_app()
    # Разрешаем запросы с любых источников (для разработки)
    # В продакшене лучше указать конкретный домен или IP
    CORS(app, supports_credentials=True)
    
    # --- НАСТРОЙКИ СЕССИЙ (Исправление проблемы с выходом из аккаунта) ---
    
    # 1. Тип хранения: файловая система
    app.config['SESSION_TYPE'] = 'filesystem'
    
    # 2. Папка для файлов сессий
    # Используем папку внутри проекта, чтобы избежать проблем с правами доступа в /tmp
    session_dir = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'flask_sessions')
    app.config['SESSION_FILE_DIR'] = session_dir
    os.makedirs(session_dir, exist_ok=True)
    
    # 3. Делаем сессию постоянной
    app.config['SESSION_PERMANENT'] = True
    
    # 4. Срок жизни сессии (30 дней)
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

     # --- ВАЖНЫЕ НАСТРОЙКИ ДЛЯ COOKIE ---
    
    # Имя куки (по умолчанию 'session', можно оставить)
    app.config['SESSION_COOKIE_NAME'] = 'session'
    
    # Путь куки. Должен быть '/', чтобы кука была видна на всех страницах
    app.config['SESSION_COOKIE_PATH'] = '/'
    
    # Домен. Оставьте пустым или установите явно, если нужно. 
    # Если пусто, кука привязывается к хосту, который ее выдал.
    # app.config['SESSION_COOKIE_DOMAIN'] = None 
    
    # HttpOnly: True запрещает доступ к куке из JavaScript (безопасность). 
    # Для WebView это обычно ОК, если вы не пытаетесь читать куку через JS.
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    
    # Secure: False, так как у вас HTTP. Если перейдете на HTTPS, поставьте True.
    app.config['SESSION_COOKIE_SECURE'] = True
    
    # Samesite: 'Lax' или 'None'. 
    # Для WebView внутри мобильного приложения часто лучше 'Lax' или вообще отключить проверку, 
    # если запросы идут с другого контекста. Попробуйте 'Lax'.
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax' 
    
    # 5. Безопасность и ключи
    app.config['SESSION_USE_SIGNER'] = True
    
    # ВАЖНО: Убедитесь, что SECRET_KEY задан. 
    # Если он уже задан в backend_create_app(), то здесь можно не переопределять, 
    # но лучше убедиться, что он есть.
    if not app.config.get('SECRET_KEY'):
        app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'super-secret-key-change-it-in-production')
    
    # Для HTTP (локальное тестирование или без SSL) должно быть False
    app.config['SESSION_COOKIE_SECURE'] = False 
    
    # 6. Инициализация расширения Flask-Session
    # Используем явную инициализацию через init_app
    from flask_session import Session
    sess = Session()
    sess.init_app(app)
    
    return app

if __name__ == '__main__':
    # Создаем приложение с примененными настройками сессий
    app = create_app()
    
    # Запускаем сервер
    app.run(host='0.0.0.0', port=5000, debug=True)