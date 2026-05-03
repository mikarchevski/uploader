// api.js

import { computeFileHash } from './utils.js';

/**
 * Загружает список всех файлов
 */
export async function fetchAllFiles() {
    const response = await fetch('/api/files');
    return await response.json();
}

/**
 * Загружает конкретную страницу файлов
 * @param {number} page - Номер страницы (начиная с 1)
 * @param {number} perPage - Количество файлов
 */
export async function fetchFilesPage(page = 1, perPage = 20) {
    const response = await fetch(`/api/files?page=${page}&per_page=${perPage}`);
    return await response.json();
}

/**
 * Проверяет наличие файла по хешу
 */
export async function checkFileExists(hash) {
    const res = await fetch(`/check?h=${hash}`);
    return await res.json();
}

/**
 * Загружает файл на сервер
 * @param {Function} onXhrReady - Callback, который вернет объект XHR для возможности отмены
 */
export function uploadFile(file, hash, onProgress, onLoad, onError, onXhrReady) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('hash', hash);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload');
    
    // Сразу передаем xhr, чтобы можно было отменить даже до начала отправки
    if (onXhrReady) {
        onXhrReady(xhr);
    }

    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
        }
    });

    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            try {
                const res = JSON.parse(xhr.responseText);
                onLoad(res);
            } catch (e) {
                onError(e);
            }
        } else {
            onLoad(null); 
        }
    });

    xhr.addEventListener('error', () => {
        onError({ type: 'error' });
    });
    
    xhr.addEventListener('abort', () => {
        onError({ type: 'abort' });
    });

    xhr.send(formData);
}