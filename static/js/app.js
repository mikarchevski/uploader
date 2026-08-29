import { FolderNavigation } from './folderNavigation.js';
import { SortManager } from './sortManager.js';
import { ThemeManager } from './themeManager.js';
import { UploadManager } from './uploadManager.js';
import { DragDropHandler } from './dragDropHandler.js';
import { initFileManager } from './fileManager.js';
import { clearPreviewCache, renderFilesGrid, updateFileCount, addFileToGrid } from './ui.js';
import { initClipboard } from './clipboard.js';
import { CONFIG } from './config.js';
import { clientLogger } from './logger.js';
import { fetchFilesPage } from './api.js';
import { sortFiles } from './sortUtils.js';
import { showToast } from './utils.js';
import { initCsrfProtection } from './csrf.js';
import { initMobileEnhancements } from './mobileEnhancements.js';

document.addEventListener('DOMContentLoaded', () => {
    clientLogger.info('Application initialized');

    // Инициализируем CSRF защиту
    initCsrfProtection();

    // Инициализируем мобильные улучшения
    initMobileEnhancements();

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
    // ... existing code ...

    // --- State ---
    let allFiles = [];
    let totalFilesCount = 0;

    // Делаем allFiles доступным для мобильного модуля
    window.allFiles = allFiles;

    let currentPage = 1;
    const BATCH_SIZE = CONFIG.BATCH_SIZE;
    let hasMoreFiles = true;
    let isLoadingBatch = false;

    // Активный фильтр
    let activeFilter = 'all';

    // --- Initialize Modules ---

    // 1. Folder Navigation
    const folderNav = new FolderNavigation({
        filesListContainer,
        onNavigate: (path) => {
            currentPage = 1;
            allFiles = [];
            hasMoreFiles = true;

            filesListContainer.innerHTML = '<div class="spinner-wrapper"><div class="spinner"></div></div>';
            filesListContainer.classList.add('loading');

            loadNextBatch();
        }
    });

    // 2. Theme Manager
    const themeManager = new ThemeManager({
        themeToggleBtn,
        iconMoon,
        iconSun,
        themeText,
        htmlElement
    });

    // 3. Sort Manager
    const sortManager = new SortManager({
        btnSort,
        sortMenu,
        btnSortText,
        userDropdown,
        onSortChange: (field, order) => {
            refreshGridFromState();
        }
    });

    // 4. Drag & Drop Handler
    const dragDropHandler = new DragDropHandler({
        fullscreenDropZone,
        onFilesDropped: (files) => {
            uploadManager.addToQueue(files);
        }
    });

    dragDropHandler.init();

    // --- Helper Functions ---

    // Функция фильтрации файлов по типу
    function filterFilesByType(files, filterType) {
        if (filterType === 'all') return files;

        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
        const videoExts = ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv', 'm4v'];

        return files.filter(file => {
            const ext = file.filename.split('.').pop().toLowerCase();

            switch (filterType) {
                case 'image':
                    return imageExts.includes(ext);
                case 'video':
                    return videoExts.includes(ext);
                case 'new':
                    // Показываем файлы за последние 24 часа
                    const fileDate = new Date(file.uploaded_at || file.date);
                    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return fileDate >= oneDayAgo;
                default:
                    return true;
            }
        });
    }


    // ... existing code ...
    // ... existing code ...
    // ... existing code ...
    function refreshGridFromState() {
        const sortConfig = sortManager.getSortConfig();
        const sortedFiles = sortFiles(allFiles, sortConfig.field, sortConfig.order);

        // Применяем фильтр
        const filteredFiles = filterFilesByType(sortedFiles, activeFilter);

        let filesToShow = filteredFiles;

        const currentFolderPath = folderNav.getCurrentFolder();

        if (currentFolderPath) {
            // Показываем все файлы, которые находятся в текущей папке или её подпапках
            filesToShow = filteredFiles.filter(f => {
                const fp = f.folder_path || '';
                return fp === currentFolderPath || fp.startsWith(currentFolderPath + '/');
            });

            clientLogger.info(`[REFRESH] In folder '${currentFolderPath}': ${filesToShow.length} files`);
            filesToShow.forEach(f => {
                clientLogger.info(`  - ${f.filename} (path: "${f.folder_path}")`);
            });
        } else {
            // Корневая директория: показываем файлы без папки и все уникальные папки первого уровня
            clientLogger.info(`[REFRESH] Root directory - Total files in memory: ${sortedFiles.length}`);

            // Логируем все уникальные пути
            const uniquePaths = [...new Set(sortedFiles.map(f => f.folder_path || '(root)'))];
            clientLogger.info(`[REFRESH] Unique folder paths:`, uniquePaths);

            filesToShow = filteredFiles.filter(f => {
                const fp = f.folder_path || '';
                const hasNoFolder = !fp || fp === '';

                // Для папок: берём только те, где первый сегмент пути совпадает с самим путём
                // (т.е. это корневые папки, а не подпапки)
                const isFirstLevelFolder = fp && fp.split('/')[0] === fp;

                const shouldShow = hasNoFolder || isFirstLevelFolder;

                if (!shouldShow) {
                    clientLogger.info(`  [FILTERED OUT] ${f.filename} (path: "${fp}") - is subfolder`);
                }

                return shouldShow;
            });

            clientLogger.info(`[REFRESH] After filter: ${filesToShow.length} items to show`);
            filesToShow.forEach(f => {
                clientLogger.info(`  - ${f.filename} (path: "${f.folder_path}")`);
            });
        }

        renderFilesGrid(filesListContainer, filesToShow, folderNav);
        updateFileCount(fileCountLabel, filesToShow.length, totalFilesCount);
    }
    // ... existing code ...
    // ... existing code ...
    // ... existing code ...


    function handleFileUploaded(newFileData) {
        const exists = allFiles.some(f => f.short_id === newFileData.short_id);

        if (!exists) {
            allFiles.unshift(newFileData);
            if (typeof totalFilesCount !== 'undefined') {
                totalFilesCount++;
            }

            addFileToGrid(filesListContainer, newFileData);

            updateFileCount(fileCountLabel, allFiles.length, totalFilesCount);
        }
    }

    // ... existing code ...
    // Синхронизация мобильных и десктопных фильтров
    function syncFilters(sourceFilter, targetButtons) {
        const filterValue = sourceFilter.dataset.filter;

        // Обновляем целевые кнопки
        targetButtons.forEach(btn => {
            if (btn.dataset.filter === filterValue) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }


    // Обработчики для десктопных фильтров
    document.querySelectorAll('.sidebar-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Убираем active у всех десктопных кнопок
            document.querySelectorAll('.sidebar-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Синхронизируем с мобильными
            syncFilters(btn, document.querySelectorAll('.mobile-filter-btn'));

            // Устанавливаем активный фильтр и обновляем сетку
            activeFilter = btn.dataset.filter;
            refreshGridFromState();

            clientLogger.info(`Filter changed to: ${activeFilter}`);
        });
    });

    // Обработчики для мобильных фильтров
    document.querySelectorAll('.mobile-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Убираем active у всех мобильных кнопок
            document.querySelectorAll('.mobile-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Синхронизируем с десктопными
            syncFilters(btn, document.querySelectorAll('.sidebar-filters .filter-btn'));

            // Устанавливаем активный фильтр и обновляем сетку
            activeFilter = btn.dataset.filter;
            refreshGridFromState();

            clientLogger.info(`Filter changed to: ${activeFilter}`);
        });
    });
    // ... existing code ...

    // --- Init Upload Manager ---
    const uploadManager = new UploadManager(handleFileUploaded);

    // --- Quick Filters Logic ---
    const filterButtons = document.querySelectorAll('.filter-btn');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Убираем активный класс у всех кнопок
            filterButtons.forEach(b => b.classList.remove('active'));

            // Добавляем активный класс нажатой кнопке
            btn.classList.add('active');

            // Устанавливаем активный фильтр
            activeFilter = btn.dataset.filter;

            // Обновляем отображение
            refreshGridFromState();

            clientLogger.info(`Filter changed to: ${activeFilter}`);
        });
    });

    // --- User Menu Logic ---
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            if (sortMenu && sortMenu.classList.contains('active')) {
                sortManager.closeMenu();
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
                }, CONFIG.ANIMATION_DURATION);
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
    initClipboard();

    // --- Pagination Logic ---
    async function loadNextBatch() {
        if (isLoadingBatch) {
            clientLogger.warn('[LOAD] Already loading, skipping...');
            return;
        }

        isLoadingBatch = true;

        try {
            const sortConfig = sortManager.getSortConfig();
            const currentFolderPath = folderNav.getCurrentFolder();

            clientLogger.info(`[LOAD] Loading page ${currentPage}, batch size ${BATCH_SIZE}`);

            const response = await fetchFilesPage(
                currentPage,
                BATCH_SIZE,
                sortConfig.field,
                sortConfig.order,
                currentFolderPath
            );

            if (response && response.files) {
                const newFiles = response.files;

                clientLogger.info(`[LOAD] Received ${newFiles.length} files (total in DB: ${response.total})`);

                if (newFiles.length === 0) {
                    hasMoreFiles = false;
                    if (allFiles.length === 0) {
                        renderFilesGrid(filesListContainer, [], folderNav);
                        updateFileCount(fileCountLabel, 0, 0);
                    }
                    return;
                }

                allFiles = [...allFiles, ...newFiles];

                // Синхронизируем с глобальной переменной для мобильного модуля
                window.allFiles = allFiles;

                // Обновляем общее количество файлов
                if (response.total !== undefined) {
                    totalFilesCount = response.total;
                }

                if (currentPage === 1) {
                    refreshGridFromState();
                } else {
                    newFiles.forEach(file => addFileToGrid(filesListContainer, file));
                }

                updateFileCount(fileCountLabel, allFiles.length, totalFilesCount);

                if (newFiles.length < BATCH_SIZE) {
                    hasMoreFiles = false;
                    clientLogger.info(`[LOAD] No more files to load (${newFiles.length} < ${BATCH_SIZE})`);
                } else {
                    currentPage++;
                    clientLogger.info(`[LOAD] More files available, next page: ${currentPage}`);
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

    // ... existing code ...

    // --- Event Listeners: Uploads ---

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

    if (folderInput) {
        folderInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const files = Array.from(e.target.files);
                uploadManager.addToQueue(files);
                setTimeout(() => {
                    e.target.value = '';
                }, CONFIG.DEBOUNCE_DELAY * 2);
            }
        });
    }

    // 3. Мобильная кнопка
    if (mobileAddBtn && fileInput) {
        mobileAddBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // --- File Deletion Handlers ---
    window.addEventListener('filesDeleted', (event) => {
        const deletedIds = event.detail.deletedIds;
        allFiles = allFiles.filter(file => !deletedIds.includes(file.short_id));

        if (typeof totalFilesCount !== 'undefined') {
            totalFilesCount = Math.max(0, totalFilesCount - deletedIds.length);
        }

        refreshGridFromState();
    });

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

    // --- Init FileManager ---
    initFileManager(filesListContainer, fileCountLabel, folderNav);

    // --- Infinite Scroll Handler ---
    let scrollTimeout = null;
    const SCROLL_THRESHOLD = 200; // pixels from bottom to trigger load

    function handleScroll() {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }

        scrollTimeout = setTimeout(() => {
            if (!hasMoreFiles || isLoadingBatch) {
                return;
            }

            const scrollPosition = window.innerHeight + window.scrollY;
            const documentHeight = document.documentElement.scrollHeight;

            if (documentHeight - scrollPosition < SCROLL_THRESHOLD) {
                clientLogger.info(`[SCROLL] Loading next batch... (current: ${allFiles.length}, total: ${totalFilesCount})`);
                loadNextBatch();
            }
        }, CONFIG.DEBOUNCE_DELAY);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Добавляем индикатор загрузки внизу страницы
    function showLoadingIndicator() {
        let indicator = document.getElementById('scroll-loading-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'scroll-loading-indicator';
            indicator.innerHTML = `
                <div class="spinner-wrapper" style="position: relative; height: 100px;">
                    <div class="spinner"></div>
                    <div class="loading-text">Загрузка файлов...</div>
                </div>
            `;
            indicator.style.display = 'none';
            filesListContainer.appendChild(indicator);
        }
        indicator.style.display = 'block';
    }

    function hideLoadingIndicator() {
        const indicator = document.getElementById('scroll-loading-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    // Модифицируем loadNextBatch для показа индикатора
    const originalLoadNextBatch = loadNextBatch;
    loadNextBatch = async function () {
        if (isLoadingBatch) return;

        showLoadingIndicator();
        try {
            await originalLoadNextBatch();
        } finally {
            hideLoadingIndicator();
        }
    };


    // Start loading files
    loadNextBatch();
});