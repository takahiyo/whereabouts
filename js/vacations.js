/* === Before: js/vacations.js (startVacationsPolling関数) === */
  vacationsPollTimer = setInterval(() => {
    fetchVacations();
  }, interval);
}

function stopVacationsPolling() {
  if (vacationsPollTimer) { clearInterval(vacationsPollTimer); vacationsPollTimer = null; }
}

/* === After: js/vacations.js (startVacationsPolling関数) === */
  // ★追加: Visibility API対応
  if (window._vacationsVisibilityHandler) {
    document.removeEventListener('visibilitychange', window._vacationsVisibilityHandler);
  }

  window._vacationsVisibilityHandler = () => {
    if (document.hidden) {
      if (vacationsPollTimer) {
        clearInterval(vacationsPollTimer);
        vacationsPollTimer = null;
      }
    } else {
      if (!vacationsPollTimer) {
        fetchVacations();
        vacationsPollTimer = setInterval(fetchVacations, interval);
      }
    }
  };
  document.addEventListener('visibilitychange', window._vacationsVisibilityHandler);

  if (!document.hidden) {
    vacationsPollTimer = setInterval(fetchVacations, interval);
  }
}

function stopVacationsPolling() {
  if (vacationsPollTimer) { clearInterval(vacationsPollTimer); vacationsPollTimer = null; }
  if (window._vacationsVisibilityHandler) {
    document.removeEventListener('visibilitychange', window._vacationsVisibilityHandler);
    window._vacationsVisibilityHandler = null;
  }
}
