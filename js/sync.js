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
let useSdkMode = false;         // 現在SDKモードで動いているか（本修正により常にfalseとなります）
let unsubscribeSnapshot = null; // Firestoreのリスナー解除用関数
let fallbackTimer = null;       // フォールバック判定タイマー

// ★追加: 最新の状態を保持するキャッシュ
let STATE_CACHE = {};
let lastSyncTimestamp = 0;

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
  // --- compatibility: accept legacy keys for business-hours ---
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

  // 備考候補 datalist（先頭は空白のラベル付き）
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

// Plan B: Workers経由のポーリング（フォールバック用）
async function startLegacyPolling(immediate) {

  useSdkMode = false;
  lastSyncTimestamp = 0;

  if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }

  const pollAction = async () => {
    const r = await apiPost({ action: 'get', token: SESSION_TOKEN, since: lastSyncTimestamp });
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
    }
    if (r && r.data && Object.keys(r.data).length > 0) {
      applyState(r.data);
    }
  };

  if (immediate) {
    pollAction().catch(() => { });
  }
  const remotePollMs = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.remotePollMs))
    ? CONFIG.remotePollMs
    : 10000;
  remotePullTimer = setInterval(pollAction, remotePollMs);
}

// ★修正箇所: データ同期開始（KVキャッシュ有効化のため、常にWorkerポーリングを使用）
function startRemoteSync(immediate) {
  // 既存のタイマー/リスナーをクリア
  if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }

  // ログイン済みチェック（CURRENT_OFFICE_IDが必要）
  if (typeof CURRENT_OFFICE_ID === 'undefined' || !CURRENT_OFFICE_ID) {
    console.error("Office ID not found. Cannot start sync.");
    return;
  }

  // Firestore SDK (onSnapshot) は読み取りコストが高いため使用せず、
  // WorkerのKVキャッシュを活用できるポーリングモードを強制的に使用する
  console.log("Starting sync via Cloudflare Worker (KV Cache enabled).");
  startLegacyPolling(immediate);
}

async function fetchConfigOnce() {
  const cfg = await apiPost({ action: 'getConfig', token: SESSION_TOKEN, nocache: '1' });
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
      render(); // DOM再描画（ここで画面が一度リセットされる）

      // ★追加: DOM再描画後に、保持している最新の状態を再適用する
      if (Object.keys(STATE_CACHE).length > 0) {

        applyState(STATE_CACHE);
      }
    }
  }
}

function startConfigWatch(immediate = true) {
  if (configWatchTimer) { clearInterval(configWatchTimer); configWatchTimer = null; }

  // 引数がtrueなら即座に実行
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

/* 送信（CAS: baseRev 同梱） */
async function pushRowDelta(key) {
  const tr = document.getElementById(`row-${key}`);
  try {
    if (!tr) return;
    const st = getRowState(key);
    st.workHours = st.workHours == null ? '' : String(st.workHours);
    const baseRev = {}; baseRev[key] = Number(tr.dataset.rev || 0);
    const payload = { updated: Date.now(), data: { [key]: st } };

    // 書き込みは整合性のため、常にWorkers経由（apiPost）で行う
    const r = await apiPost({ action: 'set', token: SESSION_TOKEN, data: JSON.stringify(payload), baseRev: JSON.stringify(baseRev) });

    if (!r) { toast('通信エラー', false); return; }

    if (r.error === 'conflict') {
      // サーバ側の値で上書き
      const c = (r.conflicts && r.conflicts.find(x => x.id === key)) || null;
      if (c && c.server) {
        applyState({ [key]: c.server });
        toast('他端末と競合しました（サーバ値で更新）', false);
      } else {
        // 競合配列が無い場合でも rev マップがあれば反映
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

  // ★追加: 受信した最新データをキャッシュにマージ
  Object.assign(STATE_CACHE, data);

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

    // rev/serverUpdated 反映（無ければ0扱い）
    const remoteRev = Number(v.rev || 0);
    const localRev = Number(tr?.dataset.rev || 0);
    if (tr && remoteRev > localRev) { tr.dataset.rev = String(remoteRev); tr.dataset.serverUpdated = String(v.serverUpdated || 0); }

    ensureTimePrompt(tr);
  });
  recolor();
  updateStatusFilterCounts();
  applyFilters();
}
