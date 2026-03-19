/**
 * js/sync.js - データ同期・通信ロジック
 *
 * Cloudflare Workers経由のポーリングと設定監視を管理する。
 *
 * 依存: js/config.js, js/constants/*.js, js/globals.js, js/utils.js
 * 参照元: js/auth.js, main.js
 *
 * @see MODULE_GUIDE.md
 */

/* ===== メニュー・正規化・通信・同期 ===== */
/* DEFAULT_BUSINESS_HOURS は constants/defaults.js で定義 */

// ポーリング状態管理
let lastPollTime = 0;

// ★修正: STATE_CACHE と lastSyncTimestamp を localStorage から初期化
let STATE_CACHE = {};
let lastSyncTimestamp = 0;
let conflictRecoveryState = {};

const SYNC_DECISION = Object.freeze({
  APPLY: 'apply',
  SKIP: 'skip',
  HEAL: 'heal'
});

const SYNC_LOG_KEYS = Object.freeze({
  memberId: 'memberId',
  remoteRev: 'remoteRev',
  localRev: 'localRev',
  remoteServerUpdated: 'remoteServerUpdated',
  localServerUpdated: 'localServerUpdated',
  decision: 'decision'
});

const DEFAULT_SYNC_LOG_SETTINGS = Object.freeze({
  skipWarnThreshold: DEFAULT_SYNC_CONFLICT_STREAK_WARN_THRESHOLD
});

let syncSkipStreak = 0;
let syncConflictStreak = 0;

function getSyncLogSettings() {
  const fromConfig = (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.syncLog === 'object')
    ? CONFIG.syncLog
    : null;
  const threshold = Number(fromConfig?.skipWarnThreshold);
  return {
    skipWarnThreshold: Number.isFinite(threshold) && threshold > 0
      ? threshold
      : DEFAULT_SYNC_LOG_SETTINGS.skipWarnThreshold
  };
}

function getSyncSelfHealSettings() {
  const fromConfig = (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.syncSelfHeal === 'object')
    ? CONFIG.syncSelfHeal
    : null;
  const revRescueWindowMs = Number(fromConfig?.revRescueWindowMs);
  const revSkewHealWindowMs = Number(fromConfig?.revSkewHealWindowMs);
  const cacheTtlMs = Number(fromConfig?.cacheTtlMs);
  const conflictStreakWarnThreshold = Number(fromConfig?.conflictStreakWarnThreshold);

  return {
    revRescueWindowMs: Number.isFinite(revRescueWindowMs) && revRescueWindowMs > 0
      ? revRescueWindowMs
      : DEFAULT_SYNC_REV_RESCUE_WINDOW_MS,
    revSkewHealWindowMs: Number.isFinite(revSkewHealWindowMs) && revSkewHealWindowMs > 0
      ? revSkewHealWindowMs
      : DEFAULT_SYNC_REV_SKEW_HEAL_WINDOW_MS,
    cacheTtlMs: Number.isFinite(cacheTtlMs) && cacheTtlMs > 0
      ? cacheTtlMs
      : DEFAULT_SYNC_CACHE_TTL_MS,
    conflictStreakWarnThreshold: Number.isFinite(conflictStreakWarnThreshold) && conflictStreakWarnThreshold > 0
      ? conflictStreakWarnThreshold
      : DEFAULT_SYNC_CONFLICT_STREAK_WARN_THRESHOLD
  };
}

function getSyncRecoverySettings() {
  const fromConfig = (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.syncRecovery === 'object')
    ? CONFIG.syncRecovery
    : null;
  const conflictThreshold = Number(fromConfig?.conflictThreshold);
  const windowMs = Number(fromConfig?.windowMs);

  return {
    conflictThreshold: Number.isFinite(conflictThreshold) && conflictThreshold > 0
      ? conflictThreshold
      : DEFAULT_SYNC_RECOVERY_CONFLICT_THRESHOLD,
    windowMs: Number.isFinite(windowMs) && windowMs > 0
      ? windowMs
      : DEFAULT_SYNC_RECOVERY_WINDOW_MS
  };
}

function getSyncCacheValidationSettings() {
  const fromConfig = (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.syncCacheValidation === 'object')
    ? CONFIG.syncCacheValidation
    : null;
  const maxRev = Number(fromConfig?.maxRev);
  const maxServerUpdatedAheadMs = Number(fromConfig?.maxServerUpdatedAheadMs);
  const purgeDriftThresholdMs = Number(fromConfig?.purgeDriftThresholdMs);

  return {
    maxRev: Number.isInteger(maxRev) && maxRev > 0
      ? maxRev
      : DEFAULT_SYNC_CACHE_MAX_REV,
    maxServerUpdatedAheadMs: Number.isFinite(maxServerUpdatedAheadMs) && maxServerUpdatedAheadMs >= 0
      ? maxServerUpdatedAheadMs
      : DEFAULT_SYNC_CACHE_MAX_SERVER_UPDATED_AHEAD_MS,
    purgeDriftThresholdMs: Number.isFinite(purgeDriftThresholdMs) && purgeDriftThresholdMs > 0
      ? purgeDriftThresholdMs
      : DEFAULT_SYNC_CACHE_PURGE_DRIFT_THRESHOLD_MS
  };
}

function logSyncDecision(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const settings = getSyncLogSettings();
  const decision = String(payload.decision || SYNC_DECISION.SKIP);

  const event = {
    [SYNC_LOG_KEYS.memberId]: String(payload.memberId || ''),
    [SYNC_LOG_KEYS.remoteRev]: Number(payload.remoteRev || 0),
    [SYNC_LOG_KEYS.localRev]: Number(payload.localRev || 0),
    [SYNC_LOG_KEYS.remoteServerUpdated]: Number(payload.remoteServerUpdated || 0),
    [SYNC_LOG_KEYS.localServerUpdated]: Number(payload.localServerUpdated || 0),
    [SYNC_LOG_KEYS.decision]: decision
  };

  console.info('[sync-decision]', event);

  if (decision === SYNC_DECISION.SKIP) {
    syncSkipStreak += 1;
    if (syncSkipStreak >= settings.skipWarnThreshold && (syncSkipStreak % settings.skipWarnThreshold) === 0) {
      console.warn('[sync-decision-skip-streak]', {
        skipStreak: syncSkipStreak,
        skipWarnThreshold: settings.skipWarnThreshold,
        lastMemberId: event.memberId
      });
    }
    return;
  }

  syncSkipStreak = 0;
}

function reportConflictStreak(memberId) {
  const settings = getSyncSelfHealSettings();
  syncConflictStreak += 1;
  if (syncConflictStreak >= settings.conflictStreakWarnThreshold && (syncConflictStreak % settings.conflictStreakWarnThreshold) === 0) {
    console.warn('[sync-conflict-streak]', {
      conflictStreak: syncConflictStreak,
      conflictStreakWarnThreshold: settings.conflictStreakWarnThreshold,
      lastMemberId: String(memberId || '')
    });
  }
}

function resetConflictStreak() {
  syncConflictStreak = 0;
}

const SYNC_HEAL_REASON = Object.freeze({
  NONE: 'none',
  NORMAL: 'normal',
  HEAL: 'heal',
  REPAIR: 'repair'
});

function evaluateRemoteStateDecision(remoteRev, localRev, remoteServerUpdated, localServerUpdated) {
  const settings = getSyncSelfHealSettings();
  const cacheValidation = getSyncCacheValidationSettings();
  const hasInvalidLocalRev = !Number.isFinite(localRev) || localRev < 0 || localRev > cacheValidation.maxRev;

  if (hasInvalidLocalRev) {
    return {
      shouldApply: true,
      reason: SYNC_HEAL_REASON.REPAIR
    };
  }

  if (remoteRev > localRev) {
    return {
      shouldApply: true,
      reason: SYNC_HEAL_REASON.NORMAL
    };
  }

  const skewMs = remoteServerUpdated - localServerUpdated;
  if (remoteRev <= localRev && skewMs > settings.revSkewHealWindowMs) {
    return {
      shouldApply: true,
      reason: SYNC_HEAL_REASON.HEAL
    };
  }

  return {
    shouldApply: false,
    reason: SYNC_HEAL_REASON.NONE
  };
}

// Configからキーを取得（読み込み順序に依存するため安全策をとる）
const STORAGE_KEY_CACHE = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys) ? CONFIG.storageKeys.stateCache : STORAGE_KEY_CACHE_FALLBACK;
const STORAGE_KEY_SYNC = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys) ? CONFIG.storageKeys.lastSync : STORAGE_KEY_SYNC_FALLBACK;
const STORAGE_KEY_CONFLICT_RECOVERY = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys && typeof CONFIG.storageKeys.conflictRecovery === 'string' && CONFIG.storageKeys.conflictRecovery)
  ? CONFIG.storageKeys.conflictRecovery
  : STORAGE_KEY_CONFLICT_RECOVERY_FALLBACK;

function serializeStateCachePayload(cache) {
  return JSON.stringify({
    savedAt: Date.now(),
    state: cache
  });
}

function restoreStateCache(rawCache) {
  if (!rawCache) return;
  try {
    const parsed = JSON.parse(rawCache);
    const settings = getSyncSelfHealSettings();

    if (parsed && typeof parsed === 'object' && parsed.state && typeof parsed.state === 'object') {
      const savedAt = Number(parsed.savedAt || 0);
      const isFresh = Number.isFinite(savedAt) && (Date.now() - savedAt) <= settings.cacheTtlMs;
      if (isFresh) {
        STATE_CACHE = parsed.state;
        return;
      }
      // 有効期限切れの場合は同期時刻もリセットして漏れを防ぐ
      purgeSyncLocalCache('cache-expired');
      return;
    }

    if (parsed && typeof parsed === 'object') {
      STATE_CACHE = parsed;
    }
  } catch (e) {
    console.error('Failed to parse state cache:', e);
    purgeSyncLocalCache('parse-error');
  }
}

function purgeSyncLocalCache(reason, details = {}) {
  STATE_CACHE = {};
  lastSyncTimestamp = 0;
  localStorage.removeItem(STORAGE_KEY_CACHE);
  localStorage.removeItem(STORAGE_KEY_SYNC);
  console.warn('[sync-cache-restore]', {
    fullPurge: true,
    reason: String(reason || 'unspecified'),
    removedRows: Number(details.removedRows || 0),
    ...details
  });
}

function sanitizeStateCache(cache, lastSyncTs) {
  if (!cache || typeof cache !== 'object') {
    return {
      sanitizedCache: {},
      removedRows: 0,
      fullPurge: false
    };
  }

  const settings = getSyncCacheValidationSettings();
  const now = Date.now();
  const sanitizedCache = {};
  let removedRows = 0;
  let hasDriftOverflow = false;

  Object.entries(cache).forEach(([memberId, row]) => {
    if (!row || typeof row !== 'object') {
      removedRows += 1;
      return;
    }

    const rev = Number(row.rev);
    const serverUpdated = Number(row.serverUpdated);
    const isRevValid = Number.isInteger(rev) && rev >= 0 && rev <= settings.maxRev;
    const isServerUpdatedValid = Number.isFinite(serverUpdated)
      && serverUpdated >= 0
      && serverUpdated <= (now + settings.maxServerUpdatedAheadMs);

    if (!isRevValid || !isServerUpdatedValid) {
      removedRows += 1;
      return;
    }

    if (Number.isFinite(lastSyncTs) && lastSyncTs > 0) {
      const drift = Math.abs(serverUpdated - lastSyncTs);
      if (drift > settings.purgeDriftThresholdMs) {
        hasDriftOverflow = true;
      }
    }

    sanitizedCache[String(memberId)] = row;
  });

  return {
    sanitizedCache,
    removedRows,
    fullPurge: hasDriftOverflow,
    driftThresholdMs: settings.purgeDriftThresholdMs
  };
}

function normalizeConflictRecoveryState(rawState) {
  if (!rawState || typeof rawState !== 'object') {
    return {};
  }

  const normalized = {};
  Object.entries(rawState).forEach(([memberId, value]) => {
    if (!value || typeof value !== 'object') {
      return;
    }
    const count = Number(value.count || 0);
    const lastConflictAt = Number(value.lastConflictAt || 0);
    if (count > 0 || lastConflictAt > 0) {
      normalized[String(memberId)] = {
        count: count > 0 ? count : 0,
        lastConflictAt: lastConflictAt > 0 ? lastConflictAt : 0
      };
    }
  });

  return normalized;
}

function saveConflictRecoveryState() {
  try {
    localStorage.setItem(STORAGE_KEY_CONFLICT_RECOVERY, JSON.stringify(conflictRecoveryState));
  } catch (e) {
    console.error('Failed to persist conflict recovery state:', e);
  }
}

function clearConflictRecoveryState(memberId) {
  if (!memberId) {
    return;
  }
  const key = String(memberId);
  if (conflictRecoveryState[key]) {
    delete conflictRecoveryState[key];
    saveConflictRecoveryState();
  }
}

function trackConflictAndShouldReset(memberId, nowTs = Date.now()) {
  const key = String(memberId || '');
  if (!key) {
    return false;
  }

  const settings = getSyncRecoverySettings();
  const prev = conflictRecoveryState[key] || { count: 0, lastConflictAt: 0 };
  const withinWindow = prev.lastConflictAt > 0 && (nowTs - prev.lastConflictAt) <= settings.windowMs;
  const nextCount = withinWindow ? (prev.count + 1) : 1;

  conflictRecoveryState[key] = {
    count: nextCount,
    lastConflictAt: nowTs
  };
  saveConflictRecoveryState();

  return nextCount > settings.conflictThreshold;
}

function applyRowConflictReset(memberId) {
  const key = String(memberId || '');
  if (!key) {
    return;
  }

  const tr = document.getElementById(`row-${key}`);
  if (tr && tr.dataset) {
    delete tr.dataset.rev;
    delete tr.dataset.serverUpdated;
  }
  if (Object.prototype.hasOwnProperty.call(STATE_CACHE, key)) {
    delete STATE_CACHE[key];
  }
  try {
    localStorage.setItem(STORAGE_KEY_CACHE, serializeStateCachePayload(STATE_CACHE));
  } catch (e) {
    console.error('Failed to persist state cache after conflict reset:', e);
  }
  clearConflictRecoveryState(key);
}

try {
  const cached = localStorage.getItem(STORAGE_KEY_CACHE);
  restoreStateCache(cached);
  // ★追加: 最終同期時刻も復元する
  const cachedTs = localStorage.getItem(STORAGE_KEY_SYNC);
  if (cachedTs) {
    const ts = Number(cachedTs);
    if (Number.isFinite(ts)) {
      lastSyncTimestamp = ts;
    }
  }

  const validation = sanitizeStateCache(STATE_CACHE, lastSyncTimestamp);
  if (validation.fullPurge) {
    purgeSyncLocalCache('drift-over-threshold', {
      removedRows: validation.removedRows,
      driftThresholdMs: validation.driftThresholdMs
    });
  } else {
    STATE_CACHE = validation.sanitizedCache;
    if (validation.removedRows > 0) {
      localStorage.setItem(STORAGE_KEY_CACHE, serializeStateCachePayload(STATE_CACHE));
    }
    console.info('[sync-cache-restore]', {
      fullPurge: false,
      removedRows: validation.removedRows
    });
  }

  const rawConflictRecovery = localStorage.getItem(STORAGE_KEY_CONFLICT_RECOVERY);
  if (rawConflictRecovery) {
    conflictRecoveryState = normalizeConflictRecoveryState(JSON.parse(rawConflictRecovery));
  }
} catch (e) {
  console.error("Local cache restore failed:", e);
}

/**
 * デフォルトのメニュー設定オブジェクトを返す。
 * ステータス・備考選択肢は constants/defaults.js の定数を参照（SSOT）。
 * @returns {{ timeStepMinutes: number, statuses: Array, noteOptions: string[], tomorrowPlanOptions: string[], businessHours: string[] }}
 */
function defaultMenus() {
  return {
    timeStepMinutes: 30,
    statuses: DEFAULT_STATUSES.slice(),              /* constants/defaults.js (SSOT) */
    noteOptions: DEFAULT_NOTE_OPTIONS.slice(),        /* constants/defaults.js (SSOT) */
    tomorrowPlanOptions: DEFAULT_TOMORROW_PLAN_OPTIONS.slice(),
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
  if (!Array.isArray(MENUS.tomorrowPlanOptions)) MENUS.tomorrowPlanOptions = base.tomorrowPlanOptions;
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
        workHours: m.workHours == null ? '' : String(m.workHours),
        tomorrowPlan: m.tomorrowPlan == null ? '' : String(m.tomorrowPlan),
        status: m.status || '',
        time: m.time || '',
        note: m.note || '',
        updated: m.updated || 0
      })).filter(m => m.id || m.name)
    };
  });
}

// Workers経由のポーリング
async function startWorkerPolling(immediate) {
  if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }

  // ポーリング実行関数
  const pollAction = async (isFirstRun = false) => {
    if (!isFirstRun) {
      const nowMs = Date.now();
      const dateObj = new Date();
      const hour = dateObj.getHours();

      const normalInterval = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.remotePollMs))
        ? CONFIG.remotePollMs
        : 60000;
      const nightInterval = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.nightPollMs))
        ? CONFIG.nightPollMs
        : 3600000;

      let isNightMode = (hour >= 22 || hour < 7);

      /* 【将来的な拡張用スペース】
         拠点（Office ID）ごとに稼働時間が異なる場合や、24時間稼働の拠点がある場合は
         ここで判定を行い、isNightMode を false に上書きしてください。
 
         例:
         const allDayOffices = ['tokyo_control_room', 'osaka_support'];
         if (typeof CURRENT_OFFICE_ID !== 'undefined' && allDayOffices.includes(CURRENT_OFFICE_ID)) {
           isNightMode = false; // この拠点は夜間も通常通り更新する
         }
      */

      const requiredInterval = isNightMode ? nightInterval : normalInterval;

      if (nowMs - lastPollTime < requiredInterval) {
        return;
      }

      lastPollTime = nowMs;
    }

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
    const nextSyncTimestamp = Math.max(lastSyncTimestamp, maxUpdated);

    if (nextSyncTimestamp > lastSyncTimestamp) {
      lastSyncTimestamp = nextSyncTimestamp;
      // ★追加: 同期時刻が進んだらローカルストレージに保存
      try {
        localStorage.setItem(STORAGE_KEY_SYNC, String(lastSyncTimestamp));
      } catch (e) { /* 無視 */ }
    }

    if (r && r.data && Object.keys(r.data).length > 0) {
      applyState(r.data);
    } else {
      logSyncDecision({
        memberId: '__poll__',
        remoteRev: 0,
        localRev: 0,
        remoteServerUpdated: maxUpdated,
        localServerUpdated: lastSyncTimestamp,
        decision: SYNC_DECISION.SKIP
      });
    }
  };

  if (immediate) {
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

  if (typeof CURRENT_OFFICE_ID === 'undefined' || !CURRENT_OFFICE_ID) {
    console.error("Office ID not found. Cannot start sync.");
    return;
  }

  console.log("Starting sync via Cloudflare Worker.");

  startWorkerPolling(immediate);

  if (typeof startToolsPolling === 'function') { startToolsPolling(); }
  if (typeof startNoticesPolling === 'function') { startNoticesPolling(); }
  if (typeof startVacationsPolling === 'function') { startVacationsPolling(); }
}

async function fetchConfigOnce(nocache = false) {
  const payload = { action: 'getConfig', token: SESSION_TOKEN };
  if (nocache) payload.nocache = '1';

  const cfg = await apiPost(payload);
  if (cfg?.error === 'unauthorized') {
    await logout();
    return;
  }
  if (cfg && !cfg.error) {
    const updated = (typeof cfg.updated === 'number') ? cfg.updated : 0;
    const groups = cfg.groups || cfg.config?.groups || [];
    const menus = cfg.menus || cfg.config?.menus || null;

    // 同期基準の更新
    const remoteMaxUpdated = Number(cfg.maxUpdated || 0);
    if (remoteMaxUpdated > lastSyncTimestamp) {
      lastSyncTimestamp = remoteMaxUpdated;
      try { localStorage.setItem(STORAGE_KEY_SYNC, String(lastSyncTimestamp)); } catch (e) { }
    }

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
    // 初回はキャッシュをバイパスして最新を取得
    fetchConfigOnce(true).catch(console.error);
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
    // ★修正: apiPostが { data: payload } でラップするため、
    // ここでは直接メンバーデータを渡す（三重ネスト問題を解消）
    const memberData = { [key]: st };

    const r = await apiPost({ action: 'set', token: SESSION_TOKEN, data: memberData, baseRev: baseRev });


    if (!r) { toast('通信エラー', false); return; }

    if (r.error === 'conflict') {
      const c = (r.conflicts && r.conflicts.find(x => x.id === key)) || null;
      if (c && c.server) {
        reportConflictStreak(key);
        const shouldResetRow = trackConflictAndShouldReset(key);
        logSyncDecision({
          memberId: key,
          remoteRev: Number(c.server.rev || 0),
          localRev: Number(tr?.dataset.rev || 0),
          remoteServerUpdated: Number(c.server.serverUpdated || 0),
          localServerUpdated: Number(tr?.dataset.serverUpdated || 0),
          decision: SYNC_DECISION.HEAL
        });

        if (shouldResetRow) {
          applyRowConflictReset(key);
          toast('同一行で競合が続いたため自動修復を実施しました。次回同期で最新値を再取得します。', false);
        } else {
          applyState({ [key]: c.server });
          toast('他端末と競合しました（サーバ値で更新）', false);
        }
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
        localStorage.setItem(STORAGE_KEY_CACHE, serializeStateCachePayload(STATE_CACHE));
      } catch (e) {
        console.error("Failed to update local cache:", e);
      }

      resetConflictStreak();
      clearConflictRecoveryState(key);
      saveLocal();
      return;
    }

    console.error('Push Row Error:', r);
    toast(`保存に失敗しました: ${r.error || '不明なエラー'}`, false);
  } finally {
    PENDING_ROWS.delete(key);
    if (tr) {
      tr.querySelectorAll('input[name="note"],input[name="workHours"],select[name="status"],select[name="time"],select[name="tomorrowPlan"]').forEach(inp => {
        if (inp && inp.dataset) delete inp.dataset.editing;
      });
    }
  }
}

// applyState関数の定義
function applyState(data) {
  if (!data) return;

  let hasStateCacheUpdates = false;

  Object.entries(data).forEach(([k, v]) => {
    if (PENDING_ROWS.has(k)) {
      const trPending = document.getElementById(`row-${k}`);
      logSyncDecision({
        memberId: k,
        remoteRev: Number(v?.rev),
        localRev: Number(trPending?.dataset.rev),
        remoteServerUpdated: Number(v?.serverUpdated),
        localServerUpdated: Number(trPending?.dataset.serverUpdated),
        decision: SYNC_DECISION.SKIP
      });
      return;
    }

    const tr = document.getElementById(`row-${k}`);
    const s = tr?.querySelector('select[name="status"]'), t = tr?.querySelector('select[name="time"]'), p = tr?.querySelector('select[name="tomorrowPlan"]'), w = tr?.querySelector('input[name="workHours"]'), n = tr?.querySelector('input[name="note"]');
    if (!tr || !s || !t || !p || !w) { ensureRowControls(tr); }
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
    setIfNeeded(t, v.time || ""); setIfNeeded(p, v.tomorrowPlan || ""); setIfNeeded(n, v.note || "");
    if (s && t) toggleTimeEnable(s, t);

    const remoteRev = Number(v?.rev ?? v?.serverUpdated ?? 0);
    const localRev = Number(tr?.dataset.rev || STATE_CACHE[k]?.rev || 0);
    const remoteServerUpdated = Number(v?.serverUpdated || 0);
    const localServerUpdated = Number(tr?.dataset.serverUpdated || STATE_CACHE[k]?.serverUpdated || 0);
    const decisionResult = evaluateRemoteStateDecision(remoteRev, localRev, remoteServerUpdated, localServerUpdated);
    const decision = decisionResult.shouldApply ? SYNC_DECISION.APPLY : SYNC_DECISION.SKIP;
    logSyncDecision({
      memberId: k,
      remoteRev,
      localRev,
      remoteServerUpdated,
      localServerUpdated,
      decision
    });

    if (decisionResult.shouldApply) {
      const nextRev = Number.isFinite(remoteRev) ? remoteRev : 0;
      const nextServerUpdated = Number.isFinite(remoteServerUpdated) ? remoteServerUpdated : 0;
      if (tr) {
        tr.dataset.rev = String(nextRev);
        tr.dataset.serverUpdated = String(nextServerUpdated);
      }

      if (!STATE_CACHE[k] || typeof STATE_CACHE[k] !== 'object') {
        STATE_CACHE[k] = {};
      }
      Object.assign(STATE_CACHE[k], v, {
        rev: nextRev,
        serverUpdated: nextServerUpdated
      });
      hasStateCacheUpdates = true;

      if (decisionResult.reason !== SYNC_HEAL_REASON.NONE) {
        console.info('[sync-heal]', {
          memberId: k,
          reason: decisionResult.reason,
          remoteRev: nextRev,
          localRev,
          remoteServerUpdated: nextServerUpdated,
          localServerUpdated
        });
      }
    }

    ensureTimePrompt(tr);
  });

  if (hasStateCacheUpdates) {
    try {
      localStorage.setItem(STORAGE_KEY_CACHE, serializeStateCachePayload(STATE_CACHE));
    } catch (e) {
      // quota exceededなどは無視
    }
  }

  recolor();
  updateStatusFilterCounts();
  applyFilters();
}
