import { showToast } from './utils.js';
import { clientLogger } from './logger.js';

/**
 * Модуль для обработки drag-and-drop событий
 */
export class DragDropHandler {
    constructor(options) {
        this.fullscreenDropZone = options.fullscreenDropZone;
        this.onFilesDropped = options.onFilesDropped; // callback при дропе файлов
        
        this.isProcessing = false; // Флаг для предотвращения двойной обработки
    }

    init() {
        this.setupDragEvents();
        this.setupDropHandler();
    }

    setupDragEvents() {
        ['dragenter', 'dragover'].forEach(evt => {
            document.body.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (this.fullscreenDropZone) {
                    this.fullscreenDropZone.classList.add('active');
                }
            });
        });

        ['dragleave', 'drop'].forEach(evt => {
            document.body.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (this.fullscreenDropZone) {
                    this.fullscreenDropZone.classList.remove('active');
                }
            });
        });
    }

    async readDirectoryEntries(reader) {
        return new Promise((resolve, reject) => {
            try {
                reader.readEntries((entries) => {
                    resolve(entries || []);
                }, (error) => {
                    reject(new Error(`Failed to read directory entries: ${error.message}`));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async getAllFilesFromEntry(entry, path = '') {
        const files = [];
        
        try {
            if (entry.isFile) {
                const file = await new Promise((resolve, reject) => {
                    entry.file(resolve, (error) => {
                        reject(new Error(`Failed to read file "${entry.name}": ${error.message}`));
                    });
                });
                
                Object.defineProperty(file, 'webkitRelativePath', {
                    value: path ? `${path}/${file.name}` : file.name,
                    writable: false
                });
                
                files.push(file);
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                let allEntries = [];
                
                // Читаем все записи (может потребоваться несколько вызовов)
                while (true) {
                    const entries = await this.readDirectoryEntries(reader);
                    if (entries.length === 0) break;
                    allEntries = allEntries.concat(entries);
                }
                
                // Рекурсивно обрабатываем все записи
                for (const childEntry of allEntries) {
                    const newPath = path ? `${path}/${entry.name}` : entry.name;
                    const childFiles = await this.getAllFilesFromEntry(childEntry, newPath);
                    files.push(...childFiles);
                }
            }
        } catch (error) {
            clientLogger.error(`[DND] Error processing entry "${entry.name}":`, error);
            throw error;
        }
        
        return files;
    }

    validateFiles(files) {
        if (!files || files.length === 0) {
            throw new Error('No files detected in drop event');
        }
        
        // Проверка на пустые файлы
        const emptyFiles = files.filter(f => f.size === 0);
        if (emptyFiles.length > 0) {
            clientLogger.warn(`[DND] Found ${emptyFiles.length} empty files`);
        }
        
        return files;
    }

    async processDroppedItems(items) {
        const allFiles = [];
        const errors = [];
        
        for (let i = 0; i < items.length; i++) {
            try {
                const item = items[i];
                const entry = item.webkitGetAsEntry();
                
                if (!entry) {
                    errors.push(`Item ${i + 1}: Cannot get entry`);
                    continue;
                }
                
                const files = await this.getAllFilesFromEntry(entry);
                allFiles.push(...files);
                
                clientLogger.info(`[DND] Processed entry: ${entry.name} (${files.length} files)`);
            } catch (error) {
                errors.push(`Item ${i + 1}: ${error.message}`);
                clientLogger.error(`[DND] Failed to process item ${i + 1}:`, error);
            }
        }
        
        if (errors.length > 0) {
            clientLogger.warn('[DND] Processing completed with errors:', errors);
        }
        
        return { files: allFiles, errors };
    }

    async setupDropHandler() {
        document.body.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Предотвращаем двойную обработку
            if (this.isProcessing) {
                clientLogger.warn('[DND] Drop event ignored - already processing');
                return;
            }
            
            this.isProcessing = true;
            
            try {
                const dataTransfer = e.dataTransfer;
                
                if (!dataTransfer) {
                    throw new Error('No data transfer object');
                }
                
                const items = dataTransfer.items;
                const files = dataTransfer.files;
                
                if (!items && (!files || files.length === 0)) {
                    throw new Error('No files or items in drop event');
                }
                
                let droppedFiles = [];
                
                // Проверяем, есть ли папки среди перетащенных элементов
                const hasDirectories = items && Array.from(items).some(item => 
                    item.webkitGetAsEntry && item.webkitGetAsEntry().isDirectory
                );
                
                if (hasDirectories && items) {
                    // Обрабатываем папки через File System Access API
                    clientLogger.info('[DND] Detected directories, processing...');
                    
                    const result = await this.processDroppedItems(items);
                    droppedFiles = result.files;
                    
                    if (result.errors.length > 0) {
                        showToast(`Загружено с ошибками: ${result.errors.length} проблем`, 'warning');
                    }
                    
                    if (droppedFiles.length === 0) {
                        throw new Error('No files extracted from directories');
                    }
                    
                    clientLogger.info(`[DND] Successfully loaded ${droppedFiles.length} files from directories`);
                } else if (files && files.length > 0) {
                    // Обычные файлы
                    droppedFiles = Array.from(files);
                    clientLogger.info(`[DND] Loaded ${droppedFiles.length} regular files`);
                } else {
                    throw new Error('No valid files found');
                }
                
                // Валидация
                droppedFiles = this.validateFiles(droppedFiles);
                
                // Передаём файлы в обработчик
                if (this.onFilesDropped) {
                    this.onFilesDropped(droppedFiles);
                    showToast(`Добавлено ${droppedFiles.length} файл(ов) в очередь загрузки`);
                }
                
            } catch (error) {
                clientLogger.error('[DND] Critical error during drop processing:', error);
                
                let errorMessage = 'Ошибка при обработке файлов';
                
                if (error.message.includes('No files')) {
                    errorMessage = 'Не удалось обнаружить файлы';
                } else if (error.message.includes('Cannot get entry')) {
                    errorMessage = 'Ошибка доступа к файлам';
                } else if (error.message.includes('security')) {
                    errorMessage = 'Нет доступа к выбранным файлам';
                }
                
                showToast(errorMessage, 'error');
            } finally {
                this.isProcessing = false;
            }
        });
    }
}