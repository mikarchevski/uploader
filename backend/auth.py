# backend/auth.py
from flask import request, flash, jsonify, session, redirect, url_for, render_template, current_app
from backend.extensions import limiter
import logging
from .database import get_user_by_username, create_user, verify_password
from backend.config_constants import RATE_LIMIT_LOGIN


def register_auth_routes(app):
    logger = logging.getLogger(__name__)
    client_logger = logging.getLogger('client_frontend')
    
    # backend/auth.py

    @app.route('/login', methods=['GET', 'POST'])
    @limiter.limit(RATE_LIMIT_LOGIN)
    def login():
        # 1. GET-запрос
        if request.method == 'GET':
            is_register = session.pop('register_mode', False)
            reg_username = session.pop('reg_username', '')
            reg_invite = session.pop('reg_invite', '')
            error_msg = session.pop('error_msg', '')
            
            return render_template(
                'auth.html',  # <--- ИСПОЛЬЗУЕМ НОВЫЙ ЧИСТЫЙ ФАЙЛ
                is_register=is_register, 
                username=reg_username, 
                invite_code=reg_invite,
                error=error_msg
            )

        # 2. POST-запрос
        is_register = request.form.get('register') == '1'
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        password_confirm = request.form.get('password_confirm', '')
        invite_code = request.form.get('invite_code', '').strip().upper()
        user_ip = request.remote_addr

        # Функция возврата формы с ошибкой БЕЗ редиректа
        def render_registration_error(message):
            print(f"⚠️ ОШИБКА РЕГИСТРАЦИИ: {message}")
            return render_template(
                'auth.html',  # <--- ИСПОЛЬЗУЕМ НОВЫЙ ЧИСТЫЙ ФАЙЛ
                is_register=True,
                username=username,
                password=password,
                password_confirm=password_confirm,
                invite_code=invite_code,
                error=message
            )

        if not is_register:
            # --- ЛОГИКА ВХОДА ---
            from backend.database import get_user_by_username, verify_password
            user = get_user_by_username(username)
            if user and verify_password(user['password_hash'], password):
                session['user_id'] = user['id']
                session['username'] = user['username']
                return redirect('/')
            else:
                flash('Неверный логин или пароль', 'error')
                return redirect(url_for('login'))
        else:
            # --- ЛОГИКА РЕГИСТРАЦИИ ---
            print(f"✅ Обработка регистрации для: {username}")
            try:
                from backend.database import get_user_by_username, create_user, validate_invite_code, mark_invite_code_used

                if len(password) < 6:
                    return render_registration_error('Пароль должен быть не менее 6 символов')
                if password != password_confirm:
                    return render_registration_error('Пароли не совпадают')
                if not invite_code:
                    return render_registration_error('Введите код приглашения')

                user = get_user_by_username(username)
                if user:
                    return render_registration_error('Пользователь уже существует')

                invite = validate_invite_code(invite_code)
                if not invite:
                    return render_registration_error('Недействительный или использованный код приглашения')

                if create_user(username, password):
                    new_user = get_user_by_username(username)
                    session['user_id'] = new_user['id']
                    session['username'] = new_user['username']
                    mark_invite_code_used(invite['id'], new_user['id'])
                    return redirect('/')
                else:
                    return render_registration_error('Ошибка при создании пользователя')

            except Exception as e:
                print(f"💥 КРИТИЧЕСКАЯ ОШИБКА В РЕГИСТРАЦИИ: {e}")
                import traceback
                traceback.print_exc()
                return render_registration_error(f'Внутренняя ошибка сервера: {str(e)}')
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