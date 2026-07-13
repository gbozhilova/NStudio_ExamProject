import template from './booking.html?raw';
import './booking.css';
import { supabase } from '../../services/supabase.js';
import { translateRoot, t } from '../../services/i18n.js';
import { isAuthenticated, getUser } from '../../services/session.js';
import { navigate } from '../../app.js';

// Category icons map (Bootstrap Icons)
const CAT_ICONS = {
  hair: '✂️', nails: '💅', makeup: '💄', skincare: '🧴',
  massage: '💆', eyebrows: '🪮', waxing: '🌸', default: '✨'
};

export function render() {
  return template;
}

export function afterRender({ root }) {
  translateRoot(root);

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    step: 1,
    category: null,
    service: null,
    staff: null,   // null = any available
    date: null,
    time: null,
    staffName: null,
    name: '',
    email: '',
    notes: '',
    modifyBookingId: null,
    originalBooking: null
  };

  // Check if modifying an existing booking
  const urlParams = new URLSearchParams(window.location.search);
  const modifyId = urlParams.get('modify');
  if (modifyId) {
    state.modifyBookingId = modifyId;
    state.step = 4; // skip to timeslot selection for modifications
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const stepEl = root.querySelector('#booking-step');
  const navEl = root.querySelector('#booking-nav');
  const backBtn = root.querySelector('#booking-back');
  const nextBtn = root.querySelector('#booking-next');
  const alertEl = root.querySelector('#booking-alert');
  const summaryBar = root.querySelector('#booking-summary-bar');

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showAlert(msg, type = 'danger') {
    alertEl.textContent = msg;
    alertEl.className = `alert alert-${type}`;
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => alertEl.classList.add('d-none'), 6000);
  }

  function hideAlert() { alertEl.classList.add('d-none'); }

  function setNextLoading(on) {
    nextBtn.disabled = on;
    nextBtn.querySelector('.spinner-border').classList.toggle('d-none', !on);
  }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hr = parseInt(h, 10);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    return `${hr % 12 || 12}:${m} ${ampm}`;
  }

  function fmtDate(d) {
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function updateProgress() {
    root.querySelectorAll('.booking-step-dot').forEach((dot) => {
      const n = parseInt(dot.dataset.step, 10);
      dot.classList.toggle('active', n === state.step);
      dot.classList.toggle('done', n < state.step);
    });
  }

  function updateSummaryBar() {
    const parts = [];
    if (state.category) parts.push(`<span class="summary-item">${escHtml(state.category)}</span>`);
    if (state.service) parts.push(`<span class="summary-item">${escHtml(state.service.service_name)} — €${Number(state.service.price).toFixed(2)}</span>`);
    if (state.staff) parts.push(`<span class="summary-item">${escHtml(state.staffName ?? 'Staff')}</span>`);
    else if (state.service) parts.push(`<span class="summary-item">Any available</span>`);
    if (state.date && state.time) parts.push(`<span class="summary-item">${fmtDate(state.date)} at ${fmtTime(state.time)}</span>`);
    if (parts.length) {
      summaryBar.innerHTML = parts.join('');
      summaryBar.classList.remove('d-none');
    } else {
      summaryBar.classList.add('d-none');
    }
  }

  function showNav(showBack = true, showNext = false) {
    navEl.classList.remove('d-none');
    backBtn.classList.toggle('d-none', !showBack);
    nextBtn.classList.toggle('d-none', !showNext);
  }

  // ── Step router ───────────────────────────────────────────────────────────
  async function goToStep(n) {
    state.step = n;
    updateProgress();
    updateSummaryBar();
    hideAlert();
    stepEl.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>`;
    navEl.classList.add('d-none');

    switch (n) {
      case 1: await renderCategories(); break;
      case 2: await renderServices(); break;
      case 3: await renderStaff(); break;
      case 4: await renderTimeslot(); break;
      case 5: await renderConfirm(); break;
    }
  }

  // ── STEP 1: Categories ────────────────────────────────────────────────────
  async function renderCategories() {
    const { data, error } = await supabase
      .from('services')
      .select('category')
      .eq('is_active', true);

    if (error) { showAlert(error.message); return; }

    const categories = [...new Set(data.map((s) => s.category))].sort();

    stepEl.innerHTML = `
      <h2 class="h4 fw-bold mb-4">${t('booking.step1.heading')}</h2>
      <div class="booking-category-grid">
        ${categories.map((cat) => `
          <div class="booking-category-card ${state.category === cat ? 'selected' : ''}" data-cat="${escHtml(cat)}">
            <span class="cat-icon">${CAT_ICONS[cat.toLowerCase()] ?? CAT_ICONS.default}</span>
            <div class="cat-name">${escHtml(cat)}</div>
          </div>`).join('')}
      </div>`;

    showNav(false, false);

    stepEl.querySelectorAll('.booking-category-card').forEach((card) => {
      card.addEventListener('click', () => {
        state.category = card.dataset.cat;
        state.service = null;
        state.staff = null;
        state.time = null;
        stepEl.querySelectorAll('.booking-category-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        setTimeout(() => goToStep(2), 200);
      });
    });
  }

  // ── STEP 2: Services ──────────────────────────────────────────────────────
  async function renderServices() {
    const { data, error } = await supabase
      .from('services')
      .select('id, service_name, service_description, service_duration_minutes, price')
      .eq('category', state.category)
      .eq('is_active', true)
      .order('service_name');

    if (error) { showAlert(error.message); return; }

    stepEl.innerHTML = `
      <h2 class="h4 fw-bold mb-4">${t('booking.step2.heading')}</h2>
      <div class="d-flex flex-column gap-3">
        ${data.map((s) => `
          <div class="booking-service-card ${state.service?.id === s.id ? 'selected' : ''}" data-id="${s.id}">
            <div class="d-flex justify-content-between align-items-start gap-3">
              <div class="flex-grow-1">
                <div class="fw-semibold">${escHtml(s.service_name)}</div>
                ${s.service_description ? `<div class="text-muted small mt-1">${escHtml(s.service_description)}</div>` : ''}
                <div class="mt-2">
                  <span class="badge bg-light text-dark border me-1"><i class="bi bi-clock me-1"></i>${s.service_duration_minutes} min</span>
                  <span class="badge bg-primary bg-opacity-10 text-primary">€${Number(s.price).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>`).join('')}
      </div>`;

    showNav(true, false);

    stepEl.querySelectorAll('.booking-service-card').forEach((card) => {
      card.addEventListener('click', () => {
        state.service = data.find((s) => s.id === card.dataset.id);
        state.staff = null;
        state.time = null;
        stepEl.querySelectorAll('.booking-service-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        setTimeout(() => goToStep(3), 200);
      });
    });
  }

  // ── STEP 3: Staff ─────────────────────────────────────────────────────────
  async function renderStaff() {
    const { data: staffList, error } = await supabase.rpc('get_staff_list');
    if (error) { showAlert(error.message); return; }

    stepEl.innerHTML = `
      <h2 class="h4 fw-bold mb-4">${t('booking.step3.heading')}</h2>
      <div class="booking-staff-grid">
        <div class="booking-staff-card ${state.staff === null ? 'selected' : ''}" data-id="any">
          <div class="staff-avatar d-flex align-items-center justify-content-center bg-light rounded-circle" style="width:56px;height:56px;font-size:1.5rem">✨</div>
          <div class="fw-semibold mt-2 small">${t('booking.step3.any')}</div>
        </div>
        ${(staffList ?? []).map((s) => `
          <div class="booking-staff-card ${state.staff === s.user_id ? 'selected' : ''}" data-id="${s.user_id}" data-name="${escHtml(s.full_name ?? 'Staff')}">
            ${s.avatar_url
              ? `<img src="${escHtml(s.avatar_url)}" class="staff-avatar">`
              : `<div class="staff-avatar d-flex align-items-center justify-content-center bg-secondary text-white rounded-circle mx-auto" style="width:56px;height:56px;font-size:1.1rem;font-weight:700">${(s.full_name ?? '?')[0].toUpperCase()}</div>`
            }
            <div class="fw-semibold mt-2 small">${escHtml(s.full_name ?? 'Staff')}</div>
          </div>`).join('')}
      </div>`;

    showNav(true, false);

    stepEl.querySelectorAll('.booking-staff-card').forEach((card) => {
      card.addEventListener('click', () => {
        state.staff = card.dataset.id === 'any' ? null : card.dataset.id;
        state.staffName = card.dataset.id === 'any' ? null : card.dataset.name;
        state.time = null;
        stepEl.querySelectorAll('.booking-staff-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        setTimeout(() => goToStep(4), 200);
      });
    });
  }

  // ── STEP 4: Date & Timeslots ──────────────────────────────────────────────
  async function renderTimeslot() {
    const today = new Date().toISOString().split('T')[0];

    if (state.modifyBookingId && !state.originalBooking) {
      // Load existing booking to pre-fill service/staff
      const { data: bk, error } = await supabase
        .from('bookings')
        .select('*, services(service_name, service_duration_minutes, price, category)')
        .eq('id', state.modifyBookingId)
        .single();
      if (error || !bk) { showAlert(t('booking.error.notFound')); return; }
      state.originalBooking = bk;
      state.service = { id: bk.service_id, ...bk.services };
      state.category = bk.services?.category;
      state.staff = bk.staff_user_id;
      state.date = bk.booking_date;
    }

    stepEl.innerHTML = `
      <h2 class="h4 fw-bold mb-4">${t('booking.step4.heading')}</h2>
      <div class="mb-4">
        <label class="form-label fw-semibold">${t('booking.step4.selectDate')}</label>
        <input id="booking-date" type="date" class="form-control" style="max-width:220px"
          min="${today}" value="${state.date ?? today}" />
      </div>
      <div id="slots-container">
        <div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>
      </div>`;

    showNav(state.modifyBookingId ? false : true, false);

    const dateInput = stepEl.querySelector('#booking-date');

    async function loadSlots(date) {
      const slotsEl = stepEl.querySelector('#slots-container');
      slotsEl.innerHTML = `<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;

      const { data: slots, error } = await supabase.rpc('get_available_slots', {
        p_date: date,
        p_service_id: state.service.id,
        p_staff_user_id: state.staff ?? null
      });

      if (error) { slotsEl.innerHTML = `<div class="alert alert-danger">${escHtml(error.message)}</div>`; return; }

      const uniqueTimes = [...new Map((slots ?? []).map((s) => [s.slot_time, s])).values()];

      if (!uniqueTimes.length) {
        slotsEl.innerHTML = `<div class="alert alert-warning">${t('booking.step4.noSlots')}</div>`;
        return;
      }

      slotsEl.innerHTML = `
        <label class="form-label fw-semibold">${t('booking.step4.selectTime')}</label>
        <div class="booking-slot-grid">
          ${uniqueTimes.map((s) => `
            <button type="button" class="booking-slot-btn ${state.time === s.slot_time ? 'selected' : ''}"
              data-time="${s.slot_time}" data-staff="${s.staff_id ?? ''}" data-staff-name="${escHtml(s.staff_name ?? '')}">
              ${fmtTime(s.slot_time)}
            </button>`).join('')}
        </div>`;

      slotsEl.querySelectorAll('.booking-slot-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.time = btn.dataset.time;
          if (!state.staff && btn.dataset.staff) {
            state.staff = btn.dataset.staff;
            state.staffName = btn.dataset.staffName;
          }
          slotsEl.querySelectorAll('.booking-slot-btn').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          nextBtn.classList.remove('d-none');
          showNav(state.modifyBookingId ? false : true, true);
          updateSummaryBar();
        });
      });
    }

    await loadSlots(state.date ?? today);
    state.date = state.date ?? today;

    dateInput.addEventListener('change', async () => {
      state.date = dateInput.value;
      state.time = null;
      nextBtn.classList.add('d-none');
      updateSummaryBar();
      await loadSlots(state.date);
    });
  }

  // ── STEP 5: Confirm ───────────────────────────────────────────────────────
  async function renderConfirm() {
    const user = getUser();
    const isModify = !!state.modifyBookingId;

    if (user && !state.name) {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      state.name = prof?.full_name ?? '';
      state.email = user.email ?? '';
    }

    stepEl.innerHTML = `
      <h2 class="h4 fw-bold mb-4">${isModify ? t('booking.confirm.modifyHeading') : t('booking.confirm.heading')}</h2>

      <div class="booking-confirm-card mb-4">
        <div class="row g-2">
          <div class="col-6"><div class="text-muted small">${t('booking.confirm.service')}</div><div class="fw-semibold">${escHtml(state.service?.service_name ?? '')}</div></div>
          <div class="col-6"><div class="text-muted small">${t('booking.confirm.category')}</div><div class="fw-semibold">${escHtml(state.category ?? '')}</div></div>
          <div class="col-6"><div class="text-muted small">${t('booking.confirm.staff')}</div><div class="fw-semibold">${escHtml(state.staffName ?? t('booking.step3.any'))}</div></div>
          <div class="col-6"><div class="text-muted small">${t('booking.confirm.duration')}</div><div class="fw-semibold">${state.service?.service_duration_minutes ?? '—'} min</div></div>
          <div class="col-6"><div class="text-muted small">${t('booking.confirm.date')}</div><div class="fw-semibold">${fmtDate(state.date)}</div></div>
          <div class="col-6"><div class="text-muted small">${t('booking.confirm.time')}</div><div class="fw-semibold">${fmtTime(state.time)}</div></div>
          <div class="col-6"><div class="text-muted small">${t('booking.confirm.price')}</div><div class="fw-semibold text-primary">€${Number(state.service?.price ?? 0).toFixed(2)}</div></div>
        </div>
      </div>

      <div id="confirm-form">
        ${!user ? `
          <div class="mb-3">
            <label class="form-label fw-semibold">${t('booking.confirm.yourName')}</label>
            <input id="conf-name" type="text" class="form-control" value="${escHtml(state.name)}" placeholder="${t('booking.confirm.namePlaceholder')}" />
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">${t('booking.confirm.yourEmail')}</label>
            <input id="conf-email" type="email" class="form-control" value="${escHtml(state.email)}" placeholder="you@example.com" />
            <div class="form-text">${t('booking.confirm.emailHint')}</div>
          </div>` : `
          <div class="mb-3">
            <label class="form-label fw-semibold">${t('booking.confirm.yourName')}</label>
            <div class="form-control bg-light">${escHtml(state.name || user?.email || '')}</div>
          </div>`}
        <div class="mb-3">
          <label class="form-label">${t('booking.confirm.notes')}</label>
          <textarea id="conf-notes" class="form-control" rows="2" placeholder="${t('booking.confirm.notesPlaceholder')}">${escHtml(state.notes)}</textarea>
        </div>
      </div>

      <button id="booking-submit" class="btn btn-success w-100 mt-2">
        <span class="btn-label">${isModify ? t('booking.confirm.submitModify') : t('booking.confirm.submit')}</span>
        <span class="spinner-border spinner-border-sm d-none ms-2"></span>
      </button>`;

    showNav(true, false);

    const submitBtn = stepEl.querySelector('#booking-submit');
    submitBtn.addEventListener('click', () => isModify ? submitModifyBooking() : submitBooking());
  }

  // ── Submit (new booking) ──────────────────────────────────────────────────
  async function submitBooking() {
    const user = getUser();
    const nameInput = stepEl.querySelector('#conf-name');
    const emailInput = stepEl.querySelector('#conf-email');
    const notesInput = stepEl.querySelector('#conf-notes');
    const submitBtn = stepEl.querySelector('#booking-submit');
    const spinner = submitBtn.querySelector('.spinner-border');

    if (!user) {
      state.name = nameInput?.value.trim() ?? '';
      state.email = emailInput?.value.trim() ?? '';
      if (!state.name || !state.email) { showAlert(t('auth.error.requiredFields')); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) { showAlert(t('booking.error.invalidEmail')); return; }
    }

    state.notes = notesInput?.value.trim() ?? '';
    submitBtn.disabled = true;
    spinner.classList.remove('d-none');
    hideAlert();

    try {
      if (user) {
        // Logged-in direct insert
        const { data, error } = await supabase.from('bookings').insert({
          user_id: user.id,
          customer_display_name: state.name || user.email,
          customer_email: state.email || user.email,
          service_id: state.service.id,
          staff_user_id: state.staff ?? null,
          booking_date: state.date,
          booking_time: state.time,
          notes: state.notes || null,
          status: 'pending'
        }).select('id').single();
        if (error) throw error;

        // Notify via edge function
        await supabase.functions.invoke('book-guest', {
          body: {
            email: state.email || user.email,
            fullName: state.name,
            serviceId: state.service.id,
            staffUserId: state.staff,
            bookingDate: state.date,
            bookingTime: state.time,
            notes: state.notes,
            skipCreate: true  // booking already created, just send email
          }
        });

        showSuccess(data.id);
      } else {
        // Guest — edge function creates user + booking + sends email
        const { data, error } = await supabase.functions.invoke('book-guest', {
          body: {
            email: state.email,
            fullName: state.name,
            serviceId: state.service.id,
            staffUserId: state.staff,
            bookingDate: state.date,
            bookingTime: state.time,
            notes: state.notes
          }
        });
        if (error || data?.error) throw new Error(data?.error ?? error.message);
        showSuccess(data.bookingId, true);
      }
    } catch (err) {
      showAlert(err.message ?? t('error.generic'));
      submitBtn.disabled = false;
      spinner.classList.add('d-none');
    }
  }

  // ── Submit (modify booking) ───────────────────────────────────────────────
  async function submitModifyBooking() {
    const user = getUser();
    const notesInput = stepEl.querySelector('#conf-notes');
    const submitBtn = stepEl.querySelector('#booking-submit');
    const spinner = submitBtn.querySelector('.spinner-border');

    state.notes = notesInput?.value.trim() ?? '';
    submitBtn.disabled = true;
    spinner.classList.remove('d-none');
    hideAlert();

    try {
      // Check the new slot is still available
      const { data: slots } = await supabase.rpc('get_available_slots', {
        p_date: state.date,
        p_service_id: state.service.id,
        p_staff_user_id: state.staff ?? null
      });
      const slotAvailable = (slots ?? []).some((s) => s.slot_time === state.time);
      if (!slotAvailable) throw new Error(t('booking.error.slotTaken'));

      if (user) {
        const { error } = await supabase.from('bookings').update({
          service_id: state.service.id,
          staff_user_id: state.staff ?? null,
          booking_date: state.date,
          booking_time: state.time,
          notes: state.notes || null,
          status: 'pending',
          updated_at: new Date().toISOString()
        }).eq('id', state.modifyBookingId);
        if (error) throw error;

        // Send update email
        await supabase.functions.invoke('book-guest', {
          body: {
            email: state.email || user.email,
            fullName: state.name,
            serviceId: state.service.id,
            staffUserId: state.staff,
            bookingDate: state.date,
            bookingTime: state.time,
            notes: state.notes,
            modifyBookingId: state.modifyBookingId,
            skipCreate: true
          }
        });
        showSuccess(state.modifyBookingId, false, true);
      } else {
        const { data, error } = await supabase.functions.invoke('book-guest', {
          body: {
            email: state.email,
            fullName: state.name,
            serviceId: state.service.id,
            staffUserId: state.staff,
            bookingDate: state.date,
            bookingTime: state.time,
            notes: state.notes,
            modifyBookingId: state.modifyBookingId
          }
        });
        if (error || data?.error) throw new Error(data?.error ?? error.message);
        showSuccess(data.bookingId, false, true);
      }
    } catch (err) {
      showAlert(err.message ?? t('error.generic'));
      submitBtn.disabled = false;
      spinner.classList.add('d-none');
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  function showSuccess(bookingId, isNewAccount = false, isModification = false) {
    navEl.classList.add('d-none');
    summaryBar.classList.add('d-none');
    root.querySelector('.booking-progress').classList.add('d-none');

    const modifyUrl = `/booking?modify=${bookingId}`;
    stepEl.innerHTML = `
      <div class="text-center py-5">
        <div class="display-1 mb-3">${isModification ? '🔄' : '✅'}</div>
        <h2 class="h3 fw-bold mb-2">
          ${isModification ? t('booking.success.modifiedTitle') : t('booking.success.title')}
        </h2>
        <p class="text-muted mb-4">
          ${isModification ? t('booking.success.modifiedBody') : t('booking.success.body')}
        </p>
        ${isNewAccount ? `<div class="alert alert-info mb-4">${t('booking.success.accountCreated')}</div>` : ''}
        <div class="booking-confirm-card mb-4 text-start mx-auto" style="max-width:380px">
          <div class="row g-2">
            <div class="col-6"><div class="text-muted small">${t('booking.confirm.service')}</div><div class="fw-semibold">${escHtml(state.service?.service_name ?? '')}</div></div>
            <div class="col-6"><div class="text-muted small">${t('booking.confirm.staff')}</div><div class="fw-semibold">${escHtml(state.staffName ?? t('booking.step3.any'))}</div></div>
            <div class="col-6"><div class="text-muted small">${t('booking.confirm.date')}</div><div class="fw-semibold">${fmtDate(state.date)}</div></div>
            <div class="col-6"><div class="text-muted small">${t('booking.confirm.time')}</div><div class="fw-semibold">${fmtTime(state.time)}</div></div>
          </div>
        </div>
        <div class="d-flex gap-2 justify-content-center flex-wrap">
          <a href="${modifyUrl}" data-nav-link class="btn btn-outline-secondary">${t('booking.success.reschedule')}</a>
          <a href="/" data-nav-link class="btn btn-primary">${t('booking.success.home')}</a>
        </div>
      </div>`;
  }

  // ── Navigation bindings ───────────────────────────────────────────────────
  backBtn.addEventListener('click', () => {
    if (state.step > 1) goToStep(state.step - 1);
  });

  nextBtn.addEventListener('click', () => {
    if (state.step < 5) goToStep(state.step + 1);
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  goToStep(state.step);
}
