import template from './admin.html?raw';
import './admin.css';
import { Modal } from 'bootstrap';
import { supabase } from '../../services/supabase.js';
import { translateRoot, t } from '../../services/i18n.js';
import {
  BUCKETS, ACCEPTED_TYPES,
  uploadFile, getPublicUrl, getSignedUrl, removeFiles, listFiles,
  downloadFile, triggerDownload,
  productImagePath, avatarPath, bookingFilePath,
  formatBytes, isImage
} from '../../services/storage.js';

export function render() {
  return template;
}

export function afterRender({ root }) {
  translateRoot(root);

  const alertEl = root.querySelector('#admin-alert');
  const modalEl = root.querySelector('#admin-modal');
  const modalTitle = root.querySelector('#admin-modal-title');
  const modalBody = root.querySelector('#admin-modal-body');
  const modalFooter = root.querySelector('#admin-modal-footer');
  const bsModal = new Modal(modalEl);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function showAlert(message, type = 'success') {
    alertEl.textContent = message;
    alertEl.className = `alert alert-${type}`;
    setTimeout(() => alertEl.classList.add('d-none'), 4000);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(date) {
    return date ? new Date(date).toLocaleDateString() : '—';
  }

  function openModal(title, bodyHtml, footerHtml, onSave) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalFooter.innerHTML = footerHtml;
    if (onSave) {
      modalFooter.querySelector('#modal-save')?.addEventListener('click', onSave);
    }
    bsModal.show();
  }

  function roleBadge(role) {
    const colors = { admin: 'danger', staff: 'warning text-dark', customer: 'secondary' };
    return `<span class="badge admin-role-badge bg-${colors[role] ?? 'secondary'}">${escapeHtml(role)}</span>`;
  }

  // ── Tab switching ─────────────────────────────────────────────────────────

  const panes = { users: false, services: false, products: false, bookings: false, quiz: false };

  function activateTab(tabName) {
    root.querySelectorAll('[data-admin-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.adminTab === tabName);
    });
    root.querySelectorAll('.admin-pane').forEach((pane) => pane.classList.add('d-none'));
    root.querySelector(`#admin-pane-${tabName}`).classList.remove('d-none');

    if (!panes[tabName]) {
      panes[tabName] = true;
      LOADERS[tabName]();
    }
  }

  root.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.adminTab));
  });

  // ── USERS tab ─────────────────────────────────────────────────────────────

  async function loadUsers(search = '') {
    const loadEl = root.querySelector('#admin-users-loading');
    const tableEl = root.querySelector('#admin-users-table');
    loadEl.classList.remove('d-none');
    tableEl.classList.add('d-none');

    // Two separate queries then merge in JS (no FK between profiles and user_roles)
    let profileQuery = supabase.from('profiles')
      .select('id, full_name, phone, created_at, avatar_url')
      .order('full_name');
    if (search.trim()) profileQuery = profileQuery.ilike('full_name', `%${search.trim()}%`);

    const [{ data: profiles, error: pErr }, { data: roleRows, error: rErr }] = await Promise.all([
      profileQuery,
      supabase.from('user_roles').select('user_id, role')
    ]);

    loadEl.classList.add('d-none');
    tableEl.classList.remove('d-none');

    if (pErr || rErr) { showAlert((pErr || rErr).message, 'danger'); return; }

    const roleMap = {};
    for (const r of roleRows ?? []) {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    }
    const data = (profiles ?? []).map((p) => ({
      ...p,
      user_roles: (roleMap[p.id] ?? []).map((role) => ({ role }))
    }));

    const tbody = root.querySelector('#admin-users-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">${t('customers.empty')}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((u) => {
      const roles = (u.user_roles ?? []).map((r) => roleBadge(r.role)).join(' ');
      const avatar = u.avatar_url
        ? `<img src="${escapeHtml(u.avatar_url)}" class="rounded-circle me-2" style="width:32px;height:32px;object-fit:cover">`
        : `<span class="rounded-circle bg-secondary d-inline-flex align-items-center justify-content-center me-2 text-white" style="width:32px;height:32px;font-size:0.7rem">${escapeHtml((u.full_name ?? '?')[0].toUpperCase())}</span>`;
      return `<tr>
        <td><div class="d-flex align-items-center">${avatar}<span class="fw-semibold">${escapeHtml(u.full_name ?? '—')}</span></div></td>
        <td>${roles || roleBadge('—')}</td>
        <td>${escapeHtml(u.phone ?? '—')}</td>
        <td class="text-muted small">${fmt(u.created_at)}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" data-action="edit-user" data-id="${u.id}">${t('customers.btn.edit')}</button>
            <button class="btn btn-outline-danger" data-action="delete-user" data-id="${u.id}">${t('customers.btn.delete')}</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-action="edit-user"]').forEach((btn) =>
      btn.addEventListener('click', () => openEditUser(btn.dataset.id, data.find((u) => u.id === btn.dataset.id))));
    tbody.querySelectorAll('[data-action="delete-user"]').forEach((btn) =>
      btn.addEventListener('click', () => deleteUser(btn.dataset.id)));
  }

  function openEditUser(userId, user) {
    const avatarPreview = user.avatar_url
      ? `<img id="eu-avatar-preview" src="${escapeHtml(user.avatar_url)}" class="rounded-circle mb-2" style="width:64px;height:64px;object-fit:cover">`
      : `<div id="eu-avatar-preview" class="rounded-circle bg-secondary d-flex align-items-center justify-content-center mb-2 text-white fw-bold" style="width:64px;height:64px;font-size:1.2rem">${(user.full_name ?? '?')[0].toUpperCase()}</div>`;

    const body = `
      <div id="modal-error" class="alert alert-danger d-none"></div>
      <div class="mb-3"><label class="form-label">${t('auth.register.name')}</label>
        <input id="eu-name" class="form-control" value="${escapeHtml(user.full_name ?? '')}" /></div>
      <div class="mb-3"><label class="form-label">${t('customers.col.phone')}</label>
        <input id="eu-phone" class="form-control" value="${escapeHtml(user.phone ?? '')}" /></div>
      <div class="mb-3"><label class="form-label">${t('admin.col.role')}</label>
        <select id="eu-role" class="form-select">
          <option value="customer" ${(user.user_roles?.[0]?.role ?? 'customer') === 'customer' ? 'selected' : ''}>customer</option>
          <option value="staff" ${(user.user_roles?.[0]?.role) === 'staff' ? 'selected' : ''}>staff</option>
          <option value="admin" ${(user.user_roles?.[0]?.role) === 'admin' ? 'selected' : ''}>admin</option>
        </select></div>
      <div class="mb-3">
        <label class="form-label">${t('admin.col.avatar')}</label>
        <div>${avatarPreview}</div>
        <input id="eu-avatar" type="file" class="form-control form-control-sm" accept="image/*" />
      </div>`;

    openModal(t('customers.edit.heading'), body,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>
       <button id="modal-save" class="btn btn-primary">
         <span>${t('customers.edit.save')}</span>
         <span class="spinner-border spinner-border-sm d-none ms-2"></span>
       </button>`,
      async () => {
        const errEl = modalBody.querySelector('#modal-error');
        const saveBtn = modalFooter.querySelector('#modal-save');
        const spinner = saveBtn.querySelector('.spinner-border');
        const name = modalBody.querySelector('#eu-name').value.trim();
        const phone = modalBody.querySelector('#eu-phone').value.trim();
        const role = modalBody.querySelector('#eu-role').value;
        const avatarFile = modalBody.querySelector('#eu-avatar').files[0];

        if (!name) { errEl.textContent = t('auth.error.requiredFields'); errEl.classList.remove('d-none'); return; }

        saveBtn.disabled = true;
        spinner.classList.remove('d-none');
        errEl.classList.add('d-none');

        try {
          let avatarUrl = user.avatar_url ?? null;
          if (avatarFile) {
            const path = avatarPath(userId, avatarFile.name);
            await uploadFile(BUCKETS.AVATARS, path, avatarFile);
            avatarUrl = getPublicUrl(BUCKETS.AVATARS, path);
          }

          await supabase.from('profiles').update({
            full_name: name,
            phone: phone || null,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString()
          }).eq('id', userId);

          await supabase.from('user_roles').delete().eq('user_id', userId);
          await supabase.from('user_roles').insert({ user_id: userId, role });

          bsModal.hide();
          showAlert(t('customers.edit.success'));
          panes.users = false;
          loadUsers();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('d-none');
          saveBtn.disabled = false;
          spinner.classList.add('d-none');
        }
      });
  }

  function openAddUserModal() {
    const body = `
      <div id="modal-error" class="alert alert-danger d-none"></div>
      <div class="row g-3">
        <div class="col-12"><label class="form-label">${t('auth.register.name')}</label>
          <input id="au-name" class="form-control" placeholder="Full name" /></div>
        <div class="col-12"><label class="form-label">${t('auth.login.email')}</label>
          <input id="au-email" type="email" class="form-control" /></div>
        <div class="col-12"><label class="form-label">${t('auth.login.password')}</label>
          <input id="au-password" type="password" class="form-control" placeholder="Min 8 characters" minlength="8" /></div>
        <div class="col-12"><label class="form-label">${t('admin.col.role')}</label>
          <select id="au-role" class="form-select">
            <option value="customer">customer</option>
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select></div>
      </div>`;

    openModal(t('admin.btn.addUser'), body,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>
       <button id="modal-save" class="btn btn-success">
         <span class="btn-label">${t('admin.btn.addUser')}</span>
         <span class="spinner-border spinner-border-sm d-none ms-2"></span>
       </button>`,
      async () => {
        const errEl = modalBody.querySelector('#modal-error');
        const saveBtn = modalFooter.querySelector('#modal-save');
        const spinner = saveBtn.querySelector('.spinner-border');
        const fullName = modalBody.querySelector('#au-name').value.trim();
        const email = modalBody.querySelector('#au-email').value.trim();
        const password = modalBody.querySelector('#au-password').value;
        const role = modalBody.querySelector('#au-role').value;

        if (!email || !password) {
          errEl.textContent = t('auth.error.requiredFields');
          errEl.classList.remove('d-none');
          return;
        }
        if (password.length < 8) {
          errEl.textContent = t('auth.error.passwordTooShort');
          errEl.classList.remove('d-none');
          return;
        }

        saveBtn.disabled = true;
        spinner.classList.remove('d-none');
        errEl.classList.add('d-none');

        const { data, error } = await supabase.functions.invoke('create-user', {
          body: { fullName, email, password, role }
        });

        saveBtn.disabled = false;
        spinner.classList.add('d-none');

        if (error || data?.error) {
          errEl.textContent = data?.error ?? error.message;
          errEl.classList.remove('d-none');
          return;
        }

        bsModal.hide();
        showAlert(t('admin.user.created'));
        panes.users = false;
        loadUsers();
      });
  }

  async function deleteUser(userId) {
    openModal(
      t('admin.user.deleteTitle'),
      `<p class="mb-0">${t('customers.delete.confirm')}</p>`,
      `<button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>
       <button id="modal-save" class="btn btn-danger">
         <span class="btn-label">${t('customers.btn.delete')}</span>
         <span class="spinner-border spinner-border-sm d-none ms-2"></span>
       </button>`,
      async () => {
        const errEl = document.createElement('div');
        const saveBtn = modalFooter.querySelector('#modal-save');
        const spinner = saveBtn.querySelector('.spinner-border');

        saveBtn.disabled = true;
        spinner.classList.remove('d-none');

        const { data, error } = await supabase.functions.invoke('delete-user', {
          body: { userId }
        });

        if (error || data?.error) {
          saveBtn.disabled = false;
          spinner.classList.add('d-none');
          const alertEl = root.querySelector('#admin-alert');
          bsModal.hide();
          showAlert(data?.error ?? error.message, 'danger');
          return;
        }

        bsModal.hide();
        showAlert(t('customers.delete.success'));
        panes.users = false;
        loadUsers();
      }
    );
    bsModal.show();
  }

  let userSearchTimer = null;
  root.querySelector('#admin-user-search').addEventListener('input', (e) => {
    clearTimeout(userSearchTimer);
    userSearchTimer = setTimeout(() => { panes.users = false; loadUsers(e.target.value); }, 300);
  });

  root.querySelector('#admin-user-add').addEventListener('click', () => openAddUserModal());

  // ── SERVICES tab ──────────────────────────────────────────────────────────

  async function loadServices() {
    const loadEl = root.querySelector('#admin-services-loading');
    const tableEl = root.querySelector('#admin-services-table');
    loadEl.classList.remove('d-none'); tableEl.classList.add('d-none');

    const { data, error } = await supabase.from('services').select('*').order('category').order('service_name');
    loadEl.classList.add('d-none'); tableEl.classList.remove('d-none');
    if (error) { showAlert(error.message, 'danger'); return; }

    const tbody = root.querySelector('#admin-services-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">${t('admin.empty')}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((s) => `<tr>
      <td class="fw-semibold">${escapeHtml(s.service_name)}</td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(s.category)}</span></td>
      <td>${s.service_duration_minutes} min</td>
      <td>€${Number(s.price).toFixed(2)}</td>
      <td>${s.is_active ? '<span class="badge bg-success">✓</span>' : '<span class="badge bg-secondary">✗</span>'}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" data-action="edit-service" data-id="${s.id}">${t('customers.btn.edit')}</button>
          <button class="btn btn-outline-danger" data-action="delete-service" data-id="${s.id}">${t('customers.btn.delete')}</button>
        </div>
      </td>
    </tr>`).join('');

    tbody.querySelectorAll('[data-action="edit-service"]').forEach((btn) =>
      btn.addEventListener('click', () => openServiceForm(btn.dataset.id, data.find((s) => s.id === btn.dataset.id))));
    tbody.querySelectorAll('[data-action="delete-service"]').forEach((btn) =>
      btn.addEventListener('click', () => deleteService(btn.dataset.id)));
  }

  function serviceFormBody(s = {}) {
    return `
      <div id="modal-error" class="alert alert-danger d-none"></div>
      <div class="row g-3">
        <div class="col-8"><label class="form-label">${t('admin.col.name')}</label>
          <input id="sf-name" class="form-control" value="${escapeHtml(s.service_name ?? '')}" /></div>
        <div class="col-4"><label class="form-label">${t('admin.col.category')}</label>
          <input id="sf-cat" class="form-control" value="${escapeHtml(s.category ?? '')}" /></div>
        <div class="col-12"><label class="form-label">Description</label>
          <textarea id="sf-desc" class="form-control" rows="2">${escapeHtml(s.service_description ?? '')}</textarea></div>
        <div class="col-4"><label class="form-label">${t('admin.col.duration')} (min)</label>
          <input id="sf-dur" type="number" class="form-control" value="${s.service_duration_minutes ?? 30}" min="1" /></div>
        <div class="col-4"><label class="form-label">${t('admin.col.price')} (€)</label>
          <input id="sf-price" type="number" class="form-control" value="${s.price ?? ''}" step="0.01" min="0" /></div>
        <div class="col-4 d-flex align-items-end pb-1">
          <div class="form-check"><input id="sf-active" class="form-check-input" type="checkbox" ${(s.is_active ?? true) ? 'checked' : ''} />
          <label class="form-check-label" for="sf-active">${t('admin.col.active')}</label></div>
        </div>
      </div>`;
  }

  async function saveService(id) {
    const errEl = modalBody.querySelector('#modal-error');
    const name = modalBody.querySelector('#sf-name').value.trim();
    const cat = modalBody.querySelector('#sf-cat').value.trim();
    const dur = parseInt(modalBody.querySelector('#sf-dur').value, 10);
    const price = parseFloat(modalBody.querySelector('#sf-price').value);
    const desc = modalBody.querySelector('#sf-desc').value.trim();
    const active = modalBody.querySelector('#sf-active').checked;

    if (!name || !cat || isNaN(dur) || isNaN(price)) {
      errEl.textContent = t('auth.error.requiredFields'); errEl.classList.remove('d-none'); return;
    }
    const payload = { category: cat, service_name: name, service_description: desc || null, service_duration_minutes: dur, price, is_active: active };
    const { error } = id
      ? await supabase.from('services').update(payload).eq('id', id)
      : await supabase.from('services').insert(payload);
    if (error) { errEl.textContent = error.message; errEl.classList.remove('d-none'); return; }
    bsModal.hide();
    showAlert(t('admin.saved'));
    panes.services = false;
    loadServices();
  }

  function openServiceForm(id = null, s = {}) {
    const title = id ? `${t('customers.btn.edit')} — ${s.service_name}` : t('admin.btn.add');
    openModal(title, serviceFormBody(s),
      `<button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>
       <button id="modal-save" class="btn btn-primary">${t('customers.edit.save')}</button>`,
      () => saveService(id));
  }

  async function deleteService(id) {
    if (!confirm(t('admin.delete.confirm'))) return;
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) { showAlert(error.message, 'danger'); return; }
    showAlert(t('admin.deleted'));
    panes.services = false;
    loadServices();
  }

  root.querySelector('#admin-service-add').addEventListener('click', () => openServiceForm());

  // ── PRODUCTS tab ──────────────────────────────────────────────────────────

  async function loadProducts() {
    const loadEl = root.querySelector('#admin-products-loading');
    const tableEl = root.querySelector('#admin-products-table');
    loadEl.classList.remove('d-none'); tableEl.classList.add('d-none');

    const { data, error } = await supabase.from('products').select('*').order('category').order('product_name');
    loadEl.classList.add('d-none'); tableEl.classList.remove('d-none');
    if (error) { showAlert(error.message, 'danger'); return; }

    const tbody = root.querySelector('#admin-products-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">${t('admin.empty')}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((p) => {
      const thumb = p.image_url
        ? `<img src="${escapeHtml(p.image_url)}" class="rounded me-2" style="width:36px;height:36px;object-fit:cover">`
        : `<span class="text-muted me-2">—</span>`;
      return `<tr>
        <td><div class="d-flex align-items-center">${thumb}<span class="fw-semibold">${escapeHtml(p.product_name)}</span></div></td>
        <td>${escapeHtml(p.brand)}</td>
        <td><span class="badge bg-light text-dark border">${escapeHtml(p.category)}</span></td>
        <td>${p.stock_quantity}</td>
        <td>${p.is_active ? '<span class="badge bg-success">✓</span>' : '<span class="badge bg-secondary">✗</span>'}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" data-action="edit-product" data-id="${p.id}">${t('customers.btn.edit')}</button>
            <button class="btn btn-outline-danger" data-action="delete-product" data-id="${p.id}">${t('customers.btn.delete')}</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-action="edit-product"]').forEach((btn) =>
      btn.addEventListener('click', () => openProductForm(btn.dataset.id, data.find((p) => p.id === btn.dataset.id))));
    tbody.querySelectorAll('[data-action="delete-product"]').forEach((btn) =>
      btn.addEventListener('click', () => deleteProduct(btn.dataset.id)));
  }

  function productFormBody(p = {}) {
    const imgPreview = p.image_url
      ? `<img src="${escapeHtml(p.image_url)}" class="rounded mb-2 d-block" style="max-height:80px;max-width:160px;object-fit:cover">`
      : '';
    return `
      <div id="modal-error" class="alert alert-danger d-none"></div>
      <div class="row g-3">
        <div class="col-8"><label class="form-label">${t('admin.col.name')}</label>
          <input id="pf-name" class="form-control" value="${escapeHtml(p.product_name ?? '')}" /></div>
        <div class="col-4"><label class="form-label">${t('admin.col.category')}</label>
          <input id="pf-cat" class="form-control" value="${escapeHtml(p.category ?? '')}" /></div>
        <div class="col-6"><label class="form-label">${t('admin.col.brand')}</label>
          <input id="pf-brand" class="form-control" value="${escapeHtml(p.brand ?? '')}" /></div>
        <div class="col-3"><label class="form-label">${t('admin.col.stock')}</label>
          <input id="pf-stock" type="number" class="form-control" value="${p.stock_quantity ?? 0}" min="0" /></div>
        <div class="col-3 d-flex align-items-end pb-1">
          <div class="form-check"><input id="pf-active" class="form-check-input" type="checkbox" ${(p.is_active ?? true) ? 'checked' : ''} />
          <label class="form-check-label" for="pf-active">${t('admin.col.active')}</label></div>
        </div>
        <div class="col-12">
          <label class="form-label">${t('admin.col.image')}</label>
          <input type="hidden" id="pf-image-url" value="${escapeHtml(p.image_url ?? '')}" />
          ${imgPreview}
          <input id="pf-image" type="file" class="form-control form-control-sm" accept="${ACCEPTED_TYPES}" />
          ${p.image_url ? `<button type="button" class="btn btn-sm btn-outline-danger mt-1" id="pf-clear-img">${t('admin.file.remove')}</button>` : ''}
        </div>
      </div>`;
  }

  async function saveProduct(id) {
    const errEl = modalBody.querySelector('#modal-error');
    const name = modalBody.querySelector('#pf-name').value.trim();
    const cat = modalBody.querySelector('#pf-cat').value.trim();
    const brand = modalBody.querySelector('#pf-brand').value.trim();
    const stock = parseInt(modalBody.querySelector('#pf-stock').value, 10);
    const active = modalBody.querySelector('#pf-active').checked;
    const imageFile = modalBody.querySelector('#pf-image')?.files[0];
    const imageUrlInput = modalBody.querySelector('#pf-image-url');

    if (!name || !cat || !brand || isNaN(stock)) {
      errEl.textContent = t('auth.error.requiredFields'); errEl.classList.remove('d-none'); return;
    }

    const saveBtn = modalFooter.querySelector('#modal-save');
    saveBtn.disabled = true;
    errEl.classList.add('d-none');

    try {
      let imageUrl = imageUrlInput?.value || null;

      const payload = { category: cat, product_name: name, brand, stock_quantity: stock, is_active: active, image_url: imageUrl };

      let savedId = id;
      if (id) {
        const { error } = await supabase.from('products').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('products').insert(payload).select('id').single();
        if (error) throw error;
        savedId = data.id;
      }

      // Upload image after we have the product ID
      if (imageFile) {
        const path = productImagePath(savedId, imageFile.name);
        await uploadFile(BUCKETS.PRODUCTS, path, imageFile);
        imageUrl = getPublicUrl(BUCKETS.PRODUCTS, path);
        await supabase.from('products').update({ image_url: imageUrl }).eq('id', savedId);
      }

      bsModal.hide();
      showAlert(t('admin.saved'));
      panes.products = false;
      loadProducts();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
    } finally {
      saveBtn.disabled = false;
    }
  }

  function openProductForm(id = null, p = {}) {
    const title = id ? `${t('customers.btn.edit')} — ${p.product_name}` : t('admin.btn.add');
    openModal(title, productFormBody(p),
      `<button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>
       <button id="modal-save" class="btn btn-primary">${t('customers.edit.save')}</button>`,
      () => saveProduct(id));

    // Wire remove-image button
    modalBody.querySelector('#pf-clear-img')?.addEventListener('click', () => {
      modalBody.querySelector('#pf-image-url').value = '';
      modalBody.querySelector('#pf-clear-img')?.remove();
      modalBody.querySelector('img')?.remove();
    });
  }

  async function deleteProduct(id) {
    if (!confirm(t('admin.delete.confirm'))) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) { showAlert(error.message, 'danger'); return; }
    showAlert(t('admin.deleted'));
    panes.products = false;
    loadProducts();
  }

  root.querySelector('#admin-product-add').addEventListener('click', () => openProductForm());

  // ── BOOKINGS tab ──────────────────────────────────────────────────────────

  async function loadBookings() {
    const loadEl = root.querySelector('#admin-bookings-loading');
    const tableEl = root.querySelector('#admin-bookings-table');
    loadEl.classList.remove('d-none'); tableEl.classList.add('d-none');

    const { data, error } = await supabase
      .from('bookings')
      .select('id, user_id, customer_display_name, booking_date, booking_time, status, services(service_name)')
      .order('booking_date', { ascending: false })
      .limit(100);

    loadEl.classList.add('d-none'); tableEl.classList.remove('d-none');
    if (error) { showAlert(error.message, 'danger'); return; }

    const tbody = root.querySelector('#admin-bookings-tbody');
    const STATUS_COLORS = { pending: 'warning text-dark', confirmed: 'success', cancelled: 'secondary', completed: 'primary' };

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">${t('admin.empty')}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((b) => `<tr>
      <td class="fw-semibold">${escapeHtml(b.customer_display_name)}</td>
      <td>${escapeHtml(b.services?.service_name ?? '—')}</td>
      <td class="text-muted small">${b.booking_date} ${String(b.booking_time).slice(0, 5)}</td>
      <td><span class="badge bg-${STATUS_COLORS[b.status] ?? 'secondary'}">${b.status}</span></td>
      <td class="text-end d-flex gap-1 justify-content-end">
        <select class="form-select form-select-sm w-auto" data-action="update-status" data-id="${b.id}">
          ${['pending','confirmed','cancelled','completed'].map((s) =>
            `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-outline-secondary" data-action="booking-files" data-id="${b.id}" data-user-id="${b.user_id}" title="${t('admin.file.files')}">📎</button>
      </td>
    </tr>`).join('');

    tbody.querySelectorAll('[data-action="update-status"]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const { error } = await supabase.from('bookings').update({ status: sel.value }).eq('id', sel.dataset.id);
        if (error) showAlert(error.message, 'danger');
        else showAlert(t('admin.saved'));
      });
    });

    tbody.querySelectorAll('[data-action="booking-files"]').forEach((btn) => {
      btn.addEventListener('click', () => openBookingFilesModal(btn.dataset.id, btn.dataset.userId));
    });
  }

  async function openBookingFilesModal(bookingId, userId) {
    modalTitle.textContent = `${t('admin.file.files')} — #${bookingId.slice(0, 8)}`;
    modalBody.innerHTML = `<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>`;
    modalFooter.innerHTML = `
      <label class="btn btn-sm btn-outline-primary mb-0">
        ${t('admin.file.upload')}
        <input type="file" id="booking-file-input" class="d-none" accept="${ACCEPTED_TYPES}" multiple />
      </label>
      <button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>`;
    bsModal.show();

    const renderFiles = async () => {
      try {
        const files = await listFiles(BUCKETS.BOOKINGS, `${userId}/${bookingId}`);
        if (!files.length) {
          modalBody.innerHTML = `<p class="text-muted text-center py-3">${t('admin.file.noFiles')}</p>`;
          return;
        }
        modalBody.innerHTML = `<ul class="list-group list-group-flush">
          ${files.map((f) => `
            <li class="list-group-item d-flex justify-content-between align-items-center gap-2 px-0">
              <div class="d-flex align-items-center gap-2 text-truncate">
                ${isImage(f.name) ? `<img src="" data-path="${userId}/${bookingId}/${f.name}" class="booking-file-thumb rounded" style="width:36px;height:36px;object-fit:cover">` : '📄'}
                <span class="text-truncate small">${escapeHtml(f.name)}</span>
                <small class="text-muted">${formatBytes(f.metadata?.size)}</small>
              </div>
              <div class="d-flex gap-1 flex-shrink-0">
                <button class="btn btn-sm btn-outline-primary" data-file-download="${f.name}">${t('admin.file.download')}</button>
                <button class="btn btn-sm btn-outline-danger" data-file-delete="${f.name}">${t('customers.btn.delete')}</button>
              </div>
            </li>`).join('')}
        </ul>`;

        // Load signed URLs for image thumbnails
        modalBody.querySelectorAll('[data-path]').forEach(async (img) => {
          try {
            img.src = await getSignedUrl(BUCKETS.BOOKINGS, img.dataset.path, 300);
          } catch { /* ignore */ }
        });

        // Download buttons
        modalBody.querySelectorAll('[data-file-download]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const path = `${userId}/${bookingId}/${btn.dataset.fileDownload}`;
            try {
              const blob = await downloadFile(BUCKETS.BOOKINGS, path);
              triggerDownload(blob, btn.dataset.fileDownload);
            } catch (err) { showAlert(err.message, 'danger'); }
          });
        });

        // Delete buttons
        modalBody.querySelectorAll('[data-file-delete]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            if (!confirm(t('admin.file.deleteConfirm'))) return;
            const path = `${userId}/${bookingId}/${btn.dataset.fileDelete}`;
            try {
              await removeFiles(BUCKETS.BOOKINGS, [path]);
              await renderFiles();
            } catch (err) { showAlert(err.message, 'danger'); }
          });
        });
      } catch (err) {
        modalBody.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
      }
    };

    await renderFiles();

    // Upload new files
    modalFooter.querySelector('#booking-file-input').addEventListener('change', async (e) => {
      const filesToUpload = Array.from(e.target.files);
      for (const file of filesToUpload) {
        try {
          const path = bookingFilePath(userId, bookingId, file.name);
          await uploadFile(BUCKETS.BOOKINGS, path, file);
        } catch (err) { showAlert(err.message, 'danger'); }
      }
      await renderFiles();
      e.target.value = '';
    });
  }

  // ── QUIZ tab ──────────────────────────────────────────────────────────────

  async function loadQuiz() {
    const loadEl = root.querySelector('#admin-quiz-loading');
    const tableEl = root.querySelector('#admin-quiz-table');
    loadEl.classList.remove('d-none'); tableEl.classList.add('d-none');

    const { data, error } = await supabase
      .from('quiz_questions')
      .select('*')
      .order('sort_order')
      .order('created_at');

    loadEl.classList.add('d-none'); tableEl.classList.remove('d-none');
    if (error) { showAlert(error.message, 'danger'); return; }

    const tbody = root.querySelector('#admin-quiz-tbody');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">${t('admin.empty')}</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map((q, i) => `<tr>
      <td class="text-muted">${q.sort_order ?? i + 1}</td>
      <td class="fw-semibold">${escapeHtml(q.question_text)}</td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(q.question_type)}</span></td>
      <td>${q.is_active ? '<span class="badge bg-success">✓</span>' : '<span class="badge bg-secondary">✗</span>'}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" data-action="edit-quiz" data-id="${q.id}">${t('customers.btn.edit')}</button>
          <button class="btn btn-outline-danger" data-action="delete-quiz" data-id="${q.id}">${t('customers.btn.delete')}</button>
        </div>
      </td>
    </tr>`).join('');

    tbody.querySelectorAll('[data-action="edit-quiz"]').forEach((btn) =>
      btn.addEventListener('click', () => openQuizForm(btn.dataset.id, data.find((q) => q.id === btn.dataset.id))));
    tbody.querySelectorAll('[data-action="delete-quiz"]').forEach((btn) =>
      btn.addEventListener('click', () => deleteQuiz(btn.dataset.id)));
  }

  function quizFormBody(q = {}) {
    const opts = Array.isArray(q.options) ? q.options.join('\n') : (q.options ? JSON.stringify(q.options) : '');
    return `
      <div id="modal-error" class="alert alert-danger d-none"></div>
      <div class="mb-3"><label class="form-label">${t('admin.col.question')}</label>
        <textarea id="qf-text" class="form-control" rows="3">${escapeHtml(q.question_text ?? '')}</textarea></div>
      <div class="row g-3">
        <div class="col-6"><label class="form-label">${t('admin.col.type')}</label>
          <select id="qf-type" class="form-select">
            <option value="single_choice" ${q.question_type === 'single_choice' ? 'selected' : ''}>Single choice</option>
            <option value="multi_choice" ${q.question_type === 'multi_choice' ? 'selected' : ''}>Multi choice</option>
            <option value="text" ${q.question_type === 'text' ? 'selected' : ''}>Free text</option>
          </select></div>
        <div class="col-3"><label class="form-label">Sort order</label>
          <input id="qf-sort" type="number" class="form-control" value="${q.sort_order ?? 0}" min="0" /></div>
        <div class="col-3 d-flex align-items-end pb-1">
          <div class="form-check"><input id="qf-active" class="form-check-input" type="checkbox" ${(q.is_active ?? true) ? 'checked' : ''} />
          <label class="form-check-label" for="qf-active">${t('admin.col.active')}</label></div>
        </div>
      </div>
      <div class="mt-3" id="qf-options-wrap">
        <label class="form-label">Options <small class="text-muted">(one per line)</small></label>
        <textarea id="qf-options" class="form-control" rows="4" placeholder="Option A&#10;Option B&#10;Option C">${escapeHtml(opts)}</textarea>
      </div>`;
  }

  async function saveQuiz(id) {
    const errEl = modalBody.querySelector('#modal-error');
    const text = modalBody.querySelector('#qf-text').value.trim();
    const type = modalBody.querySelector('#qf-type').value;
    const sort = parseInt(modalBody.querySelector('#qf-sort').value, 10);
    const active = modalBody.querySelector('#qf-active').checked;
    const rawOpts = modalBody.querySelector('#qf-options').value.trim();
    const options = rawOpts ? rawOpts.split('\n').map((o) => o.trim()).filter(Boolean) : null;

    if (!text) { errEl.textContent = t('auth.error.requiredFields'); errEl.classList.remove('d-none'); return; }

    const payload = { question_text: text, question_type: type, sort_order: isNaN(sort) ? 0 : sort, is_active: active, options: options?.length ? options : null };
    const { error } = id
      ? await supabase.from('quiz_questions').update(payload).eq('id', id)
      : await supabase.from('quiz_questions').insert(payload);
    if (error) { errEl.textContent = error.message; errEl.classList.remove('d-none'); return; }
    bsModal.hide();
    showAlert(t('admin.saved'));
    panes.quiz = false;
    loadQuiz();
  }

  function openQuizForm(id = null, q = {}) {
    const title = id ? `${t('customers.btn.edit')} — Q${q.sort_order ?? ''}` : '+ ' + t('admin.tab.quiz');
    openModal(title, quizFormBody(q),
      `<button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>
       <button id="modal-save" class="btn btn-primary">${t('customers.edit.save')}</button>`,
      () => saveQuiz(id));
  }

  async function deleteQuiz(id) {
    if (!confirm(t('admin.delete.confirm'))) return;
    const { error } = await supabase.from('quiz_questions').delete().eq('id', id);
    if (error) { showAlert(error.message, 'danger'); return; }
    showAlert(t('admin.deleted'));
    panes.quiz = false;
    loadQuiz();
  }

  root.querySelector('#admin-quiz-add').addEventListener('click', () => openQuizForm());

  // ── Loader map & initial tab ───────────────────────────────────────────────

  const LOADERS = { users: loadUsers, services: loadServices, products: loadProducts, bookings: loadBookings, quiz: loadQuiz };
  activateTab('users');
}
