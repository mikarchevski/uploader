from flask import request, jsonify, send_file, render_template, url_for, session, redirect, current_app
import os
import sqlite3
import logging
from .config import UPLOAD_FOLDER, DB_PATH
from .database import (
    get_file_by_hash, 
    get_file_by_short_id, 
    insert_file, 
    increment_download_count, 
    list_files_by_user,
    get_user_by_username,
    create_user,
    verify_password,
    delete_file_by_short_id,
    get_files_by_hash
)
from .utils import generate_short_id, format_file_size, compute_file_hash
from .preview import get_preview_data
from datetime import datetime
import uuid
from functools import wraps

def register_routes(app):
    # Получаем доступ к лимитеру через app.extensions
    limiter = app.extensions.get('limiter')
    
    # Helper функция для применения rate limit только если limiter доступен
    def rate_limit(limit_string):
        if limiter:
            return limiter.limit(limit_string)
        return lambda f: f  # No-op decorator если limiter нет
    
    # --- АВТОРИЗАЦИЯ ---

    @app.route('/login', methods=['GET', 'POST'])
    @rate_limit("10 per minute")
    def login():
        if request.method == 'POST':
            # Проверяем скрытое поле формы для определения режима
            is_register = request.form.get('register') == '1'
            
            username = request.form.get('username')
            password = request.form.get('password')
            
            if not username or not password:
                return render_template('login.html', error='Заполните все поля')

            user = get_user_by_username(username)
            
            # Логика ВХОДА
            if not is_register:
                if user and verify_password(user['password_hash'], password):
                    session['user_id'] = user['id']
                    session['username'] = user['username']
                    return redirect('/')
                else:
                    return render_template('login.html', error='Неверный логин или пароль')
            
            # Логика РЕГИСТРАЦИИ
            else:
                if user:
                    return render_template('login.html', error='Пользователь уже существует')
                
                if create_user(username, password):
                    # Автоматический вход после успешной регистрации
                    new_user = get_user_by_username(username)
                    session['user_id'] = new_user['id']
                    session['username'] = new_user['username']
                    return redirect('/')
                else:
                    return render_template('login.html', error='Ошибка при создании пользователя')
        
        # GET запрос: просто показываем форму входа
        return render_template('login.html')

    @app.route('/logout')
    def logout():
        session.clear()
        return redirect('/login')

    @app.route('/api/login', methods=['POST'])
    @rate_limit("5 per minute")
    def api_login():
        """
        Эндпоинт для мобильного приложения.
        Принимает JSON, возвращает JSON и устанавливает Cookie сессии.
        """
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'message': 'Нет данных'}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'success': False, 'message': 'Заполните все поля'}), 400

        # Используем вашу существующую функцию поиска пользователя
        user = get_user_by_username(username)
        
        # Проверяем пароль вашей функцией verify_password
        if user and verify_password(user['password_hash'], password):
            # Успех! Записываем данные в сессию (это создаст куку)
            session['user_id'] = user['id']
            session['username'] = user['username']
            session.permanent = True # Важно для долгой жизни сессии
            
            # Возвращаем JSON успех
            return jsonify({
                'success': True, 
                'message': 'Вход выполнен'
            }), 200
        else:
            # Ошибка
            return jsonify({
                'success': False, 
                'message': 'Неверный логин или пароль'
            }), 401

    # Декоратор для защиты маршрутов (на будущее)
    def login_required(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                # Можно перенаправлять на логин или возвращать ошибку API
                if request.path.startswith('/api/'):
                    return jsonify({'error': 'Требуется авторизация'}), 401
                return redirect(url_for('login'))
            return f(*args, **kwargs)
        return decorated_function

    # --- ОСНОВНЫЕ МАРШРУТЫ ---

    @app.route('/')
    @login_required
    def index():
        current_user = session.get('username')
        return render_template('index.html', current_user=current_user)

    @app.route('/api/preview/<short_id>')
    @rate_limit("60 per minute")
    def get_file_preview(short_id):
        try:
            file_data = get_file_by_short_id(short_id)
            if not file_data:
                return jsonify({'error': 'File not found'}), 404
            
            filepath = os.path.join(UPLOAD_FOLDER, file_data['unique_name'])
            ext = os.path.splitext(file_data['original_filename'])[1].lower()
            
            if not os.path.exists(filepath):
                return jsonify({'has_preview': False})
                
            response = jsonify(get_preview_data(filepath, ext))
            response.headers['Cache-Control'] = 'public, max-age=86400'
            return response
        except Exception as e:
            return jsonify({'error': str(e)}), 500
            
    @app.route('/api/files', methods=['GET'])
    @login_required
    @rate_limit("60 per minute")
    def list_files_api():
        try:
            user_id = session.get('user_id')
            # Получаем файлы только текущего пользователя
            all_files = list_files_by_user(user_id)
            
            # Пагинация на стороне Python (так как список уже отфильтрован)
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 20, type=int)
            
            start = (page - 1) * per_page
            end = start + per_page
            paginated_files = all_files[start:end]
            
            file_list = []
            for f in paginated_files:
                file_list.append({
                    'short_id': f['short_id'],
                    'filename': f['original_filename'],
                    'size': format_file_size(f['file_size']),
                    'date': f['upload_date'][:10],
                    'downloads': f['download_count'],
                    'url': f"https://{request.host}/d/{f['short_id']}"
                })
                
            return jsonify({
                'files': file_list,
                'total': len(all_files),
                'has_more': end < len(all_files)
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    @app.route('/api/delete/<short_id>', methods=['DELETE'])
    @login_required
    @rate_limit("20 per minute")
    def delete_file(short_id):
        try:
            user_id = session.get('user_id')
            file_data = get_file_by_short_id(short_id)
            
            if not file_data:
                return jsonify({'error': 'File not found'}), 404
            
            # ПРОВЕРКА БЕЗОПАСНОСТИ: Можно удалять только свои файлы
            if file_data.get('owner_id') != user_id:
                return jsonify({'error': 'Access denied'}), 403
            
            file_hash = file_data['file_hash']
            unique_name = file_data['unique_name']
            filepath = os.path.join(UPLOAD_FOLDER, unique_name)
            
            # Сначала удаляем запись из БД
            delete_file_by_short_id(short_id)
            
            # Проверяем, есть ли еще записи с таким же хешем
            remaining_files = get_files_by_hash(file_hash)
            
            # Если записей больше нет - удаляем физический файл
            if len(remaining_files) == 0:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    logging.getLogger(__name__).info(f"[DELETE] Physical file removed: {unique_name}")
            else:
                logging.getLogger(__name__).info(f"[DELETE] File still referenced by {len(remaining_files)} other records. Keeping physical file.")
                
            return jsonify({'success': True}), 200
        except Exception as e:
            print(f"Error deleting file: {e}")
            import traceback
            print(traceback.format_exc())
            return jsonify({'error': str(e)}), 500

    @app.route('/check', methods=['GET'])
    @login_required
    @rate_limit("30 per minute")
    def check_file():
        logger = logging.getLogger(__name__)
        try:
            file_hash = request.args.get('h')
            current_user_id = session.get('user_id')
            
            logger.info(f"[CHECK] Hash: {file_hash[:10] if file_hash else 'None'}... User: {current_user_id}")
            
            if not file_hash or len(file_hash) != 64:
                logger.info("[CHECK] Invalid hash format")
                return jsonify({'exists': False}), 200

            existing = get_file_by_hash(file_hash)
            if existing:
                owner_id = existing.get('owner_id')
                is_owner = (owner_id == current_user_id)
                
                logger.info(f"[CHECK] File found! Owner: {owner_id}, Current User: {current_user_id}, Is Owner: {is_owner}")
                
                if is_owner:
                    # Файл принадлежит текущему пользователю
                    url = f"https://{request.host}/d/{existing['short_id']}"
                    logger.info(f"[CHECK] Returning owned file URL: {url}")
                    
                    return jsonify({
                        'exists': True, 
                        'owned': True,
                        'message': 'Файл уже загружен',
                        'url': url,
                        'file_data': {
                            'short_id': existing['short_id'],
                            'filename': existing['original_filename'],
                            'size': format_file_size(existing['file_size']),
                            'date': existing['upload_date'][:10],
                            'downloads': existing.get('download_count', 0),
                            'url': url
                        }
                    }), 200
                else:
                    # Файл есть на сервере, но принадлежит другому пользователю
                    logger.info(f"[CHECK] File exists but owned by another user. Will need to create new reference.")
                    return jsonify({'exists': True, 'owned': False}), 200
            
            logger.info("[CHECK] File not found in database")
            return jsonify({'exists': False}), 200
        except Exception as e:
            logger.error(f"[CHECK] Error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return jsonify({'exists': False, 'error': str(e)}), 200


    @app.route('/upload', methods=['POST'])
    @login_required
    @rate_limit("10 per minute")
    def upload_file():
        logger = logging.getLogger(__name__)
        
        current_user_id = session.get('user_id')
        
        if not current_user_id:
            return jsonify({'error': 'Not authorized'}), 401

        try:
            if 'file' not in request.files:
                return jsonify({'error': 'No file provided'}), 400
            
            file = request.files['file']
            if file.filename == '':
                return jsonify({'error': 'Empty filename'}), 400

            # 1. Получаем хеш
            file_hash = request.form.get('hash')
            if not file_hash or len(file_hash) != 64:
                file_hash = compute_file_hash(file)
                file.seek(0)
            
            # 2. ПРЯМАЯ ПРОВЕРКА В БД: Есть ли файл с таким хешем у ТЕКУЩЕГО пользователя?
            with sqlite3.connect(DB_PATH) as conn:
                conn.row_factory = sqlite3.Row
                c = conn.cursor()
                # Ищем именно совпадение хеша И владельца
                c.execute('SELECT * FROM files WHERE file_hash = ? AND owner_id = ?', (file_hash, current_user_id))
                existing_owned_file = c.fetchone()

            if existing_owned_file:
                existing_dict = dict(existing_owned_file)
                logger.info(f"[UPLOAD] Duplicate found for CURRENT user {current_user_id}. ShortID: {existing_dict['short_id']}")
                
                url = f"https://{request.host}/d/{existing_dict['short_id']}"
                return jsonify({
                    'success': True,
                    'message': 'Файл уже загружен',
                    'file_data': {
                        'short_id': existing_dict['short_id'],
                        'filename': existing_dict['original_filename'],
                        'size': format_file_size(existing_dict['file_size']),
                        'date': existing_dict['upload_date'][:10],
                        'downloads': existing_dict.get('download_count', 0),
                        'url': url
                    }
                }), 200

            # 3. Если файла нет у текущего пользователя, проверяем, есть ли он у других (для экономии места на диске)
            existing_other = get_file_by_hash(file_hash)
            
            if existing_other:
                # Файл есть на сервере, но принадлежит ДРУГОМУ пользователю
                logger.info(f"[UPLOAD] Case B: File belongs to OTHER user ({existing_other.get('owner_id')}). Creating new reference for User {current_user_id}.")
                
                unique_name = existing_other['unique_name']
                file_size = existing_other['file_size']
                
                # Генерируем новый short_id
                max_attempts = 10
                new_short_id = None
                
                for attempt in range(max_attempts):
                    candidate_id = generate_short_id(6)
                    if not get_file_by_short_id(candidate_id):
                        new_short_id = candidate_id
                        break
                
                if not new_short_id:
                    return jsonify({'error': 'Could not generate unique ID'}), 500
                
                try:
                    insert_file(new_short_id, unique_name, file.filename, file_hash, file_size, owner_id=current_user_id)
                    
                    return jsonify({
                        'success': True,
                        'file_data': {
                            'short_id': new_short_id,
                            'filename': file.filename,
                            'size': format_file_size(file_size),
                            'date': datetime.now().strftime('%Y-%m-%d'),
                            'downloads': 0,
                            'url': url_for('download_short', short_id=new_short_id, _external=True)
                        }
                    }), 200
                except Exception as e:
                    logger.error(f"[UPLOAD] DB INSERT FAILED: {e}")
                    return jsonify({'error': 'Database error'}), 500

            # 4. Полностью новый файл (ни у кого нет)
            logger.info("[UPLOAD] Case C: New file. Saving to disk.")
            
            max_attempts = 10
            short_id = None
            for attempt in range(max_attempts):
                candidate_id = generate_short_id(6)
                if not get_file_by_short_id(candidate_id):
                    short_id = candidate_id
                    break
            
            if not short_id:
                return jsonify({'error': 'Could not generate unique ID'}), 500
            
            ext = os.path.splitext(file.filename)[1]
            unique_name = f"{uuid.uuid4().hex}{ext}"
            filepath = os.path.join(UPLOAD_FOLDER, unique_name)
            
            file.save(filepath)
            file_size = os.path.getsize(filepath)
            
            insert_file(short_id, unique_name, file.filename, file_hash, file_size, owner_id=current_user_id)
            
            return jsonify({
                'success': True,
                'file_data': {
                    'short_id': short_id,
                    'filename': file.filename,
                    'size': format_file_size(file_size),
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'downloads': 0,
                    'url': url_for('download_short', short_id=short_id, _external=True)
                }
            }), 200

        except Exception as e:
            logger.error(f"[UPLOAD] Critical Error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return jsonify({'error': 'Internal Server Error'}), 500

    @app.route('/d/<short_id>')
    def download_short(short_id):
        try:
            file_data = get_file_by_short_id(short_id)
            if not file_data:
                return 'File not found', 404
            
            increment_download_count(short_id)
            
            filepath = os.path.join(UPLOAD_FOLDER, file_data['unique_name'])
            return send_file(filepath, as_attachment=True, download_name=file_data['original_filename'])
        except Exception as e:
            return str(e), 404

    @app.route('/downloads/<unique_name>/<original_filename>')
    def download_file(unique_name, original_filename):
        try:
            from flask import send_from_directory
            return send_from_directory(UPLOAD_FOLDER, unique_name, as_attachment=True, download_name=original_filename)
        except Exception as e:
            return str(e), 404