# preview.py
import os
import base64
import io
import logging
from PIL import Image
from .config import UPLOAD_FOLDER

logger = logging.getLogger(__name__)
client_logger = logging.getLogger('client_frontend')

def get_video_preview(filepath, ext):
    """
    Генерирует превью для видео файла с помощью ffmpeg.
    Извлекает первый кадр и возвращает его как base64.
    Требует установленного ffmpeg в системе.
    """
    try:
        import subprocess
        
        # Создаем временный файл для кадра
        temp_img = filepath + '_thumb.jpg'
        
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
        max_size = 300
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
        img.save(buffer, format="JPEG", quality=60, optimize=True)
        encoded_string = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        # Удаляем временный файл
        os.remove(temp_img)
        
        logger.debug(f"[PREVIEW] Generated for video {ext}: {os.path.basename(filepath)}")
        return f"data:image/jpeg;base64,{encoded_string}"
        
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
    Возвращает данные для превью файла.
    Возвращает словарь {'has_preview': bool, 'preview': str | None}
    """
    
    # Для обычных изображений
    if ext in ('.jpg', '.jpeg', '.png', '.webp'):
        try:
            with open(filepath, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                mime_type = f"image/{ext[1:]}"
                logger.debug(f"[PREVIEW] Generated for {ext} file: {os.path.basename(filepath)}")
                return {
                    'has_preview': True,
                    'preview': f"data:{mime_type};base64,{encoded_string}"
                }
        except Exception as e:
            logger.error(f"[PREVIEW] Failed to read image {filepath}: {e}")
            return {'has_preview': False}

    # Для SVG (возвращаем как есть, но с проверкой размера)
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
            max_size = 300
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
            img.save(buffer, format="JPEG", quality=50, optimize=True)
            encoded_string = base64.b64encode(buffer.getvalue()).decode('utf-8')
            
            logger.debug(f"[PREVIEW] Generated for GIF: {os.path.basename(filepath)}")
            return {
                'has_preview': True,
                'preview': f"data:image/jpeg;base64,{encoded_string}"
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