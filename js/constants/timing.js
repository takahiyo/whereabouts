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
