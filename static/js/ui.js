// ui.js
import { getIconForFile } from './utils.js';
import { clientLogger } from './logger.js';

/**
 * Экранирует HTML-символы для защиты от XSS
 * @param {string} text - Текст для экранирования
 * @returns {string} Безопасный текст
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === КЭШИРОВАНИЕ ПРЕВЬЮ ===
const PREVIEW_CACHE_KEY = 'file_preview_cache';
const CACHE_EXPIRY_HOURS = 24;

function getCachedPreview(shortId) {
    try {
        const cache = JSON.parse(localStorage.getItem(PREVIEW_CACHE_KEY) || '{}');
        const cached = cache[shortId];

        if (!cached) return null;

        const cachedTime = new Date(cached.timestamp);
        const now = new Date();
        const hoursDiff = (now - cachedTime) / (1000 * 60 * 60);

        if (hoursDiff > CACHE_EXPIRY_HOURS) {
            delete cache[shortId];
            localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(cache));
            return null;
        }

        return cached.preview;
    } catch (e) {
        clientLogger.warn('Failed to read preview cache', e.message);
        return null;
    }
}

function savePreviewToCache(shortId, preview) {
    try {
        const cache = JSON.parse(localStorage.getItem(PREVIEW_CACHE_KEY) || '{}');

        const keys = Object.keys(cache);
        if (keys.length >= 50) {
            const oldestKey = keys.reduce((a, b) =>
                new Date(cache[a].timestamp) < new Date(cache[b].timestamp) ? a : b
            );
            delete cache[oldestKey];
        }

        cache[shortId] = {
            preview: preview,
            timestamp: new Date().toISOString()
        };

        localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        clientLogger.warn('Failed to save preview to cache', e.message);
        if (e.name === 'QuotaExceededError') {
            localStorage.removeItem(PREVIEW_CACHE_KEY);
            clientLogger.info('Preview cache cleared due to quota exceeded');
        }
    }
}

export function clearPreviewCache() {
    localStorage.removeItem(PREVIEW_CACHE_KEY);
    clientLogger.info('Preview cache cleared');
}
// === КОНЕЦ КЭШИРОВАНИЯ ===

export function updateFileCount(element, count, total = null) {
    if (!element) return;

    const displayCount = total !== null ? total : count;
    const word = displayCount === 1 ? 'файл' : (displayCount >= 2 && displayCount <= 4 ? 'файла' : 'файлов');
    element.textContent = `${displayCount} ${word}`;
}

// --- ФУНКЦИИ LIGHTBOX ---
// --- ФУНКЦИИ LIGHTBOX ---
function openImageModal(src, filename) {
    clientLogger.info(`Opening image modal: ${filename}`);

    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const captionText = document.getElementById('caption');
    const closeBtn = document.querySelector('#imageModal .close-modal');

    if (!modal) {
        clientLogger.error('Lightbox modal elements not found in DOM');
        return;
    }

    // Удаляем класс hidden и показываем модальное окно
    modal.classList.remove('hidden');
    modal.style.display = "block";
    modalImg.src = src;
    captionText.innerHTML = escapeHtml(filename);

    // Закрытие по крестику
    closeBtn.onclick = function () {
        modal.style.display = "none";
        modal.classList.add('hidden');
        modalImg.src = "";
    }

    // Закрытие по клику вне картинки
    modal.onclick = function (event) {
        if (event.target === modal) {
            modal.style.display = "none";
            modal.classList.add('hidden');
            modalImg.src = "";
        }
    }

    // Закрытие по Esc
    document.addEventListener('keydown', function closeModalOnEsc(e) {
        if (e.key === "Escape") {
            modal.style.display = "none";
            modal.classList.add('hidden');
            modalImg.src = "";
            document.removeEventListener('keydown', closeModalOnEsc);
        }
    });
}

function openVideoModal(videoUrl, filename) {
    clientLogger.info(`Opening video modal: ${filename}`);

    const modal = document.getElementById('videoModal');
    const modalVideo = document.getElementById('modalVideo');
    const captionText = document.getElementById('videoCaption');
    const closeBtn = document.getElementById('closeVideoModal');

    if (!modal) {
        clientLogger.error('Video modal elements not found in DOM');
        return;
    }

    // Показываем модальное окно
    modal.classList.remove('hidden');
    modal.style.display = "block";

    // Устанавливаем источник видео и запускаем воспроизведение
    modalVideo.src = videoUrl;
    modalVideo.load();
    captionText.innerHTML = escapeHtml(filename);

    // Автозапуск видео
    modalVideo.play().catch(e => {
        clientLogger.warn('Autoplay failed:', e.message);
    });

    // Закрытие по крестику
    closeBtn.onclick = function () {
        modalVideo.pause();
        modalVideo.src = "";
        modal.style.display = "none";
        modal.classList.add('hidden');
    }

    // Закрытие по клику вне видео
    modal.onclick = function (event) {
        if (event.target === modal) {
            modalVideo.pause();
            modalVideo.src = "";
            modal.style.display = "none";
            modal.classList.add('hidden');
        }
    }

    // Закрытие по Esc
    document.addEventListener('keydown', function closeVideoOnEsc(e) {
        if (e.key === "Escape") {
            modalVideo.pause();
            modalVideo.src = "";
            modal.style.display = "none";
            modal.classList.add('hidden');
            document.removeEventListener('keydown', closeVideoOnEsc);
        }
    });
}

export function attachDoubleClick(card, file) {
    const ext = file.filename.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];

    if (imageExts.includes(ext)) {
        card.style.cursor = 'pointer';
        card.addEventListener('dblclick', () => {
            openImageModal(file.url, file.filename);
        });
    } else if (videoExts.includes(ext)) {
        card.style.cursor = 'pointer';
        card.addEventListener('dblclick', () => {
            openVideoModal(file.url, file.filename);
        });
    }
}
// --- КОНЕЦ LIGHTBOX ---



export function renderFilesGrid(filesListContainer, files, folderNav = null) {
    const currentFolder = folderNav ? folderNav.getCurrentFolder() : null;

    const spinnerWrapper = filesListContainer.querySelector('.spinner-wrapper');
    if (spinnerWrapper) spinnerWrapper.remove();
    filesListContainer.classList.remove('loading');

    if (!files || files.length === 0) {
        const isInFolder = folderNav && folderNav.getCurrentFolder();
        filesListContainer.innerHTML = `<div class="no-files"><h3>${isInFolder ? 'Папка пуста' : 'Здесь пока пусто'}</h3></div>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    // ... existing code ...
    if (currentFolder) {
        const subfolders = {};
        const directFiles = [];

        files.forEach(file => {
            const filePath = file.folder_path || '';

            if (filePath === currentFolder) {
                directFiles.push(file);
            }
            else if (filePath.startsWith(currentFolder + '/')) {
                const relativePath = filePath.substring(currentFolder.length + 1);

                // Получаем имя следующей папки в иерархии
                const nextFolderName = relativePath.split('/')[0];
                const subfolderPath = currentFolder + '/' + nextFolderName;

                if (!subfolders[subfolderPath]) {
                    subfolders[subfolderPath] = {
                        name: nextFolderName,
                        path: subfolderPath,
                        count: 0,
                        hasDeeperSubfolders: false
                    };
                }
                subfolders[subfolderPath].count++;

                // Проверяем, есть ли ещё более глубокие подпапки
                const remainingPath = relativePath.substring(nextFolderName.length);
                if (remainingPath.startsWith('/') && remainingPath.includes('/')) {
                    subfolders[subfolderPath].hasDeeperSubfolders = true;
                }
            }
        });

        Object.values(subfolders).forEach(folder => {
            const folderCard = document.createElement('div');
            folderCard.className = 'file-card folder-card';
            folderCard.setAttribute('data-folder-path', folder.path);

            // Индикатор наличия более глубоких подпапок
            const deeperIndicator = folder.hasDeeperSubfolders ? ' 📂' : '';

            folderCard.innerHTML = `
                <div class="file-icon-placeholder">📁${deeperIndicator}</div>
                <div class="file-details">
                    <div class="file-card-name">${escapeHtml(folder.name)}</div>
                    <div class="file-card-meta">
                        <span>${folder.count} файлов</span>
                        <span>Папка</span>
                    </div>
                </div>
            `;
            fragment.appendChild(folderCard);
        });


        directFiles.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-card';
            card.setAttribute('data-short-id', file.short_id);

            const icon = getIconForFile(file.filename);
            const displayName = file.filename.includes('/') ? file.filename.split('/').pop() : file.filename;
            const safeFilename = escapeHtml(displayName);

            // Проверяем, является ли файл видео
            const ext = file.filename.split('.').pop().toLowerCase();
            const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];
            const isVideo = videoExts.includes(ext);

            // Создаём HTML карточки с возможным бейджем
            let cardHTML = `
                <div class="file-icon-placeholder">${icon}</div>
                <div class="file-details">
                    <div class="file-card-name" title="${safeFilename}">${safeFilename}</div>
                    <div class="file-card-meta">
                        <span>${escapeHtml(file.size)}</span>
                        <span>${escapeHtml(file.date)}</span>
                    </div>
                </div>
            `;

            // Добавляем бейдж для видео
            if (isVideo) {
                cardHTML = `
                    <div class="video-badge">VIDEO</div>
                    ${cardHTML}
                `;
            }

            card.innerHTML = cardHTML;
            fragment.appendChild(card);

            // Добавляем обработчик двойного клика
            attachDoubleClick(card, file);
        });

        // ... existing code ...
        // ... existing code ...
        // ... existing code ...
    } else {
        const folders = {};
        const rootFiles = [];

        files.forEach(file => {
            if (file.folder_path && file.folder_path.trim() !== '') {
                // Используем полный путь как ключ для группировки
                const folderPath = file.folder_path;

                if (!folders[folderPath]) {
                    // Получаем имя папки (последний сегмент пути)
                    const folderName = folderPath.split('/').pop();
                    // Получаем родительский путь
                    const parentPath = folderPath.includes('/')
                        ? folderPath.substring(0, folderPath.lastIndexOf('/'))
                        : '';

                    folders[folderPath] = {
                        name: folderName,
                        path: folderPath,
                        parentPath: parentPath,
                        count: 0,
                        hasSubfolders: false,
                        subfolderPaths: new Set()
                    };
                }
                folders[folderPath].count++;

                // Проверяем, есть ли у этой папки подпапки
                // (ищем другие файлы с путём, начинающимся с этого пути + '/')
            } else {
                rootFiles.push(file);
            }
        });

        // Теперь проверяем, какие папки являются подпапками других
        Object.keys(folders).forEach(folderPath => {
            Object.keys(folders).forEach(otherPath => {
                if (otherPath.startsWith(folderPath + '/')) {
                    folders[folderPath].hasSubfolders = true;
                    folders[folderPath].subfolderPaths.add(otherPath);
                }
            });
        });

        // Показываем только папки первого уровня (у которых нет родителя в списке)
        Object.values(folders).forEach(folder => {
            // Проверяем, является ли эта папка подпапкой другой папки из списка
            const isSubfolder = Object.keys(folders).some(otherPath =>
                otherPath !== folder.path && folder.path.startsWith(otherPath + '/')
            );

            // Показываем только корневые папки (не подпапки)
            if (!isSubfolder) {
                const folderCard = document.createElement('div');
                folderCard.className = 'file-card folder-card';
                folderCard.setAttribute('data-folder-path', folder.path);

                // Добавляем индикатор наличия подпапок
                const subfolderIndicator = folder.hasSubfolders ? ' 📂' : '';
                const subfolderCount = folder.subfolderPaths.size;
                const subfolderText = subfolderCount > 0 ? ` (${subfolderCount} подпапок)` : '';

                folderCard.innerHTML = `
                    <div class="file-icon-placeholder">📁${subfolderIndicator}</div>
                    <div class="file-details">
                        <div class="file-card-name" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</div>
                        <div class="file-card-meta">
                            <span>${folder.count} файлов${subfolderText}</span>
                            <span>Папка</span>
                        </div>
                    </div>
                `;
                fragment.appendChild(folderCard);
            }
        });

        rootFiles.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-card';
            card.setAttribute('data-short-id', file.short_id);
            const icon = getIconForFile(file.filename);
            const safeFilename = escapeHtml(file.filename);

            // Проверяем, является ли файл видео
            const ext = file.filename.split('.').pop().toLowerCase();
            const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];
            const isVideo = videoExts.includes(ext);

            // Создаём HTML карточки с возможным бейджем
            let cardHTML = `
                <div class="file-icon-placeholder">${icon}</div>
                <div class="file-details">
                    <div class="file-card-name" title="${safeFilename}">${safeFilename}</div>
                    <div class="file-card-meta">
                        <span>${file.size}</span>
                        <span>${file.date}</span>
                    </div>
                </div>
            `;

            // Добавляем бейдж для видео
            if (isVideo) {
                cardHTML = `
                    <div class="video-badge">VIDEO</div>
                    ${cardHTML}
                `;
            }

            card.innerHTML = cardHTML;
            fragment.appendChild(card);

            // Добавляем обработчик двойного клика
            attachDoubleClick(card, file);
        });
    }
    // ... existing code ...
    // ... existing code ...
    // ... existing code ...
    // ... existing code ...
    // ... existing code ...

    filesListContainer.innerHTML = '';
    filesListContainer.appendChild(fragment);

    // ПАКЕТНАЯ загрузка превью после рендеринга ВСЕХ карточек
    loadPreviewsBatch(files);
}

// ... existing code ...

async function loadPreviewForCard(card, shortId) {
    const cachedPreview = getCachedPreview(shortId);
    if (cachedPreview) {
        console.log(`[PREVIEW] ✓ Using cached preview for ${shortId}`);
        applyPreviewToCard(card, cachedPreview);
        return;
    }

    try {
        console.log(`[PREVIEW] Fetching preview for ${shortId}...`);

        // Используем новый endpoint с бинарным изображением
        const res = await fetch(`/api/preview-image/${shortId}`, {
            method: 'GET',
            headers: {
                'Accept': 'image/*'
            }
        });

        if (!res.ok) {
            console.warn(`[PREVIEW] ✗ Failed for ${shortId}: status ${res.status}`);
            clientLogger.warn(`Preview fetch failed for ${shortId}: status ${res.status}`);
            return;
        }

        // Конвертируем blob в base64 для кэширования
        const blob = await res.blob();
        const reader = new FileReader();

        reader.onloadend = function () {
            const base64data = reader.result;
            savePreviewToCache(shortId, base64data);
            applyPreviewToCard(card, base64data);
            clientLogger.info(`Applied preview for ${shortId} loaded (${blob.size} bytes)`);
        };

        reader.readAsDataURL(blob);

    } catch (e) {
        console.error(`[PREVIEW] ✗ Error for ${shortId}:`, e.message);
        clientLogger.error(`Preview fetch error for ${shortId}:`, e.message);
    }
}


export { loadPreviewForCard };

// ... existing code ...

async function loadPreviewsBatch(files) {
    if (!files || files.length === 0) return;

    // Расширения файлов которые поддерживают превью
    const supportedExtensions = new Set([
        'jpg', 'jpeg', 'png', 'webp', 'svg', 'gif',
        'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'
    ]);

    // Собираем все short_id файлов (исключаем папки и файлы без ID)
    const shortIds = files
        .filter(f => {
            // Исключаем папки
            if (f.type === 'folder' || (f.folder_path && f.folder_path.trim() !== '' && !f.short_id)) {
                return false;
            }
            // Требуем наличие short_id
            if (!f.short_id || typeof f.short_id !== 'string' || f.short_id.trim() === '') {
                return false;
            }
            // Проверяем расширение файла
            const ext = f.filename ? f.filename.split('.').pop().toLowerCase() : '';
            if (!supportedExtensions.has(ext)) {
                return false;
            }
            return true;
        })
        .map(f => f.short_id);

    if (shortIds.length === 0) {
        clientLogger.debug('[PREVIEW BATCH] No valid file IDs to process');
        return;
    }

    // Убираем дубликаты
    const uniqueShortIds = [...new Set(shortIds)];

    clientLogger.info(`[PREVIEW BATCH] Processing ${uniqueShortIds.length} unique files for preview loading`);

    const cardsMap = new Map();

    // Создаем маппинг short_id -> DOM элемент карточки
    uniqueShortIds.forEach(shortId => {
        const card = document.querySelector(`[data-short-id="${shortId}"]`);
        if (card) {
            cardsMap.set(shortId, card);
        } else {
            clientLogger.warn(`[PREVIEW BATCH] Card not found for short_id: ${shortId}`);
        }
    });

    // Проверяем кэш и разделяем файлы на закэшированные и требующие загрузки
    const uncachedIds = [];
    let cachedCount = 0;

    uniqueShortIds.forEach(shortId => {
        const cachedPreview = getCachedPreview(shortId);
        const card = cardsMap.get(shortId);

        if (cachedPreview && card) {
            applyPreviewToCard(card, cachedPreview);
            cachedCount++;
        } else if (card) {
            uncachedIds.push(shortId);
        }
    });
    clientLogger.info(`[PREVIEW BATCH] Cache: ${cachedCount}, Need to load: ${uncachedIds.length}`);

    // Если все файлы в кэше, выходим
    if (uncachedIds.length === 0) {
        clientLogger.info(`All ${uniqueShortIds.length} previews served from cache`);
        return;
    }

    // Загружаем превью параллельно через отдельные запросы к /api/preview-image
    // Это эффективнее чем batch с base64
    const promises = uncachedIds.map(async (shortId) => {
        try {
            const res = await fetch(`/api/preview-image/${shortId}`, {
                method: 'GET',
                headers: {
                    'Accept': 'image/*'
                }
            });

            if (!res.ok) {
                // Не логируем 404 - это нормально для файлов без превью (txt, lnk, pdf и т.д.)
                if (res.status !== 404) {
                    clientLogger.warn(`Preview fetch failed for ${shortId}: ${res.status}`);
                }
                return null;
            }

            const blob = await res.blob();
            const reader = new FileReader();

            return new Promise((resolve) => {
                reader.onloadend = function () {
                    const base64data = reader.result;
                    savePreviewToCache(shortId, base64data);

                    const card = cardsMap.get(shortId);
                    if (card) {
                        applyPreviewToCard(card, base64data);
                    }

                    resolve({ shortId, size: blob.size });
                };
                reader.readAsDataURL(blob);
            });

        } catch (e) {
            clientLogger.error(`Preview fetch error for ${shortId}:`, e.message);
            return null;
        }
    });

    // Ждём завершения всех загрузок
    const results = await Promise.allSettled(promises);

    const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
    const failed = results.length - successful;
    clientLogger.info(`Loaded ${successful} previews in batch (${failed} failed)`);
}

// ... existing code ...

// ... existing code ...

function applyPreviewToCard(card, previewData) {
    const placeholder = card.querySelector('.file-icon-placeholder');
    if (placeholder) {
        const img = document.createElement('img');
        img.src = previewData;
        img.alt = 'preview';
        img.className = 'file-preview-img';
        img.loading = 'lazy';
        placeholder.replaceWith(img);
    }
}

// ... existing code ...

export async function addFileToGrid(filesListContainer, fileData) {
    if (fileData.folder_path && fileData.folder_path.trim() !== '') {
        const folderPath = fileData.folder_path;

        // Проверяем, является ли эта папка подпапкой (содержит '/')
        const isSubfolder = folderPath.includes('/');

        // Если это подпапка, не добавляем её в корневую сетку
        if (isSubfolder) {
            clientLogger.info(`[ADD_FILE] Skipping subfolder display: ${folderPath}`);
            return;
        }

        let folderCard = filesListContainer.querySelector(`.file-card[data-folder-path="${escapeHtml(folderPath)}"]`);

        if (!folderCard) {
            const folderName = folderPath.split('/').pop();
            folderCard = document.createElement('div');
            folderCard.className = 'file-card folder-card';
            folderCard.setAttribute('data-folder-path', folderPath);
            folderCard.setAttribute('data-file-count', '1');

            folderCard.innerHTML = `
                <div class="file-icon-placeholder">📁</div>
                <div class="file-details">
                    <div class="file-card-name" title="${escapeHtml(folderName)}">${escapeHtml(folderName)}</div>
                    <div class="file-card-meta">
                        <span class="folder-file-count">1 файл</span>
                        <span>Папка</span>
                    </div>
                </div>
            `;

            filesListContainer.insertBefore(folderCard, filesListContainer.firstChild);
        } else {
            let count = parseInt(folderCard.getAttribute('data-file-count') || '0') + 1;
            folderCard.setAttribute('data-file-count', count);

            const countEl = folderCard.querySelector('.folder-file-count');
            if (countEl) {
                const word = count === 1 ? 'файл' : (count >= 2 && count <= 4 ? 'файла' : 'файлов');
                countEl.textContent = `${count} ${word}`;
            }
        }
    } else {
        const noFilesMsg = filesListContainer.querySelector('.no-files');
        if (noFilesMsg) noFilesMsg.remove();

        if (filesListContainer.querySelector(`.file-card[data-short-id="${fileData.short_id}"]`)) {
            return;
        }

        const icon = getIconForFile(fileData.filename);
        const newCard = document.createElement('div');
        newCard.className = 'file-card';
        newCard.setAttribute('data-short-id', fileData.short_id);

        const safeFilename = escapeHtml(fileData.filename);

        // Проверяем, является ли файл видео
        const ext = fileData.filename.split('.').pop().toLowerCase();
        const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];
        const isVideo = videoExts.includes(ext);

        // Создаём HTML карточки с возможным бейджем
        let cardHTML = `
            <div class="file-icon-placeholder">${icon}</div>
            <div class="file-details">
                <div class="file-card-name" title="${safeFilename}">${safeFilename}</div>
                <div class="file-card-meta">
                    <span>${escapeHtml(fileData.size)}</span>
                    <span>${escapeHtml(fileData.date)}</span>
                </div>
            </div>
        `;

        // Добавляем бейдж для видео
        if (isVideo) {
            cardHTML = `
                <div class="video-badge">VIDEO</div>
                ${cardHTML}
            `;
        }

        newCard.innerHTML = cardHTML;

        // const firstFolder = filesListContainer.querySelector('.folder-card');
        // if (firstFolder) {
        //     filesListContainer.insertBefore(newCard, firstFolder); 
        // } else {
        //     filesListContainer.insertBefore(newCard, filesListContainer.firstChild);
        // }
        filesListContainer.appendChild(newCard);


        loadPreviewForCard(newCard, fileData.short_id);
        attachDoubleClick(newCard, fileData);
    }
}