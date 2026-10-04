/** ホスト判定を実際のconfig.jsで確認し、外部APIへの接続は行わない。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
for (const [hostname, development] of [
  ['localhost', true], ['127.0.0.1', true], ['dev.example.com', true],
  ['dev.whereabouts.pages.dev', true], ['example.com', false],
  ['whereabouts.pages.dev', false], ['localhost.example.com', false],
  ['preview.whereabouts.pages.dev', false], ['abc123.whereabouts.pages.dev', false]
]) {
  test(`Host routing: ${hostname}`, () => {
    const context = vm.createContext({ window: { location: { hostname } } });
    vm.runInContext(source, context);
    assert.equal(context.CONFIG.remoteEndpoint.includes('whereabouts-dev.'), development);
  });
}
