/**
 * js/auth.js - 認証 UI & ハイブリッド連携 (Shared PW + Firebase)
 * 
 * 1. 拠点ログイン (共有パスワード): 現場社員・管理スタッフ用
 * 2. 管理者ポータル (Firebase): オーナー用 (拠点開設・管理者登録)
 */

import { 
  signup as fbSignup, 
  login as fbLogin, 
  logout as fbLogout, 
  watchAuthState,
  getValidToken as getFbToken
} from './firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

// DOM Elements
const loginEl = document.getElementById('login');
const board = document.getElementById('board');
const loginMsg = document.getElementById('loginMsg');
const adminBtn = document.getElementById('adminBtn');
const logoutBtn = document.getElementById('logoutBtn');
const toolsBtn = document.getElementById('toolsBtn');
const manualBtn = document.getElementById('manualBtn');
const qrBtn = document.getElementById('qrBtn');
const qrModal = document.getElementById('qrModal');

// Auth State Variables
let isBooting = true;

/**
 * 初期化: Auth 状態の監視開始
 */
export async function checkLogin() {
  return new Promise(async (resolve) => {
    console.log('【DEBUG】checkLogin 開始');
    // 0. URLパラメータによる自動入力 (?office=拠点ID)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const officeParam = urlParams.get('office');
      if (officeParam) {
        const idInput = document.getElementById('loginOfficeId');
        if (idInput) {
          idInput.value = officeParam;
          // 自動入力された場合は視覚的に強調
          idInput.style.backgroundColor = '#f0f9ff'; 
          setTimeout(() => { idInput.style.backgroundColor = ''; }, 2000);
        }
      }
    } catch (e) {
      console.warn('URL parameter auto-fill failed:', e);
    }

    // 1. ローカルに保存されたセッション（拠点ログイン）があるか確認
    const storedToken = localStorage.getItem(SESSION_KEY);
    const storedOffice = localStorage.getItem(LOCAL_OFFICE_KEY);
    const storedRole = localStorage.getItem(LOCAL_ROLE_KEY);

    if (storedToken && storedOffice) {
      finalizeLogin({
        token: storedToken,
        office: storedOffice,
        role: storedRole || 'user',
        officeName: localStorage.getItem(LOCAL_OFFICE_NAME_KEY) || storedOffice
      });
      resolve(true);
      isBooting = false;
      return;
    }

    // 2. Firebase の状態を確認 (オーナー用)
    watchAuthState(async (user) => {
      console.log('【DEBUG】watchAuthState 通知受理. User:', user ? user.email : 'null');
      
      if (user) {
        console.log('【DEBUG】Firebase ユーザー検知:', user.email, 'Verified:', user.emailVerified);
        if (!user.emailVerified) {
          console.log('【DEBUG】メール未認証です');
          switchAuthView('verify');
          resolve(false);
          return;
        }
        
        // Firebase ログイン中なら Worker と同期
        console.log('【DEBUG】Worker 同期開始 (action: signup)');
        const fbToken = await getFbToken();
        const resp = await fetchFromWorker('signup', { token: fbToken });
        console.log('【DEBUG】Worker 同期応答:', resp);

        if (resp.ok) {
          const workerUser = resp.user || {};
          if (workerUser.office_id) {
            console.log('【DEBUG】拠点所属済み:', workerUser.office_id);
            const loginResp = await fetchFromWorker('renew', { token: fbToken });
            if (loginResp.ok) {
                await finalizeLogin(loginResp);
                resolve(true);
                return;
            }
          } else {
            console.log('【DEBUG】拠点未作成状態です');
            switchAuthView('createOffice');
            resolve(false);
          }
        } else {
          console.error('【DEBUG】Worker 同期失敗:', resp);
          showError(`システムエラー: ${resp.message || resp.error || '不明なエラー'}`);
          resolve(false);
        }
      } else {
        console.log('【DEBUG】ログイン情報なし');
        if (isBooting) {
            switchAuthView('officeLogin');
        }
        resolve(false);
      }
      isBooting = false;
    });
  });
}

/**
 * UI の切り替え
 */
function switchAuthView(view) {
  console.log(`【DEBUG】switchAuthView 遷移先: ${view}`);
  // 全て隠す
  const areas = ['loginFormArea', 'signupFormArea', 'verifyEmailArea', 'createOfficeArea'];
  areas.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('u-hidden');
    } else {
      console.warn(`【DEBUG】警告: 要素が見つかりません: ${id}`);
    }
  });

  if (loginEl) {
    loginEl.classList.remove('u-hidden');
    console.log('【DEBUG】#login コンテナを表示しました');
  } else {
    console.error('【DEBUG】エラー: #login 要素が DOM に存在しません');
  }
  if (board) board.classList.add('u-hidden');

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
      console.log(`【DEBUG】エリアを表示しました: ${targetId}`);
    } else {
      console.error(`【DEBUG】エラー: 表示対象の要素が見つかりません: ${targetId}`);
    }
  }
}

/**
 * ログイン完了処理
 */
async function finalizeLogin(data) {
  CURRENT_OFFICE_ID = data.office;
  CURRENT_ROLE = data.role || 'user';
  SESSION_TOKEN = data.token;

  localStorage.setItem(SESSION_KEY, SESSION_TOKEN);
  localStorage.setItem(LOCAL_OFFICE_KEY, CURRENT_OFFICE_ID);
  localStorage.setItem(LOCAL_ROLE_KEY, CURRENT_ROLE);
  localStorage.setItem(LOCAL_OFFICE_NAME_KEY, data.officeName || CURRENT_OFFICE_ID);

  if (loginEl) loginEl.classList.add('u-hidden');
  if (board) board.classList.remove('u-hidden');
  ensureAuthUI();

  // 同期サイクル
  if (typeof startRemoteSync === 'function') startRemoteSync(true);
  if (typeof startConfigWatch === 'function') startConfigWatch();
  if (typeof startNoticesPolling === 'function') startNoticesPolling();
  if (typeof startEventSync === 'function') startEventSync(true);
  if (typeof loadEvents === 'function') loadEvents(CURRENT_OFFICE_ID);
}

/**
 * Worker 通信用ヘルパー
 */
async function fetchFromWorker(action, bodyParams) {
  const params = new URLSearchParams();
  params.append('action', action);
  for (const key in bodyParams) {
    if (bodyParams[key] != null) params.append(key, bodyParams[key]);
  }

  const endpoint = CONFIG.remoteEndpoint;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return await resp.json();
}

/**
 * エラー表示
 */
function showError(msg) {
  if (loginMsg) {
    loginMsg.textContent = msg;
    loginMsg.style.color = 'var(--color-red-600)';
  }
}

// ---------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------

// ユニファイド・ログイン (拠点ID または メールアドレス)
document.getElementById('btnSimpleLogin')?.addEventListener('click', async () => {
  const loginId = document.getElementById('loginOfficeId').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!loginId || !password) return showError('拠点名またはメールアドレスとパスワードを入力してください。');

  if (loginMsg) loginMsg.textContent = '認証中...';

  if (loginId.includes('@')) {
    // 1. メールアドレス形式なら Firebase オーナー認証を試行
    const res = await fbLogin(loginId, password);
    if (res.ok) {
      location.reload();
    } else {
      if (res.error === 'email_not_verified') switchAuthView('verify');
      else showError('管理者認証に失敗しました。パスワードを確認してください。');
    }
  } else {
    // 2. それ以外なら通常の拠点パスワード認証を試行
    const res = await fetchFromWorker('login', { office: loginId, password });
    if (res.ok) {
      await finalizeLogin(res);
    } else {
      showError('ログインに失敗しました。拠点名またはパスワードが正しくありません。');
    }
  }
});

// 管理者登録
document.getElementById('btnAuthSignup')?.addEventListener('click', async () => {
  const email = document.getElementById('signupEmail').value;
  const pw = document.getElementById('signupPw').value;

  // Firebase設定チェック
  if (!firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    return showError('【設定不備】Firebaseの設定が完了していません。js/firebase-config.js を編集してください。');
  }

  if (!email || pw.length < 6) return showError('正しいメールアドレスと6文字以上のパスワードを入力してください。');

  const res = await fbSignup(email, pw);
  if (res.ok) switchAuthView('verify');
  else showError('登録失敗: ' + (res.error || ''));
});

// 新規拠点作成
document.getElementById('btnCreateOffice')?.addEventListener('click', async () => {
  // [AFTER] 常に小文字として扱うことで大文字混在によるバリデーションエラーを防ぐ
  const officeId = document.getElementById('newOfficeId').value.trim().toLowerCase();
  const name = document.getElementById('newOfficeName').value.trim();
  const password = document.getElementById('newOfficePw').value;
  const adminPassword = document.getElementById('newOfficeAdminPw').value;

  if (!officeId.match(/^[a-z0-9_]+$/)) return showError('オフィスIDは半角英数字と(_)のみ使用可能です。');
  if (!name || !password || !adminPassword) return showError('全ての項目を入力してください。');

  const fbToken = await getFbToken();
  const res = await fetchFromWorker('createOffice', { 
    token: fbToken, officeId, name, password, adminPassword 
  });
  
  if (res.ok) {
    toast('オフィスを作成しました！');
    location.reload();
  } else {
    showError('作成失敗: ' + (res.error || '既にIDが使われています'));
  }
});

// リンク等
/**
 * QRコードモーダルの表示と動的生成
 */
export function showQrModal(show) {
  if (!qrModal) return;
  if (show) {
    // 現在の拠点セットに基づいたURLを生成
    // ログインしていない場合はベースURLのみ
    let targetUrl = window.location.origin + window.location.pathname;
    if (CURRENT_OFFICE_ID) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'office=' + encodeURIComponent(CURRENT_OFFICE_ID);
    }

    // QRコード生成
    try {
      const qrElement = document.getElementById('qrOutput');
      if (qrElement && typeof qrcode === 'function') {
        const qr = qrcode();
        qr.setTypeNumber(0); // Auto detect
        qr.setErrorCorrectionLevel('M');
        qr.addData(targetUrl);
        qr.make();
        
        // SVGとして描画 (Rich Aesthetics)
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

// リンク等
document.getElementById('linkGotoSignup')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthView('signup'); });
document.getElementById('linkGotoLogin')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthView('officeLogin'); });
document.getElementById('qrModalClose')?.addEventListener('click', () => showQrModal(false));
document.getElementById('btnVerifyDone')?.addEventListener('click', () => location.reload());

// ログアウト
const logoutAction = async () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_OFFICE_KEY);
  localStorage.removeItem(LOCAL_ROLE_KEY);
  await fbLogout();
  location.reload();
};
document.getElementById('logoutBtn')?.addEventListener('click', logoutAction);
window.logout = logoutAction;
window.showQrModal = showQrModal;

/**
 * legacy UI helpers
 */
function ensureAuthUI() {
  const loggedIn = !!SESSION_TOKEN;
  const isAdmin = loggedIn && (CURRENT_ROLE === 'owner' || CURRENT_ROLE === 'officeAdmin' || CURRENT_ROLE === 'superAdmin');
  
  if (adminBtn) adminBtn.style.display = isAdmin ? 'inline-block' : 'none';
  if (logoutBtn) logoutBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (toolsBtn) toolsBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (manualBtn) manualBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (qrBtn) qrBtn.style.display = loggedIn ? 'inline-block' : 'none';
  
  const nameFilter = document.getElementById('nameFilter');
  const statusFilter = document.getElementById('statusFilter');
  if (nameFilter) nameFilter.style.display = loggedIn ? 'inline-block' : 'none';
  if (statusFilter) statusFilter.style.display = loggedIn ? 'inline-block' : 'none';
  
  // 管理パネルの拠点選択を無効化
  const adminOfficeRow = document.getElementById('adminOfficeRow');
  if (adminOfficeRow) adminOfficeRow.style.display = 'none';
}
window.ensureAuthUI = ensureAuthUI;
window.checkLogin = checkLogin;
