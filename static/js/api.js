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
export async function fetchFilesPage(page = 1, perPage = 20, sortField = 'upload_date', sortOrder = 'DESC', folderPath = null) {
    let url = `/api/files?page=${page}&per_page=${perPage}&sort=${sortField}&order=${sortOrder}`;
    
    if (folderPath) {
        url += `&folder=${encodeURIComponent(folderPath)}`;
    }
    
    const response = await fetch(url);
    return await response.json();
}

/**
 * Загружает файл на сервер
 */
export function uploadFile(file, hash, onProgress, onSuccess, onError, onXhrReady, folderPath = '') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('hash', hash);
    if (folderPath) {
        formData.append('folder_path', folderPath);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/upload', true);

    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            onProgress(percentComplete);
        }
    };

    xhr.onload = () => {
        if (xhr.status === 200) {
            try {
                const response = JSON.parse(xhr.responseText);
                onSuccess(response);
            } catch (e) {
                onError(new Error('Invalid JSON response'));
            }
        } else {
            onError(new Error(`Server error: ${xhr.status}`));
        }
    };

    xhr.onerror = () => onError(new Error('Network error'));
    
    if (onXhrReady) onXhrReady(xhr);

    xhr.send(formData);
}

/**
 * Проверяет существование файла
 */
export async function checkFileExists(hash, folderPath = '') {
    try {
        // Добавляем folder_path в запрос проверки
        const url = `/check?h=${hash}&folder_path=${encodeURIComponent(folderPath)}`;
        const res = await fetch(url);
        return await res.json();
    } catch (err) {
        console.error("Check file error:", err);
        return { exists: false };
    }
}