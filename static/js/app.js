import { copyToClipboard, showToast} from './utils.js';
import {
    updateFileCount,
    renderFilesGrid,
    addFileToGrid,
    clearPreviewCache
} from './ui.js';
import { 
    fetchFilesPage
} from './api.js';
import { initFileManager } from './fileManager.js';
import { sortFiles } from './sortUtils.js';
import { UploadManager } from './uploadManager.js';
import { clientLogger } from './logger.js';

document.addEventListener('DOMContentLoaded', () => {
    clientLogger.info('Application initialized');
    // --- DOM Elements ---
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    const filesListContainer = document.getElementById('filesListContainer');
    const fileCountLabel = document.getElementById('fileCount');
    const fullscreenDropZone = document.getElementById('fullscreenDropZone');
    
    // Theme Elements
    const themeToggleBtn = document.getElementById('themeToggle');
    const iconMoon = document.getElementById('iconMoon');
    const iconSun = document.getElementById('iconSun');
    const themeText = document.getElementById('themeText');
    const htmlElement = document.documentElement;
    
    // Upload Buttons
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadFolderBtn = document.getElementById('uploadFolderBtn');
    const mobileAddBtn = document.getElementById('mobileAddBtn');

    // Sort Elements
    const btnSort = document.getElementById('btnSort');
    const sortMenu = document.getElementById('sortMenu');
    const btnSortText = document.getElementById('btnSortText');
    
    // User Menu Elements
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');

    // --- State ---
    let allFiles = []; 
    let totalFilesCount = 0;
    let currentSortField = 'date'; 
    let currentSortOrder = 'desc'; 
    
    let currentPage = 1;
    const INITIAL_LOAD_COUNT = 15;
    const BATCH_SIZE = 20;
    let hasMoreFiles = true;
    let isLoadingBatch = false;

    // --- НАВИГАЦИЯ ПО ПАПКАМ ---
    let currentFolderPath = null; // null = корень
    window.getCurrentFolder = () => currentFolderPath;
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function updateBreadcrumbs() {
        const breadcrumbsContainer = document.getElementById('breadcrumbs');
        if (!breadcrumbsContainer) return;
        
        if (!currentFolderPath) {
            breadcrumbsContainer.innerHTML = '<span class="crumb active">🏠 Главная</span>';
        } else {
            // Разбиваем путь на части для навигации
            const parts = currentFolderPath.split('/');
            let crumbsHTML = '<span class="crumb" onclick="navigateToFolder(null)">🏠 Главная</span>';
            
            let accumulatedPath = '';
            parts.forEach((part, index) => {
                if (index > 0) {
                    accumulatedPath += '/';
                }
                accumulatedPath += part;
                
                const isLast = index === parts.length - 1;
                const pathValue = accumulatedPath;
                
                if (isLast) {
                    crumbsHTML += `<span class="separator">/</span><span class="crumb active">📁 ${escapeHtml(part)}</span>`;
                } else {
                    crumbsHTML += `<span class="separator">/</span><span class="crumb" onclick="navigateToFolder('${escapeHtml(pathValue)}')">${escapeHtml(part)}</span>`;
                }
            });
            
            breadcrumbsContainer.innerHTML = crumbsHTML;
        }
    }
    

    window.navigateToFolder = function(path) {
        clientLogger.info(`Navigating to folder: ${path || 'Root'}`);
        currentFolderPath = path;
        currentPage = 1;
        allFiles = [];
        hasMoreFiles = true;
        
        filesListContainer.innerHTML = '<div class="spinner-wrapper"><div class="spinner"></div></div>';
        filesListContainer.classList.add('loading');
        
        updateBreadcrumbs();
        loadNextBatch();
    };
    // --- КОНЕЦ НАВИГАЦИИ ---

    function updateThemeUI(isDark) {
        if (isDark) {
            if (iconMoon) iconMoon.classList.add('hidden');
            if (iconSun) iconSun.classList.remove('hidden');
            if (themeText) themeText.textContent = 'Светлая тема';
        } else {
            if (iconMoon) iconMoon.classList.remove('hidden');
            if (iconSun) iconSun.classList.add('hidden');
            if (themeText) themeText.textContent = 'Тёмная тема';
        }
    }

    function updateSortButtonText() {
        if (!btnSortText) return;
        
        const fieldMap = {
            'date': 'Дате',
            'name': 'Названию',
            'size': 'Размеру',
            'type': 'Типу'
        };
        
        const orderMap = {
            'desc': ' (по убыванию)',
            'asc': ' (по возрастанию)'
        };

        const fieldName = fieldMap[currentSortField] || 'Дате';
        const orderName = orderMap[currentSortOrder] || '';
        
        btnSortText.textContent = `${fieldName}${orderName}`;
    }

    // ... existing code ...

    function refreshGridFromState() {
        // 1. Сначала сортируем ВСЕ загруженные файлы
        const sortedAllFiles = sortFiles(allFiles, currentSortField, currentSortOrder);
        
        let filesToShow = sortedAllFiles;
        
        // 2. Если мы внутри папки, показываем файлы этой папки И всех её подпапок
        if (currentFolderPath) {
            filesToShow = sortedAllFiles.filter(f => {
                const folderPath = f.folder_path || '';
                // Показываем файлы, которые находятся в текущей папке или её подпапках
                return folderPath === currentFolderPath || folderPath.startsWith(currentFolderPath + '/');
            });
        }

        renderFilesGrid(filesListContainer, filesToShow);
        
        // Обновляем счетчик: показываем количество отображаемых файлов
        updateFileCount(fileCountLabel, filesToShow.length, totalFilesCount);
    }

// ... existing code ...

    /**
     * Обработчик успешной загрузки файла из UploadManager
     */
    function handleFileUploaded(newFileData) {
        // Если мы сейчас внутри папки, и новый файл не из этой папки, 
        // он не появится в сетке до перезагрузки или выхода в корень.
        // Это нормальное поведение.
        
        const exists = allFiles.some(f => f.short_id === newFileData.short_id);
        
        if (!exists) {
            allFiles.unshift(newFileData);
            if (typeof totalFilesCount !== 'undefined') {
                totalFilesCount++;
            }
            refreshGridFromState();
        }
    }
    

    // --- Init Upload Manager ---
    const uploadManager = new UploadManager(handleFileUploaded);

    // --- Theme Logic ---
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlElement.setAttribute('data-theme', savedTheme);
        updateThemeUI(savedTheme === 'dark');
    } else {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        updateThemeUI(systemPrefersDark);
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentTheme = htmlElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            htmlElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeUI(newTheme === 'dark');
        });
    }

    // --- User Menu Logic ---
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            if (sortMenu && sortMenu.classList.contains('active')) {
                sortMenu.classList.remove('active');
                const sortDropdown = btnSort ? btnSort.closest('.sort-dropdown') : null;
                if (sortDropdown) sortDropdown.classList.remove('active');
                setTimeout(() => {
                    if (sortMenu) sortMenu.classList.add('hidden');
                }, 200);
            }

            userDropdown.classList.toggle('show');
            userDropdown.classList.remove('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.classList.remove('show');
                setTimeout(() => {
                    if (!userDropdown.classList.contains('show')) {
                        userDropdown.classList.add('hidden');
                    }
                }, 200);
            }
        });
    }

    // Очистка кэша превью при выходе
    const logoutLink = document.querySelector('.logout-item');
    if (logoutLink) {
        logoutLink.addEventListener('click', () => {
            clearPreviewCache();
        });
    }

    window.copyToClipboard = copyToClipboard;

    // --- Pagination Logic ---
        // ... existing code ...

    async function loadNextBatch() {
        try {
            const response = await fetchFilesPage(currentPage, BATCH_SIZE, currentSortField, currentSortOrder, currentFolderPath);
            
            // Исправленная проверка: бэкенд возвращает объект с files, а не обязательно с success
            if (response && response.files) {
                const newFiles = response.files;
                
                if (newFiles.length === 0) {
                    hasMoreFiles = false;
                    if (allFiles.length === 0) {
                        renderFilesGrid(filesListContainer, []);
                    }
                    return;
                }

                allFiles = [...allFiles, ...newFiles];
                
                if (currentPage === 1) {
                    renderFilesGrid(filesListContainer, allFiles);
                } else {
                    newFiles.forEach(file => addFileToGrid(filesListContainer, file));
                }

                // Используем total из ответа, если он есть, иначе считаем по allFiles
                const total = response.total || allFiles.length;
                updateFileCount(fileCountLabel, allFiles.length, total);
                
                if (newFiles.length < BATCH_SIZE) {
                    hasMoreFiles = false;
                } else {
                    currentPage++;
                }
            } else {
                clientLogger.error('Failed to load files batch', 'Invalid response format');
                showToast('Ошибка формата данных от сервера', 'error');
            }
        } catch (error) {
            clientLogger.error('Network error loading files', error.message);
            showToast('Ошибка сети при загрузке файлов', 'error');
        } finally {
            isLoadingBatch = false;
        }
    }

    // ... existing code ...

    // --- Event Listeners: Sorting ---
    if (btnSort && sortMenu) {
        updateSortButtonText();

        btnSort.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = btnSort.closest('.sort-dropdown');
            const isActive = sortMenu.classList.contains('active');
            
            if (!isActive && userDropdown) {
                userDropdown.classList.remove('show');
                setTimeout(() => {
                    if (!userDropdown.classList.contains('show')) {
                        userDropdown.classList.add('hidden');
                    }
                }, 200);
            }

            if (isActive) {
                sortMenu.classList.remove('active');
                dropdown.classList.remove('active');
                setTimeout(() => sortMenu.classList.add('hidden'), 200);
            } else {
                sortMenu.classList.remove('hidden');
                setTimeout(() => {
                    sortMenu.classList.add('active');
                    dropdown.classList.add('active');
                }, 10);
            }
        });

        document.addEventListener('click', (e) => {
            const dropdown = btnSort.closest('.sort-dropdown');
            if (!sortMenu.contains(e.target) && e.target !== btnSort) {
                sortMenu.classList.remove('active');
                dropdown.classList.remove('active');
                setTimeout(() => sortMenu.classList.add('hidden'), 200);
            }
        });

        sortMenu.querySelectorAll('.sort-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const field = btn.getAttribute('data-field');
                if (!field) return;

                currentSortField = field;
                sortMenu.querySelectorAll('.sort-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                refreshGridFromState();
                updateSortButtonText();

                sortMenu.classList.remove('active');
                btnSort.closest('.sort-dropdown').classList.remove('active');
                setTimeout(() => sortMenu.classList.add('hidden'), 200);
            });
        });
        
        sortMenu.querySelectorAll('.sort-order-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const order = btn.getAttribute('data-order');
                if (!order) return;

                currentSortOrder = order;
                sortMenu.querySelectorAll('.sort-order-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                refreshGridFromState();
                updateSortButtonText();

                sortMenu.classList.remove('active');
                btnSort.closest('.sort-dropdown').classList.remove('active');
                setTimeout(() => sortMenu.classList.add('hidden'), 200);
            });
        });
    }

    // --- Event Listeners: Uploads & DragDrop ---

    // 1. Обычные файлы
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                uploadManager.addToQueue(Array.from(e.target.files));
                e.target.value = ''; 
            }
        });
    }

    // 2. Папки
    if (uploadFolderBtn && folderInput) {
        uploadFolderBtn.addEventListener('click', () => folderInput.click());
    }

    // ... existing code ...

    if (folderInput) {
        folderInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const files = Array.from(e.target.files);
                uploadManager.addToQueue(files);
                setTimeout(() => {
                    e.target.value = '';
                }, 2000);
            }
        });
    }

// ... existing code ...

    // 3. Мобильная кнопка
    if (mobileAddBtn && fileInput) {
        mobileAddBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // 4. Drag and Drop
    ['dragenter', 'dragover'].forEach(evt => {
        document.body.addEventListener(evt, (e) => {
            e.preventDefault();
            if (fullscreenDropZone) fullscreenDropZone.classList.add('active');
        });
    });

    ['dragleave', 'drop'].forEach(evt => {
        document.body.addEventListener(evt, (e) => {
            e.preventDefault();
            if (fullscreenDropZone) fullscreenDropZone.classList.remove('active');
        });
    });

     // Функция для рекурсивного чтения содержимого папки
    function readDirectoryEntries(reader) {
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

    // Функция для получения всех файлов из DirectoryEntry
    async function getAllFilesFromEntry(entry, path = '') {
        const files = [];
        
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => {
                entry.file(resolve, reject);
            });
            
            // Добавляем информацию о пути к файлу
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
                const entries = await readDirectoryEntries(reader);
                if (entries.length === 0) break;
                allEntries = allEntries.concat(entries);
            }
            
            // Рекурсивно обрабатываем все записи
            for (const childEntry of allEntries) {
                const newPath = path ? `${path}/${entry.name}` : entry.name;
                const childFiles = await getAllFilesFromEntry(childEntry, newPath);
                files.push(...childFiles);
            }
        }
        
        return files;
    }

    document.body.addEventListener('drop', async (e) => {
        e.preventDefault();
        
        if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
            return;
        }

        // Проверяем, есть ли папки среди перетащенных элементов
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

        if (hasDirectories && items) {
            // Обрабатываем папки через File System Access API
            try {
                const allFiles = [];
                
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const entry = item.webkitGetAsEntry();
                    
                    if (entry) {
                        const files = await getAllFilesFromEntry(entry);
                        allFiles.push(...files);
                    }
                }
                
                if (allFiles.length > 0) {
                    console.log(`[DND] Loaded ${allFiles.length} files from directories`);
                    uploadManager.addToQueue(allFiles);
                }
            } catch (err) {
                console.error('[DND] Error reading directories:', err);
                showToast('Ошибка при чтении папок', 'error');
            }
        } else {
            // Обычные файлы - используем существующую логику
            uploadManager.addToQueue(Array.from(e.dataTransfer.files));
        }
    });

    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            uploadManager.addToQueue(Array.from(e.dataTransfer.files));
        }
    });

    // --- File Deletion Handler ---
    window.addEventListener('filesDeleted', (event) => {
        const deletedIds = event.detail.deletedIds;
        allFiles = allFiles.filter(file => !deletedIds.includes(file.short_id));
        
        if (typeof totalFilesCount !== 'undefined') {
            totalFilesCount = Math.max(0, totalFilesCount - deletedIds.length);
        }
        
        refreshGridFromState();
    });

    // ... existing code ...

    // ... existing code ...

    window.addEventListener('folderDeleted', (event) => {
        const folderPath = event.detail.folderPath;
        
        console.log(`[APP] folderDeleted event received for: ${folderPath}`);
        console.log(`[APP] Files before filter: ${allFiles.length}`);
        
        const filesBefore = allFiles.length;
        
        allFiles = allFiles.filter(file => {
            const fileFolder = file.folder_path || '';
            
            if (fileFolder === folderPath) return false;
            if (fileFolder.startsWith(folderPath + '/')) return false;
            
            return true;
        });
        
        const filesRemoved = filesBefore - allFiles.length;
        console.log(`[APP] Files after filter: ${allFiles.length} (removed ${filesRemoved})`);
        
        totalFilesCount = allFiles.length; 
        
        refreshGridFromState();
    });

// ... existing code ...

// ... existing code ...

    // --- Init ---
    initFileManager(filesListContainer, fileCountLabel);
    
    // Запускаем загрузку файлов
    loadNextBatch();
});