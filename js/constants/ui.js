/**
 * js/constants/ui.js - UI関連定数 (SSOT)
 *
 * ステータス、CSSクラス、レイアウト関連の定数を一元管理する。
 *
 * @see SSOT_GUIDE.md
 */

// ============================================
// ステータス関連CSSクラス
// ============================================
/**
 * 行ステータスに対応するCSSクラス一覧
 * @type {string[]}
 */
const ROW_STATUS_CLASSES = Object.freeze([
  'st-here',      // 在席
  'st-out',       // 外出
  'st-meeting',   // 会議
  'st-remote',    // 在宅勤務
  'st-trip',      // 出張
  'st-training',  // 研修
  'st-health',    // 健康診断
  'st-coadoc',    // ドック
  'st-home',      // 帰宅
  'st-off'        // 休み
]);

/**
 * ステータス値からCSSクラスへのマッピング
 * @type {Map<string, string>}
 */
const STATUS_CLASS_MAPPING = Object.freeze(new Map([
  ['在席', 'st-here'],
  ['外出', 'st-out'],
  ['会議', 'st-meeting'],
  ['在宅勤務', 'st-remote'],
  ['出張', 'st-trip'],
  ['研修', 'st-training'],
  ['健康診断', 'st-health'],
  ['ドック', 'st-coadoc'],
  ['帰宅', 'st-home'],
  ['休み', 'st-off']
]));

// ============================================
// レイアウト関連
// ============================================
/** パネル最小幅（px） */
const PANEL_MIN_PX = 760;

/** パネル間ギャップ（px） */
const GAP_PX = 20;

/** 最大カラム数 */
const MAX_COLS = 3;

/** カード表示強制ブレークポイント（px） */
const CARD_BREAKPOINT_PX = 760;

// ============================================
// お知らせ関連
// ============================================
/** お知らせ最大件数 */
const MAX_NOTICE_ITEMS = 100;

// ============================================
// イベントカラー関連
// ============================================
/**
 * パレットキー一覧
 * @type {string[]}
 */
const PALETTE_KEYS = Object.freeze([
  'none',
  'saturday',
  'sunday',
  'holiday',
  'amber',
  'mint',
  'lavender',
  'slate'
]);

/**
 * イベントカラーからパレットキーへの変換マップ
 * @type {Object<string, string>}
 */
const EVENT_COLOR_TO_PALETTE_MAP = Object.freeze({
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
});

/**
 * レガシーカラーキーの正規化マッピング
 * @type {Object<string, string>}
 */
const EVENT_COLOR_LEGACY_FALLBACKS = Object.freeze({
  gray: 'slate',
  grey: 'slate',
  teal: 'green',
  pink: 'sunday'
});

/**
 * トランスポート用カラーキーのフォールバック
 * @type {Object<string, string>}
 */
const EVENT_COLOR_TRANSPORT_FALLBACKS = Object.freeze({
  slate: 'gray',
  green: 'teal'
});

// ============================================
// 入力バリデーション
// ============================================
/** ID形式の正規表現 */
const ID_RE = /^[0-9A-Za-z_-]+$/;
