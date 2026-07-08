import { APP_NAME, DEFAULT_LOCATION } from './config/app.js';
import { renderHeader, bindHeaderInteractions } from './components/header/header.js';
import { renderFooter } from './components/footer/footer.js';
import { getLocale, setLocale, translateRoot, t } from './services/i18n.js';
import { normalizePath, resolveRoute, isInternalPath } from './router/routes.js';

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

  headerSlot.innerHTML = renderHeader(route.path, getLocale());
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

function navigate(pathname, { replace = false } = {}) {
  const path = normalizePath(pathname);
  if (replace) {
    window.history.replaceState({}, '', path);
  } else {
    window.history.pushState({}, '', path);
  }
  renderRoute(path);
}

export function bootApp() {
  setLocale(getLocale());
  document.documentElement.lang = getLocale();

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
