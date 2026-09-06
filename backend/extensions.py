import os
from flask import request
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

# 1. Создаем экземпляр лимитера (ОБРАТИТЕ ВНИМАНИЕ: здесь НЕТ request_filter)
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://",
    default_limits=limits['default_limits'],
    strategy="fixed-window",
)

# 2. Правильно применяем декоратор request_filter ПОСЛЕ создания объекта limiter
@limiter.request_filter
def bypass_test_limits():
    """
    Если запрос содержит правильный токен, лимиты не применяются.
    Это безопасно, так как токен хранится только в GitHub Secrets.
    """
    bypass_token = os.getenv("E2E_BYPASS_TOKEN", "")
    if bypass_token and request.headers.get("X-E2E-Bypass-Token") == bypass_token:
        return True  # Пропустить без проверки лимитов
    return False