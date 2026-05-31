# backend/previews.py
"""
Модуль для обработки превью файлов
"""
import os
import base64
import logging
from flask import request, jsonify, session, send_file
from datetime import datetime

from .config import UPLOAD_FOLDER
from .database import get_file_by_short_id
from .preview import get_preview_data, get_cached_preview_path
from .utils import safe_join_paths
from .config_constants import RATE_LIMIT_PREVIEW


def register_preview_routes(app):
    logger = logging.getLogger(__name__)
    
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

    # --- ПРЕВЬЮ КАК JSON (LEGACY) ---
    @app.route('/api/preview/<short_id>')
    @rate_limit(RATE_LIMIT_PREVIEW)
    def get_file_preview(short_id):
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
                logger.warning(f"[PREVIEW] Access denied: User {user_id} tried to access file {short_id}")
                return error_response('Access denied', 403, correlation_id)
            
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

    # --- ПРЕВЬЮ КАК БИНАРНОЕ ИЗОБРАЖЕНИЕ ---
    @app.route('/api/preview-image/<short_id>')
    @rate_limit(RATE_LIMIT_PREVIEW)
    def get_file_preview_image(short_id):
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
                logger.warning(f"[PREVIEW-IMAGE] Access denied: User {user_id} tried to access file {short_id}")
                return error_response('Access denied', 403, correlation_id)
            
            try:
                filepath = safe_join_paths(UPLOAD_FOLDER, file_data['unique_name'])
            except ValueError as e:
                logger.error(f"[PREVIEW-IMAGE] Path traversal blocked: {e} | CorrelationID: {correlation_id}")
                return error_response('Invalid file path', 400, correlation_id)
            
            ext = os.path.splitext(file_data['original_filename'])[1].lower()
            
            if not os.path.exists(filepath):
                return error_response('File not found', 404, correlation_id)
            
            cache_path = get_cached_preview_path(filepath)
            
            if not os.path.exists(cache_path):
                preview_result = get_preview_data(filepath, ext)
                
                if not preview_result.get('has_preview'):
                    return error_response('Preview not available', 404, correlation_id)
                
                preview_base64 = preview_result['preview']
                if ',' in preview_base64:
                    base64_data = preview_base64.split(',')[1]
                else:
                    base64_data = preview_base64
                
                image_data = base64.b64decode(base64_data)
                with open(cache_path, 'wb') as f:
                    f.write(image_data)
                
                logger.debug(f"[PREVIEW-IMAGE] Generated and cached: {short_id}")
            
            response = send_file(
                cache_path,
                mimetype='image/jpeg',
                as_attachment=False,
                download_name=f"preview_{short_id}.jpg"
            )
            
            response.headers['Cache-Control'] = 'public, max-age=2592000, immutable'
            response.headers['ETag'] = f'"{os.path.getmtime(cache_path)}"'
            response.headers['Expires'] = 'Thu, 31 Dec 2037 23:55:55 GMT'
            
            return response
            
        except Exception as e:
            import traceback
            logger.error(f"[PREVIEW-IMAGE] Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to generate preview', 500, correlation_id)

    # --- ПАКЕТНАЯ ЗАГРУЗКА ПРЕВЬЮ ---
    @app.route('/api/previews/batch', methods=['POST'])
    @rate_limit(RATE_LIMIT_PREVIEW)
    def get_batch_previews():
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
            
            if len(short_ids) > 50:
                return error_response('Too many files requested (max 50)', 400, correlation_id)
            
            previews = {}
            
            for short_id in short_ids:
                try:
                    file_data = get_file_by_short_id(short_id)
                    if not file_data:
                        previews[short_id] = {'has_preview': False}
                        continue
                    
                    if file_data.get('owner_id') != user_id:
                        previews[short_id] = {'has_preview': False}
                        continue
                    
                    try:
                        filepath = safe_join_paths(UPLOAD_FOLDER, file_data['unique_name'])
                    except ValueError:
                        previews[short_id] = {'has_preview': False}
                        continue
                    
                    if not os.path.exists(filepath):
                        previews[short_id] = {'has_preview': False}
                        continue
                    
                    ext = os.path.splitext(file_data['original_filename'])[1].lower()
                    previews[short_id] = get_preview_data(filepath, ext)
                    
                except Exception as e:
                    logger.warning(f"[BATCH PREVIEW] Failed for {short_id}: {e}")
                    previews[short_id] = {'has_preview': False}
            
            response = jsonify(previews)
            response.headers['Cache-Control'] = 'public, max-age=86400'
            return response
            
        except Exception as e:
            import traceback
            logger.error(f"[BATCH PREVIEW] Error: {str(e)} | Traceback: {traceback.format_exc()} | CorrelationID: {correlation_id}")
            return error_response('Failed to generate batch previews', 500, correlation_id)