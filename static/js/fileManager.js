// fileManager.js
import { copyToClipboard, showToast } from './utils.js';
import { updateFileCount } from './ui.js';

export function initFileManager(filesListContainer, fileCountLabel) {
    const fileActionBar = document.getElementById('fileActionBar');
    const actionFileName = document.getElementById('actionFileName');
    
    const btnDownload = document.getElementById('btnDownload');
    const btnCopyLink = document.getElementById('btnCopyLink');
    const btnDelete = document.getElementById('btnDelete');
    const btnCloseBar = document.getElementById('btnCloseBar');
    
    const deleteModal = document.getElementById('deleteConfirmModal');
    const modalFileName = document.getElementById('modalFileName');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    const btnCancelDelete = document.getElementById('btnCancelDelete');

    let pendingDeleteItem = null; 
    let isPanelOpen = false;      
    let selectedItemKey = null;   
    let selectedItems = new Map(); 

    // --- Логика Модального Окна ---
    function openDeleteModal(item) {
        pendingDeleteItem = item;
        const safeName = escapeHtml(item.name);
        
        if (item.type === 'folder') {
            modalFileName.innerHTML = `Удалить папку <strong>${safeName}</strong> и всё её содержимое?`;
        } else {
            modalFileName.innerHTML = `Удалить файл <strong>${safeName}</strong>?`;
        }
        
        deleteModal.classList.remove('hidden');
        setTimeout(() => deleteModal.classList.add('active'), 10);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function closeDeleteModal() {
        deleteModal.classList.remove('active');
        setTimeout(() => {
            deleteModal.classList.add('hidden');
            pendingDeleteItem = null;
        }, 200);
    }

    // Обработчик клавиши Esc для закрытия модального окна
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !deleteModal.classList.contains('hidden')) {
            closeDeleteModal();
        }
    });

    if (btnCancelDelete) {
        btnCancelDelete.onclick = (e) => {
            e.stopPropagation();
            closeDeleteModal();
        };
    }

    if (btnConfirmDelete) {
        btnConfirmDelete.onclick = async (e) => {
            e.stopPropagation();
            if (!pendingDeleteItem) return;
            
            closeDeleteModal(); 
            
            if (pendingDeleteItem.type === 'folder') {
                await performFolderDelete(pendingDeleteItem.path);
            } else {
                await performBulkDelete([pendingDeleteItem.id]);
            }
        };
    }

    // --- Управление выделением и Панелью ---

    function selectItem(key, element, isMultiSelect = false) {
        if (!isMultiSelect) {
            document.querySelectorAll('.file-card.selected').forEach(el => {
                el.classList.remove('selected');
            });
            selectedItems.clear();
            
            selectedItemKey = key;
            element.classList.add('selected');
            selectedItems.set(key, element);
        } else {
            if (selectedItems.has(key)) {
                element.classList.remove('selected');
                selectedItems.delete(key);
                
                if (selectedItemKey === key) {
                    selectedItemKey = selectedItems.size > 0 ? Array.from(selectedItems.keys())[0] : null;
                }
            } else {
                element.classList.add('selected');
                selectedItems.set(key, element);
                
                if (!selectedItemKey || selectedItems.size === 1) {
                    selectedItemKey = key;
                }
            }
        }
        
        if (selectedItems.size > 0) {
            if (!isPanelOpen) {
                openFileActionBar(element);
            } else {
                updateActionBarState(element);
            }
        } else {
            clearSelection();
        }
    }

    function clearSelection() {
        document.querySelectorAll('.file-card.selected').forEach(el => el.classList.remove('selected'));
        selectedItems.clear();
        selectedItemKey = null;
        if (isPanelOpen) closeFileActionBar();
    }

    // ЕДИНАЯ ЛОГИКА ПАНЕЛИ ДЛЯ ВСЕХ ОБЪЕКТОВ
    function updateActionBarState(activeCard) {
        if (!selectedItemKey || !activeCard) {
            closeFileActionBar();
            return;
        }

        const name = activeCard.querySelector('.file-card-name').textContent;
        actionFileName.textContent = name;
        
        const isFolder = activeCard.classList.contains('folder-card');

        // Сбрасываем старые обработчики
        btnDownload.onclick = null;
        btnCopyLink.onclick = null;
        btnDelete.onclick = null;

        // ВСЕГДА показываем все три кнопки
        btnDownload.classList.remove('hidden');
        btnCopyLink.classList.remove('hidden');
        btnDelete.classList.remove('hidden');

        if (isFolder) {
            // Настройки для ПАПКИ
            btnDownload.textContent = '⬇ Скачать ZIP';
            btnCopyLink.textContent = '📋 Ссылка';
            btnDelete.textContent = '🗑 Удалить';
            
            const folderPath = activeCard.getAttribute('data-folder-path');
            
            // Скачивание папки как ZIP
            btnDownload.onclick = () => downloadFolderAsZip(folderPath, name);
            
            // Копирование ссылки
            btnCopyLink.onclick = () => {
                copyToClipboard(window.location.href); 
                showToast('Ссылка скопирована');
            };
            
            btnDelete.onclick = () => openDeleteModal({ type: 'folder', name, path: folderPath });

        } else {
            // Настройки для ФАЙЛА
            btnDownload.textContent = '⬇ Скачать';
            btnCopyLink.textContent = '📋 Ссылка';
            btnDelete.textContent = '🗑 Удалить';
            
            const url = `/d/${selectedItemKey}`;
            
            btnDownload.onclick = () => window.location.href = url;
            btnCopyLink.onclick = () => copyToClipboard(url);
            btnDelete.onclick = () => openDeleteModal({ type: 'file', name, id: selectedItemKey });
        }
    }

    // --- Скачивание папки как ZIP ---
    async function downloadFolderAsZip(folderPath, folderName) {
        try {
            showToast('Подготовка архива...');
            
            const response = await fetch(`/api/download/folder?path=${encodeURIComponent(folderPath)}`);
            
            if (!response.ok) {
                throw new Error('Failed to create archive');
            }

            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${folderName}.zip`;
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('Архив скачан');
        } catch (err) {
            console.error("Zip download error:", err);
            showToast('Ошибка при создании архива', true);
        }
    }

    // --- Удаление ПАПКИ ---
    async function performFolderDelete(folderPath) {
        try {
            const res = await fetch('/api/delete/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_path: folderPath })
            });
            
            const data = await res.json();
            if (data.success) {
                const folderCard = document.querySelector(`.file-card[data-folder-path="${folderPath}"]`);
                if (folderCard) {
                    folderCard.style.opacity = '0';
                    folderCard.style.transform = 'scale(0.9)';
                    setTimeout(() => folderCard.remove(), 200);
                }

                window.dispatchEvent(new CustomEvent('folderDeleted', { 
                    detail: { folderPath } 
                }));
                
                showToast('Папка успешно удалена');
                clearSelection();
            } else {
                showToast(data.error || 'Ошибка при удалении папки', true);
            }
        } catch (err) {
            console.error("Delete folder error:", err);
            showToast('Ошибка сети при удалении', true);
        }
    }

    // --- Удаление ФАЙЛОВ ---
    async function performBulkDelete(idsToDelete) {
        if (!idsToDelete || idsToDelete.length === 0) return;

        idsToDelete.forEach(id => {
            const card = filesListContainer.querySelector(`.file-card[data-short-id="${id}"]`);
            if (card) {
                card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => { if (card.parentNode) card.remove(); }, 200);
            }
        });

        if (fileCountLabel) {
            const match = fileCountLabel.textContent.match(/\d+/);
            if (match) {
                const currentCount = parseInt(match[0]);
                updateFileCount(fileCountLabel, Math.max(0, currentCount - idsToDelete.length));
            }
        }

        showToast(`Удалено объектов: ${idsToDelete.length}`);
        clearSelection();

        for (const id of idsToDelete) {
            try { await fetch(`/api/delete/${id}`, { method: 'DELETE' }); } 
            catch (err) { console.error(`Error deleting ${id}`, err); }
        }
        
        window.dispatchEvent(new CustomEvent('filesDeleted', { 
            detail: { deletedIds: idsToDelete } 
        }));
    }

    // --- Управление панелью ---
    function openFileActionBar(activeCard) {
        isPanelOpen = true;
        fileActionBar.classList.remove('hidden');
        requestAnimationFrame(() => {
            fileActionBar.classList.add('active');
            if (activeCard) updateActionBarState(activeCard);
        });
    }

    function closeFileActionBar() {
        if (!isPanelOpen) return;
        isPanelOpen = false;
        fileActionBar.classList.remove('active');
        setTimeout(() => fileActionBar.classList.add('hidden'), 300);
    }

    if (btnCloseBar) {
        btnCloseBar.addEventListener('click', (e) => {
            e.stopPropagation();
            clearSelection(); 
        });
    }

    // --- Обработчик клика по сетке ---
    filesListContainer.addEventListener('click', (e) => {
        const sortMenu = document.getElementById('sortMenu');
        if (sortMenu && sortMenu.classList.contains('active')) {
            sortMenu.classList.remove('active');
            setTimeout(() => sortMenu.classList.add('hidden'), 200);
        }

        const userDropdown = document.getElementById('userDropdown');
        if (userDropdown && userDropdown.classList.contains('show')) {
            userDropdown.classList.remove('show');
            setTimeout(() => userDropdown.classList.add('hidden'), 200);
        }

        const card = e.target.closest('.file-card');
        if (e.target.closest('.action-btn')) return;

        if (!card) {
            clearSelection();
            return;
        }

        const key = card.getAttribute('data-short-id') || card.getAttribute('data-folder-path');
        
        if (key) {
            const isMultiSelect = e.ctrlKey || e.metaKey;
            selectItem(key, card, isMultiSelect);
        }
        
        e.stopPropagation();
    });
    
    // Обработчик ДВОЙНОГО клика
    filesListContainer.addEventListener('dblclick', (e) => {
        const card = e.target.closest('.file-card');
        if (!card) return;

        if (card.classList.contains('folder-card')) {
            const folderPath = card.getAttribute('data-folder-path');
            if (folderPath && window.navigateToFolder) {
                window.navigateToFolder(folderPath);
            }
        }
    });

    document.addEventListener('click', (e) => {
        const card = e.target.closest('.file-card');
        const clickedInsideBar = e.target.closest('#fileActionBar');
        const clickedInsideModal = e.target.closest('#deleteConfirmModal');
        const clickedInsideSort = e.target.closest('.sort-dropdown');

        if (!card && !clickedInsideBar && !clickedInsideModal && !clickedInsideSort) {
            clearSelection();
        }
    }, true);
}