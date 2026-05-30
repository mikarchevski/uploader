# preview.py
import os
import base64
import io
import logging
import hashlib
import time
from PIL import Image
from .config import UPLOAD_FOLDER, PREVIEW_CACHE_FOLDER
from .config_constants import PREVIEW_IMAGE_SIZE, PREVIEW_JPEG_QUALITY

logger = logging.getLogger(__name__)
client_logger = logging.getLogger('client_frontend')

def get_cached_preview_path(filepath):
    """
    Генерирует путь к кэшированному превью на основе хеша оригинального файла.
    
    Args:
        filepath: Путь к оригинальному файлу
    
    Returns:
        str: Путь к кэшированному превью
    """
    # Создаём уникальный хеш на основе пути и времени модификации
    stat = os.stat(filepath)
    cache_key = f"{filepath}_{stat.st_mtime}_{stat.st_size}"
    hash_digest = hashlib.md5(cache_key.encode()).hexdigest()
    
    return os.path.join(PREVIEW_CACHE_FOLDER, f"{hash_digest}.jpg")

def save_preview_to_cache(preview_data, cache_path):
    """
    Сохраняет превью в кэш на диске.
    
    Args:
        preview_data: Base64 строка с превью
        cache_path: Путь для сохранения
    """
    try:
        # Извлекаем base64 данные (убираем префикс data:image/...)
        if ',' in preview_data:
            base64_data = preview_data.split(',')[1]
        else:
            base64_data = preview_data
        
        # Декодируем и сохраняем
        image_data = base64.b64decode(base64_data)
        with open(cache_path, 'wb') as f:
            f.write(image_data)
        
        logger.debug(f"[PREVIEW CACHE] Saved to {cache_path}")
    except Exception as e:
        logger.error(f"[PREVIEW CACHE] Failed to save cache: {e}")

def load_preview_from_cache(cache_path):
    """
    Загружает превью из кэша на диске.
    
    Args:
        cache_path: Путь к кэшированному превью
    
    Returns:
        str: Base64 строка или None если кэш отсутствует/устарел
    """
    try:
        if not os.path.exists(cache_path):
            return None
        
        # Проверяем возраст кэша (максимум 24 часа)
        cache_age = time.time() - os.path.getmtime(cache_path)
        if cache_age > 86400:  # 24 часа
            os.remove(cache_path)
            logger.debug(f"[PREVIEW CACHE] Expired cache removed: {cache_path}")
            return None
        
        # Читаем и кодируем в base64
        with open(cache_path, 'rb') as f:
            image_data = f.read()
        
        base64_data = base64.b64encode(image_data).decode('utf-8')
        return f"data:image/jpeg;base64,{base64_data}"
    
    except Exception as e:
        logger.error(f"[PREVIEW CACHE] Failed to load cache: {e}")
        return None

def get_video_preview(filepath, ext):
    """
    Генерирует превью для видео файла с помощью ffmpeg.
    Извлекает первый кадр и возвращает его как base64.
    Требует установленного ffmpeg в системе.
    """
    try:
        import subprocess
        
        # ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: убеждаемся, что путь безопасен
        real_filepath = os.path.realpath(filepath)
        real_upload = os.path.realpath(UPLOAD_FOLDER)
        
        if not real_filepath.startswith(real_upload):
            logger.error(f"[PREVIEW] Path traversal attempt blocked: {filepath}")
            return None
        
        # Проверяем кэш
        cache_path = get_cached_preview_path(filepath)
        cached = load_preview_from_cache(cache_path)
        if cached:
            logger.debug(f"[PREVIEW] Using cached preview for video: {os.path.basename(filepath)}")
            return cached
        
        # Создаем временный файл для кадра (внутри UPLOAD_FOLDER для безопасности)
        temp_img = os.path.join(UPLOAD_FOLDER, os.path.basename(filepath) + '_thumb.jpg')
        
        # Извлекаем первый кадр через ffmpeg
        cmd = [
            'ffmpeg', '-i', filepath,
            '-vf', 'select=eq(n\,0)',  # Первый кадр
            '-vframes', '1',
            '-q:v', '2',  # Качество JPEG (2 = высокое качество)
            '-y',  # Перезаписывать файл если существует
            temp_img
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        
        if result.returncode != 0 or not os.path.exists(temp_img):
            logger.warning(f"[PREVIEW] FFmpeg failed for {filepath}: {result.stderr.decode()[:200]}")
            return None
        
        # Читаем изображение и оптимизируем размер
        img = Image.open(temp_img)
        
        # Оптимизация: уменьшаем размер до 300px по большей стороне
        max_size = PREVIEW_IMAGE_SIZE
        width, height = img.size
        if width > height:
            new_width = max_size
            new_height = int(height * (max_size / width))
        else:
            new_height = max_size
            new_width = int(width * (max_size / height))
        
        img = img.resize((new_width, new_height), Image.LANCZOS)
        
        # Сохраняем оптимизированное изображение
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=PREVIEW_JPEG_QUALITY, optimize=True)
        encoded_string = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        preview_data = f"data:image/jpeg;base64,{encoded_string}"
        
        # Сохраняем в кэш
        save_preview_to_cache(preview_data, cache_path)
        
        # Удаляем временный файл
        if os.path.exists(temp_img):
            os.remove(temp_img)
        
        logger.debug(f"[PREVIEW] Generated and cached for video {ext}: {os.path.basename(filepath)}")
        return preview_data
        
    except FileNotFoundError:
        logger.error("[PREVIEW] ffmpeg not found in system PATH. Install ffmpeg first.")
        return None
    except subprocess.TimeoutExpired:
        logger.error(f"[PREVIEW] FFmpeg timeout for {filepath}")
        if os.path.exists(temp_img):
            os.remove(temp_img)
        return None
    except Exception as e:
        logger.error(f"[PREVIEW] Video preview error for {filepath}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        if os.path.exists(temp_img):
            os.remove(temp_img)
        return None

def get_preview_data(filepath, ext):
    """
    Возвращает данные для превью файла с кэшированием.
    Возвращает словарь {'has_preview': bool, 'preview': str | None}
    """
    
    # ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА безопасности пути
    try:
        real_filepath = os.path.realpath(filepath)
        real_upload = os.path.realpath(UPLOAD_FOLDER)
        
        if not real_filepath.startswith(real_upload):
            logger.error(f"[PREVIEW] Path traversal attempt blocked: {filepath}")
            return {'has_preview': False}
    except Exception as e:
        logger.error(f"[PREVIEW] Path validation error: {e}")
        return {'has_preview': False}
    
    # Проверяем кэш для изображений
    cache_path = get_cached_preview_path(filepath)
    cached = load_preview_from_cache(cache_path)
    if cached:
        logger.debug(f"[PREVIEW] Using cached preview: {os.path.basename(filepath)}")
        return {
            'has_preview': True,
            'preview': cached
        }
    
    # Для обычных изображений
    if ext in ('.jpg', '.jpeg', '.png', '.webp'):
        try:
            with open(filepath, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                mime_type = f"image/{ext[1:]}"
                preview_data = f"data:{mime_type};base64,{encoded_string}"
                
                # Сохраняем в кэш (конвертируем в JPEG для экономии места)
                try:
                    img = Image.open(io.BytesIO(base64.b64decode(encoded_string)))
                    img = img.convert('RGB')
                    
                    max_size = PREVIEW_IMAGE_SIZE
                    width, height = img.size
                    if width > height:
                        new_width = max_size
                        new_height = int(height * (max_size / width))
                    else:
                        new_height = max_size
                        new_width = int(width * (max_size / height))
                    
                    img = img.resize((new_width, new_height), Image.LANCZOS)
                    
                    buffer = io.BytesIO()
                    img.save(buffer, format="JPEG", quality=PREVIEW_JPEG_QUALITY, optimize=True)
                    cached_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                    cached_preview = f"data:image/jpeg;base64,{cached_base64}"
                    
                    save_preview_to_cache(cached_preview, cache_path)
                    preview_data = cached_preview
                except Exception as cache_err:
                    logger.warning(f"[PREVIEW] Failed to cache image: {cache_err}")
                
                logger.debug(f"[PREVIEW] Generated for {ext} file: {os.path.basename(filepath)}")
                return {
                    'has_preview': True,
                    'preview': preview_data
                }
        except Exception as e:
            logger.error(f"[PREVIEW] Failed to read image {filepath}: {e}")
            return {'has_preview': False}

    # Для SVG (возвращаем как есть, но с проверкой размера, без кэширования)
    elif ext == '.svg':
        try:
            with open(filepath, "rb") as svg_file:
                content = svg_file.read()
                if len(content) > 1024 * 100: # Ограничение 100кб для безопасности
                    logger.warning(f"[PREVIEW] SVG too large: {filepath}")
                    return {'has_preview': False}
                
                encoded_string = base64.b64encode(content).decode('utf-8')
                return {
                    'has_preview': True,
                    'preview': f"data:image/svg+xml;base64,{encoded_string}"
                }
        except Exception as e:
            logger.error(f"[PREVIEW] Failed to read SVG {filepath}: {e}")
            return {'has_preview': False}

    # Для GIF — извлекаем первый кадр
    elif ext == '.gif':
        try:
            img = Image.open(filepath)
            img.seek(0)  # Первый кадр
            
            # Оптимизация: уменьшаем размер до 300px
            max_size = PREVIEW_IMAGE_SIZE
            width, height = img.size
            if width > height:
                new_width = max_size
                new_height = int(height * (max_size / width))
            else:
                new_height = max_size
                new_width = int(width * (max_size / height))
            
            img = img.resize((new_width, new_height), Image.LANCZOS)
            img = img.convert('RGB') # Убираем прозрачность
            
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=PREVIEW_JPEG_QUALITY, optimize=True)
            encoded_string = base64.b64encode(buffer.getvalue()).decode('utf-8')
            
            preview_data = f"data:image/jpeg;base64,{encoded_string}"
            
            # Сохраняем в кэш
            save_preview_to_cache(preview_data, cache_path)
            
            logger.debug(f"[PREVIEW] Generated and cached for GIF: {os.path.basename(filepath)}")
            return {
                'has_preview': True,
                'preview': preview_data
            }
        except Exception as e:
            logger.error(f"[PREVIEW] GIF preview error for {filepath}: {e}")
            return {'has_preview': False}
    
    # Для видео форматов
    elif ext in ('.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v'):
        preview_data = get_video_preview(filepath, ext)
        if preview_data:
            return {
                'has_preview': True,
                'preview': preview_data
            }
        else:
            return {'has_preview': False}
    
    # Для других типов
    else:
        return {'has_preview': False}