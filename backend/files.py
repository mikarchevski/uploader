# backend/files.py
import os
import sqlite3
import logging
import zipfile
import io
from flask import request, jsonify, send_file, send_from_directory, session, abort
from datetime import datetime
import uuid


from .config import UPLOAD_FOLDER, DB_PATH
from .database import (
    get_file_by_hash, 
    get_file_by_short_id, 
    insert_file, 
    increment_download_count, 
    list_files_by_user,
    delete_file_by_short_id,
    get_files_by_hash,
    get_unique_name_by_hash,
    # Новые helper-функции
    get_files_in_folder,
    get_file_by_hash_and_folder,
    delete_files_in_folder,
    get_files_paginated
)
from .utils import generate_short_id, format_file_size, compute_file_hash, safe_join_paths, validate_path_safety
from .preview import get_preview_data
from .config_constants import (
    SHORT_ID_LENGTH,
    HASH_LENGTH,
    MAX_UPLOAD_ATTEMPTS,
    DEFAULT_PAGE_SIZE,
    PREVIEW_CACHE_MAX_AGE,
    RATE_LIMIT_UPLOAD,
    RATE_LIMIT_CHECK_FILE,
    RATE_LIMIT_PREVIEW,
    RATE_LIMIT_LIST_FILES,
    RATE_LIMIT_DELETE,
    RATE_LIMIT_BULK_DELETE,
    RATE_LIMIT_DOWNLOAD_FOLDER,
    ALLOWED_SORT_FIELDS,
    DEFAULT_SORT_FIELD,
    DEFAULT_SORT_ORDER
)


# ... existing code ...

def register_file_routes(app):
    logger = logging.getLogger(__name__)
    client_logger = logging.getLogger('client_frontend') 
    
    limiter = app.extensions.get('limiter')
    
    def rate_limit(limit_string):
        if limiter:
            return limiter.limit(limit_string)
        return lambda f: f
    
    def error_response(message, status_code, correlation_id=None):
        """
        Создаёт стандартизированный ответ об ошибке с correlation ID.
        
        Args:
            message: Сообщение об ошибке для клиента
            status_code: HTTP статус код
            correlation_id: ID для отслеживания (опционально)
        
        Returns:
            tuple: (jsonify response, status_code)
        """
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

    # --- СКАЧИВАНИЕ ПАПКИ КАК ZIP ---
    @app.route('/api/download/folder', methods=['GET'])
    @rate_limit(RATE_LIMIT_DOWNLOAD_FOLDER)
    def download_folder_zip():
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            user_id = session.get('user_id')
            folder_path = request.args.get('path')
            
            logger.info(f"[ZIP] Request to download folder: '{folder_path}' for user: {user_id} | CorrelationID: {correlation_id}")

            if not folder_path or not user_id:
                logger.warning(f"[ZIP] Invalid request: missing path or user_id | CorrelationID: {correlation_id}")
                return error_response('Invalid request: missing path or authentication', 400, correlation_id)

            # ЗАЩИТА ОТ PATH TRAVERSAL: валидируем folder_path
            try:
                validate_path_safety(folder_path, UPLOAD_FOLDER)
            except ValueError as e:
                logger.warning(f"[ZIP] Path traversal attempt blocked: {e} | CorrelationID: {correlation_id}")
                return error_response('Invalid folder path', 400, correlation_id)

            # Используем новую helper-функцию
            files_to_zip = get_files_in_folder(user_id, folder_path, include_subfolders=True)

            logger.info(f"[ZIP] Found {len(files_to_zip)} files in folder '{folder_path}' | CorrelationID: {correlation_id}")

            if not files_to_zip:
                return error_response('Folder is empty or not found', 404, correlation_id)

            memory_file = io.BytesIO()
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for file_data in files_to_zip:
                    unique_name = file_data['unique_name']
                    original_filename = file_data['original_filename']
                    
                    # БЕЗОПАСНОЕ объединение путей
                    try:
                        filepath = safe_join_paths(UPLOAD_FOLDER, unique_name)
                    except ValueError as e:
                        logger.error(f"[ZIP] Path traversal blocked for file {unique_name}: {e} | CorrelationID: {correlation_id}")
                        continue  # Пропускаем опасные файлы
                    
                    if os.path.exists(filepath):
                        try:
                            zf.write(filepath, original_filename)
                            logger.debug(f"[ZIP] Added file: {original_filename}")
                        except Exception as e:
                            logger.error(f"[ZIP] Failed to add file {original_filename}: {e} | CorrelationID: {correlation_id}")
                    else:
                        logger.warning(f"[ZIP] Physical file not found: {filepath} | CorrelationID: {correlation_id}")

            memory_file.seek(0)
            
            safe_folder_name = folder_path.replace('/', '_').replace('\\', '_')
            archive_name = f"{safe_folder_name}.zip"
            
            logger.info(f"[ZIP] Sending archive: {archive_name} | CorrelationID: {correlation_id}")
            
            return send_file(
                memory_file,
                mimetype='application/zip',
                as_attachment=True,
                download_name=archive_name
            )

        except Exception as e:
            import traceback
            error_details = f"{str(e)}\n{traceback.format_exc()}"
            logger.error(f"[ZIP] Critical Error: {error_details} | CorrelationID: {correlation_id}")
            
            # Возвращаем безопасное сообщение клиенту
            return error_response(
                f'Internal Server Error while creating zip (Reference ID: {correlation_id})',
                500,
                correlation_id
            )

    # --- ПРЕВЬЮ ---
    @app.route('/api/preview/<short_id>')
    @rate_limit(RATE_LIMIT_PREVIEW)
    def get_file_preview(short_id):
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            file_data = get_file_by_short_id(short_id)
            if not file_data:
                return error_response('File not found', 404, correlation_id)
            
            # БЕЗОПАСНОЕ получение пути к файлу
            try:
                filepath = safe_join_paths(UPLOAD_FOLDER, file_data['unique_name'])
            except ValueError as e:
                logger.error(f"[PREVIEW] Path traversal blocked: {e} | CorrelationID: {correlation_id}")
                return error_response('Invalid file path', 400, correlation_id)
            
            ext = os.path.splitext(file_data['original_filename'])[1].lower()
            
            if not os.path.exists(filepath):
                return jsonify({'has_preview': False})
                
            response = jsonify(get_preview_data(filepath, ext))
            response.headers['Cache-Control'] = 'public, max-age=86400'
            return response
        except Exception as e:
            import traceback
            logger.error(f"[PREVIEW] Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to generate preview', 500, correlation_id)

    # --- СПИСОК ФАЙЛОВ ---
    @app.route('/api/files', methods=['GET'])
    @rate_limit(RATE_LIMIT_LIST_FILES)
    def list_files_api():
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            user_id = session.get('user_id')
            
            page = request.args.get('page', 1, type=int)
            per_page = request.args.get('per_page', 20, type=int)
            sort_field = request.args.get('sort', 'upload_date')
            sort_order = request.args.get('order', 'DESC')
            folder_path = request.args.get('folder', None)
            
            logger.debug(f"[API] Listing files: page={page}, per_page={per_page}, sort={sort_field} | CorrelationID: {correlation_id}")
            
            # Используем helper-функцию с пагинацией
            files, total_count = get_files_paginated(
                user_id=user_id,
                page=page,
                per_page=per_page,
                sort_field=sort_field,
                sort_order=sort_order,
                folder_path=folder_path
            )
            
            file_list = []
            for f in files:
                file_list.append({
                    'short_id': f['short_id'],
                    'filename': f['original_filename'],
                    'size': format_file_size(f['file_size']),
                    'date': f['upload_date'][:10],
                    'downloads': f['download_count'],
                    'url': f"https://{request.host}/d/{f['short_id']}",
                    'folder_path': f.get('folder_path', '') or ''
                })
                
            return jsonify({
                'files': file_list,
                'total': total_count,
                'has_more': (page * per_page) < total_count
            })
        except Exception as e:
            import traceback
            logger.error(f"[API] Error listing files: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to retrieve file list', 500, correlation_id)

    # --- ПРОВЕРКА ФАЙЛА ---
        # --- ПРОВЕРКА ФАЙЛА ---
    @app.route('/check', methods=['GET'])
    @rate_limit(RATE_LIMIT_CHECK_FILE)
    def check_file():
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            file_hash = request.args.get('h')
            folder_path = request.args.get('folder_path', '')
            current_user_id = session.get('user_id')
            
            logger.info(f"[CHECK] Hash: {file_hash[:10] if file_hash else 'None'}... Folder: '{folder_path}' User: {current_user_id} | CorrelationID: {correlation_id}")
            
            if not file_hash or len(file_hash) != 64:
                return jsonify({'exists': False}), 200

            # Используем helper-функцию
            existing = get_file_by_hash_and_folder(file_hash, current_user_id, folder_path)

            if existing:
                url = f"https://{request.host}/d/{existing['short_id']}"
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
                        'url': url,
                        'folder_path': existing.get('folder_path', '')
                    }
                }), 200
            
            existing_other = get_file_by_hash(file_hash)
            if existing_other:
                return jsonify({'exists': True, 'owned': False}), 200
            
            return jsonify({'exists': False}), 200
        except Exception as e:
            import traceback
            logger.error(f"[CHECK] Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('File check failed', 500, correlation_id)

    # --- ЗАГРУЗКА ФАЙЛА ---
    @app.route('/upload', methods=['POST'])
    @rate_limit(RATE_LIMIT_UPLOAD)
    def upload_file():
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            current_user_id = session.get('user_id')
            
            if not current_user_id:
                return error_response('Not authorized', 401, correlation_id)

            if 'file' not in request.files:
                return error_response('No file provided', 400, correlation_id)
            
            file = request.files['file']
            if file.filename == '':
                return error_response('Empty filename', 400, correlation_id)

            folder_path = request.form.get('folder_path', '')
            
            logger.info(f"[UPLOAD START] User: {current_user_id} | File: {file.filename} | Folder: {folder_path} | CorrelationID: {correlation_id}")

            file_hash = request.form.get('hash')
            if not file_hash or len(file_hash) != 64:
                file_hash = compute_file_hash(file)
                file.seek(0)
            
            # Используем helper-функцию
            existing_owned_file = get_file_by_hash_and_folder(file_hash, current_user_id, folder_path)

            if existing_owned_file:
                url = f"https://{request.host}/d/{existing_owned_file['short_id']}"
                
                logger.info(f"[UPLOAD SKIP] User: {current_user_id} | File: {file.filename} (Already exists) | CorrelationID: {correlation_id}")
                client_logger.info(f"[UPLOAD SKIP] User: {current_user_id} | File: {file.filename}")

                return jsonify({
                    'success': True,
                    'message': 'Файл уже загружен',
                    'file_data': {
                        'short_id': existing_owned_file['short_id'],
                        'filename': existing_owned_file['original_filename'],
                        'size': format_file_size(existing_owned_file['file_size']),
                        'date': existing_owned_file['upload_date'][:10],
                        'downloads': existing_owned_file.get('download_count', 0),
                        'url': url,
                        'folder_path': existing_owned_file.get('folder_path', '')
                    }
                }), 200

            existing_other = get_file_by_hash(file_hash)
            
            if existing_other:
                unique_name = existing_other['unique_name']
                file_size = existing_other['file_size']
                
                max_attempts = 10
                new_short_id = None
                
                for attempt in range(max_attempts):
                    candidate_id = generate_short_id(6)
                    if not get_file_by_short_id(candidate_id):
                        new_short_id = candidate_id
                        break
                
                if not new_short_id:
                    return error_response('Could not generate unique ID', 500, correlation_id)
                
                try:
                    insert_file(new_short_id, unique_name, file.filename, file_hash, file_size, owner_id=current_user_id, folder_path=folder_path)
                    
                    log_msg = f"[UPLOAD LINK] User: {current_user_id} | File: {file.filename} | New ID: {new_short_id} | CorrelationID: {correlation_id}"
                    logger.info(log_msg)
                    client_logger.info(log_msg)
                    
                    return jsonify({
                        'success': True,
                        'file_data': {
                            'short_id': new_short_id,
                            'filename': file.filename,
                            'size': format_file_size(file_size),
                            'date': datetime.now().strftime('%Y-%m-%d'),
                            'downloads': 0,
                            'url': f"https://{request.host}/d/{new_short_id}",
                            'folder_path': folder_path
                        }
                    }), 200
                except Exception as e:
                    logger.error(f"[UPLOAD] DB INSERT FAILED: {e} | CorrelationID: {correlation_id}")
                    return error_response('Database error during upload', 500, correlation_id)

            max_attempts = 10
            short_id = None
            for attempt in range(max_attempts):
                candidate_id = generate_short_id(6)
                if not get_file_by_short_id(candidate_id):
                    short_id = candidate_id
                    break
            
            if not short_id:
                return error_response('Could not generate unique ID', 500, correlation_id)
            
            ext = os.path.splitext(file.filename)[1]
            unique_name = f"{uuid.uuid4().hex}{ext}"
            filepath = os.path.join(UPLOAD_FOLDER, unique_name)
            
            file.save(filepath)
            file_size = os.path.getsize(filepath)
            
            insert_file(short_id, unique_name, file.filename, file_hash, file_size, owner_id=current_user_id, folder_path=folder_path)
            
            log_msg = f"[UPLOAD NEW] User: {current_user_id} | File: {file.filename} | Size: {file_size} bytes | ID: {short_id} | CorrelationID: {correlation_id}"
            logger.info(log_msg)
            client_logger.info(log_msg)
            
            return jsonify({
                'success': True,
                'file_data': {
                    'short_id': short_id,
                    'filename': file.filename,
                    'size': format_file_size(file_size),
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'downloads': 0,
                    'url': f"https://{request.host}/d/{short_id}",
                    'folder_path': folder_path
                }
            }), 200

        except Exception as e:
            import traceback
            logger.error(f"[UPLOAD] Critical Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Internal Server Error during upload', 500, correlation_id)

    # --- УДАЛЕНИЕ ОДНОГО ФАЙЛА ---
    @app.route('/api/delete/<short_id>', methods=['DELETE'])
    @rate_limit(RATE_LIMIT_DELETE)
    def delete_file(short_id):
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            user_id = session.get('user_id')
            file_data = get_file_by_short_id(short_id)
            
            if not file_data:
                return error_response('File not found', 404, correlation_id)
            
            if file_data.get('owner_id') != user_id:
                return error_response('Access denied', 403, correlation_id)
            
            file_hash = file_data['file_hash']
            unique_name = file_data['unique_name']
            
            # БЕЗОПАСНОЕ получение пути к файлу
            try:
                filepath = safe_join_paths(UPLOAD_FOLDER, unique_name)
            except ValueError as e:
                logger.error(f"[DELETE] Path traversal blocked: {e} | CorrelationID: {correlation_id}")
                return error_response('Invalid file path', 400, correlation_id)
            
            log_msg = f"[DELETE] User: {user_id} | File: {file_data['original_filename']} ({short_id}) | CorrelationID: {correlation_id}"
            logger.info(log_msg)
            client_logger.info(log_msg)

            delete_file_by_short_id(short_id)
            
            remaining_files = get_files_by_hash(file_hash)
            
            if len(remaining_files) == 0:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    logger.info(f"[DELETE] Physical file removed: {unique_name} | CorrelationID: {correlation_id}")
            else:
                logger.info(f"[DELETE] File still referenced by {len(remaining_files)} other records. Keeping physical file. | CorrelationID: {correlation_id}")
                
            return jsonify({'success': True}), 200
        except Exception as e:
            import traceback
            logger.error(f"[DELETE] Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to delete file', 500, correlation_id)

# ... existing code ...

    # --- МАССОВОЕ УДАЛЕНИЕ / УДАЛЕНИЕ ПАПОК ---
    @app.route('/api/delete/bulk', methods=['POST'])
    @rate_limit(RATE_LIMIT_BULK_DELETE)
    def delete_bulk_files():
        try:
            user_id = session.get('user_id')
            data = request.get_json()
            
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            deleted_ids = []
            
            if 'folder_path' in data:
                folder_path = data['folder_path']
                
                # ЗАЩИТА ОТ PATH TRAVERSAL
                try:
                    validate_path_safety(folder_path, UPLOAD_FOLDER)
                except ValueError as e:
                    logger.warning(f"[BULK DELETE] Path traversal attempt blocked: {e}")
                    return jsonify({'error': 'Invalid folder path'}), 400
                
                logger.info(f"[BULK DELETE] User: {user_id} | Folder: {folder_path}")
                client_logger.info(f"[BULK DELETE] User: {user_id} | Folder: {folder_path}")

                # Используем новую helper-функцию для удаления
                files_to_delete = delete_files_in_folder(user_id, folder_path, include_subfolders=True)
                
                logger.info(f"[BULK DELETE] Found {len(files_to_delete)} files to delete")
                
                for file_info in files_to_delete:
                    s_id = file_info['short_id']
                    f_hash = file_info['file_hash']
                    u_name = get_unique_name_by_hash(f_hash)
                    
                    if u_name:
                        # БЕЗОПАСНОЕ получение пути
                        try:
                            f_path = safe_join_paths(UPLOAD_FOLDER, u_name)
                        except ValueError as e:
                            logger.error(f"[BULK DELETE] Path traversal blocked: {e}")
                            continue
                        
                        remaining = get_files_by_hash(f_hash)
                        if len(remaining) == 0 and os.path.exists(f_path):
                            os.remove(f_path)
                            logger.debug(f"[BULK DELETE] Removed physical file: {u_name}")
                    
                    deleted_ids.append(s_id)
                        
            elif 'ids' in data:
                logger.info(f"[BULK DELETE] User: {user_id} | Count: {len(data['ids'])}")
                client_logger.info(f"[BULK DELETE] User: {user_id} | Count: {len(data['ids'])}")

                for s_id in data['ids']:
                    file_data = get_file_by_short_id(s_id)
                    if file_data and file_data.get('owner_id') == user_id:
                        f_hash = file_data['file_hash']
                        u_name = file_data['unique_name']
                        
                        # БЕЗОПАСНОЕ получение пути
                        try:
                            f_path = safe_join_paths(UPLOAD_FOLDER, u_name)
                        except ValueError as e:
                            logger.error(f"[BULK DELETE] Path traversal blocked: {e}")
                            continue
                        
                        delete_file_by_short_id(s_id)
                        deleted_ids.append(s_id)
                        
                        remaining = get_files_by_hash(f_hash)
                        if len(remaining) == 0 and os.path.exists(f_path):
                            os.remove(f_path)

            return jsonify({'success': True, 'deleted_ids': deleted_ids}), 200

        except Exception as e:
            logger.error(f"Error bulk deleting: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
    
    # --- СКАЧИВАНИЕ ---
    @app.route('/d/<short_id>')
    def download_short(short_id):
        try:
            file_data = get_file_by_short_id(short_id)
            if not file_data:
                logger.warning(f"[DOWNLOAD] File not found: {short_id}")
                return 'File not found', 404
            
            increment_download_count(short_id)
            
            user_id = session.get('user_id', 'Guest')
            log_msg = f"[DOWNLOAD] User: {user_id} | File: {file_data['original_filename']} ({short_id})"
            logger.info(log_msg)
            client_logger.info(log_msg)
            
            # БЕЗОПАСНОЕ получение пути к файлу
            try:
                filepath = safe_join_paths(UPLOAD_FOLDER, file_data['unique_name'])
            except ValueError as e:
                logger.error(f"[DOWNLOAD] Path traversal blocked: {e}")
                return 'Invalid file path', 400
            
            return send_file(filepath, as_attachment=True, download_name=file_data['original_filename'])
        except Exception as e:
            logger.error(f"[DOWNLOAD] Error: {e}")
            return str(e), 404

    @app.route('/downloads/<unique_name>/<original_filename>')
    def download_file(unique_name, original_filename):
        try:
            # ЗАЩИТА ОТ PATH TRAVERSAL: проверяем unique_name
            try:
                safe_path = safe_join_paths(UPLOAD_FOLDER, unique_name)
            except ValueError as e:
                logger.error(f"[DOWNLOAD] Path traversal attempt blocked: {e}")
                abort(400, "Invalid file path")
            
            return send_from_directory(UPLOAD_FOLDER, unique_name, as_attachment=True, download_name=original_filename)
        except Exception as e:
            return str(e), 404