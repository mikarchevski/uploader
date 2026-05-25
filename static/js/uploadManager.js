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

    // ... existing code ...
    addToQueue(filesArray) {
        if (!filesArray || filesArray.length === 0) return;
        
        // Проверяем, является ли это папкой (есть ли webkitRelativePath у первого файла)
        const firstFile = filesArray[0];
        if (firstFile.webkitRelativePath && filesArray.length > 1) {
            this.addFolderToQueue(filesArray);
            return;
        }

        // Стандартная логика для отдельных файлов
        const referenceNode = this.uploadList.firstChild;
        
        for (let i = filesArray.length - 1; i >= 0; i--) {
            const file = filesArray[i];
            const uiItem = this.createUploadItem(file, referenceNode);
            this.queue.unshift({ file, uiItem, xhr: null, cancelled: false }); 
        }

        this.show();

        if (!this.isUploading) {
            this.processQueue();
        }
    }

// ... existing code ...
    // ... existing code ...
    addFolderToQueue(filesArray) {
        // 1. Группируем файлы по КОРНЕВОЙ папке (первая часть пути)
        const foldersMap = new Map();

        filesArray.forEach(file => {
            if (!file.webkitRelativePath) return;

            // Путь выглядит как "MyFolder/Sub/file.txt"
            // split('/')[0] вернет "MyFolder"
            const rootFolderName = file.webkitRelativePath.split('/')[0];
            
            if (!foldersMap.has(rootFolderName)) {
                foldersMap.set(rootFolderName, []);
            }
            foldersMap.get(rootFolderName).push(file);
        });

        // 2. Создаем UI элементы для каждой корневой папки
        foldersMap.forEach((filesInFolder, folderName) => {
            const totalFiles = filesInFolder.length;
            
            const itemEl = document.createElement('div');
            itemEl.className = 'upload-item folder-upload-item';
            
            itemEl.innerHTML = `
                <div class="item-header">
                    <span class="item-name" title="${folderName}">📁 ${folderName} (${totalFiles} файлов)</span>
                    <button class="cancel-btn" title="Отменить загрузку">×</button>
                </div>
                <div class="item-status">Подготовка...</div>
                <div class="progress-bg">
                    <div class="progress-bar"></div>
                </div>
                <div class="folder-details" style="font-size: 0.8rem; color: var(--muted); margin-top: 5px;">
                   


                </div>
            `;
            
            this.uploadList.insertBefore(itemEl, this.uploadList.firstChild);

            const cancelBtn = itemEl.querySelector('.cancel-btn');
            const statusEl = itemEl.querySelector('.item-status');
            const barEl = itemEl.querySelector('.progress-bar');
            const detailsEl = itemEl.querySelector('.folder-details');

            let completedCount = 0;
            let isCancelled = false;

            cancelBtn.onclick = () => {
                isCancelled = true;
                itemEl.classList.add('cancelled');
                statusEl.textContent = '⛔ Отмена...';
            };

            this.show();

            // 3. Добавляем файлы в очередь с ссылкой на родительский UI
            filesInFolder.forEach(file => {
                this.queue.push({ 
                    file, 
                    isPartOfFolder: true,
                    parentUi: {
                        element: itemEl,
                        updateProgress: () => {
                            if (isCancelled) return;
                            completedCount++;
                            const percent = (completedCount / totalFiles) * 100;
                            barEl.style.width = percent + '%';
                            // detailsEl.textContent = `Загружено: ${completedCount} / ${totalFiles}`;
                            
                            if (completedCount === totalFiles) {
                                statusEl.textContent = '✅ Папка загружена';
                                itemEl.classList.add('success');
                                cancelBtn.style.display = 'none';
                                setTimeout(() => itemEl.remove(), 3000);
                            }
                        },
                        setError: (msg) => {
                            statusEl.textContent = '❌ Ошибка: ' + msg;
                            itemEl.classList.add('error');
                        }
                    },
                    cancelled: false 
                });
            });
        });

        if (!this.isUploading) {
            this.processQueue();
        }
    }
// ... existing code ...
// ... existing code ...


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

    // ... existing code ...
    async processQueue() {
        if (this.queue.length === 0) {
            this.isUploading = false;
            return;
        }

        this.isUploading = true;
        
        const queueItem = this.queue[0]; 
        
        // Если элемент был удален или отменен
        if ((queueItem.uiItem && !document.body.contains(queueItem.uiItem.element)) || queueItem.cancelled) {
            this.queue.shift();
            this.processQueue();
            return;
        }

        try {
            await this.startUpload(queueItem);
        } catch (err) {
            if (err.message !== 'Cancelled' && err.name !== 'AbortError') {
                console.error("Ошибка при загрузке:", queueItem.file.name, err);
                if (queueItem.uiItem) queueItem.uiItem.setError('Ошибка');
                if (queueItem.parentUi) queueItem.parentUi.setError('Ошибка в файле: ' + queueItem.file.name);
            }
        } finally {
            this.queue.shift();
            
            // Увеличиваем паузу до 300мс, чтобы браузер успевал освобождать ресурсы
            setTimeout(() => {
                this.processQueue();
            }, 1000); 
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
            
            if (queueItem.parentUi && queueItem.parentUi.element.classList.contains('cancelled')) {
                 reject(new Error('Cancelled'));
                 return;
            }

            (async () => {
                let retries = 3;
                let hash = null;
                let skipFile = false;

                while (retries > 0 && !hash && !skipFile) {
                    try {
                        if (queueItem.cancelled) { 
                            reject(new Error('Cancelled')); 
                            return; 
                        }

                        if (uiItem) uiItem.setStatus(`Вычисление хеша...`);
                        
                        hash = await computeFileHash(file);
                    } catch (e) {
                        if (e.message === 'FileNotReadable') {
                            console.warn(`[UPLOAD] Skipping unreadable file: ${file.name}`);
                            skipFile = true;
                            break;
                        }
                        
                        retries--;
                        console.warn(`[HASH] Retry attempt for ${file.name}. Left: ${retries}`);
                        if (retries === 0) {
                            console.error(`[HASH] Failed to compute hash for ${file.name} after 3 attempts`, e);
                            throw e;
                        }
                        await new Promise(r => setTimeout(r, 500));
                    }
                }

                if (skipFile) {
                    if (queueItem.parentUi) {
                        queueItem.parentUi.updateProgress();
                    } else if (uiItem) {
                        uiItem.setStatus('⚠️ Пропущен');
                        uiItem.setSuccess();
                    }
                    resolve();
                    return;
                }
                    
                if (queueItem.cancelled) { 
                    reject(new Error('Cancelled')); 
                    return; 
                }

                if (uiItem) uiItem.setStatus('Проверка...');
                let folderPath = '';
                if (file.webkitRelativePath) {
                    const parts = file.webkitRelativePath.split('/');
                    if (parts.length > 1) {
                        folderPath = parts.slice(0, -1).join('/');
                    }
                }
                const checkData = await checkFileExists(hash, folderPath);
                
                if (queueItem.cancelled) { 
                    reject(new Error('Cancelled')); 
                    return; 
                }

                if (checkData.exists && checkData.owned) {
                    if (uiItem) uiItem.setStatus('Пропуск (уже есть)');
                    if (queueItem.parentUi) queueItem.parentUi.updateProgress();
                    resolve();
                    return;
                }
                
                if (uiItem) uiItem.setStatus('Загрузка...');

                uploadFile(file, hash, 
                    (pct) => { 
                        if (uiItem) uiItem.setProgress(50 + (pct / 2));
                    },
                    (res) => {
                        if (queueItem.cancelled) { 
                            reject(new Error('Cancelled')); 
                            return; 
                        }

                         if (res && res.success) {
                                console.log('[UPLOAD] Server response:', res);
                                
                                if (res.message === 'Файл уже загружен' || res.message === 'File already exists') {
                                    uiItem.setStatus('Файл уже загружен');
                                } else {
                                    uiItem.setSuccess();
                                }
                                
                                const bar = uiItem.element.querySelector('.progress-bar');
                                if (bar) {
                                    bar.style.width = '100%';
                                    bar.style.backgroundColor = '#10b981';
                                }
                                uiItem.element.classList.add('success');

                                if (this.onUploadComplete && res.file_data && res.message !== 'Файл уже загружен' && res.message !== 'File already exists') {
                                    this.onUploadComplete(res.file_data);
                                }
                                
                                resolve();
                            } else {
                                console.error('[UPLOAD] Upload failed:', res);
                                
                                // Проверяем, не ошибка ли это rate limiting (429)
                                if (res.error && (res.error.includes('429') || res.error.includes('Too Many'))) {
                                    uiItem.setStatus('⏳ Превышен лимит, повтор...');
                                    
                                    // Ждем 3 секунды и повторяем
                                    setTimeout(() => {
                                        this.queue.unshift(queueItem);
                                        this.processQueue();
                                    }, 3000);
                                    
                                    resolve();
                                    return;
                                }
                                
                                uiItem.setError(res?.error || 'Ошибка сервера');
                                reject(new Error(res?.error));
                            }
                    },
                    (err) => {
                        if (uiItem) uiItem.setError(err.message);
                        reject(err);
                    },
                    null,
                    folderPath
                );
            })().catch(err => {
                if (err.message === 'Cancelled' || err.name === 'AbortError') {
                    reject(new Error('Cancelled'));
                } else {
                    console.error('[UPLOAD] CRITICAL Exception in startUpload:', err);
                    if (uiItem) uiItem.setError('Ошибка обработки');
                    if (queueItem.parentUi) queueItem.parentUi.setError('Ошибка обработки');
                    reject(err);
                }
            });
        });
    }
}