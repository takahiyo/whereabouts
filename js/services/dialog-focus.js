/**
 * dialog-focus.js - 閲覧用dialogのキーボード操作。
 * 既存の表示/閉じる処理を維持し、保存・通信を行わない。
 * 依存: constants/ui.js。参照元: index.html。
 */
(() => {
  const active = [];

  /** @param {HTMLElement} element 対象 @returns {boolean} 画面内で表示されているか */
  function visible(element) {
    return element.isConnected && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  }

  /** @param {HTMLElement} dialog 対象dialog @returns {HTMLElement[]} Tab移動できる要素 */
  function focusables(dialog) {
    return [...dialog.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)]
      .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && visible(element));
  }

  /** @returns {Object|undefined} 最後に開いた表示中の閲覧dialog */
  function current() {
    for (let index = active.length - 1; index >= 0; index--) {
      if (visible(active[index].dialog)) return active[index];
    }
    return undefined;
  }

  /** @param {Object} entry dialog状態 @returns {void} 最初の操作へfocusを移す */
  function focusFirst(entry) {
    (focusables(entry.dialog)[0] || entry.dialog).focus({ preventScroll: true });
  }

  /** @returns {void} 表示属性の変更を監視する。保存確認がある編集dialogは登録しない。 */
  function init() {
    READ_ONLY_DIALOGS.forEach(({ id, closeId }) => {
      const dialog = document.getElementById(id);
      const close = document.getElementById(closeId);
      if (!dialog || !close) return;
      const entry = { dialog, close, open: false, opener: null };
      dialog.tabIndex = -1;
      const observe = () => {
        const open = visible(dialog);
        if (open === entry.open) return;
        entry.open = open;
        if (open) {
          entry.opener = document.activeElement;
          active.push(entry);
          focusFirst(entry);
        } else {
          const index = active.indexOf(entry);
          const wasTop = index === active.length - 1;
          if (index >= 0) active.splice(index, 1);
          if (!wasTop) return;
          const remaining = current();
          if (entry.opener && visible(entry.opener) && (!remaining || remaining.dialog.contains(entry.opener))) {
            entry.opener.focus({ preventScroll: true });
          } else if (remaining) focusFirst(remaining);
        }
      };
      new MutationObserver(observe).observe(dialog, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      observe();
    });

    document.addEventListener('keydown', event => {
      const entry = current();
      if (!entry || event.isComposing) return;
      // Escapeは既存の閉じるボタンを通し、その副作用と挙動を共通にする。
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        entry.close.click();
      } else if (event.key === 'Tab') {
        const elements = focusables(entry.dialog);
        const first = elements[0], last = elements.at(-1);
        const focused = document.activeElement;
        if (!first) { event.preventDefault(); focusFirst(entry); }
        else if (!entry.dialog.contains(focused) || focused === entry.dialog) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && focused === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && focused === last) { event.preventDefault(); first.focus(); }
      }
    }, true);
  }
  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
