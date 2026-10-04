/** 試作の安全なHTML表示。参照元: app.mjs、csv-dialog.mjs。通信・DOM初期化なし。 */

/** @param {unknown} value 表示値 @returns {string} HTMLの文字と属性に安全な表現 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
