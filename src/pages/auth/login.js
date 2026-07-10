import template from './login.html?raw';
import './login.css';
import { signIn } from '../../services/auth.js';
import { navigate } from '../../app.js';
import { translateRoot, t } from '../../services/i18n.js';

export function render() {
  return template;
}

export function afterRender({ root }) {
  translateRoot(root);

  const form = root.querySelector('#login-form');
  const emailInput = root.querySelector('#login-email');
  const passwordInput = root.querySelector('#login-password');
  const submitBtn = root.querySelector('#login-submit');
  const btnLabel = submitBtn.querySelector('.btn-label');
  const spinner = submitBtn.querySelector('.spinner-border');
  const errorEl = root.querySelector('#login-error');

  function setLoading(loading) {
    submitBtn.disabled = loading;
    spinner.classList.toggle('d-none', !loading);
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('d-none');
  }

  function hideError() {
    errorEl.classList.add('d-none');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError(t('auth.error.requiredFields'));
      return;
    }

    setLoading(true);
    try {
      await signIn({ email, password });
      navigate('/', { replace: true });
    } catch (err) {
      showError(t('auth.error.invalidCreds'));
    } finally {
      setLoading(false);
    }
  });
}
