// ui.js
import { getIconForFile } from './utils.js';

/**
 * Экранирует HTML-символы для защиты от XSS
 * @param {string} text - Текст для экранирования
 * @returns {string} Безопасный текст
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === КЭШИРОВАНИЕ ПРЕВЬЮ ===
const PREVIEW_CACHE_KEY = 'file_preview_cache';
const CACHE_EXPIRY_HOURS = 24; // Кэш действует 24 часа

/**
 * Получает превью из кэша
 * @param {string} shortId - ID файла
 * @returns {string|null} Base64 превью или null
 */
function getCachedPreview(shortId) {
    try {
        const cache = JSON.parse(localStorage.getItem(PREVIEW_CACHE_KEY) || '{}');
        const cached = cache[shortId];
        
        if (!cached) return null;
        
        // Проверяем срок действия кэша
        const cachedTime = new Date(cached.timestamp);
        const now = new Date();
        const hoursDiff = (now - cachedTime) / (1000 * 60 * 60);
        
        if (hoursDiff > CACHE_EXPIRY_HOURS) {
            // Кэш устарел, удаляем
            delete cache[shortId];
            localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(cache));
            return null;
        }
        
        return cached.preview;
    } catch (e) {
        console.warn('Failed to read preview cache:', e);
        return null;
    }
}

/**
 * Сохраняет превью в кэш
 * @param {string} shortId - ID файла
 * @param {string} preview - Base64 превью
 */
function savePreviewToCache(shortId, preview) {
    try {
        const cache = JSON.parse(localStorage.getItem(PREVIEW_CACHE_KEY) || '{}');
        
        // Ограничиваем размер кэша (максимум 50 превью)
        const keys = Object.keys(cache);
        if (keys.length >= 50) {
            // Удаляем самое старое превью
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
        console.warn('Failed to save preview to cache:', e);
        // Если localStorage переполнен, очищаем весь кэш
        if (e.name === 'QuotaExceededError') {
            localStorage.removeItem(PREVIEW_CACHE_KEY);
            console.log('Preview cache cleared due to quota exceeded');
        }
    }
}

/**
 * Очищает весь кэш превью
 */
export function clearPreviewCache() {
    localStorage.removeItem(PREVIEW_CACHE_KEY);
    console.log('Preview cache cleared');
}
// === КОНЕЦ КЭШИРОВАНИЯ ===

export function updateFileCount(element, count, total = null) {
    if (!element) return;
    
    const displayCount = total !== null ? total : count;
    const word = displayCount === 1 ? 'файл' : (displayCount >= 2 && displayCount <= 4 ? 'файла' : 'файлов');
    element.textContent = `${displayCount} ${word}`;
}

/**
 * Рендерит сетку файлов
 */
export function renderFilesGrid(filesListContainer, files) {
    // 1. ЖЕСТКО убираем спиннер из DOM, если он есть
    const spinnerWrapper = filesListContainer.querySelector('.spinner-wrapper');
    if (spinnerWrapper) {
        spinnerWrapper.remove();
    }
    
    // 2. Снимаем класс loading
    filesListContainer.classList.remove('loading');

    // 3. Если файлов нет, показываем заглушку
    if (!files || files.length === 0) {
        filesListContainer.innerHTML = `
            <div class="no-files">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📂</div>
                <h3>Здесь пока пусто</h3>
                <p>Загрузите свой первый файл, чтобы он появился здесь.</p>
            </div>
        `;
        return;
    }

    // 4. Если файлы есть, рендерим их
    const fragment = document.createDocumentFragment();

    for (const file of files) {
        let card = filesListContainer.querySelector(`.file-card[data-short-id="${file.short_id}"]`);

        if (!card) {
            const icon = getIconForFile(file.filename);
            card = document.createElement('div');
            card.className = 'file-card';
            card.setAttribute('data-short-id', file.short_id);
            
            // БЕЗОПАСНАЯ вставка имени файла через escapeHtml
            const safeFilename = escapeHtml(file.filename);
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
            // Запускаем загрузку превью для новых карточек
            loadPreviewForCard(card, file.short_id);
        }

        fragment.appendChild(card);
    }

    filesListContainer.innerHTML = ''; 
    filesListContainer.appendChild(fragment);
}

/**
 * Загружает превью для конкретной карточки (с кэшированием)
 */
async function loadPreviewForCard(card, shortId) {
    // Сначала проверяем кэш
    const cachedPreview = getCachedPreview(shortId);
    if (cachedPreview) {
        applyPreviewToCard(card, cachedPreview);
        return;
    }
    
    // Если нет в кэше, запрашиваем с сервера
    try {
        const res = await fetch(`/api/preview/${shortId}`);
        if (!res.ok) return;
        
        const data = await res.json();
        
        if (data.has_preview && data.preview) {
            // Сохраняем в кэш
            savePreviewToCache(shortId, data.preview);
            // Применяем к карточке
            applyPreviewToCard(card, data.preview);
        }
    } catch (e) {
        console.warn("Ошибка загрузки превью", e);
    }
}

/**
 * Применяет превью к карточке файла
 */
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

/**
 * Добавляет один файл в начало сетки
 */
export async function addFileToGrid(filesListContainer, fileData) {
    const noFilesMsg = filesListContainer.querySelector('.no-files');
    if (noFilesMsg) noFilesMsg.remove();

    if (filesListContainer.querySelector(`.file-card[data-short-id="${fileData.short_id}"]`)) {
        return;
    }

    const icon = getIconForFile(fileData.filename);
    const newCard = document.createElement('div');
    newCard.className = 'file-card';
    newCard.setAttribute('data-short-id', fileData.short_id);
    
    // БЕЗОПАСНАЯ вставка имени файла через escapeHtml
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
    
    filesListContainer.insertBefore(newCard, filesListContainer.firstChild);
    loadPreviewForCard(newCard, fileData.short_id);
}