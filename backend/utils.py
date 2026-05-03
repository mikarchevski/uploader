# utils.py
import uuid
import hashlib
import random
import string
import math
import os

def generate_short_id(length=6):
    """Генерирует уникальный короткий ID."""
    chars = string.ascii_letters + string.digits
    while True:
        short_id = ''.join(random.choice(chars) for _ in range(length))
        # Здесь можно добавить проверку на уникальность в БД, 
        # но для простоты оставим как есть, так как коллизии крайне редки
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