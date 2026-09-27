# backend/auth.py
from flask import request, flash, jsonify, session, redirect, url_for, render_template, current_app
from backend.extensions import limiter
import logging
from .database import get_user_by_username, create_user, verify_password
from backend.config_constants import RATE_LIMIT_LOGIN


def register_auth_routes(app):
    logger = logging.getLogger(__name__)
    client_logger = logging.getLogger('client_frontend')
    
    @app.route('/login', methods=['GET', 'POST'])
    @limiter.limit(RATE_LIMIT_LOGIN)
    def login():
        # 1. GET-запрос: показываем форму, читая состояние из сессии
        if request.method == 'GET':
            # pop() забирает значение и удаляет его, чтобы при следующем F5 форма была чистой
            is_register = session.pop('register_mode', False)
            reg_username = session.pop('reg_username', '')
            reg_invite = session.pop('reg_invite', '')
            
            return render_template(
                'login.html', 
                is_register=is_register, 
                username=reg_username, 
                invite_code=reg_invite
            )

        # 2. POST-запрос: обработка данных
        is_register = request.form.get('register') == '1'
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        user_ip = request.remote_addr

        if not username or not password:
            flash('Заполните все поля', 'error')
            if is_register: session['register_mode'] = True
            return redirect(url_for('login'))

        user = get_user_by_username(username)

        if not is_register:
            # --- ВХОД ---
            if user and verify_password(user['password_hash'], password):
                session['user_id'] = user['id']
                session['username'] = user['username']
                logger.info(f"[AUTH] User '{username}' logged in successfully from {user_ip}")
                return redirect('/')
            else:
                logger.warning(f"[AUTH] Failed login attempt for user '{username}' from {user_ip}")
                flash('Неверный логин или пароль', 'error')
                return redirect(url_for('login'))
        else:
            # --- РЕГИСТРАЦИЯ ---
            password_confirm = request.form.get('password_confirm', '')
            invite_code = request.form.get('invite_code', '').strip().upper()

            # Вспомогательная функция для обработки ошибок с сохранением состояния
            def register_error(message):
                session['register_mode'] = True       # Запоминаем, что мы на регистрации
                session['reg_username'] = username    # Сохраняем логин
                session['reg_invite'] = invite_code   # Сохраняем инвайт (чтобы пользователь видел опечатку)
                flash(message, 'error')
                return redirect(url_for('login'))

            if len(password) < 6:
                return register_error('Пароль должен быть не менее 6 символов')

            if password != password_confirm:
                return register_error('Пароли не совпадают')

            if not invite_code:
                return register_error('Введите код приглашения')

            from backend.database import validate_invite_code, mark_invite_code_used
            invite = validate_invite_code(invite_code)

            if not invite:
                return register_error('Недействительный или использованный код приглашения')

            if user:
                logger.warning(f"[AUTH] Registration failed: User '{username}' already exists")
                return register_error('Пользователь уже существует')

            if create_user(username, password):
                new_user = get_user_by_username(username)
                session['user_id'] = new_user['id']
                session['username'] = new_user['username']

                # Отмечаем код как использованный
                mark_invite_code_used(invite['id'], new_user['id'])

                logger.info(f"[AUTH] New user registered: '{username}' from {user_ip}")
                return redirect('/')
            else:
                logger.error(f"[AUTH] Registration error for user '{username}'")
                return register_error('Ошибка при создании пользователя')
    @app.route('/logout')
    def logout():
        username = session.get('username', 'Unknown')
        session.clear()
        
        log_msg = f"[AUTH] User '{username}' logged out"
        logger.info(log_msg)
        client_logger.info(log_msg)
        
        return redirect('/login')

    @app.route('/api/login', methods=['POST'])
    @limiter.limit(RATE_LIMIT_LOGIN)
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