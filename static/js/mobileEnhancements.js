// mobileEnhancements.js - Улучшения мобильного UX

import { clientLogger } from './logger.js';

export class MobileEnhancements {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.currentFilter = 'all';
        this.init();
    }
    
    init() {
        if (!this.isMobile) return;
        
        this.addQuickFilters();
        this.addVideoInfo();
        
        clientLogger.info('Mobile enhancements initialized');
    }
    
    // Добавляет быстрые фильтры
    addQuickFilters() {
        const header = document.querySelector('.files-header');
        if (!header) return;
        
        const filtersContainer = document.createElement('div');
        filtersContainer.className = 'quick-filters';
        // filtersContainer.innerHTML = `
        //     <button class="filter-chip active" data-filter="all">Все</button>
        //     <button class="filter-chip" data-filter="video">🎥 Видео</button>
        //     <button class="filter-chip" data-filter="image">🖼️ Фото</button>
        //     <button class="filter-chip" data-filter="unpublished">⏳ Новые</button>
        // `;
        
        header.after(filtersContainer);
        
        // Обработчики кликов
        filtersContainer.addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;
            
            // Обновляем активный фильтр
            filtersContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            this.currentFilter = chip.dataset.filter;
            this.applyFilter();
            
            clientLogger.info(`Filter changed to: ${this.currentFilter}`);
        });
    }
    
    // Применяет фильтр к файлам
    applyFilter() {
        const cards = document.querySelectorAll('.file-card');
        
        cards.forEach(card => {
            const shortId = card.dataset.shortId;
            if (!shortId) return;
            
            const fileData = this.getFileData(shortId);
            if (!fileData) return;
            
            let shouldShow = true;
            
            switch (this.currentFilter) {
                case 'video':
                    shouldShow = this.isVideoFile(fileData.filename);
                    break;
                case 'image':
                    shouldShow = this.isImageFile(fileData.filename);
                    break;
                case 'unpublished':
                    shouldShow = !fileData.published;
                    break;
                default:
                    shouldShow = true;
            }
            
            card.style.display = shouldShow ? '' : 'none';
        });
    }
    
    // Проверяет является ли файл видео
    isVideoFile(filename) {
        const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];
        const ext = filename.split('.').pop().toLowerCase();
        return videoExts.includes(ext);
    }
    
    // Проверяет является ли файл изображением
    isImageFile(filename) {
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
        const ext = filename.split('.').pop().toLowerCase();
        return imageExts.includes(ext);
    }
    
    // Получает данные файла из глобального состояния
    getFileData(shortId) {
        // Предполагаем что allFiles доступен глобально
        if (window.allFiles) {
            return window.allFiles.find(f => f.short_id === shortId);
        }
        return null;
    }
    
    // Добавляет информацию о видео на карточки
    addVideoInfo() {
        const videoCards = document.querySelectorAll('.file-card');
        
        videoCards.forEach(card => {
            const shortId = card.dataset.shortId;
            const fileData = this.getFileData(shortId);
            
            if (!fileData || !this.isVideoFile(fileData.filename)) return;
            
            // Добавляем бейдж с длительностью (если доступна)
            const videoInfo = document.createElement('div');
            videoInfo.className = 'video-info';
            videoInfo.textContent = '▶ VIDEO';
            
            const iconPlaceholder = card.querySelector('.file-icon-placeholder');
            if (iconPlaceholder && !card.querySelector('.video-info')) {
                iconPlaceholder.appendChild(videoInfo);
            }
        });
    }
}

// Экспортируем функцию инициализации
export function initMobileEnhancements() {
    return new MobileEnhancements();
}