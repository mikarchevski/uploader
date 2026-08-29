// uploadManager.js
import { computeFileHash } from './utils.js';
import { checkFileExists, uploadFile } from './api.js';
import { clientLogger } from './logger.js';

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

        // ДЕЛЕГИРОВАНИЕ СОБЫТИЙ ДЛЯ КРЕСТИКОВ
        if (this.uploadList) {
            this.uploadList.addEventListener('click', (e) => {
                // Ищем крестик (включая вложенные элементы)
                const cancelBtn = e.target.closest('.cancel-btn');

                if (!cancelBtn) return;

                // Находим родительский элемент загрузки
                const uploadItem = cancelBtn.closest('.upload-item');
                if (!uploadItem) return;

                // Ищем индекс этого элемента в очереди
                const queueItem = this.queue.find(item => {
                    if (item.uiItem && item.uiItem.element === uploadItem) {
                        return true;
                    }
                    if (item.parentUi && item.parentUi.element === uploadItem) {
                        return true;
                    }
                    return false;
                });

                if (!queueItem) {
                    return;
                }

                // Отмечаем как отмененный
                queueItem.cancelled = true;

                // Прерываем XHR если есть
                if (queueItem.xhr) {
                    queueItem.xhr.abort();
                }

                // Обновляем UI
                if (queueItem.uiItem) {
                    queueItem.uiItem.setCancelled();
                }

                // Если это часть папки
                if (queueItem.parentUi) {
                    queueItem.parentUi.updateProgress();
                }
            });
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

    // ... existing code ...
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
    addFolderToQueue(filesArray) {
        // 1. Находим корневую папку (наименьший общий префикс всех путей)
        const rootPath = this.findRootPath(filesArray);

        // 2. Группируем все файлы по их полному пути (включая вложенные папки)
        const allFilesMap = new Map();

        filesArray.forEach(file => {
            if (!file.webkitRelativePath) return;

            // Используем полный путь файла как ключ
            const filePath = file.webkitRelativePath;
            allFilesMap.set(filePath, file);
        });

        // 3. Создаем UI элемент только для корневой папки
        const totalFiles = allFilesMap.size;
        const rootName = rootPath.split('/').pop() || 'Root';

        const itemEl = document.createElement('div');
        itemEl.className = 'upload-item folder-upload-item';

        itemEl.innerHTML = `
            <div class="item-header">
                <span class="item-name" title="${rootPath}">📁 ${rootName} (${totalFiles} файлов)</span>
                <button class="cancel-btn" title="Отменить загрузку">×</button>
            </div>
            <div class="item-status">Подготовка...</div>
            <div class="progress-bg">
                <div class="progress-bar"></div>
            </div>
            <div class="folder-details" style="font-size: 0.8rem; color: var(--muted); margin-top: 5px;">
                Путь: ${rootPath}
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

        // 4. Добавляем все файлы в очередь с ссылкой на родительский UI
        allFilesMap.forEach((file, filePath) => {
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

        this.show();

        if (!this.isUploading) {
            this.processQueue();
        }
    }

    // Новый метод для нахождения корневого пути
    findRootPath(filesArray) {
        if (!filesArray || filesArray.length === 0) return '';

        // Получаем первый путь
        const firstPath = filesArray[0].webkitRelativePath;
        if (!firstPath) return '';

        // Разбиваем на части
        const parts = firstPath.split('/');

        // Если есть только один файл, возвращаем его путь
        if (filesArray.length === 1) return firstPath;

        // Находим общий префикс для всех путей
        let commonPrefix = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const prefix = parts.slice(0, i + 1).join('/');

            // Проверяем, есть ли этот префикс у всех других файлов
            let hasCommonPrefix = true;
            for (let j = 1; j < filesArray.length; j++) {
                const otherPath = filesArray[j].webkitRelativePath;
                if (!otherPath.startsWith(prefix)) {
                    hasCommonPrefix = false;
                    break;
                }
            }

            if (hasCommonPrefix) {
                commonPrefix = prefix;
            } else {
                break;
            }
        }

        return commonPrefix;
    }

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
                        // Обновляем прогресс для родительского UI (если есть)
                        if (queueItem.parentUi) {
                            queueItem.parentUi.updateProgress();
                        }

                        // Обновляем прогресс для отдельного файла (если есть)
                        if (uiItem) {
                            uiItem.setProgress(50 + (pct / 2));
                        }
                    },
                    (res) => {
                        if (queueItem.cancelled) {
                            reject(new Error('Cancelled'));
                            return;
                        }

                        if (res && res.success) {
                            if (res.message === 'Файл уже загружен' || res.message === 'File already exists') {
                                if (uiItem) uiItem.setStatus('Файл уже загружен');
                                clientLogger.info(`File already exists: ${file.name}`);
                            } else {
                                if (uiItem) uiItem.setSuccess();
                                clientLogger.info(`File uploaded successfully: ${file.name} (${res.file_data?.short_id})`);
                            }

                            if (uiItem) {
                                const bar = uiItem.element.querySelector('.progress-bar');
                                if (bar) {
                                    bar.style.width = '100%';
                                    bar.style.backgroundColor = '#10b981';
                                }
                                uiItem.element.classList.add('success');
                            }

                            if (this.onUploadComplete && res.file_data && res.message !== 'Файл уже загружен' && res.message !== 'File already exists') {
                                this.onUploadComplete(res.file_data);
                            }

                            resolve();
                        } else {
                            console.error('[UPLOAD] Upload failed:', res);
                            clientLogger.error(`Upload failed for ${file.name}: ${res.error || 'Unknown error'}`);

                            // Проверяем, не ошибка ли это rate limiting (429)
                            if (res.error && (res.error.includes('429') || res.error.includes('Too Many'))) {
                                if (uiItem) uiItem.setStatus('⏳ Превышен лимит, повтор...');

                                // Ждем 3 секунды и повторяем
                                setTimeout(() => {
                                    this.queue.unshift(queueItem);
                                    this.processQueue();
                                }, 3000);

                                resolve();
                                clientLogger.error(`Upload failed for ${file.name}: ${res.error || 'Rate limiting'}`);
                                return;
                            }

                            if (uiItem) uiItem.setError(res?.error || 'Ошибка сервера');
                            reject(new Error(res?.error));
                        }
                    },
                    (err) => {
                        if (uiItem) uiItem.setError(err.message);
                        reject(err);
                    },
                    (xhr) => {
                        // СОХРАНЯЕМ XHR ДЛЯ ВОЗМОЖНОСТИ ОТМЕНЫ!
                        queueItem.xhr = xhr;
                    },
                    folderPath
                );
            })().catch(err => {
                if (err.message === 'Cancelled' || err.name === 'AbortError') {
                    reject(new Error('Cancelled'));
                } else {
                    console.error('[UPLOAD] CRITICAL Exception in startUpload:', err);
                    clientLogger.error(`Upload failed for ${file.name}: ${err.message || 'CRITICAL Exception in startUpload'}`);
                    console.error('[UPLOAD] CRITICAL Exception in startUpload:', err);
                    clientLogger.error(`Upload failed for ${file.name}: ${res.error || 'ICAL Exception in startUpload'}`);
                    if (uiItem) uiItem.setError('Ошибка обработки');
                    if (queueItem.parentUi) queueItem.parentUi.setError('Ошибка обработки');
                    reject(err);
                }
            });
        });
    }
}