/* 起動 */
document.addEventListener('DOMContentLoaded', async () => {
  // 拠点リスト取得（public-list）
  try {
    if (typeof refreshPublicOfficeSelect === 'function') {
      await refreshPublicOfficeSelect();
    }
  } catch (e) { console.error(e); }

  // ログイン状態確認（Firebase OnAuthStateChanged）
  // js/auth.js で定義された checkLogin を呼び出す
  if (typeof checkLogin === 'function') {
    await checkLogin();
  } else {
    console.error("checkLogin function not found");
  }

  // お知らせボタンのイベントハンドラ
  // （本来は notices.js などに移動すべきだが、main.js に残っていたので維持）
  const noticesBtn = document.getElementById('noticesBtn');
  if (noticesBtn) {
    noticesBtn.addEventListener('click', () => {
      const noticesArea = document.getElementById('noticesArea');
      if (typeof toggleNoticesArea === 'function') {
        toggleNoticesArea();
      } else if (noticesArea) {
        // フォールバック
        noticesArea.style.display = noticesArea.style.display === 'none' ? 'block' : 'none';
      }
      // スクロール
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    });
  }

  /* === ▼ 追加箇所: イベントボタンの処理 ▼ === */
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
  /* === ▲ 追加箇所ここまで ▲ === */
});
