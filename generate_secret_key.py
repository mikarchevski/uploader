#!/usr/bin/env python3
"""
Генератор безопасного SECRET_KEY для Flask
Использование: python3 generate_secret_key.py
"""
import secrets
import os

def generate_secret_key():
    """Генерирует криптографически стойкий случайный ключ"""
    return secrets.token_hex(32)

if __name__ == '__main__':
    key = generate_secret_key()
    print("=" * 60)
    print("🔐 Ваш новый SECRET_KEY:")
    print("=" * 60)
    print(key)
    print("=" * 60)
    print("\n📝 Добавьте эту строку в файл .env:")
    print(f"SECRET_KEY={key}")
    print("=" * 60)
    
    # Предложение автоматически создать .env файл
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if not os.path.exists(env_path):
        response = input("\n❓ Создать файл .env автоматически? (y/n): ").lower()
        if response == 'y':
            with open(env_path, 'w') as f:
                f.write(f"# Автоматически сгенерировано {__file__}\n")
                f.write(f"SECRET_KEY={key}\n")
                f.write(f"\n# Другие настройки:\n")
                f.write(f"# UPLOAD_FOLDER=/opt/filebrowser/data/uploads\n")
                f.write(f"# DB_PATH=/opt/filebrowser/data/uploads.db\n")
                f.write(f"# FLASK_ENV=production\n")
                f.write(f"# FLASK_DEBUG=0\n")
            print(f"✅ Файл .env создан по пути: {env_path}")
        else:
            print("⚠️  Не забудьте вручную создать файл .env с вашим SECRET_KEY")
    else:
        print(f"\n⚠️  Файл .env уже существует по пути: {env_path}")
        print("   Обновите его вручную или удалите и запустите скрипт снова")