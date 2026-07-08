import template from './header.html?raw';
import './header.css';
import { normalizePath } from '../../router/routes.js';
import { getLocale } from '../../services/i18n.js';

export function renderHeader() {
  return template;
}

export function bindHeaderInteractions(root, { currentPath, onLocaleChange }) {
  const normalizedCurrentPath = normalizePath(currentPath);

  root.querySelectorAll('[data-route]').forEach((link) => {
    const normalizedLinkPath = normalizePath(link.getAttribute('data-route'));
    link.classList.toggle('active', normalizedLinkPath === normalizedCurrentPath);
    link.setAttribute('aria-current', normalizedLinkPath === normalizedCurrentPath ? 'page' : 'false');
  });

  root.querySelectorAll('[data-locale]').forEach((button) => {
    const locale = button.getAttribute('data-locale');

    button.classList.toggle('active', locale === getLocale());
    button.addEventListener('click', () => onLocaleChange(locale));
  });
}
