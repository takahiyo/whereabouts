/**
 * js/auth-guard.js - 初期化直後のチラつき防止ガード
 * 
 * 起動直後に D1 セッションロックを確認し、UI の初期状態を決定する。
 * Firebase の非同期通知（watchAuthState）より先に実行される必要がある。
 * index.html の <head> 内で非モジュール（同期）スクリプトとして読み込むこと。
 */
(function() {
  /** 
   * セッショントークン保存キー (js/constants/storage.js の SESSION_KEY と同期)
   * ※モジュール外のため直接定数は参照できないのでハードコードが必要だが、
   *   SSOTを維持するためコメントで紐付けを行う。
   */
  const SESSION_KEY = "presence-session-token";
  const D1_SESSION_LOCK_KEY = 'whereabouts_auth_type';

  const authType = sessionStorage.getItem(D1_SESSION_LOCK_KEY);
  const sessionToken = localStorage.getItem(SESSION_KEY);
  
  if (authType === 'd1' && sessionToken) {
    document.documentElement.classList.add('is-d1-authed');
    // CSSで #login を非表示にするスタイルを即注入
    const style = document.createElement('style');
    style.id = 'flicker-prevention-style';
    style.textContent = '.is-d1-authed #login { display: none !important; }';
    document.head.appendChild(style);
  }
})();
