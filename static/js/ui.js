// ui.js
import { getIconForFile } from './utils.js';

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
            card.innerHTML = `
                <div class="file-icon-placeholder">${icon}</div>
                <div class="file-details">
                    <div class="file-card-name" title="${file.filename}">${file.filename}</div>
                    <div class="file-card-meta">
                        <span>${file.size}</span>
                        <span>${file.date}</span>
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
 * Загружает превью для конкретной карточки
 */
async function loadPreviewForCard(card, shortId) {
    try {
        const res = await fetch(`/api/preview/${shortId}`);
        if (!res.ok) return;
        
        const data = await res.json();
        
        if (data.has_preview && data.preview) {
            const placeholder = card.querySelector('.file-icon-placeholder');
            if (placeholder) {
                const img = document.createElement('img');
                img.src = data.preview;
                img.alt = 'preview';
                img.className = 'file-preview-img';
                img.loading = 'lazy';
                placeholder.replaceWith(img);
            }
        }
    } catch (e) {
        console.warn("Ошибка загрузки превью", e);
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
    newCard.innerHTML = `
        <div class="file-icon-placeholder">${icon}</div>
        <div class="file-details">
            <div class="file-card-name" title="${fileData.filename}">${fileData.filename}</div>
            <div class="file-card-meta">
                <span>${fileData.size}</span>
                <span>${fileData.date}</span>
            </div>
        </div>
    `;
    
    filesListContainer.insertBefore(newCard, filesListContainer.firstChild);
    loadPreviewForCard(newCard, fileData.short_id);
}