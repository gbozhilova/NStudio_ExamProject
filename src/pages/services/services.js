import template from './services.html?raw';
import './services.css';
import { supabase } from '../../services/supabase.js';
import { translateRoot } from '../../services/i18n.js';

const CATEGORY_ICONS = {
  hair: 'bi-scissors',
  nails: 'bi-heart',
  makeup: 'bi-stars',
  skincare: 'bi-droplet',
  massage: 'bi-flower1',
  eyebrows: 'bi-eye',
  waxing: 'bi-sparkles',
  default: 'bi-gem'
};

const CATEGORY_THUMBNAILS = [
  '/assets/HairCut.jpg',
  '/assets/Hair%20Service%20More.jpg',
  '/assets/Festive.jpg'
];

export function render() {
  return template;
}

export function afterRender({ root }) {
  translateRoot(root);

  const stripEl = root.querySelector('#services-strip');
  const listEl = root.querySelector('#services-list');
  const loadingEl = root.querySelector('#services-loading');
  const titleEl = root.querySelector('#services-category-title');
  const copyEl = root.querySelector('#services-category-copy');
  const countEl = root.querySelector('#services-category-count');

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtPrice = (value) => `€${Number(value ?? 0).toFixed(2)}`;

  function categoryIcon(category) {
    const key = String(category ?? '').toLowerCase();
    return CATEGORY_ICONS[key] ?? CATEGORY_ICONS.default;
  }

  function categoryLabel(category) {
    return String(category ?? '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function categoryThumbnail(category, index = 0) {
    const key = String(category ?? '').toLowerCase();
    if (key.includes('hair') || key.includes('color')) return '/assets/HairCut.jpg';
    if (key.includes('makeup')) return '/assets/Hair%20Service%20More.jpg';
    if (key.includes('nail')) return '/assets/Festive.jpg';
    return CATEGORY_THUMBNAILS[index % CATEGORY_THUMBNAILS.length];
  }

  function renderServices(category, services) {
    const filtered = services.filter((service) => service.category === category);
    titleEl.textContent = categoryLabel(category);
    copyEl.textContent = `${filtered.length} service${filtered.length === 1 ? '' : 's'} in this category`;
    countEl.textContent = `${services.length} active services across ${new Set(services.map((s) => s.category)).size} categories`;

    listEl.innerHTML = filtered.map((service, index) => `
      <article class="col-12 col-lg-6 service-card-shell" style="animation-delay:${index * 70}ms">
        <div class="service-card h-100">
          <div class="service-card-thumb-wrap">
            <div class="service-card-thumb-frame">
              <img class="service-card-thumb" src="${categoryThumbnail(service.category, index)}" alt="${esc(service.service_name)}" />
            </div>
            <div class="service-card-badge">
              <i class="bi ${categoryIcon(service.category)}"></i>
            </div>
          </div>
          <div class="service-card-body">
            <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
              <div>
                <div class="service-card-category text-uppercase letter-spaced small">${esc(service.category)}</div>
                <h3 class="h5 mb-1">${esc(service.service_name)}</h3>
              </div>
              <span class="service-price badge rounded-pill">${fmtPrice(service.price)}</span>
            </div>
            ${service.service_description ? `<p class="service-desc mb-4">${esc(service.service_description)}</p>` : ''}
            <div class="d-flex flex-wrap gap-2 align-items-center service-card-meta">
              <span class="badge badge-soft"><i class="bi bi-clock me-1"></i>${service.service_duration_minutes} min</span>
              <a href="/booking" data-nav-link class="btn btn-sm btn-primary ms-auto">Book service</a>
            </div>
          </div>
        </div>
      </article>
    `).join('');

    loadingEl.classList.add('d-none');
    listEl.classList.remove('d-none');
  }

  async function loadServices() {
    const { data, error } = await supabase
      .from('services')
      .select('id, category, service_name, service_description, service_duration_minutes, price, is_active')
      .eq('is_active', true)
      .order('category')
      .order('service_name');

    if (error) {
      loadingEl.innerHTML = `<div class="alert alert-danger mb-0">${esc(error.message)}</div>`;
      return;
    }

    const services = data ?? [];
    if (!services.length) {
      loadingEl.innerHTML = '<div class="alert alert-warning mb-0">No active services found.</div>';
      return;
    }

    const categories = [...new Set(services.map((service) => service.category))];

    stripEl.innerHTML = categories.map((category, index) => `
      <button type="button"
        class="nav-link category-pill ${index === 0 ? 'active' : ''}"
        data-category="${esc(category)}"
        role="tab"
        aria-selected="${index === 0 ? 'true' : 'false'}">
        <span class="category-pill-icon"><i class="bi ${categoryIcon(category)}"></i></span>
        <span class="category-pill-label">${esc(categoryLabel(category))}</span>
        <span class="category-pill-count">${services.filter((service) => service.category === category).length}</span>
      </button>
    `).join('');

    const activateCategory = (category) => {
      stripEl.querySelectorAll('.category-pill').forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.category === category);
      });
      renderServices(category, services);
    };

    stripEl.querySelectorAll('.category-pill').forEach((pill) => {
      pill.addEventListener('click', () => activateCategory(pill.dataset.category));
    });

    activateCategory(categories[0]);
  }

  loadServices();
}
