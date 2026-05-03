# preview.py
import os
import base64
import io
from PIL import Image
from .config import UPLOAD_FOLDER

def get_preview_data(filepath, ext):
    """
    Возвращает данные для превью файла.
    Возвращает словарь {'has_preview': bool, 'preview': str | None}
    """
    
    # Для обычных изображений
    if ext in ('.jpg', '.jpeg', '.png', '.webp', '.svg'):
        try:
            with open(filepath, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                mime_type = f"image/{ext[1:]}"
                return {
                    'has_preview': True,
                    'preview': f"data:{mime_type};base64,{encoded_string}"
                }
        except Exception:
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
            
            return {
                'has_preview': True,
                'preview': f"data:image/jpeg;base64,{encoded_string}"
            }
        except Exception as e:
            print(f"GIF preview error: {e}")
            return {'has_preview': False}
    
    # Для видео и других типов
    else:
        return {'has_preview': False}