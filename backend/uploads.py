"""
Модуль для обработки загрузки файлов
"""
import os
import logging
from flask import request, jsonify, session
from werkzeug.utils import secure_filename
from backend.extensions import limiter    
from backend.utils import compute_file_hash 
from datetime import datetime

from .config import UPLOAD_FOLDER
from .database import get_file_by_hash, insert_file, get_unique_name_by_hash, get_file_by_hash_and_folder
from .utils import generate_short_id, format_file_size, compute_file_hash, safe_join_paths, validate_folder_path, get_or_create_correlation_id
from .config_constants import SHORT_ID_LENGTH, HASH_LENGTH, MAX_UPLOAD_ATTEMPTS, RATE_LIMIT_UPLOAD, RATE_LIMIT_CHECK_FILE


def register_upload_routes(app):
    logger = logging.getLogger(__name__)
    client_logger = logging.getLogger('client_frontend')
        
    def error_response(message, status_code, correlation_id=None):
        from flask import jsonify, make_response
        
        if not correlation_id:
            correlation_id = get_or_create_correlation_id()
        
        response_data = {
            'error': True,
            'message': message,
            'correlation_id': correlation_id,
            'timestamp': datetime.now().isoformat()
        }
        
        response = make_response(jsonify(response_data), status_code)
        response.headers['Content-Type'] = 'application/json; charset=utf-8'
        return response

    # --- ПРОВЕРКА СУЩЕСТВОВАНИЯ ФАЙЛА ---
        # --- ПРОВЕРКА СУЩЕСТВОВАНИЯ ФАЙЛА ---
        # --- ПРОВЕРКА СУЩЕСТВОВАНИЯ ФАЙЛА ---
    @app.route('/check', methods=['GET'])
    @limiter.limit("30/minute")
    def check_file_exists():
        from flask import Response
        import json
        
        correlation_id = None
        try:
            correlation_id = get_or_create_correlation_id()
            
            user_id = session.get('user_id')
            file_hash = request.args.get('hash')
            folder_path = request.args.get('folder_path', '')
            
            logger.info(f"[CHECK DEBUG] Received - hash: {file_hash[:20] if file_hash else 'None'}..., folder_path: '{folder_path}' | CorrelationID: {correlation_id}")
            
            # ВАЛИДАЦИЯ folder_path
            try:
                folder_path = validate_folder_path(folder_path)
                logger.info(f"[CHECK DEBUG] Validated folder_path: '{folder_path}'")
            except ValueError as e:
                logger.warning(f"[CHECK] Invalid folder path: {e} | CorrelationID: {correlation_id}")
                return error_response(f'Invalid folder path: {str(e)}', 400, correlation_id)
            
            if not file_hash or len(file_hash) != HASH_LENGTH:
                return error_response('Invalid hash', 400, correlation_id)
            
            if not user_id:
                return error_response('Требуется авторизация', 401, correlation_id)
            
            existing = get_file_by_hash_and_folder(file_hash, user_id, folder_path) if folder_path else get_file_by_hash(file_hash)
                     
            if existing and existing.get('owner_id') == user_id:
                response_data = {
                    'exists': True,
                    'owned': True,
                    'short_id': existing['short_id'],
                    'url': f"/d/{existing['short_id']}"
                }
                from flask import make_response
                response = make_response(jsonify(response_data))
                response.headers['Content-Type'] = 'application/json; charset=utf-8'
                return response
            elif existing:
                response_data = {
                    'exists': True,
                    'owned': False
                }
                from flask import make_response
                response = make_response(jsonify(response_data))
                response.headers['Content-Type'] = 'application/json; charset=utf-8'
                return response
            else:
                response_data = {'exists': False}
                from flask import make_response
                response = make_response(jsonify(response_data))
                response.headers['Content-Type'] = 'application/json; charset=utf-8'
                return response
                
        except Exception as e:
            import traceback
            tb_str = traceback.format_exc()
            logger.error(f"[CHECK] Error: {str(e)} | Type: {type(e).__name__} | Traceback: {tb_str} | CorrelationID: {correlation_id}")
            return error_response(f'Internal server error: {str(e)}', 500, correlation_id)

        # --- ЗАГРУЗКА ФАЙЛА ---
    @app.route('/upload', methods=['POST'])
    @limiter.limit("1000/minute") 
    def upload_file():
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            user_id = session.get('user_id')
            if not user_id:
                return error_response('Требуется авторизация', 401, correlation_id)
            
            if 'file' not in request.files:
                return error_response('No file part', 400, correlation_id)
            
            file = request.files['file']
            if file.filename == '':
                return error_response('No selected file', 400, correlation_id)
            
            file_hash = request.form.get('hash')
            folder_path = request.form.get('folder_path', '')
            
            logger.info(f"[UPLOAD DEBUG] Received - hash: {file_hash[:20] if file_hash else 'None'}..., folder_path: '{folder_path}', filename: {file.filename} | CorrelationID: {correlation_id}")
            
            # ВАЛИДАЦИЯ folder_path
            try:
                folder_path = validate_folder_path(folder_path)
                logger.info(f"[UPLOAD DEBUG] Validated folder_path: '{folder_path}'")
            except ValueError as e:
                logger.warning(f"[UPLOAD] Invalid folder path: {e} | CorrelationID: {correlation_id}")
                return error_response(f'Invalid folder path: {str(e)}', 400, correlation_id)
            
            if not file_hash or len(file_hash) != HASH_LENGTH:
                return error_response('Invalid hash', 400, correlation_id)
            
            # Проверяем существует ли уже такой файл у этого пользователя
            existing = get_file_by_hash_and_folder(file_hash, user_id, folder_path or '')
                        
            if existing and existing.get('owner_id') == user_id:
                logger.info(f"[UPLOAD] File already exists for user {user_id}: {file.filename} | CorrelationID: {correlation_id}")
                return jsonify({
                    'success': True,
                    'message': 'Файл уже загружен',
                    'file_data': {
                        'short_id': existing['short_id'],
                        'filename': existing['original_filename'],
                        'size': format_file_size(existing['file_size']),
                        'date': existing['upload_date'][:10],
                        'downloads': existing['download_count'],
                        'url': f"/d/{existing['short_id']}"
                    }
                })
            
            # Генерируем уникальное имя и short_id
            short_id = generate_short_id(SHORT_ID_LENGTH)
            
            # ВАЖНО: Используем только имя файла (без пути) для unique_name
            # Путь к папке хранится отдельно в поле folder_path в БД
            base_filename = os.path.basename(file.filename)
            unique_name = f"{short_id}_{base_filename}"
            
            logger.info(f"[UPLOAD DEBUG] Generated - short_id: {short_id}, base_filename: {base_filename}, unique_name: {unique_name}")
            
            # Сохраняем файл
            filepath = safe_join_paths(UPLOAD_FOLDER, unique_name)
            logger.info(f"[UPLOAD DEBUG] Saving to: {filepath}")
            
            file.save(filepath)
            logger.info(f"[UPLOAD DEBUG] File saved successfully")
            
            # Получаем размер файла
            file_size = os.path.getsize(filepath)
            logger.info(f"[UPLOAD DEBUG] File size: {file_size}")
            
            # Записываем в БД
            logger.info(f"[UPLOAD DEBUG] Inserting into DB - owner_id: {user_id}, folder_path: '{folder_path}'")
            insert_file(short_id, unique_name, file.filename, file_hash, file_size, user_id, folder_path)
            logger.info(f"[UPLOAD DEBUG] DB insert successful")
            
            logger.info(f"[UPLOAD] File uploaded: {file.filename} -> {short_id} | User: {user_id} | Folder: {folder_path} | CorrelationID: {correlation_id}")
            
            response_data = {
                'success': True,
                'message': 'File uploaded successfully',
                'file_data': {
                    'short_id': short_id,
                    'filename': file.filename,
                    'size': format_file_size(file_size),
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'downloads': 0,
                    'url': f"/d/{short_id}",
                    'folder_path': folder_path
                }
            }
            
            logger.info(f"[UPLOAD DEBUG] Returning JSON response")
            
            # Настраиваем Flask для корректной работы с UTF-8
            app.config['JSON_AS_ASCII'] = False
            
            from flask import make_response
            response = make_response(jsonify(response_data))
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
            return response
            
        except Exception as e:
            import traceback
            tb_str = traceback.format_exc()
            logger.error(f"[UPLOAD] Error: {str(e)} | Type: {type(e).__name__} | Traceback: {tb_str} | CorrelationID: {correlation_id}")
            return error_response(f'Upload failed: {str(e)}', 500, correlation_id)