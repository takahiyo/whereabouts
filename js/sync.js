/* ===== メニュー・正規化・通信・同期 ===== */
const DEFAULT_BUSINESS_HOURS = [
  "07:00-15:30",
  "07:30-16:00",
  "08:00-16:30",
  "08:30-17:00",
  "09:00-17:30",
  "09:30-18:00",
  "10:00-18:30",
  "10:30-19:00",
  "11:00-19:30",
  "11:30-20:00",
  "12:00-20:30",
];

// ハイブリッド同期用の状態管理
let useSdkMode = false;
let unsubscribeSnapshot = null;
let fallbackTimer = null;

// ★修正: STATE_CACHE と lastSyncTimestamp を localStorage から初期化
let STATE_CACHE = {};
let lastSyncTimestamp = 0;

// Configからキーを取得（読み込み順序に依存するため安全策をとる）
const STORAGE_KEY_CACHE = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys) ? CONFIG.storageKeys.stateCache : 'whereabouts_state_cache';
const STORAGE_KEY_SYNC = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys) ? CONFIG.storageKeys.lastSync : 'whereabouts_last_sync';

try {
  const cached = localStorage.getItem(STORAGE_KEY_CACHE);
  if (cached) {
    STATE_CACHE = JSON.parse(cached);
  }
  // ★追加: 最終同期時刻も復元する
  const cachedTs = localStorage.getItem(STORAGE_KEY_SYNC);
  if (cachedTs) {
    const ts = Number(cachedTs);
    if (Number.isFinite(ts)) {
      lastSyncTimestamp = ts;
    }
  }
} catch (e) {
  console.error("Local cache restore failed:", e);
}

function defaultMenus() {
  return {
    timeStepMinutes: 30,
    statuses: [
      { value: "在席", class: "st-here", clearOnSet: true },
      { value: "外出", requireTime: true, class: "st-out" },
      { value: "在宅勤務", class: "st-remote", clearOnSet: true },
      { value: "出張", requireTime: true, class: "st-trip" },
      { value: "研修", requireTime: true, class: "st-training" },
      { value: "健康診断", requireTime: true, class: "st-health" },
      { value: "コアドック", requireTime: true, class: "st-coadoc" },
      { value: "帰宅", class: "st-home" },
      { value: "休み", class: "st-off", clearOnSet: true }
    ],
    noteOptions: ["直出", "直帰", "直出・直帰"],
    businessHours: DEFAULT_BUSINESS_HOURS.slice()
  };
}

function normalizeBusinessHours(arr) {
  if (Array.isArray(arr)) {
    if (arr.length === 0) {
      return [];
    }
    return arr.map(v => String(v ?? ""));
  }
  return DEFAULT_BUSINESS_HOURS.slice();
}

function buildWorkHourOptions(hours) {
  const list = Array.isArray(hours) ? hours : [];
  const frag = document.createDocumentFragment();

  if (!list.length) {
    return frag;
  }

  const optBlank = document.createElement('option');
  optBlank.value = "";
  optBlank.label = "（空白）";
  optBlank.textContent = "（空白）";
  frag.appendChild(optBlank);

  list.forEach(value => {
    const s = String(value ?? "");
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    frag.appendChild(opt);
  });

  return frag;
}
function setupMenus(m) {
  const base = defaultMenus();
  MENUS = (m && typeof m === 'object') ? Object.assign({}, base, m) : base;
  if (!Array.isArray(MENUS.businessHours)) {
    const legacy1 = Array.isArray(MENUS.workHourOptions) ? MENUS.workHourOptions : null;
    const legacy2 = Array.isArray(MENUS.workHoursOptions) ? MENUS.workHoursOptions : null;
    MENUS.businessHours = legacy1 || legacy2 || MENUS.businessHours;
  }

  if (!Array.isArray(MENUS.statuses)) MENUS.statuses = base.statuses;
  if (!Array.isArray(MENUS.noteOptions)) MENUS.noteOptions = base.noteOptions;
  MENUS.businessHours = normalizeBusinessHours(MENUS.businessHours);
  const sts = Array.isArray(MENUS.statuses) ? MENUS.statuses : base.statuses;

  STATUSES = sts.map(s => ({ value: String(s.value) }));
  requiresTimeSet = new Set(sts.filter(s => s.requireTime).map(s => String(s.value)));
  clearOnSet = new Set(sts.filter(s => s.clearOnSet).map(s => String(s.value)));
  statusClassMap = new Map(sts.map(s => [String(s.value), String(s.class || "")]));

  let dl = document.getElementById('noteOptions');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'noteOptions'; document.body.appendChild(dl); }
  dl.replaceChildren();
  const optBlank = document.createElement('option'); optBlank.value = ""; optBlank.label = "（空白）"; optBlank.textContent = "（空白）"; dl.appendChild(optBlank);
  (MENUS.noteOptions || []).forEach(t => { const opt = document.createElement('option'); opt.value = String(t); dl.appendChild(opt); });

  let workDl = document.getElementById('workHourOptions');
  if (!workDl) { workDl = document.createElement('datalist'); workDl.id = 'workHourOptions'; document.body.appendChild(workDl); }
  workDl.replaceChildren();
  workDl.appendChild(buildWorkHourOptions(MENUS.businessHours));

  buildStatusFilterOptions();
}
function isNotePresetValue(val) {
  const v = (val == null ? "" : String(val)).trim();
  if (v === "") return true;
  const set = new Set((MENUS?.noteOptions || []).map(x => String(x)));
  return set.has(v);
}
function fallbackGroupTitle(g, idx) {
  const t = (g && g.title != null) ? String(g.title).trim() : "";
  return t || `グループ${idx + 1}`;
}
function getRosterOrdering() {
  return (GROUPS || []).map((g, gi) => ({
    title: fallbackGroupTitle(g, gi),
    members: (g.members || []).map((m, mi) => ({
      id: (m && m.id != null && String(m.id)) ? String(m.id) : `__auto_${gi}_${mi}`,
      name: String(m?.name || ""),
      ext: String(m?.ext || ""),
      mobile: String(m?.mobile || ""),
      email: String(m?.email || ""),
      order: mi
    }))
  }));
}
function normalizeConfigClient(cfg) {
  const groups = (cfg && Array.isArray(cfg.groups)) ? cfg.groups : [];
  return groups.map(g => {
    const members = Array.isArray(g.members) ? g.members : [];
    return {
      title: g.title || "",
      members: members.map(m => ({
        id: String(m.id ?? "").trim(),
        name: String(m.name ?? ""),
        ext: String(m.ext ?? ""),
        mobile: String(m.mobile ?? ""),
        email: String(m.email ?? ""),
        workHours: m.workHours == null ? '' : String(m.workHours)
      })).filter(m => m.id || m.name)
    };
  });
}

// Plan B: Workers経由のポーリング
// ★修正: 引数 isInitial を追加し、初回のみ nocache を送る
async function startLegacyPolling(immediate) {
  useSdkMode = false;
  // ★削除: lastSyncTimestamp = 0; を削除し、以前の同期時刻を維持する

  if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }

  // ポーリング実行関数
  const pollAction = async (isFirstRun = false) => {
    const payload = { action: 'get', token: SESSION_TOKEN, since: lastSyncTimestamp };
    
    // 初回でもキャッシュを活用するため nocache を付与しない

    const r = await apiPost(payload);
    if (r?.error === 'unauthorized') {
      if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }
      await logout();
      return;
    }
    const maxUpdated = Number.isFinite(Number(r?.maxUpdated)) ? Number(r.maxUpdated) : 0;
    const serverNow = Number.isFinite(Number(r?.serverNow)) ? Number(r.serverNow) : 0;
    const nextSyncTimestamp = Math.max(lastSyncTimestamp, maxUpdated, serverNow);
    
    if (nextSyncTimestamp > lastSyncTimestamp) {
      lastSyncTimestamp = nextSyncTimestamp;
      // ★追加: 同期時刻が進んだらローカルストレージに保存
      try {
        localStorage.setItem(STORAGE_KEY_SYNC, String(lastSyncTimestamp));
      } catch (e) { /* 無視 */ }
    }
    
    if (r && r.data && Object.keys(r.data).length > 0) {
      applyState(r.data);
    }
  };

  if (immediate) {
    // ★修正: 初回実行フラグを true に
    pollAction(true).catch(() => { });
  }
  const remotePollMs = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.remotePollMs))
    ? CONFIG.remotePollMs
    : 10000;
  // 定期実行時はキャッシュ利用 (isFirstRun = undefined/false)
  remotePullTimer = setInterval(pollAction, remotePollMs);
}

function startRemoteSync(immediate) {
  if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }

  if (typeof CURRENT_OFFICE_ID === 'undefined' || !CURRENT_OFFICE_ID) {
    console.error("Office ID not found. Cannot start sync.");
    return;
  }

  console.log("Starting sync via Cloudflare Worker (KV Cache enabled).");
  
  startLegacyPolling(immediate);

  /* ▼▼▼ 追加箇所: タブが非表示になったらポーリングを停止 ▼▼▼ */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // 画面が隠れたら停止
      if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }
      console.log("Sync paused (background).");
    } else {
      // 画面に戻ったら再開
      if (!remotePullTimer) {
        startLegacyPolling(true); // 即座に更新確認
        console.log("Sync resumed.");
      }
    }
  });
  /* ▲▲▲ 追加箇所ここまで ▲▲▲ */

  if (typeof startToolsPolling === 'function') { startToolsPolling(); }
  if (typeof startNoticesPolling === 'function') { startNoticesPolling(); }
  if (typeof startVacationsPolling === 'function') { startVacationsPolling(); }
}

async function fetchConfigOnce() {
  const cfg = await apiPost({ action: 'getConfig', token: SESSION_TOKEN });
  if (cfg?.error === 'unauthorized') {
    await logout();
    return;
  }
  if (cfg && !cfg.error) {
    const updated = (typeof cfg.updated === 'number') ? cfg.updated : 0;
    const groups = cfg.groups || cfg.config?.groups || [];
    const menus = cfg.menus || cfg.config?.menus || null;
    const shouldUpdate = (updated && updated !== CONFIG_UPDATED) || (!updated && CONFIG_UPDATED === 0);
    if (shouldUpdate) {
      GROUPS = normalizeConfigClient({ groups });
      CONFIG_UPDATED = updated || Date.now();
      setupMenus(menus);
      render(); 

      // ★追加: DOM描画直後に最新キャッシュを適用
      if (Object.keys(STATE_CACHE).length > 0) {
        applyState(STATE_CACHE);
      }
    }
  }
}

function startConfigWatch(immediate = true) {
  if (configWatchTimer) { clearInterval(configWatchTimer); configWatchTimer = null; }
  if (immediate) {
    fetchConfigOnce().catch(console.error);
  }
  const configPollMs = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.configPollMs))
    ? CONFIG.configPollMs
    : 30000;
  configWatchTimer = setInterval(fetchConfigOnce, configPollMs);
}

function scheduleRenew(ttlMs) {
  if (tokenRenewTimer) { clearTimeout(tokenRenewTimer); tokenRenewTimer = null; }
  const tokenDefaultTtl = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.tokenDefaultTtl))
    ? CONFIG.tokenDefaultTtl
    : 3600000;
  const delay = Math.max(10_000, Number(ttlMs || tokenDefaultTtl) - 60_000);
  tokenRenewTimer = setTimeout(async () => {
    tokenRenewTimer = null;
    const me = await apiPost({ action: 'renew', token: SESSION_TOKEN });
    if (!me || me.error === 'unauthorized') {
      await logout();
      return;
    }
    if (!me.ok) {
      toast('ログイン状態を再確認してください', false);
      await logout();
      return;
    }
    if (me.ok) {
      const prevRole = CURRENT_ROLE;
      CURRENT_ROLE = me.role || CURRENT_ROLE;
      saveSessionMeta();
      if (CURRENT_ROLE !== prevRole) {
        ensureAuthUI();
        applyRoleToManual();
      }
      const tokenDefaultTtl = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.tokenDefaultTtl))
        ? CONFIG.tokenDefaultTtl
        : 3600000;
      scheduleRenew(Number(me.exp) || tokenDefaultTtl);
    }
  }, delay);
}

async function pushRowDelta(key) {
  const tr = document.getElementById(`row-${key}`);
  try {
    if (!tr) return;
    const st = getRowState(key);
    st.workHours = st.workHours == null ? '' : String(st.workHours);
    const baseRev = {}; baseRev[key] = Number(tr.dataset.rev || 0);
    const payload = { updated: Date.now(), data: { [key]: st } };

    const r = await apiPost({ action: 'set', token: SESSION_TOKEN, data: JSON.stringify(payload), baseRev: JSON.stringify(baseRev) });

    if (!r) { toast('通信エラー', false); return; }

    if (r.error === 'conflict') {
      const c = (r.conflicts && r.conflicts.find(x => x.id === key)) || null;
      if (c && c.server) {
        applyState({ [key]: c.server });
        toast('他端末と競合しました（サーバ値で更新）', false);
      } else {
        const rev = Number((r.rev && r.rev[key]) || 0);
        const ts = Number((r.serverUpdated && r.serverUpdated[key]) || 0);
        if (rev) { tr.dataset.rev = String(rev); tr.dataset.serverUpdated = String(ts || 0); }
        saveLocal();
      }
      return;
    }

    if (!r.error) {
      const rev = Number((r.rev && r.rev[key]) || 0);
      const ts = Number((r.serverUpdated && r.serverUpdated[key]) || 0);
      if (rev) { tr.dataset.rev = String(rev); tr.dataset.serverUpdated = String(ts || 0); }
      
      // ★修正: 送信成功時、ローカルキャッシュ(STATE_CACHE)とLocalStorageを即座に更新する
      if (!STATE_CACHE[key]) STATE_CACHE[key] = {};
      Object.assign(STATE_CACHE[key], st);
      try {
        localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(STATE_CACHE));
      } catch (e) {
        console.error("Failed to update local cache:", e);
      }

      saveLocal();
      return;
    }

    toast('保存に失敗しました', false);
  } finally {
    PENDING_ROWS.delete(key);
    if (tr) {
      tr.querySelectorAll('input[name="note"],input[name="workHours"],select[name="status"],select[name="time"]').forEach(inp => {
        if (inp && inp.dataset) delete inp.dataset.editing;
      });
    }
  }
}

// applyState関数の定義
function applyState(data) {
  if (!data) return;

  // キャッシュにマージ
  Object.assign(STATE_CACHE, data);

  // ★修正: 最新状態をlocalStorageに保存（サーバーからの受信時）
  try {
    localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(STATE_CACHE));
  } catch (e) {
    // quota exceededなどは無視
  }

  Object.entries(data).forEach(([k, v]) => {
    if (PENDING_ROWS.has(k)) return;

    const tr = document.getElementById(`row-${k}`);
    const s = tr?.querySelector('select[name="status"]'), t = tr?.querySelector('select[name="time"]'), w = tr?.querySelector('input[name="workHours"]'), n = tr?.querySelector('input[name="note"]');
    if (!tr || !s || !t || !w) { ensureRowControls(tr); }
    const extTd = tr?.querySelector('td.ext');
    if (extTd && v && v.ext !== undefined) {
      const extVal = String(v.ext || '').replace(/[^0-9]/g, '');
      extTd.textContent = extVal;
    }
    if (tr) {
      if (v && v.mobile !== undefined) { tr.dataset.mobile = String(v.mobile ?? '').trim(); }
      if (v && v.email !== undefined) { tr.dataset.email = String(v.email ?? '').trim(); }
    }
    if (v.status && STATUSES.some(x => x.value === v.status)) setIfNeeded(s, v.status);
    setIfNeeded(w, (v && typeof v.workHours === 'string') ? v.workHours : (v && v.workHours == null ? '' : String(v?.workHours ?? '')));
    setIfNeeded(t, v.time || ""); setIfNeeded(n, v.note || "");
    if (s && t) toggleTimeEnable(s, t);

    const remoteRev = Number(v.rev || 0);
    const localRev = Number(tr?.dataset.rev || 0);
    if (tr && remoteRev > localRev) { tr.dataset.rev = String(remoteRev); tr.dataset.serverUpdated = String(v.serverUpdated || 0); }

    ensureTimePrompt(tr);
  });
  recolor();
  updateStatusFilterCounts();
  applyFilters();
}
