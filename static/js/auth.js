document.addEventListener('DOMContentLoaded', () => {
    const toggleLink = document.getElementById('toggleLink');
    const pageTitle = document.getElementById('pageTitle');
    const submitBtn = document.getElementById('submitBtn');
    const switchText = document.getElementById('switchText');
    const registerModeInput = document.getElementById('registerMode');
    const authForm = document.querySelector('form[data-testid="auth-form"]');

    const passwordConfirmGroup = document.getElementById('passwordConfirmGroup');
    const usernameInput = document.querySelector('input[name="username"]');
    const passwordInput = document.querySelector('input[name="password"]');
    const passwordConfirmInput = document.querySelector('input[name="password_confirm"]');

    const usernameError = document.getElementById('usernameError');
    const passwordError = document.getElementById('passwordError');
    const passwordConfirmError = document.getElementById('passwordConfirmError');

    let isRegisterMode = false;

    function applyModeUI() {
        // Очищаем поля при переключении
        usernameInput.value = '';
        passwordInput.value = '';
        passwordConfirmInput.value = '';
        clearAllErrors();

        if (isRegisterMode) {
            pageTitle.textContent = 'Регистрация';
            submitBtn.textContent = 'Зарегистрироваться';
            switchText.textContent = 'Уже есть аккаунт?';
            toggleLink.textContent = 'Войти';
            registerModeInput.value = '1';

            passwordConfirmGroup.style.display = 'block';
            passwordInput.setAttribute('autocomplete', 'new-password');
        } else {
            pageTitle.textContent = 'Вход';
            submitBtn.textContent = 'Войти';
            switchText.textContent = 'Нет аккаунта?';
            toggleLink.textContent = 'Зарегистрироваться';
            registerModeInput.value = '0';

            passwordConfirmGroup.style.display = 'none';
            passwordInput.setAttribute('autocomplete', 'current-password');
        }
    }

    applyModeUI();

    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        applyModeUI();
    });

    function showError(inputElement, errorElement, message) {
        inputElement.classList.add('input-error');
        errorElement.textContent = message;
        errorElement.classList.add('visible');
    }

    function clearError(inputElement, errorElement) {
        inputElement.classList.remove('input-error');
        errorElement.textContent = '';
        errorElement.classList.remove('visible');
    }

    function clearAllErrors() {
        clearError(usernameInput, usernameError);
        clearError(passwordInput, passwordError);
        clearError(passwordConfirmInput, passwordConfirmError);
    }

    function validateUsername() {
        if (usernameInput.value.trim() === '') {
            showError(usernameInput, usernameError, 'Введите имя пользователя');
            return false;
        }
        clearError(usernameInput, usernameError);
        return true;
    }

    function validatePassword() {
        if (!isRegisterMode) return true;

        if (passwordInput.value.length === 0) {
            showError(passwordInput, passwordError, 'Введите пароль');
            return false;
        }

        if (passwordInput.value.length < 6) {
            showError(passwordInput, passwordError, 'Пароль должен содержать минимум 6 символов');
            return false;
        }

        clearError(passwordInput, passwordError);
        return true;
    }

    function validatePasswordConfirm() {
        if (!isRegisterMode) return true;

        if (passwordConfirmInput.value.length === 0) {
            showError(passwordConfirmInput, passwordConfirmError, 'Подтвердите пароль');
            return false;
        }

        if (passwordInput.value !== passwordConfirmInput.value) {
            showError(passwordConfirmInput, passwordConfirmError, 'Пароли не совпадают');
            return false;
        }

        clearError(passwordConfirmInput, passwordConfirmError);
        return true;
    }

    usernameInput.addEventListener('input', () => {
        if (usernameInput.classList.contains('input-error')) {
            validateUsername();
        }
    });

    passwordInput.addEventListener('input', () => {
        if (passwordInput.classList.contains('input-error')) {
            validatePassword();
        }
        if (passwordConfirmInput.value && passwordConfirmInput.classList.contains('input-error')) {
            validatePasswordConfirm();
        }
    });

    passwordConfirmInput.addEventListener('input', () => {
        if (passwordConfirmInput.classList.contains('input-error')) {
            validatePasswordConfirm();
        }
    });

    authForm.addEventListener('submit', (e) => {
        let isValid = true;

        if (!validateUsername()) {
            isValid = false;
        }

        if (!validatePassword()) {
            isValid = false;
        }

        if (isRegisterMode && !validatePasswordConfirm()) {
            isValid = false;
        }

        if (!isValid) {
            e.preventDefault();
            const firstError = document.querySelector('.input-error');
            if (firstError) {
                firstError.focus();
            }
        }
        // Если валидно, форма отправляется естественно
    });
});