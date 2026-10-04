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

/** 既存管理画面のCSV選択表示。保存/取込処理とは分けて扱う。 */
const CSV_FILE_UI = Object.freeze({
  input: 'csvFile', status: 'csvFileSelection', importButton: 'btnImport',
  empty: 'ファイルが選択されていません。', ready: '「取り込み」を押すと読み込まれます。'
});

// STATUS_CLASS_MAPPING は削除済（使用されていないため）

// ============================================
// レイアウト関連
// ============================================
/** パネル最小幅（px） */
const PANEL_MIN_PX = 760;

/** カード1枚の目安幅。表の拠点設定とは独立した、端末内だけの表示寸法。 */
const MEMBER_CARD_MIN_PX = 380;

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

// ============================================
// UI 文言 (SSOT)
// ============================================
/** ヘッダータイトルの接尾辞 */
const TITLE_SUFFIX = "在席確認表";
/** ヘッダータイトルの区切り文字 */
const TITLE_SEPARATOR = "　";

/** ツールリンクに許可するscheme。保存済みデータは変更せず表示時に検証する。 */
const TOOL_LINK_PROTOCOLS = Object.freeze(['http:', 'https:', 'mailto:', 'tel:']);

/** 閲覧用dialogのfocus対象と閉じる操作。編集dialogは未保存制御を別途設計する。 */
const READ_ONLY_DIALOGS = Object.freeze([
  { id: 'qrModal', closeId: 'qrModalClose' },
  { id: 'toolsModal', closeId: 'toolsModalClose' },
  { id: 'manualModal', closeId: 'manualClose' }
]);
/** Tab移動の対象。実際の可視性・disabled状態はdialog内で追加検証する。 */
const DIALOG_FOCUSABLE_SELECTOR = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]';
/** マニュアルの既存タブ構造。主ナビ刷新とは独立した操作復旧。 */
const MANUAL_UI = Object.freeze({ tabButtons: '.manual-tab-btn' });

/** 作業目的による管理ナビ。既存の編集・保存単位を維持して再配置する。 */
const ADMIN_NAVIGATION = Object.freeze([
  { id: 'roster', label: 'メンバー・グループ', pages: [
    { tab: 'members', panel: 'tabMembers', label: 'メンバー登録・編集' },
    { tab: 'groups', panel: 'tabGroups', label: 'グループ・表示順' },
    { tab: 'csv', panel: 'tabCsv', label: 'CSV取込・書出し', move: 'btnExport' }
  ] },
  { id: 'communication', label: 'お知らせ・イベント', pages: [
    { tab: 'events', panel: 'tabEvents', label: 'イベント' },
    { tab: 'notices', panel: 'tabNotices', label: 'お知らせ' }
  ] },
  { id: 'tools', label: 'ツール', pages: [{ tab: 'tools', panel: 'tabTools', label: 'リンク・ツール' }] },
  { id: 'board', label: '在席表の設定', pages: [
    { tab: 'columns', panel: 'tabColumns', label: '表示項目・レイアウト' },
    { tab: 'basic', panel: 'tabBasic', label: '自動消去' },
    { tab: 'output', panel: 'tabOutput', label: '印刷・PDF', move: 'btnPrintList' }
  ] },
  { id: 'access', label: '拠点・アクセス', pages: [
    { tab: 'access', panel: 'tabAccess', label: '拠点名・パスワード', move: 'btnRenameOffice' },
    { tab: 'offices', panel: 'tabOffices', label: '拠点一覧・追加', superAdminOnly: true }
  ] }
]);
/** イベント設定と未選択表示のDOM。保存API/ビット形式は既存のまま。 */
const EVENT_ADMIN_UI = Object.freeze({
  visible: 'vacationVisible', vacation: 'vacationIsVacation', heading: 'vacationEditorTitle',
  empty: 'eventSelectionEmpty', calendar: 'eventGanttWrap', idPrefix: 'vacation_'
});
