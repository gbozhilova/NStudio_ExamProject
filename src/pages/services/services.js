import template from './services.html?raw';
import './services.css';
import { supabase } from '../../services/supabase.js';
import { getLocale, translateRoot, t } from '../../services/i18n.js';
import { fetchCategories, categoryImageUrl, categoryLabel, categorySlug } from '../../services/catalog.js';

const sameId = (left, right) => String(left ?? '') === String(right ?? '');
const sameCategory = (left, right) => categorySlug(left) === categorySlug(right);

const CATEGORY_TRANSLATIONS = {
  hair: { en: 'Hair', bg: 'Коса' },
  coloring: { en: 'Coloring', bg: 'Боядисване' },
  styling: { en: 'Styling', bg: 'Стайлинг' },
  'hair-care': { en: 'Hair Care', bg: 'Грижа за косата' },
  'color-care': { en: 'Color Care', bg: 'Грижа за цвета' },
  finishing: { en: 'Finishing', bg: 'Финален стил' },
  makeup: { en: 'Makeup', bg: 'Грим' },
  nails: { en: 'Nails', bg: 'Нокти' },
  skin: { en: 'Skin', bg: 'Кожа' },
  skincare: { en: 'Skincare', bg: 'Грижа за кожата' },
  massage: { en: 'Massage', bg: 'Масаж' }
};

const SERVICE_TRANSLATIONS = {
  'Woman Haircut': {
    bg: {
      name: 'Дамска подстрижка',
      description: 'Прецизна подстрижка и оформяне за женствен и свеж завършек.'
    }
  },
  'Man Haircut': {
    bg: {
      name: 'Мъжка подстрижка',
      description: 'Класическа или модерна подстрижка с чист и поддържан резултат.'
    }
  },
  'Child Haircut': {
    bg: {
      name: 'Детска подстрижка',
      description: 'Нежно и спокойно обслужване, съобразено с децата.'
    }
  },
  'Hair Colouring': {
    bg: {
      name: 'Боядисване на коса',
      description: 'Пълно боядисване за наситен, равномерен и блестящ цвят.'
    }
  },
  'Hair Roots Colouring': {
    bg: {
      name: 'Боядисване на корени',
      description: 'Освежаване на корените и плавно сливане с основния цвят.'
    }
  },
  Dryer: {
    bg: {
      name: 'Сешоар и обем',
      description: 'Професионално сушене и оформяне за обем и движение.'
    }
  },
  'Festive Hair': {
    bg: {
      name: 'Официална прическа',
      description: 'Елегантен стил за събития, празници и специални поводи.'
    }
  }
};

function translateCategoryName(name) {
  const locale = getLocale();
  const normalized = String(name ?? '').trim();
  if (!normalized) return '';
  const key = categorySlug(normalized);
  const translation = CATEGORY_TRANSLATIONS[key];
  if (locale === 'bg') {
    return translation?.bg ?? categoryLabel(normalized);
  }
  return translation?.en ?? categoryLabel(normalized);
}

function translateServiceName(name) {
  const locale = getLocale();
  const normalized = String(name ?? '').trim();
  if (!normalized) return '';
  if (locale === 'bg') {
    return SERVICE_TRANSLATIONS[normalized]?.bg?.name ?? normalized;
  }
  return normalized;
}

function translateServiceDescription(name, description) {
  const locale = getLocale();
  const normalized = String(name ?? '').trim();
  if (locale === 'bg') {
    return SERVICE_TRANSLATIONS[normalized]?.bg?.description ?? description ?? '';
  }
  return description ?? '';
}

function categoryCopy(count) {
  return getLocale() === 'bg'
    ? `${count} ${count === 1 ? 'услуга' : 'услуги'} в тази категория`
    : `${count} ${count === 1 ? 'service' : 'services'} in this category`;
}

function countCopy(serviceCount, categoryCount) {
  return getLocale() === 'bg'
    ? `${serviceCount} активни услуги в ${categoryCount} ${categoryCount === 1 ? 'категория' : 'категории'}`
    : `${serviceCount} active services across ${categoryCount} categories`;
}

export function render() {
  return template;
}

export function afterRender({ root }) {
  translateRoot(root);

  const stripEl = root.querySelector('#services-strip');
  const prevBtn = root.querySelector('#services-strip-prev');
  const nextBtn = root.querySelector('#services-strip-next');
  const listEl = root.querySelector('#services-list');
  const loadingEl = root.querySelector('#services-loading');

  prevBtn?.setAttribute('aria-label', t('services.prevCategories'));
  nextBtn?.setAttribute('aria-label', t('services.nextCategories'));
  stripEl?.setAttribute('aria-label', t('services.stripAria'));

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtPrice = (value) => `€${Number(value ?? 0).toFixed(2)}`;
  function renderServices(category, services, categoryCount) {
    const filteredById = services.filter((service) => sameId(service.category_id, category.id));
    const filtered = filteredById.length
      ? filteredById
      : services.filter((service) => sameCategory(service.category, category.name));

    listEl.innerHTML = filtered.map((service, index) => `
      <article class="col-12 col-lg-6 service-card-shell" style="animation-delay:${index * 70}ms">
        <div class="service-card h-100">
          <div class="service-card-thumb-wrap">
            <div class="service-card-thumb-frame">
              <img class="service-card-thumb" src="${categoryImageUrl(category)}" alt="${esc(translateServiceName(service.service_name))}" />
            </div>
            <div class="service-card-badge">
              <i class="bi bi-scissors"></i>
            </div>
          </div>
          <div class="service-card-body">
            <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
              <div>
                <div class="service-card-category text-uppercase letter-spaced small">${esc(translateCategoryName(category.name))}</div>
                <h3 class="h5 mb-1">${esc(translateServiceName(service.service_name))}</h3>
              </div>
              <span class="service-price badge rounded-pill">${fmtPrice(service.price)}</span>
            </div>
            ${translateServiceDescription(service.service_name, service.service_description) ? `<p class="service-desc mb-4">${esc(translateServiceDescription(service.service_name, service.service_description))}</p>` : ''}
            <div class="d-flex flex-wrap gap-2 align-items-center service-card-meta">
              <span class="badge badge-soft"><i class="bi bi-clock me-1"></i>${service.service_duration_minutes} min</span>
              <a href="/booking" data-nav-link class="btn btn-sm btn-primary ms-auto">${esc(t('services.bookService'))}</a>
            </div>
          </div>
        </div>
      </article>
    `).join('');

    loadingEl.classList.add('d-none');
    listEl.classList.remove('d-none');
  }

  async function loadServices() {
    const [{ data: categoryRows, error: categoryError }, { data, error }] = await Promise.all([
      fetchCategories({ activeOnly: true }).then((rows) => ({ data: rows, error: null })).catch((err) => ({ data: null, error: err })),
      supabase
        .from('services')
        .select('id, category_id, category, service_name, service_description, service_duration_minutes, price, is_active')
        .eq('is_active', true)
        .order('category')
        .order('service_name')
    ]);

    if (categoryError) {
      loadingEl.innerHTML = `<div class="alert alert-danger mb-0">${esc(categoryError.message)}</div>`;
      return;
    }
    if (error) {
      loadingEl.innerHTML = `<div class="alert alert-danger mb-0">${esc(error.message)}</div>`;
      return;
    }

    const categories = categoryRows ?? [];
    const services = data ?? [];
    if (!services.length) {
      loadingEl.innerHTML = `<div class="alert alert-warning mb-0">${esc(t('services.noServices'))}</div>`;
      return;
    }

    const serviceCounts = new Map();
    services.forEach((service) => {
      if (!service.category_id) return;
      serviceCounts.set(service.category_id, (serviceCounts.get(service.category_id) ?? 0) + 1);
    });

    stripEl.innerHTML = categories.map((category, index) => `
      <button type="button"
        class="nav-link category-pill ${index === 0 ? 'active' : ''}"
        data-category="${esc(category.id)}"
        role="tab"
        aria-selected="${index === 0 ? 'true' : 'false'}">
        <span class="category-pill-image-frame"><img class="category-pill-image" src="${categoryImageUrl(category)}" alt="${esc(translateCategoryName(category.name))}"></span>
        <span class="category-pill-copy">
          <span class="category-pill-label">${esc(translateCategoryName(category.name))}</span>
        </span>
      </button>
    `).join('');

    const scrollStrip = (direction) => {
      const firstCard = stripEl.querySelector('.category-pill');
      const cardWidth = firstCard?.getBoundingClientRect().width ?? 180;
      stripEl.scrollBy({ left: direction * (cardWidth + 16), behavior: 'smooth' });
    };

    prevBtn?.addEventListener('click', () => scrollStrip(-1));
    nextBtn?.addEventListener('click', () => scrollStrip(1));

    const activateCategory = (category) => {
      if (!category) return;
      stripEl.querySelectorAll('.category-pill').forEach((pill) => {
        const isActive = sameId(pill.dataset.category, category.id);
        pill.classList.toggle('active', isActive);
        pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      renderServices(category, services, categories.length);
    };

    stripEl.querySelectorAll('.category-pill').forEach((pill) => {
      pill.addEventListener('click', () => activateCategory(categories.find((category) => sameId(category.id, pill.dataset.category))));
    });

    activateCategory(categories[0]);
  }

  loadServices();
}
