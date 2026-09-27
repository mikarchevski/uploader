"""
Декораторы для админки.
"""
from functools import wraps
from flask import request, redirect, url_for, session, flash, abort

def admin_domain_required(f):
    """
    Декоратор для проверки домена.
    Разрешает localhost для разработки, но требует admin.* в продакшене.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        host = request.host
        
        # ✅ РАЗРЕШАЕМ локальные адреса для разработки
        if host in ('localhost', '127.0.0.1', 'localhost:5000', '127.0.0.1:5000'):
            return f(*args, **kwargs)
        
        # ✅ В продакшене строго проверяем поддомен
        if not host.startswith('admin.'):
            from flask import abort
            abort(404)
        
        return f(*args, **kwargs)
    return decorated_function

def admin_login_required(f):
    """
    Декоратор для проверки авторизации администратора.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_id' not in session:
            flash('Требуется авторизация администратора', 'error')
            return redirect(url_for('admin_login'))
        
        return f(*args, **kwargs)
    return decorated_function