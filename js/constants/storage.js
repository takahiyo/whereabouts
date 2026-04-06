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

/** 拠点カラム設定保存キー (Phase 2) */
function getColumnConfigKey(officeId) {
  return `presence-column-config:${officeId || 'default'}`;
}

// ============================================
// ローカルストレージキー
// ============================================
/** 自動ログイン用拠点ID保存キー */
const LOCAL_OFFICE_KEY = "presence_office";

/** 自動ログイン用ユーザー権限保存キー */
const LOCAL_ROLE_KEY = "presence_role";

/** 自動ログイン用拠点名保存キー */
const LOCAL_OFFICE_NAME_KEY = "presence_office_name";

/** ボードデータ保存用キーベース */
const STORE_KEY_BASE = "presence-board-v4";

/** お知らせ折りたたみ状態キー */
const NOTICE_COLLAPSE_STORAGE_KEY = 'noticeAreaCollapsed';

// ============================================
// キャッシュ関連キー
// ============================================
/**
 * 状態キャッシュキー（CONFIG.storageKeysから参照）
 * 値は sync.js で { savedAt, state } の自己修復用エンベロープ保存にも利用される。
 * @deprecated CONFIG.storageKeys.stateCache を使用すること
 */
const STORAGE_KEY_CACHE_FALLBACK = 'whereabouts_state_cache';

/**
 * 最終同期時刻キー（CONFIG.storageKeysから参照）
 * @deprecated CONFIG.storageKeys.lastSync を使用すること
 */
const STORAGE_KEY_SYNC_FALLBACK = 'whereabouts_last_sync';

/**
 * 行単位競合回復状態キー（CONFIG.storageKeysから参照）
 * @deprecated CONFIG.storageKeys.conflictRecovery を使用すること
 */
const STORAGE_KEY_CONFLICT_RECOVERY_FALLBACK = 'whereabouts_conflict_recovery';

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
