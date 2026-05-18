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
 * Вычисляет SHA-256 хеш файла
 */
export async function computeFileHash(file) {
    try {
        // Проверяем, доступен ли файл вообще
        if (!file || file.size === undefined) {
            throw new Error("Invalid file object");
        }

        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (error) {
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
            console.warn(`[HASH] Operation aborted for file: ${file.name}`);
            throw new Error('Cancelled'); // Пробрасываем как отмену, чтобы не пугать пользователя
        }
        console.error(`[HASH] Error computing hash for ${file.name}:`, error);
        throw error;
    }
}

// ... existing code ...

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