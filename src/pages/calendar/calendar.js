import template from './calendar.html?raw';
import './calendar.css';
import { Modal } from 'bootstrap';
import { supabase } from '../../services/supabase.js';
import { translateRoot, t } from '../../services/i18n.js';
import { getUser } from '../../services/session.js';

const HOUR_START = 9;
const HOUR_END = 19;
const SLOT_MIN = 30;
const SLOT_H = 50; // px per slot (30 min)
const TOTAL_SLOTS = ((HOUR_END - HOUR_START) * 60) / SLOT_MIN;
const STATUS_COLORS = { pending: 'status-pending', confirmed: 'status-confirmed', completed: 'status-completed', cancelled: 'status-cancelled' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function render() { return template; }

export function afterRender({ root }) {
  translateRoot(root);

  // ── State ─────────────────────────────────────────────────────────────
  const state = {
    view: 'day',
    anchor: new Date(),   // current viewed date
    filters: { category: '', serviceId: '', staffId: '', customer: '' }
  };

  // ── Cached data ────────────────────────────────────────────────────────
  let staffList = [];
  let serviceList = [];

  // ── DOM refs ───────────────────────────────────────────────────────────
  const gridWrap = root.querySelector('#cal-grid-wrap');
  const rangeLabel = root.querySelector('#cal-range-label');
  const alertEl = root.querySelector('#cal-alert');
  const modalEl = root.querySelector('#cal-modal');
  const modalTitle = root.querySelector('#cal-modal-title');
  const modalBody = root.querySelector('#cal-modal-body');
  const modalFooter = root.querySelector('#cal-modal-footer');
  const bsModal = new Modal(modalEl);

  const catFilter = root.querySelector('#cal-filter-category');
  const svcFilter = root.querySelector('#cal-filter-service');
  const staffFilter = root.querySelector('#cal-filter-staff');
  const custFilter = root.querySelector('#cal-filter-customer');

  // ── Helpers ────────────────────────────────────────────────────────────
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function showAlert(msg, type = 'danger') {
    alertEl.textContent = msg; alertEl.className = `alert alert-${type}`;
    setTimeout(() => alertEl.classList.add('d-none'), 5000);
  }

  function isoDate(d) { return d.toISOString().split('T')[0]; }

  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

  function fmtDate(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function timeToMinutes(t) {
    const [h, m] = String(t).split(':').map(Number); return h * 60 + m;
  }

  function minutesToTop(mins) {
    return ((mins - HOUR_START * 60) / SLOT_MIN) * SLOT_H;
  }

  function durationToHeight(mins) { return (mins / SLOT_MIN) * SLOT_H; }

  function fmtTime(t) {
    const [h, m] = String(t).split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  function gridHeight() { return TOTAL_SLOTS * SLOT_H; }

  // ── Date range for each view ─────────────────────────────────────────
  function getDateRange() {
    const a = state.anchor;
    if (state.view === 'day') return [a, a];
    if (state.view === '3day') return [a, addDays(a, 2)];
    if (state.view === 'week') {
      const dow = a.getDay();
      const mon = addDays(a, -((dow + 6) % 7));
      return [mon, addDays(mon, 6)];
    }
    if (state.view === 'month') {
      const start = new Date(a.getFullYear(), a.getMonth(), 1);
      const end = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      return [start, end];
    }
    return [a, a];
  }

  function updateRangeLabel() {
    const [s, e] = getDateRange();
    if (state.view === 'month') {
      rangeLabel.textContent = state.anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } else if (isoDate(s) === isoDate(e)) {
      rangeLabel.textContent = fmtDate(s);
    } else {
      rangeLabel.textContent = `${fmtDate(s)} – ${fmtDate(e)}`;
    }
  }

  function navigate(delta) {
    const steps = { day: 1, '3day': 3, week: 7, month: 0 };
    if (state.view === 'month') {
      state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + delta, 1);
    } else {
      state.anchor = addDays(state.anchor, delta * steps[state.view]);
    }
    refresh();
  }

  // ── Data fetching ──────────────────────────────────────────────────────
  async function fetchData(startDate, endDate) {
    const [bookings, blocks] = await Promise.all([fetchBookings(startDate, endDate), fetchBlocks(startDate, endDate)]);
    return { bookings, blocks };
  }

  async function fetchBookings(startDate, endDate) {
    let q = supabase.from('bookings')
      .select('id, customer_display_name, customer_email, booking_date, booking_time, status, staff_user_id, notes, service_id, services(service_name, service_duration_minutes, category)')
      .gte('booking_date', isoDate(startDate))
      .lte('booking_date', isoDate(endDate))
      .order('booking_date').order('booking_time');

    if (state.filters.serviceId) q = q.eq('service_id', state.filters.serviceId);
    if (state.filters.staffId) q = q.eq('staff_user_id', state.filters.staffId);
    if (state.filters.customer) q = q.ilike('customer_display_name', `%${state.filters.customer}%`);
    if (state.filters.category) q = q.eq('services.category', state.filters.category);

    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  }

  async function fetchBlocks(startDate, endDate) {
    const { data, error } = await supabase.from('booking_blocks')
      .select('id, starts_at, ends_at, reason, staff_user_id, created_by')
      .lt('starts_at', `${isoDate(endDate)}T23:59:59`)
      .gt('ends_at', `${isoDate(startDate)}T00:00:00`);
    if (error) throw error;
    return data ?? [];
  }

  // ── Render dispatcher ─────────────────────────────────────────────────
  async function refresh() {
    updateRangeLabel();
    gridWrap.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>`;
    try {
      const [s, e] = getDateRange();
      const { bookings, blocks } = await fetchData(s, e);
      if (state.view === 'month') renderMonth(bookings, blocks);
      else renderTimeGrid(bookings, blocks);
    } catch (err) {
      showAlert(err.message);
      gridWrap.innerHTML = '';
    }
  }

  // ── Time grid (day / 3-day / week) ────────────────────────────────────
  function renderTimeGrid(bookings, blocks) {
    const [start] = getDateRange();
    const days = state.view === 'day' ? 1 : state.view === '3day' ? 3 : 7;

    // For day view: columns = staff. For multi-day: columns = dates.
    let cols;
    if (state.view === 'day') {
      const activeStaff = state.filters.staffId
        ? staffList.filter((s) => s.user_id === state.filters.staffId)
        : staffList;
      cols = activeStaff.length ? activeStaff.map((s) => ({ type: 'staff', id: s.user_id, label: s.full_name ?? 'Staff' }))
        : [{ type: 'staff', id: null, label: 'All Staff' }];
    } else {
      cols = Array.from({ length: days }, (_, i) => {
        const d = addDays(start, i);
        return { type: 'date', id: isoDate(d), label: fmtDate(d), date: d };
      });
    }

    const colCount = cols.length;
    // Build grid template
    const gridStyle = `grid-template-columns: 56px repeat(${colCount}, 1fr); grid-template-rows: 40px repeat(${TOTAL_SLOTS}, ${SLOT_H}px);`;

    let html = `<div class="cal-time-grid" style="${gridStyle}">`;

    // Header row
    html += `<div class="cal-col-header time-col-header" style="grid-row:1;grid-column:1"></div>`;
    cols.forEach((col, i) => {
      html += `<div class="cal-col-header" style="grid-row:1;grid-column:${i + 2}">${esc(col.label)}</div>`;
    });

    // Time slots (background grid + labels)
    for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
      const totalMin = HOUR_START * 60 + slot * SLOT_MIN;
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      const isHour = m === 0;
      const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
      const row = slot + 2;
      const label = isHour ? `${fmtTime(timeStr)}` : '';

      html += `<div class="cal-time-label ${isHour ? 'hour-label' : ''}" style="grid-row:${row};grid-column:1">${esc(label)}</div>`;

      cols.forEach((col, i) => {
        html += `<div class="cal-slot-cell ${isHour ? 'hour-boundary' : ''}" style="grid-row:${row};grid-column:${i+2}"
          data-slot="${timeStr}" data-col="${col.id ?? ''}" data-col-type="${col.type}"></div>`;
      });
    }

    html += `</div>`;
    gridWrap.innerHTML = html;
    const gridEl = gridWrap.querySelector('.cal-time-grid');

    // Render events as absolute-positioned elements inside each column cell
    cols.forEach((col, colIdx) => {
      const colBookings = bookings.filter((b) => {
        if (col.type === 'staff') return col.id === null || b.staff_user_id === col.id;
        return b.booking_date === col.id;
      });

      const colBlocks = blocks.filter((bl) => {
        const blDate = bl.starts_at.split('T')[0];
        if (col.type === 'staff') return bl.staff_user_id === col.id || bl.staff_user_id === null;
        return blDate === col.id;
      });

      // Render bookings
      colBookings.forEach((b) => {
        const startMins = timeToMinutes(b.booking_time);
        const dur = b.services?.service_duration_minutes ?? 30;
        const top = minutesToTop(startMins);
        const height = Math.max(durationToHeight(dur), SLOT_H);
        const slotRow = Math.floor((startMins - HOUR_START * 60) / SLOT_MIN) + 2;

        const el = document.createElement('div');
        el.className = `cal-event ${STATUS_COLORS[b.status] ?? ''}`;
        el.style.cssText = `top:${top - (slotRow - 2) * SLOT_H + 2}px;height:${height - 4}px;`;
        el.innerHTML = `<div class="event-name">${esc(b.customer_display_name)}</div><div class="event-meta">${esc(b.services?.service_name ?? '')} · ${fmtTime(b.booking_time)}</div>`;
        el.addEventListener('click', (e) => { e.stopPropagation(); openBookingModal(b); });

        // Attach to the slot cell
        const targetRow = slotRow;
        const targetCol = colIdx + 2;
        const cellSelector = `[style*="grid-row:${targetRow}"][style*="grid-column:${targetCol + 1}"]`;
        // Use simpler approach: find by data attrs
        const cells = gridEl.querySelectorAll(`[data-col="${col.id ?? ''}"][data-col-type="${col.type}"]`);
        const matchCell = Array.from(cells).find((c) => {
          const slot = c.dataset.slot;
          const slotMins = timeToMinutes(slot);
          return slotMins === startMins;
        });
        if (matchCell) {
          el.style.top = '2px';
          el.style.position = 'absolute';
          matchCell.appendChild(el);
        }
      });

      // Render blocks
      colBlocks.forEach((bl) => {
        const blStart = new Date(bl.starts_at);
        const blEnd = new Date(bl.ends_at);
        const startMins = blStart.getHours() * 60 + blStart.getMinutes();
        const endMins = blEnd.getHours() * 60 + blEnd.getMinutes();
        const dur = endMins - startMins;
        if (dur <= 0) return;

        const matchCell = Array.from(gridEl.querySelectorAll(`[data-col="${col.id ?? ''}"]`)).find((c) => {
          const slotMins = timeToMinutes(c.dataset.slot);
          return slotMins === startMins - (startMins % SLOT_MIN);
        });

        if (matchCell) {
          const el = document.createElement('div');
          el.className = 'cal-event is-block';
          const height = Math.max(durationToHeight(dur) - 4, SLOT_H - 4);
          el.style.cssText = `position:absolute;top:2px;height:${height}px;left:3px;right:3px;`;
          el.innerHTML = `<div class="event-name">🚫 ${esc(bl.reason ?? 'Blocked')}</div><div class="event-meta">${fmtTime(bl.starts_at.split('T')[1])} – ${fmtTime(bl.ends_at.split('T')[1])}</div>`;
          el.addEventListener('click', (e) => { e.stopPropagation(); openBlockModal(bl); });
          matchCell.appendChild(el);
        }
      });
    });

    // Click empty slot → add block
    gridEl.querySelectorAll('.cal-slot-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        const slotTime = cell.dataset.slot;
        const colId = cell.dataset.col;
        const colType = cell.dataset.colType;
        openAddBlockModal(isoDate(state.anchor), slotTime, colType === 'staff' ? colId : null);
      });
    });
  }

  // ── Month grid ────────────────────────────────────────────────────────
  function renderMonth(bookings, blocks) {
    const year = state.anchor.getFullYear();
    const month = state.anchor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Mon = 0
    const todayStr = isoDate(new Date());

    // Group bookings by date
    const byDate = {};
    bookings.forEach((b) => {
      if (!byDate[b.booking_date]) byDate[b.booking_date] = [];
      byDate[b.booking_date].push(b);
    });

    let html = `<div class="cal-month-grid">`;
    DOW.slice(1).concat(DOW[0]).forEach((d) => {
      html += `<div class="cal-month-dow">${d}</div>`;
    });

    // Pad start
    for (let i = 0; i < startDow; i++) {
      html += `<div class="cal-month-cell other-month"></div>`;
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;
      const dayBookings = byDate[dateStr] ?? [];
      const visible = dayBookings.slice(0, 3);
      const more = dayBookings.length - 3;

      html += `<div class="cal-month-cell ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
        <div class="cal-day-num">${day}</div>
        ${visible.map((b) => `
          <div class="cal-month-event ${STATUS_COLORS[b.status]}" data-booking-id="${b.id}" title="${esc(b.customer_display_name)}">
            ${fmtTime(b.booking_time)} ${esc(b.customer_display_name)}
          </div>`).join('')}
        ${more > 0 ? `<div class="cal-month-more">+${more} more</div>` : ''}
      </div>`;
    }

    // Pad end
    const endDow = (lastDay.getDay() + 6) % 7;
    for (let i = endDow + 1; i < 7; i++) {
      html += `<div class="cal-month-cell other-month"></div>`;
    }

    html += `</div>`;
    gridWrap.innerHTML = html;

    // Click day → switch to day view
    gridWrap.querySelectorAll('.cal-month-cell[data-date]').forEach((cell) => {
      cell.addEventListener('click', (e) => {
        if (e.target.dataset.bookingId) return; // handled separately
        state.anchor = new Date(cell.dataset.date + 'T12:00:00');
        state.view = 'day';
        updateViewButtons();
        refresh();
      });
    });

    // Click booking in month → open detail
    gridWrap.querySelectorAll('[data-booking-id]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.bookingId;
        const b = bookings.find((x) => x.id === id);
        if (b) openBookingModal(b);
      });
    });
  }

  // ── Booking detail modal ──────────────────────────────────────────────
  async function openBookingModal(booking) {
    // Fetch fresh copy with full details
    const { data: b } = await supabase.from('bookings')
      .select('*, services(service_name, service_duration_minutes, category, price)')
      .eq('id', booking.id).single();
    if (!b) return;

    const staff = staffList.find((s) => s.user_id === b.staff_user_id);

    modalTitle.textContent = b.customer_display_name;
    modalBody.innerHTML = `
      <div id="bm-error" class="alert alert-danger d-none"></div>
      <dl class="row mb-3">
        <dt class="col-4">Service</dt><dd class="col-8">${esc(b.services?.service_name ?? '—')}</dd>
        <dt class="col-4">Category</dt><dd class="col-8">${esc(b.services?.category ?? '—')}</dd>
        <dt class="col-4">Staff</dt><dd class="col-8">${esc(staff?.full_name ?? '—')}</dd>
        <dt class="col-4">Date</dt><dd class="col-8">${b.booking_date}</dd>
        <dt class="col-4">Time</dt><dd class="col-8">${fmtTime(b.booking_time)}</dd>
        <dt class="col-4">Duration</dt><dd class="col-8">${b.services?.service_duration_minutes ?? '?'} min</dd>
        <dt class="col-4">Price</dt><dd class="col-8">€${Number(b.services?.price ?? 0).toFixed(2)}</dd>
        ${b.customer_email ? `<dt class="col-4">Email</dt><dd class="col-8">${esc(b.customer_email)}</dd>` : ''}
        ${b.notes ? `<dt class="col-4">Notes</dt><dd class="col-8">${esc(b.notes)}</dd>` : ''}
      </dl>
      <div class="mb-0">
        <label class="form-label fw-semibold">Status</label>
        <select id="bm-status" class="form-select">
          ${['pending','confirmed','completed','cancelled'].map((s) =>
            `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>`;

    modalFooter.innerHTML = `
      <a href="/booking?modify=${b.id}" data-nav-link class="btn btn-sm btn-outline-secondary me-auto">✏️ Reschedule</a>
      <button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      <button id="bm-save" class="btn btn-primary">
        <span>Save Status</span><span class="spinner-border spinner-border-sm d-none ms-2"></span>
      </button>`;

    modalFooter.querySelector('#bm-save').addEventListener('click', async () => {
      const saveBtn = modalFooter.querySelector('#bm-save');
      const spinner = saveBtn.querySelector('.spinner-border');
      const newStatus = modalBody.querySelector('#bm-status').value;
      saveBtn.disabled = true; spinner.classList.remove('d-none');
      const { error } = await supabase.from('bookings').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', b.id);
      if (error) {
        modalBody.querySelector('#bm-error').textContent = error.message;
        modalBody.querySelector('#bm-error').classList.remove('d-none');
        saveBtn.disabled = false; spinner.classList.add('d-none');
      } else {
        bsModal.hide();
        showAlert('Status updated.', 'success');
        refresh();
      }
    });

    // Reschedule link uses SPA nav
    modalFooter.querySelector('a[data-nav-link]').addEventListener('click', (e) => {
      e.preventDefault();
      bsModal.hide();
      import('../../app.js').then(({ navigate }) => navigate(`/booking?modify=${b.id}`));
    });

    bsModal.show();
  }

  // ── Block detail modal ────────────────────────────────────────────────
  function openBlockModal(block) {
    const staff = staffList.find((s) => s.user_id === block.staff_user_id);
    modalTitle.textContent = '🚫 ' + (block.reason ?? 'Blocked time');
    modalBody.innerHTML = `
      <dl class="row mb-0">
        <dt class="col-4">Staff</dt><dd class="col-8">${esc(staff?.full_name ?? 'All staff')}</dd>
        <dt class="col-4">Starts</dt><dd class="col-8">${new Date(block.starts_at).toLocaleString()}</dd>
        <dt class="col-4">Ends</dt><dd class="col-8">${new Date(block.ends_at).toLocaleString()}</dd>
        <dt class="col-4">Reason</dt><dd class="col-8">${esc(block.reason ?? '—')}</dd>
      </dl>`;
    modalFooter.innerHTML = `
      <button id="block-delete" class="btn btn-danger me-auto">Delete Block</button>
      <button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>`;
    modalFooter.querySelector('#block-delete').addEventListener('click', async () => {
      const { error } = await supabase.from('booking_blocks').delete().eq('id', block.id);
      if (error) { showAlert(error.message); return; }
      bsModal.hide(); showAlert('Block removed.', 'success'); refresh();
    });
    bsModal.show();
  }

  // ── Add block modal ───────────────────────────────────────────────────
  function openAddBlockModal(date, startTime, staffId = null) {
    const [h, m] = startTime.split(':').map(Number);
    const endH = m >= 30 ? h + 1 : h;
    const endM = m >= 30 ? '00' : '30';
    const defaultEnd = `${String(endH).padStart(2,'0')}:${endM}`;

    modalTitle.textContent = t('cal.addBlock');
    modalBody.innerHTML = `
      <div id="block-error" class="alert alert-danger d-none"></div>
      <div class="row g-3">
        <div class="col-12"><label class="form-label">Date</label>
          <input id="bl-date" type="date" class="form-control" value="${date}" /></div>
        <div class="col-6"><label class="form-label">Start time</label>
          <input id="bl-start" type="time" class="form-control" value="${startTime.slice(0,5)}" /></div>
        <div class="col-6"><label class="form-label">End time</label>
          <input id="bl-end" type="time" class="form-control" value="${defaultEnd}" /></div>
        <div class="col-12"><label class="form-label">Staff (leave blank for all)</label>
          <select id="bl-staff" class="form-select">
            <option value="">All staff (salon-wide)</option>
            ${staffList.map((s) => `<option value="${s.user_id}" ${s.user_id === staffId ? 'selected' : ''}>${esc(s.full_name ?? 'Staff')}</option>`).join('')}
          </select></div>
        <div class="col-12"><label class="form-label">Reason</label>
          <input id="bl-reason" type="text" class="form-control" placeholder="Lunch, holiday, maintenance…" /></div>
      </div>`;
    modalFooter.innerHTML = `
      <button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button id="bl-save" class="btn btn-danger">
        <span>Save Block</span><span class="spinner-border spinner-border-sm d-none ms-2"></span>
      </button>`;

    modalFooter.querySelector('#bl-save').addEventListener('click', async () => {
      const saveBtn = modalFooter.querySelector('#bl-save');
      const spinner = saveBtn.querySelector('.spinner-border');
      const errEl = modalBody.querySelector('#block-error');
      const blDate = modalBody.querySelector('#bl-date').value;
      const blStart = modalBody.querySelector('#bl-start').value;
      const blEnd = modalBody.querySelector('#bl-end').value;
      const blStaff = modalBody.querySelector('#bl-staff').value || null;
      const blReason = modalBody.querySelector('#bl-reason').value.trim();

      if (!blDate || !blStart || !blEnd) { errEl.textContent = 'Date and times are required.'; errEl.classList.remove('d-none'); return; }
      if (blStart >= blEnd) { errEl.textContent = 'End time must be after start time.'; errEl.classList.remove('d-none'); return; }

      saveBtn.disabled = true; spinner.classList.remove('d-none');
      const user = getUser();
      const { error } = await supabase.from('booking_blocks').insert({
        starts_at: `${blDate}T${blStart}:00`,
        ends_at: `${blDate}T${blEnd}:00`,
        reason: blReason || null,
        staff_user_id: blStaff,
        created_by: user.id
      });
      if (error) {
        errEl.textContent = error.message; errEl.classList.remove('d-none');
        saveBtn.disabled = false; spinner.classList.add('d-none');
      } else {
        bsModal.hide(); showAlert('Block saved.', 'success'); refresh();
      }
    });

    bsModal.show();
  }

  // ── Filter setup ──────────────────────────────────────────────────────
  async function initFilters() {
    // Staff
    staffList = (await supabase.rpc('get_staff_list').then(({ data }) => data)) ?? [];
    staffList.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.user_id; opt.textContent = s.full_name ?? 'Staff';
      staffFilter.appendChild(opt);
    });

    // Services
    const { data: svcs } = await supabase.from('services').select('id, service_name, category').eq('is_active', true).order('category').order('service_name');
    serviceList = svcs ?? [];
    const cats = [...new Set(serviceList.map((s) => s.category))].sort();

    cats.forEach((cat) => {
      const opt = document.createElement('option'); opt.value = cat; opt.textContent = cat; catFilter.appendChild(opt);
    });

    catFilter.addEventListener('change', () => {
      state.filters.category = catFilter.value;
      // Repopulate service filter
      svcFilter.innerHTML = `<option value="">All Services</option>`;
      const filtered = catFilter.value ? serviceList.filter((s) => s.category === catFilter.value) : serviceList;
      filtered.forEach((s) => {
        const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.service_name; svcFilter.appendChild(opt);
      });
      svcFilter.value = '';
      state.filters.serviceId = '';
      refresh();
    });

    svcFilter.addEventListener('change', () => { state.filters.serviceId = svcFilter.value; refresh(); });
    staffFilter.addEventListener('change', () => { state.filters.staffId = staffFilter.value; refresh(); });

    let custTimer = null;
    custFilter.addEventListener('input', () => {
      clearTimeout(custTimer);
      custTimer = setTimeout(() => { state.filters.customer = custFilter.value.trim(); refresh(); }, 300);
    });

    root.querySelector('#cal-filter-clear').addEventListener('click', () => {
      state.filters = { category: '', serviceId: '', staffId: '', customer: '' };
      catFilter.value = ''; svcFilter.value = ''; staffFilter.value = ''; custFilter.value = '';
      svcFilter.innerHTML = `<option value="">All Services</option>`;
      serviceList.forEach((s) => {
        const opt = document.createElement('option'); opt.value = s.id; opt.textContent = s.service_name; svcFilter.appendChild(opt);
      });
      refresh();
    });
  }

  // ── View buttons ──────────────────────────────────────────────────────
  function updateViewButtons() {
    root.querySelectorAll('.cal-view-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === state.view));
  }

  root.querySelectorAll('.cal-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => { state.view = btn.dataset.view; updateViewButtons(); refresh(); });
  });

  root.querySelector('#cal-prev').addEventListener('click', () => navigate(-1));
  root.querySelector('#cal-next').addEventListener('click', () => navigate(1));
  root.querySelector('#cal-today').addEventListener('click', () => {
    state.anchor = new Date(); state.view = 'day'; updateViewButtons(); refresh();
  });

  root.querySelector('#cal-add-block').addEventListener('click', () => {
    const now = new Date();
    const h = Math.max(HOUR_START, now.getHours());
    const m = now.getMinutes() >= 30 ? '30' : '00';
    openAddBlockModal(isoDate(state.anchor), `${String(h).padStart(2,'0')}:${m}:00`);
  });

  // Show Admin Panel link for admins
  import('../../services/session.js').then(({ hasRole }) => {
    if (hasRole('admin')) root.querySelector('#cal-admin-link')?.classList.remove('d-none');
  });

  // ── Init ──────────────────────────────────────────────────────────────
  initFilters().then(() => refresh());
}
