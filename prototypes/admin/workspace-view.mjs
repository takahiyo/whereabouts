/**
 * workspace-view.mjs - お知らせ/予定/ツールで共通の一覧・詳細・編集UI。
 * 依存: workspace-model/constants/view-utils。参照元: app.mjs。
 * 初期化時にUI操作を注入し、実際の保存APIを参照しない。
 */
import { WORKSPACES } from './workspace-constants.mjs';
import * as model from './workspace-model.mjs';
import { escapeHtml as escape } from './view-utils.mjs';

/** @param {object} config DOM/通知/dialogの依存 @returns {object} 領域の描画・差分・破棄・確定 */
export function createWorkspaceView({ root, announce, onChange, openDialog, closeDialog }) {
  const store = model.createWorkspaceStore();
  const views = Object.fromEntries(Object.keys(WORKSPACES).map(type => [type, { selected: null, form: null, initial: '', detail: false, search: '' }]));
  let active = 'notices', lastContent = 'notices';

  /** @returns {boolean} 現在のフォームに未反映入力があるか */
  function formDirty() { return Boolean(views[active].form && views[active].initial !== JSON.stringify(views[active].form)); }

  /** @returns {object} 現在の保存単位の名前/差分/未反映入力 */
  function summary() { return { label: WORKSPACES[active].label, changes: model.workspaceChanges(store, active), dirty: formDirty() }; }

  /** @param {string} section 主メニュー @returns {boolean} この共通UIが担当したか */
  function render(section) {
    if (!['content', 'tools'].includes(section)) return false;
    if (WORKSPACES[active].section !== section) active = section === 'tools' ? 'tools' : lastContent;
    draw(); return true;
  }

  /** @param {object} field フォーム定義 @param {object} values 入力値 @returns {string} 入力コントロール */
  function fieldMarkup(field, values) {
    const required = field.required ? 'required' : '', key = field.key, value = values[key] ?? '';
    const label = `${field.label}${field.required ? '（必須）' : ''}`;
    if (field.type === 'checkbox') return `<label class="confirm-target"><input name="${key}" type="checkbox" ${value ? 'checked' : ''}>${label}</label>`;
    if (field.type === 'textarea') return `<label><strong>${label}</strong><textarea name="${key}" rows="4">${escape(value)}</textarea></label>`;
    if (field.type === 'notice') return `<label><strong>${label}</strong><select name="${key}"><option value="">関連なし</option>${store.draft.notices.map(notice => `<option value="${escape(notice.id)}" ${notice.id === value ? 'selected' : ''}>${escape(notice.title)}${notice.visible ? '' : '（非表示）'}</option>`).join('')}</select></label><button type="button" data-manage-notices>お知らせを管理</button>`;
    return `<label><strong>${label}</strong><input name="${key}" type="${field.type || 'text'}" value="${escape(value)}" ${required}></label>`;
  }

  /** @returns {void} 入力を状態から復元し、メニュー切替でも失わない。 */
  function draw() {
    const view = views[active], definition = WORKSPACES[active];
    const item = store.draft[active].find(record => record.id === view.selected);
    const rows = store.draft[active].filter(record => `${record.title} ${record.note || record.content || ''}`.toLocaleLowerCase().includes(view.search.toLocaleLowerCase()));
    const typeButtons = definition.section === 'content' ? `<div class="toolbar" role="group" aria-label="お知らせと予定の表示切替">${['notices', 'events'].map(type => `<button data-type="${type}" aria-pressed="${active === type}">${WORKSPACES[type].label}一覧${model.workspaceChanges(store, type).length ? ' · 下書きあり' : ''}</button>`).join('')}</div><h2>関連お知らせの選択・作成</h2><p class="hint">予定の入力を保持したまま、お知らせの管理へ移動できます。確定はお知らせと予定で別々に行います。</p>` : '';
    let detail = `<h2>${definition.label}詳細</h2><p class="empty">一覧から選択して確認・編集できます。</p>`;
    if (view.form) detail = `<div class="detail-heading"><h2>${definition.label}${view.form.id ? 'を編集' : 'を追加'}</h2><button data-back>一覧へ</button></div><form data-resource-form><div class="form-fields">${definition.fields.map(field => fieldMarkup(field, view.form)).join('')}</div><p class="form-error" role="alert"></p><div class="form-actions"><button class="primary">下書きに反映</button><button type="button" data-cancel>入力を取り消す</button></div></form>`;
    else if (item) detail = `<div class="detail-heading"><h2>${escape(item.title)}</h2><button data-back>一覧へ</button></div><dl>${definition.fields.filter(field => field.key !== 'title').map(field => `<dt>${field.label}</dt><dd>${field.type === 'checkbox' ? (item[field.key] ? '表示する' : '非表示') : field.type === 'notice' ? escape(store.draft.notices.find(notice => notice.id === item[field.key])?.title || '関連なし') : escape(item[field.key] || '未登録')}</dd>`).join('')}</dl>${active === 'tools' ? `<a href="${escape(item.url)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : ''}<div class="form-actions"><button data-edit class="primary">編集</button><button data-delete class="danger">${definition.label}を削除</button></div>`;
    root.innerHTML = `${typeButtons}<div class="toolbar"><button data-add class="primary">＋ ${definition.label}を追加</button>${view.form ? '<button data-resume>入力途中の編集へ戻る</button>' : ''}</div><div class="resource-grid" data-detail="${view.detail}"><section class="resource-list members"><h2>${definition.label}一覧 · ${rows.length}件</h2><label class="search-row">検索<input type="search" data-resource-search value="${escape(view.search)}" placeholder="タイトル・本文/備考"></label><div>${rows.map(record => `<div class="resource-row"><button data-item="${escape(record.id)}" class="member-info"><b>${escape(record.title)}</b><small>${active === 'events' ? `${escape(record.start)}〜${escape(record.end)}` : active === 'notices' ? (record.visible ? '表示する' : '非表示') : escape(record.url)}</small></button>${!view.search ? `<div class="row-order"><button data-order="${escape(record.id)}" data-offset="-1" ${store.draft[active].indexOf(record) === 0 ? 'disabled' : ''} aria-label="${escape(record.title)}を上へ">↑</button><button data-order="${escape(record.id)}" data-offset="1" ${store.draft[active].indexOf(record) === store.draft[active].length - 1 ? 'disabled' : ''} aria-label="${escape(record.title)}を下へ">↓</button></div>` : ''}</div>`).join('') || '<p class="empty">該当する項目がありません。</p>'}</div></section><section class="resource-detail detail">${detail}</section></div>`;
    onChange();
  }

  /** @param {string} [id] 対象 @returns {void} 新規/既存を編集 */
  function edit(id) {
    const view = views[active];
    if (view.form && formDirty() && (view.form.id || undefined) !== id && !confirm('未反映の入力を取り消して別の編集を始めますか？')) return;
    if (!view.form || (view.form.id || undefined) !== id) {
      const item = store.draft[active].find(record => record.id === id);
      view.form = item ? structuredClone(item) : { id: '', ...Object.fromEntries(WORKSPACES[active].fields.map(field => [field.key, field.type === 'checkbox' ? true : ''])) };
      view.initial = JSON.stringify(view.form);
    }
    view.detail = true; draw(); root.querySelector('input[name="title"]').focus();
  }

  /** @returns {void} 領域内だけの差分確認とメモリ内確定。 */
  function review() {
    if (formDirty()) { announce('入力中の内容を下書きに反映するか、取り消してください。', true); views[active].detail = true; draw(); root.querySelector('input[name="title"]').focus(); return; }
    const type = active, { label, changes } = summary();
    openDialog(`${label}の変更を確認`, `<p>この${label}だけを試作内で確定します。実際の公開・保存は行いません。</p><ul class="change-list">${changes.map(item => `<li>${escape(item)}</li>`).join('')}</ul><div class="dialog-actions"><button data-close>キャンセル</button><button id="confirm-resource" class="primary">${label}を試作内で確定</button></div>`);
    document.getElementById('confirm-resource').addEventListener('click', () => {
      try { model.commitWorkspace(store, type); closeDialog(); draw(); announce(`${label}を試作内で確定しました。実データは変更していません。`); }
      catch (error) { announce(error.message, true); closeDialog(); }
    });
  }

  /** @returns {void} 現在の保存単位だけを破棄 */
  function discard() {
    if (!confirm(`${WORKSPACES[active].label}の下書きと入力を破棄しますか？`)) return;
    store.draft[active] = structuredClone(store.base[active]); views[active].form = null; draw(); announce('この領域の変更を破棄しました。');
  }

  root.addEventListener('input', event => {
    const view = views[active], input = event.target;
    if (input.matches('[data-resource-search]')) { view.search = input.value; const focus = input.selectionStart; draw(); const search = root.querySelector('[data-resource-search]'); search.focus(); search.setSelectionRange(focus, focus); }
    else if (view.form && input.name) { view.form[input.name] = input.type === 'checkbox' ? input.checked : input.value; onChange(); }
  });
  root.addEventListener('submit', event => {
    if (!event.target.matches('[data-resource-form]')) return;
    event.preventDefault();
    const view = views[active];
    try { const id = view.form.id || crypto.randomUUID(); model.putWorkspaceItem(store, active, view.form, id); view.form = null; view.selected = id; draw(); announce(`${WORKSPACES[active].label}を下書きに反映しました。`); root.querySelector('[data-back]').focus(); }
    catch (error) { root.querySelector('.form-error').textContent = error.message; }
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    const view = views[active];
    if (button.dataset.type || button.hasAttribute('data-manage-notices')) { active = button.dataset.type || 'notices'; lastContent = active; draw(); }
    else if (button.hasAttribute('data-add')) edit();
    else if (button.hasAttribute('data-edit')) edit(view.selected);
    else if (button.hasAttribute('data-resume')) { view.detail = true; draw(); root.querySelector('input[name="title"]').focus(); }
    else if (button.hasAttribute('data-back')) { view.detail = false; draw(); root.querySelector('[data-resource-search]').focus(); }
    else if (button.hasAttribute('data-cancel')) { if (!formDirty() || confirm('未反映の入力を取り消しますか？')) { view.form = null; draw(); } }
    else if (button.dataset.item) {
      if (formDirty() && view.form.id !== button.dataset.item && !confirm('未反映の入力を取り消しますか？')) return;
      if (view.form?.id !== button.dataset.item) view.form = null;
      view.selected = button.dataset.item; view.detail = true; draw(); root.querySelector('[data-back]').focus();
    } else if (button.dataset.order) {
      try { model.moveWorkspaceItem(store, active, button.dataset.order, Number(button.dataset.offset)); draw(); root.querySelector(`[data-item="${CSS.escape(button.dataset.order)}"]`).focus(); } catch (error) { announce(error.message, true); }
    } else if (button.hasAttribute('data-delete')) {
      const item = store.draft[active].find(record => record.id === view.selected);
      if (!confirm(`「${item.title}」を${WORKSPACES[active].label}の下書きから削除しますか？`)) return;
      try { model.removeWorkspaceItem(store, active, item.id); view.selected = null; view.detail = false; draw(); announce('下書きから削除しました。'); } catch (error) { announce(error.message, true); }
    }
  });
  return { render, summary, review, discard, hasPending: () => Object.keys(WORKSPACES).some(type => model.workspaceChanges(store, type).length || (views[type].form && views[type].initial !== JSON.stringify(views[type].form))) };
}
