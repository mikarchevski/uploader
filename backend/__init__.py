# backend/__init__.py
from flask import Flask
from .database import init_db
from .routes import register_routes
import os
import warnings

def create_app():
    app = Flask(__name__, 
                template_folder='../templates',
                static_folder='../static')
    
    # Получаем секретный ключ из переменных окружения
    secret_key = os.environ.get('SECRET_KEY')
    
    if not secret_key:
        # В продакшене это критическая ошибка
        if os.environ.get('FLASK_ENV') == 'production':
            raise EnvironmentError(
                "КРИТИЧЕСКАЯ ОШИБКА: SECRET_KEY не установлен!\n"
                "В продакшене ОБЯЗАТЕЛЬНО нужен уникальный SECRET_KEY.\n"
                "Сгенерируйте ключ: python3 generate_secret_key.py\n"
                "И добавьте его в .env файл."
            )
        
        # В режиме разработки генерируем временный ключ
        warnings.warn(
            "⚠️ ВНИМАНИЕ: SECRET_KEY не найден в переменных окружения!\n"
            "   Используется временный случайный ключ.\n"
            "   Для стабильной работы добавьте SECRET_KEY в файл .env\n"
            "   Сгенерировать ключ: python3 generate_secret_key.py",
            UserWarning,
            stacklevel=2
        )
        secret_key = os.urandom(32).hex()
    
    # Проверяем длину ключа (минимум 16 символов для безопасности)
    if len(secret_key) < 16:
        raise ValueError(
            f"SECRET_KEY слишком короткий ({len(secret_key)} символов)!\n"
            "Минимальная длина: 16 символов.\n"
            "Рекомендуемая длина: 32+ символа.\n"
            "Сгенерируйте безопасный ключ: python3 generate_secret_key.py"
        )
    
    # Проверяем, не используется ли значение по умолчанию
    weak_keys = [
        'super-secret-key-change-it-in-production',
        'change-me',
        'secret',
        'password',
        '123456',
    ]
    if secret_key in weak_keys:
        raise ValueError(
            "⚠️ ОБНАРУЖЕН СЛАБЫЙ SECRET_KEY!\n"
            "Вы используете известное значение по умолчанию.\n"
            "Это КРИТИЧЕСКАЯ уязвимость безопасности!\n"
            "Сгенерируйте уникальный ключ: python3 generate_secret_key.py"
        )
    
    app.secret_key = secret_key
    
    # Инициализация БД
    init_db()
    
    # Регистрация маршрутов
    register_routes(app)
    
    return app