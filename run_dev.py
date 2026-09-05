# run_dev.py
import subprocess
import sys
import os
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Папки, которые нужно игнорировать
IGNORED_DIRS = {
    'venv', '.venv', 'env', '.git', '__pycache__', 
    'data', 'uploads', '.pytest_cache', 'node_modules'
}

# Расширения файлов, за которыми стоит следить
WATCHED_EXTENSIONS = {'.py', '.html', '.css', '.js', '.env'}

def should_ignore(path):
    """Проверяем, нужно ли игнорировать путь"""
    parts = path.replace('\\', '/').split('/')
    # Если любая часть пути — игнорируемая папка
    for part in parts:
        if part in IGNORED_DIRS or part.startswith('.'):
            return True
    return False

class ChangeHandler(FileSystemEventHandler):
    def __init__(self, process):
        self.process = process
        self.last_restart = 0
    
    def on_any_event(self, event):
        # Игнорируем директории
        if event.is_directory:
            return
        
        # Игнорируем служебные папки
        if should_ignore(event.src_path):
            return
        
        # Следим только за нужными расширениями
        if not any(event.src_path.endswith(ext) for ext in WATCHED_EXTENSIONS):
            return
        
        # Защита от слишком частых перезапусков (debounce)
        current_time = time.time()
        if current_time - self.last_restart < 2:
            return
        self.last_restart = current_time

        print(f"🔄 Изменение: {event.src_path}. Перезапуск Flask...")
        
        # Перезапускаем Flask
        self.process.terminate()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill()
        
        self.process = subprocess.Popen([sys.executable, "-m", "flask", "run"])

if __name__ == "__main__":
    print("🚀 Запуск Flask в режиме разработки...")
    process = subprocess.Popen([sys.executable, "-m", "flask", "run"])
    
    path = "."
    event_handler = ChangeHandler(process)
    observer = Observer()
    observer.schedule(event_handler, path, recursive=True)
    observer.start()
    
    print("👀 Слежение за изменениями в .py, .html, .css, .js, .env")
    print("⏭️  Игнорируются: venv, .git, __pycache__, data, uploads")
    print("Нажмите Ctrl+C для остановки.")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Остановка...")
        observer.stop()
        process.terminate()
    observer.join