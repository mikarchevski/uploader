import { copyToClipboard } from './utils.js';
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

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const fileInput = document.getElementById('fileInput');
    const filesListContainer = document.getElementById('filesListContainer');
    const fileCountLabel = document.getElementById('fileCount');
    const fullscreenDropZone = document.getElementById('fullscreenDropZone');
    const themeToggleBtn = document.getElementById('themeToggle');
    const iconMoon = document.getElementById('iconMoon');
    const iconSun = document.getElementById('iconSun');
    const themeText = document.getElementById('themeText');
    const htmlElement = document.documentElement;
    const uploadBtn = document.getElementById('uploadBtn');

    // Sort Elements
    const btnSort = document.getElementById('btnSort');
    const sortMenu = document.getElementById('sortMenu');
    const btnSortText = document.getElementById('btnSortText');
    
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

    // --- User Menu Logic ---
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');


    const mobileAddBtn = document.getElementById('mobileAddBtn');
    if (mobileAddBtn && fileInput) {
        mobileAddBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // Очистка кэша превью при выходе
    const logoutLink = document.querySelector('.logout-item');
    if (logoutLink) {
        logoutLink.addEventListener('click', () => {
            clearPreviewCache();
        });
    }
    // Функция обновления иконок и текста
    function updateThemeUI(isDark) {
        if (isDark) {
            iconMoon.classList.add('hidden');
            iconSun.classList.remove('hidden');
            themeText.textContent = 'Светлая тема';
        } else {
            iconMoon.classList.remove('hidden');
            iconSun.classList.add('hidden');
            themeText.textContent = 'Тёмная тема';
        }
    }

     // Проверка сохраненной темы при загрузке
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlElement.setAttribute('data-theme', savedTheme);
        updateThemeUI(savedTheme === 'dark');
    } else {
        // Если нет сохранения, проверяем системные настройки
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        updateThemeUI(systemPrefersDark);
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Чтобы меню не закрылось сразу
            
            const currentTheme = htmlElement.getAttribute('data-theme');
            let newTheme;

            if (currentTheme === 'dark') {
                newTheme = 'light';
            } else {
                newTheme = 'dark';
            }

            htmlElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeUI(newTheme === 'dark');
        });
    }

    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 1. Если открыто меню сортировки - закрываем его
            if (sortMenu && sortMenu.classList.contains('active')) {
                sortMenu.classList.remove('active');
                const sortDropdown = btnSort ? btnSort.closest('.sort-dropdown') : null;
                if (sortDropdown) sortDropdown.classList.remove('active');
                setTimeout(() => {
                    if (sortMenu) sortMenu.classList.add('hidden');
                }, 200);
            }

            // 2. Переключаем меню пользователя
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

    window.copyToClipboard = copyToClipboard;

    // --- Helpers ---

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

    function refreshGridFromState() {
        const sortedFiles = sortFiles(allFiles, currentSortField, currentSortOrder);
        renderFilesGrid(filesListContainer, sortedFiles);
        updateFileCount(fileCountLabel, allFiles.length, totalFilesCount);
    }

    /**
     * Обработчик успешной загрузки файла из UploadManager
     */
    // ... existing code ...
    /**
     * Обработчик успешной загрузки файла из UploadManager
     */
    // ... existing code ...
    /**
     * Обработчик успешной загрузки файла из UploadManager
     */
    // ... existing code ...
    /**
     * Обработчик успешной загрузки файла из UploadManager
     */
    function handleFileUploaded(newFileData) {
        // Проверяем, нет ли уже такого файла в массиве
        const exists = allFiles.some(f => f.short_id === newFileData.short_id);
        
        if (!exists) {
            allFiles.unshift(newFileData);
            if (typeof totalFilesCount !== 'undefined') {
                totalFilesCount++;
            }
            refreshGridFromState();
        }
    }

    // Обработчик удаления файлов
// ... existing code ...

    // Обработчик удаления файлов
    window.addEventListener('filesDeleted', (event) => {
        const deletedIds = event.detail.deletedIds;
        
        // Удаляем файлы из массива allFiles
        allFiles = allFiles.filter(file => !deletedIds.includes(file.short_id));
        
        // Обновляем общее количество
        if (typeof totalFilesCount !== 'undefined') {
            totalFilesCount = Math.max(0, totalFilesCount - deletedIds.length);
        }
        
        // Перерисовываем сетку
        refreshGridFromState();
    });

    // --- Init Upload Manager ---
// ... existing code ...

    // --- Init Upload Manager ---
    // Создаем менеджер загрузок ОДИН раз
    const uploadManager = new UploadManager(handleFileUploaded);

    // --- Pagination Logic ---

    async function loadNextBatch() {
        if (!hasMoreFiles || isLoadingBatch) return;
        
        isLoadingBatch = true;
        
        try {
            const limit = (currentPage === 1) ? INITIAL_LOAD_COUNT : BATCH_SIZE;
            const data = await fetchFilesPage(currentPage, limit);
            
            if (data.files && data.files.length > 0) {
                hasMoreFiles = data.has_more;
                
                // Сохраняем общее количество из API (только если оно пришло)
                if (data.total !== undefined) {
                    totalFilesCount = data.total;
                }


                if (currentPage === 1) {
                    allFiles = data.files;
                } else {
                    allFiles.push(...data.files);
                }
                
                currentPage++;
                
                refreshGridFromState();

                if (hasMoreFiles) {
                    setTimeout(() => {
                        isLoadingBatch = false;
                        loadNextBatch();
                    }, 1000);
                } else {
                    isLoadingBatch = false;
                }
            } else {
                hasMoreFiles = false;
                isLoadingBatch = false;
                refreshGridFromState(); 
            }
        } catch (err) {
            console.error("Ошибка загрузки пачки:", err);
            isLoadingBatch = false;
            refreshGridFromState(); 
        }
    }

    // --- Event Listeners: Sorting ---

    if (btnSort && sortMenu) {
        updateSortButtonText();

        btnSort.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = btnSort.closest('.sort-dropdown');
            const isActive = sortMenu.classList.contains('active');
            
            // Если открываем сортировку, закрываем меню пользователя
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
            // Закрываем сортировку, если клик вне её И вне меню пользователя
            if (!sortMenu.contains(e.target) && e.target !== btnSort) {
                sortMenu.classList.remove('active');
                dropdown.classList.remove('active');
                setTimeout(() => sortMenu.classList.add('hidden'), 200);
            }
        });

        // 1. Обработчики для кнопок выбора ПОЛЯ сортировки (Дата, Имя и т.д.)
        sortMenu.querySelectorAll('.sort-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const field = btn.getAttribute('data-field');
                if (!field) return;

                currentSortField = field;

                // Обновляем визуальный класс active
                sortMenu.querySelectorAll('.sort-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Сортируем и перерисовываем
                refreshGridFromState();
                updateSortButtonText();

                // Закрываем меню после выбора
                sortMenu.classList.remove('active');
                btnSort.closest('.sort-dropdown').classList.remove('active');
                setTimeout(() => sortMenu.classList.add('hidden'), 200);
            });
        });
        
        // 2. Обработчики для кнопок выбора ПОРЯДКА (По возрастанию/убыванию)
        sortMenu.querySelectorAll('.sort-order-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const order = btn.getAttribute('data-order');
                if (!order) return;

                currentSortOrder = order;

                // Обновляем визуальный класс active
                sortMenu.querySelectorAll('.sort-order-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Сортируем и перерисовываем
                refreshGridFromState();
                updateSortButtonText();

                // Закрываем меню после выбора
                sortMenu.classList.remove('active');
                btnSort.closest('.sort-dropdown').classList.remove('active');
                setTimeout(() => sortMenu.classList.add('hidden'), 200);
            });
        });
    }

    // --- Event Listeners: Uploads & DragDrop ---

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                // Передаем файлы в менеджер загрузок
                uploadManager.addToQueue(Array.from(e.target.files));
                e.target.value = ''; // Сбрасываем value, чтобы можно было выбрать тот же файл повторно
            }
        });
    }

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

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

    document.body.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            uploadManager.addToQueue(Array.from(e.dataTransfer.files));
        }
    });

    // --- Init ---
    initFileManager(filesListContainer, fileCountLabel);
    
    // Запускаем загрузку файлов ТОЛЬКО ОДИН РАЗ
    loadNextBatch();
});