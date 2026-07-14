import template from './header.html?raw';
import './header.css';
import { normalizePath } from '../../router/routes.js';
import { getLocale } from '../../services/i18n.js';
import { signOut } from '../../services/auth.js';

export function renderHeader(currentPath, locale, user, roles = []) {
  const isAdmin = roles.includes('admin');
  const isStaff = isAdmin || roles.includes('staff');
  const staffBtns = user && isStaff
    ? `<a href="/calendar" data-nav-link data-route="/calendar" class="btn btn-sm btn-outline-light">📅 Calendar</a>` : '';
  const adminBtn = user && isAdmin
    ? `<a href="/admin" data-nav-link data-route="/admin" class="nav-pill btn btn-sm btn-outline-light fw-semibold">⚙️ Admin</a>` : '';
  const authSlot = user
    ? `<span class="text-white-50 small d-none d-md-inline">${escapeHtml(user.email)}</span>
       <a href="/profile" data-nav-link data-route="/profile" class="btn btn-sm btn-outline-light">My Bookings</a>
       ${staffBtns}${adminBtn}
       <button id="header-logout" class="btn btn-sm btn-outline-danger">Logout</button>`
    : `<a href="/login" data-nav-link data-route="/login" class="nav-pill btn btn-sm btn-outline-light">Login</a>
       <a href="/register" data-nav-link data-route="/register" class="nav-pill btn btn-sm btn-outline-light">Register</a>`;

  return template.replace('{{AUTH_SLOT}}', authSlot);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  const logoutBtn = root.querySelector('#header-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut();
      } catch {
        // session already gone — navigate regardless
      }
      // onAuthStateChange in app.js handles clearSession + re-render
    });
  }
}
