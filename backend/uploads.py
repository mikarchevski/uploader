# backend/uploads.py
"""
Модуль для обработки загрузки файлов
"""
import os
import logging
from flask import request, jsonify, session
from datetime import datetime

from .config import UPLOAD_FOLDER
from .database import get_file_by_hash, insert_file, get_unique_name_by_hash
from .utils import generate_short_id, format_file_size, compute_file_hash, safe_join_paths
from .config_constants import SHORT_ID_LENGTH, HASH_LENGTH, MAX_UPLOAD_ATTEMPTS, RATE_LIMIT_UPLOAD, RATE_LIMIT_CHECK_FILE


def register_upload_routes(app):
    logger = logging.getLogger(__name__)
    client_logger = logging.getLogger('client_frontend')
    
    limiter = app.extensions.get('limiter')
    
    def rate_limit(limit_string):
        if limiter:
            return limiter.limit(limit_string)
        return lambda f: f
    
    def error_response(message, status_code, correlation_id=None):
        from flask import jsonify
        from backend.utils import get_or_create_correlation_id
        
        if not correlation_id:
            correlation_id = get_or_create_correlation_id()
        
        return jsonify({
            'error': True,
            'message': message,
            'correlation_id': correlation_id,
            'timestamp': datetime.now().isoformat()
        }), status_code

    # --- ПРОВЕРКА СУЩЕСТВОВАНИЯ ФАЙЛА ---
    @app.route('/check', methods=['GET'])
    @rate_limit(RATE_LIMIT_CHECK_FILE)
    def check_file_exists():
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            user_id = session.get('user_id')
            file_hash = request.args.get('hash')
            folder_path = request.args.get('folder', '')
            
            if not file_hash or len(file_hash) != HASH_LENGTH:
                return error_response('Invalid hash', 400, correlation_id)
            
            if not user_id:
                return error_response('Требуется авторизация', 401, correlation_id)
            
            existing = get_file_by_hash_and_folder(file_hash, folder_path) if folder_path else get_file_by_hash(file_hash)
            
            if existing and existing.get('owner_id') == user_id:
                return jsonify({
                    'exists': True,
                    'owned': True,
                    'short_id': existing['short_id'],
                    'url': f"/d/{existing['short_id']}"
                })
            elif existing:
                return jsonify({
                    'exists': True,
                    'owned': False
                })
            else:
                return jsonify({'exists': False})
                
        except Exception as e:
            logger.error(f"[CHECK] Error: {str(e)} | CorrelationID: {correlation_id}")
            return error_response('Internal server error', 500, correlation_id)

    # --- ЗАГРУЗКА ФАЙЛА ---
    @app.route('/upload', methods=['POST'])
    @rate_limit(RATE_LIMIT_UPLOAD)
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
            
            if not file_hash or len(file_hash) != HASH_LENGTH:
                return error_response('Invalid hash', 400, correlation_id)
            
            # Проверяем существует ли уже такой файл у этого пользователя
            existing = get_file_by_hash_and_folder(file_hash, folder_path) if folder_path else get_file_by_hash(file_hash)
            
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
            unique_name = f"{short_id}_{file.filename}"
            
            # Сохраняем файл
            filepath = safe_join_paths(UPLOAD_FOLDER, unique_name)
            file.save(filepath)
            
            # Получаем размер файла
            file_size = os.path.getsize(filepath)
            
            # Записываем в БД
            insert_file(short_id, unique_name, file.filename, file_hash, file_size, user_id, folder_path)
            
            logger.info(f"[UPLOAD] File uploaded: {file.filename} -> {short_id} | User: {user_id} | CorrelationID: {correlation_id}")
            
            return jsonify({
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
            })
            
        except Exception as e:
            import traceback
            logger.error(f"[UPLOAD] Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Upload failed', 500, correlation_id)