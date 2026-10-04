/**
 * model.mjs - 名簿試作のメモリ内編集と差分。
 * 依存: constants.mjs。参照元: app.mjs、tests/admin-prototype.test.mjs。
 * 通信・永続化を持たず、在席/予定など編集対象外の値は保持する。
 */
import { MEMBER_FIELDS, VALIDATION } from './constants.mjs';

/** @param {object} seed 架空名簿 @returns {object} 独立した名簿コピー */
export function copyRoster(seed) { return structuredClone(seed); }

/** @param {object} roster 名簿 @param {string} id グループID @returns {object} 存在する所属 */
export function requireGroup(roster, id) {
  const group = roster.groups.find(item => item.id === id);
  if (!group) throw new Error('所属グループを選択してください。');
  return group;
}

/** @param {object} roster 名簿 @param {object} values 入力 @param {string} id 新規/既存ID @returns {object} 編集メンバー */
export function putMember(roster, values, id) {
  requireGroup(roster, values.group);
  const fields = Object.fromEntries(MEMBER_FIELDS.map(({ key }) => [key, String(values[key] || '').trim()]));
  if (!fields.name) throw new Error('氏名を入力してください。');
  if (fields.ext && !VALIDATION.extension.test(fields.ext)) throw new Error('内線は6桁以内の数字で入力してください。');
  if (fields.mobile && !VALIDATION.mobile.test(fields.mobile.replace(/[\s()+-]/g, ''))) throw new Error('携帯は10〜11桁の番号で入力してください。');
  if (fields.email && !VALIDATION.email.test(fields.email)) throw new Error('メールの形式を確認してください。');
  const existing = roster.members.find(member => member.id === id);
  const member = { ...existing, ...fields, id, group: values.group };
  if (existing?.group === member.group) roster.members[roster.members.indexOf(existing)] = member;
  else {
    roster.members = roster.members.filter(item => item.id !== id);
    roster.members.push(member);
  }
  return member;
}

/** @param {object} roster 名簿 @param {string} name 名称 @param {string} id 新規ID @returns {void} */
export function addGroup(roster, name, id) {
  const clean = validateGroupName(roster, name);
  roster.groups.push({ id, name: clean });
}

/** @param {object} roster 名簿 @param {string} name 名称 @param {string} [except] 同じグループ @returns {string} 検証済名称 */
function validateGroupName(roster, name, except) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('グループ名を入力してください。');
  if (roster.groups.some(group => group.id !== except && group.name === clean)) throw new Error('同じグループ名が存在します。');
  return clean;
}

/** @param {object} roster 名簿 @param {string} id 対象 @param {string} name 新名称 @returns {void} */
export function renameGroup(roster, id, name) {
  const group = requireGroup(roster, id);
  group.name = validateGroupName(roster, name, id);
}

/** @param {object} roster 名簿 @param {string[]} ids 選択ID @param {string} target 移動先 @returns {void} */
export function moveMembers(roster, ids, target) {
  requireGroup(roster, target);
  if (!ids.length || ids.some(id => !roster.members.some(member => member.id === id))) throw new Error('移動するメンバーを選択してください。');
  // 選択順ではなく元の表示順を保持し、移動先の既存メンバーを追い越さない。
  const moving = orderedMembers(roster).filter(member => ids.includes(member.id) && member.group !== target);
  roster.members = roster.members.filter(member => !moving.includes(member));
  moving.forEach(member => { member.group = target; });
  roster.members.push(...moving);
}

/** @param {object} roster 名簿 @param {string} id 削除グループ @param {string} target 所属先 @returns {void} */
export function removeGroup(roster, id, target) {
  requireGroup(roster, id);
  if (roster.groups.length === 1) throw new Error('最後のグループは削除できません。');
  const ids = roster.members.filter(member => member.group === id).map(member => member.id);
  if (ids.length) {
    if (target === id) throw new Error('別の移動先グループを選択してください。');
    moveMembers(roster, ids, target);
  }
  roster.groups = roster.groups.filter(group => group.id !== id);
}

/** @param {object} roster 名簿 @param {string} id 対象人員 @returns {void} */
export function removeMember(roster, id) {
  if (!roster.members.some(member => member.id === id)) throw new Error('メンバーが見つかりません。');
  if (roster.members.length === 1) throw new Error('全員を削除する操作は試作対象外です。');
  roster.members = roster.members.filter(member => member.id !== id);
}

/** @param {object} roster 名簿 @returns {object[]} グループ表示順の人員 */
export function orderedMembers(roster) {
  return roster.groups.flatMap(group => roster.members.filter(member => member.group === group.id));
}

/** @param {object[]} items 対象配列 @param {string} id 対象 @param {number} position 0始まり位置 @returns {void} */
function reorder(items, id, position) {
  const from = items.findIndex(item => item.id === id);
  if (from < 0 || !Number.isInteger(position) || position < 0 || position >= items.length) throw new Error('移動位置を確認してください。');
  const [item] = items.splice(from, 1);
  items.splice(position, 0, item);
}

/** @param {object} roster 名簿 @param {string} id 対象 @param {number} position 0始まり位置 @returns {void} */
export function reorderGroup(roster, id, position) { reorder(roster.groups, id, position); }

/** @param {object} roster 名簿 @param {string} id 対象 @param {number} position グループ内位置 @returns {void} */
export function reorderMember(roster, id, position) {
  const member = roster.members.find(item => item.id === id);
  if (!member) throw new Error('メンバーが見つかりません。');
  const peers = roster.members.filter(item => item.group === member.group);
  reorder(peers, id, position);
  let index = 0;
  roster.members = roster.members.map(item => item.group === member.group ? peers[index++] : item);
}

/** @param {object} base 確定時 @param {object} draft 編集中 @returns {string[]} 最終状態の差分（往復した変更は除外） */
export function diffRoster(base, draft) {
  const changes = [];
  const groupName = (roster, id) => roster.groups.find(group => group.id === id)?.name || '';
  for (const group of draft.groups) {
    const previous = base.groups.find(item => item.id === group.id);
    if (!previous) changes.push(`グループ追加: ${group.name}`);
    else if (previous.name !== group.name) changes.push(`名称変更: ${previous.name} → ${group.name}`);
  }
  for (const group of base.groups) if (!draft.groups.some(item => item.id === group.id)) changes.push(`グループ削除: ${group.name}`);
  const common = base.groups.filter(group => draft.groups.some(item => item.id === group.id)).map(group => group.id);
  if (common.join() !== draft.groups.filter(group => common.includes(group.id)).map(group => group.id).join()) changes.push('グループの表示順を変更');
  for (const member of draft.members) {
    const previous = base.members.find(item => item.id === member.id);
    if (!previous) changes.push(`メンバー追加: ${member.name}（${groupName(draft, member.group)}）`);
    else {
      if (previous.group !== member.group) changes.push(`所属変更: ${member.name} / ${groupName(base, previous.group)} → ${groupName(draft, member.group)}`);
      if (MEMBER_FIELDS.some(({ key }) => (previous[key] || '') !== (member[key] || ''))) changes.push(`メンバー編集: ${previous.name}`);
    }
  }
  for (const member of base.members) if (!draft.members.some(item => item.id === member.id)) changes.push(`メンバー削除: ${member.name}`);
  for (const group of draft.groups) {
    const ids = base.members.filter(member => member.group === group.id && draft.members.some(item => item.id === member.id && item.group === group.id)).map(member => member.id);
    if (ids.join() !== draft.members.filter(member => member.group === group.id && ids.includes(member.id)).map(member => member.id).join()) changes.push(`メンバーの表示順を変更: ${group.name}`);
  }
  return changes;
}

/** @param {object} roster 下書き @returns {void} 現行の空グループ非保持を明示して確定を止める */
export function validateCommit(roster) {
  if (!roster.members.length) throw new Error('空の名簿は確定できません。');
  const empty = roster.groups.filter(group => !roster.members.some(member => member.group === group.id));
  if (empty.length) throw new Error(`下書きグループ「${empty.map(group => group.name).join('、')}」にメンバーを追加・移動するか、グループを削除してください。`);
}
