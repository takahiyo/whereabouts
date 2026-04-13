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
const loginFormEl = document.getElementById('loginForm');
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
const PERSISTENT_SESSION_KEY = 'whereabouts_persistent_session';
console.log('【DEBUG】js/auth.js Loaded (Version: 20260408_v5)');

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
      console.log('【DEBUG】既存のセッション情報を検知:', storedOffice);
      try {
        // 既存のセッションをサーバーで検証
        const res = await fetchFromWorker('renew', { token: storedToken });
        console.log('【DEBUG】renew 応答:', res);
        if (res.ok && res.office === storedOffice) {
          console.log('【DEBUG】セッションの検証に成功しました');
          await finalizeLogin({
            token: storedToken,
            office: storedOffice,
            role: res.role || storedRole || 'user',
            officeName: localStorage.getItem(LOCAL_OFFICE_NAME_KEY) || storedOffice
          });
          if (typeof updateTitleBtn === 'function') updateTitleBtn();
          resolve(true);
          isBooting = false;
          return;
        } else {
          console.warn('【DEBUG】セッションが無効、または拠点不一致のためクリアします');
          await logout();
          resolve(false);
          return;
        }
      } catch (e) {
        console.error('【DEBUG】起動時のセッション検証に失敗しました:', e);
        // 通信エラーなどの場合は一旦保留にするか、あるいは安全のためログアウト
        await logout();
        resolve(false);
        return;
      }
    }

    // 2. Firebase の状態を確認 (オーナー用)
    watchAuthState(async (user) => {
      console.log('【DEBUG】watchAuthState 通知受理. User:', user ? user.email : 'null');
      
      if (user) {
        console.log('【DEBUG】Firebase ユーザー検知:', user.email, 'Verified:', user.emailVerified);
        if (user.email && !user.emailVerified) {
          // [AFTER] すでに拠点セッション（共有PW）でログイン済みの場合は、Firebaseの未認証状態によってUIを遮断しない
          // [V5] また、URLに office パラメータがある（QRスキャン時など）場合は拠点ログインを優先するため、リダイレクトをスキップする
          const urlParams = new URLSearchParams(window.location.search);
          const hasOfficeParam = !!urlParams.get('office');
          
          if (SESSION_TOKEN || sessionStorage.getItem(PERSISTENT_SESSION_KEY) || hasOfficeParam) {
            console.log('【DEBUG】[ガード/Firebase] 拠点セッションまたはofficeパラメータを検知したため、メール未認証チェックをスキップします');
            return;
          }
          console.log('【DEBUG】メール未認証です');
          switchAuthView('verify');
          resolve(false);
          return;
        }
        
        // Firebase ログイン中なら Worker と同期
        console.log('【DEBUG】Worker 同期開始 (action: signup)');
        try {
          const fbToken = await getFbToken();
          const resp = await fetchFromWorker('signup', { token: fbToken });
          console.log('【DEBUG】Worker 同期応答:', resp);

          if (resp.ok) {
            console.log('【DEBUG】Worker 同期成功:', resp);
            const wasBooting = isBooting;
            isBooting = false; // 同期成功で起動完了

            if (resp.user && resp.user.office_id) {
              // すでに拠点に紐付いている場合
              const loginResp = await fetchFromWorker('renew', { token: fbToken });
              if (loginResp.ok) {
                  await finalizeLogin(loginResp);
                  resolve(true);
                  return;
              }
            } else if (wasBooting) {
              // [FIX] 新規登録直後は isBooting が true のはずなので、拠点作成画面へ遷移させる
              switchAuthView('createOffice');
              resolve(false);
            }
          } else {
            console.error('【DEBUG】Worker 同期失敗:', resp);
            // [FIX] サーバー側でメール未認証判定された場合は、クライアントの状態に関わらず強制遷移させる
            if (resp.error === 'email_not_verified') {
              switchAuthView('verify');
            } else {
              // [FIX] ホワイトアウト防止：ログイン画面を強制表示し、エラーを可視化する
              if (loginEl) loginEl.classList.remove('u-hidden');
              switchAuthView('officeLogin');
              
              const errMsg = resp.hint 
                ? `${resp.message} (${resp.hint})` 
                : (resp.message || resp.error || '不明なエラー');
              showError(`システムエラー: ${errMsg}`);
            }
            resolve(false);
          }
        } catch (syncErr) {
          console.error('【DEBUG】Worker 同期中に例外発生:', syncErr);
          if (loginEl) loginEl.classList.remove('u-hidden');
          switchAuthView('officeLogin');
          showError(`通信エラーが発生しました: ${syncErr.message}`);
          resolve(false);
        }
      } else {
        console.log('【DEBUG】ログイン情報なし');
        // SESSION_TOKEN がすでに存在する場合（手入力ログイン中）は、Firebaseがnullでもログイン画面へ戻さない
        if (isBooting && !SESSION_TOKEN) {
            switchAuthView('officeLogin');
        } else {
            console.log('【DEBUG】有効な拠点セッションが維持されているため遷移をスキップします');
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

  if (loginEl && loginFormEl) {
    // [AFTER] すでにボードが表示されている場合は、ログイン画面や認証待ち画面への強制遷移を抑制する
    const isVerifiedView = (view === 'officeLogin' || view === 'verify' || view === 'createOffice');
    const isBoardVisible = (board && !board.classList.contains('u-hidden')) || sessionStorage.getItem(PERSISTENT_SESSION_KEY);
    
    if (isVerifiedView && (SESSION_TOKEN || sessionStorage.getItem(PERSISTENT_SESSION_KEY)) && isBoardVisible) {
      console.log(`【DEBUG】[ガード/SwitchView] すでにログイン済みのボードが有効なため、${view} への遷移を拒否しました`);
      return;
    }
    
    loginEl.classList.remove('u-hidden');
    loginFormEl.classList.remove('u-hidden');
    console.log('【DEBUG】#login コンテナを表示しました');
  } else {
    console.error('【DEBUG】エラー: #login または #loginForm 要素が DOM に存在しません');
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
  console.log('【DEBUG】finalizeLogin 実行 (スタックトレース):');
  console.trace();
  console.log('【DEBUG】finalizeLogin データ:', JSON.stringify(data, null, 2));

  if (!data || !data.office) {
    console.error('【DEBUG】不正なログインデータです。処理を中断します。', data);
    return;
  }

  CURRENT_OFFICE_ID = data.office;
  CURRENT_ROLE = data.role || 'user';
  SESSION_TOKEN = data.token;
  isBooting = false; // ログイン完了時点で初期化フェーズ終了

  localStorage.setItem(SESSION_KEY, SESSION_TOKEN);
  localStorage.setItem(LOCAL_OFFICE_KEY, CURRENT_OFFICE_ID);
  localStorage.setItem(LOCAL_ROLE_KEY, CURRENT_ROLE);
  const officeName = data.officeName || CURRENT_OFFICE_ID;
  localStorage.setItem(LOCAL_OFFICE_NAME_KEY, officeName);
  
  if (typeof updateTitleBtn === 'function') updateTitleBtn(officeName);

  if (loginEl) {
    loginEl.classList.add('u-hidden');
  }
  if (loginFormEl) {
    loginFormEl.classList.add('u-hidden');
    console.log('【DEBUG】#loginForm を非表示にしました');
  }
  if (board) {
    board.classList.remove('u-hidden');
    console.log('【DEBUG】#board を表示しました');
  }
  
  // [V3] セッション中に Firebase 状態変化で飛ばされないようフラグを立てる
  sessionStorage.setItem(PERSISTENT_SESSION_KEY, 'true');
  
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
    console.log('【DEBUG】拠点ログイン試行:', { office: loginId, pass: password ? '***' : '(empty)' });
    const res = await fetchFromWorker('login', { office: loginId, password });
    console.log('【DEBUG】Worker ログイン応答:', res);

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
  // [AFTER] 全角英数字を半角に変換するヘルパー
  const toHalfWidth = (str) => str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  
  const rawId = document.getElementById('newOfficeId').value.trim();
  const officeId = toHalfWidth(rawId).toLowerCase(); // 常に小文字・半角
  const name = document.getElementById('newOfficeName').value.trim();
  const password = document.getElementById('newOfficePw').value;
  const adminPassword = document.getElementById('newOfficeAdminPw').value;

  console.log('【DEBUG】拠点作成試行:', { rawId, officeId, nameLength: name.length });

  if (!officeId) return showError('オフィスIDを入力してください。');
  if (!officeId.match(/^[a-z0-9_]+$/)) {
    console.warn('【DEBUG】バリデーション失敗(ID形式):', officeId);
    return showError('オフィスIDは半角英数字と(_)のみ使用可能です。');
  }
  if (!name || !password || !adminPassword) return showError('全ての項目を入力してください。');

  const fbToken = await getFbToken();
  console.log('【DEBUG】Workerへ送信 (action: createOffice)');
  const res = await fetchFromWorker('createOffice', { 
    token: fbToken, officeId, name, password, adminPassword 
  });
  
  if (res.ok) {
    toast('オフィスを作成しました！管理パネルで初期設定を行ってください。');
    
    // [AFTER] 拠点作成後はリロードせずにそのまま管理者としてログイン完了させる
    // これにより、ユーザーが即座にメンバー登録などの作業を開始できる
    const loginResp = await fetchFromWorker('renew', { token: fbToken });
    if (loginResp.ok) {
      await finalizeLogin(loginResp);
      
      // 管理パネルを自動で開く
      if (typeof window.openAdminModal === 'function') {
        window.openAdminModal();
      }
    } else {
      // 失敗した場合はリロードして通常通りログインを促す
      location.reload();
    }
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
document.getElementById('linkBackToLoginFromVerify')?.addEventListener('click', (e) => { e.preventDefault(); logoutAction(); });
document.getElementById('qrModalClose')?.addEventListener('click', () => showQrModal(false));
qrModal?.addEventListener('click', (e) => {
  if (e.target === qrModal) showQrModal(false);
});
document.getElementById('btnVerifyDone')?.addEventListener('click', () => location.reload());

// ログアウト
const logoutAction = async () => {
  console.log('【DEBUG】logoutAction 実行');
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_OFFICE_KEY);
  localStorage.removeItem(LOCAL_ROLE_KEY);
  sessionStorage.removeItem(PERSISTENT_SESSION_KEY);
  
  // [FIX] fbLogout (firebase-auth.js) 内で reload されるため、
  // ここでの reload は fbLogout の完了を待つ形にする
  await fbLogout();
};
document.getElementById('logoutBtn')?.addEventListener('click', logoutAction);
window.logout = logoutAction;
window.showQrModal = showQrModal;

/**
 * legacy UI helpers
 */
function ensureAuthUI() {
  const loggedIn = !!SESSION_TOKEN;
  // 管理者権限の判定 (SSOT: CURRENT_ROLE を基準にする)
  const isAdmin = loggedIn && (CURRENT_ROLE === 'owner' || CURRENT_ROLE === 'officeAdmin' || CURRENT_ROLE === 'superAdmin');
  
  // デバッグ用（不安定な場合は残すが、本番では静かにする）
  // console.log('【DEBUG】ensureAuthUI:', { loggedIn, isAdmin, role: CURRENT_ROLE });

  if (adminBtn) {
    adminBtn.style.display = isAdmin ? 'inline-block' : 'none';
  }
  if (logoutBtn) {
    logoutBtn.style.display = loggedIn ? 'inline-block' : 'none';
  }
  if (toolsBtn) toolsBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (manualBtn) manualBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (qrBtn) qrBtn.style.display = loggedIn ? 'inline-block' : 'none';
  
  const nameFilter = document.getElementById('nameFilter');
  const statusFilter = document.getElementById('statusFilter');
  if (nameFilter) nameFilter.style.display = loggedIn ? 'inline-block' : 'none';
  if (statusFilter) statusFilter.style.display = loggedIn ? 'inline-block' : 'none';
  
  // 管理パネル内での拠点選択（管理者用）
  const adminOfficeRow = document.getElementById('adminOfficeRow');
  if (adminOfficeRow) {
    // SuperAdmin以外は自分の拠点のみなので非表示にする（SSOT原則）
    adminOfficeRow.style.display = (CURRENT_ROLE === 'superAdmin') ? 'flex' : 'none';
  }
}
window.ensureAuthUI = ensureAuthUI;
window.checkLogin = checkLogin;
