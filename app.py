# app.py
import sys
import os
import logging
from datetime import timedelta
from flask import Flask, request, jsonify
from flask_session import Session
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Пытаемся загрузить dotenv, но не критично если его нет
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

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
from backend import create_app as backend_create_app 

def create_app():
    # 1. Создаем базовое приложение (маршруты, БД) через фабрику из backend
    app = backend_create_app()
    
    # Разрешаем запросы с любых источников (для разработки)
    CORS(app, supports_credentials=True)
    
    # --- RATE LIMITING ---
    # Инициализируем лимитер
    limiter = Limiter(
        app=app,
        key_func=get_remote_address,  # Ограничение по IP адресу
        default_limits=[
            "200 per day",      # Максимум 200 запросов в день
            "50 per hour"       # Максимум 50 запросов в час
        ],
        storage_uri="memory://",  # Хранение счетчиков в памяти
        strategy="fixed-window"   # Стратегия ограничения
    )
    
    logger.info("✓ Rate limiter initialized")
    
    # Сохраняем limiter в app для доступа из routes
    app.extensions['limiter'] = limiter
    
    # --- Кастомный обработчик ошибок rate limit ---
    @app.errorhandler(429)
    def ratelimit_handler(e):
        logger.warning(f"Rate limit exceeded for IP: {request.remote_addr}")
        return jsonify({
            'error': 'Rate limit exceeded',
            'message': 'Слишком много запросов. Пожалуйста, подождите немного.',
            'retry_after': str(e.description)
        }), 429
    
    # --- БЕЗОПАСНАЯ НАСТРОЙКА SECRET_KEY ---
    secret_key = os.environ.get('SECRET_KEY')
    
    if not secret_key:
        # В production режиме категорически запрещаем запуск без SECRET_KEY
        if os.environ.get('FLASK_ENV') == 'production':
            raise EnvironmentError(
                "CRITICAL: SECRET_KEY environment variable is not set! "
                "Please set it in your .env file or system environment. "
                "Generate one with: python3 -c \"import secrets; print(secrets.token_hex(32))\""
            )
        
        # В development режиме генерируем временный ключ с предупреждением
        logger.warning("⚠️  SECRET_KEY not set! Generating temporary key for development only.")
        logger.warning("⚠️  DO NOT use this in production! Set SECRET_KEY in .env file.")
        secret_key = os.urandom(32).hex()
    
    app.config['SECRET_KEY'] = secret_key
    logger.info("✓ SECRET_KEY configured successfully")
    
    # --- НАСТРОЙКИ СЕССИЙ ---
    
    # 1. Тип хранения: файловая система
    app.config['SESSION_TYPE'] = 'filesystem'
    
    # 2. Папка для файлов сессий
    session_dir = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'flask_sessions')
    app.config['SESSION_FILE_DIR'] = session_dir
    os.makedirs(session_dir, exist_ok=True)
    
    # 3. Делаем сессию постоянной
    app.config['SESSION_PERMANENT'] = True
    
    # 4. Срок жизни сессии (30 дней)
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

     # --- ВАЖНЫЕ НАСТРОЙКИ ДЛЯ COOKIE ---
    
    # Имя куки
    app.config['SESSION_COOKIE_NAME'] = 'session'
    
    # Путь куки
    app.config['SESSION_COOKIE_PATH'] = '/'
    
    # HttpOnly: True запрещает доступ к куке из JavaScript
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    
    # Secure: False для HTTP, True для HTTPS
    app.config['SESSION_COOKIE_SECURE'] = False 
    
    # Samesite
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax' 
    
    # 5. Безопасность
    app.config['SESSION_USE_SIGNER'] = True
    
    # 6. Инициализация расширения Flask-Session
    sess = Session()
    sess.init_app(app)
    
    return app

if __name__ == '__main__':
    # Создаем приложение с примененными настройками сессий
    app = create_app()
    
    # Запускаем сервер
    debug_mode = os.environ.get('FLASK_DEBUG', '1').lower() in ('1', 'true', 'yes')
    app.run(host='0.0.0.0', port=5000, debug=debug_mode)