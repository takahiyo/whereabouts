/** 共有保存を行わず、領域別の確定・関連情報の保護・入力拒否を確認。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../prototypes/admin/workspace-model.mjs';

test('お知らせと予定は別々に確定し、新規関連のお知らせを先に確定する', () => {
  const store = model.createWorkspaceStore();
  model.putWorkspaceItem(store, 'notices', { title: '新規お知らせ', content: '', visible: true }, 'new-notice');
  model.putWorkspaceItem(store, 'events', { title: '予定', start: '2026-10-15', end: '2026-10-16', noticeId: 'new-notice' }, 'new-event');
  assert.throws(() => model.commitWorkspace(store, 'events'), /先に/);
  model.commitWorkspace(store, 'notices');
  assert.equal(model.workspaceChanges(store, 'notices').length, 0);
  assert.equal(model.workspaceChanges(store, 'events').length, 1);
  model.commitWorkspace(store, 'events');
  assert.equal(model.workspaceChanges(store, 'events').length, 0);
});
test('関連するお知らせを削除できず、予定で解除して確定した後に削除できる', () => {
  const store = model.createWorkspaceStore();
  assert.throws(() => model.removeWorkspaceItem(store, 'notices', 'notice-sample'), /先に予定/);
  model.putWorkspaceItem(store, 'events', { ...store.draft.events[0], noticeId: '' }, 'event-sample');
  assert.throws(() => model.removeWorkspaceItem(store, 'notices', 'notice-sample'), /先に予定/);
  model.commitWorkspace(store, 'events');
  model.removeWorkspaceItem(store, 'notices', 'notice-sample');
  assert.deepEqual(model.workspaceChanges(store, 'notices'), ['削除: サンプル拠点からのお知らせ']);
});
test('終了日前後・存在しない日付・未知の関連IDを拒否し、下書きを変更しない', () => {
  const store = model.createWorkspaceStore(), before = structuredClone(store);
  for (const changes of [{ end: '2026-10-01' }, { start: '2026-02-30' }, { noticeId: 'missing' }]) {
    assert.throws(() => model.putWorkspaceItem(store, 'events', { ...store.draft.events[0], ...changes }, 'event-sample'));
    assert.deepEqual(store, before);
  }
});
test('危険schemeと認証情報付きURLを拒否し、通常のリンクだけを正規化する', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'https://user:password@example.invalid', 'https://example.invalid/ x']) assert.throws(() => model.normalizeWorkspaceUrl(url));
  assert.equal(model.normalizeWorkspaceUrl('example.invalid/path'), 'https://example.invalid/path');
  assert.equal(model.normalizeWorkspaceUrl('mailto:sample@example.invalid'), 'mailto:sample@example.invalid');
  assert.equal(model.normalizeWorkspaceUrl('tel:12345'), 'tel:12345');
});
test('順序変更とその往復を差分に反映し、不正な位置は拒否する', () => {
  const store = model.createWorkspaceStore();
  model.putWorkspaceItem(store, 'tools', { title: '追加ツール', url: 'https://example.invalid/', note: '' }, 'second');
  model.commitWorkspace(store, 'tools');
  model.moveWorkspaceItem(store, 'tools', 'second', -1);
  assert.deepEqual(model.workspaceChanges(store, 'tools'), ['表示順を変更']);
  model.moveWorkspaceItem(store, 'tools', 'second', 1);
  assert.deepEqual(model.workspaceChanges(store, 'tools'), []);
  const before = structuredClone(store);
  assert.throws(() => model.moveWorkspaceItem(store, 'tools', 'second', -0.5));
  assert.deepEqual(store, before);
});
