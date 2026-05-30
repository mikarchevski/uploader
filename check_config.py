import os
import sys
import logging

logger = logging.getLogger(__name__)

def check_configuration():
    """
    Проверяет наличие обязательных переменных окружения и файлов.
    
    Returns:
        bool: True если конфигурация корректна
    """
    errors = []
    warnings = []
    
    # === Проверка SECRET_KEY ===
    secret_key = os.environ.get('SECRET_KEY')
    if not secret_key:
        flask_env = os.environ.get('FLASK_ENV', 'development')
        
        if flask_env == 'production':
            errors.append("❌ SECRET_KEY не установлен в production режиме!")
        else:
            warnings.append("⚠️ SECRET_KEY не установлен. Будет использован временный ключ.")
    
    # === Проверка директорий ===
    required_dirs = [
        './uploads',
        './data',
    ]
    
    for dir_path in required_dirs:
        if not os.path.exists(dir_path):
            try:
                os.makedirs(dir_path, exist_ok=True)
                logger.info(f"✓ Создана директория: {dir_path}")
            except Exception as e:
                errors.append(f"❌ Не удалось создать директорию {dir_path}: {e}")
    
    # === Проверка базы данных ===
    db_path = os.environ.get('DB_PATH', './data/uploads.db')
    db_dir = os.path.dirname(db_path)
    
    if not os.path.exists(db_dir):
        try:
            os.makedirs(db_dir, exist_ok=True)
            logger.info(f"✓ Создана директория для БД: {db_dir}")
        except Exception as e:
            errors.append(f"❌ Не удалось создать директорию для БД: {e}")
    
    # === Проверка кэша превью ===
    preview_cache = os.environ.get('PREVIEW_CACHE_FOLDER', '/opt/filebrowser/data/previews')
    if not os.path.exists(preview_cache):
        try:
            os.makedirs(preview_cache, exist_ok=True)
            logger.info(f"✓ Создана директория кэша превью: {preview_cache}")
        except Exception as e:
            warnings.append(f"⚠️ Не удалось создать директорию кэша превью: {e}")
    
    # === Вывод результатов ===
    if warnings:
        print("\n⚠️ ПРЕДУПРЕЖДЕНИЯ:")
        for warning in warnings:
            print(f"  {warning}")
    
    if errors:
        print("\n❌ ОШИБКИ КОНФИГУРАЦИИ:")
        for error in errors:
            print(f"  {error}")
        print("\nИсправьте ошибки и попробуйте снова.\n")
        return False
    
    print("✅ Конфигурация проверена успешно!\n")
    return True

if __name__ == '__main__':
    success = check_configuration()
    sys.exit(0 if success else 1)