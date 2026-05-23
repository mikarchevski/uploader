/**
 * Модуль для управления светлой/тёмной темой
 */
export class ThemeManager {
    constructor(options) {
        this.themeToggleBtn = options.themeToggleBtn;
        this.iconMoon = options.iconMoon;
        this.iconSun = options.iconSun;
        this.themeText = options.themeText;
        this.htmlElement = options.htmlElement;
        
        this.init();
    }

    init() {
        this.loadSavedTheme();
        this.setupEventListeners();
    }

    loadSavedTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            this.htmlElement.setAttribute('data-theme', savedTheme);
            this.updateThemeUI(savedTheme === 'dark');
        } else {
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.updateThemeUI(systemPrefersDark);
        }
    }

    updateThemeUI(isDark) {
        if (isDark) {
            if (this.iconMoon) this.iconMoon.classList.add('hidden');
            if (this.iconSun) this.iconSun.classList.remove('hidden');
            if (this.themeText) this.themeText.textContent = 'Светлая тема';
        } else {
            if (this.iconMoon) this.iconMoon.classList.remove('hidden');
            if (this.iconSun) this.iconSun.classList.add('hidden');
            if (this.themeText) this.themeText.textContent = 'Тёмная тема';
        }
    }

    toggleTheme() {
        const currentTheme = this.htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        this.htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeUI(newTheme === 'dark');
    }

    setupEventListeners() {
        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTheme();
            });
        }
    }
}