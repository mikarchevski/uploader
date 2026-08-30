import { CONFIG } from './config.js';

/**
 * Модуль для управления сортировкой файлов
 */
export class SortManager {
    constructor(options) {
        this.btnSort = options.btnSort;
        this.sortMenu = options.sortMenu;
        this.btnSortText = options.btnSortText;
        this.userDropdown = options.userDropdown;

        this.currentSortField = CONFIG.DEFAULT_SORT_FIELD;
        this.currentSortOrder = CONFIG.DEFAULT_SORT_ORDER;

        this.onSortChange = options.onSortChange; // callback при изменении сортировки

        this.init();
    }

    init() {
        this.updateSortButtonText();
        this.setupEventListeners();
    }

    getSortConfig() {
        return {
            field: this.currentSortField,
            order: this.currentSortOrder
        };
    }

    updateSortButtonText() {
        if (!this.btnSortText) return;

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

        const fieldName = fieldMap[this.currentSortField] || 'Дате';
        const orderName = orderMap[this.currentSortOrder] || '';

        this.btnSortText.textContent = `${fieldName}${orderName}`;
    }

    updateMenuSelection() {
        // Обновляем активные опции поля сортировки
        this.sortMenu.querySelectorAll('.sort-option').forEach(btn => {
            const field = btn.getAttribute('data-field');
            if (field === this.currentSortField) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Обновляем активные кнопки порядка сортировки
        this.sortMenu.querySelectorAll('.sort-order-btn').forEach(btn => {
            const order = btn.getAttribute('data-order');
            if (order === this.currentSortOrder) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    setSort(field, order) {
        this.currentSortField = field;
        this.currentSortOrder = order;
        this.updateSortButtonText();
        this.updateMenuSelection();

        if (this.onSortChange) {
            this.onSortChange(this.currentSortField, this.currentSortOrder);
        }
    }

    toggleMenu() {
        const dropdown = this.btnSort.closest('.sort-dropdown');
        const isActive = this.sortMenu.classList.contains('active');

        if (!isActive && this.userDropdown) {
            this.userDropdown.classList.remove('show');
            setTimeout(() => {
                if (!this.userDropdown.classList.contains('show')) {
                    this.userDropdown.classList.add('hidden');
                }
            }, CONFIG.ANIMATION_DURATION);
        }

        if (isActive) {
            this.sortMenu.classList.remove('active');
            dropdown.classList.remove('active');
            setTimeout(() => this.sortMenu.classList.add('hidden'), CONFIG.ANIMATION_DURATION);
        } else {
            this.sortMenu.classList.remove('hidden');
            setTimeout(() => {
                this.sortMenu.classList.add('active');
                dropdown.classList.add('active');
            }, 10);
        }
    }

    closeMenu() {
        const dropdown = this.btnSort.closest('.sort-dropdown');
        this.sortMenu.classList.remove('active');
        dropdown.classList.remove('active');
        setTimeout(() => this.sortMenu.classList.add('hidden'), CONFIG.ANIMATION_DURATION);
    }

    setupEventListeners() {
        if (!this.btnSort || !this.sortMenu) return;

        // Открытие/закрытие меню сортировки
        this.btnSort.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Закрытие при клике вне меню
        document.addEventListener('click', (e) => {
            const dropdown = this.btnSort.closest('.sort-dropdown');
            if (!this.sortMenu.contains(e.target) && e.target !== this.btnSort) {
                this.closeMenu();
            }
        });

        // Обработчики кнопок выбора поля сортировки
        this.sortMenu.querySelectorAll('.sort-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const field = btn.getAttribute('data-field');
                if (!field) return;

                this.setSort(field, this.currentSortOrder);
                this.closeMenu();
            });
        });

        // Обработчики кнопок порядка сортировки
        this.sortMenu.querySelectorAll('.sort-order-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const order = btn.getAttribute('data-order');
                if (!order) return;

                this.setSort(this.currentSortField, order);
                this.closeMenu();
            });
        });
    }
}
