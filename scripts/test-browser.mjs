/**
 * 閲覧dialog・マニュアルのブラウザ回帰試験。全外部通信を差し替え、共有D1を使わない。
 * Windowsはインストール済みEdge、他環境はPlaywright Chromiumを使う。
 * BROWSER_CHANNELでインストール済みブラウザを指定可能。参照元: npm run test:browser。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { runAdminPrototypeChecks } from '../tests/admin-prototype.browser.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(root) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  response.setHeader('Content-Type', /\.(?:mjs|js)$/.test(filename) ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html');
  response.end(fs.readFileSync(filename));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  browser = await chromium.launch({ channel, headless: true });
  for (const width of [1280, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [], externalActions = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') {
        if (url.pathname.endsWith('/firebase-auth.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.watchAuthState = callback => { callback(null); return () => {}; };' });
        return route.continue();
      }
      const body = route.request().postData();
      if (body) {
        const parsed = JSON.parse(body);
        externalActions.push((parsed.data || parsed).action);
      }
      return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, offices: [], tools: [] }) });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/?office=fixture`);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#loginOfficeId').inputValue(), 'fixture');
    // 未認証fixtureで閲覧入口だけ表示し、認証・在席更新を実行せず試験する。
    await page.evaluate(() => {
      document.getElementById('login').classList.add('u-hidden');
      for (const id of ['qrBtn', 'toolsBtn', 'manualBtn']) document.getElementById(id).style.display = 'inline-block';
    });
    for (const [button, modal, close] of [
      ['qrBtn', 'qrModal', 'qrModalClose'], ['toolsBtn', 'toolsModal', 'toolsModalClose'], ['manualBtn', 'manualModal', 'manualClose']
    ]) {
      await page.locator('#' + button).click();
      await page.waitForFunction(id => document.activeElement.id === id, close);
      // 先頭からShift+Tab、末尾からTabの循環。隠れたタブ内のリンクは除外する。
      const wrapped = await page.evaluate(id => {
        const dialog = document.getElementById(id);
        const elements = [...dialog.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)].filter(e => e.tabIndex >= 0 && !e.matches(':disabled') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
        elements.at(-1).focus(); return elements.length;
      }, modal);
      assert(wrapped > 0);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), close);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(id => {
        const dialog = document.getElementById(id);
        const elements = [...dialog.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)].filter(e => e.tabIndex >= 0 && !e.matches(':disabled') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
        return document.activeElement === elements.at(-1);
      }, modal), true);
      if (modal === 'manualModal') {
        await page.locator('.manual-tab-btn[data-tab="admin"]').click();
        assert.equal(await page.locator('#manualAdmin').isVisible(), true);
        assert.equal(await page.locator('#manualUser').isVisible(), false);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(id => document.activeElement.id === id, button);
      assert.equal(await page.locator('#' + modal).isVisible(), false);
    }
    // 開き直しでも登録が重複せず、上に開いたdialogを閉じると下のfocusへ戻る。
    await page.locator('#toolsBtn').click();
    await page.waitForFunction(() => document.activeElement.id === 'toolsModalClose');
    await page.evaluate(() => window.showQrModal(true));
    await page.waitForFunction(() => document.activeElement.id === 'qrModalClose');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'toolsModalClose');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'toolsBtn');
    assert.deepEqual(errors, []);
    assert(externalActions.every(action => ['publicListOffices', 'getTools'].includes(action)));
    console.log(`Browser checks passed at ${width}px: startup, manual tabs, dialog Tab/Escape/restore, nesting, no write requests.`);
    await page.close();
  }
  await runAdminPrototypeChecks(browser, `http://127.0.0.1:${server.address().port}`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
