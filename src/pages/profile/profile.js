import template from './profile.html?raw';
import './profile.css';
import { supabase } from '../../services/supabase.js';
import { getUser, isAuthenticated } from '../../services/session.js';
import { translateRoot, t } from '../../services/i18n.js';
import { navigate } from '../../app.js';
import { uploadFile, avatarPath, getPublicUrl, BUCKETS } from '../../services/storage.js';

export function render() { return template; }

export function afterRender({ root }) {
  translateRoot(root);

  if (!isAuthenticated()) {
    navigate('/login', { replace: true });
    return;
  }

  const user = getUser();
  const STATUS_COLORS = { pending: 'warning text-dark', confirmed: 'success', completed: 'primary', cancelled: 'secondary' };

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmtDate(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'; }
  function fmtTime(t) { const [h, m] = String(t).split(':').map(Number); return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`; }

  // ── Load profile ────────────────────────────────────────────────────────
  async function loadProfile() {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) return;

    const avatarWrap = root.querySelector('#profile-avatar-wrap');
    if (profile.avatar_url) {
      avatarWrap.innerHTML = `<img src="${esc(profile.avatar_url)}" alt="Avatar" />`;
    } else {
      const letter = (profile.full_name ?? user.email ?? '?')[0].toUpperCase();
      avatarWrap.innerHTML = `<div class="avatar-placeholder">${esc(letter)}</div>`;
    }

    root.querySelector('#profile-name').textContent = profile.full_name ?? user.email ?? '';
    root.querySelector('#profile-email').textContent = user.email ?? '';

    // Pre-fill edit form
    root.querySelector('#edit-name').value = profile.full_name ?? '';
    root.querySelector('#edit-phone').value = profile.phone ?? '';
  }

  // ── Load bookings ────────────────────────────────────────────────────────
  async function loadBookings() {
    const today = new Date().toISOString().split('T')[0];

    const { data: upcoming, error: e1 } = await supabase
      .from('bookings')
      .select('id, booking_date, booking_time, status, notes, services(service_name, service_duration_minutes), profiles!bookings_staff_user_id_fkey(full_name)')
      .eq('user_id', user.id)
      .gte('booking_date', today)
      .neq('status', 'cancelled')
      .order('booking_date').order('booking_time');

    const { data: past, error: e2 } = await supabase
      .from('bookings')
      .select('id, booking_date, booking_time, status, services(service_name, service_duration_minutes)')
      .eq('user_id', user.id)
      .or(`booking_date.lt.${today},status.eq.cancelled`)
      .order('booking_date', { ascending: false })
      .limit(20);

    root.querySelector('#profile-upcoming-loading').classList.add('d-none');
    root.querySelector('#profile-past-loading').classList.add('d-none');

    renderBookingList(root.querySelector('#profile-upcoming-list'), upcoming ?? [], true);
    renderBookingList(root.querySelector('#profile-past-list'), past ?? [], false);
  }

  function renderBookingList(container, bookings, allowCancel) {
    if (!bookings.length) {
      container.innerHTML = `<p class="text-muted small">${t('profile.noBookings')}</p>`;
      return;
    }

    container.innerHTML = bookings.map((b) => `
      <div class="booking-card" data-id="${b.id}">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <div class="fw-semibold">${esc(b.services?.service_name ?? '—')}</div>
            <div class="text-muted small">${fmtDate(b.booking_date)} · ${fmtTime(b.booking_time)} · ${b.services?.service_duration_minutes ?? '?'} min</div>
            ${b.profiles?.full_name ? `<div class="text-muted small">with ${esc(b.profiles.full_name)}</div>` : ''}
          </div>
          <div class="d-flex gap-2 align-items-center flex-shrink-0">
            <span class="badge bg-${STATUS_COLORS[b.status] ?? 'secondary'} status-badge">${b.status}</span>
            ${allowCancel ? `<a href="/booking?modify=${b.id}" data-nav-link class="btn btn-xs btn-outline-secondary" style="font-size:0.75rem;padding:2px 8px">${t('booking.success.reschedule')}</a>
              <button class="btn btn-xs btn-outline-danger cancel-btn" data-id="${b.id}" style="font-size:0.75rem;padding:2px 8px">${t('profile.cancel')}</button>` : ''}
          </div>
        </div>
      </div>`).join('');

    if (allowCancel) {
      container.querySelectorAll('.cancel-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm(t('profile.cancelConfirm'))) return;
          btn.disabled = true;
          const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', btn.dataset.id).eq('user_id', user.id);
          if (error) { btn.disabled = false; alert(error.message); return; }
          loadBookings();
        });
      });
    }
  }

  // ── Edit profile ─────────────────────────────────────────────────────────
  const editBtn = root.querySelector('#profile-edit-btn');
  const editForm = root.querySelector('#profile-edit-form');
  const cancelBtn = root.querySelector('#profile-cancel-btn');
  const saveBtn = root.querySelector('#profile-save-btn');
  const spinner = saveBtn.querySelector('.spinner-border');
  const errEl = root.querySelector('#profile-edit-error');
  const successEl = root.querySelector('#profile-edit-success');

  editBtn.addEventListener('click', () => {
    editForm.classList.remove('d-none');
    editBtn.classList.add('d-none');
  });

  cancelBtn.addEventListener('click', () => {
    editForm.classList.add('d-none');
    editBtn.classList.remove('d-none');
    errEl.classList.add('d-none');
    successEl.classList.add('d-none');
  });

  saveBtn.addEventListener('click', async () => {
    const name = root.querySelector('#edit-name').value.trim();
    const phone = root.querySelector('#edit-phone').value.trim();
    const avatarFile = root.querySelector('#edit-avatar').files[0];

    if (!name) { errEl.textContent = t('auth.error.requiredFields'); errEl.classList.remove('d-none'); return; }

    saveBtn.disabled = true; spinner.classList.remove('d-none');
    errEl.classList.add('d-none'); successEl.classList.add('d-none');

    try {
      let avatarUrl = undefined;
      if (avatarFile) {
        const path = avatarPath(user.id, avatarFile.name);
        await uploadFile(BUCKETS.AVATARS, path, avatarFile);
        avatarUrl = getPublicUrl(BUCKETS.AVATARS, path);
      }

      const updates = { full_name: name, phone: phone || null, updated_at: new Date().toISOString() };
      if (avatarUrl) updates.avatar_url = avatarUrl;

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;

      successEl.classList.remove('d-none');
      setTimeout(() => successEl.classList.add('d-none'), 3000);
      await loadProfile();
    } catch (err) {
      errEl.textContent = err.message; errEl.classList.remove('d-none');
    } finally {
      saveBtn.disabled = false; spinner.classList.add('d-none');
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  Promise.all([loadProfile(), loadBookings()]);
}
