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

    // ИСПРАВЛЕНИЕ 1: Читаем реальное состояние из скрытого поля, которое отдал сервер!
    let isRegisterMode = registerModeInput.value === '1';

    // ИСПРАВЛЕНИЕ 2: Добавляем параметр clearFields. По умолчанию false (при загрузке не очищаем!)
    function applyModeUI(clearFields = false) {
        if (clearFields) {
            usernameInput.value = '';
            passwordInput.value = '';
            passwordConfirmInput.value = '';
            const inviteInput = document.querySelector('input[name="invite_code"]');
            if (inviteInput) inviteInput.value = '';
            clearAllErrors();
        }

        const inviteCodeGroup = document.getElementById('inviteCodeGroup');
        if (inviteCodeGroup) {
            inviteCodeGroup.style.display = isRegisterMode ? 'block' : 'none';
        }

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

    // При загрузке страницы НЕ очищаем поля (чтобы сохранить данные и ошибку от сервера)
    applyModeUI(false);

    // А вот при клике на переключатель - очищаем!
    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        applyModeUI(true); // true = очистить поля
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
        const inviteError = document.getElementById('inviteCodeError');
        const inviteInput = document.querySelector('input[name="invite_code"]');
        if (inviteInput && inviteError) clearError(inviteInput, inviteError);
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
        if (passwordInput.value.length === 0) {
            showError(passwordInput, passwordError, 'Введите пароль');
            return false;
        }
        if (isRegisterMode && passwordInput.value.length < 6) {
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

    function validateInviteCode() {
        if (!isRegisterMode) return true;
        const inviteCodeInput = document.querySelector('input[name="invite_code"]');
        const inviteCodeError = document.getElementById('inviteCodeError');

        if (!inviteCodeInput || !inviteCodeError) return true;

        if (inviteCodeInput.value.trim() === '') {
            showError(inviteCodeInput, inviteCodeError, 'Введите код приглашения');
            return false;
        }
        clearError(inviteCodeInput, inviteCodeError);
        return true;
    }

    usernameInput.addEventListener('input', () => {
        if (usernameInput.classList.contains('input-error')) validateUsername();
    });

    passwordInput.addEventListener('input', () => {
        if (passwordInput.classList.contains('input-error')) validatePassword();
        if (passwordConfirmInput.value && passwordConfirmInput.classList.contains('input-error')) validatePasswordConfirm();
    });

    passwordConfirmInput.addEventListener('input', () => {
        if (passwordConfirmInput.classList.contains('input-error')) validatePasswordConfirm();
    });

    // ИСПРАВЛЕНИЕ 3: Объединили два дублирующихся обработчика submit в один чистый
    authForm.addEventListener('submit', (e) => {
        let isValid = true;

        if (!validateUsername()) isValid = false;
        if (!validatePassword()) isValid = false;
        if (isRegisterMode && !validatePasswordConfirm()) isValid = false;
        if (isRegisterMode && !validateInviteCode()) isValid = false;

        if (!isValid) {
            e.preventDefault();
            const firstError = document.querySelector('.input-error');
            if (firstError) {
                firstError.focus();
            }
        }
        // Если валидно, форма отправляется естественно на сервер
    });
});