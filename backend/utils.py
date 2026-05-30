# utils.py
import uuid
import hashlib
import random
import string
import math
import os
import re
from flask import abort
from .config_constants import (
    FOLDER_PATH_REGEX, 
    MAX_FOLDER_DEPTH, 
    MAX_FILENAME_LENGTH,
    DANGEROUS_PATH_PATTERNS
)

def generate_short_id(length=6):
    """Генерирует уникальный короткий ID."""
    chars = string.ascii_letters + string.digits
    short_id = ''.join(random.choice(chars) for _ in range(length))
    return short_id

def format_file_size(size_bytes):
    """Форматирует размер файла в читаемый вид."""
    if size_bytes == 0:
        return "0 B"
    size_name = ("B", "KB", "MB", "GB", "TB")
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_name[i]}"

def compute_file_hash(file_obj):
    """Вычисляет SHA-256 хеш файла."""
    sha256_hash = hashlib.sha256()
    for byte_block in iter(lambda: file_obj.read(4096), b""):
        sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def validate_path_safety(path, base_directory):
    """
    Проверяет безопасность пути для защиты от Path Traversal атак.
    
    Args:
        path: Путь для проверки
        base_directory: Базовая директория (должна быть абсолютным путём)
    
    Returns:
        bool: True если путь безопасен
    
    Raises:
        ValueError: Если путь содержит опасные паттерны
    """
    if not path:
        return True
    
    # Проверка на null bytes
    if '\x00' in path:
        raise ValueError("Путь содержит недопустимые символы")
    
    # Проверка на опасные паттерны
    for pattern in DANGEROUS_PATH_PATTERNS:
        if pattern in path:
            raise ValueError(f"Путь содержит запрещённый паттерн: '{pattern}'")
    
    # Нормализуем путь и проверяем, что он остаётся внутри base_directory
    base_directory = os.path.realpath(base_directory)
    
    # Для относительных путей (например, folder_path)
    if not os.path.isabs(path):
        # Проверяем формат через regex
        if not re.match(FOLDER_PATH_REGEX, path):
            raise ValueError("Недопустимый формат пути")
        
        # Проверяем глубину вложенности
        depth = path.count('/') + path.count('\\')
        if depth > MAX_FOLDER_DEPTH:
            raise ValueError(f"Слишком глубокая вложенность папок (максимум {MAX_FOLDER_DEPTH})")
        
        return True
    
    # Для абсолютных путей (например, unique_name при скачивании)
    full_path = os.path.realpath(os.path.join(base_directory, path))
    
    if not full_path.startswith(base_directory):
        raise ValueError("Попытка доступа за пределы разрешённой директории")
    
    return True

def safe_join_paths(base_directory, *paths):
    """
    Безопасно объединяет пути с проверкой на Path Traversal.
    
    Args:
        base_directory: Базовая директория
        *paths: Компоненты пути для объединения
    
    Returns:
        str: Безопасный полный путь
    
    Raises:
        ValueError: Если результирующий путь выходит за пределы base_directory
    """
    # Сначала объединяем пути
    joined = os.path.join(base_directory, *paths)
    
    # Нормализуем (убираем ../, ./, лишние /)
    normalized = os.path.normpath(joined)
    real_path = os.path.realpath(normalized)
    
    # Получаем реальный путь базовой директории
    real_base = os.path.realpath(base_directory)
    
    # Проверяем, что результат внутри base_directory
    if not real_path.startswith(real_base + os.sep) and real_path != real_base:
        raise ValueError(
            f"Попытка обхода директории!\n"
            f"Базовая директория: {real_base}\n"
            f"Запрошенный путь: {real_path}"
        )
    
    return real_path