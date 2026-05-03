# run_dev.py
import subprocess
import sys
import os
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class ChangeHandler(FileSystemEventHandler):
    def on_any_event(self, event):
        # Игнорируем временные файлы, кэш и скрытые папки
        if event.src_path.endswith('.pyc') or '/__pycache__/' in event.src_path or event.src_path.startswith('./.'):
            return
        
        # Игнорируем события директорий, если не нужно
        if event.is_directory:
            return

        print(f"🔄 Изменение обнаружено: {event.src_path}. Перезапуск Flask...")
        
        # Перезапускаем текущий скрипт
        python = sys.executable
        os.execl(python, python, *sys.argv)

if __name__ == "__main__":
    path = "."
    event_handler = ChangeHandler()
    observer = Observer()
    observer.schedule(event_handler, path, recursive=True)
    observer.start()
    
    print("🚀 Запуск Flask в режиме разработки...")
    print("Нажмите Ctrl+C для остановки.")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()