/**
 * js/constants/storage.js - ストレージキー定数 (SSOT)
 *
 * localStorage / sessionStorage で使用するキーを一元管理する。
 * キーの重複や変更漏れを防ぐため、すべてのストレージアクセスは
 * 本ファイルの定数を参照すること。
 *
 * @see SSOT_GUIDE.md
 */

// ============================================
// セッション関連キー
// ============================================
/** セッショントークン保存キー */
const SESSION_KEY = "presence-session-token";

/** ユーザー権限保存キー */
const SESSION_ROLE_KEY = "presence-role";

/** 拠点ID保存キー */
const SESSION_OFFICE_KEY = "presence-office";

/** 拠点名保存キー */
const SESSION_OFFICE_NAME_KEY = "presence-office-name";

// ============================================
// ローカルストレージキー（プレフィックス）
// ============================================
/** ボードデータ保存用キーベース */
const STORE_KEY_BASE = "presence-board-v4";

/** お知らせ折りたたみ状態キー */
const NOTICE_COLLAPSE_STORAGE_KEY = 'noticeAreaCollapsed';

// ============================================
// キャッシュ関連キー
// ============================================
/**
 * 状態キャッシュキー（CONFIG.storageKeysから参照）
 * @deprecated CONFIG.storageKeys.stateCache を使用すること
 */
const STORAGE_KEY_CACHE_FALLBACK = 'whereabouts_state_cache';

/**
 * 最終同期時刻キー（CONFIG.storageKeysから参照）
 * @deprecated CONFIG.storageKeys.lastSync を使用すること
 */
const STORAGE_KEY_SYNC_FALLBACK = 'whereabouts_last_sync';

// ============================================
// イベント選択状態キー生成
// ============================================
/**
 * イベント選択状態のストレージキーを生成
 * @param {string} officeId - 拠点ID
 * @returns {string} ストレージキー
 */
function eventSelectionKey(officeId) {
  return `${STORE_KEY_BASE}:event:${officeId || '__none__'}`;
}
