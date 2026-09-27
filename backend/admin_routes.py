"""
Маршруты для админки.
"""
from flask import render_template, request, redirect, url_for, session, flash
from backend.extensions import limiter
from backend.admin_auth import admin_domain_required, admin_login_required
from backend.database import (
    get_admin_by_username, 
    verify_password, 
    list_all_users,
    get_user_by_id,
    count_all_users,
    create_invite_code,        # <-- Добавьте
    list_invite_codes,         # <-- Добавьте
    delete_invite_code         # <-- Добавьте
)
from werkzeug.security import check_password_hash
import logging
from datetime import datetime

def register_admin_routes(app):
    logger = logging.getLogger(__name__)
    
    @app.route('/admin/login', methods=['GET', 'POST'])
    @admin_domain_required
    @limiter.limit("10/minute")
    def admin_login():
        if request.method == 'POST':
            username = request.form.get('username', '').strip()
            password = request.form.get('password', '')
            
            if not username or not password:
                flash('Заполните все поля', 'error')
                return redirect(url_for('admin_login'))
            
            admin = get_admin_by_username(username)
            
            if admin and check_password_hash(admin['password_hash'], password):
                session['admin_id'] = admin['id']
                session['admin_username'] = admin['username']
                
                logger.info(f"[ADMIN] Admin '{username}' logged in from {request.remote_addr}")
                
                return redirect(url_for('admin_dashboard'))
            else:
                logger.warning(f"[ADMIN] Failed login attempt for '{username}' from {request.remote_addr}")
                flash('Неверный логин или пароль', 'error')
        
        return render_template('admin/login.html')
    
    @app.route('/admin/dashboard')
    @admin_domain_required
    @admin_login_required
    def admin_dashboard():
        from backend.database import list_all_files, count_all_users
        
        all_files = list_all_files()
        total_files = len(all_files)
        total_users = count_all_users()
        
        # ✅ БЕЗОПАСНЫЙ подсчёт размера (игнорирует NULL значения в БД)
        total_size = 0
        for f in all_files:
            size = f.get('file_size')
            if size is not None:
                total_size += int(size)
                
        # ✅ Отладочный вывод в терминал сервера
        logger.info(f"[ADMIN DASHBOARD] Total files: {total_files}, Total size calculated: {total_size} bytes")

        stats = {
            'total_files': total_files,
            'total_users': total_users,
            'total_size': total_size
        }
        
        return render_template('admin/dashboard.html', stats=stats)
    
    @app.route('/admin/logout')
    @admin_domain_required
    def admin_logout():
        username = session.get('admin_username', 'Unknown')
        session.clear()
        
        logger.info(f"[ADMIN] Admin '{username}' logged out")
        
        return redirect(url_for('admin_login'))

        # --- СПИСОК ПОЛЬЗОВАТЕЛЕЙ ---
        # --- СПИСОК ПОЛЬЗОВАТЕЛЕЙ ---
    @app.route('/admin/users')
    @admin_domain_required
    @admin_login_required
    def admin_users():
      sort_by = request.args.get('sort', 'id')
      order = request.args.get('order', 'DESC')
      
      users = list_all_users(sort_by=sort_by, order=order)
      
      return render_template('admin/users.html', users=users, sort_by=sort_by, order=order)

    # --- ДЕТАЛЬНАЯ СТРАНИЦА ПОЛЬЗОВАТЕЛЯ (ЗАГЛУШКА) ---
    @app.route('/admin/users/<int:user_id>')
    @admin_domain_required
    @admin_login_required
    def admin_user_detail(user_id):
        user = get_user_by_id(user_id)
        if not user:
            flash('Пользователь не найден', 'error')
            return redirect(url_for('admin_users'))
        
        return render_template('admin/user_detail.html', user=user)
        # --- УПРАВЛЕНИЕ ИНВАЙТ-КОДАМИ ---
    @app.route('/admin/invites', methods=['GET', 'POST'])
    @admin_domain_required
    @admin_login_required
    def admin_invites():
        if request.method == 'POST':
            code = request.form.get('code', '').strip().upper()
            
            if not code:
                flash('Введите код приглашения', 'error')
                return redirect(url_for('admin_invites'))
            
            if len(code) < 3:
                flash('Код должен содержать минимум 3 символа', 'error')
                return redirect(url_for('admin_invites'))
            
            admin_id = session.get('admin_id')
            
            if create_invite_code(code, admin_id):
                flash(f'Код приглашения "{code}" создан', 'success')
            else:
                flash('Такой код уже существует', 'error')
            
            return redirect(url_for('admin_invites'))
        
        # GET - показываем список
        invite_codes = list_invite_codes()
        return render_template('admin/invites.html', invite_codes=invite_codes)
    
    @app.route('/admin/invites/<int:code_id>/delete', methods=['POST'])
    @admin_domain_required
    @admin_login_required
    def admin_delete_invite(code_id):
        if delete_invite_code(code_id):
            flash('Код приглашения удалён', 'success')
        else:
            flash('Ошибка при удалении кода', 'error')
        
        return redirect(url_for('admin_invites'))