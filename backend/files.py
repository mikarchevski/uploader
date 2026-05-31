# backend/files.py
import os
import sqlite3
import logging
from flask import request, jsonify, session
from datetime import datetime

from .config import UPLOAD_FOLDER, DB_PATH
from .database import (
    get_file_by_short_id, 
    delete_file_by_short_id,
    get_files_paginated
)
from .utils import format_file_size, safe_join_paths


def register_file_routes(app):
    """
    Регистрирует только роуты для списка файлов и удаления.
    Остальные роуты перенесены в отдельные модули:
    - uploads.py: /check, /upload
    - downloads.py: /api/download/folder, /d/<short_id>, /downloads/...
    - previews.py: /api/preview/..., /api/preview-image/..., /api/previews/batch
    """
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

    # --- СПИСОК ФАЙЛОВ ---
    @app.route('/api/files', methods=['GET'])
    @rate_limit("600 per minute")
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
            
            logger.debug(f"[API] Listing files: page={page}, per_page={per_page} | CorrelationID: {correlation_id}")
            
            files, total_count = get_files_paginated(
                user_id=user_id,
                page=page,
                per_page=per_page,
                sort_field=sort_field,
                sort_order=sort_order,
                folder_path=folder_path
            )
            
            formatted_files = []
            for f in files:
                formatted_files.append({
                    'short_id': f['short_id'],
                    'filename': f['original_filename'],
                    'size': format_file_size(f['file_size']),
                    'date': f['upload_date'][:10],
                    'downloads': f['download_count'],
                    'url': f"/d/{f['short_id']}",
                    'folder_path': f.get('folder_path', '')
                })
            
            response_data = {
                'files': formatted_files,
                'total': total_count,
                'page': page,
                'per_page': per_page,
                'pages': (total_count + per_page - 1) // per_page
            }
            
            return jsonify(response_data)
            
        except Exception as e:
            import traceback
            logger.error(f"[API] Error listing files: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to list files', 500, correlation_id)

    # --- УДАЛЕНИЕ ОДНОГО ФАЙЛА ---
    @app.route('/api/delete/<short_id>', methods=['DELETE'])
    @rate_limit("20 per minute")
    def delete_file(short_id):
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            user_id = session.get('user_id')
            if not user_id:
                return error_response('Требуется авторизация', 401, correlation_id)
            
            file_data = get_file_by_short_id(short_id)
            if not file_data:
                return error_response('File not found', 404, correlation_id)
            
            if file_data.get('owner_id') != user_id:
                logger.warning(f"[DELETE] Access denied: User {user_id} tried to delete file {short_id}")
                return error_response('Access denied', 403, correlation_id)
            
            try:
                filepath = safe_join_paths(UPLOAD_FOLDER, file_data['unique_name'])
                if os.path.exists(filepath):
                    os.remove(filepath)
                    logger.info(f"[DELETE] File removed from disk: {file_data['original_filename']}")
            except Exception as e:
                logger.error(f"[DELETE] Failed to remove file from disk: {e}")
            
            delete_file_by_short_id(short_id)
            
            logger.info(f"[DELETE] File deleted: {file_data['original_filename']} ({short_id}) | User: {user_id}")
            client_logger.info(f"File deleted: {file_data['original_filename']}")
            
            return jsonify({'success': True, 'message': 'File deleted'})
            
        except Exception as e:
            import traceback
            logger.error(f"[DELETE] Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to delete file', 500, correlation_id)

    # --- МАССОВОЕ УДАЛЕНИЕ ---
    @app.route('/api/delete/bulk', methods=['POST'])
    @rate_limit("10 per minute")
    def delete_files_bulk():
        correlation_id = None
        try:
            from backend.utils import get_or_create_correlation_id
            correlation_id = get_or_create_correlation_id()
            
            user_id = session.get('user_id')
            if not user_id:
                return error_response('Требуется авторизация', 401, correlation_id)
            
            data = request.get_json()
            if not data or 'short_ids' not in data:
                return error_response('Missing short_ids array', 400, correlation_id)
            
            short_ids = data['short_ids']
            
            if len(short_ids) > 100:
                return error_response('Too many files (max 100)', 400, correlation_id)
            
            deleted_count = 0
            errors = []
            
            for short_id in short_ids:
                try:
                    file_data = get_file_by_short_id(short_id)
                    
                    if not file_data:
                        errors.append({'short_id': short_id, 'error': 'Not found'})
                        continue
                    
                    if file_data.get('owner_id') != user_id:
                        errors.append({'short_id': short_id, 'error': 'Access denied'})
                        continue
                    
                    try:
                        filepath = safe_join_paths(UPLOAD_FOLDER, file_data['unique_name'])
                        if os.path.exists(filepath):
                            os.remove(filepath)
                    except Exception as e:
                        logger.error(f"[BULK DELETE] Failed to remove file: {e}")
                    
                    delete_file_by_short_id(short_id)
                    deleted_count += 1
                    
                except Exception as e:
                    logger.error(f"[BULK DELETE] Error deleting {short_id}: {e}")
                    errors.append({'short_id': short_id, 'error': str(e)})
            
            logger.info(f"[BULK DELETE] Deleted {deleted_count} files, {len(errors)} errors | User: {user_id}")
            client_logger.info(f"Bulk delete: {deleted_count} files deleted, {len(errors)} errors")
            
            return jsonify({
                'success': True,
                'deleted_count': deleted_count,
                'errors': errors
            })
            
        except Exception as e:
            import traceback
            logger.error(f"[BULK DELETE] Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to delete files', 500, correlation_id)