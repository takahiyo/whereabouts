function startRemoteSync(immediate) {
  if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }

  if (typeof CURRENT_OFFICE_ID === 'undefined' || !CURRENT_OFFICE_ID) {
    console.error("Office ID not found. Cannot start sync.");
    return;
  }

  console.log("Starting sync via Cloudflare Worker (KV Cache enabled).");
  
  startLegacyPolling(immediate);

  /* ▼▼▼ 追加箇所: タブが非表示になったらポーリングを停止 ▼▼▼ */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // 画面が隠れたら停止
      if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }
      console.log("Sync paused (background).");
    } else {
      // 画面に戻ったら再開
      if (!remotePullTimer) {
        startLegacyPolling(true); // 即座に更新確認
        console.log("Sync resumed.");
      }
    }
  });
  /* ▲▲▲ 追加箇所ここまで ▲▲▲ */

  if (typeof startToolsPolling === 'function') { startToolsPolling(); }
  if (typeof startNoticesPolling === 'function') { startNoticesPolling(); }
  if (typeof startVacationsPolling === 'function') { startVacationsPolling(); }
}
