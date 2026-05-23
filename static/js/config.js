/**
 * Конфигурационные константы для фронтенда
 */

export const CONFIG = {
    // === ПАГИНАЦИЯ ===
    INITIAL_LOAD_COUNT: 15,
    BATCH_SIZE: 20,
    
    // === АНИМАЦИИ И ТАЙМЕРЫ ===
    ANIMATION_DURATION: 200,  // ms
    ANIMATION_DURATION_SLOW: 300,  // ms
    TOAST_DURATION: 3000,  // ms
    DEBOUNCE_DELAY: 300,  // ms
    
    // === ПРЕВЬЮ ===
    PREVIEW_CACHE_MAX_ITEMS: 50,
    PREVIEW_CACHE_MAX_AGE_HOURS: 24,
    
    // === ЗАГРУЗКА ФАЙЛОВ ===
    MAX_RETRIES: 3,
    RETRY_DELAY: 500,  // ms
    PROGRESS_OFFSET: 50,  // Starting progress percentage for upload
    
    // === UI ===
    MAX_VISIBLE_TOASTS: 3,
    CONFIRM_MODAL_TIMEOUT: 200,  // ms
    
    // === СОРТИРОВКА ===
    DEFAULT_SORT_FIELD: 'date',
    DEFAULT_SORT_ORDER: 'desc',
    
    SORT_FIELDS: {
        DATE: 'date',
        NAME: 'name',
        SIZE: 'size',
        TYPE: 'type'
    },
    
    SORT_ORDERS: {
        ASCENDING: 'asc',
        DESCENDING: 'desc'
    }
};

// Helper функции для работы с конфигурацией
export function getAnimationDuration(slow = false) {
    return slow ? CONFIG.ANIMATION_DURATION_SLOW : CONFIG.ANIMATION_DURATION;
}

export function getDefaultSortConfig() {
    return {
        field: CONFIG.DEFAULT_SORT_FIELD,
        order: CONFIG.DEFAULT_SORT_ORDER
    };
}