# backend/downloads.py
"""
Модуль для обработки скачивания файлов
"""
import os
import logging
import zipfile
import io
from flask import request, send_file, send_from_directory, session, abort
from backend.extensions import limiter
from datetime import datetime

from .config import UPLOAD_FOLDER
from .database import get_file_by_short_id, increment_download_count, get_files_in_folder
from .utils import safe_join_paths, validate_folder_path


def register_download_routes(app):
    logger = logging.getLogger(__name__)
    
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
            
            # ВАЛИДАЦИЯ folder_path
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

            memory_file = io.BytesIO()
            
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for file_info in files_in_folder:
                    try:
                        unique_name = file_info['unique_name']
                        original_name = file_info['original_filename']
                        
                        source_path = safe_join_paths(UPLOAD_FOLDER, unique_name)
                        
                        if not os.path.exists(source_path):
                            logger.warning(f"[ZIP] File not found on disk: {unique_name}")
                            continue
                        
                        relative_path = file_info.get('folder_path', '')
                        if relative_path:
                            archive_name = os.path.join(relative_path, original_name)
                        else:
                            archive_name = original_name
                        
                        zf.write(source_path, archive_name)
                        
                    except Exception as e:
                        logger.error(f"[ZIP] Error adding file {file_info.get('original_filename')}: {e}")
                        continue

            memory_file.seek(0)
            
            folder_name = os.path.basename(folder_path)
            zip_filename = f"{folder_name}.zip"
            
            logger.info(f"[ZIP] Successfully created archive for folder: {folder_path} | CorrelationID: {correlation_id}")
            
            return send_file(
                memory_file,
                mimetype='application/zip',
                as_attachment=True,
                download_name=zip_filename
            )

        except Exception as e:
            import traceback
            logger.error(f"[ZIP] Critical error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to create archive', 500, correlation_id)



    # --- СКАЧИВАНИЕ ПО SHORT_ID ---
    @app.route('/d/<short_id>')
    def download_by_short_id(short_id):
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            file_data = get_file_by_short_id(short_id)
            if not file_data:
                abort(404)
            
            unique_name = file_data['unique_name']
            original_filename = file_data['original_filename']
            
            increment_download_count(short_id)
            
            logger.info(f"[DOWNLOAD] File downloaded: {original_filename} ({short_id}) | CorrelationID: {correlation_id}")
            
            return send_from_directory(UPLOAD_FOLDER, unique_name, as_attachment=True, download_name=original_filename)
            
        except Exception as e:
            logger.error(f"[DOWNLOAD] Error: {str(e)} | CorrelationID: {correlation_id}")
            abort(500)

    # --- СКАЧИВАНИЕ ПО UNIQUE_NAME ---
    @app.route('/downloads/<unique_name>/<original_filename>')
    def download_by_unique_name(unique_name, original_filename):
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            logger.info(f"[DOWNLOAD] Direct download: {original_filename} | CorrelationID: {correlation_id}")
            return send_from_directory(UPLOAD_FOLDER, unique_name, as_attachment=True, download_name=original_filename)
            
        except Exception as e:
            logger.error(f"[DOWNLOAD] Error: {str(e)} | CorrelationID: {correlation_id}")
            abort(500)