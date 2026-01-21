/* ===== 接続設定 ===== */
/* config.js で CONFIG を定義 */

/* セッションキー */
const SESSION_KEY = "presence-session-token";
const SESSION_ROLE_KEY = "presence-role";
const SESSION_OFFICE_KEY = "presence-office";
const SESSION_OFFICE_NAME_KEY = "presence-office-name";

/* 要素 */
const board = document.getElementById('board'), toastEl = document.getElementById('toast'), diag = document.getElementById('diag');
const loginEl = document.getElementById('login'), loginMsg = document.getElementById('loginMsg'), pwInput = document.getElementById('pw'), officeSel = document.getElementById('officeSel'), btnLogin = document.getElementById('btnLogin');
const menuEl = document.getElementById('groupMenu'), menuList = document.getElementById('groupMenuList'), menuTitle = document.getElementById('groupMenuTitle'), titleBtn = document.getElementById('titleBtn');
const noticesBtn = document.getElementById('noticesBtn'), adminBtn = document.getElementById('adminBtn'), logoutBtn = document.getElementById('logoutBtn'), adminModal = document.getElementById('adminModal'), adminClose = document.getElementById('adminClose');
const toolsBtn = document.getElementById('toolsBtn'), toolsModal = document.getElementById('toolsModal'), toolsModalClose = document.getElementById('toolsModalClose');
const eventBtn = document.getElementById('eventBtn'), eventModal = document.getElementById('eventModal'), eventClose = document.getElementById('eventClose');
const vacationRadioList = document.getElementById('vacationRadioList');
const eventGanttWrap = document.getElementById('eventGanttWrap');
const eventGantt = document.getElementById('eventGantt');
const eventGroupJumps = document.getElementById('eventGroupJumps');
const eventColorManualHint = document.getElementById('eventColorManualHint');
const eventStartInput = document.getElementById('eventStart');
const eventEndInput = document.getElementById('eventEnd');
const eventBitsInput = document.getElementById('eventBits');
const btnEventPrint = document.getElementById('btnEventPrint');
const btnEventSave = document.getElementById('btnEventSave');
const btnExport = document.getElementById('btnExport'), csvFile = document.getElementById('csvFile'), btnImport = document.getElementById('btnImport');
const renameOfficeName = document.getElementById('renameOfficeName'), btnRenameOffice = document.getElementById('btnRenameOffice');
const setPw = document.getElementById('setPw'), setAdminPw = document.getElementById('setAdminPw'), btnSetPw = document.getElementById('btnSetPw');
const memberTableBody = document.getElementById('memberTableBody'), btnMemberSave = document.getElementById('btnMemberSave'), btnMemberReload = document.getElementById('btnMemberReload');
const memberEditForm = document.getElementById('memberEditForm');
const memberEditTop = document.getElementById('memberEditTop');
const memberEditName = document.getElementById('memberEditName'), memberEditExt = document.getElementById('memberEditExt'), memberEditMobile = document.getElementById('memberEditMobile'), memberEditEmail = document.getElementById('memberEditEmail'), memberEditGroup = document.getElementById('memberEditGroup');
const memberGroupOptions = document.getElementById('memberGroupOptions'), memberEditId = document.getElementById('memberEditId'), memberEditModeLabel = document.getElementById('memberEditModeLabel');
const memberEditReset = document.getElementById('memberEditReset'), memberFilterInput = document.getElementById('memberFilterInput'), btnMemberFilterClear = document.getElementById('btnMemberFilterClear');
const adminOfficeRow = document.getElementById('adminOfficeRow'), adminOfficeSel = document.getElementById('adminOfficeSel');
const manualBtn = document.getElementById('manualBtn'), manualModal = document.getElementById('manualModal'), manualClose = document.getElementById('manualClose'), manualUser = document.getElementById('manualUser'), manualAdmin = document.getElementById('manualAdmin');
const nameFilter = document.getElementById('nameFilter'), statusFilter = document.getElementById('statusFilter');
const noticesEditor = document.getElementById('noticesEditor'), btnAddNotice = document.getElementById('btnAddNotice'), btnLoadNotices = document.getElementById('btnLoadNotices'), btnSaveNotices = document.getElementById('btnSaveNotices');
const toolsEditor = document.getElementById('toolsEditor'), btnAddTool = document.getElementById('btnAddTool'), btnLoadTools = document.getElementById('btnLoadTools'), btnSaveTools = document.getElementById('btnSaveTools');
const noticeModal = document.getElementById('noticeModal'), noticeModalTitle = document.getElementById('noticeModalTitle'), noticeModalBody = document.getElementById('noticeModalBody'), noticeModalClose = document.getElementById('noticeModalClose');
const toolsList = document.getElementById('toolsList');
const vacationTitleInput = document.getElementById('vacationTitle'), vacationStartInput = document.getElementById('vacationStart'), vacationEndInput = document.getElementById('vacationEnd');
const vacationNoticeSelect = document.getElementById('vacationNotice'), vacationOfficeSelect = document.getElementById('vacationOffice'), vacationMembersBitsInput = document.getElementById('vacationMembersBits');
const btnCreateNoticeFromEvent = document.getElementById('btnCreateNoticeFromEvent');
const vacationIdInput = document.getElementById('vacationId'), vacationListBody = document.getElementById('vacationListBody');
const vacationTypeText = document.getElementById('vacationTypeText');
const vacationColorSelect = document.getElementById('vacationColor');
const btnVacationSave = document.getElementById('btnVacationSave'), btnVacationDelete = document.getElementById('btnVacationDelete'), btnVacationReload = document.getElementById('btnVacationReload'), btnVacationClear = document.getElementById('btnVacationClear');

/* 状態 */
let GROUPS = [], CONFIG_UPDATED = 0, MENUS = null, STATUSES = [], requiresTimeSet = new Set(), clearOnSet = new Set(), statusClassMap = new Map();
let tokenRenewTimer = null, ro = null, remotePullTimer = null, configWatchTimer = null, eventSyncTimer = null;
let resumeRemoteSyncOnVisible = false, resumeConfigWatchOnVisible = false, resumeEventSyncOnVisible = false;
let storeKeyBase = "presence-board-v4";
const PENDING_ROWS = new Set();
let adminSelectedOfficeId = '';
let currentEventIds = [];
let currentEventOfficeId = '';
let cachedEvents = { officeId: '', list: [] };
let appliedEventIds = [];
let appliedEventOfficeId = '';
let appliedEventTitles = [];
let eventGanttController = null;
let eventSelectedId = '';
let selectedEventIds = [];
let eventDateColorState = { officeId: '', map: new Map(), lastSaved: new Map(), autoSaveTimer: null, saveInFlight: false, queued: false, statusEl: null, loaded: false };
const eventSyncBase = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.remotePollMs))
  ? CONFIG.remotePollMs
  : 10000;
const EVENT_SYNC_INTERVAL_MS = (typeof CONFIG !== 'undefined' && CONFIG.eventSyncIntervalMs)
  ? CONFIG.eventSyncIntervalMs
  : Math.max(eventSyncBase, 15000);

/* 認証状態 */
let SESSION_TOKEN = ""; let CURRENT_OFFICE_NAME = ""; let CURRENT_OFFICE_ID = ""; let CURRENT_ROLE = "user";

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    resumeRemoteSyncOnVisible = remotePullTimer != null;
    resumeConfigWatchOnVisible = configWatchTimer != null;
    resumeEventSyncOnVisible = eventSyncTimer != null;
    clearInterval(remotePullTimer);
    clearInterval(configWatchTimer);
    clearInterval(eventSyncTimer);
    remotePullTimer = null;
    configWatchTimer = null;
    eventSyncTimer = null;
  } else {
    if (resumeRemoteSyncOnVisible && SESSION_TOKEN) {
      startRemoteSync(true);
    }
    if (resumeConfigWatchOnVisible && SESSION_TOKEN) {
      startConfigWatch();
    }
    if (resumeEventSyncOnVisible && SESSION_TOKEN) {
      startEventSync(true);
    }
    resumeRemoteSyncOnVisible = false;
    resumeConfigWatchOnVisible = false;
    resumeEventSyncOnVisible = false;
  }
});
function isOfficeAdmin() { return CURRENT_ROLE === 'officeAdmin' || CURRENT_ROLE === 'superAdmin'; }

function getRosterOrdering() {
  if (!Array.isArray(GROUPS)) return [];
  return GROUPS.map(g => ({
    title: g.title || '',
    members: Array.isArray(g.members) ? g.members : []
  }));
}

/* イベントの表示 */
function summarizeVacationMembers(bitsStr) {
  if (!bitsStr || typeof getRosterOrdering !== 'function') return '';
  const members = getRosterOrdering().flatMap(g => g.members || []);
  if (!members.length) return '';
  const onSet = new Set();
  bitsStr.split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
    const bits = part.includes(':') ? (part.split(':')[1] || '') : part;
    for (let i = 0; i < bits.length && i < members.length; i++) {
      if (bits[i] === '1') onSet.add(i);
    }
  });
  const names = members.map(m => m.name || '').filter((_, idx) => onSet.has(idx));
  if (names.length === 0) return '';
  if (names.length <= 3) return names.join('、');
  return `${names.slice(0, 3).join('、')} ほか${names.length - 3}名`;
}

function coerceVacationVisibleFlag(raw) {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (!s) return false;
    return !(s === 'false' || s === '0' || s === 'off' || s === 'no' || s === 'hide');
  }
  return false;
}

function renderVacationRadioMessage(message) {
  // プルダウン形式の場合
  const dropdown = document.getElementById('eventSelectDropdown');
  if (dropdown) {
    dropdown.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = message;
    option.disabled = true;
    option.selected = true;
    dropdown.appendChild(option);
    dropdown.disabled = true;
    return;
  }

  // 旧形式（カードリスト）のフォールバック
  if (!vacationRadioList) return;
  vacationRadioList.style.display = 'block';
  vacationRadioList.textContent = '';
  const div = document.createElement('div');
  div.style.textAlign = 'center';
  div.style.padding = '20px';
  div.style.color = 'var(--color-text-muted)';
  div.textContent = message;
  vacationRadioList.appendChild(div);
}

// ★修正: CONFIG から設定を取得 (SSOT)
const EVENT_COLOR_LABELS = (typeof CONFIG !== 'undefined' && CONFIG.eventColorLabels) ? CONFIG.eventColorLabels : {};
const PALETTE_TO_EVENT_COLOR_MAP = (typeof CONFIG !== 'undefined' && CONFIG.paletteToEventColor) ? CONFIG.paletteToEventColor : {};
const EVENT_COLOR_KEYS = Object.keys(EVENT_COLOR_LABELS);

const EVENT_COLOR_TO_PALETTE_MAP = {
  amber: 'amber',
  blue: 'saturday',
  green: 'mint',
  purple: 'lavender',
  teal: 'mint',
  sunday: 'sunday',
  holiday: 'holiday',
  slate: 'slate',
  pink: 'sunday',
  gray: 'slate',
  grey: 'slate',
  none: 'none',
  saturday: 'saturday'
};
const PALETTE_KEYS = ['none', 'saturday', 'sunday', 'holiday', 'amber', 'mint', 'lavender', 'slate'];

// レガシーカラーキーの正規化マッピング
const EVENT_COLOR_LEGACY_FALLBACKS = {
  gray: 'slate',
  grey: 'slate',
  teal: 'green',
  pink: 'sunday'
};

// トランスポート用カラーキーのフォールバック
const EVENT_COLOR_TRANSPORT_FALLBACKS = {
  slate: 'gray',
  green: 'teal'
};

function getEventColorClass(color) {
  const key = (color || '').toString().trim().toLowerCase();
  if (!key) return '';
  return `event-color-${key}`;
}

function getEventColorClasses() {
  return EVENT_COLOR_KEYS.map(key => getEventColorClass(key)).filter(Boolean);
}

function normalizeEventDateKey(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeEventColorKeyClient(raw) {
  const key = (raw || '').toString().trim().toLowerCase();
  if (EVENT_COLOR_LEGACY_FALLBACKS[key]) return EVENT_COLOR_LEGACY_FALLBACKS[key];
  return EVENT_COLOR_KEYS.includes(key) ? key : '';
}

function toTransportEventColorKey(raw) {
  const normalizedEvent = normalizeEventColorKeyClient(raw);
  if (normalizedEvent) {
    return EVENT_COLOR_TRANSPORT_FALLBACKS[normalizedEvent] || normalizedEvent;
  }
  const paletteKey = normalizePaletteKey(raw);
  if (paletteKey) {
    const eventColor = paletteKeyToEventColor(paletteKey);
    const normalizedFromPalette = normalizeEventColorKeyClient(eventColor);
    if (normalizedFromPalette) {
      return EVENT_COLOR_TRANSPORT_FALLBACKS[normalizedFromPalette] || normalizedFromPalette;
    }
    return eventColor || paletteKey;
  }
  return '';
}

function eventSelectionKey(officeId) {
  return `${storeKeyBase}:event:${officeId || '__none__'}`;
}

function loadSavedEventIds(officeId) {
  if (currentEventOfficeId === officeId && Array.isArray(currentEventIds)) return currentEventIds;
  let saved = [];
  try {
    const raw = localStorage.getItem(eventSelectionKey(officeId)) || '[]';
    const parsed = JSON.parse(raw);
    saved = Array.isArray(parsed) ? parsed.map(v => String(v)).filter(Boolean) : [];
  }
  catch { saved = []; }
  currentEventOfficeId = officeId || '';
  currentEventIds = saved;
  return currentEventIds;
}

function saveEventIds(officeId, ids) {
  const uniqIds = Array.from(new Set((ids || []).map(v => String(v).trim()).filter(Boolean)));
  currentEventIds = uniqIds;
  currentEventOfficeId = officeId || '';
  try { localStorage.setItem(eventSelectionKey(officeId), JSON.stringify(uniqIds)); }
  catch { }
}

function getEventTargetOfficeId() {
  return (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
}

function hasRelatedNotice(item) {
  return !!(item?.noticeTitle || item?.noticeId || item?.noticeKey || item?.note || item?.memo);
}

function ensureEventColorStatusEl() {
  if (eventDateColorState.statusEl) return eventDateColorState.statusEl;
  const el = document.createElement('div');
  el.className = 'vac-save-status';
  eventDateColorState.statusEl = el;
  const container = eventGanttWrap || eventGantt || document.getElementById('eventGanttWrap') || document.getElementById('eventGantt');
  if (container) { container.appendChild(el); }
  return el;
}

function renderEventColorStatus(type, message, actions) {
  const el = ensureEventColorStatusEl();
  el.textContent = '';
  el.dataset.state = type || '';
  if (!message) return;
  const msgSpan = document.createElement('span');
  msgSpan.className = 'vac-save-message';
  msgSpan.textContent = message;
  el.appendChild(msgSpan);
  if (type === 'saving') {
    const spinner = document.createElement('span');
    spinner.className = 'vac-save-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    el.prepend(spinner);
  }
  (actions || []).forEach(({ label, onClick, className }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = className || 'vac-save-action';
    btn.addEventListener('click', onClick);
    el.appendChild(btn);
  });
}

function updateEventColorManualHint(hasManualColor) {
  const hintEl = eventColorManualHint || document.getElementById('eventColorManualHint');
  if (!hintEl) return;
  const admin = isOfficeAdmin && typeof isOfficeAdmin === 'function' ? isOfficeAdmin() : false;
  if (!admin) {
    hintEl.style.display = 'none';
    hintEl.textContent = '';
    hintEl.title = '';
    return;
  }
  const targetOffice = getEventTargetOfficeId();
  const shouldShow = !!hasManualColor && !!targetOffice && eventDateColorState.officeId === targetOffice;
  if (shouldShow) {
    hintEl.style.display = 'inline-flex';
    hintEl.textContent = '🎨 手動色が適用されています（セルを右クリックでクリアできます）';
    hintEl.title = 'セルを右クリックすると手動色を個別にクリアできます。';
  } else {
    hintEl.style.display = 'none';
    hintEl.textContent = '';
    hintEl.title = '';
  }
}

function paletteKeyToEventColor(key) {
  const normalized = (key || '').toString().trim().toLowerCase();
  return PALETTE_TO_EVENT_COLOR_MAP[normalized] ?? '';
}

function paletteKeyFromEventColorKey(key) {
  const normalized = (key || '').toString().trim().toLowerCase();
  if (EVENT_COLOR_TO_PALETTE_MAP[normalized]) return EVENT_COLOR_TO_PALETTE_MAP[normalized];
  if (PALETTE_KEYS.includes(normalized)) return normalized;
  return '';
}

function normalizePaletteKey(raw) {
  const normalized = (raw || '').toString().trim().toLowerCase();
  return PALETTE_KEYS.includes(normalized) ? normalized : '';
}

function normalizeEventDateColorValue(raw) {
  const normalizedColor = normalizeEventColorKeyClient(raw);
  if (normalizedColor) return normalizedColor;
  return normalizePaletteKey(raw);
}

function applyEventDateColorsToController(colorMap) {
  if (!eventGanttController || typeof eventGanttController.applyDateColorMap !== 'function') return;
  try {
    eventGanttController.applyDateColorMap(colorMap || new Map());
  } catch (err) {
    console.error('applyDateColorMap error', err);
  }
}

function showEventColorSavingStatus() {
  renderEventColorStatus('saving', '日付カラーを保存しています…');
}

function showEventColorSavedStatus() {
  renderEventColorStatus('saved', '自動保存済み');
  setTimeout(() => {
    if (eventDateColorState.statusEl && eventDateColorState.statusEl.dataset.state === 'saved') {
      eventDateColorState.statusEl.textContent = '';
      eventDateColorState.statusEl.dataset.state = '';
    }
  }, 2000);
}

function rollbackEventDateColors() {
  const lastSaved = eventDateColorState.lastSaved instanceof Map ? eventDateColorState.lastSaved : new Map();
  eventDateColorState.map = new Map(lastSaved);
  applyManualEventColorsToGantt();
  applyEventDateColorsToController(eventDateColorState.map);
  toast('保存前の状態に戻しました', false);
}

function showEventColorErrorStatus() {
  const actions = [{
    label: '再試行',
    onClick: () => scheduleEventDateColorSave('retry'),
    className: 'vac-save-retry'
  }];
  if (eventDateColorState.lastSaved) {
    actions.push({
      label: 'ロールバック',
      onClick: rollbackEventDateColors,
      className: 'vac-save-rollback'
    });
  }
  renderEventColorStatus('error', '保存に失敗しました。再試行するかロールバックできます。', actions);
}

function resetEventDateColorState() {
  const statusEl = eventDateColorState.statusEl || null;
  eventDateColorState = { officeId: '', map: new Map(), lastSaved: new Map(), autoSaveTimer: null, saveInFlight: false, queued: false, statusEl, loaded: false };
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.dataset.state = '';
  }
  applyManualEventColorsToGantt();
  applyEventDateColorsToController(new Map());
}

function updateEventDateColorState(date, colorKey, officeId) {
  const targetOffice = officeId || getEventTargetOfficeId();
  const normalizedDate = normalizeEventDateKey(date);
  if (!targetOffice || !normalizedDate) return;
  if (colorKey === null) {
    const mapToClear = eventDateColorState.map instanceof Map ? eventDateColorState.map : new Map();
    mapToClear.delete(normalizedDate);
    eventDateColorState.map = mapToClear;
    applyManualEventColorsToGantt();
    applyEventDateColorsToController(mapToClear);
    scheduleEventDateColorSave();
    return;
  }
  const normalizedColor = normalizeEventDateColorValue(colorKey);
  const statusEl = eventDateColorState.statusEl || ensureEventColorStatusEl();
  if (eventDateColorState.autoSaveTimer) {
    clearTimeout(eventDateColorState.autoSaveTimer);
    eventDateColorState.autoSaveTimer = null;
  }
  if (eventDateColorState.officeId && eventDateColorState.officeId !== targetOffice) {
    eventDateColorState = { officeId: targetOffice, map: new Map(), lastSaved: new Map(), autoSaveTimer: null, saveInFlight: false, queued: false, statusEl, loaded: false };
  } else if (!eventDateColorState.officeId) {
    eventDateColorState = { ...eventDateColorState, officeId: targetOffice, statusEl };
  }
  const map = eventDateColorState.map instanceof Map ? eventDateColorState.map : new Map();
  if (!normalizedColor) {
    return;
  }
  map.set(normalizedDate, normalizedColor);
  eventDateColorState.map = map;
  eventDateColorState.loaded = true;
  applyManualEventColorsToGantt();
  applyEventDateColorsToController(map);
  scheduleEventDateColorSave();
}

function applyManualEventColorsToGantt() {
  const gantt = eventGantt || document.getElementById('eventGantt');
  const targetOffice = getEventTargetOfficeId();
  if (!gantt) return;
  const colorClasses = getEventColorClasses();
  const map = (eventDateColorState.officeId && eventDateColorState.officeId !== targetOffice) ? new Map() : (eventDateColorState.map || new Map());
  gantt.querySelectorAll('td.vac-cell').forEach(cell => {
    cell.classList.remove(...colorClasses);
    if (cell.title && cell.title.includes('手動')) {
      cell.removeAttribute('title');
    }
    delete cell.dataset.manualColor;
    delete cell.dataset.manualColorBound;
  });

  const applyColorToDayHeader = (cell) => {
    cell.classList.remove(...colorClasses);
    const date = normalizeEventDateKey(cell.dataset.date || '');
    const storedColorKey = map.get(date) || '';
    const paletteColor = paletteKeyFromEventColorKey(storedColorKey);
    const eventColorKey = normalizeEventColorKeyClient(storedColorKey) || paletteKeyToEventColor(paletteColor);
    if (eventColorKey) {
      const cls = getEventColorClass(eventColorKey);
      if (cls) cell.classList.add(cls);
      cell.dataset.manualColor = storedColorKey;
      const label = EVENT_COLOR_LABELS[eventColorKey] || '手動色';
      cell.title = `${label}（手動設定）: 右クリックでクリア`;
    } else {
      delete cell.dataset.manualColor;
      if (cell.title && cell.title.includes('手動')) {
        cell.removeAttribute('title');
      }
    }
  };
  gantt.querySelectorAll('.vac-day-header').forEach(applyColorToDayHeader);
  updateEventColorManualHint(map.size > 0);
}

function buildEventDateColorPayload() {
  const payload = {};
  (eventDateColorState.map || new Map()).forEach((color, date) => {
    const value = toTransportEventColorKey(color);
    if (date && value) { payload[date] = value; }
  });
  return payload;
}

function getManualEventColorForDate(date, officeId) {
  const normalized = normalizeEventDateKey(date);
  const targetOffice = officeId || appliedEventOfficeId || getEventTargetOfficeId();
  if (!normalized || !targetOffice) return '';
  if (eventDateColorState.officeId !== targetOffice) return '';
  return eventDateColorState.map.get(normalized) || '';
}

async function loadEventDateColors(officeId, options = {}) {
  const targetOfficeId = officeId || getEventTargetOfficeId();
  const opts = options || {};
  const silent = opts.silent === true;
  const forceReload = opts.force === true;
  if (!targetOfficeId || !SESSION_TOKEN) {
    resetEventDateColorState();
    return new Map();
  }
  const hasLoadedCurrentOffice = eventDateColorState.officeId === targetOfficeId && eventDateColorState.loaded;
  if (hasLoadedCurrentOffice && !forceReload) {
    applyManualEventColorsToGantt();
    return eventDateColorState.map || new Map();
  }
  const mapsAreEqual = (a, b) => {
    if (!(a instanceof Map) || !(b instanceof Map)) return false;
    if (a.size !== b.size) return false;
    for (const [key, val] of a.entries()) {
      if (!b.has(key) || b.get(key) !== val) return false;
    }
    return true;
  };
  try {
    const res = await apiPost({ action: 'getEventColorMap', token: SESSION_TOKEN, office: targetOfficeId, nocache: '1' });
    if (res?.error === 'unauthorized') {
      await logout();
      return new Map();
    }
    const map = new Map();
    const colors = (res && typeof res.colors === 'object') ? res.colors : {};
    Object.keys(colors || {}).forEach(date => {
      const normalizedDate = normalizeEventDateKey(date);
      if (!normalizedDate) return;
      const paletteKey = paletteKeyFromEventColorKey(colors[date]);
      const normalizedColor = paletteKey || normalizeEventDateColorValue(colors[date]);
      if (normalizedColor) { map.set(normalizedDate, normalizedColor); }
    });
    const shouldApply = !hasLoadedCurrentOffice || forceReload || !mapsAreEqual(eventDateColorState.map, map);
    eventDateColorState = {
      ...eventDateColorState,
      officeId: targetOfficeId,
      map,
      lastSaved: new Map(map),
      loaded: true
    };
    if (shouldApply) {
      applyManualEventColorsToGantt();
      applyEventDateColorsToController(map);
    }
    return map;
  } catch (err) {
    console.error('loadEventDateColors error', err);
    resetEventDateColorState();
    if (!silent) toast('日付カラーの読み込みに失敗しました', false);
    return new Map();
  }
}

async function flushEventDateColorSave() {
  if (eventDateColorState.saveInFlight) {
    eventDateColorState.queued = true;
    return;
  }
  const officeId = eventDateColorState.officeId || getEventTargetOfficeId();
  if (!officeId || !SESSION_TOKEN || !isOfficeAdmin()) return;
  eventDateColorState.saveInFlight = true;
  eventDateColorState.queued = false;
  showEventColorSavingStatus();
  try {
    const payload = buildEventDateColorPayload();
    const res = await apiPost({ action: 'setEventColorMap', token: SESSION_TOKEN, office: officeId, data: JSON.stringify({ colors: payload }) });
    if (res && res.ok !== false) {
      eventDateColorState.lastSaved = new Map(eventDateColorState.map || []);
      showEventColorSavedStatus();
      toast('日付カラーを保存しました');
    } else {
      throw new Error(res && res.error ? String(res.error) : 'save_failed');
    }
  } catch (err) {
    console.error('flushEventDateColorSave error', err);
    toast('日付カラーの保存に失敗しました', false);
    showEventColorErrorStatus();
  } finally {
    eventDateColorState.saveInFlight = false;
    if (eventDateColorState.queued) {
      eventDateColorState.queued = false;
      flushEventDateColorSave();
    }
  }
}

function scheduleEventDateColorSave() {
  if (!SESSION_TOKEN || !isOfficeAdmin()) return;
  if (eventDateColorState.autoSaveTimer) {
    clearTimeout(eventDateColorState.autoSaveTimer);
  }
  eventDateColorState.autoSaveTimer = setTimeout(() => {
    eventDateColorState.autoSaveTimer = null;
    flushEventDateColorSave();
  }, 800);
}

function refreshAppliedEventHighlights() {
  const officeId = appliedEventOfficeId || getEventTargetOfficeId();
  const sourceList = (cachedEvents.officeId === officeId && Array.isArray(cachedEvents.list)) ? cachedEvents.list : [];
  const idSet = new Set((appliedEventIds || []).map(id => String(id)));
  const visibleItems = sourceList.filter(item => {
    const id = String(item?.id || item?.vacationId || '');
    return idSet.has(id) && coerceVacationVisibleFlag(item?.visible);
  });
  applyEventHighlightForItems(visibleItems, undefined);
}

function renderVacationRadioList(list, options) {
  const dropdown = document.getElementById('eventSelectDropdown');
  const noticeBtn = document.getElementById('btnShowEventNotice');
  if (!dropdown) return;

  dropdown.innerHTML = '';
  const opts = options || {};
  const onSelectChange = typeof opts.onSelectChange === 'function' ? opts.onSelectChange : null;
  const onFocus = typeof opts.onFocus === 'function' ? opts.onFocus : null;
  const selectedIds = new Set((opts.selectedIds || []).map(v => String(v)));
  const syncSelectedIds = () => {
    selectedIds.clear();
    (selectedEventIds || []).forEach(v => selectedIds.add(String(v)));
  };

  if (!Array.isArray(list) || list.length === 0) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '登録されたイベントはありません';
    placeholder.disabled = true;
    dropdown.appendChild(placeholder);
    dropdown.disabled = true;
    if (noticeBtn) noticeBtn.style.display = 'none';
    return;
  }

  const officeId = list[0]?.office || CURRENT_OFFICE_ID || '';
  dropdown.disabled = false;

  // プレースホルダー
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'イベントを選択してください';
  dropdown.appendChild(placeholder);

  const itemMap = new Map();

  list.forEach((item, idx) => {
    const id = String(item.id || item.vacationId || idx);
    const option = document.createElement('option');
    option.value = id;
    const start = item.startDate || item.start || item.from || '';
    const end = item.endDate || item.end || item.to || '';
    const period = start || end ? ` (${start || ''}〜${end || ''})` : ' ';
    option.textContent = `${item.title || ''}${period}`;
    dropdown.appendChild(option);
    itemMap.set(id, item);
  });

  // 選択イベントを復元
  syncSelectedIds();
  const firstSelected = Array.from(selectedIds)[0];
  if (firstSelected) {
    dropdown.value = firstSelected;
  }

  // お知らせボタンの状態を更新
  function updateNoticeButton() {
    const currentId = dropdown.value;
    const currentItem = itemMap.get(currentId);
    if (currentItem && noticeBtn) {
      const hasNotice = hasRelatedNotice(currentItem);
      noticeBtn.style.display = hasNotice ? 'inline-block' : 'none';
      noticeBtn.disabled = !hasNotice;
    } else if (noticeBtn) {
      noticeBtn.style.display = 'none';
    }
  }
  updateNoticeButton();

  // プルダウン変更イベント
  dropdown.addEventListener('change', () => {
    const id = dropdown.value;
    if (!id) return;
    syncSelectedIds();
    selectedIds.clear();
    selectedIds.add(id);
    const arr = Array.from(selectedIds);
    selectedEventIds = arr;
    saveEventIds(officeId, arr);
    const item = itemMap.get(id) || null;
    updateNoticeButton();
    if (onSelectChange) onSelectChange(arr, item, id, true);
    if (onFocus) onFocus(item, id);
  });

  // お知らせボタンのクリックイベント
  if (noticeBtn) {
    const existingListeners = noticeBtn.cloneNode(true);
    noticeBtn.parentNode.replaceChild(existingListeners, noticeBtn);
    existingListeners.addEventListener('click', () => {
      const id = dropdown.value;
      const item = itemMap.get(id);
      if (item) {
        openRelatedNotice(item, { fromEventCalendar: true, openMode: 'modal' });
      }
    });
  }

  selectedEventIds = Array.from(selectedIds);

  // 初期フォーカス
  if (firstSelected) {
    const firstItem = itemMap.get(firstSelected);
    if (firstItem && onFocus) {
      onFocus(firstItem, firstSelected);
    }
  }
}

function updateEventCardStates() {
  // プルダウン形式では不要だが、互換性のため残す
  return;
}

function findNoticeFromCache(item) {
  const normalizeKeyFn = typeof normalizeNoticeKey === 'function'
    ? normalizeNoticeKey
    : (value) => { if (value == null) return ''; return String(value).replace(/\s+/g, ' ').trim().toLowerCase(); };

  const noticeId = item?.noticeId || item?.id || '';
  const noticeKey = item?.noticeKey || '';
  const noticeTitle = item?.noticeTitle || item?.title || '';
  const normalizedId = normalizeKeyFn(noticeId);
  const normalizedKey = normalizeKeyFn(noticeKey);
  const normalizedTitle = normalizeKeyFn(noticeTitle);
  const list = Array.isArray(window.CURRENT_NOTICES) ? window.CURRENT_NOTICES : [];

  let target = list.find(n => normalizedId && normalizeKeyFn(n?.id || n?.noticeId || n?.uid || '') === normalizedId) || null;
  if (!target) {
    target = list.find(n => normalizedKey && normalizeKeyFn(n?.noticeKey || n?.key || '') === normalizedKey) || null;
  }
  if (!target) {
    target = list.find(n => normalizedTitle && normalizeKeyFn(n?.title || '') === normalizedTitle) || null;
  }
  if (!target) return null;

  return {
    ...target,
    id: target?.id || target?.noticeId || target?.uid || '',
    noticeKey: target?.noticeKey || target?.key || '',
    title: target?.title || '',
    content: target?.content || ''
  };
}

function hideNoticeModal() {
  if (!noticeModal) return;
  noticeModal.classList.remove('show');
  noticeModal.setAttribute('aria-hidden', 'true');
}

function showNoticeModal(notice) {
  if (!noticeModal || !noticeModalTitle || !noticeModalBody) return false;
  hideNoticeModal();
  noticeModalTitle.textContent = notice?.title || '関連お知らせ';
  noticeModalBody.textContent = '';
  const content = document.createElement('div');
  content.className = 'notice-modal-content';
  const bodyText = notice?.content || '';
  if (bodyText) {
    if (typeof linkifyText === 'function') {
      content.innerHTML = linkifyText(bodyText).replace(/\n/g, '<br>');
    } else {
      content.textContent = bodyText;
    }
  } else {
    content.textContent = '本文が設定されていません';
  }
  noticeModalBody.appendChild(content);
  noticeModal.classList.add('show');
  noticeModal.setAttribute('aria-hidden', 'false');
  return true;
}

function openNoticeInNewWindow(notice) {
  try {
    const win = window.open('', '_blank', 'noopener');
    if (!win) return false;
    const title = notice?.title || '関連お知らせ';
    const contentStr = notice?.content || '';
    win.document.title = title;
    const wrapper = win.document.createElement('div');
    wrapper.style.fontFamily = 'sans-serif';
    wrapper.style.maxWidth = '720px';
    wrapper.style.margin = '24px auto';
    wrapper.style.padding = '12px';
    wrapper.style.lineHeight = '1.6';
    const heading = win.document.createElement('h1');
    heading.textContent = title;
    heading.style.fontSize = '20px';
    heading.style.marginBottom = '12px';
    const body = win.document.createElement('div');
    body.style.whiteSpace = 'pre-wrap';
    body.style.fontSize = '14px';
    body.textContent = contentStr || '本文が設定されていません';
    wrapper.appendChild(heading);
    wrapper.appendChild(body);
    win.document.body.appendChild(wrapper);
    return true;
  } catch (err) {
    console.error('openNoticeInNewWindow error', err);
    return false;
  }
}

function renderRelatedNoticePopup(notice, options = {}) {
  const opts = options || {};
  const mode = (opts.openMode || 'modal').toLowerCase();
  if (mode === 'window') {
    const opened = openNoticeInNewWindow(notice);
    if (opened) return true;
  }
  return showNoticeModal(notice);
}

function openRelatedNotice(item, options = {}) {
  const opts = options || {};
  const hasNotice = hasRelatedNotice(item);
  const fromEvent = opts.fromEventCalendar === true || opts.fromEvent === true;
  if (!hasNotice) {
    if (opts.toastOnMissing !== false) toast('関連するお知らせがありません', false);
    return false;
  }

  if (fromEvent) {
    const targetNotice = findNoticeFromCache(item);
    if (targetNotice) {
      return renderRelatedNoticePopup(targetNotice, opts);
    }
    if (opts.toastOnMissing !== false) toast('該当するお知らせが見つかりませんでした', false);
    return false;
  }
  const noticesArea = document.getElementById('noticesArea');
  if (noticesArea) {
    noticesArea.style.display = 'block';
    noticesArea.classList.remove('collapsed');
    noticesArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (noticesArea?.classList.contains('collapsed') && typeof toggleNoticesArea === 'function') {
    toggleNoticesArea();
  }

  const normalizeKeyFn = typeof normalizeNoticeKey === 'function'
    ? normalizeNoticeKey
    : (value) => {
      if (value == null) return '';
      return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
    };
  const noticesList = document.getElementById('noticesList');
  const noticeId = item?.noticeId || item?.id || '';
  const noticeKey = item?.noticeKey || '';
  const noticeTitle = item?.noticeTitle || item?.title || '';
  let targetEl = null;

  if (noticesList) {
    const items = Array.from(noticesList.querySelectorAll('.notice-item'));
    if (noticeId) {
      const normalizedId = normalizeKeyFn(noticeId);
      targetEl = items.find(el => normalizeKeyFn(el.dataset.noticeId) === normalizedId);
    }
    if (!targetEl && noticeKey) {
      const normalizedKey = normalizeKeyFn(noticeKey);
      targetEl = items.find(el => normalizeKeyFn(el.dataset.noticeKey || el.dataset.noticeId || '') === normalizedKey);
    }
    if (!targetEl && noticeTitle) {
      const normalizedTitle = normalizeKeyFn(noticeTitle);
      targetEl = items.find(el => {
        const titleText = el.querySelector('.notice-title')?.textContent || '';
        return normalizeKeyFn(titleText) === normalizedTitle;
      });
    }
  }

  if (targetEl) {
    targetEl.classList.add('expanded');
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }

  if (opts.toastOnMissing !== false) toast('該当するお知らせが見つかりませんでした', false);
  return false;
}

if (noticeModalClose) {
  noticeModalClose.addEventListener('click', hideNoticeModal);
}
if (noticeModal) {
  noticeModal.addEventListener('click', (e) => {
    if (e.target === noticeModal) hideNoticeModal();
  });
}

function getEventGanttController() {
  if (eventGanttController) return eventGanttController;
  if (typeof createVacationGantt !== 'function' || !eventGantt) {
    return null;
  }
  const handleDateColorSelect = (selection) => {
    if (!selection) return selection;
    const resolvedColor = selection.eventColor || paletteKeyToEventColor(selection.paletteKey) || selection.paletteKey;
    const colorKey = normalizeEventDateColorValue(resolvedColor);
    updateEventDateColorState(selection.date || '', colorKey || selection.paletteKey || '', getEventTargetOfficeId());
    return selection;
  };
  eventGanttController = createVacationGantt({
    rootEl: eventGantt,
    startInput: eventStartInput,
    endInput: eventEndInput,
    bitsInput: eventBitsInput,
    autoBind: true,
    autoInit: false,
    groupJumpContainer: eventGroupJumps,
    scrollContainer: eventGantt,
    groupJumpMode: 'select',
    saveMode: 'event-auto',
    onDateColorSelect: handleDateColorSelect
  });
  if (eventGanttController && typeof eventGanttController.init === 'function') {
    eventGanttController.init();
  }
  applyManualEventColorsToGantt();
  applyEventDateColorsToController(eventDateColorState.map || new Map());
  loadEventDateColors(getEventTargetOfficeId()).catch(err => console.error('initial loadEventDateColors failed', err));
  return eventGanttController;
}

function updateEventDetail(item, officeId) {
  const ctrl = getEventGanttController();
  if (!item) {
    eventSelectedId = '';
    if (ctrl) {
      ctrl.setRangeAndBits('', '', '');
      ctrl.applyBitsToCells();
    }
    return;
  }
  const start = item.startDate || item.start || item.from || '';
  const end = item.endDate || item.end || item.to || '';
  eventSelectedId = String(item.id || item.vacationId || '');
  if (ctrl) {
    ctrl.setRangeAndBits(start, end, item.membersBits || item.bits || '');
    ctrl.applyBitsToCells();
  }
}

function handleEventSelection(itemOrId) {
  const officeId = (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
  const item = typeof itemOrId === 'object' && itemOrId ? itemOrId : findCachedEvent(officeId, itemOrId);
  updateEventDetail(item || null, officeId);
}

function updateEventButtonVisibility(officeId, list) {
  if (!eventBtn) return;
  const loggedIn = !!SESSION_TOKEN;
  const targetOfficeId = officeId || CURRENT_OFFICE_ID || '';
  let sourceList = null;
  if (Array.isArray(list)) {
    sourceList = list;
  } else if (cachedEvents.officeId === targetOfficeId) {
    sourceList = cachedEvents.list;
  }
  const hasVisible = loggedIn && Array.isArray(sourceList)
    && sourceList.some(item => coerceVacationVisibleFlag(item?.visible) && (!targetOfficeId || String(item.office || targetOfficeId) === targetOfficeId));
  eventBtn.style.display = hasVisible ? 'inline-block' : 'none';
}

async function refreshEventDataSilent(officeId) {
  const targetOfficeId = officeId || getEventTargetOfficeId();
  if (!SESSION_TOKEN || !targetOfficeId) return [];
  try {
    const res = await apiPost({ action: 'getVacation', token: SESSION_TOKEN, office: targetOfficeId, nocache: '1' });
    if (res?.error === 'unauthorized') {
      await logout();
      return [];
    }
    const list = Array.isArray(res?.vacations) ? res.vacations : (Array.isArray(res?.items) ? res.items : []);
    const prevList = (cachedEvents.officeId === targetOfficeId && Array.isArray(cachedEvents.list)) ? cachedEvents.list : [];
    const normalizedList = list.map(item => {
      const idStr = String(item?.id || item?.vacationId || '');
      const prev = prevList.find(v => String(v?.id || v?.vacationId || '') === idStr);
      const hasIsVacation = item && Object.prototype.hasOwnProperty.call(item, 'isVacation');
      const fallbackHasFlag = prev && Object.prototype.hasOwnProperty.call(prev, 'isVacation');
      const isVacation = hasIsVacation ? item.isVacation : (fallbackHasFlag ? prev.isVacation : undefined);
      return {
        ...item,
        office: item?.office || targetOfficeId,
        visible: coerceVacationVisibleFlag(item?.visible),
        isVacation,
        color: item?.color || 'amber'
      };
    });
    const filteredList = (isOfficeAdmin() ? normalizedList : normalizedList.filter(item => item.visible === true));
    cachedEvents = { officeId: targetOfficeId, list: filteredList };
    const savedIds = loadSavedEventIds(targetOfficeId);
    if (Array.isArray(savedIds) && savedIds.length) {
      selectedEventIds = savedIds;
    }
    const visibleItems = filteredList.filter(item => item.visible === true);
    if (eventModal && eventModal.classList.contains('show')) {
      renderVacationRadioList(filteredList, {
        selectedIds: selectedEventIds,
        onSelectChange: (ids) => {
          selectedEventIds = ids;
          saveEventIds(targetOfficeId, ids);
        },
        // ▼ 修正: 自動更新時は、詳細データの再読み込み（上書き）を行わないようにするため null を指定
        onFocus: null
      });
    }
    updateEventButtonVisibility(targetOfficeId, normalizedList);
    const firstSelected = selectedEventIds?.[0] || '';
    if (firstSelected) {
      const selectedItem = findCachedEvent(targetOfficeId, firstSelected);
      // ▼ 修正: 編集中（未保存）の内容が上書きされて消えるのを防ぐためコメントアウト
      /* if (selectedItem) updateEventDetail(selectedItem, targetOfficeId);
      */
    }
    await applyEventDisplay(selectedEventIds && selectedEventIds.length ? selectedEventIds : visibleItems);
    return filteredList;
  } catch (err) {
    console.error('refreshEventDataSilent error', err);
    return [];
  }
}

async function loadEvents(officeId, showToastOnSuccess = false, options = {}) {
  const opts = options || {};
  const targetOfficeId = officeId || CURRENT_OFFICE_ID || '';
  renderVacationRadioMessage('読み込み中...');
  if (!SESSION_TOKEN || !targetOfficeId) {
    cachedEvents = { officeId: '', list: [] };
    resetEventDateColorState();
    renderVacationRadioMessage('拠点にログインすると表示できます');
    updateEventDetail(null, targetOfficeId);
    updateEventButtonVisibility(targetOfficeId, []);
    selectedEventIds = [];
    updateEventLegend([]);
    return [];
  }
  try {
    const res = await apiPost({ action: 'getVacation', token: SESSION_TOKEN, office: targetOfficeId, nocache: '1' });
    if (res?.error === 'unauthorized') {
      if (typeof logout === 'function') { await logout(); }
      cachedEvents = { officeId: '', list: [] };
      resetEventDateColorState();
      updateEventDetail(null, targetOfficeId);
      updateEventButtonVisibility(targetOfficeId, []);
      return [];
    }
    const list = Array.isArray(res?.vacations) ? res.vacations : (Array.isArray(res?.items) ? res.items : []);
    const prevList = (cachedEvents.officeId === targetOfficeId && Array.isArray(cachedEvents.list)) ? cachedEvents.list : [];
    const normalizedList = list.map(item => {
      const idStr = String(item?.id || item?.vacationId || '');
      const prev = prevList.find(v => String(v?.id || v?.vacationId || '') === idStr);
      const hasIsVacation = item && Object.prototype.hasOwnProperty.call(item, 'isVacation');
      const fallbackHasFlag = prev && Object.prototype.hasOwnProperty.call(prev, 'isVacation');
      const isVacation = hasIsVacation ? item.isVacation : (fallbackHasFlag ? prev.isVacation : undefined);
      return {
        ...item,
        office: item?.office || targetOfficeId,
        visible: coerceVacationVisibleFlag(item?.visible),
        isVacation,
        color: item?.color || 'amber'
      };
    });
    const filteredList = (isOfficeAdmin() && opts.visibleOnly !== true)
      ? normalizedList
      : normalizedList.filter(item => item.visible === true);
    await loadEventDateColors(targetOfficeId);
    const emptyMessage = filteredList.length === 0 && normalizedList.length > 0
      ? '現在表示中のイベントはありません。管理者が「表示」に設定するとここに表示されます。'
      : '登録されたイベントはありません';
    const savedIds = loadSavedEventIds(targetOfficeId);
    selectedEventIds = savedIds;
    cachedEvents = { officeId: targetOfficeId, list: filteredList };
    const visibleItems = filteredList.filter(item => item.visible === true);
    renderVacationRadioList(filteredList, {
      selectedIds: savedIds,
      emptyMessage,
      onSelectChange: (ids) => {
        selectedEventIds = ids;
        saveEventIds(targetOfficeId, ids);
      },
      onFocus: handleEventSelection
    });
    const initialSelection = savedIds.map(id => findCachedEvent(targetOfficeId, id)).find(Boolean)
      || (opts.visibleOnly === true ? visibleItems[0] : (visibleItems[0] || filteredList[0]))
      || null;
    if (initialSelection) {
      handleEventSelection(initialSelection);
      if (opts.onSelect) { opts.onSelect(initialSelection, String(initialSelection.id || initialSelection.vacationId || '')); }
    } else {
      updateEventDetail(null, targetOfficeId);
      if (opts.onSelect) { opts.onSelect(null, ''); }
    }
    updateEventLegend(visibleItems);
    updateEventButtonVisibility(targetOfficeId, normalizedList);
    await applyEventDisplay(visibleItems);
    if (showToastOnSuccess) toast('イベントを読み込みました');
    return filteredList;
  } catch (err) {
    console.error('loadEvents error', err);
    cachedEvents = { officeId: '', list: [] };
    resetEventDateColorState();
    renderVacationRadioMessage('読み込みに失敗しました');
    updateEventDetail(null, targetOfficeId);
    updateEventButtonVisibility(targetOfficeId, []);
    if (showToastOnSuccess) toast('イベントの取得に失敗しました', false);
    return [];
  }
}

function findCachedEvent(officeId, id) {
  if (!id) return null;
  const targetOfficeId = officeId || '';
  if (cachedEvents.officeId !== targetOfficeId) return null;
  const list = Array.isArray(cachedEvents.list) ? cachedEvents.list : [];
  const idStr = String(id);
  return list.find(item => String(item?.id || item?.vacationId || '') === idStr) || null;
}

function updateCachedMembersBits(officeId, id, membersBits) {
  if (!officeId || !id || cachedEvents.officeId !== officeId) return null;
  const list = Array.isArray(cachedEvents.list) ? cachedEvents.list : [];
  const idStr = String(id);
  const target = list.find(item => String(item?.id || item?.vacationId || '') === idStr) || null;
  if (target) {
    target.membersBits = membersBits;
    target.bits = membersBits;
  }
  return target;
}

function parseVacationMembersForDate(bitsStr, targetDate, startDate, endDate) {


  const members = getRosterOrdering().flatMap(g => g.members || []);
  if (!members.length) {

    return { memberIds: [], memberNames: '' };
  }

  // 日付の正規化
  function normalizeDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const target = normalizeDate(targetDate);
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  const parts = (bitsStr || '').split(';').map(s => s.trim()).filter(Boolean);


  const buildResultFromBits = (bits) => {
    const onSet = new Set();
    for (let i = 0; i < bits.length && i < members.length; i++) {
      if (bits[i] === '1') onSet.add(i);
    }
    const memberIds = members.map(m => m.id != null ? String(m.id) : '').filter((_, idx) => onSet.has(idx));
    const memberNames = members.filter((_, idx) => onSet.has(idx)).map(m => m.name || '').filter(Boolean).join('、');

    return { memberIds, memberNames };
  };

  const fallbackByParts = () => {
    if (parts.length === 0 || !target) {

      return { memberIds: [], memberNames: '' };
    }
    const matchedPart = parts.find(p => {
      if (!p.includes(':')) return false;
      const [pDate] = p.split(':');
      return normalizeDate(pDate) === target;
    }) || (parts.length === 1 ? parts[0] : null);
    if (!matchedPart) {

      return { memberIds: [], memberNames: '' };
    }
    const bits = matchedPart.includes(':') ? (matchedPart.split(':')[1] || '') : matchedPart;

    return buildResultFromBits(bits);
  };

  if (!target) {

    return { memberIds: [], memberNames: '' };
  }

  if (!start || !end) {

    return fallbackByParts();
  }

  // 対象日が期間内かチェック。範囲外の場合もビット列直接評価を試みる
  if (target < start || target > end) {

    return fallbackByParts();
  }

  // 日付スロットを生成
  const dateSlots = [];
  const current = new Date(start);
  const endD = new Date(end);
  while (current <= endD) {
    dateSlots.push(normalizeDate(current));
    current.setDate(current.getDate() + 1);
  }



  // 対象日のインデックスを取得
  const targetIdx = dateSlots.indexOf(target);


  if (targetIdx < 0) {

    return fallbackByParts();
  }

  // ビット文字列をパース


  if (parts.length === 0 || targetIdx >= parts.length) {

    return fallbackByParts();
  }

  const part = parts[targetIdx];
  const bits = part.includes(':') ? (part.split(':')[1] || '') : part;


  return buildResultFromBits(bits);
}

const ROW_STATUS_CLASSES = ['st-here', 'st-out', 'st-meeting', 'st-remote', 'st-trip', 'st-training', 'st-health', 'st-coadoc', 'st-home', 'st-off'];

function getEventMembersForDate(item, targetDate) {
  const today = new Date(targetDate || Date.now());
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const start = item.startDate || item.start || item.from || '';
  const end = item.endDate || item.end || item.to || '';
  const bits = item.membersBits || item.bits || '';
  const { memberIds, memberNames } = parseVacationMembersForDate(bits, todayStr, start, end);
  return { memberIds, memberNames, targetDate: todayStr };
}

function applyVacationStatus(tr, statusTd, statusSelect, titles) {
  const labelTitle = titles.join(' / ') || 'イベント';
  tr.dataset.event = '1';
  tr.dataset.eventTitle = labelTitle;
  if (!statusTd || !statusSelect) return;
  if (statusSelect.dataset.originalValue === undefined) {
    statusSelect.dataset.originalValue = statusSelect.value || '';
  }
  statusSelect.style.display = 'none';
  statusSelect.disabled = true;
  let vacationLabel = statusTd.querySelector('.vacation-status-label');
  if (!vacationLabel) {
    vacationLabel = document.createElement('div');
    vacationLabel.className = 'vacation-status-label';
    statusTd.appendChild(vacationLabel);
  }
  vacationLabel.textContent = labelTitle;
  vacationLabel.style.display = 'block';
  statusSelect.value = '休み';
  ROW_STATUS_CLASSES.forEach(cls => tr.classList.remove(cls));
  tr.classList.add('st-off');
  tr.dataset.status = '休み';
}

function restoreStatusField(tr, statusTd, statusSelect) {
  delete tr.dataset.event;
  delete tr.dataset.eventTitle;
  if (!statusTd || !statusSelect) return;
  statusSelect.style.display = '';
  statusSelect.disabled = false;
  const vacationLabel = statusTd.querySelector('.vacation-status-label');
  if (vacationLabel) { vacationLabel.style.display = 'none'; }
  if (statusSelect.dataset.originalValue !== undefined) {
    const originalValue = statusSelect.dataset.originalValue;
    statusSelect.value = originalValue;
    delete statusSelect.dataset.originalValue;
    ROW_STATUS_CLASSES.forEach(cls => tr.classList.remove(cls));
    const statusClassMap = new Map([
      ['在席', 'st-here'], ['外出', 'st-out'], ['会議', 'st-meeting'],
      ['在宅勤務', 'st-remote'], ['出張', 'st-trip'], ['研修', 'st-training'],
      ['健康診断', 'st-health'], ['コアドック', 'st-coadoc'], ['帰宅', 'st-home'], ['休み', 'st-off']
    ]);
    const cls = statusClassMap.get(originalValue);
    if (cls) tr.classList.add(cls);
    tr.dataset.status = originalValue;
  }
}

function applyEventHighlightForItems(eventItems, targetDate) {
  if (!board) {
    console.warn('applyEventHighlight: board element not found');
    return;
  }
  applyManualEventColorsToGantt();
  const normalizedTargetDate = normalizeEventDateKey(targetDate || Date.now());
  const manualColorForTarget = getManualEventColorForDate(normalizedTargetDate, appliedEventOfficeId || getEventTargetOfficeId());
  const hasManualColor = !!manualColorForTarget;
  // eventItems の順序はサーバーで設定された並びを保持する想定。
  // 同日に複数のイベントが重複する場合、配列先頭（上位）を優先して色や休暇固定の適用を行う。
  const colorClasses = getEventColorClasses();
  const effectMap = new Map();
  (eventItems || []).forEach(item => {
    const { memberIds } = getEventMembersForDate(item, targetDate);

    // ▼ ログ抑制のためコメントアウト
    /*
    if (!memberIds.length) {
      console.warn('applyEventHighlight: memberIds empty', {
        id: item.id || item.vacationId || '',
        title: item.title || '',
        targetDate,
        isVacation: item.isVacation !== false,
        start: item.startDate || item.start || item.from || '',
        end: item.endDate || item.end || item.to || ''
      });
    }
    */
    // ▲ ここまで

    memberIds.forEach(id => {
      const key = String(id);
      const ref = effectMap.get(key) || { vacations: [], highlights: [] };
      if (item.isVacation !== false) { ref.vacations.push(item); }
      ref.highlights.push(item);
      effectMap.set(key, ref);
    });
  });

  board.querySelectorAll('tbody tr').forEach(tr => {
    const key = String(tr.dataset.key || '');
    const effect = effectMap.get(key);
    const statusTd = tr.querySelector('td.status');
    const statusSelect = statusTd?.querySelector('select[name="status"]');
    tr.classList.remove('event-highlight', ...colorClasses);
    if (effect) {
      const manualColorKey = hasManualColor ? (normalizeEventColorKeyClient(manualColorForTarget) || paletteKeyToEventColor(manualColorForTarget) || manualColorForTarget) : '';
      const colorKey = hasManualColor ? manualColorKey : (effect.vacations[0]?.color || effect.highlights[0]?.color || '');
      const colorClass = getEventColorClass(colorKey);
      tr.classList.add('event-highlight');
      if (colorClass) { tr.classList.add(colorClass); }
      if (effect.vacations.length > 0) {

        applyVacationStatus(tr, statusTd, statusSelect, effect.vacations.map(v => v.title || 'イベント'));
      } else {
        restoreStatusField(tr, statusTd, statusSelect);
      }
    } else {
      restoreStatusField(tr, statusTd, statusSelect);
    }
  });
}

function updateEventLegend(items) {
  const target = document.getElementById('eventLegendModal') || document.getElementById('eventLegend');
  if (!target) return;
  target.textContent = '';
  if (!items || items.length === 0) {
    const span = document.createElement('span');
    span.className = 'event-legend-empty';
    span.textContent = '選択されたイベントはありません';
    target.appendChild(span);
    return;
  }
  items.forEach(item => {
    const pill = document.createElement('div');
    pill.className = 'event-legend-item';
    const dot = document.createElement('span');
    dot.className = `event-color-dot ${getEventColorClass(item.color)}`.trim();
    dot.title = EVENT_COLOR_LABELS[item.color] || '';
    const text = document.createElement('span');
    text.className = 'event-legend-text';
    text.textContent = item.title || 'イベント';
    const type = document.createElement('span');
    type.className = 'event-legend-type';
    type.textContent = item.isVacation === false ? '予定のみ' : '休暇固定';
    pill.append(dot, text, type);
    target.appendChild(pill);
  });
}

async function saveEventFromModal() {
  const officeId = (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
  const selectedId = eventSelectedId || (selectedEventIds?.[0] || '');
  if (!officeId || !selectedId) { toast('表示するイベントを取得できませんでした', false); return false; }
  const item = findCachedEvent(officeId, selectedId);
  if (!item) { toast('イベントの情報を取得できませんでした', false); return false; }
  const ctrl = getEventGanttController();
  const membersBits = ctrl ? ctrl.getBitsString() : (eventBitsInput?.value || '');
  const id = item.id || item.vacationId || selectedId;
  const bitsPayload = { id, membersBits };

  // ▼ 修正: 管理者用ペイロード作成（必要であれば使うが、今回は専用APIを使う）
  const adminPayload = {
    office: officeId,
    title: item.title || '',
    start: item.startDate || item.start || item.from || '',
    end: item.endDate || item.end || item.to || '',
    note: item.noticeTitle || item.note || item.memo || '',
    noticeId: item.noticeId || item.noticeKey || '',
    noticeTitle: item.noticeTitle || '',
    membersBits,
    isVacation: item.isVacation !== false,
    color: item.color || ''
  };
  if ('visible' in item) adminPayload.visible = item.visible;
  if (id) adminPayload.id = id;

  try {
    if (eventSyncTimer) {
      clearInterval(eventSyncTimer);
      eventSyncTimer = null;
    }

    let res = null;

    // ★修正: ユーザー権限でも保存できる専用API (setVacationBits) を使用
    res = await apiPost({
      action: 'setVacationBits',
      token: SESSION_TOKEN,
      office: officeId,
      data: JSON.stringify(bitsPayload)
    });

    // ★修正: 成功判定を厳密にする (res.ok が true であること)
    if (res && res.ok === true) {
      toast('イベントを保存しました');
      updateCachedMembersBits(officeId, id, membersBits);
      if (Array.isArray(res.vacations)) {
        cachedEvents = { officeId, list: res.vacations };
        await applyEventDisplay(selectedEventIds.length ? selectedEventIds : [id]);
        updateEventButtonVisibility(officeId, res.vacations);
      } else {
        // ▼ 修正: loadEventsを呼ばない（KVキャッシュが古いまま返されるため）
        // ローカルキャッシュは updateCachedMembersBits で既に更新済み
        await applyEventDisplay(selectedEventIds.length ? selectedEventIds : [id]);
      }

      if (SESSION_TOKEN) {
        setTimeout(() => {
          if (!eventSyncTimer) {
            startEventSync(false);
          }
        }, 5000);
      }

      return true;
    }

    // エラーの場合
    throw new Error(res && res.error ? String(res.error) : 'save_failed');

  } catch (err) {
    if (!eventSyncTimer && SESSION_TOKEN) {
      startEventSync(false);
    }
    console.error('saveEventFromModal error', err);
    toast('イベントの保存に失敗しました', false);
    throw err;
  }
}

async function applyEventDisplay(items) {
  const officeId = (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
  const sourceList = Array.isArray(items)
    ? (() => {
      const itemsAreIds = items.every(v => typeof v === 'string' || typeof v === 'number');
      if (itemsAreIds) {
        const baseList = cachedEvents.officeId === officeId ? cachedEvents.list : [];
        const idSet = new Set(items.map(v => String(v)));
        return (Array.isArray(baseList) ? baseList : []).filter(item => idSet.has(String(item?.id || item?.vacationId || '')));
      }
      return items;
    })()
    : (cachedEvents.officeId === officeId ? cachedEvents.list : []);
  const visibleItems = (Array.isArray(sourceList) ? sourceList : [])
    .filter(item => coerceVacationVisibleFlag(item?.visible));

  if (!officeId) { return false; }

  const ids = visibleItems.map(v => String(v.id || v.vacationId || '')).filter(Boolean);
  appliedEventIds = ids;
  appliedEventOfficeId = officeId;
  appliedEventTitles = visibleItems.map(v => v.title || 'イベント');

  applyEventHighlightForItems(visibleItems);
  updateEventLegend(visibleItems);
  updateEventCardStates();
  return true;
}

async function autoApplySavedEvent() {
  const officeId = CURRENT_OFFICE_ID || '';
  if (!officeId) { return; }
  let retries = 0;
  const maxRetries = 30;
  while (!board && retries < maxRetries) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }
  if (!board) { return; }
  try {
    await applyEventDisplay();
  } catch (err) {
    console.error('Auto-apply failed:', err);
  }
}

function startEventSync(immediate = false) {
  if (eventSyncTimer) { clearInterval(eventSyncTimer); eventSyncTimer = null; }
  if (!SESSION_TOKEN) return;
  const runSync = async () => {
    const officeId = getEventTargetOfficeId();
    if (!officeId) return;
    await refreshEventDataSilent(officeId);
    const forceReloadColors = !(typeof isOfficeAdmin === 'function' && isOfficeAdmin());
    await loadEventDateColors(officeId, { silent: true, force: forceReloadColors });
  };
  if (immediate) { runSync().catch(err => console.error('eventSync (immediate) failed', err)); }
  eventSyncTimer = setInterval(() => {
    runSync().catch(err => console.error('eventSync failed', err));
  }, EVENT_SYNC_INTERVAL_MS);
}

/* イベントカレンダー保存ボタン（手動保存） */
if (btnEventSave) {
  btnEventSave.addEventListener('click', async () => {
    btnEventSave.disabled = true;
    try {
      const success = await saveEventFromModal();
      if (!success) {
        // saveEventFromModal handles toast errors
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => { btnEventSave.disabled = false; }, 1000);
    }
  });
}

/* イベントカレンダー印刷 */
if (btnEventPrint) {
  btnEventPrint.addEventListener('click', () => {
    const dropdown = document.getElementById('eventSelectDropdown');
    if (!dropdown || !dropdown.value) {
      toast('印刷するイベントを選択してください', false);
      return;
    }

    const gantt = document.getElementById('eventGantt');
    if (!gantt || !gantt.querySelector('table')) {
      toast('カレンダーが表示されていません', false);
      return;
    }

    // 印刷用タイトルを更新
    const selectedOption = dropdown.options[dropdown.selectedIndex];
    const eventTitle = selectedOption ? selectedOption.textContent : '';
    const printInfo = document.getElementById('eventPrintInfo');
    if (printInfo && eventTitle) {
      printInfo.textContent = `イベントカレンダー: ${eventTitle}`;
    }

    // 印刷実行（スタイル制御は CSS の visibility: visible に任せる）
    window.print();
  });
}

/* レイアウト（JS + CSS両方で冗長に制御） */
const PANEL_MIN_PX = 760, GAP_PX = 20, MAX_COLS = 3;
const CARD_BREAKPOINT_PX = 760; // これより狭い幅ではカード表示を強制
