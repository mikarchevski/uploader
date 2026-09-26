// utils.js

/**
 * Форматирует байты в читаемый вид (KB, MB, GB)
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Экранирует HTML-символы для защиты от XSS.
 * Включает экранирование кавычек для безопасной вставки в атрибуты.
 * @param {string} text - Текст для экранирования
 * @returns {string} Безопасный текст
 */
export function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
/**
 * Вычисляет SHA-256 хеш файла
 */

export async function computeFileHash(file, onProgress = null) {
    try {
        if (!file || file.size === undefined) {
            throw new Error("Invalid file object");
        }

        if (!window.hashwasm || !window.hashwasm.createSHA256) {
            throw new Error("hash-wasm library not loaded");
        }

        const hasher = await window.hashwasm.createSHA256();
        hasher.init();

        const chunkSize = 10 * 1024 * 1024; // 10 МБ
        let offset = 0;

        while (offset < file.size) {
            const chunk = file.slice(offset, offset + chunkSize);
            const buffer = await chunk.arrayBuffer();
            hasher.update(new Uint8Array(buffer));
            offset += chunkSize;

            // ⚡ КЛЮЧЕВОЙ МОМЕНТ: отдаем управление браузеру на 1 тик, 
            // чтобы он мог перерисовать прогресс-бар и не зависал.
            await new Promise(resolve => setTimeout(resolve, 0));

            // Сообщаем о прогрессе хеширования (максимум 40% от общей полосы)
            if (onProgress) {
                const hashPercent = Math.min((offset / file.size) * 40, 40);
                onProgress(hashPercent);
            }
        }

        return hasher.digest('hex');
    } catch (error) {
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
            console.error(`[HASH] File cannot be read: ${file.name}`, error);
            throw new Error('FileNotReadable');
        }
        console.error(`[HASH] Error computing hash for ${file.name}:`, error);
        throw error;
    }
}


/**
 * Возвращает эмодзи-иконку в зависимости от расширения файла
 */
export function getIconForFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return '🖼️';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return '🎬';
    if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) return '🎵';
    if (['pdf'].includes(ext)) return '📄';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return '📝';
    return '📁';
}

// utils.js
/**
Копирует текст в буфер обмена
*/
/**
Копирует текст в буфер обмена и показывает уведомление
*/
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Ссылка скопирована!'); // <-- Используем тост
    } catch (err) {
        console.error('Ошибка копирования:', err);
        showToast('Не удалось скопировать ссылку', true); // <-- Ошибка
    }
}

export function showToast(message, isError = false) {
    // Удаляем старое уведомление, если оно есть
    const existingToast = document.getElementById('toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.textContent = message;

    // Стили для тоста
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%) translateY(20px)',
        backgroundColor: isError ? '#ef4444' : '#10b981', // Красный для ошибки, зеленый для успеха
        color: 'white',
        padding: '12px 24px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: '10000',
        opacity: '0',
        transition: 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out',
        fontWeight: '500',
        fontSize: '0.9rem',
        pointerEvents: 'none' // Чтобы не мешал кликам
    });

    document.body.appendChild(toast);

    // Анимация появления
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Автоматическое удаление через 2 секунды
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 2000);
}