// sortUtils.js

/**
 * Извлекает расширение файла
 */
export function getExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

/**
 * Парсит строку размера (например, "1.5 MB") в байты для сортировки
 */
export function parseSize(sizeStr) {
    if (!sizeStr) return 0;
    const units = { 'B': 1, 'KB': 1024, 'MB': 1024 * 1024, 'GB': 1024 * 1024 * 1024 };
    const match = sizeStr.match(/([\d.]+)\s*(\w+)/);
    if (match) {
        return parseFloat(match[1]) * (units[match[2]] || 1);
    }
    return 0;
}

/**
 * Сортирует массив файлов
 * @param {Array} filesArray - Массив объектов файлов
 * @param {string} field - Поле сортировки ('date', 'name', 'size', 'type')
 * @param {string} order - Порядок ('asc', 'desc')
 */
export function sortFiles(filesArray, field, order) {
    return filesArray.slice().sort((a, b) => {
        let valA, valB;

        switch (field) {
            case 'name':
                valA = a.filename.toLowerCase();
                valB = b.filename.toLowerCase();
                break;
            case 'size':
                valA = parseSize(a.size);
                valB = parseSize(b.size);
                break;
            case 'type':
                valA = getExtension(a.filename);
                valB = getExtension(b.filename);
                break;
            case 'date':
            default:
                // Предполагаем, что date приходит в формате ISO или подобном, который можно сравнить
                valA = new Date(a.date);
                valB = new Date(b.date);
                break;
        }

        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });
}