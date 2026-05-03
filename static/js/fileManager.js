// fileManager.js
import { copyToClipboard, showToast } from './utils.js';
import { updateFileCount } from './ui.js';

export function initFileManager(filesListContainer, fileCountLabel) {
    const fileActionBar = document.getElementById('fileActionBar');
    const actionFileName = document.getElementById('actionFileName');
    
    // Кнопки внутри панели действий файла
    const btnDownload = document.getElementById('btnDownload');
    const btnCopyLink = document.getElementById('btnCopyLink');
    const btnDelete = document.getElementById('btnDelete');
    const btnCloseBar = document.getElementById('btnCloseBar');
    
    // Элементы модального окна
    const deleteModal = document.getElementById('deleteConfirmModal');
    const modalFileName = document.getElementById('modalFileName');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    const btnCancelDelete = document.getElementById('btnCancelDelete');

    let pendingDeleteFiles = []; 
    let isPanelOpen = false;      
    let selectedIds = new Set(); 

    // --- Логика Модального Окна ---
    function openDeleteModal(filesToDelete) {
        pendingDeleteFiles = filesToDelete;
        
        if (filesToDelete.length === 1) {
            modalFileName.innerHTML = `Вы действительно хотите удалить файл <strong>${filesToDelete[0].filename}</strong>?`;
        } else {
            modalFileName.innerHTML = `Вы действительно хотите удалить <strong>${filesToDelete.length}</strong> файл(ов)?`;
        }
        
        deleteModal.classList.remove('hidden');
        setTimeout(() => deleteModal.classList.add('active'), 10);
    }

    function closeDeleteModal() {
        deleteModal.classList.remove('active');
        setTimeout(() => {
            deleteModal.classList.add('hidden');
            pendingDeleteFiles = [];
        }, 200);
    }

    if (btnCancelDelete) {
        btnCancelDelete.onclick = (e) => {
            e.stopPropagation();
            closeDeleteModal();
        };
    }

    if (btnConfirmDelete) {
        btnConfirmDelete.onclick = async (e) => {
            e.stopPropagation();
            if (pendingDeleteFiles.length === 0) return;
            
            const idsToDelete = pendingDeleteFiles.map(f => f.short_id);
            closeDeleteModal(); 
            
            await performBulkDelete(idsToDelete);
        };
    }

    // --- Функции управления выделением ---

    function toggleSelection(shortId, element) {
        if (selectedIds.has(shortId)) {
            selectedIds.delete(shortId);
            element.classList.remove('selected');
        } else {
            selectedIds.add(shortId);
            element.classList.add('selected');
        }
        updateUIForSelection();
    }

    // clearSelection теперь принимает флаг, чтобы не закрывать панель, если мы знаем, что она нужна
    function clearSelection(keepPanelOpen = false) {
        const selectedElements = document.querySelectorAll('.file-card.selected');
        selectedElements.forEach(el => el.classList.remove('selected'));
        selectedIds.clear();
        
        // Если мы не просили держать панель открытой, обновляем UI (что закроет её)
        if (!keepPanelOpen) {
            updateUIForSelection();
        }
        // Если keepPanelOpen === true, мы просто очистили данные, но панель останется висеть
        // до следующего явного вызова updateUIForSelection или closeFileActionBar
    }

    function updateUIForSelection() {
        const count = selectedIds.size;

        if (count > 0) {
            if (!isPanelOpen) {
                openFileActionBar();
            } else {
                updateActionBarState(count);
            }
        } else {
            if (isPanelOpen) {
                closeFileActionBar();
            }
        }
    }

    function updateActionBarState(selectedCount) {
        if (selectedCount === 0) {
            closeFileActionBar();
            return;
        }

        if (selectedCount === 1) {
            // --- Режим ОДНОГО файла (Прямое скачивание) ---
            const id = Array.from(selectedIds)[0];
            const card = document.querySelector(`.file-card[data-short-id="${id}"]`);
            
            if (card) {
                const filename = card.querySelector('.file-card-name').textContent;
                actionFileName.textContent = filename;
                
                btnDownload.classList.remove('hidden');
                btnDownload.textContent = '⬇ Скачать'; 
                
                btnCopyLink.classList.remove('hidden');
                
                btnDelete.textContent = '🗑 Удалить';
                
                const url = `/d/${id}`;
                
                // Прямое скачивание без ZIP
                btnDownload.onclick = () => window.location.href = url;
                
                btnCopyLink.onclick = () => copyToClipboard(url);
                
                btnDelete.onclick = () => openDeleteModal([{ short_id: id, filename }]);
            }
        } else {
            // --- Режим МНОЖЕСТВЕННОГО выбора (Скачивание ZIP) ---
            actionFileName.textContent = `Выбрано файлов: ${selectedCount}`;
            
            btnDownload.classList.remove('hidden');
            btnDownload.textContent = '⬇ Скачать ZIP'; 
            
            // Назначаем функцию создания ZIP
            btnDownload.onclick = () => downloadSelectedAsZip();

            btnCopyLink.classList.add('hidden');
            
            btnDelete.textContent = `🗑 Удалить`;
            
            const dummyFiles = Array.from(selectedIds).map(id => ({ short_id: id, filename: '' }));
            btnDelete.onclick = () => openDeleteModal(dummyFiles);
        }
    }

    // --- Массовое скачивание (ZIP) ---
    async function downloadSelectedAsZip() {
        if (selectedIds.size === 0) return;

        const originalText = btnDownload.textContent;
        btnDownload.textContent = '⏳ Подготовка...';
        btnDownload.disabled = true;

        const zip = new JSZip();
        const folder = zip.folder("files");
        let successCount = 0;

        try {
            for (const id of selectedIds) {
                const card = document.querySelector(`.file-card[data-short-id="${id}"]`);
                if (!card) continue;

                const filename = card.querySelector('.file-card-name').textContent;
                const url = `/d/${id}`;

                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Network response was not ok');
                    
                    const blob = await response.blob();
                    folder.file(filename, blob);
                    successCount++;
                } catch (err) {
                    console.error(`Failed to download ${filename}:`, err);
                }
            }

            if (successCount === 0) {
                showToast('Не удалось скачать ни один файл', true);
                return;
            }

            showToast(`Архивация ${successCount} файлов...`);

            const content = await zip.generateAsync({ type: "blob" });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `files_archive_${new Date().getTime()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Архив успешно создан!');

        } catch (err) {
            console.error(err);
            showToast('Ошибка при создании архива', true);
        } finally {
            btnDownload.textContent = originalText;
            btnDownload.disabled = false;
        }
    }

    // --- Логика массового удаления ---
    async function performBulkDelete(idsToDelete) {
        if (!idsToDelete || idsToDelete.length === 0) return;

        const countToDelete = idsToDelete.length;

        idsToDelete.forEach(id => {
            const card = filesListContainer.querySelector(`.file-card[data-short-id="${id}"]`);
            if (card) {
                card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                card.style.pointerEvents = 'none';
                
                setTimeout(() => {
                    if (card.parentNode) card.remove();
                }, 200);
            }
        });

        if (fileCountLabel) {
            const match = fileCountLabel.textContent.match(/\d+/);
            if (match) {
                const currentCount = parseInt(match[0]);
                const newCount = Math.max(0, currentCount - countToDelete);
                updateFileCount(fileCountLabel, newCount);
            }
        }

        showToast(`Удалено файлов: ${countToDelete}`);

        clearSelection(); // Здесь можно закрыть панель, так как файлов больше нет
        closeFileActionBar();

        idsToDelete.forEach(id => {
            fetch(`/api/delete/${id}`, { method: 'DELETE' })
                .catch(err => console.error(`Network error deleting ${id}`, err));
        });
    }

    // --- Управление панелью действий ---
    function openFileActionBar() {
        isPanelOpen = true;
        fileActionBar.classList.remove('hidden');
        // Небольшая задержка для CSS transition
        requestAnimationFrame(() => {
            fileActionBar.classList.add('active');
        });
        updateActionBarState(selectedIds.size);
    }

    function closeFileActionBar() {
        if (!isPanelOpen) return;
        isPanelOpen = false;
        fileActionBar.classList.remove('active');
        setTimeout(() => {
            fileActionBar.classList.add('hidden');
        }, 300);
    }

    if (btnCloseBar) {
        btnCloseBar.addEventListener('click', (e) => {
            e.stopPropagation();
            clearSelection(); 
            closeFileActionBar();
        });
    }

    // --- Обработчик клика по сетке файлов ---
    filesListContainer.addEventListener('click', (e) => {
        // === НОВОЕ: Закрываем меню сортировки при клике на файл ===
        const sortMenu = document.getElementById('sortMenu');
        const btnSort = document.getElementById('btnSort');
        
        if (sortMenu && sortMenu.classList.contains('active')) {
            sortMenu.classList.remove('active');
            if (btnSort) {
                const dropdown = btnSort.closest('.sort-dropdown');
                if (dropdown) dropdown.classList.remove('active');
            }
            setTimeout(() => sortMenu.classList.add('hidden'), 200);
        }

        // === 2. ЗАКРЫВАЕМ МЕНЮ ПОЛЬЗОВАТЕЛЯ, ЕСЛИ ОНО ОТКРЫТО ===
        const userDropdown = document.getElementById('userDropdown');
        const userMenuBtn = document.getElementById('userMenuBtn');

        if (userDropdown && userDropdown.classList.contains('show')) {
            userDropdown.classList.remove('show');
            // Добавляем hidden с небольшой задержкой для анимации (как в app.js)
            setTimeout(() => {
                if (!userDropdown.classList.contains('show')) {
                    userDropdown.classList.add('hidden');
                }
            }, 200);
        }

        const card = e.target.closest('.file-card');
        
        // Если клик был по кнопкам внутри карточки, игнорируем выбор
        if (e.target.closest('.action-btn')) return;

        // Если клик в пустоту внутри контейнера
        if (!card) {
            clearSelection(); // Закроет панель через updateUIForSelection
            return;
        }

        const shortId = card.getAttribute('data-short-id');

        // Мультиселект (Ctrl / Cmd)
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault(); 
            e.stopPropagation(); 
            toggleSelection(shortId, card);
        } else {
            // Обычный клик
            
            // Если кликнули на уже выбранный файл
            if (selectedIds.has(shortId)) {
                // Если выбрано много, оставляем только этот
                if (selectedIds.size > 1) {
                    clearSelection(true); // Очищаем, но держим панель открытой
                    card.classList.add('selected');
                    selectedIds.add(shortId);
                    updateUIForSelection(); // Обновляем панель под 1 файл
                } 
                // Если один, просто убеждаемся, что панель открыта
                else {
                    if (!isPanelOpen) openFileActionBar();
                }
            } else {
                // Клик по новому файлу -> сброс старого, выбор нового
                
                // ВАЖНО: Передаем true, чтобы clearSelection не закрыл панель сразу
                clearSelection(true); 
                
                card.classList.add('selected');
                selectedIds.add(shortId);
                
                // Теперь явно открываем/обновляем панель для нового файла
                if (!isPanelOpen) {
                    openFileActionBar();
                } else {
                    updateActionBarState(1);
                }
            }
            
            // Останавливаем всплытие, чтобы глобальный обработчик не сработал
            e.stopPropagation();
        }
    });

    // Глобальный клик для закрытия панели (только если клик вне важных зон)
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.file-card');
        const clickedInsideBar = e.target.closest('#fileActionBar');
        const clickedInsideModal = e.target.closest('#deleteConfirmModal');
        const clickedInsideSort = e.target.closest('.sort-dropdown');

        // Закрываем панель ТОЛЬКО если клик был НЕ по карточке, НЕ по панели, НЕ по модалке и НЕ по сортировке
        if (!card && !clickedInsideBar && !clickedInsideModal && !clickedInsideSort) {
            clearSelection();
        }
    }, true); // Используем capture phase для надежности
}