import template from './register.html?raw';
import './register.css';
import { signUp } from '../../services/auth.js';
import { navigate } from '../../app.js';
import { translateRoot, t } from '../../services/i18n.js';

export function render() {
  return template;
}

export function afterRender({ root }) {
  translateRoot(root);

  const form = root.querySelector('#register-form');
  const nameInput = root.querySelector('#register-name');
  const emailInput = root.querySelector('#register-email');
  const passwordInput = root.querySelector('#register-password');
  const confirmInput = root.querySelector('#register-confirm');
  const submitBtn = root.querySelector('#register-submit');
  const spinner = submitBtn.querySelector('.spinner-border');
  const errorEl = root.querySelector('#register-error');
  const successEl = root.querySelector('#register-success');

  function setLoading(loading) {
    submitBtn.disabled = loading;
    spinner.classList.toggle('d-none', !loading);
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('d-none');
    successEl.classList.add('d-none');
  }

  function hideError() {
    errorEl.classList.add('d-none');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const fullName = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (!fullName || !email || !password) {
      showError(t('auth.error.requiredFields'));
      return;
    }

    if (password.length < 8) {
      showError(t('auth.error.passwordTooShort'));
      return;
    }

    if (password !== confirm) {
      showError(t('auth.error.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await signUp({ email, password, fullName });
      form.classList.add('d-none');
      successEl.classList.remove('d-none');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (err) {
      showError(err.message ?? t('auth.error.generic'));
    } finally {
      setLoading(false);
    }
  });
}
