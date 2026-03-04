/**
 * js/constants/timing.js - タイミング関連定数 (SSOT)
 *
 * ポーリング間隔、タイムアウト、デバウンス等の時間関連定数を一元管理する。
 * 変更時は本ファイルのみを修正すれば全体に反映される。
 *
 * 注意: 一部の値は CONFIG (config.js) で上書き可能。
 *       CONFIGに値がある場合はそちらが優先される。
 *
 * @see SSOT_GUIDE.md
 */

// ============================================
// ポーリング間隔（デフォルト値）
// ============================================
/** リモート同期ポーリング間隔（ミリ秒）- CONFIG.remotePollMs で上書き可 */
const DEFAULT_REMOTE_POLL_MS = 60000;

/** 夜間ポーリング間隔（ミリ秒）- CONFIG.nightPollMs で上書き可 */
const DEFAULT_NIGHT_POLL_MS = 3600000;

/** 設定監視ポーリング間隔（ミリ秒）- CONFIG.configPollMs で上書き可 */
const DEFAULT_CONFIG_POLL_MS = 300000;

/** イベント同期間隔（ミリ秒）- CONFIG.eventSyncIntervalMs で上書き可 */
const DEFAULT_EVENT_SYNC_INTERVAL_MS = 600000; // 10分

/** トークンデフォルトTTL（ミリ秒）- CONFIG.tokenDefaultTtl で上書き可 */
const DEFAULT_TOKEN_TTL_MS = 3600000;

// ============================================
// 同期自己修復（デフォルト値）
// ============================================
/**
 * rev救済ウィンドウ（ミリ秒）- CONFIG.syncSelfHeal.revRescueWindowMs で上書き可
 * revが同値でも serverUpdated がこの範囲内で進んでいれば追随を許可する。
 */
const DEFAULT_SYNC_REV_RESCUE_WINDOW_MS = 180000;

/**
 * rev不整合時の救済判定ウィンドウ（ミリ秒）- CONFIG.syncSelfHeal.revSkewHealWindowMs で上書き可
 * remoteRev <= localRev でも serverUpdated がこの閾値以上進んでいれば救済適用する。
 */
const DEFAULT_SYNC_REV_SKEW_HEAL_WINDOW_MS = 180000;

/**
 * 同期キャッシュ寿命（ミリ秒）- CONFIG.syncSelfHeal.cacheTtlMs で上書き可
 * 期限切れキャッシュは復元せず、破損時の自己修復を優先する。
 */
const DEFAULT_SYNC_CACHE_TTL_MS = 21600000;

/**
 * 競合連続判定しきい値（回）- CONFIG.syncSelfHeal.conflictStreakWarnThreshold で上書き可
 * 連続競合の多発を早期検知するための警告しきい値。
 */
const DEFAULT_SYNC_CONFLICT_STREAK_WARN_THRESHOLD = 3;

/**
 * 行単位リセット発動しきい値（回）- CONFIG.syncRecovery.conflictThreshold で上書き可
 * 同一行でこの回数を超えて競合した場合に自動修復（行リセット）を行う。
 */
const DEFAULT_SYNC_RECOVERY_CONFLICT_THRESHOLD = 3;

/**
 * 行単位リセット判定ウィンドウ（ミリ秒）- CONFIG.syncRecovery.windowMs で上書き可
 * 直近 windowMs 内の競合回数で自動修復の発動可否を判定する。
 */
const DEFAULT_SYNC_RECOVERY_WINDOW_MS = 180000;

/**
 * state cache 内の rev の上限値 - CONFIG.syncCacheValidation.maxRev で上書き可
 * 不正な巨大値混入による比較異常を防ぐ。
 */
const DEFAULT_SYNC_CACHE_MAX_REV = 2147483647;

/**
 * state cache 内の serverUpdated の許容未来ズレ（ミリ秒）
 * - CONFIG.syncCacheValidation.maxServerUpdatedAheadMs で上書き可
 */
const DEFAULT_SYNC_CACHE_MAX_SERVER_UPDATED_AHEAD_MS = 300000;

/**
 * lastSyncTimestamp と各行 serverUpdated の最大乖離（ミリ秒）
 * - CONFIG.syncCacheValidation.purgeDriftThresholdMs で上書き可
 * この閾値を超える行があれば cache 全体をパージする。
 */
const DEFAULT_SYNC_CACHE_PURGE_DRIFT_THRESHOLD_MS = 86400000;

// ============================================
// API通信
// ============================================
/** APIリクエストデフォルトタイムアウト（ミリ秒） */
const API_TIMEOUT_MS = 20000;

// ============================================
// UI関連タイミング
// ============================================
/** トースト表示時間（ミリ秒） */
const TOAST_DURATION_MS = 2400;

/** 自動保存ステータス表示時間（ミリ秒） */
const AUTO_SAVE_STATUS_DISPLAY_MS = 2000;

/** 日付カラー自動保存デバウンス（ミリ秒） */
const EVENT_COLOR_SAVE_DEBOUNCE_MS = 800;

/** 保存ボタン再有効化遅延（ミリ秒） */
const SAVE_BUTTON_REENABLE_DELAY_MS = 1000;

/** イベント同期再開遅延（ミリ秒） */
const EVENT_SYNC_RESUME_DELAY_MS = 5000;

// ============================================
// 時刻選択範囲
// ============================================
/** 時刻選択開始（分） - 07:00 */
const TIME_RANGE_START_MIN = 7 * 60;

/** 時刻選択終了（分） - 22:00 */
const TIME_RANGE_END_MIN = 22 * 60;

// ============================================
// 夜間モード判定
// ============================================
/** 夜間モード開始時刻（時） */
const NIGHT_MODE_START_HOUR = 22;

/** 夜間モード終了時刻（時） */
const NIGHT_MODE_END_HOUR = 7;
