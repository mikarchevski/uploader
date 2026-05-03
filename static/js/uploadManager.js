// uploadManager.js
import { computeFileHash } from './utils.js';
import { checkFileExists, uploadFile } from './api.js';

export class UploadManager {
    constructor(onUploadComplete) {
        this.uploadList = document.getElementById('uploadList');
        this.uploadManagerEl = document.getElementById('uploadManager');
        this.closeBtn = document.getElementById('closeManagerBtn');
        
        this.queue = [];
        this.isUploading = false;
        this.onUploadComplete = onUploadComplete;

        this.init();
    }

    init() {
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.clearAndHide());
        }
    }

    show() {
        if (this.uploadManagerEl) {
            this.uploadManagerEl.classList.remove('hidden');
        }
    }

    hide() {
        if (this.uploadManagerEl) {
            this.uploadManagerEl.classList.add('hidden');
        }
    }

    clearAndHide() {
        // Отменяем все активные загрузки
        this.queue.forEach(item => {
            if (item.xhr) item.xhr.abort();
        });
        
        if (this.uploadList) {
            this.uploadList.innerHTML = '';
        }
        this.queue = [];
        this.isUploading = false;
        this.hide();
    }

    addToQueue(filesArray) {
        if (!filesArray || filesArray.length === 0) return;
        
        const referenceNode = this.uploadList.firstChild;
        
        for (let i = filesArray.length - 1; i >= 0; i--) {
            const file = filesArray[i];
            const uiItem = this.createUploadItem(file, referenceNode);
            // Добавляем xhr: null, он заполнится позже
            this.queue.unshift({ file, uiItem, xhr: null, cancelled: false }); 
        }

        this.show();

        if (!this.isUploading) {
            this.processQueue();
        }
    }

    createUploadItem(file, referenceNode = null) {
        const itemEl = document.createElement('div');
        itemEl.className = 'upload-item';
        
        itemEl.innerHTML = `
            <div class="item-header">
                <span class="item-name" title="${file.name}">${file.name}</span>
                <button class="cancel-btn" title="Отменить загрузку">×</button>
            </div>
            <div class="item-status">Ожидание...</div>
            <div class="progress-bg">
                <div class="progress-bar"></div>
            </div>
        `;
        
        if (referenceNode) {
            this.uploadList.insertBefore(itemEl, referenceNode);
        } else {
            this.uploadList.appendChild(itemEl);
        }

        const cancelBtn = itemEl.querySelector('.cancel-btn');
        
        return {
            element: itemEl,
            statusEl: itemEl.querySelector('.item-status'),
            barEl: itemEl.querySelector('.progress-bar'),
            setStatus: (text) => { 
                const el = itemEl.querySelector('.item-status');
                if (el) el.textContent = text; 
            },
            setProgress: (pct) => { 
                const el = itemEl.querySelector('.progress-bar');
                if (el) el.style.width = pct + '%'; 
            },
            setSuccess: () => { 
                itemEl.classList.add('success');
                itemEl.classList.remove('error', 'cancelled');
                const el = itemEl.querySelector('.item-status');
                if (el) el.textContent = '✅ Готово';
                cancelBtn.style.display = 'none';
            },
            setError: (msg) => {
                itemEl.classList.add('error');
                itemEl.classList.remove('success', 'cancelled');
                const el = itemEl.querySelector('.item-status');
                if (el) el.textContent = '❌ ' + msg;
                cancelBtn.style.display = 'none';
            },
            setCancelled: () => {
                itemEl.classList.add('cancelled');
                itemEl.classList.remove('success', 'error');
                const el = itemEl.querySelector('.item-status');
                if (el) el.textContent = '⛔ Отменено';
                cancelBtn.style.display = 'none';
                // Опционально: можно автоматически удалять элемент через пару секунд
                // setTimeout(() => itemEl.remove(), 2000);
            },
            // Метод для немедленного удаления из UI
            remove: () => {
                itemEl.remove();
            }
        };
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.isUploading = false;
            return;
        }

        this.isUploading = true;
        
        // Берем первый элемент, но не удаляем из массива сразу, чтобы иметь доступ к xhr
        const queueItem = this.queue[0]; 
        const { file, uiItem } = queueItem;
        
        // Если элемент уже был удален из DOM (пользователь нажал крестик до начала обработки), пропускаем
        if (!document.body.contains(uiItem.element) || queueItem.cancelled) {
            this.queue.shift(); // Удаляем из очереди
            this.processQueue();
            return;
        }

        try {
            await this.startUpload(queueItem);
        } catch (err) {
            if (err.message !== 'Cancelled') {
                console.error("Ошибка при загрузке файла:", file.name, err);
                uiItem.setError('Ошибка сети или сервера');
            } else {
                uiItem.setCancelled();
            }
        } finally {
            // Удаляем элемент из очереди только после завершения (успеха, ошибки или отмены)
            this.queue.shift();
            
            // Пауза перед следующим файлом
            setTimeout(() => {
                this.processQueue();
            }, 500);
        }
    }

    async startUpload(queueItem) {
        const { file, uiItem } = queueItem;

        return new Promise((resolve, reject) => {
            // Обработчик отмены
            const cancelHandler = () => {
                queueItem.cancelled = true;
                if (queueItem.xhr) {
                    queueItem.xhr.abort();
                }
                reject(new Error('Cancelled'));
            };
            
            const cancelBtn = uiItem.element.querySelector('.cancel-btn');
            cancelBtn.onclick = cancelHandler;

            // Этап 1: Хеш
            uiItem.setStatus('Вычисление хеша...');
            uiItem.setProgress(10);

            computeFileHash(file).then(hash => {
                if (queueItem.cancelled) {
                    reject(new Error('Cancelled'));
                    return;
                }

                uiItem.setStatus('Проверка...');
                uiItem.setProgress(30);

                checkFileExists(hash).then(checkData => {
                    if (queueItem.cancelled) {
                        reject(new Error('Cancelled'));
                        return;
                    }

                    if (checkData.exists) {
                        uiItem.setSuccess();
                        // Даже если файл существует, мы можем захотеть добавить его в список, 
                        // но обычно checkFileExists возвращает true, если файл уже есть у пользователя.
                        // Если вы хотите, чтобы он появился в списке, вызовите onUploadComplete здесь.
                        // Но так как файл уже был загружен ранее, он уже должен быть в списке.
                        resolve();
                        return;
                    }

                    uiItem.setStatus('Загрузка...');
                    uiItem.setProgress(50);

                    // Этап 2: Отправка
                    uploadFile(file, hash, 
                        (pct) => {
                            if (!queueItem.cancelled) {
                                uiItem.setProgress(50 + (pct / 2));
                            }
                        },
                        (res) => {
                            cancelBtn.onclick = null; // Убираем слушатель

                            if (queueItem.cancelled) {
                                reject(new Error('Cancelled'));
                                return;
                            }

                            if (res && res.success) {
                                uiItem.setSuccess();
                                if (this.onUploadComplete && res.file_data) {
                                    this.onUploadComplete(res.file_data);
                                }
                                resolve();
                            } else {
                                uiItem.setError(res?.error || 'Ошибка сервера');
                                reject(new Error(res?.error));
                            }
                        },
                        (err) => {
                            cancelBtn.onclick = null;
                            if (queueItem.cancelled || err.type === 'abort') {
                                reject(new Error('Cancelled'));
                            } else {
                                uiItem.setError('Ошибка сети');
                                reject(err);
                            }
                        },
                        (xhr) => {
                            queueItem.xhr = xhr;
                            // Если отмена произошла пока xhr еще не создался
                            if (queueItem.cancelled) {
                                xhr.abort();
                            }
                        }
                    );
                }).catch(err => {
                    if (!queueItem.cancelled) reject(err);
                });

            }).catch(err => {
                if (!queueItem.cancelled) reject(err);
            });
        });
    }
}