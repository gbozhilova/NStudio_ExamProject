import template from './products.html?raw';
import './products.css';
import { supabase } from '../../services/supabase.js';
import { getLocale, translateRoot, t } from '../../services/i18n.js';
import { fetchCategories, categoryImageUrl, categoryLabel, categorySlug } from '../../services/catalog.js';
import { getUser, isAuthenticated } from '../../services/session.js';
import { navigate } from '../../app.js';
import { uploadFile, getPublicUrl, BUCKETS, productReviewImagePath } from '../../services/storage.js';

const CATEGORY_TRANSLATIONS = {
  hair: { en: 'Hair Care', bg: 'Грижа за косата' },
  styling: { en: 'Styling', bg: 'Стайлинг' },
  'color-care': { en: 'Color Care', bg: 'Грижа за цвета' },
  'scalp-care': { en: 'Scalp Care', bg: 'Грижа за скалпа' },
  tools: { en: 'Tools', bg: 'Инструменти' },
  finishing: { en: 'Finishing', bg: 'Финален стил' }
};

const PRODUCT_TRANSLATIONS = {
  'Hydrating Shampoo': {
    bg: { name: 'Хидратиращ шампоан' }
  },
  'Repair Conditioner': {
    bg: { name: 'Възстановяващ балсам' }
  },
  'Color Protect Mask': {
    bg: { name: 'Маска за защита на цвета' }
  },
  'Heat Protection Spray': {
    bg: { name: 'Термозащитен спрей' }
  },
  'Volume Mousse': {
    bg: { name: 'Мус за обем' }
  },
  'Shine Serum': {
    bg: { name: 'Серум за блясък' }
  },
  'Purple Toning Shampoo': {
    bg: { name: 'Лилав шампоан за тониране' }
  },
  'Soothing Scalp Lotion': {
    bg: { name: 'Успокояващ лосион за скалпа' }
  },
  'Ceramic Round Brush': {
    bg: { name: 'Кръгла керамична четка' }
  },
  'Strong Hold Hairspray': {
    bg: { name: 'Лак със силна фиксация' }
  }
};

function translateCategoryName(name) {
  const locale = getLocale();
  const normalized = String(name ?? '').trim();
  if (!normalized) return '';
  const key = categorySlug(normalized);
  const translation = CATEGORY_TRANSLATIONS[key];
  if (locale === 'bg') return translation?.bg ?? categoryLabel(normalized);
  return translation?.en ?? categoryLabel(normalized);
}

function translateProductName(name) {
  const locale = getLocale();
  const normalized = String(name ?? '').trim();
  if (!normalized) return '';
  if (locale === 'bg') return PRODUCT_TRANSLATIONS[normalized]?.bg?.name ?? normalized;
  return normalized;
}

function categoryCopy(count) {
  return getLocale() === 'bg'
    ? `${count} ${count === 1 ? 'продукт' : 'продукта'} в тази категория`
    : `${count} ${count === 1 ? 'product' : 'products'} in this category`;
}

function formatReviewDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function starMarkup(rating, interactive = false, activeRating = rating) {
  const starLabel = getLocale() === 'bg' ? 'звезда' : 'star';
  const starsLabel = getLocale() === 'bg' ? 'звезди' : 'stars';
  return Array.from({ length: 5 }, (_, index) => {
    const value = index + 1;
    const active = value <= activeRating;
    const classes = interactive
      ? `review-star-btn ${active ? 'active' : ''}`
      : 'review-star-display';
    const icon = active ? 'bi-star-fill' : 'bi-star';
    const buttonAttrs = interactive
      ? `type="button" data-rating="${value}" aria-label="${value} ${value === 1 ? starLabel : starsLabel}"`
      : '';
    return `<button ${buttonAttrs} class="${classes}"><i class="bi ${icon}"></i></button>`;
  }).join('');
}

export function render() {
  return template;
}

export function afterRender({ root }) {
  translateRoot(root);

  const stripEl = root.querySelector('#products-strip');
  const prevBtn = root.querySelector('#products-strip-prev');
  const nextBtn = root.querySelector('#products-strip-next');
  const listEl = root.querySelector('#products-list');
  const loadingEl = root.querySelector('#products-loading');
  const reviewSectionEl = root.querySelector('.products-reviews-section');
  const reviewTitleEl = root.querySelector('#products-review-title');
  const reviewCopyEl = root.querySelector('#products-review-copy');
  const reviewSummaryStarsEl = root.querySelector('#products-review-stars-summary');
  const reviewSummaryEl = root.querySelector('.products-review-summary');
  const reviewAverageEl = root.querySelector('#products-review-average');
  const reviewCountEl = root.querySelector('#products-review-count');
  const reviewListEl = root.querySelector('#product-reviews-list');
  const reviewFormEl = root.querySelector('#product-review-form');
  const reviewGateEl = root.querySelector('#product-review-gate');
  const reviewReadonlyNoteEl = root.querySelector('#product-review-readonly-note');
  const reviewStarsEl = root.querySelector('#product-review-stars');
  const reviewTextEl = root.querySelector('#product-review-text');
  const reviewImagesEl = root.querySelector('#product-review-images');
  const reviewSubmitEl = root.querySelector('#product-review-submit');

  let selectedProduct = null;
  let currentRating = 5;
  let reviewerName = '';
  let products = [];
  let selectedCategory = null;
  let reviewsEnabled = true;

  prevBtn?.setAttribute('aria-label', t('products.prevCategories'));
  nextBtn?.setAttribute('aria-label', t('products.nextCategories'));
  stripEl?.setAttribute('aria-label', t('products.stripAria'));

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const sameId = (left, right) => String(left ?? '') === String(right ?? '');
  const sameCategory = (left, right) => categorySlug(left) === categorySlug(right);

  function reviewsUnavailableText() {
    return getLocale() === 'bg'
      ? 'Отзивите са временно недостъпни.'
      : 'Reviews are temporarily unavailable.';
  }

  function isMissingTableError(error, tableName) {
    const msg = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
    const table = `public.${tableName}`.toLowerCase();
    return msg.includes(table)
      && (msg.includes('schema cache')
        || msg.includes('could not find the table')
        || msg.includes('does not exist'));
  }

  function disableReviews(message = reviewsUnavailableText()) {
    reviewsEnabled = false;
    if (reviewTitleEl) reviewTitleEl.textContent = t('products.reviews.title');
    if (reviewCopyEl) reviewCopyEl.textContent = message;
    if (reviewAverageEl) reviewAverageEl.textContent = '—';
    if (reviewCountEl) reviewCountEl.textContent = t('products.reviews.count');
    if (reviewListEl) {
      reviewListEl.innerHTML = `<div class="alert alert-warning mb-0">${esc(message)}</div>`;
    }
    if (reviewFormEl) {
      reviewFormEl.querySelectorAll('input, textarea, button').forEach((input) => {
        input.disabled = true;
      });
    }
  }

  function setReviewSectionVisible(visible) {
    reviewSectionEl?.classList.toggle('d-none', !visible);
  }

  function renderReviewStars() {
    if (!reviewStarsEl) return;
    reviewStarsEl.innerHTML = starMarkup(currentRating, true, currentRating);
    reviewStarsEl.querySelectorAll('.review-star-btn').forEach((button) => {
      button.addEventListener('click', () => {
        currentRating = Number(button.dataset.rating);
        renderReviewStars();
      });
    });
  }

  function renderReviewSummary(reviews) {
    const total = reviews.length;
    const average = total
      ? reviews.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / total
      : 0;
    reviewSummaryEl?.classList.toggle('d-none', total === 0);
    reviewSummaryStarsEl?.classList.toggle('d-none', total === 0);
    if (reviewAverageEl) reviewAverageEl.textContent = total ? `${average.toFixed(1)} / 5` : '—';
    if (reviewSummaryStarsEl) {
      const rounded = Math.round(average);
      reviewSummaryStarsEl.innerHTML = starMarkup(rounded, false, rounded);
    }
    if (reviewCountEl) {
      reviewCountEl.textContent = total
        ? `${total} ${getLocale() === 'bg' ? (total === 1 ? 'отзив' : 'отзива') : (total === 1 ? 'review' : 'reviews')}`
        : `0 ${getLocale() === 'bg' ? 'отзива' : 'reviews'}`;
    }
  }

  function renderReviews(reviews) {
    renderReviewSummary(reviews);
    if (!reviewListEl) return;

    if (!reviews.length) {
      reviewListEl.innerHTML = `<div class="text-light-muted small">${esc(t('products.reviews.empty'))}</div>`;
      return;
    }

    reviewListEl.innerHTML = reviews.map((review) => {
      const images = (review.product_review_images ?? []).slice().sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
      const imageMarkup = images.length
        ? `<div class="review-images-grid mt-3">${images.map((image) => {
            const publicUrl = getPublicUrl(BUCKETS.PRODUCT_REVIEW_IMAGES, image.image_path);
            return `<a href="${esc(publicUrl)}" target="_blank" rel="noreferrer"><img src="${esc(publicUrl)}" alt="${esc(image.original_name ?? 'Review image')}" class="review-image-thumb" /></a>`;
          }).join('')}</div>`
        : '';

      return `
        <article class="review-card">
          <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap mb-2">
            <div>
              <div class="fw-semibold">${esc(review.reviewer_name ?? 'Guest')}</div>
              <div class="small text-light-muted">${formatReviewDate(review.created_at)}</div>
            </div>
            <div class="review-rating-inline" aria-label="${review.rating} out of 5 stars">
              ${starMarkup(review.rating, false, review.rating)}
            </div>
          </div>
          ${review.review_text ? `<p class="review-text mb-0">${esc(review.review_text)}</p>` : ''}
          ${imageMarkup}
        </article>
      `;
    }).join('');
  }

  function setReviewGate(enabled) {
    if (!reviewGateEl || !reviewFormEl) return;
    if (enabled) {
      reviewReadonlyNoteEl?.classList.add('d-none');
      reviewReadonlyNoteEl && (reviewReadonlyNoteEl.innerHTML = '');
      reviewFormEl.classList.remove('d-none');
      reviewGateEl.classList.add('d-none');
      reviewGateEl.innerHTML = '';
      reviewFormEl.querySelectorAll('input, textarea, button').forEach((input) => {
        input.disabled = false;
      });
      return;
    }

    if (reviewReadonlyNoteEl) {
      reviewReadonlyNoteEl.classList.remove('d-none');
      reviewReadonlyNoteEl.innerHTML = `${esc(t('products.reviews.loginPrompt'))} <a href="/login" data-nav-link>${esc(t('products.reviews.signIn'))}</a>`;
    }
    reviewFormEl.classList.add('d-none');
    reviewGateEl.classList.remove('d-none');
    reviewGateEl.innerHTML = `${esc(t('products.reviews.loginPrompt'))} <a href="/login" data-nav-link>${esc(t('products.reviews.signIn'))}</a>`;
    reviewFormEl.querySelectorAll('input, textarea, button').forEach((input) => {
      input.disabled = true;
    });
  }

  async function loadReviewerDisplayName() {
    if (!isAuthenticated()) return '';
    const user = getUser();
    if (!user) return '';
    try {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      return data?.full_name?.trim() || user.email?.split('@')[0] || 'Guest';
    } catch {
      return user.email?.split('@')[0] || 'Guest';
    }
  }

  async function loadReviews(product) {
    if (!reviewTitleEl || !reviewCopyEl) return;
    if (!reviewsEnabled) {
      disableReviews();
      return;
    }
    selectedProduct = product;
    reviewTitleEl.textContent = translateProductName(product.product_name);
    reviewCopyEl.textContent = `${translateCategoryName(product.category)} · ${product.brand}`;
    currentRating = 5;
    renderReviewStars();

    if (selectedCategory) {
      const selectedCards = root.querySelectorAll('.product-card');
      selectedCards.forEach((card) => {
        card.classList.toggle('active', card.dataset.productId === product.id);
      });
    }

    let { data, error } = await supabase
      .from('product_reviews')
      .select('id, product_id, user_id, reviewer_name, rating, review_text, created_at, product_review_images(id, image_path, original_name, sort_order)')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false });

    if (error && isMissingTableError(error, 'product_review_images')) {
      const fallback = await supabase
        .from('product_reviews')
        .select('id, product_id, user_id, reviewer_name, rating, review_text, created_at')
        .eq('product_id', product.id)
        .order('created_at', { ascending: false });
      data = (fallback.data ?? []).map((review) => ({ ...review, product_review_images: [] }));
      error = fallback.error;
    }

    if (error) {
      if (isMissingTableError(error, 'product_reviews')) {
        disableReviews();
        return;
      }
      reviewListEl.innerHTML = `<div class="alert alert-danger mb-0">${esc(error.message)}</div>`;
      reviewAverageEl.textContent = '—';
      reviewCountEl.textContent = t('products.reviews.count');
      return;
    }

    renderReviews(data ?? []);
  }

  function renderProducts(category, categoryProducts) {
    const filteredById = categoryProducts.filter((product) => sameId(product.category_id, category.id));
    const filtered = filteredById.length
      ? filteredById
      : categoryProducts.filter((product) => sameCategory(product.category, category.name));
    selectedCategory = category;

    if (!filtered.length) {
      loadingEl.classList.add('d-none');
      listEl.classList.remove('d-none');
      listEl.innerHTML = `<div class="col-12"><div class="alert alert-warning mb-0">${esc(t('products.noProducts'))}</div></div>`;
      setReviewSectionVisible(false);
      return;
    }

    setReviewSectionVisible(true);

    listEl.innerHTML = filtered.map((product, index) => `
      <article class="col-12 col-lg-6 product-card-shell" style="animation-delay:${index * 70}ms">
        <div class="product-card h-100 ${selectedProduct?.id === product.id ? 'active' : ''}" data-product-id="${esc(product.id)}">
          <div class="product-card-thumb-wrap">
            <div class="product-card-thumb-frame">
              <img class="product-card-thumb" src="${categoryImageUrl(category)}" alt="${esc(translateProductName(product.product_name))}" />
            </div>
            <div class="product-card-badge">
              <i class="bi bi-bag-heart"></i>
            </div>
          </div>
          <div class="product-card-body">
            <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
              <div>
                <div class="product-card-category text-uppercase letter-spaced small">${esc(translateCategoryName(category.name))}</div>
                <h3 class="h5 mb-1">${esc(translateProductName(product.product_name))}</h3>
              </div>
              <span class="product-stock badge rounded-pill">${product.stock_quantity} ${getLocale() === 'bg' ? 'бр.' : 'pcs'}</span>
            </div>
            <p class="product-brand mb-4">${esc(product.brand)}</p>
            <div class="d-flex flex-wrap gap-2 align-items-center product-card-meta">
              <span class="badge badge-soft"><i class="bi bi-box-seam me-1"></i>${getLocale() === 'bg' ? 'Наличност' : 'In stock'}: ${product.stock_quantity}</span>
              <button type="button" class="btn btn-sm btn-primary ms-auto product-review-select" data-product-id="${esc(product.id)}" ${reviewsEnabled ? '' : 'disabled'}>${esc(t('products.reviews.label'))}</button>
            </div>
          </div>
        </div>
      </article>
    `).join('');

    listEl.querySelectorAll('.product-review-select').forEach((button) => {
      button.addEventListener('click', async () => {
        const product = categoryProducts.find((item) => sameId(item.id, button.dataset.productId));
        if (product) {
          await loadReviews(product);
          root.querySelector('.products-reviews-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    loadingEl.classList.add('d-none');
    listEl.classList.remove('d-none');

    if (filtered[0] && !selectedProduct) {
      if (reviewsEnabled) loadReviews(filtered[0]);
    } else if (selectedProduct) {
      const selected = filtered.find((product) => sameId(product.id, selectedProduct.id)) ?? filtered[0];
      if (selected && reviewsEnabled) loadReviews(selected);
    }
  }

  async function loadProducts() {
    const [{ data: categoryRows, error: categoryError }, { data, error }] = await Promise.all([
      fetchCategories({ activeOnly: true }).then((rows) => ({ data: rows, error: null })).catch((err) => ({ data: null, error: err })),
      supabase
        .from('products')
        .select('id, category_id, category, product_name, brand, stock_quantity, is_active')
        .eq('is_active', true)
        .order('category')
        .order('product_name')
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
    products = data ?? [];
    if (!products.length) {
      loadingEl.innerHTML = `<div class="alert alert-warning mb-0">${esc(t('products.noProducts'))}</div>`;
      setReviewSectionVisible(false);
      return;
    }

    reviewerName = await loadReviewerDisplayName();
    setReviewGate(isAuthenticated());
    reviewTitleEl.textContent = t('products.reviews.title');
    reviewCopyEl.textContent = t('products.reviews.selectProduct');
    renderReviewStars();
    setReviewSectionVisible(true);

    const { error: reviewTableError } = await supabase
      .from('product_reviews')
      .select('id')
      .limit(1);
    if (reviewTableError && isMissingTableError(reviewTableError, 'product_reviews')) {
      disableReviews();
    }

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
      renderProducts(category, products);
    };

    stripEl.querySelectorAll('.category-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const category = categories.find((item) => sameId(item.id, pill.dataset.category));
        activateCategory(category);
      });
    });

    if (titleEl) titleEl.textContent = translateCategoryName(categories[0]?.name);
    activateCategory(categories[0]);
  }

  loadProducts();

  reviewFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!reviewsEnabled) return;
    if (!selectedProduct) return;
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }

    const submitBtn = reviewSubmitEl;
    const reviewText = reviewTextEl?.value.trim() ?? '';
    const imageFiles = Array.from(reviewImagesEl?.files ?? []).filter((file) => file.type.startsWith('image/'));
    const user = getUser();
    if (!user) return;
    if (!reviewText && !imageFiles.length) {
      alert(t('auth.error.requiredFields'));
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    try {
      const { data: reviewRow, error: reviewError } = await supabase
        .from('product_reviews')
        .insert({
          product_id: selectedProduct.id,
          user_id: user.id,
          reviewer_name: reviewerName || user.email?.split('@')[0] || 'Guest',
          rating: currentRating,
          review_text: reviewText || null
        })
        .select('id')
        .single();

      if (reviewError) throw reviewError;

      if (imageFiles.length) {
        const imageRows = [];
        for (const [index, file] of imageFiles.entries()) {
          const imagePath = productReviewImagePath(user.id, reviewRow.id, file.name);
          await uploadFile(BUCKETS.PRODUCT_REVIEW_IMAGES, imagePath, file);
          imageRows.push({
            review_id: reviewRow.id,
            user_id: user.id,
            image_path: imagePath,
            original_name: file.name,
            sort_order: index
          });
        }

        if (imageRows.length) {
          const { error: imageError } = await supabase.from('product_review_images').insert(imageRows);
          if (imageError && !isMissingTableError(imageError, 'product_review_images')) throw imageError;
        }
      }

      reviewTextEl.value = '';
      if (reviewImagesEl) reviewImagesEl.value = '';
      currentRating = 5;
      renderReviewStars();
      await loadReviews(selectedProduct);
    } catch (error) {
      alert(error.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
