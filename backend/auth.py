# backend/auth.py
from flask import request, jsonify, session, redirect, url_for, render_template, current_app
import logging
from .database import get_user_by_username, create_user, verify_password

def register_auth_routes(app):
    logger = logging.getLogger(__name__)
    client_logger = logging.getLogger('client_frontend')
    
    limiter = app.extensions.get('limiter')
    
    def rate_limit(limit_string):
        if limiter:
            return limiter.limit(limit_string)
        return lambda f: f

    @app.route('/login', methods=['GET', 'POST'])
    @rate_limit("10 per minute")
    def login():
        if request.method == 'POST':
            is_register = request.form.get('register') == '1'
            username = request.form.get('username')
            password = request.form.get('password')
            
            # Получаем IP для логов
            user_ip = request.remote_addr
            
            if not username or not password:
                return render_template('login.html', error='Заполните все поля')

            user = get_user_by_username(username)
            
            if not is_register:
                # Вход
                if user and verify_password(user['password_hash'], password):
                    session['user_id'] = user['id']
                    session['username'] = user['username']
                    
                    log_msg = f"[AUTH] User '{username}' logged in successfully from {user_ip}"
                    logger.info(log_msg)
                    client_logger.info(log_msg)
                    
                    return redirect('/')
                else:
                    log_msg = f"[AUTH] Failed login attempt for user '{username}' from {user_ip}"
                    logger.warning(log_msg)
                    client_logger.warning(log_msg)
                    
                    return render_template('login.html', error='Неверный логин или пароль')
            else:
                # Регистрация
                if user:
                    logger.warning(f"[AUTH] Registration failed: User '{username}' already exists")
                    return render_template('login.html', error='Пользователь уже существует')
                
                if create_user(username, password):
                    new_user = get_user_by_username(username)
                    session['user_id'] = new_user['id']
                    session['username'] = new_user['username']
                    
                    log_msg = f"[AUTH] New user registered: '{username}' from {user_ip}"
                    logger.info(log_msg)
                    client_logger.info(log_msg)
                    
                    return redirect('/')
                else:
                    logger.error(f"[AUTH] Registration error for user '{username}'")
                    return render_template('login.html', error='Ошибка при создании пользователя')
        
        return render_template('login.html')

    @app.route('/logout')
    def logout():
        username = session.get('username', 'Unknown')
        session.clear()
        
        log_msg = f"[AUTH] User '{username}' logged out"
        logger.info(log_msg)
        client_logger.info(log_msg)
        
        return redirect('/login')

    @app.route('/api/login', methods=['POST'])
    @rate_limit("5 per minute")
    def api_login():
        """Эндпоинт для мобильного приложения или AJAX"""
        data = request.get_json()
        user_ip = request.remote_addr
        
        if not data:
            return jsonify({'success': False, 'message': 'Нет данных'}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'success': False, 'message': 'Заполните все поля'}), 400

        user = get_user_by_username(username)
        
        if user and verify_password(user['password_hash'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            session.permanent = True
            
            log_msg = f"[AUTH API] User '{username}' logged in from {user_ip}"
            logger.info(log_msg)
            client_logger.info(log_msg)
            
            return jsonify({'success': True, 'message': 'Вход выполнен'}), 200
        else:
            log_msg = f"[AUTH API] Failed login attempt for user '{username}' from {user_ip}"
            logger.warning(log_msg)
            client_logger.warning(log_msg)
            
            return jsonify({'success': False, 'message': 'Неверный логин или пароль'}), 401