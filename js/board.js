/**
 * js/board.js - ボード描画・インタラクション
 *
 * 在席確認表のテーブル/カード描画とユーザー操作を管理する。
 *
 * 依存: js/constants/*.js, js/globals.js, js/utils.js
 * 参照元: js/sync.js (applyState), main.js
 *
 * @see MODULE_GUIDE.md
 */

/* === 時刻メニュー（07:00〜22:00） === */
/* TIME_RANGE_START_MIN, TIME_RANGE_END_MIN は constants/timing.js で定義 */
function buildTimeOptions(stepMin) {
  const frag = document.createDocumentFragment();
  frag.appendChild(el('option', { value: "", text: "" }));
  const step = Math.max(5, Math.min(60, Number(stepMin || 30)));
  for (let m = TIME_RANGE_START_MIN; m <= TIME_RANGE_END_MIN; m += step) {
    const h = Math.floor(m / 60), mm = m % 60;
    const t = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    frag.appendChild(el('option', { value: t, text: t }));
  }
  return frag;
}

function buildCandidateList(options) {
  const vals = [''].concat(Array.isArray(options) ? options.map(v => String(v ?? '')) : []);
  const ul = el('ul', { class: 'candidate-list' });
  vals.forEach(v => {
    const label = v === '' ? '（空白）' : v;
    const btn = el('button', {
      type: 'button',
      class: 'candidate-option',
      'data-value': v,
      text: label
    });
    ul.appendChild(el('li', {}, [btn]));
  });
  return ul;
}

function renderCandidatePanel(panel, type) {
  if (!panel) return;
  const options = type === 'workHours' ? (MENUS?.businessHours || []) : (MENUS?.noteOptions || []);
  panel.replaceChildren();
  panel.appendChild(buildCandidateList(options));
}

function hideAllCandidatePanels() {
  board.querySelectorAll('.candidate-panel.show').forEach(p => {
    p.classList.remove('show');
    const btn = p.closest('.candidate-input')?.querySelector('.candidate-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

let contactHoldTimer = null;
let contactScrollBound = false;
let currentContactOverlay = null;

/**
 * IDからメンバー情報を取得する (Phase 4)
 * @param {string} id
 * @returns {Object|null}
 */
function findMemberById(id) {
  if (!id || !Array.isArray(GROUPS)) return null;
  for (const g of GROUPS) {
    if (!g.members) continue;
    const m = g.members.find(x => x.id === id);
    if (m) return m;
  }
  return null;
}

/**
 * 現在の拠点設定に基づき、ポップアップ表示対象のカラムキー配列を返す。
 * @returns {string[]}
 */
function getEnabledPopupColumns() {
  const defaultKeys = ['ext', 'mobile', 'email'];
  if (!OFFICE_COLUMN_CONFIG || !Array.isArray(OFFICE_COLUMN_CONFIG.popup)) {
    return defaultKeys;
  }
  return OFFICE_COLUMN_CONFIG.popup;
}

function clearContactHoldTimer() {
  if (contactHoldTimer) {
    clearTimeout(contactHoldTimer);
    contactHoldTimer = null;
  }
}

function bindContactScrollClearer() {
  if (contactScrollBound) return;
  contactScrollBound = true;
  window.addEventListener('scroll', clearContactHoldTimer, { passive: true, capture: true });
}

function closeContactPopup() {
  if (currentContactOverlay) {
    currentContactOverlay.remove();
    currentContactOverlay = null;
  }
  document.removeEventListener('keydown', handleContactEsc);
}

function handleContactEsc(e) {
  if (e.key === 'Escape') closeContactPopup();
}

function showContactPopup(member) {
  if (!member) return;
  closeContactPopup();
  const overlay = el('div', { class: 'contact-overlay' });
  const dialogLabel = `${sanitizeText(member.name || '')}の連絡先`;
  const dialog = el('div', { class: 'contact-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': dialogLabel });
  const closeBtn = el('button', { type: 'button', class: 'contact-close', 'aria-label': '閉じる' }, ['×']);
  const title = el('h4', { class: 'contact-title', text: dialogLabel });

  const popupKeys = getEnabledPopupColumns();
  const body = el('div', { class: 'contact-body' });
  
  popupKeys.forEach(k => {
    const def = getColumnDefinition(k);
    if (!def) return;
    
    const val = String(member[k] || '').trim();
    const row = el('div', { class: 'contact-row' }, [
      el('span', { class: 'contact-label', text: def.label })
    ]);
    
    if (val) {
      let href = '';
      // 特徴的なプレフィックス設定
      if (k === 'ext' || k === 'mobile') href = `tel:${val}`;
      else if (k === 'email') href = `mailto:${encodeURIComponent(val)}`;
      
      if (href) {
        row.appendChild(el('a', { class: 'contact-link', href: href, text: val }));
      } else {
        // リンクではない通常の表示
        row.appendChild(el('span', { class: 'contact-link', style: 'text-decoration:none; cursor:default;', text: val }));
      }
    } else {
      row.appendChild(el('span', { class: 'contact-empty', text: '未登録' }));
    }
    body.appendChild(row);
  });

  closeBtn.addEventListener('click', closeContactPopup);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeContactPopup(); });
  document.addEventListener('keydown', handleContactEsc);

  dialog.append(closeBtn, title, body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  currentContactOverlay = overlay;
  closeBtn.focus({ preventScroll: true });
}



function toggleCandidatePanel(wrapper) {
  if (!wrapper) return;
  const panel = wrapper.querySelector('.candidate-panel');
  const btn = wrapper.querySelector('.candidate-btn');
  const type = wrapper.dataset.type;
  if (!panel || !type) return;
  const isOpen = panel.classList.contains('show');
  hideAllCandidatePanels();
  if (isOpen) {
    panel.classList.remove('show');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    return;
  }
  renderCandidatePanel(panel, type);
  panel.classList.add('show');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function buildCandidateField({ id, name, placeholder, type, value }) {
  const wrapper = el('div', { class: 'candidate-input', 'data-type': type });
  const input = el('input', {
    id,
    name,
    type: 'text',
    placeholder,
    autocomplete: 'off',
    inputmode: 'text'
  });
  if (value != null) input.value = value;

  let btn = null;
  if (type !== 'note' && type !== 'workHours') {
    btn = el('button', {
      type: 'button',
      class: 'candidate-btn',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-label': '候補を表示'
    });
    btn.innerHTML = '▼';
  }

  const panel = el('div', { class: 'candidate-panel', role: 'listbox' });

  wrapper.appendChild(input);
  if (btn) wrapper.appendChild(btn);
  wrapper.appendChild(panel);

  if (type === 'note' || type === 'workHours') {
    input.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!panel.classList.contains('show')) {
        hideAllCandidatePanels();
        renderCandidatePanel(panel, type);
        panel.classList.add('show');
      }
    });
  }

  return { wrapper, input };
}

let candidatePanelGlobalsBound = false;
function bindCandidatePanelGlobals() {
  if (candidatePanelGlobalsBound) return;
  candidatePanelGlobalsBound = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.candidate-input')) hideAllCandidatePanels();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAllCandidatePanels();
  });
}

/* --- 動的カラムユーティリティ (Phase 3) --- */
/**
 * 現在の拠点設定に基づき、表示対象のカラムキー配列を返す。
 * 設定がない場合はデフォルトの6カラムを返す。
 * @returns {string[]}
 */
function getEnabledColumns() {
  console.log('[board.js] Initializing render with configuration:', OFFICE_COLUMN_CONFIG);
  const defaultKeys = ['name', 'workHours', 'status', 'time', 'tomorrowPlan', 'note'];
  if (!OFFICE_COLUMN_CONFIG || !Array.isArray(OFFICE_COLUMN_CONFIG.board)) {
    return defaultKeys;
  }
  // 設定がある場合はそれを使用（ただし氏名は必須とする）
  let keys = OFFICE_COLUMN_CONFIG.board.slice();
  if (!keys.includes('name')) keys.unshift('name');
  return keys;
}

/* 行UI */
function buildRow(member) {
  const key = member.id;
  const rev = member.updated ? String(member.updated) : '0';
  const tr = el('tr', { id: `row-${key}` });
  tr.dataset.key = key;
  tr.dataset.rev = rev;
  tr.dataset.serverUpdated = rev;
  
  // 拡張データ（モバイル/メール/内線）はデータ属性に保持（ポップアップ等で使用）
  tr.dataset.extension = member.ext || '';
  tr.dataset.mobile = member.mobile || '';
  tr.dataset.email = member.email || '';

  const enabledKeys = getEnabledColumns();

  enabledKeys.forEach(colKey => {
    const def = getColumnDefinition(colKey);
    if (!def) return;

    const td = el('td', { class: def.tableClass, 'data-label': def.dataLabel });
    
    switch (colKey) {
      case 'name':
        // 外字置換サービスを適用
        const displayName = (typeof DictionaryService !== 'undefined') 
          ? DictionaryService.formatName(member.name || "")
          : (member.name || "");
        td.textContent = sanitizeText(displayName);
        break;
      
      case 'status': {
        const sel = el('select', { id: `status-${key}`, name: 'status' });
        td.appendChild(el('label', { class: 'sr-only', for: `status-${key}`, text: 'ステータス' }));
        STATUSES.forEach(s => sel.appendChild(el('option', { value: s.value, text: s.value })));
        sel.value = member.status || STATUSES[0]?.value || "";
        td.appendChild(sel);
        break;
      }
      
      case 'time': {
        const sel = el('select', { id: `time-${key}`, name: 'time' });
        td.appendChild(el('label', { class: 'sr-only', for: `time-${key}`, text: '戻り時間' }));
        sel.appendChild(buildTimeOptions(MENUS?.timeStepMinutes));
        sel.value = member.time || "";
        td.appendChild(sel);
        break;
      }
      
      case 'workHours': {
        const val = member.workHours == null ? '' : String(member.workHours);
        const field = buildCandidateField({ id: `work-${key}`, name: 'workHours', placeholder: '09:00-17:30', type: 'workHours', value: val });
        td.appendChild(el('label', { class: 'sr-only', for: `work-${key}`, text: '業務時間' }));
        td.appendChild(field.wrapper);
        break;
      }
      
      case 'tomorrowPlan': {
        const sel = el('select', { id: `tomorrow-plan-${key}`, name: 'tomorrowPlan' });
        td.appendChild(el('label', { class: 'sr-only', for: `tomorrow-plan-${key}`, text: '明日の予定' }));
        const planOptions = Array.isArray(MENUS?.tomorrowPlanOptions) ? MENUS.tomorrowPlanOptions : [];
        sel.appendChild(el('option', { value: '', text: '' }));
        planOptions.forEach(v => sel.appendChild(el('option', { value: String(v), text: String(v) })));
        sel.value = member.tomorrowPlan == null ? '' : String(member.tomorrowPlan);
        td.appendChild(sel);
        break;
      }
      
      case 'note': {
        const field = buildCandidateField({ id: `note-${key}`, name: 'note', placeholder: '備考', type: 'note', value: member.note || "" });
        td.appendChild(field.wrapper);
        break;
      }
      
      default:
        // ext, mobile, email 等の表示専用カラム
        td.textContent = member[def.dbField] || "";
        break;
    }
    
    tr.appendChild(td);
  });

  return tr;
}

/* 既存行の自己修復 */
function ensureRowControls(tr) {
  if (!tr) return;
  const key = tr.dataset.key;
  let s = tr.querySelector('td.status select');
  if (!s) {
    const td = tr.querySelector('td.status');
    s = el('select', { id: `status-${key}`, name: 'status' });
    STATUSES.forEach(x => s.appendChild(el('option', { value: x.value, text: x.value })));
    td && td.appendChild(s);
    diagAdd('fix: status select injected');
  }
  let t = tr.querySelector('td.time select');
  if (!t) {
    const td = tr.querySelector('td.time');
    t = el('select', { id: `time-${key}`, name: 'time' });
    t.appendChild(buildTimeOptions(MENUS?.timeStepMinutes));
    td && td.appendChild(t);
    diagAdd('fix: time select injected');
  }

  let p = tr.querySelector('td.tomorrow-plan select');
  if (!p) {
    const td = tr.querySelector('td.tomorrow-plan');
    p = el('select', { id: `tomorrow-plan-${key}`, name: 'tomorrowPlan' });
    if (td && !td.querySelector('label.sr-only')) {
      td.insertBefore(el('label', { class: 'sr-only', for: `tomorrow-plan-${key}`, text: '明日の予定' }), td.firstChild || null);
    }
    p.appendChild(el('option', { value: '', text: '' }));
    const planOptions = Array.isArray(MENUS?.tomorrowPlanOptions) ? MENUS.tomorrowPlanOptions : [];
    planOptions.forEach(v => p.appendChild(el('option', { value: String(v), text: String(v) })));
    td && td.appendChild(p);
    diagAdd('fix: tomorrow plan select injected');
  }

  let w = tr.querySelector('input[name="workHours"]');
  if (!w || !w.closest('.candidate-input')) {
    const td = tr.querySelector('td.work');
    const placeholder = '09:00-17:30';
    const field = buildCandidateField({ id: `work-${key}`, name: 'workHours', placeholder, type: 'workHours', value: w?.value });
    if (td) {
      if (!td.querySelector('label.sr-only')) {
        td.insertBefore(el('label', { class: 'sr-only', for: `work-${key}`, text: '業務時間' }), td.firstChild || null);
      }
      td.querySelector('.candidate-input')?.remove();
      td.appendChild(field.wrapper);
      w = field.input;
    }
    diagAdd('fix: workHours candidate field injected');
  }
  const noteInp = tr.querySelector('input[name="note"]');
  if (!noteInp || !noteInp.closest('.candidate-input')) {
    const td = tr.querySelector('td.note');
    const field = buildCandidateField({ id: `note-${key}`, name: 'note', placeholder: '備考', type: 'note', value: noteInp?.value });
    if (td) {
      td.querySelector('.candidate-input')?.remove();
      td.appendChild(field.wrapper);
    }
    diagAdd('fix: note candidate field injected');
  }
}

/* 描画 */
function buildPanel(group, idx) {
  const gid = `grp-${idx}`; const sec = el('section', { class: 'panel', id: gid }); sec.dataset.groupIndex = String(idx);
  const title = fallbackGroupTitle(group, idx); sec.appendChild(el('h3', { class: 'title', text: title }));
  const table = el('table', { 'aria-label': `在席表（${title}）` });
  
  const enabledKeys = getEnabledColumns();
  
  /**
   * カラム幅の適用ヘルパー
   * columnWidths 設定があればインラインスタイルで上書きし、
   * CSS のデフォルト値よりも優先させる。
   * SSOT: ベース幅は COLUMN_DEFINITIONS.defaultWidth を参照
   * @param {HTMLElement} element - 幅を適用する要素
   * @param {Object|undefined} w - { min, max } の幅設定
   * @param {string} k - カラムキー
   */

  // どのカラムを「強欲なストレッチ列 (width: 100%)」にするか決定
  // 幅設定がないカラムのうち、最も右にあるものを採用する
  const colWidths = (OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.columnWidths) || {};
  let stretchKey = null;
  enabledKeys.forEach(k => {
    const config = colWidths[k];
    const def = getColumnDefinition(k);
    if (!def) return;

    let maxVal = null;
    if (config && config.max) {
      maxVal = parseInt(config.max);
      if (isNaN(maxVal)) maxVal = null;
    } else if (!config) {
      maxVal = def.defaultWidth;
      // 既存の note 自動拡張ルールを維持
      if (k === 'note') maxVal = null;
    }
    // 指定値がない（null）のカラムをストレッチ候補とする
    if (maxVal == null) stretchKey = k;
  });

  const applyWidthStyle = (element, w, k, isStretch) => {
    const def = getColumnDefinition(k);
    if (!def) return;

    let minVal = null;
    let maxVal = null;

    if (w) {
      if (w.min != null && w.min !== '') {
        const p = parseInt(w.min);
        if (!isNaN(p)) minVal = p;
      }
      if (w.max != null && w.max !== '') {
        const p = parseInt(w.max);
        if (!isNaN(p)) maxVal = p;
      }
    } else {
      minVal = def.defaultWidth;
      maxVal = def.defaultWidth;
      if (k === 'note') maxVal = null;
    }

    if (minVal != null) element.style.minWidth = `${minVal}px`;

    if (maxVal != null) {
      element.style.maxWidth = `${maxVal}px`;
      element.style.width = `${maxVal}px`;
    } else {
      element.style.maxWidth = 'none';
      if (isStretch) {
        // ストレッチ担当カラムのみ、余白を吸い取る 100% を付与
        element.style.width = '100%';
      } else {
        // それ以外の未指定カラムは内容に合わせる
        element.style.width = 'auto';
      }
    }
  };

  // colgroup の動的生成（幅制約を適用）
  const colgroup = el('colgroup');
  enabledKeys.forEach(k => {
    const def = getColumnDefinition(k);
    const tableClass = def ? def.tableClass : k;
    const colEl = el('col', { class: `col-${tableClass}` });
    applyWidthStyle(colEl, colWidths[k], k, k === stretchKey);
    colgroup.appendChild(colEl);
  });
  table.appendChild(colgroup);

  // thead の動的生成（th にも幅制約を適用して確実にレンダリングに反映）
  const thead = el('thead');
  const thr = el('tr');
  enabledKeys.forEach(k => {
    const def = getColumnDefinition(k);
    if (def) {
      const thAttributes = { text: def.label, class: def.tableClass };
      if (def.description) {
        thAttributes.title = def.description;
      }
      const th = el('th', thAttributes);
      applyWidthStyle(th, colWidths[k], k);
      thr.appendChild(th);
    }
  });
  thead.appendChild(thr);
  table.appendChild(thead);

  const tbody = el('tbody');
  group.members.forEach(m => {
    tbody.appendChild(buildRow(m));
  });
  table.appendChild(tbody);
  
  sec.appendChild(table);
  return sec;
}
function render() {
  board.replaceChildren();
  const frag = document.createDocumentFragment();
  GROUPS.forEach((g, i) => frag.appendChild(buildPanel(g, i)));
  board.appendChild(frag);

  // 修正箇所: u-hidden クラスを削除し、確実に表示されるようにする
  board.classList.remove('u-hidden');
  board.style.display = '';

  // 自己修復
  board.querySelectorAll('tbody tr').forEach(ensureRowControls);
  wireEvents(); recolor();
  try {
    startGridObserver();
  } catch (e) {
    console.error(e);
  } finally {
    buildGroupMenu();
    updateCols();
  }
  buildStatusFilterOptions(); updateStatusFilterCounts();
  applyFilters();
  if (window.VacationGantt) {
    try {
      window.VacationGantt.rebuild();
    } catch (e) {
      console.error(e);
    }
  }
}

/* グループメニュー */
function buildGroupMenu() {
  menuList.replaceChildren();
  if (!Array.isArray(GROUPS)) return;
  const total = (GROUPS || []).reduce((s, g) => s + ((g.members && g.members.length) || 0), 0);
  menuTitle.textContent = 'グループにジャンプ';
  menuList.appendChild(el('li', {}, [el('button', { class: 'grp-item', 'role': 'menuitem', 'data-target': 'top', text: `全体（合計：${total}名）` })]));
  GROUPS.forEach((g, i) => { const title = fallbackGroupTitle(g, i); const sub = (g && g.members && g.members.length) ? `（${g.members.length}名）` : '（0名）'; menuList.appendChild(el('li', {}, [el('button', { class: 'grp-item', 'role': 'menuitem', 'data-target': `grp-${i}` }, [title, el('span', { class: 'muted', text: ` ${sub}` })])])) });
  menuList.querySelectorAll('button.grp-item').forEach(btn => btn.addEventListener('click', () => { const id = btn.getAttribute('data-target'); closeMenu(); if (id === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } const sec = document.getElementById(id); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}
function openMenu() { menuEl.classList.add('show'); titleBtn.setAttribute('aria-expanded', 'true'); }
function closeMenu() { menuEl.classList.remove('show'); titleBtn.setAttribute('aria-expanded', 'false'); }
function toggleMenu() { menuEl.classList.contains('show') ? closeMenu() : openMenu(); }
titleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', (e) => { if (menuEl.classList.contains('show')) { const within = menuEl.contains(e.target) || titleBtn.contains(e.target); if (!within) closeMenu(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

/* 行状態 */
function getRowStateByTr(tr) {
  if (!tr) return { ext: "", workHours: "", status: STATUSES[0]?.value || "在席", time: "", tomorrowPlan: "", note: "" };
  const workHoursInput = tr.querySelector('input[name="workHours"]');
  return {
    ext: tr.querySelector('td.ext')?.textContent.trim() || "",
    workHours: workHoursInput ? workHoursInput.value : "",
    status: tr.querySelector('select[name="status"]').value,
    time: tr.querySelector('select[name="time"]').value,
    tomorrowPlan: tr.querySelector('select[name="tomorrowPlan"]')?.value || "",
    note: tr.querySelector('input[name="note"]').value
  };
}
function getRowState(id) { return getRowStateByTr(document.getElementById(`row-${id}`)); }
function getState() { const data = {}; board.querySelectorAll("tbody tr").forEach(tr => { data[tr.dataset.key] = getRowStateByTr(tr); }); return data; }

/* 編集適用 */
function isEditingField(el) { return !!(el && ((el.dataset && el.dataset.editing === '1') || (el.dataset && el.dataset.composing === '1') || el === document.activeElement)); }
function setIfNeeded(el, v) { if (!el) return; if (isEditingField(el)) return; if (el.value !== (v ?? "")) el.value = v ?? ""; }

// ★修正: applyState は js/sync.js 側に移動（キャッシュ処理集約のため）
// ここにあった重複定義を削除しました

function recolor() { board.querySelectorAll("tbody tr").forEach(tr => { const st = tr.querySelector('select[name="status"]')?.value || ""; statusClassMap.forEach(cls => tr.classList.remove(cls)); const cls = statusClassMap.get(st); if (cls) tr.classList.add(cls); tr.dataset.status = st; }); }
function toggleTimeEnable(statusEl, timeEl) {
  const needsTime = requiresTimeSet.has(statusEl.value);
  if (!timeEl) return;
  const timeTd = timeEl.closest('td.time');
  if (needsTime) {
    timeEl.setAttribute('aria-disabled', 'false');
    timeEl.tabIndex = 0;
    timeTd?.classList.remove('time-disabled');
  } else {
    timeEl.setAttribute('aria-disabled', 'true');
    timeEl.tabIndex = -1;
    timeTd?.classList.add('time-disabled');
  }
}
function ensureTimePrompt(tr) {
  if (!tr) return;
  const statusEl = tr.querySelector('select[name="status"]');
  const timeTd = tr.querySelector('td.time');
  const timeEl = tr.querySelector('select[name="time"]');
  if (!(statusEl && timeTd && timeEl)) return;
  const needs = requiresTimeSet.has(statusEl.value);
  const empty = !timeEl.value;
  if (needs && empty) {
    timeTd.classList.add('need-time');
    timeEl.setAttribute('aria-invalid', 'true');
    let hint = timeTd.querySelector('.time-hint');
    if (!hint) { hint = document.createElement('span'); hint.className = 'time-hint'; hint.textContent = '戻り時間を選択'; timeTd.appendChild(hint); }
  } else {
    timeTd.classList.remove('need-time');
    timeEl.removeAttribute('aria-invalid');
    const hint = timeTd.querySelector('.time-hint'); if (hint) hint.remove();
  }
}

/* ローカル保存 */
function localKey() { return `${storeKeyBase}:${CURRENT_OFFICE_ID || '__none__'}:${CONFIG_UPDATED || 0}`; }
function saveLocal() { }
function loadLocal() { }

/* 同期（行ごとデバウンス送信） */
const rowTimers = new Map();
function debounceRowPush(key, delay = 900) { PENDING_ROWS.add(key); if (rowTimers.has(key)) clearTimeout(rowTimers.get(key)); rowTimers.set(key, setTimeout(() => { rowTimers.delete(key); pushRowDelta(key); }, delay)); }

function clearPendingRows() {
  rowTimers.forEach(timerId => {
    try { clearTimeout(timerId); } catch { }
  });
  rowTimers.clear();
  PENDING_ROWS.clear();
}

/* 入力イベント（IME配慮・デバウンス） */
function wireEvents() {
  bindCandidatePanelGlobals();

  // 連絡先ロングプレス（Event Delegation）
  const HOLD_DELAY_MS = 900;
  const MOVE_TOLERANCE_PX = 10;
  let startTouchPoint = null;
  let currentTargetTd = null;

  const startHold = (touchPoint, td) => {
    clearContactHoldTimer();
    currentTargetTd = td;
    startTouchPoint = touchPoint ? { x: touchPoint.clientX, y: touchPoint.clientY } : null;
    contactHoldTimer = setTimeout(() => {
      contactHoldTimer = null;
      if (!currentTargetTd) return;
      const tr = currentTargetTd.closest('tr');
      const member = findMemberById(tr?.dataset.key);
      if (member) showContactPopup(member);
      currentTargetTd = null;
    }, HOLD_DELAY_MS);
  };

  const cancelHold = () => {
    startTouchPoint = null;
    currentTargetTd = null;
    clearContactHoldTimer();
  };

  board.addEventListener('touchstart', (e) => {
    const td = e.target.closest('td.name');
    if (!td) return;
    // e.preventDefault(); // ここではpreventDefaultしない（スクロールやタップ判定に影響するため）
    const touch = e.touches?.[0];
    startHold(touch, td);
  }, { passive: true }); // passive: true にしてスクロール性能を確保

  board.addEventListener('touchend', cancelHold);
  board.addEventListener('touchcancel', cancelHold);

  board.addEventListener('touchmove', (e) => {
    if (!startTouchPoint || !contactHoldTimer) return;
    const touch = e.touches?.[0];
    if (!touch) {
      cancelHold();
      return;
    }
    const dx = Math.abs(touch.clientX - startTouchPoint.x);
    const dy = Math.abs(touch.clientY - startTouchPoint.y);
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
      cancelHold();
    }
  }, { passive: true });

  board.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const td = e.target.closest('td.name');
    if (!td) return;
    startHold(null, td);
  });

  board.addEventListener('mouseup', cancelHold);
  board.addEventListener('mouseleave', cancelHold);

  bindContactScrollClearer();

  board.addEventListener('click', (e) => {
    const candidateBtn = e.target.closest('.candidate-btn');
    if (candidateBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleCandidatePanel(candidateBtn.closest('.candidate-input'));
      return;
    }

    const candidateOpt = e.target.closest('.candidate-option');
    if (candidateOpt) {
      e.preventDefault();
      const wrapper = candidateOpt.closest('.candidate-input');
      const input = wrapper?.querySelector('input');
      if (input) {
        input.value = candidateOpt.dataset.value ?? '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
      hideAllCandidatePanels();
      return;
    }
  });

  // IME対策
  board.addEventListener('compositionstart', e => { const t = e.target; if (t && t.dataset) t.dataset.composing = '1'; });
  board.addEventListener('compositionend', e => { const t = e.target; if (t && t.dataset) delete t.dataset.composing; });

  board.addEventListener('focusin', e => {
    const t = e.target;
    if (t && t.dataset) t.dataset.editing = '1';
    if (t && (t.name === 'status' || t.name === 'time' || t.name === 'tomorrowPlan')) {
      t.dataset.prevValue = t.value;
    }
    if (t && t.name === 'time' && t.dataset) {
      t.dataset.editingTime = '1';
    }
  });
  board.addEventListener('focusout', e => {
    const t = e.target;
    if (!(t && t.dataset)) return;
    const tr = t.closest('tr');
    const key = tr?.dataset.key;
    if ((t.name === 'note' || t.name === 'workHours') && key && PENDING_ROWS.has(key)) { t.dataset.editing = '1'; }
    else { delete t.dataset.editing; }
    if (t.name === 'status' || t.name === 'time' || t.name === 'tomorrowPlan') {
      delete t.dataset.prevValue;
    }
    if (t.name === 'time') {
      delete t.dataset.editingTime;
    }
  });
  // 入力（備考：入力中は自動更新停止 → setIfNeeded が弾く）
  board.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t && t.name)) return;
    const tr = t.closest('tr'); if (!tr) return;
    const key = tr.dataset.key;
    if (t.name === 'note') { debounceRowPush(key); return; }
    if (t.name === 'workHours') { debounceRowPush(key); return; }
  });

  // 変更（ステータス/時間/明日の予定）
  const handleStatusTimeChange = (e) => {
    const t = e.target;
    if (!t) return;
    const tr = t.closest('tr'); if (!tr) return;
    const key = tr.dataset.key;
    const prevVal = t.dataset?.prevValue;
    const lastCommitted = t.dataset?.lastCommittedValue;

    if (prevVal !== undefined && prevVal === t.value) return;
    if (lastCommitted !== undefined && lastCommitted === t.value) return;

    if (t.dataset) {
      t.dataset.prevValue = t.value;
    }

    if (t.name === 'status') {
      t.dataset.editing = '1';
      const timeSel = tr.querySelector('select[name="time"]');
      const noteInp = tr.querySelector('input[name="note"]');
      const isEditingTime = timeSel?.dataset?.editingTime === '1';
      const timeDisabled = timeSel?.getAttribute('aria-disabled') === 'true';

      if (!isEditingTime) {
        toggleTimeEnable(t, timeSel);
      }
      const timeDisabledAfter = timeSel?.getAttribute('aria-disabled') === 'true';


      if (!isEditingTime && clearOnSet.has(t.value)) {
        if (timeSel) timeSel.value = '';
        if (noteInp && isNotePresetValue(noteInp.value)) { noteInp.value = ''; }
      }

      ensureTimePrompt(tr);
      recolor();
      updateStatusFilterCounts();
      if (t.dataset) t.dataset.lastCommittedValue = t.value;
      debounceRowPush(key);
      return;
    }

    if (t.name === 'time' || t.name === 'tomorrowPlan') {
      t.dataset.editing = '1';

      ensureTimePrompt(tr);
      if (t.dataset) t.dataset.lastCommittedValue = t.value;
      debounceRowPush(key);
      return;
    }
  };

  board.addEventListener('change', handleStatusTimeChange);
}
