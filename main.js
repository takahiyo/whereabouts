/**
 * main.js - アプリケーションエントリーポイント
 *
 * DOMContentLoaded後の初期化処理を管理する。
 * - 拠点リスト取得
 * - ログイン状態確認
 * - UIイベントハンドラ設定
 *
 * 依存: js/config.js, js/constants/*.js, js/globals.js, js/auth.js, js/offices.js
 * 参照元: index.html (最後に読み込み)
 *
 * @see MODULE_GUIDE.md
 */

/* 起動 */
document.addEventListener('DOMContentLoaded', async () => {
  // 拠点リスト取得（public-list）
  try {
    if (typeof refreshPublicOfficeSelect === 'function') {
      await refreshPublicOfficeSelect();
    }
  } catch (e) { console.error(e); }

  // ログイン状態確認
  // js/auth.js で定義された checkLogin を呼び出す
  if (typeof checkLogin === 'function') {
    await checkLogin();
  } else {
    console.error("checkLogin function not found");
  }

  // お知らせボタンのイベントハンドラ
  const noticesBtn = document.getElementById('noticesBtn');
  if (noticesBtn) {
    noticesBtn.addEventListener('click', () => {
      if (typeof toggleNoticesArea === 'function') {
        toggleNoticesArea();
      }
      // スクロール
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    });
  }


  /* イベントモーダル */
  const eventBtn = document.querySelector('header .event-btn');
  const eventModal = document.getElementById('eventModal');
  // モーダル内の閉じるボタン（ID指定またはクラス指定）
  const eventCloseBtn = document.getElementById('eventClose') || (eventModal ? eventModal.querySelector('.close-btn') : null);

  if (eventBtn && eventModal) {
    eventBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // モーダルを表示するクラスを付与
      eventModal.classList.add('show');
      // 必要であれば display も明示的に操作
      eventModal.style.display = 'flex';
    });
  }

  // 閉じるボタンの処理
  if (eventCloseBtn && eventModal) {
    eventCloseBtn.addEventListener('click', () => {
      eventModal.classList.remove('show');
      eventModal.style.display = 'none';
    });
  }
  // QRコードボタンのイベントハンドラ
  if (qrBtn) {
    qrBtn.addEventListener('click', () => {
      if (typeof showQrModal === 'function') {
        showQrModal(true);
      }
    });
  }

  /* ツールモーダル */
  const toolsBtnEl = document.getElementById('toolsBtn');
  const toolsModalEl = document.getElementById('toolsModal');
  const toolsModalCloseEl = document.getElementById('toolsModalClose');

  if (toolsBtnEl && toolsModalEl) {
    toolsBtnEl.addEventListener('click', (e) => {
      e.preventDefault();
      toolsModalEl.classList.add('show');
      toolsModalEl.style.display = 'flex';
      // ツール一覧を最新化
      if (typeof fetchTools === 'function') {
        fetchTools().catch(err => console.error('fetchTools error:', err));
      }
    });
  }

  if (toolsModalCloseEl && toolsModalEl) {
    toolsModalCloseEl.addEventListener('click', () => {
      toolsModalEl.classList.remove('show');
      toolsModalEl.style.display = 'none';
    });
  }
});

