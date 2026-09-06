"""
Модуль для обработки скачивания файлов
"""
import os
import logging
import zipfile
import tempfile
from flask import request, send_file, send_from_directory, session, abort, jsonify, after_this_request
from backend.extensions import limiter
from datetime import datetime

from .config import UPLOAD_FOLDER
from .database import get_file_by_short_id, increment_download_count, get_files_in_folder
from .utils import safe_join_paths, validate_folder_path


def register_download_routes(app):
    logger = logging.getLogger(__name__)
    
    def error_response(message, status_code, correlation_id=None):
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
    @limiter.limit("5/minute")
    def download_folder_zip():
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            user_id = session.get('user_id')
            folder_path = request.args.get('path')
            
            if not folder_path:
                return error_response('Missing folder path', 400, correlation_id)
            
            try:
                folder_path = validate_folder_path(folder_path)
            except ValueError as e:
                logger.warning(f"[ZIP DOWNLOAD] Invalid folder path: {e} | CorrelationID: {correlation_id}")
                return error_response('Invalid folder path', 400, correlation_id)
            
            if not user_id:
                return error_response('Требуется авторизация', 401, correlation_id)

            logger.info(f"[ZIP] Request to download folder: '{folder_path}' for user: {user_id} | CorrelationID: {correlation_id}")

            files_in_folder = get_files_in_folder(user_id, folder_path, include_subfolders=True)
            
            if not files_in_folder:
                return error_response('Folder is empty', 404, correlation_id)

            # 🔴 ИСПРАВЛЕНИЕ ВЫСОКОГО ПРИОРИТЕТА №8: 
            # Используем временный файл вместо io.BytesIO, чтобы избежать 
            # потребления всей оперативной памяти (RSS) для больших папок.
            temp_zip = tempfile.NamedTemporaryFile(suffix='.zip', delete=False)
            temp_zip_path = temp_zip.name
            temp_zip.close()  # Закрываем, чтобы zipfile мог открыть его для записи

            # Регистрируем удаление временного файла после отправки ответа клиенту
            @after_this_request
            def cleanup_zip(response):
                try:
                    if os.path.exists(temp_zip_path):
                        os.remove(temp_zip_path)
                except Exception as e:
                    logger.error(f"[ZIP] Failed to delete temp file {temp_zip_path}: {e}")
                return response

            try:
                with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                    for file_info in files_in_folder:
                        try:
                            file_id = file_info.get('id')
                            unique_name = file_info['unique_name']
                            original_name = file_info['original_filename']
                            
                            source_path = safe_join_paths(UPLOAD_FOLDER, unique_name)
                            
                            if not os.path.exists(source_path):
                                # 🔴 ИСПРАВЛЕНИЕ: не логируем unique_name, используем file_id
                                logger.warning(f"[ZIP] File not found on disk, file_id: {file_id}")
                                continue
                            
                            relative_path = file_info.get('folder_path', '')
                            
                            # 🔴 ИСПРАВЛЕНИЕ ВЫСОКОГО ПРИОРИТЕТА №8 (Zip-slip): 
                            # Нормализуем путь и проверяем, что он не пытается выйти за пределы архива
                            archive_name = os.path.normpath(os.path.join(relative_path, original_name))
                            if archive_name.startswith('..') or os.path.isabs(archive_name):
                                logger.warning(f"[ZIP] Zip-slip attempt blocked for file_id: {file_id}")
                                continue
                            
                            zf.write(source_path, archive_name)
                            
                        except Exception as e:
                            logger.error(f"[ZIP] Error adding file_id {file_info.get('id')}: {e}")
                            continue

                folder_name = os.path.basename(folder_path) or "download"
                zip_filename = f"{folder_name}.zip"
                
                logger.info(f"[ZIP] Successfully created archive for folder: {folder_path} | CorrelationID: {correlation_id}")
                
                return send_file(
                    temp_zip_path,
                    mimetype='application/zip',
                    as_attachment=True,
                    download_name=zip_filename
                )
            except Exception as e:
                # Если произошла ошибка до send_file, удаляем файл вручную
                if os.path.exists(temp_zip_path):
                    os.remove(temp_zip_path)
                raise

        except Exception as e:
            import traceback
            logger.error(f"[ZIP] Critical error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to create archive', 500, correlation_id)

        # --- СКАЧИВАНИЕ ПО SHORT_ID ---
        # --- СКАЧИВАНИЕ ПО SHORT_ID ---
        # --- СКАЧИВАНИЕ ПО SHORT_ID ---
    @app.route('/d/<short_id>', methods=['GET'])
    @limiter.limit("60/minute")
    def download_by_short_id(short_id):
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id, safe_join_paths
            correlation_id = get_or_create_correlation_id()
            
            file_data = get_file_by_short_id(short_id)
            if not file_data:
                logger.warning(f"[DOWNLOAD] File not found in DB: {short_id} | CorrelationID: {correlation_id}")
                abort(404)
            
            unique_name = file_data.get('unique_name')
            original_filename = file_data.get('original_filename', 'downloaded_file')
            
            if not unique_name:
                logger.error(f"[DOWNLOAD] DB record missing unique_name for short_id: {short_id} | CorrelationID: {correlation_id}")
                abort(500)

            # 🔴 ПРОВЕРКА: Существует ли файл физически на диске?
            file_path = safe_join_paths(UPLOAD_FOLDER, unique_name)
            logger.info(f"[DEBUG] Ожидаемый путь к файлу: {os.path.abspath(file_path)}")
            if not os.path.exists(file_path):
                logger.warning(f"[DOWNLOAD] File missing on disk for short_id: {short_id} (Expected path: {file_path}) | CorrelationID: {correlation_id}")
                abort(404) # Возвращаем честные 404, а не 500

            # Пытаемся увеличить счётчик, но не ломаем скачивание, если это не удалось
            try:
                increment_download_count(short_id)
            except Exception as db_err:
                logger.warning(f"[DOWNLOAD] Failed to increment download count: {db_err}")

            logger.info(f"[DOWNLOAD] File downloaded: {original_filename} ({short_id}) | CorrelationID: {correlation_id}")
            
            # 🔴 ИСПРАВЛЕНИЕ: Используем send_file с абсолютным путём вместо send_from_directory.
            # Это исключает ложные 404 из-за строгих проверок safe_join внутри send_from_directory,
            # так как мы уже безопасно построили и проверили путь выше.
            return send_file(
                file_path,
                as_attachment=True,
                download_name=original_filename,
                mimetype='application/octet-stream' # Универсальный MIME-тип для скачивания
            )
            
        except Exception as e:
            import traceback
            logger.error(f"[DOWNLOAD] Critical Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            abort(500)