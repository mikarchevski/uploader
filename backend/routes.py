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
    
    # --- АВТОРИЗАЦИЯ ---

    @app.route('/login', methods=['GET', 'POST'])
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
                    return jsonify({'exists': True, 'url': url, 'owned': True}), 200
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
# ... existing code ...

    @app.route('/upload', methods=['POST'])
    @login_required
    def upload_file():
        logger = logging.getLogger(__name__)
        
        current_user_id = session.get('user_id')
        current_username = session.get('username')
        
        logger.info(f"\n{'='*40}")
        logger.info(f"[UPLOAD] START")
        logger.info(f"[UPLOAD] Current User ID: {current_user_id}")
        logger.info(f"[UPLOAD] Current Username: {current_username}")
        
        if not current_user_id:
            logger.error("[UPLOAD] ERROR: No user ID in session!")
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
                logger.info("[UPLOAD] Hash missing, computing...")
                file_hash = compute_file_hash(file)
                file.seek(0)
            else:
                logger.info(f"[UPLOAD] Hash received: {file_hash[:10]}...")
            
            # 2. Ищем файл по хешу
            existing = get_file_by_hash(file_hash)
            
            if existing:
                existing_owner_id = existing.get('owner_id')
                existing_short_id = existing.get('short_id')
                
                logger.info(f"[UPLOAD] File FOUND in DB.")
                logger.info(f"[UPLOAD] Existing Owner ID: {existing_owner_id}")
                logger.info(f"[UPLOAD] Existing Short ID: {existing_short_id}")
                
                # СРАВНЕНИЕ
                if existing_owner_id == current_user_id:
                    logger.info("[UPLOAD] Case A: File belongs to CURRENT user. Returning existing link.")
                    return jsonify({
                        'success': True,
                        'message': 'File already exists',
                        'file_data': {
                            'short_id': existing_short_id,
                            'filename': existing['original_filename'],
                            'size': format_file_size(existing['file_size']),
                            'date': existing['upload_date'][:10],
                            'downloads': existing.get('download_count', 0),
                            'url': url_for('download_short', short_id=existing_short_id, _external=True)
                        }
                    }), 200

                else:
                    logger.info(f"[UPLOAD] Case B: File belongs to OTHER user ({existing_owner_id}). Creating new reference for User {current_user_id}.")
                    
                    # Используем существующий unique_name (файл уже на диске)
                    unique_name = existing['unique_name']
                    file_size = existing['file_size']
                    
                    # Генерируем УНИКАЛЬНЫЙ short_id с проверкой
                    max_attempts = 10
                    new_short_id = None
                    
                    for attempt in range(max_attempts):
                        candidate_id = generate_short_id(6)
                        # Проверяем, не занят ли этот ID
                        if not get_file_by_short_id(candidate_id):
                            new_short_id = candidate_id
                            logger.info(f"[UPLOAD] Generated unique ShortID: {new_short_id} (attempt {attempt + 1})")
                            break
                    
                    if not new_short_id:
                        logger.error("[UPLOAD] Failed to generate unique short_id after multiple attempts")
                        return jsonify({'error': 'Could not generate unique ID'}), 500
                    
                    logger.info(f"[UPLOAD] Attempting to insert new record: ShortID={new_short_id}, Owner={current_user_id}, UniqueName={unique_name}")
                    
                    try:
                        # ВАЖНО: Используем тот же unique_name, файл уже на диске!
                        insert_file(new_short_id, unique_name, file.filename, file_hash, file_size, owner_id=current_user_id)
                        logger.info(f"[UPLOAD] SUCCESS: New record inserted!")
                        
                        # ПРОВЕРКА
                        verify_record = get_file_by_short_id(new_short_id)
                        if verify_record:
                            logger.info(f"[UPLOAD] VERIFICATION OK: Record found with owner_id={verify_record.get('owner_id')}")
                        else:
                            logger.error(f"[UPLOAD] VERIFICATION FAILED: Record NOT found in DB!")

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
                        # Проверяем, не ошибка ли это дубликата
                        if 'UNIQUE constraint failed' in str(e) or 'duplicate' in str(e).lower():
                            logger.warning(f"[UPLOAD] Race condition detected: {e}")
                            # Повторно ищем файл по хешу - возможно, другой поток уже добавил его
                            retry_existing = get_file_by_hash(file_hash)
                            if retry_existing and retry_existing.get('owner_id') == current_user_id:
                                logger.info(f"[UPLOAD] Retry success: Found file owned by current user")
                                return jsonify({
                                    'success': True,
                                    'message': 'File already exists',
                                    'file_data': {
                                        'short_id': retry_existing['short_id'],
                                        'filename': retry_existing['original_filename'],
                                        'size': format_file_size(retry_existing['file_size']),
                                        'date': retry_existing['upload_date'][:10],
                                        'downloads': retry_existing.get('download_count', 0),
                                        'url': url_for('download_short', short_id=retry_existing['short_id'], _external=True)
                                    }
                                }), 200
                        
                        logger.error(f"[UPLOAD] DB INSERT FAILED: {e}")
                        import traceback
                        logger.error(traceback.format_exc())
                        return jsonify({'error': 'Database error'}), 500

# ... existing code ...

            # 3. Файла нет в БД - новая загрузка
            logger.info("[UPLOAD] Case C: New file. Saving to disk.")
            
            # Генерируем уникальный short_id с проверкой
            max_attempts = 10
            short_id = None
            
            for attempt in range(max_attempts):
                candidate_id = generate_short_id(6)
                if not get_file_by_short_id(candidate_id):
                    short_id = candidate_id
                    logger.info(f"[UPLOAD] Generated unique ShortID: {short_id} (attempt {attempt + 1})")
                    break
            
            if not short_id:
                logger.error("[UPLOAD] Failed to generate unique short_id for new file")
                return jsonify({'error': 'Could not generate unique ID'}), 500
            
            ext = os.path.splitext(file.filename)[1]
            unique_name = f"{uuid.uuid4().hex}{ext}"
            filepath = os.path.join(UPLOAD_FOLDER, unique_name)
            
            file.save(filepath)
            file_size = os.path.getsize(filepath)
            
            insert_file(short_id, unique_name, file.filename, file_hash, file_size, owner_id=current_user_id)
            
            logger.info(f"[UPLOAD] New file saved. ShortID: {short_id}")

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

# ... existing code ...
# ... existing code ...

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