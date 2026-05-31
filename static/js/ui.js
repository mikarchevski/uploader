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
    closeBtn.onclick = function() { 
        modal.style.display = "none";
        modal.classList.add('hidden');
        modalImg.src = "";
    }

    // Закрытие по клику вне картинки
    modal.onclick = function(event) {
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
    closeBtn.onclick = function() { 
        modalVideo.pause();
        modalVideo.src = "";
        modal.style.display = "none";
        modal.classList.add('hidden');
    }

    // Закрытие по клику вне видео
    modal.onclick = function(event) {
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
        card.style.cursor = 'zoom-in';
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


export function renderFilesGrid(filesListContainer, files) {
    const currentFolder = window.folderNav ? window.folderNav.getCurrentFolder() : null;

    const spinnerWrapper = filesListContainer.querySelector('.spinner-wrapper');
    if (spinnerWrapper) spinnerWrapper.remove();
    filesListContainer.classList.remove('loading');

    if (!files || files.length === 0) {
        const isInFolder = window.folderNav && window.folderNav.getCurrentFolder();
        filesListContainer.innerHTML = `<div class="no-files"><h3>${isInFolder ? 'Папка пуста' : 'Здесь пока пусто'}</h3></div>`;
        return;
    }

    const fragment = document.createDocumentFragment();

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
                
                const subfolderName = relativePath.split('/')[0];
                const subfolderPath = currentFolder + '/' + subfolderName;
                
                if (!subfolders[subfolderPath]) {
                    subfolders[subfolderPath] = {
                        name: subfolderName,
                        path: subfolderPath,
                        count: 0
                    };
                }
                subfolders[subfolderPath].count++;
            }
        });

        Object.values(subfolders).forEach(folder => {
            const folderCard = document.createElement('div');
            folderCard.className = 'file-card folder-card';
            folderCard.setAttribute('data-folder-path', folder.path);
            folderCard.innerHTML = `
                <div class="file-icon-placeholder">📁</div>
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
            
            card.innerHTML = `
                <div class="file-icon-placeholder">${icon}</div>
                <div class="file-details">
                    <div class="file-card-name" title="${safeFilename}">${safeFilename}</div>
                    <div class="file-card-meta">
                        <span>${escapeHtml(file.size)}</span>
                        <span>${escapeHtml(file.date)}</span>
                    </div>
                </div>
            `;
            fragment.appendChild(card);
            
            // Добавляем обработчик двойного клика
            attachDoubleClick(card, file);
        });

    } else {
        const folders = {};
        const rootFiles = [];

        files.forEach(file => {
            if (file.folder_path && file.folder_path.trim() !== '') {
                const firstLevelFolder = file.folder_path.split('/')[0];
                
                if (!folders[firstLevelFolder]) {
                    folders[firstLevelFolder] = {
                        name: firstLevelFolder,
                        path: firstLevelFolder,
                        count: 0
                    };
                }
                folders[firstLevelFolder].count++;
            } else {
                rootFiles.push(file);
            }
        });

        Object.values(folders).forEach(folder => {
            const folderCard = document.createElement('div');
            folderCard.className = 'file-card folder-card';
            folderCard.setAttribute('data-folder-path', folder.path);
            folderCard.innerHTML = `
                <div class="file-icon-placeholder">📁</div>
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

        rootFiles.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-card';
            card.setAttribute('data-short-id', file.short_id);
            const icon = getIconForFile(file.filename);
            const safeFilename = escapeHtml(file.filename);
            card.innerHTML = `
                <div class="file-icon-placeholder">${icon}</div>
                <div class="file-details">
                    <div class="file-card-name">${safeFilename}</div>
                    <div class="file-card-meta">
                        <span>${file.size}</span>
                        <span>${file.date}</span>
                    </div>
                </div>
            `;
            fragment.appendChild(card);
            
            // Добавляем обработчик двойного клика
            attachDoubleClick(card, file);
        });
    }

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
        
        reader.onloadend = function() {
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

async function loadPreviewsBatch(files) {
    if (!files || files.length === 0) return;
    
    // Собираем все short_id файлов (исключаем папки)
    const shortIds = files
        .filter(f => !f.folder_path || f.folder_path.trim() === '' || f.short_id)
        .map(f => f.short_id)
        .filter(id => id); // убираем undefined
    
    if (shortIds.length === 0) return;
    clientLogger.info(`[PREVIEW BATCH] Processing ${shortIds.length} files for preview loading`);
    
    const cardsMap = new Map();
    
    // Создаем маппинг short_id -> DOM элемент карточки
    shortIds.forEach(shortId => {
        const card = document.querySelector(`[data-short-id="${shortId}"]`);
        if (card) {
            cardsMap.set(shortId, card);
        }
    });
    
    // Проверяем кэш и разделяем файлы на закэшированные и требующие загрузки
    const uncachedIds = [];
    let cachedCount = 0;
    
    shortIds.forEach(shortId => {
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
        clientLogger.info(`All ${shortIds.length} previews served from cache`);
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
                clientLogger.warn(`Preview fetch failed for ${shortId}: ${res.status}`);
                return null;
            }
            
            const blob = await res.blob();
            const reader = new FileReader();
            
            return new Promise((resolve) => {
                reader.onloadend = function() {
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

export async function addFileToGrid(filesListContainer, fileData) {
    if (fileData.folder_path && fileData.folder_path.trim() !== '') {
        const folderPath = fileData.folder_path;
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
        newCard.innerHTML = `
            <div class="file-icon-placeholder">${icon}</div>
            <div class="file-details">
                <div class="file-card-name" title="${safeFilename}">${safeFilename}</div>
                <div class="file-card-meta">
                    <span>${escapeHtml(fileData.size)}</span>
                    <span>${escapeHtml(fileData.date)}</span>
                </div>
            </div>
        `;
        
        const firstFolder = filesListContainer.querySelector('.folder-card');
        if (firstFolder) {
            filesListContainer.insertBefore(newCard, firstFolder); 
        } else {
            filesListContainer.insertBefore(newCard, filesListContainer.firstChild);
        }
        
        loadPreviewForCard(newCard, fileData.short_id);
        attachDoubleClick(newCard, fileData);
    }
}