# File Uploader

Безопасный файловый uploader с поддержкой дедупликации, превью и многопользовательского режима.

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
pip install -r requirements.txt
```

.env
```
# TESTING_MODE=true

# === БЕЗОПАСНОСТЬ И ТЕСТИРОВАНИЕ ===
# Секретный ключ для шифрования сессий
# Сгенерируйте уникальный ключ командой: python3 generate_secret_key.py
SECRET_KEY=ваш_уникальный_секретный_ключ

 Токен для обхода лимитов в E2E-тестах. 
# Должен совпадать с E2E_BYPASS_TOKEN в GitHub Secrets и в conftest.py тестов.
# Если установлен, запросы с заголовком "X-E2E-Bypass-Token" не учитываются лимитером.
E2E_BYPASS_TOKEN=my_super_secret_local_token_123

# === НАСТРОЙКИ ПРИЛОЖЕНИЯ ===
FLASK_ENV=development
FLASK_DEBUG=1

# === ПУТИ К ФАЙЛАМ ===
UPLOAD_FOLDER=./uploads
DB_PATH=./data/uploads.db

# === КЭШ ПРЕВЬЮ (вне проекта) ===
PREVIEW_CACHE_FOLDER=./data/previews

# === ПРОДАКШЕН НАСТРОЙКИ (раскомментируйте при деплое) ===
# FLASK_ENV=production
# FLASK_DEBUG=0
# SESSION_COOKIE_SECURE=True
```


# Rate Limiting Configuration

## Обзор

Приложение использует Flask-Limiter для защиты от злоупотреблений и brute-force атак.

## Лимиты по умолчанию

- **200 запросов в день** на один IP адрес
- **50 запросов в час** на один IP адрес

## Специфические лимиты для endpoints

### Авторизация
- `POST /login` - **10 попыток в минуту**
- `POST /api/login` - **5 попыток в минуту**

### Загрузка файлов
- `POST /upload` - **10 загрузок в минуту**

### Проверка файлов
- `GET /check` - **30 проверок в минуту**

### Получение данных
- `GET /api/files` - **60 запросов в минуту**
- `GET /api/preview/<id>` - **60 запросов в минуту**

### Удаление файлов
- `DELETE /api/delete/<id>` - **20 удалений в минуту**

## Ответ при превышении лимита

Когда пользователь превышает лимит, сервер возвращает:

```json
{
    "error": "Rate limit exceeded",
    "message": "Слишком много запросов. Пожалуйста, подождите немного.",
    "retry_after": "Описание времени ожидания"
}

# Инструкция по установке CSRF защиты

## 1. Установите новую зависимость

```bash
pip install Flask-WTF==1.2.1
