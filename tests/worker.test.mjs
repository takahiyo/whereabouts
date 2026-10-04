/** 権限境界と読取障害をローカルWorker・読取専用DBモックで検証する。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { worker, fixture, member, token, database, request } from './fixtures/worker.mjs';

test('Worker rejects non-POST requests and answers preflight without DB access', async () => {
  const context = { waitUntil() {} };
  const get = await worker.fetch(new Request('https://local.invalid'), {}, context);
  assert.equal(get.status, 405);
  const options = await worker.fetch(new Request('https://local.invalid', { method: 'OPTIONS' }), {}, context);
  assert.equal(options.status, 200);
});

test('Missing DB binding is an explicit server error', async () => {
  const response = await request({ action: 'get' }, null);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'DB_BINDING_MISSING');
});

test('Unauthenticated and cross-office reads are denied before data access', async () => {
  for (const params of [
    { action: 'get', office: fixture.office },
    { action: 'get', office: 'another-office', token: await token() }
  ]) {
    const db = database();
    const response = await request(params, db);
    assert.equal(response.status, 403);
    assert.equal(db.reads.length, 0);
  }
});

test('Expired worker session cannot read office data', async () => {
  const response = await request({ action: 'get', token: await token({ exp: 1 }) });
  assert.equal(response.status, 403);
});

test('Status read aliases return office-scoped data and preserve differential cursor', async () => {
  for (const action of ['get', 'getFor']) {
    const db = database();
    const response = await request({ action, since: 50, token: await token() }, db);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.data[member.id].status, member.status);
    assert.equal(result.maxUpdated, member.updated);
    assert.deepEqual(db.reads.at(-1).params, [fixture.office, 50]);
  }
});

test('DB read failure returns a JSON error instead of a broken response', async () => {
  const response = await request({ action: 'get', token: await token() }, database(true));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'internal_server_error');
});

// 既知の未修正事項は成功試験に数えず、後段の実装時に回帰試験へ置き換える。
test.todo('Firebase token with a forged signature must be rejected (A01)');
test.todo('Roster insertion failure must preserve the previous roster (D02)');
test.todo('Stale baseRev must return a conflict without overwriting data (D03)');
