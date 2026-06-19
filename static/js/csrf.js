// static/js/csrf.js

/**
 * Модуль для работы с CSRF токенами
 */

let csrfToken = null;

/**
 * Получает CSRF token из meta тега или cookie
 */
export function getCsrfToken() {
    if (csrfToken) {
        return csrfToken;
    }
    
    // Пытаемся получить из meta тега
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag) {
        csrfToken = metaTag.getAttribute('content');
        return csrfToken;
    }
    
    // Пытаемся получить из cookie
    csrfToken = getCookie('csrf_token');
    return csrfToken;
}

/**
 * Получает значение cookie по имени
 */
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Добавляет CSRF token к fetch запросам
 */
export function addCsrfToFetch(url, options = {}) {
    const token = getCsrfToken();
    
    if (!token) {
        console.warn('[CSRF] No CSRF token found');
        return options;
    }
    
    // Клонируем options чтобы не мутировать оригинал
    const modifiedOptions = { ...options };
    
    // Добавляем заголовок
    if (!modifiedOptions.headers) {
        modifiedOptions.headers = {};
    }
    
    modifiedOptions.headers['X-CSRFToken'] = token;
    
    return modifiedOptions;
}

/**
 * Оборачивает fetch с автоматическим добавлением CSRF token
 */
export function csrfFetch(url, options = {}) {
    const modifiedOptions = addCsrfToFetch(url, options);
    return fetch(url, modifiedOptions);
}

/**
 * Инициализирует глобальный перехватчик для всех fetch запросов
 */
export function initCsrfProtection() {
    const originalFetch = window.fetch;
    
    window.fetch = function(url, options = {}) {
        // Пропускаем GET запросы и внешние URL
        const method = (options.method || 'GET').toUpperCase();
        const isExternalUrl = typeof url === 'string' && 
                             (url.startsWith('http://') || url.startsWith('https://'));
        
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && !isExternalUrl) {
            options = addCsrfToFetch(url, options);
        }
        
        return originalFetch.call(this, url, options);
    };
    
    console.log('[CSRF] Protection initialized');
}