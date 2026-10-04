/**
 * js/offices.js - 拠点管理
 *
 * 公開拠点一覧の取得と選択UIを管理する。
 *
 * 依存: js/constants/ui.js (ID_RE), js/globals.js, js/utils.js
 * 参照元: js/auth.js, main.js
 *
 * @see MODULE_GUIDE.md
 */

/* 認証UI（公開オフィス一覧） */
function ensureAuthUIPublicError(){}

async function refreshPublicOfficeSelect(selectedId){
  const loginBtn=document.getElementById('btnLogin');
  if(officeSel) officeSel.disabled=false;
  if(pwInput) pwInput.disabled=false;
  if(loginBtn) loginBtn.disabled=false;
  if(loginMsg) loginMsg.textContent='';

  // 自動または引数で渡されたIDがあればセット
  if(selectedId && officeSel) {
    officeSel.value=selectedId;
  }
}
