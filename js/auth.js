/**
 * js/auth.js - 認証 UI & ハイブリッド連携 (Shared PW + Firebase)
 * 
 * 1. 拠点ログイン (共有パスワード): 現場社員・管理スタッフ用
 * 2. 管理者ポータル (Firebase): オーナー用 (拠点開設・管理者登録)
 * 
 * [REF] js/constants/messages.js, js/sync.js, CloudflareWorkers_worker.js
 * 依存: js/constants/storage.js (グローバル変数展開済みであること)
 */

// Firebase Auth Function Wrappers (Attached to window in firebase-auth.js)
const getFbToken = () => window.getValidToken ? window.getValidToken() : Promise.resolve(null);
const fbLogin = (id, pw) => window.fbLogin ? window.fbLogin(id, pw) : Promise.reject('Firebase Auth NOT ready');
const fbSignup = (email, pw) => window.fbSignup ? window.fbSignup(email, pw) : Promise.reject('Firebase Auth NOT ready');
const fbLogout = () => window.fbLogout ? window.fbLogout() : Promise.resolve();

/**
 * @typedef {Object} SessionContext
 * @property {'firebase'|'d1'} authType - 認証方式
 * @property {string} officeId - 拠点ID（小文字統一）
 * @property {string} role - 権限（'admin'|'staff'）
 * @property {string} token - Firebase idToken または D1 セッションID
 */

// DOM Elements (Shared elements are defined in globals.js)
const loginFormEl = document.getElementById('loginForm');
const btnSimpleLogin = document.getElementById('btnSimpleLogin');

// Auth State Variables
let isBooting = true;
// Constants for session local cache (using global keys from storage.js)
// window.PERSISTENT_SESSION_KEY and window.D1_SESSION_LOCK_KEY are available globally.

// Updated: 2026-04-17 (V7.1 Global Consistency Fix)
console.log('【DEBUG】js/auth.js Loaded (Version: v7.1)');

/**
 * ハイブリッド認証（Firebase/D1）の管理クラス
 */
window.AuthManager = {
    config: null,
    session: null,

    /**
     * 初期化処理。D1セッションをFirebaseより優先してチェックする（Flicker防止）。
     */
    async init(config) {
        this.config = config;
        this.checkFirebaseConfig();
        

        // URLパラメータによる自動入力 (?office=拠点ID)
        this.handleUrlParams();

        // 1. D1セッションロックの確認（Flicker防止）
        const authType = sessionStorage.getItem(window.D1_SESSION_LOCK_KEY);
        if (authType === 'd1') {
            const restored = await this.restoreD1Session();
            if (restored) return true;
        }

        // 2. Firebase の状態を確認 (オーナー用)
        if (window.watchAuthState) {
            return new Promise((resolve) => {
                window.watchAuthState(async (user) => {
                    
                    // D1セッションがアクティブな場合は Firebase の状態変化を完全に遮断
                    if (sessionStorage.getItem(window.D1_SESSION_LOCK_KEY) === 'd1') {
                        return;
                    }

                    if (user) {
                        const result = await this.handleFirebaseUser(user);
                        resolve(result);
                    } else {
                        // D1 セッションは init 冒頭で確認済みのため、ここでは無条件でログイン画面を表示する
                        // ※ window.SESSION_TOKEN が残っていても Firebase user=null ならリセット扱い
                        if (isBooting) {
                            // 古いトークンおよび残存セッション情報を完全クリア
                            this.clearSession();
                            switchAuthView('officeLogin');
                        }
                        resolve(false);
                    }
                    isBooting = false;
                });
            });
        } else {
            console.warn('[Auth] watchAuthState is not available. Firebase features disabled.');
            return Promise.resolve(false);
        }
    },

    /**
     * Firebase 設定バリデーション
     */
    checkFirebaseConfig() {
        if (!window.firebaseConfig || window.firebaseConfig.apiKey === 'YOUR_API_KEY') {
            console.warn('[Auth] Firebase configuration is incomplete.');
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
        const storedToken = localStorage.getItem(window.SESSION_KEY);
        const storedOffice = localStorage.getItem(window.LOCAL_OFFICE_KEY);
        
        if (storedToken && storedOffice) {
            try {
                const res = await this.fetchFromWorker('renew', { token: storedToken });
                if (res.ok && res.office === storedOffice) {
                    this.session = this.createSessionContext('d1', {
                        token: storedToken,
                        officeId: storedOffice,
                        role: res.role || localStorage.getItem(window.LOCAL_ROLE_KEY) || 'user',
                        officeName: localStorage.getItem(window.LOCAL_OFFICE_NAME_KEY) || storedOffice
                    });
                    await finalizeLogin(res);
                    isBooting = false;
                    return true;
                }
            } catch (e) {
                console.error('【DEBUG】D1セッション復元中に例外発生:', e);
            }
        }
        sessionStorage.removeItem(window.D1_SESSION_LOCK_KEY);
        return false;
    },

    /**
     * Firebaseユーザーの処理
     */
    async handleFirebaseUser(user) {
        if (user.email && !user.emailVerified) {
            const urlParams = new URLSearchParams(window.location.search);
            const hasOfficeParam = !!urlParams.get('office');
            
            if (window.SESSION_TOKEN || sessionStorage.getItem(window.PERSISTENT_SESSION_KEY) || hasOfficeParam) {
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
                } else {
                    // 拠点を持っていない場合は、既存の拠点キャッシュ（もしあれば）をクリアして混同を防ぐ
                    this.clearSession();
                    if (typeof updateTitleBtn === 'function') updateTitleBtn('拠点が未開設です');
                    switchAuthView('createOffice');
                    return true;
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
            if (!window.firebaseConfig || window.firebaseConfig.apiKey === 'YOUR_API_KEY') {
                showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.CONFIG_INCOMPLETE : 'Firebaseの設定が未完了です。');
                return;
            }
            const res = await fbLogin(id, password);
            if (res.ok) {
                // キャッシュをクリアしてからリロードすることで、ログイン後の「拠点跨ぎ」を防止
                this.clearSession();
                sessionStorage.setItem(window.D1_SESSION_LOCK_KEY, 'firebase');
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
            officeId: (data.officeId || '').toLowerCase(),
            role: data.role || 'staff',
            token: data.token
        };
        sessionStorage.setItem(window.D1_SESSION_LOCK_KEY, type);
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
        } else if (resp.error === 'unauthorized') {
            if (resp.reason === 'office_access_denied') {
                alert('この拠点へのアクセス権限がありません。自分が開設した拠点を使用してください。');
                this.clearSession();
                location.reload();
                return;
            }
            if (loginEl) loginEl.classList.remove('u-hidden');
            switchAuthView('officeLogin');
            const errMsg = resp.message || resp.error || '認証エラー';
            showError(`システムエラー: ${errMsg}`);
        } else {
            if (loginEl) loginEl.classList.remove('u-hidden');
            switchAuthView('officeLogin');
            const errMsg = resp.hint ? `${resp.message} (${resp.hint})` : (resp.message || resp.error || '不明なエラー');
            showError(`システムエラー: ${errMsg}`);
        }
    },

    /**
     * セッション・キャッシュ情報の完全クリア
     * ログアウト時やユーザー切り替え時の拠点情報残存を防ぐ。
     */
    clearSession() {
        
        // [V7] CLEAR_ON_LOGOUT_KEYS を使用して完全に破棄
        const keys = window.STORAGE_KEYS ? (window.STORAGE_KEYS.CLEAR_ON_LOGOUT_KEYS || []) : [];
        keys.forEach(key => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });

        // 2. メモリ上の変数をリセット
        window.SESSION_TOKEN = '';
        window.CURRENT_OFFICE_ID = '';
        window.CURRENT_ROLE = 'user';
        window.OFFICE_COLUMN_CONFIG = null;
        window.MENUS = null;
        this.session = null;
    }
};

/**
 * UI の切り替え
 */
function switchAuthView(view) {
  const areas = ['loginFormArea', 'signupFormArea', 'verifyEmailArea', 'createOfficeArea'];
  areas.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('u-hidden');
  });

  if (loginEl && loginFormEl) {
    const isVerifiedView = (view === 'officeLogin' || view === 'verify' || view === 'createOffice');
    const isBoardVisible = (board && !board.classList.contains('u-hidden'));
    
    if (isVerifiedView && window.SESSION_TOKEN && isBoardVisible) {
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
  if (data.token) {
    window.SESSION_TOKEN = data.token;
  }
  window.FORCE_RENDER_ONCE = true;
  isBooting = false;

  localStorage.setItem(window.SESSION_KEY, window.SESSION_TOKEN);
  localStorage.setItem(window.SESSION_OFFICE_KEY, window.CURRENT_OFFICE_ID);
  localStorage.setItem(window.SESSION_ROLE_KEY, window.CURRENT_ROLE);
  const officeName = data.officeName || window.CURRENT_OFFICE_ID;
  localStorage.setItem(window.SESSION_OFFICE_NAME_KEY, officeName);
  
  if (typeof updateTitleBtn === 'function') updateTitleBtn(officeName);

  if (loginEl) loginEl.classList.add('u-hidden');
  if (loginFormEl) loginFormEl.classList.add('u-hidden');
  if (board) {
      board.classList.remove('u-hidden');
  }
  
  sessionStorage.setItem(window.PERSISTENT_SESSION_KEY, 'true');
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
    
    await window.AuthManager.login(loginId, password);
});

// 管理者登録
document.getElementById('btnAuthSignup')?.addEventListener('click', async () => {
  const email = document.getElementById('signupEmail').value;
  const pw = document.getElementById('signupPw').value;

  if (!window.firebaseConfig || window.firebaseConfig.apiKey === 'YOUR_API_KEY') {
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
  const res = await window.AuthManager.fetchFromWorker('createOffice', { 
    token: fbToken, officeId, name, password 
  });
  
  if (res.ok) {
    toast('オフィスを作成しました！管理パネルで初期設定を行ってください。');
    const loginResp = await window.AuthManager.fetchFromWorker('renew', { token: fbToken });
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
window.showQrModal = function(show) {
  if (!qrModal) return;
  if (show) {
    let targetUrl = window.location.origin + window.location.pathname;
    if (window.CURRENT_OFFICE_ID) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'office=' + encodeURIComponent(window.CURRENT_OFFICE_ID);
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
};

document.getElementById('linkGotoSignup')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthView('signup'); });
document.getElementById('linkGotoLogin')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthView('officeLogin'); });
document.getElementById('linkBackToLoginFromVerify')?.addEventListener('click', (e) => { e.preventDefault(); logoutAction(); });
document.getElementById('qrModalClose')?.addEventListener('click', () => window.showQrModal(false));
qrModal?.addEventListener('click', (e) => { if (e.target === qrModal) window.showQrModal(false); });
document.getElementById('btnVerifyDone')?.addEventListener('click', () => location.reload());

const logoutAction = async () => {
  window.AuthManager.clearSession();
  if (typeof fbLogout === 'function') await fbLogout();
  location.reload();
};
document.getElementById('logoutBtn')?.addEventListener('click', logoutAction);
window.logout = logoutAction;

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
window.checkLogin = () => window.AuthManager.init({ remoteEndpoint: window.CONFIG ? window.CONFIG.remoteEndpoint : (typeof CONFIG !== 'undefined' ? CONFIG.remoteEndpoint : '') });
