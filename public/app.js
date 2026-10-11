'use strict';

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_LABELS = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
const METHODS = ['MuslimWorldLeague', 'Egyptian', 'Karachi', 'UmmAlQura', 'Dubai',
  'MoonsightingCommittee', 'NorthAmerica', 'Kuwait', 'Qatar', 'Singapore', 'Tehran', 'Turkey'];
const MADHABS = ['Hanafi', 'Shafi'];

const state = {
  tab: 'day',
  today: null,     // YYYY-MM-DD in the configured timezone, from the server
  viewDate: null,  // date shown in the day view
  calMonth: null,  // YYYY-MM shown in the calendar
  settings: null,
};

const $ = (sel) => document.querySelector(sel);

const tg = window.Telegram?.WebApp;

async function api(path, options = {}) {
  if (tg?.initData) {
    options.headers = { ...options.headers, 'x-telegram-init-data': tg.initData };
  }
  const res = await fetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/* ---- date helpers (all on YYYY-MM-DD strings) ---- */
function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
function addMonths(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + delta, 1));
  return t.toISOString().slice(0, 7);
}
function humanDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}
function humanMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/* ---- day view ---- */
async function renderDay() {
  const error = $('#day-error');
  error.hidden = true;
  try {
    const [times, records] = await Promise.all([
      api(`/api/times?date=${state.viewDate}`),
      api(`/api/records?from=${state.viewDate}&to=${state.viewDate}`),
    ]);
    const prayed = new Set(records[state.viewDate] ?? []);
    const isToday = state.viewDate === state.today;

    $('#day-date').textContent = isToday ? 'Today' : humanDate(state.viewDate);
    let sub = $('#day-date').nextElementSibling;
    if (isToday) {
      $('#day-date').insertAdjacentHTML('afterend', `<div class="day-sub">${humanDate(state.viewDate)}</div>`);
      if (sub?.classList.contains('day-sub')) sub.remove();
    } else if (sub?.classList.contains('day-sub')) {
      sub.remove();
    }
    $('#day-today').hidden = isToday;

    // For today: the current prayer is the last one whose time has arrived.
    let current = null;
    if (isToday) {
      const now = Date.now();
      for (const p of PRAYERS) if (now >= times.timestamps[p]) current = p;
    }

    const list = $('#prayer-list');
    list.replaceChildren();
    for (const p of PRAYERS) {
      const li = document.createElement('li');
      li.className = 'prayer-card';
      if (state.viewDate === state.today) {
        if (p === current) li.classList.add('now');
        else if (current === null || PRAYERS.indexOf(p) > PRAYERS.indexOf(current)) li.classList.add('upcoming');
      }
      li.innerHTML = `
        <button class="arch" aria-pressed="${prayed.has(p)}"
                aria-label="Mark ${PRAYER_LABELS[p]} as prayed">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7"/>
          </svg>
        </button>
        <div class="prayer-info">
          <div class="prayer-name">${PRAYER_LABELS[p]}${p === current ? '<span class="now-label">Now</span>' : ''}</div>
          <div class="prayer-time">${times.times[p]}</div>
        </div>`;
      li.querySelector('.arch').addEventListener('click', (e) => togglePrayer(e.currentTarget, state.viewDate, p));
      list.append(li);
    }
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
}

async function togglePrayer(btn, date, prayer) {
  const was = btn.getAttribute('aria-pressed') === 'true';
  btn.setAttribute('aria-pressed', String(!was)); // optimistic
  try {
    await api(`/api/records/${date}/${prayer}`, { method: was ? 'DELETE' : 'PUT' });
  } catch {
    btn.setAttribute('aria-pressed', String(was)); // revert on failure
  }
}

/* ---- calendar ---- */
async function renderCalendar() {
  const error = $('#cal-error');
  error.hidden = true;
  $('#cal-title').textContent = humanMonth(state.calMonth);
  const weekdays = $('#cal-weekdays');
  if (!weekdays.childElementCount) {
    for (const d of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
      weekdays.insertAdjacentHTML('beforeend', `<div>${d}</div>`);
    }
  }
  try {
    const first = `${state.calMonth}-01`;
    const daysInMonth = new Date(Date.UTC(
      Number(state.calMonth.slice(0, 4)), Number(state.calMonth.slice(5, 7)), 0,
    )).getUTCDate();
    const last = `${state.calMonth}-${String(daysInMonth).padStart(2, '0')}`;
    const records = await api(`/api/records?from=${first}&to=${last}`);

    const grid = $('#cal-grid');
    grid.replaceChildren();
    const firstWeekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday-first
    for (let i = 0; i < firstWeekday; i++) {
      grid.insertAdjacentHTML('beforeend', '<div class="cal-day blank"></div>');
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${state.calMonth}-${String(d).padStart(2, '0')}`;
      const count = (records[date] ?? []).length;
      const btn = document.createElement('button');
      btn.className = `cal-day c${count}`;
      if (date === state.today) btn.classList.add('today');
      if (date > state.today) btn.classList.add('future');
      btn.textContent = d;
      btn.setAttribute('aria-label', `${humanDate(date)}, ${count} of 5 prayed`);
      btn.addEventListener('click', () => {
        state.viewDate = date;
        setTab('day');
      });
      grid.append(btn);
    }
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
}

/* ---- stats ---- */
async function renderStats() {
  const error = $('#stats-error');
  error.hidden = true;
  try {
    const s = await api('/api/stats');
    const maxQaza = Math.max(1, ...PRAYERS.map((p) => s.qaza.byPrayer[p]));
    const qazaRows = PRAYERS.map((p) => `
      <div class="qaza-row">
        <span>${PRAYER_LABELS[p]}</span>
        <span class="qaza-bar"><span style="width:${(s.qaza.byPrayer[p] / maxQaza) * 100}%"></span></span>
        <span class="qaza-count">${s.qaza.byPrayer[p]}</span>
      </div>`).join('');
    const pct = s.month.completionPct;
    $('#stats-body').innerHTML = `
      <div class="stat-card">
        <h3>Qaza owed</h3>
        ${s.qaza.total === 0
          ? '<div class="big-number clear">0</div><p class="stat-note">All caught up, alhamdulillah.</p>'
          : `<div class="big-number debt">${s.qaza.total}</div>
             <p class="stat-note">missed prayers since ${humanDate(s.trackingStartDate)}</p>
             <div class="qaza-rows">${qazaRows}</div>`}
      </div>
      <div class="stat-card">
        <h3>Streak</h3>
        <div class="streak-pair">
          <div><div class="big-number">${s.streak.current}</div><p class="stat-note">current full days</p></div>
          <div><div class="big-number">${s.streak.longest}</div><p class="stat-note">longest</p></div>
        </div>
      </div>
      <div class="stat-card">
        <h3>${humanMonth(s.month.month)}</h3>
        ${pct === null
          ? '<p class="stat-note">No prayers due yet this month.</p>'
          : `<div class="big-number">${pct}%</div>
             <p class="stat-note">${s.month.prayed} of ${s.month.due} prayers</p>
             <div class="progress"><span style="width:${pct}%"></span></div>`}
      </div>`;
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
}

/* ---- settings ---- */
function fillSelect(select, values, selected) {
  select.replaceChildren();
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v.replace(/([a-z])([A-Z])/g, '$1 $2');
    opt.selected = v === selected;
    select.append(opt);
  }
}

function renderSettings() {
  const form = $('#settings-form');
  const s = state.settings;
  form.latitude.value = s.latitude;
  form.longitude.value = s.longitude;
  form.trackingStartDate.value = s.trackingStartDate;
  const timezones = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone') : [s.timezone];
  fillSelect(form.timezone, timezones, s.timezone);
  fillSelect(form.method, METHODS, s.method);
  fillSelect(form.madhab, MADHABS, s.madhab);
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.target;
  const status = $('#settings-status');
  status.classList.remove('error');
  status.textContent = 'Saving…';
  try {
    state.settings = await api('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        latitude: Number(form.latitude.value),
        longitude: Number(form.longitude.value),
        timezone: form.timezone.value,
        method: form.method.value,
        madhab: form.madhab.value,
        trackingStartDate: form.trackingStartDate.value,
      }),
    });
    // Timezone may change what "today" is.
    const times = await api('/api/times');
    state.today = times.date;
    status.textContent = 'Saved';
    setTimeout(() => { if (status.textContent === 'Saved') status.textContent = ''; }, 2000);
  } catch (err) {
    status.classList.add('error');
    status.textContent = err.message;
  }
}

function useMyLocation() {
  const status = $('#settings-status');
  if (!navigator.geolocation) {
    status.classList.add('error');
    status.textContent = 'Geolocation is not available in this browser.';
    return;
  }
  status.classList.remove('error');
  status.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const form = $('#settings-form');
      form.latitude.value = pos.coords.latitude.toFixed(4);
      form.longitude.value = pos.coords.longitude.toFixed(4);
      status.textContent = 'Location filled in — press Save to keep it.';
    },
    () => {
      status.classList.add('error');
      status.textContent = 'Could not get your location.';
    },
  );
}

/* ---- tabs ---- */
const RENDERERS = { day: renderDay, calendar: renderCalendar, stats: renderStats, settings: renderSettings };

function setTab(tab) {
  if (!RENDERERS[tab]) tab = 'day';
  state.tab = tab;
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
  for (const section of document.querySelectorAll('.view')) {
    section.hidden = section.id !== `view-${tab}`;
  }
  for (const btn of document.querySelectorAll('.tab-bar button')) {
    btn.setAttribute('aria-current', String(btn.dataset.tab === tab));
  }
  RENDERERS[tab]();
}

/* ---- init ---- */
async function init() {
  document.querySelectorAll('.tab-bar button').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  $('#day-prev').addEventListener('click', () => { state.viewDate = addDays(state.viewDate, -1); renderDay(); });
  $('#day-next').addEventListener('click', () => { state.viewDate = addDays(state.viewDate, 1); renderDay(); });
  $('#day-today').addEventListener('click', () => { state.viewDate = state.today; renderDay(); });
  $('#cal-prev').addEventListener('click', () => { state.calMonth = addMonths(state.calMonth, -1); renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { state.calMonth = addMonths(state.calMonth, 1); renderCalendar(); });
  $('#settings-form').addEventListener('submit', saveSettings);
  $('#geo-btn').addEventListener('click', useMyLocation);
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));

  const [settings, times] = await Promise.all([api('/api/settings'), api('/api/times')]);
  state.settings = settings;
  state.today = times.date;
  state.viewDate = times.date;
  state.calMonth = times.date.slice(0, 7);
  setTab(location.hash.slice(1) || 'day');
}

if (tg) {
  tg.ready();
  tg.expand();
}

init().catch((err) => {
  const diag = `sdk:${!!window.Telegram} init:${tg?.initData?.length ?? 'n/a'} v:${tg?.version ?? '?'} plat:${tg?.platform ?? '?'}`;
  document.querySelector('#main').innerHTML =
    `<p class="error">${err.message}</p><p class="cal-hint">${diag}</p>`;
});
