from flask import request, jsonify, render_template, session, redirect, url_for
from functools import wraps
from .auth import register_auth_routes
from .files import register_file_routes

def register_routes(app):
    # Декоратор для защиты маршрутов
    def login_required(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                if request.path.startswith('/api/'):
                    return jsonify({'error': 'Требуется авторизация'}), 401
                return redirect(url_for('login'))
            return f(*args, **kwargs)
        return decorated_function

    # --- РЕГИСТРАЦИЯ МАРШРУТОВ ---
    
    # 1. Авторизация
    register_auth_routes(app)
    
    # 2. Файлы
    register_file_routes(app)

    # 3. Главная страница (требует авторизации)
    @app.route('/')
    @login_required
    def index():
        current_user = session.get('username')
        return render_template('index.html', current_user=current_user)