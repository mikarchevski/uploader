import os
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

def get_rate_limits():
    """Возвращает лимиты в зависимости от режима"""
    if os.environ.get('TESTING_MODE', '').lower() == 'true':
        # Лимиты для тестирования (мягкие)
        return {
            'default_limits': ["10000 per hour"],
            'login_limit': "1000 per minute",
            'api_login_limit': "1000 per minute", 
            'upload_limit': "10000 per minute",
            'delete_limit': "1000 per minute",
            'bulk_delete_limit': "1000 per minute",
            'check_file_limit': "1000 per minute",
            'preview_limit': "1000 per minute",
            'list_files_limit': "10000 per minute",
            'download_folder_limit': "1000 per minute",
            'log_limit': "10000 per minute"
        }
    else:
        # Нормальные лимиты для продакшена
        return {
            'default_limits': ["200000 per day", "5000 per hour"],
            'login_limit': "10 per minute",
            'api_login_limit': "5 per minute",
            'upload_limit': "1000 per minute", 
            'delete_limit': "20 per minute",
            'bulk_delete_limit': "10 per minute",
            'check_file_limit': "30 per minute",
            'preview_limit': "60 per minute",
            'list_files_limit': "600 per minute",
            'download_folder_limit': "5 per minute",
            'log_limit': "10 per minute"
        }

limits = get_rate_limits()

# Создаем глобальный экземпляр с динамическими лимитами
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://",
    default_limits=limits['default_limits'],
    strategy="fixed-window",
)