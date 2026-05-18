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

    function selectItem(key, element) {
        document.querySelectorAll('.file-card.selected').forEach(el => {
            if (el !== element) el.classList.remove('selected');
        });
        
        selectedItemKey = key;
        element.classList.add('selected');
        
        if (!isPanelOpen) {
            openFileActionBar(element);
        } else {
            updateActionBarState(element);
        }
    }

    function clearSelection() {
        document.querySelectorAll('.file-card.selected').forEach(el => el.classList.remove('selected'));
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
            btnCopyLink.textContent = '🔗 Поделиться';
            btnDelete.textContent = '🗑 Удалить';
            
            const folderPath = activeCard.getAttribute('data-folder-path');
            
            // Скачивание папки как ZIP
            btnDownload.onclick = () => downloadFolderAsZip(folderPath, name);
            
            // Копирование ссылки (пока просто заглушка или ссылка на текущий URL)
            btnCopyLink.onclick = () => {
                // Можно сделать генерацию специальной ссылки, пока копируем текущую
                copyToClipboard(window.location.href); 
                showToast('Ссылка скопирована');
            };
            
            btnDelete.onclick = () => openDeleteModal({ type: 'folder', name, path: folderPath });

        } else {
            // Настройки для ФАЙЛА
            btnDownload.textContent = '⬇ Скачать';
            btnCopyLink.textContent = '🔗 Поделиться';
            btnDelete.textContent = '🗑 Удалить';
            
            const url = `/d/${selectedItemKey}`;
            
            btnDownload.onclick = () => window.location.href = url;
            btnCopyLink.onclick = () => copyToClipboard(url);
            btnDelete.onclick = () => openDeleteModal({ type: 'file', name, id: selectedItemKey });
        }
    }

    // --- Скачивание папки как ZIP ---
    // ... existing code ...

    // --- Скачивание папки как ZIP ---
    async function downloadFolderAsZip(folderPath, folderName) {
        try {
            showToast('Подготовка архива...');
            
            // Делаем запрос к нашему новому API
            const response = await fetch(`/api/download/folder?path=${encodeURIComponent(folderPath)}`);
            
            if (!response.ok) {
                throw new Error('Failed to create archive');
            }

            // Получаем blob (бинарные данные архива)
            const blob = await response.blob();
            
            // Создаем временную ссылку для скачивания
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${folderName}.zip`;
            document.body.appendChild(a);
            a.click();
            
            // Убираем за собой
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('Архив скачан');
        } catch (err) {
            console.error("Zip download error:", err);
            showToast('Ошибка при создании архива', true);
        }
    }

// ... existing code ...

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
            selectItem(key, card);
        }
        
        e.stopPropagation();
    });
     // Обработчик ДВОЙНОГО клика
     filesListContainer.addEventListener('dblclick', (e) => {
        const card = e.target.closest('.file-card');
        if (!card) return;

        // Открываем папку при двойном клике
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