/* === Before: js/notices.js (startLegacyNoticesPolling関数) === */
function startLegacyNoticesPolling() {
  if (noticesPollingTimer) return;
  fetchNotices();
  noticesPollingTimer = setInterval(() => {
    if (SESSION_TOKEN) fetchNotices();
    else stopNoticesPolling();
  }, 30000);
}

/* === After: js/notices.js (startLegacyNoticesPolling関数) === */
function startLegacyNoticesPolling() {
  // 重複起動防止
  if (noticesPollingTimer || window._noticesVisibilityHandler) return;

  const pollInterval = 60000 * 5; // 5分に1回程度で十分

  const runPoll = () => {
    if (SESSION_TOKEN) fetchNotices();
    else stopNoticesPolling();
  };

  fetchNotices(); // 初回実行

  // ★追加: Visibility API対応
  window._noticesVisibilityHandler = () => {
    if (document.hidden) {
      if (noticesPollingTimer) {
        clearInterval(noticesPollingTimer);
        noticesPollingTimer = null;
      }
    } else {
      if (!noticesPollingTimer && SESSION_TOKEN) {
        runPoll(); // 復帰時実行
        noticesPollingTimer = setInterval(runPoll, pollInterval);
      }
    }
  };
  document.addEventListener('visibilitychange', window._noticesVisibilityHandler);

  if (!document.hidden) {
    noticesPollingTimer = setInterval(runPoll, pollInterval);
  }
}
