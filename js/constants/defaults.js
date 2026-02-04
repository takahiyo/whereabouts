/**
 * js/constants/defaults.js - デフォルト値定数 (SSOT)
 *
 * 初期値・フォールバック値を一元管理する。
 *
 * @see SSOT_GUIDE.md
 */

// ============================================
// 勤務時間デフォルト選択肢
// ============================================
/**
 * デフォルトの勤務時間選択肢
 * @type {string[]}
 */
const DEFAULT_BUSINESS_HOURS = Object.freeze([
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
]);

// ============================================
// デフォルトメニュー設定
// ============================================
/**
 * デフォルトのステータス設定
 * @type {Array<{value: string, class: string, requireTime?: boolean, clearOnSet?: boolean}>}
 */
const DEFAULT_STATUSES = Object.freeze([
  { value: "在席", class: "st-here", clearOnSet: true },
  { value: "外出", requireTime: true, class: "st-out" },
  { value: "在宅勤務", class: "st-remote", clearOnSet: true },
  { value: "出張", requireTime: true, class: "st-trip" },
  { value: "研修", requireTime: true, class: "st-training" },
  { value: "健康診断", requireTime: true, class: "st-health" },
  { value: "コアドック", requireTime: true, class: "st-coadoc" },
  { value: "帰宅", class: "st-home" },
  { value: "休み", class: "st-off", clearOnSet: true }
]);

/**
 * デフォルトの備考選択肢
 * @type {string[]}
 */
const DEFAULT_NOTE_OPTIONS = Object.freeze([
  "直出",
  "直帰",
  "直出・直帰"
]);

// ============================================
// API関連デフォルト
// ============================================
/**
 * デフォルトのWorkerエンドポイント（フォールバック用）
 * @type {string}
 */
const DEFAULT_WORKER_ENDPOINT = "https://presence-proxy-prod.taka-hiyo.workers.dev";
