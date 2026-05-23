import { showToast } from './utils.js';
import { clientLogger } from './logger.js';

/**
 * Модуль для обработки drag-and-drop событий
 */
export class DragDropHandler {
    constructor(options) {
        this.fullscreenDropZone = options.fullscreenDropZone;
        this.onFilesDropped = options.onFilesDropped; // callback при дропе файлов
    }

    init() {
        this.setupDragEvents();
        this.setupDropHandler();
    }

    setupDragEvents() {
        ['dragenter', 'dragover'].forEach(evt => {
            document.body.addEventListener(evt, (e) => {
                e.preventDefault();
                if (this.fullscreenDropZone) {
                    this.fullscreenDropZone.classList.add('active');
                }
            });
        });

        ['dragleave', 'drop'].forEach(evt => {
            document.body.addEventListener(evt, (e) => {
                e.preventDefault();
                if (this.fullscreenDropZone) {
                    this.fullscreenDropZone.classList.remove('active');
                }
            });
        });
    }

    async readDirectoryEntries(reader) {
        return new Promise((resolve, reject) => {
            reader.readEntries((entries) => {
                if (entries.length === 0) {
                    resolve([]);
                } else {
                    resolve(entries);
                }
            }, reject);
        });
    }

    async getAllFilesFromEntry(entry, path = '') {
        const files = [];
        
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => {
                entry.file(resolve, reject);
            });
            
            Object.defineProperty(file, 'webkitRelativePath', {
                value: path ? `${path}/${file.name}` : file.name,
                writable: false
            });
            
            files.push(file);
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            let allEntries = [];
            
            while (true) {
                const entries = await this.readDirectoryEntries(reader);
                if (entries.length === 0) break;
                allEntries = allEntries.concat(entries);
            }
            
            for (const childEntry of allEntries) {
                const newPath = path ? `${path}/${entry.name}` : entry.name;
                const childFiles = await this.getAllFilesFromEntry(childEntry, newPath);
                files.push(...childFiles);
            }
        }
        
        return files;
    }

    async setupDropHandler() {
        document.body.addEventListener('drop', async (e) => {
            e.preventDefault();
            
            if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
                return;
            }

            const items = e.dataTransfer.items;
            let hasDirectories = false;
            
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.webkitGetAsEntry && item.webkitGetAsEntry().isDirectory) {
                        hasDirectories = true;
                        break;
                    }
                }
            }

            try {
                if (hasDirectories && items) {
                    const allFiles = [];
                    
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const entry = item.webkitGetAsEntry();
                        
                        if (entry) {
                            const files = await this.getAllFilesFromEntry(entry);
                            allFiles.push(...files);
                        }
                    }
                    
                    if (allFiles.length > 0) {
                        clientLogger.info(`[DND] Loaded ${allFiles.length} files from directories`);
                        this.onFilesDropped(allFiles);
                    }
                } else {
                    this.onFilesDropped(Array.from(e.dataTransfer.files));
                }
            } catch (err) {
                clientLogger.error('[DND] Error reading directories:', err);
                showToast('Ошибка при чтении папок', 'error');
            }
        });
    }
}