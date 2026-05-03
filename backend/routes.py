from flask import request, jsonify, send_file, render_template, url_for, session, redirect, current_app
import os
import sqlite3
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
    delete_file_by_short_id
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
            
            filepath = os.path.join(UPLOAD_FOLDER, file_data['unique_name'])
            if os.path.exists(filepath):
                os.remove(filepath)
            
            delete_file_by_short_id(short_id)
                
            return jsonify({'success': True}), 200
        except Exception as e:
            print(f"Error deleting file: {e}")
            return jsonify({'error': str(e)}), 500
    
    @app.route('/check', methods=['GET'])
    @login_required
    def check_file():
        try:
            file_hash = request.args.get('h')
            if not file_hash or len(file_hash) != 64:
                return jsonify({'exists': False}), 200

            existing = get_file_by_hash(file_hash)
            if existing:
                url = f"https://{request.host}/d/{existing['short_id']}"
                return jsonify({'exists': True, 'url': url}), 200
            
            return jsonify({'exists': False}), 200
        except Exception as e:
            return jsonify({'exists': False, 'error': str(e)}), 200

    @app.route('/upload', methods=['POST'])
    @login_required
    def upload_file():
        import time
        start_time = time.time()
        print(f"[{start_time}] НАЧАЛО ЗАГРУЗКИ")
        
        filepath = None
        try:
            if 'file' not in request.files:
                return jsonify({'error': 'No file provided'}), 400
            
            file = request.files['file']
            if file.filename == '':
                return jsonify({'error': 'Empty filename'}), 400

            t1 = time.time()
            file_hash = request.form.get('hash')
            
            # Если хеш не предоставлен клиентом, вычисляем на сервере (это медленно!)
            if not file_hash or len(file_hash) != 64:
                print(f"[{time.time()}] Хеш не получен, вычисляю на сервере...")
                file_hash = compute_file_hash(file)
                file.seek(0)
                print(f"[{time.time()}] Хеш вычислен за {time.time() - t1:.2f} сек")
            else:
                print(f"[{time.time()}] Хеш получен от клиента")
                file.seek(0)
            
            t2 = time.time()
            existing = get_file_by_hash(file_hash)
            print(f"[{time.time()}] Проверка в БД за {time.time() - t2:.2f} сек")
            
            # Получаем ID текущего пользователя из сессии
            current_user_id = session.get('user_id')

            # Если файл уже существует в БД
            if existing:
                print(f"[{time.time()}] Файл уже существует в БД")
                if existing.get('owner_id') == current_user_id:
                    return jsonify({
                        'url': url_for('download_short', short_id=existing['short_id'], _external=True),
                        'success': True,
                        'message': 'File already exists'
                    }), 200
                else:
                    # Файл есть у другого пользователя. 
                    # Мы не копируем файл на диск, а создаем новую запись в БД,
                    # указывающую на тот же unique_name.
                    
                    unique_name = existing['unique_name']
                    file_size = existing['file_size']
                    
                    # Генерируем новый short_id для этого пользователя
                    short_id = generate_short_id(6)
                    
                    # Так как мы убрали UNIQUE с unique_name и file_hash, 
                    # конфликт может быть только по short_id (крайне редко).
                    # Делаем простую попытку вставки.
                    try:
                        insert_file(short_id, unique_name, file.filename, file_hash, file_size, owner_id=current_user_id)
                    except sqlite3.IntegrityError:
                        # Если short_id совпал (невероятно), пробуем еще раз
                        while True:
                            short_id = generate_short_id(6)
                            try:
                                insert_file(short_id, unique_name, file.filename, file_hash, file_size, owner_id=current_user_id)
                                break
                            except sqlite3.IntegrityError:
                                continue

                    url = url_for('download_short', short_id=short_id, _external=True)
                    
                    print(f"[{time.time()}] Дубликат создан для другого пользователя. ShortID: {short_id}")

                    return jsonify({
                        'url': url, 
                        'success': True,
                        'file_data': {
                            'short_id': short_id,
                            'filename': file.filename,
                            'size': format_file_size(file_size),
                            'date': datetime.now().strftime('%Y-%m-%d'),
                            'downloads': 0,
                            'url': url
                        }
                    }), 200

            # --- Если файла нет в БД вообще ---
            print(f"[{time.time()}] Файл новый, сохраняю на диск...")
            ext = os.path.splitext(file.filename)[1]
            unique_name = f"{uuid.uuid4().hex}{ext}"
            filepath = os.path.join(UPLOAD_FOLDER, unique_name)
            
            t4 = time.time()
            file.save(filepath)
            print(f"[{time.time()}] Сохранение на диск за {time.time() - t4:.2f} сек")
            
            file_size = os.path.getsize(filepath)
            
            t5 = time.time()
            while True:
                short_id = generate_short_id(6)
                try:
                    insert_file(short_id, unique_name, file.filename, file_hash, file_size, owner_id=current_user_id)
                    break
                except sqlite3.IntegrityError:
                    continue 
            print(f"[{time.time()}] Запись в БД за {time.time() - t5:.2f} сек")

            url = url_for('download_short', short_id=short_id, _external=True)
            
            print(f"[{time.time()}] ЗАГРУЗКА ЗАВЕРШЕНА. Всего: {time.time() - start_time:.2f} сек")
            
            return jsonify({
                'url': url, 
                'success': True,
                'file_data': {
                    'short_id': short_id,
                    'filename': file.filename,
                    'size': format_file_size(file_size),
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'downloads': 0,
                    'url': url
                }
            }), 200
            
        except Exception as e:
            print(f"Upload error: {e}")
            import traceback
            traceback.print_exc()
            if filepath and os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': 'Internal server error'}), 500

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