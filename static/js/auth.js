// static/js/auth.js

document.addEventListener('DOMContentLoaded', () => {
    const pageTitle = document.getElementById('pageTitle');
    const submitBtn = document.getElementById('submitBtn');
    const toggleLink = document.getElementById('toggleLink');
    const switchText = document.getElementById('switchText');
    const registerInput = document.getElementById('registerMode');
    const errorMessage = document.getElementById('errorMessage');

    let isRegisterMode = false;

    // Если при загрузке страницы есть ошибка от сервера, связанная с регистрацией,
    // можно автоматически переключиться в режим регистрации.
    // Проверяем текст ошибки, если он есть в DOM (рендерится сервером)
    if (errorMessage && errorMessage.textContent.includes('существует')) {
        toggleMode();
    }

    function toggleMode() {
        isRegisterMode = !isRegisterMode;
        
        // Очищаем ошибку при переключении
        if (errorMessage) {
            errorMessage.classList.remove('visible');
            errorMessage.textContent = '';
        }

        if (isRegisterMode) {
            pageTitle.textContent = 'Регистрация';
            submitBtn.textContent = 'Зарегистрироваться';
            switchText.textContent = 'Уже есть аккаунт?';
            toggleLink.textContent = 'Войти';
            registerInput.value = '1'; // Режим регистрации
        } else {
            pageTitle.textContent = 'Вход';
            submitBtn.textContent = 'Войти';
            switchText.textContent = 'Нет аккаунта?';
            toggleLink.textContent = 'Зарегистрироваться';
            registerInput.value = '0'; // Режим входа
        }
    }

    if (toggleLink) {
        toggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            toggleMode();
        });
    }
});