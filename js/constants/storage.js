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
// セッション関連キー (SSOT 指定キー)
// ============================================
/** セッショントークン保存キー */
const SESSION_KEY = "SESSION_TOKEN";

/** 拠点ID保存キー */
const SESSION_OFFICE_KEY = "presence-office-id";

/** 拠点名保存キー */
const SESSION_OFFICE_NAME_KEY = "officeName";

/** ユーザー権限保存キー */
const SESSION_ROLE_KEY = "presence-role";

// ============================================
// ローカルストレージ互換・拡張キー
// ============================================
/** 自動ログイン用拠点ID保存キー (SESSION_OFFICE_KEYに統合予定だが互換維持) */
const LOCAL_OFFICE_KEY = SESSION_OFFICE_KEY;

/** 自動ログイン用ユーザー権限保存キー */
const LOCAL_ROLE_KEY = SESSION_ROLE_KEY;

/** 自動ログイン用拠点名保存キー */
const LOCAL_OFFICE_NAME_KEY = SESSION_OFFICE_NAME_KEY;

/** 拠点カラム設定保存キー (Phase 2) */
function getColumnConfigKey(officeId) {
  return `presence-column-config:${officeId || 'default'}`;
}

// ============================================
// アプリケーション内部状態用キー
// ============================================
/** ボードデータ保存用キーベース */
const STORE_KEY_BASE = "presence-board-v4";

/** お知らせ折りたたみ状態キー */
const NOTICE_COLLAPSE_STORAGE_KEY = 'noticeAreaCollapsed';

/**
 * 状態キャッシュキー
 */
const STORAGE_KEY_CACHE_FALLBACK = 'whereabouts_state_cache';

/**
 * 最終同期時刻キー
 */
const STORAGE_KEY_SYNC_FALLBACK = 'whereabouts_last_sync';

/**
 * 行単位競合回復状態キー
 */
const STORAGE_KEY_CONFLICT_RECOVERY_FALLBACK = 'whereabouts_conflict_recovery';

// ============================================
// ハイブリッド認証・内部状態用キー
// ============================================
/** セッション維持用フラグ (sessionStorage) */
const PERSISTENT_SESSION_KEY = 'whereabouts_persistent_session';

/** 認証タイプ固定キー (sessionStorage: 'firebase'|'d1') */
const D1_SESSION_LOCK_KEY = 'whereabouts_auth_type';

/**
 * ログアウト時にクリアすべきキーのリスト
 * ユーザー情報の残存による誤ログイン（拠点跨ぎ）を防止するために使用する。
 */
const CLEAR_ON_LOGOUT_KEYS = [
    SESSION_KEY,
    SESSION_ROLE_KEY,
    SESSION_OFFICE_KEY,
    SESSION_OFFICE_NAME_KEY,
    LOCAL_OFFICE_KEY,
    LOCAL_ROLE_KEY,
    LOCAL_OFFICE_NAME_KEY,
    PERSISTENT_SESSION_KEY,
    D1_SESSION_LOCK_KEY
];

/**
 * イベント選択状態のストレージキーを生成
 * @param {string} officeId - 拠点ID
 * @returns {string} ストレージキー
 */
function eventSelectionKey(officeId) {
  return `${STORE_KEY_BASE}:event:${officeId || '__none__'}`;
}

// ============================================
// 非モジュール環境（globals.js等）向けのグローバル展開
// ============================================
if (typeof window !== 'undefined') {
  window.STORAGE_KEYS = Object.freeze({
    SESSION_KEY,
    SESSION_OFFICE_KEY,
    SESSION_OFFICE_NAME_KEY,
    SESSION_ROLE_KEY,
    LOCAL_OFFICE_KEY,
    LOCAL_ROLE_KEY,
    LOCAL_OFFICE_NAME_KEY,
    STORE_KEY_BASE,
    PERSISTENT_SESSION_KEY,
    D1_SESSION_LOCK_KEY,
    CLEAR_ON_LOGOUT_KEYS
  });
  // 個別定数も互換性のために window に展開
  window.SESSION_KEY = SESSION_KEY;
  window.LOCAL_OFFICE_KEY = LOCAL_OFFICE_KEY;
  window.LOCAL_ROLE_KEY = LOCAL_ROLE_KEY;
  window.LOCAL_OFFICE_NAME_KEY = LOCAL_OFFICE_NAME_KEY;
  window.STORE_KEY_BASE = STORE_KEY_BASE;
  window.getColumnConfigKey = getColumnConfigKey;
  window.eventSelectionKey = eventSelectionKey;
}
