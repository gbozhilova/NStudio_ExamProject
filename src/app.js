import { APP_NAME, DEFAULT_LOCATION } from './config/app.js';
import { renderHeader, bindHeaderInteractions } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { getLocale, setLocale, translateRoot, t } from './services/i18n.js';
import { normalizePath, resolveRoute, isInternalPath, getRequiredRoles } from './router/routes.js';
import { getSession, getUserRoles, onAuthStateChange } from './services/auth.js';
import { setSession, clearSession, isAuthenticated, hasAnyRole, getUser } from './services/session.js';

const APP_ROOT_SELECTOR = '#app';

function getAppRoot() {
  const root = document.querySelector(APP_ROOT_SELECTOR);
  if (!root) {
    throw new Error('Application root element was not found.');
  }
  return root;
}

async function renderRoute(pathname = window.location.pathname) {
  const normalizedPath = normalizePath(pathname);
  const route = resolveRoute(normalizedPath);

  // Route guard
  const required = getRequiredRoles(normalizedPath);
  if (required && !isAuthenticated()) {
    return navigate('/login', { replace: true });
  }
  if (required && !hasAnyRole(required)) {
    const root = getAppRoot();
    root.innerHTML = `
      <div class="app-shell">
        <div id="site-header"></div>
        <main id="site-content" class="container site-content py-4 py-lg-5">
          <div class="alert alert-warning mt-4" role="alert" data-i18n="error.forbidden">${t('error.forbidden')}</div>
        </main>
        <div id="site-footer"></div>
      </div>
    `;
    root.querySelector('#site-header').innerHTML = renderHeader(route.path, getLocale(), getUser());
    root.querySelector('#site-footer').innerHTML = renderFooter();
    bindHeaderInteractions(root.querySelector('#site-header'), {
      currentPath: route.path,
      onLocaleChange: async (locale) => { setLocale(locale); await renderRoute(route.path); }
    });
    return;
  }

  const root = getAppRoot();
  const pageModule = await route.load();

  root.innerHTML = `
    <div class="app-shell">
      <div id="site-header"></div>
      <main id="site-content" class="container site-content py-4 py-lg-5"></main>
      <div id="site-footer"></div>
    </div>
  `;

  const headerSlot = root.querySelector('#site-header');
  const contentSlot = root.querySelector('#site-content');
  const footerSlot = root.querySelector('#site-footer');

  headerSlot.innerHTML = renderHeader(route.path, getLocale(), getUser());
  contentSlot.innerHTML = pageModule.render({ locale: getLocale(), location: DEFAULT_LOCATION });
  footerSlot.innerHTML = renderFooter();

  translateRoot(root);
  document.title = `${t(route.titleKey)} · ${APP_NAME}`;

  bindHeaderInteractions(headerSlot, {
    currentPath: route.path,
    onLocaleChange: async (locale) => {
      setLocale(locale);
      await renderRoute(route.path);
    }
  });

  if (typeof pageModule.afterRender === 'function') {
    pageModule.afterRender({ root: contentSlot, locale: getLocale(), location: DEFAULT_LOCATION });
  }
}

export function navigate(pathname, { replace = false } = {}) {
  const path = normalizePath(pathname);
  if (replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
  renderRoute(path);
}

export async function bootApp() {
  setLocale(getLocale());
  document.documentElement.lang = getLocale();

  // Hydrate session from existing Supabase session
  try {
    const { session } = await getSession();
    if (session) {
      const roles = await getUserRoles(session.user.id);
      setSession(session, roles);
    }
  } catch {
    // No active session — continue as guest
  }

  // Keep session state in sync with Supabase auth events
  onAuthStateChange(async (event, session) => {
    // INITIAL_SESSION is handled by the explicit getSession() call above
    if (event === 'INITIAL_SESSION') return;
    if (session) {
      const roles = await getUserRoles(session.user.id);
      setSession(session, roles);
    } else {
      clearSession();
    }
    await renderRoute(window.location.pathname);
  });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-nav-link]');
    if (!link) {
      return;
    }
    const targetPath = new URL(link.href, window.location.origin).pathname;
    if (!isInternalPath(targetPath)) {
      return;
    }
    event.preventDefault();
    navigate(targetPath);
  });

  window.addEventListener('popstate', () => {
    renderRoute(window.location.pathname);
  });

  renderRoute(window.location.pathname);
}
