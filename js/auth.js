/**
 * js/auth.js - 認証 UI & ハイブリッド連携 (Shared PW + Firebase)
 * 
 * 1. 拠点ログイン (共有パスワード): 現場社員・管理スタッフ用
 * 2. 管理者ポータル (Firebase): オーナー用 (拠点開設・管理者登録)
 * 
 * [REF] js/constants/messages.js, js/sync.js, CloudflareWorkers_worker.js
 */

import { 
  signup as fbSignup, 
  login as fbLogin, 
  logout as fbLogout, 
  watchAuthState,
  getValidToken as getFbToken
} from './firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

/**
 * @typedef {Object} SessionContext
 * @property {'firebase'|'d1'} authType - 認証方式
 * @property {string} officeId - 拠点ID（小文字統一）
 * @property {string} role - 権限（'admin'|'staff'）
 * @property {string} token - Firebase idToken または D1 セッションID
 */

// DOM Elements
const loginEl = document.getElementById('login');
const loginFormEl = document.getElementById('loginForm');
const board = document.getElementById('board');
const loginMsg = document.getElementById('loginMsg');
const adminBtn = document.getElementById('adminBtn');
const logoutBtn = document.getElementById('logoutBtn');
const toolsBtn = document.getElementById('toolsBtn');
const manualBtn = document.getElementById('manualBtn');
const qrBtn = document.getElementById('qrBtn');
const qrModal = document.getElementById('qrModal');
const btnSimpleLogin = document.getElementById('btnSimpleLogin');

// Auth State Variables
let isBooting = true;
const PERSISTENT_SESSION_KEY = 'whereabouts_persistent_session';
const D1_SESSION_LOCK_KEY = 'whereabouts_auth_type';

console.log('【DEBUG】js/auth.js Loaded (Version: v20260417_v3)');

/**
 * ハイブリッド認証（Firebase/D1）の管理クラス
 */
export const AuthManager = {
    config: null,
    session: null,

    /**
     * 初期化処理。D1セッションをFirebaseより優先してチェックする（Flicker防止）。
     */
    async init(config) {
        this.config = config;
        this.checkFirebaseConfig();
        
        console.log('【DEBUG】AuthManager.init 開始');

        // URLパラメータによる自動入力 (?office=拠点ID)
        this.handleUrlParams();

        // 1. D1セッションロックの確認（Flicker防止）
        const authType = sessionStorage.getItem(D1_SESSION_LOCK_KEY);
        if (authType === 'd1') {
            console.log("[Auth] D1 Session Lock Active.");
            const restored = await this.restoreD1Session();
            if (restored) return true;
        }

        // 2. Firebase の状態を確認 (オーナー用)
        return new Promise((resolve) => {
            watchAuthState(async (user) => {
                console.log('【DEBUG】watchAuthState 通知受理. User:', user ? user.email : 'null');
                
                // D1セッションがアクティブな場合は Firebase の状態変化を完全に遮断
                if (sessionStorage.getItem(D1_SESSION_LOCK_KEY) === 'd1') {
                    console.log('【DEBUG】[ガード] D1セッション中につき Firebase 状態変化を無視します');
                    return;
                }

                if (user) {
                    const result = await this.handleFirebaseUser(user);
                    resolve(result);
                } else {
                    // D1 セッションは init 冒頭で確認済みのため、ここでは無条件でログイン画面を表示する
                    // ※ window.SESSION_TOKEN が残っていても Firebase user=null ならリセット扱い
                    console.log(`【DEBUG】Firebase user=null. isBooting=${isBooting}, SESSION_TOKEN=${!!window.SESSION_TOKEN}, => show officeLogin`);
                    if (isBooting) {
                        // 古いトークンおよび残存セッションロックを完全クリア（staleトークン・セッションによる白画面防止）
                        if (!sessionStorage.getItem(D1_SESSION_LOCK_KEY)) {
                            localStorage.removeItem('presence-session-token'); // SESSION_KEY
                            sessionStorage.removeItem(PERSISTENT_SESSION_KEY);
                            window.SESSION_TOKEN = '';
                            console.log('【DEBUG】古いセッション情報を完全クリアしました');
                        }
                        switchAuthView('officeLogin');
                    }
                    resolve(false);
                }
                isBooting = false;
            });
        });
    },

    /**
     * Firebase 設定バリデーション
     */
    checkFirebaseConfig() {
        if (!firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY') {
            console.warn('[Auth] Firebase configuration is incomplete.');
            if (btnSimpleLogin) {
                // IDに@が含まれる場合はFirebaseログインを促すため、バリデーションはログイン時に行う
                // ただし、管理者登録ボタンなどはここで制御可能
            }
        }
    },

    /**
     * URLパラメータの処理
     */
    handleUrlParams() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const officeParam = urlParams.get('office');
            if (officeParam) {
                const idInput = document.getElementById('loginOfficeId');
                if (idInput) {
                    idInput.value = officeParam;
                    idInput.style.backgroundColor = '#f0f9ff'; 
                    setTimeout(() => { idInput.style.backgroundColor = ''; }, 2000);
                }
            }
        } catch (e) {
            console.warn('URL parameter auto-fill failed:', e);
        }
    },

    /**
     * D1セッションの復元
     */
    async restoreD1Session() {
        const storedToken = localStorage.getItem(SESSION_KEY);
        const storedOffice = localStorage.getItem(LOCAL_OFFICE_KEY);
        
        if (storedToken && storedOffice) {
            try {
                const res = await this.fetchFromWorker('renew', { token: storedToken });
                if (res.ok && res.office === storedOffice) {
                    console.log('【DEBUG】D1セッションの検証に成功しました');
                    this.session = this.createSessionContext('d1', {
                        token: storedToken,
                        officeId: storedOffice,
                        role: res.role || localStorage.getItem(LOCAL_ROLE_KEY) || 'user',
                        officeName: localStorage.getItem(LOCAL_OFFICE_NAME_KEY) || storedOffice
                    });
                    await finalizeLogin(res);
                    isBooting = false;
                    return true;
                }
            } catch (e) {
                console.error('【DEBUG】D1セッション復元中に例外発生:', e);
            }
        }
        sessionStorage.removeItem(D1_SESSION_LOCK_KEY);
        return false;
    },

    /**
     * Firebaseユーザーの処理
     */
    async handleFirebaseUser(user) {
        if (user.email && !user.emailVerified) {
            const urlParams = new URLSearchParams(window.location.search);
            const hasOfficeParam = !!urlParams.get('office');
            
            if (window.SESSION_TOKEN || sessionStorage.getItem(PERSISTENT_SESSION_KEY) || hasOfficeParam) {
                return;
            }
            switchAuthView('verify');
            return false;
        }

        try {
            const fbToken = await getFbToken();
            const resp = await this.fetchFromWorker('signup', { token: fbToken });
            
            if (resp.ok) {
                if (resp.user && resp.user.office_id) {
                    const loginResp = await this.fetchFromWorker('renew', { token: fbToken });
                    if (loginResp.ok) {
                        this.session = this.createSessionContext('firebase', {
                            token: fbToken,
                            officeId: loginResp.office,
                            role: loginResp.role,
                            officeName: loginResp.officeName
                        });
                        await finalizeLogin(loginResp);
                        return true;
                    }
                } else if (isBooting) {
                    switchAuthView('createOffice');
                }
            } else {
                this.handleWorkerError(resp);
            }
        } catch (e) {
            showError(`通信エラーが発生しました: ${e.message}`);
        }
        return false;
    },

    /**
     * 入力値によるログイン仕分け
     */
    async login(id, password) {
        if (loginMsg) loginMsg.textContent = '認証中...';

        if (id.includes('@')) {
            // Firebase設定チェック
            if (!firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY') {
                showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.CONFIG_INCOMPLETE : 'Firebaseの設定が未完了です。');
                return;
            }
            const res = await fbLogin(id, password);
            if (res.ok) {
                sessionStorage.setItem(D1_SESSION_LOCK_KEY, 'firebase');
                location.reload();
            } else {
                if (res.error === 'email_not_verified') switchAuthView('verify');
                else showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.AUTH_FAILED : 'ログインに失敗しました。');
            }
        } else {
            // IDを小文字化してD1認証へ
            const officeId = id.toLowerCase();
            const res = await this.fetchFromWorker('login', { office: officeId, password });
            if (res.ok) {
                this.session = this.createSessionContext('d1', {
                    token: res.token,
                    officeId: res.office,
                    role: res.role,
                    officeName: res.officeName
                });
                await finalizeLogin(res);
            } else {
                showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.NOT_FOUND : 'ログインに失敗しました。');
            }
        }
    },

    /**
     * 統一されたSessionContextの生成
     * @param {'firebase'|'d1'} type
     * @param {Object} data
     * @returns {SessionContext}
     */
    createSessionContext(type, data) {
        const session = {
            authType: type,
            officeId: data.officeId.toLowerCase(),
            role: data.role || 'staff',
            token: data.token
        };
        sessionStorage.setItem(D1_SESSION_LOCK_KEY, type);
        return session;
    },

    /**
     * Worker 通通信用ヘルパー
     */
    async fetchFromWorker(action, bodyParams) {
        const params = new URLSearchParams();
        params.append('action', action);
        for (const key in bodyParams) {
          if (bodyParams[key] != null) params.append(key, bodyParams[key]);
        }

        const endpoint = window.CONFIG ? window.CONFIG.remoteEndpoint : (typeof CONFIG !== 'undefined' ? CONFIG.remoteEndpoint : '');
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params
        });
        return await resp.json();
    },

    handleWorkerError(resp) {
        if (resp.error === 'email_not_verified') {
            switchAuthView('verify');
        } else {
            if (loginEl) loginEl.classList.remove('u-hidden');
            switchAuthView('officeLogin');
            const errMsg = resp.hint ? `${resp.message} (${resp.hint})` : (resp.message || resp.error || '不明なエラー');
            showError(`システムエラー: ${errMsg}`);
        }
    }
};

/**
 * UI の切り替え
 */
function switchAuthView(view) {
  console.log(`【DEBUG】switchAuthView 遷移先: ${view}`);
  const areas = ['loginFormArea', 'signupFormArea', 'verifyEmailArea', 'createOfficeArea'];
  areas.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('u-hidden');
  });

  if (loginEl && loginFormEl) {
    const isVerifiedView = (view === 'officeLogin' || view === 'verify' || view === 'createOffice');
    // sessionStorage.getItem(PERSISTENT_SESSION_KEY) を単独で OR にすると board が非表示でも true になり、
    // login 画面も表示されずに白画面になる原因となるため削除。実際の DOM の状態で判定する。
    const isBoardVisible = (board && !board.classList.contains('u-hidden'));
    
    if (isVerifiedView && window.SESSION_TOKEN && isBoardVisible) {
      console.log('【DEBUG】switchAuthView: Board is already visible and SESSION_TOKEN exists. Returning early.');
      return;
    }
    
    loginEl.classList.remove('u-hidden');
    loginFormEl.classList.remove('u-hidden');
  }

  if (board && view !== 'adminPortal') board.classList.add('u-hidden');

  const targetId = {
    'officeLogin': 'loginFormArea',
    'adminPortal': 'loginFormArea',
    'signup': 'signupFormArea',
    'verify': 'verifyEmailArea',
    'createOffice': 'createOfficeArea'
  }[view];

  if (targetId) {
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.classList.remove('u-hidden');
      if (loginMsg) loginMsg.textContent = '';
    }
  }
}

/**
 * ログイン完了処理
 */
async function finalizeLogin(data) {
  if (!data || !data.office) {
    console.error('【DEBUG】不正なログインデータです。', data);
    return;
  }

  window.CURRENT_OFFICE_ID = data.office;
  window.CURRENT_ROLE = data.role || 'user';
  window.SESSION_TOKEN = data.token;
  isBooting = false;

  localStorage.setItem(SESSION_KEY, window.SESSION_TOKEN);
  localStorage.setItem(LOCAL_OFFICE_KEY, window.CURRENT_OFFICE_ID);
  localStorage.setItem(LOCAL_ROLE_KEY, CURRENT_ROLE);
  const officeName = data.officeName || CURRENT_OFFICE_ID;
  localStorage.setItem(LOCAL_OFFICE_NAME_KEY, officeName);
  
  if (typeof updateTitleBtn === 'function') updateTitleBtn(officeName);

  if (loginEl) loginEl.classList.add('u-hidden');
  if (loginFormEl) loginFormEl.classList.add('u-hidden');
  if (board) board.classList.remove('u-hidden');
  
  sessionStorage.setItem(PERSISTENT_SESSION_KEY, 'true');
  ensureAuthUI();

  // 同期サイクル
  if (typeof startRemoteSync === 'function') startRemoteSync(true);
  if (typeof startConfigWatch === 'function') startConfigWatch();
  if (typeof startNoticesPolling === 'function') startNoticesPolling();
  if (typeof startEventSync === 'function') startEventSync(true);
  if (typeof loadEvents === 'function') loadEvents(window.CURRENT_OFFICE_ID);
}

/**
 * エラー表示
 */
function showError(msg) {
  if (loginMsg) {
    let displayMsg = msg;
    if (typeof AUTH_MESSAGES !== 'undefined') {
      if (msg.includes('auth/email-already-in-use')) displayMsg = AUTH_MESSAGES.ERROR.EMAIL_ALREADY_IN_USE;
      else if (msg.includes('auth/weak-password')) displayMsg = AUTH_MESSAGES.ERROR.WEAK_PASSWORD;
      else if (msg.includes('auth/invalid-email')) displayMsg = AUTH_MESSAGES.ERROR.INVALID_EMAIL;
      else if (msg.includes('auth/user-not-found') || msg.includes('auth/wrong-password')) displayMsg = AUTH_MESSAGES.ERROR.NOT_FOUND;
    }
    
    loginMsg.textContent = displayMsg;
    loginMsg.style.color = 'var(--color-red-600)';
  }
}

/**
 * パスワードバリデーション
 */
function validatePassword(pw) {
    if (!pw) return false;
    if (pw.length < 12) return false;
    let types = 0;
    if (/[a-z]/.test(pw)) types++;
    if (/[A-Z]/.test(pw)) types++;
    if (/[0-9]/.test(pw)) types++;
    if (/[^a-zA-Z0-9]/.test(pw)) types++;
    return types >= 2;
}

// ---------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------

// ユニファイド・ログイン
document.getElementById('btnSimpleLogin')?.addEventListener('click', async () => {
    const loginId = document.getElementById('loginOfficeId').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!loginId || !password) return showError('拠点名またはメールアドレスとパスワードを入力してください。');
    
    await AuthManager.login(loginId, password);
});

// 管理者登録
document.getElementById('btnAuthSignup')?.addEventListener('click', async () => {
  const email = document.getElementById('signupEmail').value;
  const pw = document.getElementById('signupPw').value;

  if (!firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    return showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.CONFIG_INCOMPLETE : 'Firebaseの設定が完了していません。');
  }

  if (!email) return showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.INVALID_EMAIL : '正しいメールアドレスを入力してください。');
  
  if (!validatePassword(pw)) {
    return showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.INVALID_PASSWORD_FORMAT : 'パスワードは2種類以上の文字種を含む12文字以上で入力してください。');
  }

  const res = await fbSignup(email, pw);
  if (res.ok) {
    if (loginMsg) loginMsg.textContent = '';
    switchAuthView('verify');
  } else {
    showError(res.error || '登録失敗');
  }
});

// 新規拠点作成
document.getElementById('btnCreateOffice')?.addEventListener('click', async () => {
  const toHalfWidth = (str) => str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  
  const rawId = document.getElementById('newOfficeId').value.trim();
  const officeId = toHalfWidth(rawId).toLowerCase();
  const name = document.getElementById('newOfficeName').value.trim();
  const password = document.getElementById('newOfficePw').value;

  if (!officeId) return showError('オフィスIDを入力してください。');
  if (!officeId.match(/^[a-z0-9_]+$/)) return showError('オフィスIDは半角英数字と(_)のみ使用可能です。');
  if (!name || !password) return showError('全ての項目を入力してください。');

  if (!validatePassword(password)) {
    return showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.INVALID_PASSWORD_FORMAT : 'パスワードは12文字以上、かつ2種類以上の文字種を含めてください。');
  }

  const fbToken = await getFbToken();
  const res = await AuthManager.fetchFromWorker('createOffice', { 
    token: fbToken, officeId, name, password 
  });
  
  if (res.ok) {
    toast('オフィスを作成しました！管理パネルで初期設定を行ってください。');
    const loginResp = await AuthManager.fetchFromWorker('renew', { token: fbToken });
    if (loginResp.ok) {
      await finalizeLogin(loginResp);
      if (typeof window.openAdminModal === 'function') window.openAdminModal();
    } else {
      location.reload();
    }
  } else {
    showError('作成失敗: ' + (res.error || '既にIDが使われています'));
  }
});

/**
 * QRコードモーダルの表示と動的生成
 */
export function showQrModal(show) {
  if (!qrModal) return;
  if (show) {
    let targetUrl = window.location.origin + window.location.pathname;
    if (CURRENT_OFFICE_ID) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'office=' + encodeURIComponent(CURRENT_OFFICE_ID);
    }

    try {
      const qrElement = document.getElementById('qrOutput');
      if (qrElement && typeof qrcode === 'function') {
        const qr = qrcode();
        qr.setTypeNumber(0);
        qr.setErrorCorrectionLevel('M');
        qr.addData(targetUrl);
        qr.make();
        
        qrElement.innerHTML = qr.createSvgTag(6, 8);
        const svg = qrElement.querySelector('svg');
        if (svg) {
          svg.style.width = '100%';
          svg.style.height = 'auto';
          svg.style.maxWidth = '200px';
          svg.style.margin = '0 auto';
          svg.style.display = 'block';
        }
      }
    } catch (e) {
      console.error('QR Generation failed:', e);
    }

    qrModal.classList.add('show');
    qrModal.style.display = 'flex';
  } else {
    qrModal.classList.remove('show');
    qrModal.style.display = 'none';
  }
}

document.getElementById('linkGotoSignup')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthView('signup'); });
document.getElementById('linkGotoLogin')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthView('officeLogin'); });
document.getElementById('linkBackToLoginFromVerify')?.addEventListener('click', (e) => { e.preventDefault(); logoutAction(); });
document.getElementById('qrModalClose')?.addEventListener('click', () => showQrModal(false));
qrModal?.addEventListener('click', (e) => { if (e.target === qrModal) showQrModal(false); });
document.getElementById('btnVerifyDone')?.addEventListener('click', () => location.reload());

const logoutAction = async () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_OFFICE_KEY);
  localStorage.removeItem(LOCAL_ROLE_KEY);
  sessionStorage.removeItem(PERSISTENT_SESSION_KEY);
  sessionStorage.removeItem(D1_SESSION_LOCK_KEY);
  await fbLogout();
};
document.getElementById('logoutBtn')?.addEventListener('click', logoutAction);
window.logout = logoutAction;
window.showQrModal = showQrModal;

function ensureAuthUI() {
  const loggedIn = !!window.SESSION_TOKEN;
  const isAdmin = loggedIn && (window.CURRENT_ROLE === 'owner' || window.CURRENT_ROLE === 'officeAdmin' || window.CURRENT_ROLE === 'superAdmin');
  
  if (adminBtn) adminBtn.style.display = isAdmin ? 'inline-block' : 'none';
  if (logoutBtn) logoutBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (toolsBtn) toolsBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (manualBtn) manualBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (qrBtn) qrBtn.style.display = loggedIn ? 'inline-block' : 'none';
  
  const nameFilter = document.getElementById('nameFilter');
  const statusFilter = document.getElementById('statusFilter');
  if (nameFilter) nameFilter.style.display = loggedIn ? 'inline-block' : 'none';
  if (statusFilter) statusFilter.style.display = loggedIn ? 'inline-block' : 'none';
  
  const adminOfficeRow = document.getElementById('adminOfficeRow');
  if (adminOfficeRow) adminOfficeRow.style.display = (window.CURRENT_ROLE === 'superAdmin') ? 'flex' : 'none';
}
window.ensureAuthUI = ensureAuthUI;
export const checkLogin = () => AuthManager.init({ remoteEndpoint: window.CONFIG ? window.CONFIG.remoteEndpoint : (typeof CONFIG !== 'undefined' ? CONFIG.remoteEndpoint : '') });
window.checkLogin = checkLogin;
