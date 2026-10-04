/**
 * workspace-model.mjs - お知らせ/予定/ツール試作の下書きと保存単位。
 * 依存: workspace-constants。参照元: workspace-view、試験。共有APIは持たない。
 */
import { WORKSPACES, WORKSPACE_SAMPLE, TOOL_PROTOCOLS } from './workspace-constants.mjs';

/** @returns {object} 独立したメモリ内の確定/下書き */
export function createWorkspaceStore() { return { base: structuredClone(WORKSPACE_SAMPLE), draft: structuredClone(WORKSPACE_SAMPLE) }; }

/** @param {string} input 入力URL @returns {string} 許可するリンク。ホスト名だけの入力はHTTPSへ */
export function normalizeWorkspaceUrl(input) {
  const text = String(input || '').trim();
  if (!text || /\s/.test(text)) throw new Error('有効なURLを入力してください。');
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(text);
  let url;
  try { url = new URL(hasScheme ? text : `https://${text}`); } catch { throw new Error('URLの形式を確認してください。'); }
  if (!TOOL_PROTOCOLS.includes(url.protocol) || ((url.protocol === 'http:' || url.protocol === 'https:') && (!url.hostname || url.username || url.password)) || ((url.protocol === 'mailto:' || url.protocol === 'tel:') && !url.pathname)) throw new Error('http / https / mailto / tel のURLを使用してください。');
  return url.href;
}

/** @param {object} store 状態 @param {string} type 保存単位 @param {object} input 入力 @param {string} id 識別ID @returns {void} 検証してから下書きに反映 */
export function putWorkspaceItem(store, type, input, id) {
  const definition = WORKSPACES[type];
  const previous = store.draft[type].find(item => item.id === id);
  const item = { ...previous, id };
  for (const field of definition.fields) {
    item[field.key] = field.type === 'checkbox' ? Boolean(input[field.key]) : String(input[field.key] || '').trim();
    if (field.required && !item[field.key]) throw new Error(`${field.label}を入力してください。`);
  }
  if (type === 'tools') item.url = normalizeWorkspaceUrl(item.url);
  if (type === 'events') {
    for (const key of ['start', 'end']) if (!/^\d{4}-\d{2}-\d{2}$/.test(item[key]) || !Number.isFinite(Date.parse(item[key])) || new Date(item[key]).toISOString().slice(0, 10) !== item[key]) throw new Error('開始日・終了日を確認してください。');
    if (item.end < item.start) throw new Error('終了日は開始日以降にしてください。');
    if (item.noticeId && !store.draft.notices.some(notice => notice.id === item.noticeId)) throw new Error('関連お知らせを選び直してください。');
  }
  if (previous) store.draft[type][store.draft[type].indexOf(previous)] = item;
  else store.draft[type].push(item);
}

/** @param {object} store 状態 @param {string} type 対象 @param {string} id 識別ID @returns {void} 関連情報は黙って削除しない */
export function removeWorkspaceItem(store, type, id) {
  if (!store.draft[type].some(item => item.id === id)) throw new Error('対象が見つかりません。');
  if (type === 'notices' && [...store.base.events, ...store.draft.events].some(event => event.noticeId === id)) throw new Error('予定に関連しています。先に予定の関連を解除し、試作内で確定してください。');
  store.draft[type] = store.draft[type].filter(item => item.id !== id);
}

/** @param {object} store 状態 @param {string} type 対象 @param {string} id 識別ID @param {number} offset 上下 @returns {void} 同じ保存単位内で順序変更 */
export function moveWorkspaceItem(store, type, id, offset) {
  const items = store.draft[type], index = items.findIndex(item => item.id === id), target = index + offset;
  if (index < 0 || !Number.isInteger(target) || target < 0 || target >= items.length) throw new Error('移動位置を確認してください。');
  [items[index], items[target]] = [items[target], items[index]];
}

/** @param {object} store 状態 @param {string} type 保存単位 @returns {string[]} 最終状態の差分 */
export function workspaceChanges(store, type) {
  const before = store.base[type], after = store.draft[type], changes = [];
  for (const item of after) {
    const old = before.find(previous => previous.id === item.id);
    if (!old) changes.push(`追加: ${item.title}`);
    else {
      const fields = WORKSPACES[type].fields.filter(field => old[field.key] !== item[field.key]);
      if (fields.length) changes.push(`変更: ${item.title} / ${fields.map(field => field.label).join('、')}`);
    }
  }
  for (const item of before) if (!after.some(next => next.id === item.id)) changes.push(`削除: ${item.title}`);
  const common = before.filter(item => after.some(next => next.id === item.id)).map(item => item.id);
  if (JSON.stringify(common) !== JSON.stringify(after.filter(item => common.includes(item.id)).map(item => item.id))) changes.push('表示順を変更');
  return changes;
}

/** @param {object} store 状態 @param {string} type 保存単位 @returns {void} 他の保存単位を巻き込まない確定 */
export function commitWorkspace(store, type) {
  if (type === 'events' && store.draft.events.some(event => event.noticeId && !store.base.notices.some(notice => notice.id === event.noticeId))) throw new Error('新しい関連お知らせを先に試作内で確定してください。');
  store.base[type] = structuredClone(store.draft[type]);
}
