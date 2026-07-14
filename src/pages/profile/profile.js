import template from './profile.html?raw';
import './profile.css';
import { Modal } from 'bootstrap';
import { supabase } from '../../services/supabase.js';
import { getUser, isAuthenticated } from '../../services/session.js';
import { translateRoot, t } from '../../services/i18n.js';
import { navigate } from '../../app.js';
import {
  uploadFile, avatarPath, getPublicUrl, BUCKETS,
  listFiles, getSignedUrl, downloadFile, triggerDownload,
  formatBytes, isImage
} from '../../services/storage.js';

export function render() { return template; }

export function afterRender({ root }) {
  translateRoot(root);

  if (!isAuthenticated()) { navigate('/login', { replace: true }); return; }

  const user = getUser();
  const STATUS_COLORS = { pending: 'warning text-dark', confirmed: 'success', completed: 'primary', cancelled: 'secondary' };
  const filesModalEl = root.querySelector('#profile-booking-files-modal');
  const filesModalTitle = root.querySelector('#profile-booking-files-title');
  const filesModalBody = root.querySelector('#profile-booking-files-body');
  const filesModalFooter = root.querySelector('#profile-booking-files-footer');
  const filesModal = new Modal(filesModalEl);
  const ownBookingsFilter = `user_id.eq.${user.id},customer_email.eq.${user.email ?? ''}`;

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmtDate(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
  function fmtTime(t) { const [h, m] = String(t).split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; }
  function localDateISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  let profileData = null;
  let staffList = [];
  let allServices = [];

  // ── Load profile ─────────────────────────────────────────────────────────
  async function loadProfile() {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) return;
    profileData = profile;

    const avatarWrap = root.querySelector('#profile-avatar-wrap');
    if (profile.avatar_url) {
      avatarWrap.innerHTML = `<img src="${esc(profile.avatar_url)}" alt="Avatar" />`;
    } else {
      avatarWrap.innerHTML = `<div class="avatar-placeholder">${esc((profile.full_name ?? user.email ?? '?')[0].toUpperCase())}</div>`;
    }
    root.querySelector('#profile-name').textContent = profile.full_name ?? user.email ?? '';
    root.querySelector('#profile-email').textContent = user.email ?? '';
    root.querySelector('#edit-name').value = profile.full_name ?? '';
    root.querySelector('#edit-phone').value = profile.phone ?? '';

    renderPrefsView(profile);
    populatePrefsForm(profile);
  }

  // ── Preferences display ───────────────────────────────────────────────────
  function renderPrefsView(p) {
    const prefs = p.preferences ?? {};
    const staffName = staffList.find((s) => s.user_id === prefs.preferred_staff_id)?.full_name ?? '—';
    const items = [
      [t('profile.hairType'), p.hair_type],
      [t('profile.skinType'), p.skin_type],
      [t('profile.allergies'), p.allergy_notes],
      [t('profile.preferredStaff'), prefs.preferred_staff_id ? staffName : null]
    ].filter(([, v]) => v);

    const dl = root.querySelector('#prefs-dl');
    if (!items.length) {
      dl.innerHTML = `<dd class="col-12 text-muted small">${t('profile.noPrefs')}</dd>`;
    } else {
      dl.innerHTML = items.map(([k, v]) => `<dt class="col-5">${esc(k)}</dt><dd class="col-7">${esc(v)}</dd>`).join('');
    }
  }

  function populatePrefsForm(p) {
    const prefs = p.preferences ?? {};
    root.querySelector('#pref-hair').value = p.hair_type ?? '';
    root.querySelector('#pref-skin').value = p.skin_type ?? '';
    root.querySelector('#pref-allergy').value = p.allergy_notes ?? '';
    root.querySelector('#pref-staff').value = prefs.preferred_staff_id ?? '';
  }

  // ── Load bookings ─────────────────────────────────────────────────────────
  async function loadBookings() {
    const today = localDateISO();
    const [{ data: upcoming, error: upcomingError }, { data: past, error: pastError }] = await Promise.all([
      supabase.from('bookings')
        .select('id, booking_date, booking_time, status, notes, staff_user_id, services(service_name, service_duration_minutes)')
        .or(ownBookingsFilter)
        .gte('booking_date', today).neq('status', 'cancelled')
        .order('booking_date').order('booking_time'),
      supabase.from('bookings')
        .select('id, booking_date, booking_time, status, staff_user_id, services(service_name, service_duration_minutes)')
        .or(ownBookingsFilter)
        .or(`booking_date.lt.${today},status.eq.cancelled`)
        .order('booking_date', { ascending: false }).limit(20)
    ]);

    if (upcomingError || pastError) {
      console.error('Failed to load profile bookings', { upcomingError, pastError });
      root.querySelector('#profile-upcoming-loading').classList.add('d-none');
      root.querySelector('#profile-past-loading').classList.add('d-none');
      root.querySelector('#profile-upcoming-list').innerHTML = `<p class="text-danger small">${esc((upcomingError ?? pastError)?.message ?? 'Failed to load bookings.')}</p>`;
      root.querySelector('#profile-past-list').innerHTML = '';
      return;
    }

    root.querySelector('#profile-upcoming-loading').classList.add('d-none');
    root.querySelector('#profile-past-loading').classList.add('d-none');
    renderBookingList(root.querySelector('#profile-upcoming-list'), upcoming ?? [], true);
    renderBookingList(root.querySelector('#profile-past-list'), past ?? [], false);
  }

  function renderBookingList(container, bookings, allowCancel) {
    if (!bookings.length) { container.innerHTML = `<p class="text-muted small">${t('profile.noBookings')}</p>`; return; }
    container.innerHTML = bookings.map((b) => `
      <div class="booking-card" data-id="${b.id}">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <div class="fw-semibold">${esc(b.services?.service_name ?? '—')}</div>
            <div class="text-muted small">${fmtDate(b.booking_date)} · ${fmtTime(b.booking_time)} · ${b.services?.service_duration_minutes ?? '?'} min</div>
            ${b.staff_user_id ? `<div class="text-muted small">with stylist assigned</div>` : ''}
          </div>
          <div class="d-flex gap-2 align-items-center flex-shrink-0">
            <span class="badge bg-${STATUS_COLORS[b.status] ?? 'secondary'} status-badge">${b.status}</span>
            <button class="btn btn-xs btn-outline-secondary files-btn" data-id="${b.id}" style="font-size:0.75rem;padding:2px 8px">${t('admin.file.files')}</button>
            ${allowCancel ? `<a href="/booking?modify=${b.id}" data-nav-link class="btn btn-xs btn-outline-secondary" style="font-size:0.75rem;padding:2px 8px">${t('booking.success.reschedule')}</a>
              <button class="btn btn-xs btn-outline-danger cancel-btn" data-id="${b.id}" style="font-size:0.75rem;padding:2px 8px">${t('profile.cancel')}</button>` : ''}
          </div>
        </div>
      </div>`).join('');

    container.querySelectorAll('.files-btn').forEach((btn) => {
      btn.addEventListener('click', () => openBookingFilesModal(btn.dataset.id));
    });

    if (allowCancel) {
      container.querySelectorAll('.cancel-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm(t('profile.cancelConfirm'))) return;
          btn.disabled = true;
          const { error } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', btn.dataset.id)
            .or(ownBookingsFilter);
          if (error) { btn.disabled = false; alert(error.message); return; }
          loadBookings();
        });
      });
    }
  }

  async function openBookingFilesModal(bookingId) {
    filesModalTitle.textContent = `${t('admin.file.files')} — #${bookingId.slice(0, 8)}`;
    filesModalBody.innerHTML = `<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>`;
    filesModalFooter.innerHTML = `<button class="btn btn-secondary" data-bs-dismiss="modal">${t('modal.close')}</button>`;
    filesModal.show();

    try {
      const files = await listFiles(BUCKETS.BOOKINGS, `${user.id}/${bookingId}`);
      if (!files.length) {
        filesModalBody.innerHTML = `<p class="text-muted text-center py-3">${t('admin.file.noFiles')}</p>`;
        return;
      }

      filesModalBody.innerHTML = `<ul class="list-group list-group-flush">
        ${files.map((f) => `
          <li class="list-group-item d-flex justify-content-between align-items-center gap-2 px-0">
            <div class="d-flex align-items-center gap-2 text-truncate">
              ${isImage(f.name) ? `<img src="" data-path="${user.id}/${bookingId}/${f.name}" class="profile-booking-file-thumb rounded">` : '📄'}
              <span class="text-truncate small">${esc(f.name)}</span>
              <small class="text-muted">${formatBytes(f.metadata?.size)}</small>
            </div>
            <button class="btn btn-sm btn-outline-primary" data-file-download="${f.name}">${t('admin.file.download')}</button>
          </li>`).join('')}
      </ul>`;

      filesModalBody.querySelectorAll('[data-path]').forEach(async (img) => {
        try {
          img.src = await getSignedUrl(BUCKETS.BOOKINGS, img.dataset.path, 300);
        } catch {
          // Ignore missing thumbnail URL; file remains downloadable.
        }
      });

      filesModalBody.querySelectorAll('[data-file-download]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const path = `${user.id}/${bookingId}/${btn.dataset.fileDownload}`;
          try {
            const blob = await downloadFile(BUCKETS.BOOKINGS, path);
            triggerDownload(blob, btn.dataset.fileDownload);
          } catch (err) {
            alert(err.message);
          }
        });
      });
    } catch (err) {
      filesModalBody.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
  }

  // ── Favorites ─────────────────────────────────────────────────────────────
  async function loadFavorites() {
    const { data, error } = await supabase.from('favorites')
      .select('id, service_id, product_id, services(service_name, category, price), products(product_name, brand)')
      .eq('user_id', user.id).order('created_at');
    root.querySelector('#profile-favorites-loading').classList.add('d-none');
    if (error || !data?.length) {
      root.querySelector('#profile-favorites-list').innerHTML = `<p class="text-muted small">${t('profile.noFavorites')}</p>`;
      return;
    }
    root.querySelector('#profile-favorites-list').innerHTML = data.map((f) => {
      const label = f.services ? `${esc(f.services.service_name)} <small class="text-muted">· ${esc(f.services.category)} · €${Number(f.services.price).toFixed(2)}</small>`
        : `${esc(f.products?.product_name)} <small class="text-muted">· ${esc(f.products?.brand)}</small>`;
      return `<div class="booking-card d-flex justify-content-between align-items-center">
        <span>${label}</span>
        <button class="btn btn-sm btn-outline-danger fav-remove" data-fav-id="${f.id}"><i class="bi bi-heart-fill"></i></button>
      </div>`;
    }).join('');
    root.querySelectorAll('.fav-remove').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await supabase.from('favorites').delete().eq('id', btn.dataset.favId);
        loadFavorites(); loadBrowsePanel();
      });
    });
  }

  // ── Browse services panel ─────────────────────────────────────────────────
  async function loadBrowsePanel() {
    const { data: favs } = await supabase.from('favorites').select('service_id').eq('user_id', user.id).not('service_id', 'is', null);
    const favIds = new Set((favs ?? []).map((f) => f.service_id));

    const { data: services } = await supabase.from('services').select('id, service_name, category, price').eq('is_active', true).order('category').order('service_name');
    allServices = services ?? [];

    const panel = root.querySelector('#browse-services-list');
    panel.innerHTML = allServices.map((s) => {
      const isFav = favIds.has(s.id);
      return `<div class="booking-card d-flex justify-content-between align-items-center">
        <span class="fw-semibold">${esc(s.service_name)} <small class="text-muted">· ${esc(s.category)} · €${Number(s.price).toFixed(2)}</small></span>
        <button class="btn btn-sm ${isFav ? 'btn-danger fav-remove-s' : 'btn-outline-danger fav-add'}" data-service-id="${s.id}" ${isFav ? 'data-is-fav="1"' : ''}>
          <i class="bi bi-heart${isFav ? '-fill' : ''}"></i>
        </button>
      </div>`;
    }).join('');

    panel.querySelectorAll('.fav-add').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await supabase.from('favorites').insert({ user_id: user.id, service_id: btn.dataset.serviceId });
        loadFavorites(); loadBrowsePanel();
      });
    });
    panel.querySelectorAll('.fav-remove-s').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('service_id', btn.dataset.serviceId);
        loadFavorites(); loadBrowsePanel();
      });
    });
  }

  root.querySelector('#browse-services-btn').addEventListener('click', async () => {
    const panel = root.querySelector('#browse-services-panel');
    if (panel.classList.contains('d-none')) { panel.classList.remove('d-none'); await loadBrowsePanel(); }
    else panel.classList.add('d-none');
  });

  // ── Edit profile ──────────────────────────────────────────────────────────
  root.querySelector('#profile-edit-btn').addEventListener('click', () => {
    root.querySelector('#profile-edit-form').classList.remove('d-none');
    root.querySelector('#profile-edit-btn').classList.add('d-none');
  });
  root.querySelector('#profile-cancel-btn').addEventListener('click', () => {
    root.querySelector('#profile-edit-form').classList.add('d-none');
    root.querySelector('#profile-edit-btn').classList.remove('d-none');
  });
  root.querySelector('#profile-save-btn').addEventListener('click', async () => {
    const saveBtn = root.querySelector('#profile-save-btn');
    const spinner = saveBtn.querySelector('.spinner-border');
    const errEl = root.querySelector('#profile-edit-error');
    const name = root.querySelector('#edit-name').value.trim();
    const phone = root.querySelector('#edit-phone').value.trim();
    const avatarFile = root.querySelector('#edit-avatar').files[0];
    if (!name) { errEl.textContent = t('auth.error.requiredFields'); errEl.classList.remove('d-none'); return; }
    saveBtn.disabled = true; spinner.classList.remove('d-none');
    errEl.classList.add('d-none');
    try {
      const updates = { full_name: name, phone: phone || null, updated_at: new Date().toISOString() };
      if (avatarFile) { const path = avatarPath(user.id, avatarFile.name); await uploadFile(BUCKETS.AVATARS, path, avatarFile); updates.avatar_url = getPublicUrl(BUCKETS.AVATARS, path); }
      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;
      root.querySelector('#profile-edit-success').classList.remove('d-none');
      setTimeout(() => root.querySelector('#profile-edit-success').classList.add('d-none'), 3000);
      await loadProfile();
    } catch (err) { errEl.textContent = err.message; errEl.classList.remove('d-none'); }
    finally { saveBtn.disabled = false; spinner.classList.add('d-none'); }
  });

  // ── Preferences form ─────────────────────────────────────────────────────
  root.querySelector('#prefs-edit-btn').addEventListener('click', () => {
    root.querySelector('#prefs-view').classList.add('d-none');
    root.querySelector('#prefs-form').classList.remove('d-none');
  });
  root.querySelector('#prefs-cancel-btn').addEventListener('click', () => {
    root.querySelector('#prefs-form').classList.add('d-none');
    root.querySelector('#prefs-view').classList.remove('d-none');
  });
  root.querySelector('#prefs-save-btn').addEventListener('click', async () => {
    const saveBtn = root.querySelector('#prefs-save-btn');
    const spinner = saveBtn.querySelector('.spinner-border');
    saveBtn.disabled = true; spinner.classList.remove('d-none');
    const prefStaff = root.querySelector('#pref-staff').value;
    const updates = {
      hair_type: root.querySelector('#pref-hair').value.trim() || null,
      skin_type: root.querySelector('#pref-skin').value.trim() || null,
      allergy_notes: root.querySelector('#pref-allergy').value.trim() || null,
      preferences: prefStaff ? { preferred_staff_id: prefStaff } : {},
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (error) { root.querySelector('#prefs-error').textContent = error.message; root.querySelector('#prefs-error').classList.remove('d-none'); }
    else { root.querySelector('#prefs-form').classList.add('d-none'); root.querySelector('#prefs-view').classList.remove('d-none'); await loadProfile(); }
    saveBtn.disabled = false; spinner.classList.add('d-none');
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  async function init() {
    const { data: staff } = await supabase.rpc('get_staff_list');
    staffList = staff ?? [];
    const sel = root.querySelector('#pref-staff');
    staffList.forEach((s) => { const o = document.createElement('option'); o.value = s.user_id; o.textContent = s.full_name ?? 'Staff'; sel.appendChild(o); });
    await Promise.all([loadProfile(), loadBookings(), loadFavorites()]);
  }
  init();
}
