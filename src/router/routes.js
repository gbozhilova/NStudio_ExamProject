const ROUTE_DEFINITIONS = [
  { path: '/', aliases: ['/home'], titleKey: 'nav.home', requiredRoles: null, load: () => import('../pages/home/home.js') },
  { path: '/services', titleKey: 'nav.services', requiredRoles: null, load: () => import('../pages/services/services.js') },
  { path: '/products', titleKey: 'nav.products', requiredRoles: null, load: () => import('../pages/products/products.js') },
  { path: '/calendar', titleKey: 'nav.calendar', requiredRoles: ['staff', 'admin'], load: () => import('../pages/calendar/calendar.js') },
  { path: '/customers', titleKey: 'nav.customers', requiredRoles: ['staff', 'admin'], load: () => import('../pages/customers/customers.js') },
  { path: '/quiz', titleKey: 'nav.quiz', requiredRoles: null, load: () => import('../pages/quiz/quiz.js') },
  { path: '/login', titleKey: 'nav.login', requiredRoles: null, load: () => import('../pages/auth/login.js') },
  { path: '/register', titleKey: 'nav.register', requiredRoles: null, load: () => import('../pages/auth/register.js') }
];

const ROUTE_LOOKUP = new Map();
for (const route of ROUTE_DEFINITIONS) {
  ROUTE_LOOKUP.set(route.path, route);
  for (const alias of route.aliases ?? []) {
    ROUTE_LOOKUP.set(alias, route);
  }
}

export function normalizePath(pathname) {
  if (!pathname || pathname === '/') {
    return '/';
  }
  const cleanPath = pathname.replace(/\/+$/, '');
  return cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
}

export function resolveRoute(pathname) {
  const normalizedPath = normalizePath(pathname);
  return ROUTE_LOOKUP.get(normalizedPath) ?? ROUTE_LOOKUP.get('/');
}

export function isInternalPath(pathname) {
  return ROUTE_LOOKUP.has(normalizePath(pathname));
}

export function getRequiredRoles(pathname) {
  const route = resolveRoute(normalizePath(pathname));
  return route?.requiredRoles ?? null;
}
