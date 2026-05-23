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
            },
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

    // ... existing code ...

    // ... existing code ...

    // ... existing code ...

    // ... existing code ...

    async startUpload(queueItem) {
        return new Promise((resolve, reject) => {
            const file = queueItem.file;
            const uiItem = queueItem.uiItem;
            
            if (!uiItem) {
                reject(new Error('UI item not found'));
                return;
            }

            const cancelBtn = uiItem.element.querySelector('.cancel-btn');

            (async () => {
                try {
                    if (queueItem.cancelled) { 
                        reject(new Error('Cancelled')); 
                        return; 
                    }

                    uiItem.setStatus('Вычисление хеша...');
                    uiItem.setProgress(10);

                    const hash = await computeFileHash(file);
                    
                    if (queueItem.cancelled) { 
                        reject(new Error('Cancelled')); 
                        return; 
                    }

                    uiItem.setStatus('Проверка...');
                    uiItem.setProgress(30);

                    const checkData = await checkFileExists(hash);
                    
                    if (queueItem.cancelled) { 
                        reject(new Error('Cancelled')); 
                        return; 
                    }

                    // Если файл существует И принадлежит текущему пользователю
                    if (checkData.exists && checkData.owned) {
                        uiItem.setStatus('Файл уже загружен');
                        //uiItem.setSuccess();
                        
                        // // Вариант А: Сервер вернул полные данные
                        // if (this.onUploadComplete && checkData.file_data) {
                        //      this.onUploadComplete(checkData.file_data);
                        // } 
                        // Вариант Б: Сервер вернул только URL
                        // else if (this.onUploadComplete && checkData.url) {
                        //      const formatSize = (bytes) => {
                        //          if (bytes === 0) return '0 B';
                        //          const k = 1024;
                        //          const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
                        //          const i = Math.floor(Math.log(bytes) / Math.log(k));
                        //          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                        //      };

                        //      const mockData = {
                        //          short_id: checkData.url.split('/').pop(),
                        //          filename: file.name,
                        //          size: formatSize(file.size),
                        //          date: new Date().toISOString().split('T')[0],
                        //          downloads: 0,
                        //          url: checkData.url
                        //      };
                        //      this.onUploadComplete(mockData);
                        // }

                        resolve();
                        return;
                    }
                    
                    // Если файл существует, но НЕ принадлежит текущему пользователю
                    // или файла вообще нет - продолжаем загрузку
                    uiItem.setStatus('Загрузка...');
                    uiItem.setProgress(50);

                    uploadFile(file, hash, 
                        (pct) => { 
                            if (!queueItem.cancelled) {
                                uiItem.setProgress(50 + (pct / 2)); 
                            }
                        },
                        (res) => {
                            cancelBtn.onclick = null;
                            if (queueItem.cancelled) { 
                                reject(new Error('Cancelled')); 
                                return; 
                            }

                            // ... existing code ...
                            if (res && res.success) {
                                // Проверяем, является ли это дубликатом
                                if (res.message === 'Файл уже загружен') {
                                    uiItem.setStatus('Файл уже загружен');
                                } else {
                                    uiItem.setSuccess();
                                }
                                
                                // Заполняем прогресс-бар до конца визуально
                                const bar = uiItem.element.querySelector('.progress-bar');
                                if (bar) {
                                    bar.style.width = '100%';
                                    bar.style.backgroundColor = '#10b981'; // Зеленый цвет
                                }
                                uiItem.element.classList.add('success');

                                // Добавляем в сетку ТОЛЬКО если это новый файл (нет сообщения о дубликате)
                                // Или если вы хотите, чтобы дубликат "подсветился" в списке, можно оставить вызов, 
                                // но addFileToGrid имеет защиту от дубликатов по ID.
                                if (this.onUploadComplete && res.file_data && res.message !== 'Файл уже загружен') {
                                    this.onUploadComplete(res.file_data);
                                }
                                
                                resolve();
                            } else {
// ... existing code ...
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
                            if (queueItem.cancelled) {
                                xhr.abort();
                            }
                        }
                    );
                } catch (err) {
                    console.error('[UPLOAD] Exception in startUpload:', err);
                    if (!queueItem.cancelled) {
                        reject(err);
                    }
                }
            })();
        });
    }
}