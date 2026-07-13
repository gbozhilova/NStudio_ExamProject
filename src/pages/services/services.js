import template from './services.html?raw';
import './services.css';
import { supabase } from '../../services/supabase.js';
import { translateRoot } from '../../services/i18n.js';
import { fetchCategories, categoryImageUrl, categoryLabel } from '../../services/catalog.js';

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
  function renderServices(category, services, categoryCount) {
    const filtered = services.filter((service) => service.category_id === category.id);
    titleEl.textContent = categoryLabel(category.name);
    copyEl.textContent = `${filtered.length} service${filtered.length === 1 ? '' : 's'} in this category`;
    countEl.textContent = `${services.length} active services across ${categoryCount} categories`;

    listEl.innerHTML = filtered.map((service, index) => `
      <article class="col-12 col-lg-6 service-card-shell" style="animation-delay:${index * 70}ms">
        <div class="service-card h-100">
          <div class="service-card-thumb-wrap">
            <div class="service-card-thumb-frame">
              <img class="service-card-thumb" src="${categoryImageUrl(category)}" alt="${esc(service.service_name)}" />
            </div>
            <div class="service-card-badge">
              <i class="bi bi-scissors"></i>
            </div>
          </div>
          <div class="service-card-body">
            <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
              <div>
                <div class="service-card-category text-uppercase letter-spaced small">${esc(categoryLabel(category.name))}</div>
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
      loadingEl.innerHTML = '<div class="alert alert-warning mb-0">No active services found.</div>';
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
        <span class="category-pill-icon-wrap"><img class="category-pill-image" src="${categoryImageUrl(category)}" alt="${esc(category.name)}"></span>
        <span class="category-pill-copy">
          <span class="category-pill-label">${esc(categoryLabel(category.name))}</span>
          <span class="category-pill-count">${serviceCounts.get(category.id) ?? 0}</span>
        </span>
      </button>
    `).join('');

    const activateCategory = (category) => {
      stripEl.querySelectorAll('.category-pill').forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.category === category.id);
      });
      renderServices(category, services, categories.length);
    };

    stripEl.querySelectorAll('.category-pill').forEach((pill) => {
      pill.addEventListener('click', () => activateCategory(categories.find((category) => category.id === pill.dataset.category)));
    });

    activateCategory(categories[0]);
  }

  loadServices();
}
