/**
 * js/auth.js - 認証・UI管理
 *
 * Worker認証とログイン/ログアウト、管理モーダル、マニュアルモーダルを管理する。
 *
 * 依存: js/constants/*.js, js/globals.js, js/utils.js, js/sync.js
 * 参照元: main.js
 *
 * @see MODULE_GUIDE.md
 */

/* 認証UI + 管理UI + マニュアルUI - Worker Auth Version */

function logoutButtonsCleanup() {
  closeMenu(); showAdminModal(false); showManualModal(false); showEventModal(false); showToolsModal(false);
  board.style.display = 'none'; board.replaceChildren(); menuList.replaceChildren();
  try { if (typeof stopToolsPolling === 'function') { stopToolsPolling(); } } catch { }
  if (typeof renderVacationRadioMessage === 'function') { renderVacationRadioMessage('読み込み待ち'); }
  if (typeof updateEventDetail === 'function') { updateEventDetail(null); }
  window.scrollTo(0, 0);
}

async function checkLogin() {
  return new Promise((resolve) => {
    const storedOffice = localStorage.getItem(LOCAL_OFFICE_KEY);
    const storedRole = localStorage.getItem(LOCAL_ROLE_KEY);
    if (storedOffice && storedRole) {
      SESSION_TOKEN = 'worker_session';
      CURRENT_OFFICE_ID = storedOffice;
      CURRENT_ROLE = storedRole;
      
      // ★追加: 拠点ごとのカラム設定を復元
      try {
        const savedConfig = localStorage.getItem(getColumnConfigKey(CURRENT_OFFICE_ID));
        if (savedConfig) OFFICE_COLUMN_CONFIG = JSON.parse(savedConfig);
      } catch (e) { console.error(e); }

      updateAuthUI();
      if (typeof startRemoteSync === 'function') startRemoteSync(true);
      if (typeof startConfigWatch === 'function') startConfigWatch();
      if (typeof startNoticesPolling === 'function') startNoticesPolling();
      if (typeof startEventSync === 'function') startEventSync(true);
      if (typeof loadEvents === 'function') loadEvents(CURRENT_OFFICE_ID);
      resolve(true);
      return;
    }
    SESSION_TOKEN = '';
    CURRENT_OFFICE_ID = '';
    CURRENT_ROLE = '';
    updateAuthUI();
    resolve(false);
    return;
  });
}

async function login(officeInput, passwordInput) {
  try {
    // 1. Workerへパスワード確認リクエスト
    const formData = new URLSearchParams();
    formData.append('action', 'login');
    formData.append('office', officeInput);
    formData.append('password', passwordInput);

    const endpoint = (typeof CONFIG !== 'undefined' && CONFIG.remoteEndpoint)
      ? CONFIG.remoteEndpoint
      : '';
    if (!endpoint) {
      throw new Error("Workerのエンドポイント設定が見つかりません。設定を確認してください。");
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });

    const result = await resp.json();

    if (!result.ok) {
      throw new Error("認証に失敗しました。拠点IDまたはパスワードを確認してください。");
    }

    // ★重要：ログイン処理に入る「前」に、拠点情報を保存する
    // これにより、ログイン直後に走る監視役が正しく情報を読み取れます
    localStorage.setItem(LOCAL_OFFICE_KEY, result.office);
    localStorage.setItem(LOCAL_ROLE_KEY, result.role);
    localStorage.setItem(LOCAL_OFFICE_NAME_KEY, result.officeName || result.office);
    
    // ★修正: 拠点ごとのキーで保存
    const configKey = getColumnConfigKey(result.office);
    if (result.columnConfig) {
      localStorage.setItem(configKey, JSON.stringify(result.columnConfig));
    } else {
      localStorage.removeItem(configKey);
    }

    SESSION_TOKEN = 'worker_session';

    // 3. グローバル変数を更新
    CURRENT_OFFICE_ID = result.office;
    CURRENT_OFFICE_NAME = result.officeName || result.office;
    CURRENT_ROLE = result.role;
    OFFICE_COLUMN_CONFIG = result.columnConfig || null;

    console.log('[auth.js] Login success. Office:', result.office, 'Role:', result.role);
    toast(`ログインしました: ${result.officeName}`);

    // UIを即座に表示状態に切り替える
    updateAuthUI();

    // ★追加: ログイン成功後、データ取得と同期を開始
    if (typeof startRemoteSync === 'function') startRemoteSync(true);
    if (typeof startConfigWatch === 'function') startConfigWatch();
    if (typeof startNoticesPolling === 'function') startNoticesPolling();
    if (typeof startEventSync === 'function') startEventSync(true);
    if (typeof loadEvents === 'function') loadEvents(CURRENT_OFFICE_ID);

    if (typeof nameFilter !== 'undefined') {
      nameFilter.value = '';
      if (typeof applyFilters === 'function') {
        applyFilters();
      }
    }

    return true;

  } catch (error) {
    // 認証エラー時のコンソール出力等によるエラー・警告(赤字・黄字)発生を防ぐためログは出さない
    toast(error.message, false);
    return false;
  }
}

async function logout() {
  try {
    // ★追加: キャッシュと同期時刻をクリア
    if (typeof clearLocalCache === 'function') {
      clearLocalCache();
    }

    localStorage.removeItem(LOCAL_OFFICE_KEY);
    localStorage.removeItem(LOCAL_ROLE_KEY);
    localStorage.removeItem(LOCAL_OFFICE_NAME_KEY);
    // 全ての拠点のキャッシュを消すのは過剰なので、現在の拠点のものだけ消す
    localStorage.removeItem(getColumnConfigKey(CURRENT_OFFICE_ID));
    toast("ログオフしました");
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    console.error(e);
  }
}

function updateAuthUI() {
  if (SESSION_TOKEN) {
    if (loginEl) loginEl.classList.add('u-hidden');
    if (board) board.classList.remove('u-hidden');
    ensureAuthUI();
  } else {
    if (loginEl) loginEl.classList.remove('u-hidden');
    if (board) board.classList.add('u-hidden');
    ensureAuthUI();
  }
}

function ensureAuthUI() {
  const loggedIn = !!SESSION_TOKEN;
  const showAdmin = loggedIn && isOfficeAdmin();
  noticesBtn.style.display = 'none'; // デフォルトは非表示、お知らせがある場合にnotices.jsで表示
  adminBtn.style.display = showAdmin ? 'inline-block' : 'none';
  logoutBtn.style.display = loggedIn ? 'inline-block' : 'none';
  toolsBtn.style.display = loggedIn ? 'inline-block' : 'none';
  manualBtn.style.display = loggedIn ? 'inline-block' : 'none';
  qrBtn.style.display = loggedIn ? 'inline-block' : 'none';
  eventBtn.style.display = 'none';
  updateEventButtonVisibility();
  nameFilter.style.display = loggedIn ? 'inline-block' : 'none';
  statusFilter.style.display = loggedIn ? 'inline-block' : 'none';
}
function showAdminModal(yes) {
  const isShow = !!yes;
  adminModal.classList.toggle('show', isShow);
  
  // 背景ロックの徹底 (htmlとbodyの両方をロック)
  document.body.classList.toggle('modal-open', isShow);
  document.documentElement.classList.toggle('modal-open', isShow);
  
  if (isShow) {
    // CSS Grid レイアウトに委ね、インラインスタイルの残留をクリア
    const body = adminModal.querySelector('.admin-card-body');
    if (body) {
      body.style.removeProperty('height');
      body.style.removeProperty('max-height');
      body.style.removeProperty('overflow-y');
      body.style.removeProperty('display');
    }
  } else {
    // 閉じるときにログを消さない（記録のため）
  }
}
function showQrModal(yes) { qrModal.classList.toggle('show', !!yes); }
function showToolsModal(yes) { toolsModal.classList.toggle('show', !!yes); }
function showEventModal(yes) {
  const shouldShow = !!yes;
  eventModal.classList.toggle('show', shouldShow);
  if (shouldShow) {
    eventModal.removeAttribute('aria-hidden');
    eventModal.style.removeProperty('display');
    eventModal.style.removeProperty('visibility');
  } else {
    eventModal.setAttribute('aria-hidden', 'true');
    eventModal.classList.remove('print-mode');
    eventModal.style.display = 'none';
    eventModal.style.visibility = 'hidden';
  }
}
async function applyRoleToAdminPanel() {
  if (!(adminOfficeRow && adminOfficeSel)) return;
  if (CURRENT_ROLE !== 'superAdmin') {
    adminOfficeRow.style.display = 'none';
    const btnTabOffices = document.getElementById('btnTabOffices');
    if (btnTabOffices) btnTabOffices.classList.add('u-hidden');
    adminOfficeSel.disabled = false;
    adminOfficeSel.textContent = '';
    adminSelectedOfficeId = '';
    return;
  }

  adminOfficeRow.style.display = '';
  const btnTabOffices = document.getElementById('btnTabOffices');
  if (btnTabOffices) btnTabOffices.classList.remove('u-hidden');
  adminOfficeSel.disabled = true;
  adminOfficeSel.textContent = '';
  const loadingOpt = document.createElement('option');
  loadingOpt.value = ''; loadingOpt.disabled = true; loadingOpt.selected = true; loadingOpt.textContent = '読込中…';
  adminOfficeSel.appendChild(loadingOpt);

  let offices = [];
  try {
    const res = await apiPost({ action: 'listOffices', token: SESSION_TOKEN });
    if (res && res.ok !== false && Array.isArray(res.offices)) {
      offices = res.offices;
    } else {
      throw new Error(res && res.error ? String(res.error) : 'unexpected_response');
    }
  } catch (err) {
    console.error('listOffices failed', err);
    adminOfficeSel.textContent = '';
    const opt = document.createElement('option');
    opt.value = ''; opt.disabled = true; opt.selected = true; opt.textContent = '取得に失敗しました';
    adminOfficeSel.appendChild(opt);
    adminSelectedOfficeId = '';
    adminOfficeSel.disabled = false;
    toast('拠点一覧の取得に失敗しました', false);
    return;
  }

  adminOfficeSel.textContent = '';
  const seen = new Set();
  let desiredId = adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
  let hasDesired = false;

  offices.forEach(o => {
    if (!o) return;
    const id = String(o.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = stripCtl(o.name == null ? id : String(o.name)) || id;
    adminOfficeSel.appendChild(opt);
    if (id === desiredId) hasDesired = true;
  });

  if (adminOfficeSel.options.length === 0) {
    const opt = document.createElement('option');
    opt.value = ''; opt.disabled = true; opt.selected = true; opt.textContent = '拠点がありません';
    adminOfficeSel.appendChild(opt);
    adminSelectedOfficeId = '';
    adminOfficeSel.disabled = false;
    return;
  }

  if (!hasDesired) {
    if (CURRENT_OFFICE_ID && seen.has(CURRENT_OFFICE_ID)) desiredId = CURRENT_OFFICE_ID;
    else desiredId = adminOfficeSel.options[0].value || '';
  }

  if (desiredId) { adminOfficeSel.value = desiredId; }
  if (adminOfficeSel.selectedIndex < 0) { adminOfficeSel.selectedIndex = 0; desiredId = adminOfficeSel.value || ''; }
  adminSelectedOfficeId = desiredId || '';
  adminOfficeSel.disabled = false;
}
function showManualModal(yes) { manualModal.classList.toggle('show', !!yes); }
function applyRoleToManual() {
  const isAdmin = isOfficeAdmin();
  // 管理者タブボタンの表示/非表示
  const adminTabBtn = document.querySelector('.manual-tab-btn[data-tab="admin"]');
  if (adminTabBtn) {
    adminTabBtn.style.display = isAdmin ? 'inline-block' : 'none';
  }
  // デフォルトタブの設定（管理者なら管理者タブ、それ以外はユーザータブ）
  const userTabBtn = document.querySelector('.manual-tab-btn[data-tab="user"]');
  if (isAdmin && adminTabBtn) {
    // 管理者の場合は管理者タブを表示
    document.querySelectorAll('.manual-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.manual-tab-content').forEach(c => c.classList.remove('active'));
    adminTabBtn.classList.add('active');
    manualAdmin.classList.add('active');
  } else {
    // 一般ユーザーの場合はユーザータブを表示
    document.querySelectorAll('.manual-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.manual-tab-content').forEach(c => c.classList.remove('active'));
    if (userTabBtn) userTabBtn.classList.add('active');
    manualUser.classList.add('active');
  }
}

/* 管理/マニュアルUIイベント */
adminBtn.addEventListener('click', async () => {
  applyRoleToAdminPanel();
  showAdminModal(true);
  if (typeof loadAdminMembers === 'function') { try { await loadAdminMembers(); } catch { } }
});
adminClose.addEventListener('click', () => showAdminModal(false));
logoutBtn.addEventListener('click', logout);

eventBtn.addEventListener('click', async () => {
  const targetOfficeId = (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
  const list = await loadEvents(targetOfficeId, true, { visibleOnly: true, onSelect: handleEventSelection });
  if (!Array.isArray(list) || list.length === 0) { toast('表示対象なし'); return; }
  const ctrl = getEventGanttController();
  if (ctrl?.setSaveMode) {
    ctrl.setSaveMode('event-auto');
  }
  showEventModal(true);
});
eventClose.addEventListener('click', () => showEventModal(false));

manualBtn.addEventListener('click', () => { applyRoleToManual(); showManualModal(true); });
manualClose.addEventListener('click', () => showManualModal(false));
toolsBtn.addEventListener('click', () => showToolsModal(true));
toolsModalClose.addEventListener('click', () => showToolsModal(false));
qrModalClose.addEventListener('click', () => showQrModal(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    showAdminModal(false);
    showManualModal(false);
    showToolsModal(false);
    showEventModal(false);
    showQrModal(false);
    closeMenu();
  }
});

function setupModalOverlayClose(modalEl, closeFn) {
  if (!modalEl) return;
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) { closeFn(); }
  });
}

setupModalOverlayClose(adminModal, () => showAdminModal(false));
setupModalOverlayClose(manualModal, () => showManualModal(false));
setupModalOverlayClose(toolsModal, () => showToolsModal(false));
setupModalOverlayClose(eventModal, () => showEventModal(false));
setupModalOverlayClose(qrModal, () => showQrModal(false));

/* マニュアルタブ切り替え */
document.querySelectorAll('.manual-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    // すべてのタブボタンとコンテンツのactiveクラスを削除
    document.querySelectorAll('.manual-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.manual-tab-content').forEach(c => c.classList.remove('active'));
    // クリックされたタブボタンとそのコンテンツにactiveクラスを追加
    btn.classList.add('active');
    let targetContent = null;
    if (targetTab === 'user') {
      targetContent = document.getElementById('manualUser');
    } else if (targetTab === 'admin') {
      targetContent = document.getElementById('manualAdmin');
    }
    if (targetContent) {
      targetContent.classList.add('active');
      if (targetContent.scrollHeight > targetContent.clientHeight) {
        targetContent.scrollTop = 0;
      }
    }
  });
});

/* ログインボタン（Worker Auth） */
if (btnLogin) {
  btnLogin.addEventListener('click', async () => {
    const pw = pwInput.value;
    const office = officeSel.value;
    if (!office) { if (loginMsg) loginMsg.textContent = "拠点IDを入力してください"; return; }
    if (!pw) { if (loginMsg) loginMsg.textContent = "パスワードを入力してください"; return; }

    if (loginMsg) loginMsg.textContent = "認証中…";
    const success = await login(office, pw);
    if (loginMsg) {
      if (success) loginMsg.textContent = "";
      else loginMsg.textContent = "認証に失敗しました";
    }
  });
}

// インラインイベントハンドラの代替
if (officeSel) {
  officeSel.addEventListener('input', () => {
    const dummyUsername = document.getElementById('dummyUsername');
    if (dummyUsername) {
      dummyUsername.value = officeSel.value;
    }
  });
}
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', (e) => e.preventDefault());
}
