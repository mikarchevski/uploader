// static/js/clipboard.js
import { clientLogger } from './logger.js';

/**
 * Модуль для работы с буфером обмена
 */
export function initClipboard() {
    document.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.copy-link-btn');
        if (!copyBtn) return;
        
        e.preventDefault();
        
        const url = copyBtn.dataset.url;
        if (!url) {
            clientLogger.warn('Copy button missing data-url attribute');
            return;
        }
        
        copyToClipboard(url, copyBtn);
    });
}

async function copyToClipboard(text, button) {
    try {
        await navigator.clipboard.writeText(text);
        
        const originalText = button.textContent;
        button.textContent = '✓ Скопировано';
        button.classList.add('copied');
        
        clientLogger.info(`Copied to clipboard: ${text}`);
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 1500);
        
    } catch (err) {
        clientLogger.error('Failed to copy to clipboard', err.message);
        
        // Fallback для старых браузеров
        fallbackCopy(text, button);
    }
}

function fallbackCopy(text, button) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        document.execCommand('copy');
        const originalText = button.textContent;
        button.textContent = '✓ Скопировано';
        
        setTimeout(() => {
            button.textContent = originalText;
        }, 1500);
        
        clientLogger.info('Copied using fallback method');
    } catch (err) {
        clientLogger.error('Fallback copy failed', err.message);
    } finally {
        document.body.removeChild(textarea);
    }
}