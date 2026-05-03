# backend/__init__.py
from flask import Flask
from .database import init_db
from .routes import register_routes
import os

def create_app():
    app = Flask(__name__, 
                template_folder='../templates', # Указываем, где лежат шаблоны
                static_folder='../static')      # Указываем, где лежит статика
    
    # Секретный ключ
    app.secret_key = os.environ.get('SECRET_KEY', 'super-secret-key-change-it-in-production')
    
    # Инициализация БД
    init_db()
    
    # Регистрация маршрутов
    register_routes(app)
    
    return app