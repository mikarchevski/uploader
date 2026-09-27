"""
Скрипт для создания первого администратора.
Запуск: python create_admin.py
"""
import sys
from getpass import getpass
from backend.database import create_admin, get_admin_by_username

def main():
    print("=== Создание администратора ===\n")
    
    username = input("Введите имя администратора: ").strip()
    
    if not username:
        print("❌ Имя не может быть пустым")
        sys.exit(1)
    
    # Проверяем, существует ли уже такой админ
    existing = get_admin_by_username(username)
    if existing:
        print(f"❌ Администратор '{username}' уже существует")
        sys.exit(1)
    
    password = getpass("Введите пароль: ")
    password_confirm = getpass("Подтвердите пароль: ")
    
    if password != password_confirm:
        print("❌ Пароли не совпадают")
        sys.exit(1)
    
    if len(password) < 8:
        print("❌ Пароль должен быть не менее 8 символов")
        sys.exit(1)
    
    if create_admin(username, password):
        print(f"\n✅ Администратор '{username}' успешно создан!")
        print(f"Теперь вы можете войти на admin.mk5d.ru/admin/login")
    else:
        print("\n❌ Ошибка при создании администратора")
        sys.exit(1)

if __name__ == '__main__':
    main()