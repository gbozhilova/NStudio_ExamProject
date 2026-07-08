import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../config/app.js';

const STORAGE_KEY = 'nstudio-locale';

const translations = {
  en: {
    'brand.name': 'NStudio Salon',
    'brand.tagline': 'Beauty platform scaffold',
    'nav.home': 'Home',
    'nav.services': 'Services',
    'nav.products': 'Products',
    'nav.calendar': 'Calendar',
    'nav.customers': 'Customers',
    'nav.quiz': 'Quiz',
    'home.eyebrow': 'Phase 1 scaffold',
    'home.heading': 'Hello world!',
    'home.copy': 'The multipage Vite scaffold is ready for future salon features.',
    'home.cta': 'Use the navigation to explore the route shells.',
    'services.heading': 'Services',
    'services.copy': 'Route shell for service catalog browsing and later booking flows.',
    'products.heading': 'Products',
    'products.copy': 'Route shell for product catalogue and storage-backed media.',
    'calendar.heading': 'Calendar',
    'calendar.copy': 'Route shell for staff schedules, blocks, and appointments.',
    'customers.heading': 'Customers',
    'customers.copy': 'Route shell for customer profiles and preferences.',
    'quiz.heading': 'Quiz',
    'quiz.copy': 'Route shell for the future QR-driven product discovery flow.',
    'footer.copy': 'Vite + Bootstrap scaffold prepared for Supabase integration.',
    'footer.locale': 'Bulgarian and English ready',
    'footer.location': 'Single salon location, multi-location ready'
  },
  bg: {
    'brand.name': 'NStudio Салон',
    'brand.tagline': 'Структура за beauty платформа',
    'nav.home': 'Начало',
    'nav.services': 'Услуги',
    'nav.products': 'Продукти',
    'nav.calendar': 'Календар',
    'nav.customers': 'Клиенти',
    'nav.quiz': 'Куиз',
    'home.eyebrow': 'Фаза 1 scaffold',
    'home.heading': 'Hello world!',
    'home.copy': 'Мултистраничната Vite структура е готова за бъдещи салонни функции.',
    'home.cta': 'Използвайте навигацията, за да разгледате страниците.',
    'services.heading': 'Услуги',
    'services.copy': 'Структура за каталог на услуги и бъдещ booking flow.',
    'products.heading': 'Продукти',
    'products.copy': 'Структура за продуктов каталог и медии в Supabase Storage.',
    'calendar.heading': 'Календар',
    'calendar.copy': 'Структура за графици на екипа, блокирани часове и записвания.',
    'customers.heading': 'Клиенти',
    'customers.copy': 'Структура за клиентски профили и предпочитания.',
    'quiz.heading': 'Куиз',
    'quiz.copy': 'Структура за бъдещия QR-базиран flow за препоръки.',
    'footer.copy': 'Vite + Bootstrap scaffold, подготвен за Supabase интеграция.',
    'footer.locale': 'Подготвено за български и английски',
    'footer.location': 'Една локация с готовност за повече'
  }
};

let currentLocale = normalizeLocale(localStorage.getItem(STORAGE_KEY) ?? DEFAULT_LOCALE);

function normalizeLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  currentLocale = normalizeLocale(locale);
  localStorage.setItem(STORAGE_KEY, currentLocale);
  document.documentElement.lang = currentLocale;
  return currentLocale;
}

export function t(key) {
  return translations[currentLocale]?.[key] ?? translations.en[key] ?? key;
}

export function translateRoot(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
}
