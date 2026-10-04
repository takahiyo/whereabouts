/** 名簿試作の意味ある境界試験。共有D1・本番API・ストレージは使用しない。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE } from '../prototypes/admin/constants.mjs';
import * as model from '../prototypes/admin/model.mjs';

test('所属変更と並び替えがID・在席・予定を保持し、移動先末尾に表示する', () => {
  const roster = model.copyRoster(FIXTURE), original = structuredClone(roster.members[0]);
  model.moveMembers(roster, ['sample-2', 'sample-1'], 'sample-product');
  assert.deepEqual(roster.members.filter(member => member.group === 'sample-product').map(member => member.id), ['sample-3', 'sample-4', 'sample-5', 'sample-1', 'sample-2']);
  model.reorderMember(roster, 'sample-1', 0);
  assert.deepEqual(roster.members.find(member => member.id === original.id), { ...original, group: 'sample-product' });
  assert.deepEqual(roster.members.filter(member => member.group === 'sample-product').map(member => member.id), ['sample-1', 'sample-3', 'sample-4', 'sample-5', 'sample-2']);
});

test('グループ削除は移動先必須で、既存人員を削除しない', () => {
  const roster = model.copyRoster(FIXTURE), before = model.copyRoster(roster);
  assert.throws(() => model.removeGroup(roster, 'sample-sales', ''), /所属グループ/);
  assert.throws(() => model.removeGroup(roster, 'sample-sales', 'sample-sales'), /別の/);
  assert.deepEqual(roster, before);
  model.removeGroup(roster, 'sample-sales', 'sample-product');
  assert.equal(roster.members.length, before.members.length);
  assert.equal(roster.groups.length, before.groups.length - 1);
  assert.equal(roster.members.find(member => member.id === 'sample-1').tomorrowPlan, '午前は外出');
});

test('所属変更の不正対象は変更前に拒否し、名称の重複も拒否する', () => {
  const roster = model.copyRoster(FIXTURE), before = model.copyRoster(roster);
  assert.throws(() => model.moveMembers(roster, ['sample-1', 'missing'], 'sample-product'), /選択/);
  assert.throws(() => model.renameGroup(roster, 'sample-sales', '開発'), /同じ/);
  assert.deepEqual(roster, before);
});

test('編集対象以外を保持し、不正な入力を原稿へ反映しない', () => {
  const roster = model.copyRoster(FIXTURE), before = model.copyRoster(roster);
  assert.throws(() => model.putMember(roster, { ...roster.members[0], ext: 'bad' }, 'sample-1'), /内線/);
  assert.deepEqual(roster, before);
  model.putMember(roster, { ...roster.members[0], name: '佐藤 華子', group: 'sample-admin' }, 'sample-1');
  assert.equal(roster.members.find(member => member.id === 'sample-1').status, before.members[0].status);
  assert.equal(roster.members.find(member => member.id === 'sample-1').tomorrowPlan, before.members[0].tomorrowPlan);
});

test('差分は最終結果を比較し、順番の往復や追加後削除は残さない', () => {
  const roster = model.copyRoster(FIXTURE);
  model.reorderMember(roster, 'sample-1', 1);
  assert.deepEqual(model.diffRoster(FIXTURE, roster), ['メンバーの表示順を変更: 営業']);
  model.reorderMember(roster, 'sample-1', 0);
  model.addGroup(roster, '試作', 'temporary');
  model.removeGroup(roster, 'temporary');
  assert.deepEqual(model.diffRoster(FIXTURE, roster), []);
});

test('空グループを確定成功扱いせず、所属追加後に確定可能になる', () => {
  const roster = model.copyRoster(FIXTURE);
  model.addGroup(roster, '新部署', 'temporary');
  assert.throws(() => model.validateCommit(roster), /下書きグループ/);
  model.moveMembers(roster, ['sample-1'], 'temporary');
  assert.doesNotThrow(() => model.validateCommit(roster));
});
