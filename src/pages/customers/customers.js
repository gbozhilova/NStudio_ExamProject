import template from './customers.html?raw';
import './customers.css';
import { Modal } from 'bootstrap';
import { listCustomers, getCustomer, updateCustomer, deleteCustomer } from '../../services/customers.js';
import { hasRole } from '../../services/session.js';
import { translateRoot, t } from '../../services/i18n.js';

const PAGE_SIZE = 20;

export function render() {
  return template;
}

export function afterRender({ root }) {
  translateRoot(root);

  const searchInput = root.querySelector('#customer-search');
  const loadingEl = root.querySelector('#customers-loading');
  const tableWrap = root.querySelector('#customers-table-wrap');
  const tbody = root.querySelector('#customers-tbody');
  const paginationEl = root.querySelector('#customers-pagination');
  const alertEl = root.querySelector('#customers-alert');
  const modalEl = root.querySelector('#customer-modal');
  const modalTitle = root.querySelector('#customer-modal-title');
  const modalBody = root.querySelector('#customer-modal-body');
  const modalFooter = root.querySelector('#customer-modal-footer');

  const bsModal = new Modal(modalEl);

  let currentPage = 1;
  let currentSearch = '';

  function showAlert(message, type = 'success') {
    alertEl.textContent = message;
    alertEl.className = `alert alert-${type}`;
    setTimeout(() => alertEl.classList.add('d-none'), 4000);
  }

  function setLoading(loading) {
    loadingEl.classList.toggle('d-none', !loading);
    tableWrap.classList.toggle('d-none', loading);
  }

  async function loadCustomers(page = 1, search = '') {
    setLoading(true);
    try {
      const { data, count } = await listCustomers({ page, pageSize: PAGE_SIZE, search });
      renderRows(data);
      renderPagination(count, page);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      showAlert(err.message ?? t('error.generic'), 'danger');
    }
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString();
  }

  function renderRows(customers) {
    if (!customers.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4" data-i18n="customers.empty">${t('customers.empty')}</td></tr>`;
      return;
    }

    const isAdmin = hasRole('admin');

    tbody.innerHTML = customers.map((c) => `
      <tr>
        <td>
          <span class="fw-semibold">${escapeHtml(c.full_name ?? '—')}</span>
        </td>
        <td>${escapeHtml(c.phone ?? '—')}</td>
        <td class="text-muted small">${formatDate(c.created_at)}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" data-action="view" data-id="${c.id}" data-i18n="customers.btn.view">${t('customers.btn.view')}</button>
            <button class="btn btn-outline-primary" data-action="edit" data-id="${c.id}" data-i18n="customers.btn.edit">${t('customers.btn.edit')}</button>
            ${isAdmin ? `<button class="btn btn-outline-danger" data-action="delete" data-id="${c.id}" data-i18n="customers.btn.delete">${t('customers.btn.delete')}</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => openViewModal(btn.dataset.id));
    });
    tbody.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    if (isAdmin) {
      tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
        btn.addEventListener('click', () => handleDelete(btn.dataset.id));
      });
    }
  }

  function renderPagination(totalCount, page) {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }

    let html = '<nav aria-label="Customers pagination"><ul class="pagination pagination-sm mb-0">';
    for (let i = 1; i <= totalPages; i++) {
      html += `<li class="page-item ${i === page ? 'active' : ''}">
        <button class="page-link" data-page="${i}">${i}</button>
      </li>`;
    }
    html += '</ul></nav>';
    paginationEl.innerHTML = html;

    paginationEl.querySelectorAll('[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page, 10);
        loadCustomers(currentPage, currentSearch);
      });
    });
  }

  async function openViewModal(userId) {
    try {
      const customer = await getCustomer(userId);
      modalTitle.textContent = customer.full_name ?? '—';
      modalBody.innerHTML = `
        <dl class="row mb-0">
          <dt class="col-4">${t('customers.col.phone')}</dt>
          <dd class="col-8">${escapeHtml(customer.phone ?? '—')}</dd>
          <dt class="col-4">${t('customers.col.created')}</dt>
          <dd class="col-8">${formatDate(customer.created_at)}</dd>
          <dt class="col-4">${t('customers.field.notes')}</dt>
          <dd class="col-8">${escapeHtml(customer.notes ?? '—')}</dd>
        </dl>
      `;
      modalFooter.innerHTML = `<button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>`;
      bsModal.show();
    } catch (err) {
      showAlert(err.message ?? t('error.generic'), 'danger');
    }
  }

  async function openEditModal(userId) {
    try {
      const customer = await getCustomer(userId);
      modalTitle.textContent = `${t('customers.edit.heading')}: ${customer.full_name ?? ''}`;
      modalBody.innerHTML = `
        <div id="edit-error" class="alert alert-danger d-none"></div>
        <div class="mb-3">
          <label class="form-label">${t('auth.register.name')}</label>
          <input id="edit-name" type="text" class="form-control" value="${escapeHtml(customer.full_name ?? '')}" />
        </div>
        <div class="mb-3">
          <label class="form-label">${t('customers.col.phone')}</label>
          <input id="edit-phone" type="tel" class="form-control" value="${escapeHtml(customer.phone ?? '')}" />
        </div>
        <div class="mb-3">
          <label class="form-label">${t('customers.field.notes')}</label>
          <textarea id="edit-notes" class="form-control" rows="3">${escapeHtml(customer.notes ?? '')}</textarea>
        </div>
      `;
      modalFooter.innerHTML = `
        <button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>
        <button id="edit-save" class="btn btn-primary">
          <span class="btn-label">${t('customers.edit.save')}</span>
          <span class="spinner-border spinner-border-sm d-none ms-2"></span>
        </button>
      `;

      const saveBtn = modalFooter.querySelector('#edit-save');
      const editError = modalBody.querySelector('#edit-error');

      saveBtn.addEventListener('click', async () => {
        const fullName = modalBody.querySelector('#edit-name').value.trim();
        const phone = modalBody.querySelector('#edit-phone').value.trim();
        const notes = modalBody.querySelector('#edit-notes').value.trim();

        if (!fullName) {
          editError.textContent = t('auth.error.requiredFields');
          editError.classList.remove('d-none');
          return;
        }

        saveBtn.disabled = true;
        saveBtn.querySelector('.spinner-border').classList.remove('d-none');
        editError.classList.add('d-none');

        try {
          await updateCustomer(userId, { fullName, phone, notes });
          bsModal.hide();
          showAlert(t('customers.edit.success'));
          loadCustomers(currentPage, currentSearch);
        } catch (err) {
          editError.textContent = err.message ?? t('error.generic');
          editError.classList.remove('d-none');
          saveBtn.disabled = false;
          saveBtn.querySelector('.spinner-border').classList.add('d-none');
        }
      });

      bsModal.show();
    } catch (err) {
      showAlert(err.message ?? t('error.generic'), 'danger');
    }
  }

  async function handleDelete(userId) {
    if (!confirm(t('customers.delete.confirm'))) return;
    try {
      await deleteCustomer(userId);
      showAlert(t('customers.delete.success'));
      loadCustomers(currentPage, currentSearch);
    } catch (err) {
      showAlert(err.message ?? t('error.generic'), 'danger');
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Debounced search
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentSearch = searchInput.value.trim();
      currentPage = 1;
      loadCustomers(currentPage, currentSearch);
    }, 300);
  });

  loadCustomers(currentPage, currentSearch);
}
