const ROUTE_DEFINITIONS = [
  { path: '/', aliases: ['/home'], titleKey: 'nav.home', loader: () => import('../pages/home/home.js') },
  { path: '/services', titleKey: 'nav.services', loader: () => import('../pages/services/services.js') },
  { path: '/products', titleKey: 'nav.products', loader: () => import('../pages/products/products.js') },
  { path: '/calendar', titleKey: 'nav.calendar', loader: () => import('../pages/calendar/calendar.js') },
  { path: '/customers', titleKey: 'nav.customers', loader: () => import('../pages/customers/customers.js') },
  { path: '/quiz', aliases: ['/products/calendar/customers/quiz'], titleKey: 'nav.quiz', loader: () => import('../pages/quiz/quiz.js') }
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
