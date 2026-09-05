from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Создаем глобальный экземпляр без привязки к конкретному app
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://", # Замените на redis://... если используете Redis
    default_limits=["200000 per day", "5000 per hour"], # Ваши текущие дефолты
    strategy="fixed-window", # или "moving-window"
)