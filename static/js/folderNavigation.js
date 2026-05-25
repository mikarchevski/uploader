import { clientLogger } from './logger.js';

/**
 * Модуль для управления навигацией по папкам и хлебными крошками
 */
export class FolderNavigation {
    constructor(options) {
        this.currentFolderPath = null;
        this.filesListContainer = options.filesListContainer;
        this.onNavigate = options.onNavigate; // callback при смене папки

        this.updateBreadcrumbs();
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
        const breadcrumbsContainer = document.getElementById('breadcrumbs');
        if (!breadcrumbsContainer) return;
        
        if (!this.currentFolderPath) {
            breadcrumbsContainer.innerHTML = '<span class="crumb active">🏠 Главная</span>';
        } else {
            const parts = this.currentFolderPath.split('/');
            let crumbsHTML = '<span class="crumb" onclick="window.folderNav.navigateToFolder(null)">🏠 Главная</span>';
            
            let accumulatedPath = '';
            parts.forEach((part, index) => {
                if (index > 0) {
                    accumulatedPath += '/';
                }
                accumulatedPath += part;
                
                const isLast = index === parts.length - 1;
                const pathValue = accumulatedPath;
                
                if (isLast) {
                    crumbsHTML += `<span class="separator">/</span><span class="crumb active">📁 ${this.escapeHtml(part)}</span>`;
                } else {
                    crumbsHTML += `<span class="separator">/</span><span class="crumb" onclick="window.folderNav.navigateToFolder('${this.escapeHtml(pathValue)}')">${this.escapeHtml(part)}</span>`;
                }
            });
            
            breadcrumbsContainer.innerHTML = crumbsHTML;
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