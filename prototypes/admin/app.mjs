/**
 * app.mjs - 統合名簿GUI試作の描画・操作。依存: constants/model。
 * 参照元: prototypes/admin/index.html。確定もメモリ内だけで、通信/認証/保存APIを持たない。
 */
import { SECTIONS, UI, MEMBER_FIELDS, SAMPLE_SCENARIOS } from './constants.mjs';
import * as model from './model.mjs';
import { createSample } from './samples.mjs';
import { openCsvDialog } from './csv-dialog.mjs';
import { escapeHtml as escape } from './view-utils.mjs';
import { createWorkspaceView } from './workspace-view.mjs';

const el = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
let base = createSample('standard'), draft = model.copyRoster(base);
const view = { section: UI.section, group: UI.all, search: '', selected: new Set(), member: null, form: null, detailVisible: false, order: UI.order.none };
let dialogOpener = null;
const resources = createWorkspaceView({ root: el['section-preview'], announce, onChange: renderSummary, openDialog: showDialog, closeDialog });

/** @param {string} message 結果 @param {boolean} error エラーか @returns {void} */
function announce(message, error = false) { el.status.textContent = message; el.status.dataset.error = String(error); }

/** @param {Function} operation 下書き変更 @returns {boolean} 反映成功か */
function change(operation) {
  try {
    // 失敗した操作が途中までdraftを書き換えないようコピーして反映する。
    const next = model.copyRoster(draft);
    operation(next);
    draft = next;
    render();
    announce('下書きに反映しました。試作内での確定はまだ行っていません。');
    return true;
  } catch (error) { announce(error.message, true); return false; }
}

/** @param {string} [exclude] 除外グループ @returns {string} 所属選択肢 */
function groupOptions(exclude) {
  return draft.groups.filter(group => group.id !== exclude).map(group => `<option value="${escape(group.id)}">${escape(group.name)}</option>`).join('');
}

/** @param {string} id 所属 @returns {string} 表示名 */
function groupName(id) { return draft.groups.find(group => group.id === id)?.name || ''; }

/** @returns {object[]} 表示中の人員 */
function visibleMembers() {
  const words = view.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return model.orderedMembers(draft).filter(member => (!view.group || member.group === view.group) && words.every(word => `${member.name} ${groupName(member.group)} ${member.ext}`.toLocaleLowerCase().includes(word)));
}

/** @returns {void} 主ナビと領域を更新する。名簿の下書き/入力は領域切替でも保持。 */
function render() {
  const section = SECTIONS.find(item => item.id === view.section);
  el.navigation.innerHTML = SECTIONS.map(item => `<button data-section="${item.id}"${item.id === view.section ? ' aria-current="page"' : ''}>${item.label}</button>`).join('');
  el.menu.textContent = `管理メニュー · ${section.label}`;
  el['section-title'].textContent = section.label;
  el['section-description'].textContent = section.description;
  el.people.hidden = view.section !== UI.section;
  el['section-preview'].hidden = view.section === UI.section;
  if (section.items && !resources.render(view.section)) el['section-preview'].innerHTML = `<p class="hint">この領域は配置案のプレビューです。編集機能は後続段階で接続します。</p><div class="preview-grid">${section.items.map(item => `<article class="preview-card"><h2>${escape(item)}</h2><p>この場所から操作する計画です。</p></article>`).join('')}</div>`;
  renderGroups(); renderMembers(); renderDetail(); renderSummary();
}

/** @returns {void} 人数付きグループと明示的な操作を更新。 */
function renderGroups() {
  const items = [{ id: UI.all, name: '全メンバー' }, ...draft.groups];
  el['group-list'].innerHTML = items.map(group => {
    const count = draft.members.filter(member => !group.id || member.group === group.id).length;
    return `<button data-group="${escape(group.id)}" aria-current="${group.id === view.group}"><span>${escape(group.name)}</span><small>${count || !group.id ? `${count}名` : '下書き'}</small></button>`;
  }).join('');
}

/** @returns {void} 検索結果と実際の所属内順番を表示する。 */
function renderMembers() {
  const members = visibleMembers();
  el['list-title'].textContent = view.group ? groupName(view.group) : '全メンバー';
  el['result-count'].textContent = `${members.length} / ${draft.members.filter(member => !view.group || member.group === view.group).length}名`;
  el['member-order'].textContent = view.order === UI.order.members ? '並び替えを終了' : '並び替え';
  el['order-hint'].hidden = view.order !== UI.order.members;
  el['move-selected'].disabled = !view.selected.size;
  el['move-selected'].textContent = view.selected.size ? `選択した${view.selected.size}名の所属を変更` : '選択した人の所属を変更';
  el['member-list'].innerHTML = members.length ? members.map(member => {
    const peers = draft.members.filter(item => item.group === member.group);
    const position = peers.findIndex(item => item.id === member.id);
    // 全行に人数分の選択肢を作ると大規模名簿でDOMが二乗に増えるため、番号指定にする。
    const order = view.order === UI.order.members ? `<div class="row-order"><button data-move="${escape(member.id)}" data-offset="-1" ${position === 0 ? 'disabled' : ''} aria-label="${escape(member.name)}を上へ">↑</button><button data-move="${escape(member.id)}" data-offset="1" ${position === peers.length - 1 ? 'disabled' : ''} aria-label="${escape(member.name)}を下へ">↓</button><label>位置 <input type="number" min="1" max="${peers.length}" value="${position + 1}" data-position="${escape(member.id)}" aria-label="${escape(member.name)}の移動位置"></label></div>` : '';
    return `<div class="member-row"><label class="check-target"><input type="checkbox" data-select="${escape(member.id)}" aria-label="${escape(member.name)}を選択" ${view.selected.has(member.id) ? 'checked' : ''}></label><button class="member-info" data-member="${escape(member.id)}" aria-current="${view.member === member.id}"><b>${escape(member.name)}</b><small>${escape(groupName(member.group))} · 内線 ${escape(member.ext || '未登録')} · 順序 ${position + 1}/${peers.length}</small></button>${order}</div>`;
  }).join('') : '<p class="empty">該当するメンバーがいません。検索条件を解除するか、メンバーを追加してください。</p>';
  if (view.group) el['member-list'].insertAdjacentHTML('beforeend', '<div class="list-actions"><button data-group-action="rename">グループ名を変更</button><button data-group-action="delete" class="danger">グループを削除</button></div>');
}

/** @returns {void} 詳細/入力を描画。再描画でも入力値をview.formから復元する。 */
function renderDetail() {
  renderSummary();
  const member = draft.members.find(item => item.id === view.member);
  el.people.querySelector('.roster').dataset.detail = String(view.detailVisible && Boolean(view.form || member));
  if (view.form) {
    el['detail-body'].innerHTML = `<div class="detail-heading"><h2>${view.form.id ? 'メンバーを編集' : 'メンバーを追加'}</h2><button data-back>一覧へ</button></div><form id="member-form"><div class="form-fields">${MEMBER_FIELDS.map(field => `<label><strong>${field.label}${field.required ? '（必須）' : ''}</strong><input name="${field.key}" type="${field.type}" ${field.required ? 'required' : ''} value="${escape(view.form[field.key])}"></label>`).join('')}<label><strong>所属グループ（必須）</strong><select name="group" required><option value="">所属を選択</option>${groupOptions()}</select></label></div><p class="hint">所属変更時は移動先の末尾に追加されます。</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="primary" type="submit">下書きに反映</button><button type="button" data-cancel>入力を取り消す</button></div></form>`;
    el['detail-body'].querySelector('[name="group"]').value = view.form.group;
    return;
  }
  if (!member) { el['detail-body'].innerHTML = '<h2>メンバー詳細</h2><p class="empty">一覧からメンバーを選ぶと詳細を確認できます。</p>'; return; }
  el['detail-body'].innerHTML = `<div class="detail-heading"><h2>${escape(member.name)}</h2><button data-back>一覧へ</button></div><span class="pill">${escape(groupName(member.group))}</span><dl>${MEMBER_FIELDS.filter(field => field.key !== 'name').map(field => `<dt>${field.label}</dt><dd>${escape(member[field.key] || '未登録')}</dd>`).join('')}</dl><div class="form-actions"><button data-edit class="primary">編集・所属を変更</button><button data-delete-member class="danger">メンバーを削除</button></div>`;
}

/** @returns {void} 現在の保存単位の差分と未反映入力を表示する。 */
function renderSummary() {
  const resource = ['content', 'tools'].includes(view.section);
  el['save-bar'].hidden = view.section !== UI.section && !resource;
  if (resource) {
    const state = resources.summary();
    el['draft-summary'].textContent = state.changes.length ? `${state.label}の未確定変更 · ${state.changes.length}件${state.dirty ? ' · 未反映の入力あり' : ''}` : state.dirty ? `${state.label}の入力はまだ下書きに反映されていません` : `${state.label}の未確定変更はありません`;
    el['draft-hint'].textContent = `この${state.label}だけが確定対象です。実際の公開・保存は行いません。`;
    el.review.disabled = el.discard.disabled = !state.changes.length && !state.dirty;
    el.commit.disabled = !state.changes.length;
    return;
  }
  el['draft-hint'].textContent = '実際の名簿には接続していません。';
  const changes = model.diffRoster(base, draft);
  el['draft-summary'].textContent = changes.length ? `名簿の未確定変更 · ${changes.length}件${formDirty() ? ' · 未反映の入力あり' : ''}` : formDirty() ? '入力中の内容はまだ下書きに反映されていません' : '名簿の未確定変更はありません';
  el.review.disabled = el.discard.disabled = !changes.length && !formDirty();
  el.commit.disabled = !changes.length;
  el['resume-edit'].hidden = !view.form;
  el['resume-edit'].textContent = view.form?.id ? `入力途中: ${view.form.name || 'メンバー編集'}へ戻る` : '入力途中のメンバー追加へ戻る';
}

/** @param {string} title タイトル @param {string} body 安全なHTML @returns {void} native dialogでfocus/Tabを管理 */
function showDialog(title, body) {
  dialogOpener = document.activeElement;
  el['dialog-body'].innerHTML = `<h2 id="dialog-title">${escape(title)}</h2>${body}`;
  el['action-dialog'].showModal();
}

/** @returns {void} ダイアログを閉じ、再描画で消えた入口でも代替へ戻す。 */
function closeDialog() {
  el['action-dialog'].close();
}

/** @returns {string} 共通の取消ボタン */
function cancelButton() { return '<button type="button" data-close>キャンセル</button>'; }

/** @param {string} id メンバーID @returns {void} フォームを開き最初の入力へfocus。 */
function openEditor(id) {
  if (view.form && (view.form.id || undefined) === id) {
    view.detailVisible = true; renderDetail(); el['detail-body'].querySelector('input').focus(); return;
  }
  if (!leaveForm()) return;
  const member = draft.members.find(item => item.id === id);
  view.member = id || null;
  view.form = member ? { ...member } : { id: '', group: view.group, name: '', ext: '', mobile: '', email: '' };
  view.detailVisible = true;
  view.form.initial = JSON.stringify(MEMBER_FIELDS.map(({ key }) => view.form[key] || '').concat(view.form.group));
  renderDetail();
  el['detail-body'].querySelector('input').focus();
}

/** @returns {boolean} 入力を捨てる操作だけ確認する。領域/幅の変更ではフォームを維持。 */
function leaveForm() {
  if (view.form && formDirty() && !confirm('下書きに反映していない入力があります。入力を取り消しますか？')) return false;
  view.form = null;
  return true;
}

/** @returns {boolean} 未反映の入力があるか */
function formDirty() { return Boolean(view.form && view.form.initial !== JSON.stringify(MEMBER_FIELDS.map(({ key }) => view.form[key] || '').concat(view.form.group))); }

/** @returns {void} 全件表示へ戻してから所属内の順番だけを変更。 */
function toggleMemberOrder() {
  if (!view.group) { announce('並び替えるグループを選択してください。', true); return; }
  if (view.order === UI.order.members) view.order = UI.order.none;
  else {
    if (view.search && !confirm('検索を解除し、選択グループの全員を表示して並び替えますか？')) return;
    view.search = ''; el.search.value = ''; view.selected.clear(); view.order = UI.order.members;
  }
  renderMembers();
}

/** @returns {void} 選択人員と移動先を確認して下書きへ。 */
function showMove() {
  const members = model.orderedMembers(draft).filter(member => view.selected.has(member.id));
  if (!members.length) return;
  showDialog(`${members.length}名の所属を変更`, `<p>${members.map(member => escape(member.name)).join('、')}</p><p class="hint">移動先の末尾に、現在の表示順で追加します。同じ所属の人は移動しません。</p><form data-dialog-form="move"><label>移動先<select name="target" required><option value="">選択してください</option>${groupOptions()}</select></label><div class="dialog-actions">${cancelButton()}<button class="primary">下書きに反映</button></div></form>`);
}

/** @param {string} action グループ操作 @returns {void} 人員を削除しないグループ管理。 */
function showGroupAction(action) {
  const group = model.requireGroup(draft, view.group);
  if (action === 'rename') showDialog('グループ名を変更', `<form data-dialog-form="rename"><label>名称<input name="name" required value="${escape(group.name)}"></label><p class="hint">所属メンバーの情報は保持されます。</p><div class="dialog-actions">${cancelButton()}<button class="primary">下書きに反映</button></div></form>`);
  else {
    const count = draft.members.filter(member => member.group === group.id).length;
    showDialog('グループを削除', `<p>「${escape(group.name)}」の所属メンバーは${count}名です。メンバーは削除しません。</p><form data-dialog-form="delete-group">${count ? `<label>全員の移動先<select name="target" required><option value="">移動先を選択</option>${groupOptions(group.id)}</select></label>` : ''}<div class="dialog-actions">${cancelButton()}<button class="danger">移動してグループを削除</button></div></form>`);
  }
}

/** @returns {void} グループ順を上下/位置指定で変更する。 */
function showGroupOrder() {
  const rows = draft.groups.map((group, index) => `<div class="group-order-row"><strong>${escape(group.name)}</strong><button data-group-move="${escape(group.id)}" data-offset="-1" ${index === 0 ? 'disabled' : ''} aria-label="${escape(group.name)}を上へ">↑</button><button data-group-move="${escape(group.id)}" data-offset="1" ${index === draft.groups.length - 1 ? 'disabled' : ''} aria-label="${escape(group.name)}を下へ">↓</button><label>位置 <input type="number" min="1" max="${draft.groups.length}" value="${index + 1}" data-group-position="${escape(group.id)}" aria-label="${escape(group.name)}の位置"></label></div>`).join('');
  const body = `<p>グループ内のメンバー順や所属は変わりません。</p>${rows}<div class="dialog-actions"><button data-close>完了</button></div>`;
  if (el['action-dialog'].open) el['dialog-body'].innerHTML = `<h2 id="dialog-title">グループ順を変更</h2>${body}`;
  else showDialog('グループ順を変更', body);
}

/** @returns {void} 最終差分を表示して、架空名簿だけをメモリ内で確定する。 */
function review() {
  if (['content', 'tools'].includes(view.section)) { resources.review(); return; }
  if (formDirty()) { announce('入力中の内容を「下書きに反映」するか、取り消してから変更を確認してください。', true); view.detailVisible = true; view.section = UI.section; render(); el['detail-body'].querySelector('input')?.focus(); return; }
  const changes = model.diffRoster(base, draft);
  showDialog('名簿の変更を確認', `<p>変更${changes.length}件。確定はこの画面内だけで行います。再読込みするとサンプルへ戻ります。</p><ul class="change-list">${changes.map(item => `<li>${escape(item)}</li>`).join('')}</ul><div class="dialog-actions">${cancelButton()}<button data-confirm-commit class="primary">試作内で確定</button></div>`);
}

// 固定DOMの入口と、動的な一覧/詳細の操作を分離。既存アプリのlistenerには触れない。
el.menu.addEventListener('click', () => {
  const open = el.menu.getAttribute('aria-expanded') !== 'true';
  el.menu.setAttribute('aria-expanded', String(open)); el.menu.closest('aside').dataset.open = String(open);
});
el.navigation.addEventListener('click', event => {
  const button = event.target.closest('[data-section]'); if (!button) return;
  view.section = button.dataset.section; render();
  el.menu.setAttribute('aria-expanded', 'false'); el.menu.closest('aside').dataset.open = 'false';
  el.workspace.focus();
});
el.search.addEventListener('input', () => { view.search = el.search.value; view.selected.clear(); view.order = UI.order.none; renderMembers(); });
el['clear-search'].addEventListener('click', () => { view.search = ''; el.search.value = ''; view.selected.clear(); renderMembers(); el.search.focus(); });
el['group-list'].addEventListener('click', event => {
  const button = event.target.closest('[data-group]'); if (!button) return;
  view.group = button.dataset.group; view.selected.clear(); view.order = UI.order.none; renderGroups(); renderMembers(); el['group-list'].querySelector(`[data-group="${view.group}"]`).focus();
});
el['add-member'].addEventListener('click', () => openEditor());
el['resume-edit'].addEventListener('click', () => { view.section = UI.section; view.detailVisible = true; render(); el['detail-body'].querySelector('input').focus(); });
el.csv.addEventListener('click', () => {
  if (formDirty()) { announce('入力途中の内容を下書きに反映するか、取り消してからCSVを操作してください。', true); el['resume-edit'].focus(); return; }
  openCsvDialog({ service: window.CsvService, openDialog: showDialog, closeDialog, getDraft: () => draft, announce, apply: candidate => {
    draft = model.copyRoster(candidate); view.form = null; view.member = null; view.detailVisible = false;
    view.group = UI.all; view.search = ''; el.search.value = ''; view.selected.clear(); view.order = UI.order.none; render();
  } });
});
el['sample-scenario'].innerHTML = SAMPLE_SCENARIOS.map(item => `<option value="${item.id}">${item.label}</option>`).join('');
el['load-sample'].addEventListener('click', () => {
  if ((model.diffRoster(base, draft).length || formDirty()) && !confirm('下書きと入力を破棄して、選択したサンプルに切り替えますか？')) return;
  base = createSample(el['sample-scenario'].value); draft = model.copyRoster(base);
  view.form = null; view.member = null; view.detailVisible = false; view.group = UI.all; view.search = ''; el.search.value = ''; view.selected.clear(); view.order = UI.order.none;
  render(); announce('確認用サンプルを切り替えました。実際の名簿は変更していません。');
});
el['add-group'].addEventListener('click', () => showDialog('グループを追加', `<form data-dialog-form="add-group"><label>グループ名<input name="name" required></label><p class="hint">最初のメンバーを追加・移動してから確定してください。</p><div class="dialog-actions">${cancelButton()}<button class="primary">下書きに追加</button></div></form>`));
el['member-order'].addEventListener('click', toggleMemberOrder);
el['group-order'].addEventListener('click', showGroupOrder);
el['move-selected'].addEventListener('click', showMove);
el['member-list'].addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.member) {
    if (view.form?.id === button.dataset.member) { view.detailVisible = true; renderDetail(); el['detail-body'].querySelector('input').focus(); return; }
    if (!leaveForm()) return; view.member = button.dataset.member; view.detailVisible = true; renderMembers(); renderDetail(); el['detail-body'].querySelector('[data-back]').focus();
  } else if (button.dataset.move) {
    const id = button.dataset.move, peers = draft.members.filter(member => member.group === view.group);
    if (change(next => model.reorderMember(next, id, peers.findIndex(member => member.id === id) + Number(button.dataset.offset)))) {
      (el['member-list'].querySelector(`[data-move="${CSS.escape(id)}"][data-offset="${button.dataset.offset}"]:not(:disabled)`) || el['member-list'].querySelector(`[data-position="${CSS.escape(id)}"]`)).focus();
    }
  } else if (button.dataset.groupAction) showGroupAction(button.dataset.groupAction);
});
el['member-list'].addEventListener('change', event => {
  const input = event.target;
  if (input.dataset.select) { if (input.checked) view.selected.add(input.dataset.select); else view.selected.delete(input.dataset.select); el['move-selected'].disabled = !view.selected.size; el['move-selected'].textContent = `選択した${view.selected.size}名の所属を変更`; }
  if (input.dataset.position) { change(next => model.reorderMember(next, input.dataset.position, Number(input.value) - 1)); el['member-list'].querySelector(`[data-position="${CSS.escape(input.dataset.position)}"]`)?.focus(); }
});
el['detail-body'].addEventListener('input', event => { if (view.form && event.target.name) { view.form[event.target.name] = event.target.value; renderSummary(); } });
el['detail-body'].addEventListener('submit', event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  const id = view.form.id || crypto.randomUUID();
  // 入力エラー時はフォームを描き直さず、入力欄の近くで理由を伝える。
  try { const next = model.copyRoster(draft); model.putMember(next, values, id); draft = next; view.form = null; view.member = id; render(); announce('メンバーを下書きに反映しました。'); el['detail-body'].querySelector('[data-back]').focus(); }
  catch (error) { el['detail-body'].querySelector('.form-error').textContent = error.message; }
});
el['detail-body'].addEventListener('click', event => {
  if (event.target.closest('[data-edit]')) openEditor(view.member);
  if (event.target.closest('[data-back]')) {
    // 狭い画面から戻っても未反映入力は保持し、追加/同じ人の編集から再開できる。
    view.detailVisible = false; renderDetail(); el.search.focus();
  }
  if (event.target.closest('[data-cancel]') && leaveForm()) { renderDetail(); el['add-member'].focus(); }
  if (event.target.closest('[data-delete-member]')) {
    const member = draft.members.find(item => item.id === view.member);
    showDialog('メンバーを削除', `<p>「${escape(member.name)}」（${escape(groupName(member.group))}）を名簿の下書きから削除します。実データや予定は変更しません。</p><form data-dialog-form="delete-member"><div class="dialog-actions">${cancelButton()}<button class="danger">下書きから削除</button></div></form>`);
  }
});
el.review.addEventListener('click', review); el.commit.addEventListener('click', review);
el.discard.addEventListener('click', () => {
  if (['content', 'tools'].includes(view.section)) { resources.discard(); return; }
  if (!confirm('名簿の下書きと入力中の変更を破棄しますか？')) return;
  draft = model.copyRoster(base); view.form = null; view.member = null; view.group = UI.all; view.selected.clear(); view.order = UI.order.none; render(); announce('変更を破棄しました。');
});
el['action-dialog'].addEventListener('close', () => {
  if (dialogOpener?.isConnected && !dialogOpener.disabled && dialogOpener.getClientRects().length) dialogOpener.focus();
  else if (!el.people.hidden) el['add-member'].focus();
  else (el['section-preview'].querySelector('button') || el.menu).focus();
});
el['action-dialog'].addEventListener('click', event => {
  if (event.target.closest('[data-close]')) closeDialog();
  if (event.target.closest('[data-confirm-commit]')) {
    try { model.validateCommit(draft); base = model.copyRoster(draft); closeDialog(); renderSummary(); announce('試作内で確定しました。実際の名簿への保存は行っていません。'); }
    catch (error) { closeDialog(); announce(error.message, true); }
  }
  const button = event.target.closest('[data-group-move]');
  if (button) {
    const id = button.dataset.groupMove, position = draft.groups.findIndex(group => group.id === id) + Number(button.dataset.offset);
    if (change(next => model.reorderGroup(next, id, position))) { showGroupOrder(); el['action-dialog'].querySelector(`[data-group-position="${id}"]`).focus(); }
  }
});
el['action-dialog'].addEventListener('change', event => {
  const input = event.target;
  if (input.dataset.groupPosition && change(next => model.reorderGroup(next, input.dataset.groupPosition, Number(input.value) - 1))) { showGroupOrder(); el['action-dialog'].querySelector(`[data-group-position="${input.dataset.groupPosition}"]`).focus(); }
});
el['action-dialog'].addEventListener('submit', event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  const action = event.target.dataset.dialogForm;
  const succeeded = change(next => {
    if (action === 'add-group') { const id = crypto.randomUUID(); model.addGroup(next, values.name, id); view.group = id; }
    if (action === 'rename') model.renameGroup(next, view.group, values.name);
    if (action === 'delete-group') { model.removeGroup(next, view.group, values.target); view.group = values.target || UI.all; view.selected.clear(); }
    if (action === 'move') { model.moveMembers(next, [...view.selected], values.target); view.selected.clear(); }
    if (action === 'delete-member') { model.removeMember(next, view.member); view.member = null; view.selected.clear(); }
  });
  if (succeeded) closeDialog();
  else {
    let error = event.target.querySelector('.form-error');
    if (!error) { error = document.createElement('p'); error.className = 'form-error'; error.setAttribute('role', 'alert'); event.target.append(error); }
    error.textContent = el.status.textContent;
  }
});
window.addEventListener('beforeunload', event => {
  if (model.diffRoster(base, draft).length || formDirty() || resources.hasPending()) { event.preventDefault(); event.returnValue = ''; }
});
render();
