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

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# --- НАЧАЛО БЛОКА ЛОГИРОВАНИЯ ---
base_dir = os.path.dirname(os.path.abspath(__file__))

# Создаем файлы логов, если их нет
server_log_path = os.path.join(base_dir, 'web_server.log')
client_log_path = os.path.join(base_dir, 'web_client.log')

# Настраиваем формат
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')

# Логгер для сервера
server_handler = logging.FileHandler(server_log_path)
server_handler.setFormatter(formatter)
server_handler.setLevel(logging.INFO)

# Логгер для клиента
client_handler = logging.FileHandler(client_log_path)
client_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
client_handler.setLevel(logging.INFO)

# Глобальные объекты логгеров
server_logger = logging.getLogger('server_backend')
server_logger.addHandler(server_handler)
server_logger.setLevel(logging.INFO)

client_logger = logging.getLogger('client_frontend')
client_logger.addHandler(client_handler)
client_logger.setLevel(logging.INFO)

# Пишем первую запись сразу
server_logger.info("--- FLASK SERVER STARTED & LOGGING TEST ---")
# --- КОНЕЦ БЛОКА ЛОГИРОВАНИЯ ---

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend import create_app as backend_create_app 

# def create_app():

#     # Проверяем конфигурацию перед созданием приложения
#     from check_config import check_configuration
#     if not check_configuration():
#         raise RuntimeError("❌ Конфигурация некорректна. Проверьте переменные окружения.")

#     app = backend_create_app()

#     limiter.init_app(app)
#     app.extensions['limiter'] = limiter 
    
#      # ВАЖНО: Добавляем наш хендлер в основной логгер приложения Flask
#     app.logger.addHandler(server_handler)
#     app.logger.setLevel(logging.INFO)

#     # === CSRF PROTECTION ===
#     from flask_wtf.csrf import CSRFProtect
#     csrf = CSRFProtect()
#     csrf.init_app(app)
#     server_logger.info("✓ CSRF protection initialized")
    
#     # Добавляем CSRF token в cookie после каждого запроса (для авторизованных пользователей)
#     @app.after_request
#     def set_csrf_cookie(response):
#         """Добавляет CSRF token в cookie если его нет"""
#         from flask import session, request
#         from flask_wtf.csrf import generate_csrf
        
#         # Только для авторизованных пользователей и HTML страниц
#         if 'user_id' in session and not request.cookies.get('csrf_token'):
#             # Проверяем что это HTML запрос или главная страница
#             if request.accept_mimetypes.best == 'text/html' or request.path == '/':
#                 token = generate_csrf()
#                 response.set_cookie(
#                     'csrf_token',
#                     token,
#                     httponly=False,  # JavaScript должен иметь доступ
#                     samesite='Lax',
#                     secure=False,  # В production заменить на True с HTTPS
#                     path='/'
#                 )
#                 server_logger.debug(f"[CSRF] Token set for user {session.get('username')}")
        
#         return response
    
#     # === MIDDLEWARE: Автоматическая установка correlation ID ===
#     @app.before_request
#     def set_correlation_id():
#         """Устанавливает correlation ID для каждого запроса"""
#         from flask import request
#         from backend.utils import get_or_create_correlation_id
        
#         corr_id = get_or_create_correlation_id()
        
#         # Логируем начало запроса с correlation ID
#         server_logger.info(
#             f"[REQUEST START] {request.method} {request.path} | "
#             f"IP: {request.remote_addr} | "
#             f"CorrelationID: {corr_id}"
#         )
    
#     CORS(app, supports_credentials=True)
    
#     # limiter = Limiter(
#     #     app=app,
#     #     key_func=get_remote_address,
#     #     default_limits=[
#     #         "200000 per day",
#     #         "5000 per hour"
#     #     ],
#     #     storage_uri="memory://",
#     #     strategy="fixed-window"
#     # )
    
#     server_logger.info("✓ Rate limiter initialized")
    
#     # app.extensions['limiter'] = limiter
    
#     @app.errorhandler(429)
#     def ratelimit_handler(e):
#         server_logger.warning(f"Rate limit exceeded for IP: {request.remote_addr}")
#         return jsonify({
#             'error': 'Rate limit exceeded',
#             'message': 'Слишком много запросов. Пожалуйста, подождите немного.',
#             'retry_after': str(e.description)
#         }), 429
    
#     # --- ЭНДПОИНТ ДЛЯ КЛИЕНТСКИХ ЛОГОВ ---
#     @app.route('/api/log', methods=['POST'])
#     @limiter.limit("10/minute")  # <--- ЗАЩИТА ОТ ФЛУДА ЛОГАМИ
#     def client_log_endpoint():
#         try:
#             data = request.get_json()
#             if not data:
#                 return jsonify({'error': 'No data'}), 400
            
#             level = data.get('level', 'info').upper()
#             message = data.get('message', '')
#             details = data.get('details', '')
            
#             # Базовая санитизация, чтобы не ломать формат логгера переносами строк
#             message = message.replace('\n', ' ').replace('\r', '')
#             details = details.replace('\n', ' ').replace('\r', '') if details else ''
            
#             log_message = f"[CLIENT] {message}"
#             if details:
#                 log_message += f" | Details: {details}"
            
#             if level == 'ERROR':
#                 client_logger.error(log_message)
#             elif level == 'WARN':
#                 client_logger.warning(log_message)
#             else:
#                 client_logger.info(log_message)
            
#             return jsonify({'success': True}), 200
#         except Exception as e:
#             server_logger.error(f"Failed to process client log: {e}")
#             return jsonify({'error': 'Internal error'}), 500

#     secret_key = os.environ.get('SECRET_KEY')
    
#     if not secret_key:
#         if os.environ.get('FLASK_ENV') == 'production':
#             raise EnvironmentError("SECRET_KEY is missing!")
        
#         server_logger.warning("⚠️ SECRET_KEY not set! Using temporary key.")
#         secret_key = os.urandom(32).hex()
    
#     app.config['SECRET_KEY'] = secret_key
#     server_logger.info("✓ SECRET_KEY configured")
    
#     app.config['SESSION_TYPE'] = 'filesystem'
#     session_dir = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'flask_sessions')
#     app.config['SESSION_FILE_DIR'] = session_dir
#     os.makedirs(session_dir, exist_ok=True)
    
#     app.config['SESSION_PERMANENT'] = True
#     app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
#     app.config['SESSION_COOKIE_NAME'] = 'session'
#     app.config['SESSION_COOKIE_PATH'] = '/'
#     app.config['SESSION_COOKIE_HTTPONLY'] = True
#     app.config['SESSION_COOKIE_SECURE'] = False 
#     app.config['SESSION_COOKIE_SAMESITE'] = 'Lax' 
#     app.config['SESSION_USE_SIGNER'] = True
    
#     sess = Session()
#     sess.init_app(app)
    
#     return app
def create_app():

    # Проверяем конфигурацию перед созданием приложения
    from check_config import check_configuration
    if not check_configuration():
        raise RuntimeError("❌ Конфигурация некорректна. Проверьте переменные окружения.")

    # Сначала инициализируем limiter
    from backend.extensions import limiter
    
    app = backend_create_app()
    
    # Затем инициализируем limiter с приложением
    limiter.init_app(app)
    app.extensions['limiter'] = limiter 
    
    # ВАЖНО: Добавляем наш хендлер в основной логгер приложения Flask
    app.logger.addHandler(server_handler)
    app.logger.setLevel(logging.INFO)

    # === CSRF PROTECTION ===
    from flask_wtf.csrf import CSRFProtect
    csrf = CSRFProtect()
    csrf.init_app(app)
    server_logger.info("✓ CSRF protection initialized")
    
    # Добавляем CSRF token в cookie после каждого запроса (для авторизованных пользователей)
    @app.after_request
    def set_csrf_cookie(response):
        """Добавляет CSRF token в cookie если его нет"""
        from flask import session, request
        from flask_wtf.csrf import generate_csrf
        
        # Только для авторизованных пользователей и HTML страниц
        if 'user_id' in session and not request.cookies.get('csrf_token'):
            # Проверяем что это HTML запрос или главная страница
            if request.accept_mimetypes.best == 'text/html' or request.path == '/':
                token = generate_csrf()
                response.set_cookie(
                    'csrf_token',
                    token,
                    httponly=False,  # JavaScript должен иметь доступ
                    samesite='Lax',
                    secure=False,  # В production заменить на True с HTTPS
                    path='/'
                )
                server_logger.debug(f"[CSRF] Token set for user {session.get('username')}")
        
        return response
    
    # === MIDDLEWARE: Автоматическая установка correlation ID ===
    @app.before_request
    def set_correlation_id():
        """Устанавливает correlation ID для каждого запроса"""
        from flask import request
        from backend.utils import get_or_create_correlation_id
        
        corr_id = get_or_create_correlation_id()
        
        # Логируем начало запроса с correlation ID
        server_logger.info(
            f"[REQUEST START] {request.method} {request.path} | "
            f"IP: {request.remote_addr} | "
            f"CorrelationID: {corr_id}"
        )
    
    CORS(app, supports_credentials=True)
    
    # НЕ создавайте новый экземпляр limiter, используйте существующий!
    # limiter = Limiter( ... )  <-- УДАЛИТЕ ЭТУ СТРОКУ!
    
    server_logger.info("✓ Rate limiter initialized")
    
    # app.extensions['limiter'] уже установлен выше
    
    @app.errorhandler(429)
    def ratelimit_handler(e):
        server_logger.warning(f"Rate limit exceeded for IP: {request.remote_addr}")
        return jsonify({
            'error': 'Rate limit exceeded',
            'message': 'Слишком много запросов. Пожалуйста, подождите немного.',
            'retry_after': str(e.description)
        }), 429
    
    # --- ЭНДПОИНТ ДЛЯ КЛИЕНТСКИХ ЛОГОВ ---
    @app.route('/api/log', methods=['POST'])
    @limiter.limit("10/minute")  # <--- ЗАЩИТА ОТ ФЛУДА ЛОГАМИ
    def client_log_endpoint():
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data'}), 400
            
            level = data.get('level', 'info').upper()
            message = data.get('message', '')
            details = data.get('details', '')
            
            # Базовая санитизация, чтобы не ломать формат логгера переносами строк
            message = message.replace('\n', ' ').replace('\r', '')
            details = details.replace('\n', ' ').replace('\r', '') if details else ''
            
            log_message = f"[CLIENT] {message}"
            if details:
                log_message += f" | Details: {details}"
            
            if level == 'ERROR':
                client_logger.error(log_message)
            elif level == 'WARN':
                client_logger.warning(log_message)
            else:
                client_logger.info(log_message)
            
            return jsonify({'success': True}), 200
        except Exception as e:
            server_logger.error(f"Failed to process client log: {e}")
            return jsonify({'error': 'Internal error'}), 500

    secret_key = os.environ.get('SECRET_KEY')
    
    if not secret_key:
        if os.environ.get('FLASK_ENV') == 'production':
            raise EnvironmentError("SECRET_KEY is missing!")
        
        server_logger.warning("⚠️ SECRET_KEY not set! Using temporary key.")
        secret_key = os.urandom(32).hex()
    
    app.config['SECRET_KEY'] = secret_key
    server_logger.info("✓ SECRET_KEY configured")
    
    app.config['SESSION_TYPE'] = 'filesystem'
    session_dir = os.path.join(os.path.abspath(os.path.dirname(__file__)), 'flask_sessions')
    app.config['SESSION_FILE_DIR'] = session_dir
    os.makedirs(session_dir, exist_ok=True)
    
    app.config['SESSION_PERMANENT'] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
    app.config['SESSION_COOKIE_NAME'] = 'session'
    app.config['SESSION_COOKIE_PATH'] = '/'
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SECURE'] = False 
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax' 
    app.config['SESSION_USE_SIGNER'] = True
    
    sess = Session()
    sess.init_app(app)
    
    return app
if __name__ == '__main__':
    app = create_app()
    debug_mode = os.environ.get('FLASK_DEBUG', '1').lower() in ('1', 'true', 'yes')
    app.run(host='0.0.0.0', port=5000, debug=debug_mode)