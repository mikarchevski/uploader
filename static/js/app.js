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
import { CONFIG } from './config.js';
import { FolderNavigation } from './folderNavigation.js';
import { ThemeManager } from './themeManager.js';
import { SortManager } from './sortManager.js';
import { DragDropHandler } from './dragDropHandler.js';

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
    
    let currentPage = 1;
    const BATCH_SIZE = CONFIG.BATCH_SIZE;
    let hasMoreFiles = true;
    let isLoadingBatch = false;

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
    
    // Делаем доступным глобально для onclick в хлебных крошках
    window.folderNav = folderNav;

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

    function refreshGridFromState() {
        const sortedFiles = sortFiles(allFiles, currentSortField, currentSortOrder);
        
        let filesToShow = sortedFiles;
        
        if (currentFolderPath) {
            filesToShow = sortedFiles.filter(f => {
                const fp = f.folder_path || '';
                return fp === currentFolderPath || fp.startsWith(currentFolderPath + '/');
            });
        } else {
            filesToShow = sortedFiles.filter(f => !f.folder_path || f.folder_path === '');
        }

        renderFilesGrid(filesListContainer, filesToShow);
        updateFileCount(fileCountLabel, filesToShow.length, totalFilesCount);
    }
    function handleFileUploaded(newFileData) {
        const exists = allFiles.some(f => f.short_id === newFileData.short_id);
        
        if (!exists) {
            allFiles.unshift(newFileData);
            if (typeof totalFilesCount !== 'undefined') {
                totalFilesCount++;
            }
            
            // Вместо полной перерисовки добавляем только новый файл
            addFileToGrid(filesListContainer, newFileData);
            
            // Обновляем только счетчик
            updateFileCount(fileCountLabel, allFiles.length, totalFilesCount);
        }
    }

    // --- Init Upload Manager ---
    const uploadManager = new UploadManager(handleFileUploaded);

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

    window.copyToClipboard = copyToClipboard;

    // --- Pagination Logic ---
    async function loadNextBatch() {
        try {
            const sortConfig = sortManager.getSortConfig();
            const currentFolderPath = folderNav.getCurrentFolder();
            
            const response = await fetchFilesPage(
                currentPage, 
                BATCH_SIZE, 
                sortConfig.field, 
                sortConfig.order,
                currentFolderPath
            );
            
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
    initFileManager(filesListContainer, fileCountLabel);
    
    // Start loading files
    loadNextBatch();
});