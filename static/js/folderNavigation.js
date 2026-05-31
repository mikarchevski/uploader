import { clientLogger } from './logger.js';

/**
 * Модуль для управления навигацией по папкам и хлебными крошками
 */
export class FolderNavigation {
    constructor(options) {
        this.currentFolderPath = null;
        this.filesListContainer = options.filesListContainer;
        this.onNavigate = options.onNavigate;
        this.breadcrumbsContainer = document.getElementById('breadcrumbs');

        this.initEventDelegation();
        this.updateBreadcrumbs();
    }

    initEventDelegation() {
        if (!this.breadcrumbsContainer) return;
        
        this.breadcrumbsContainer.addEventListener('click', (e) => {
            const crumb = e.target.closest('.crumb');
            if (!crumb) return;
            
            e.preventDefault();
            
            const folderPath = crumb.dataset.folderPath;
            this.navigateToFolder(folderPath === 'null' ? null : folderPath);
        });
    }

    getCurrentFolder() {
        return this.currentFolderPath;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateBreadcrumbs() {
        if (!this.breadcrumbsContainer) return;
        
        if (!this.currentFolderPath) {
            this.breadcrumbsContainer.innerHTML = '<span class="crumb active" data-folder-path="null">🏠 Главная</span>';
        } else {
            const parts = this.currentFolderPath.split('/');
            let crumbsHTML = '<span class="crumb" data-folder-path="null">🏠 Главная</span>';
            
            let accumulatedPath = '';
            parts.forEach((part, index) => {
                if (index > 0) {
                    accumulatedPath += '/';
                }
                accumulatedPath += part;
                
                const isLast = index === parts.length - 1;
                const pathValue = accumulatedPath;
                
                if (isLast) {
                    crumbsHTML += `<span class="separator">/</span><span class="crumb active" data-folder-path="${this.escapeHtml(pathValue)}">📁 ${this.escapeHtml(part)}</span>`;
                } else {
                    crumbsHTML += `<span class="separator">/</span><span class="crumb" data-folder-path="${this.escapeHtml(pathValue)}">${this.escapeHtml(part)}</span>`;
                }
            });
            
            this.breadcrumbsContainer.innerHTML = crumbsHTML;
        }
    }

    navigateToFolder(path) {
        clientLogger.info(`Navigating to folder: ${path || 'Root'}`);
        this.currentFolderPath = path;
        this.updateBreadcrumbs();
        
        if (this.onNavigate) {
            this.onNavigate(path);
        }
    }
}