/** 実在席表の半画面/タブレット/スマホ配置を架空データと通信モックで確認する。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

/** @param {string} foreground RGB文字色 @param {string} background RGB背景 @returns {number} 読める配色を検証する比率 */
function contrast(foreground, background) {
  const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
    const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

/** @param {object} browser ブラウザ @param {string} origin 静的サーバー @returns {Promise<void>} */
export async function runBoardLayoutChecks(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 960, height: 900 } });
  const errors = [], actions = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (url.pathname.endsWith('/firebase-auth.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.watchAuthState = callback => { callback(null); return () => {}; };' });
      return route.continue();
    }
    const body = route.request().postData();
    if (body) { const payload = JSON.parse(body); actions.push((payload.data || payload).action); }
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, offices: [], tools: [] }) });
  });
  await page.goto(`${origin}/?office=fixture`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    document.getElementById('login').classList.add('u-hidden');
    for (const id of ['adminBtn', 'noticesBtn', 'eventBtn', 'toolsBtn', 'logoutBtn', 'manualBtn', 'qrBtn', 'nameFilter', 'statusFilter']) document.getElementById(id).style.display = 'inline-block';
    titleBtn.textContent = 'サンプル営業所　在席確認表';
    const columns = ['name', 'workHours', 'time', 'status', 'note', 'tomorrowPlan'];
    OFFICE_COLUMN_CONFIG = { board: columns, card: columns, popup: [], columnWidths: {}, layoutConfig: {} };
    STATUSES = DEFAULT_STATUSES.map(status => ({ ...status }));
    statusClassMap = new Map(STATUSES.map(status => [status.value, status.class]));
    MENUS = { tomorrowPlanOptions: ['午前外出'], timeStepMinutes: 30 };
    GROUPS = [8, 3].map((size, group) => ({ title: `確認グループ${group + 1}`, members: Array.from({ length: size }, (_, index) => ({
      id: `fixture-${group}-${index}`, name: index ? `確認メンバー${index + 1}` : '長い氏名と所属情報を含む表示確認メンバー',
      workHours: '09:00-17:30', status: STATUSES[index % STATUSES.length].value, time: '', tomorrowPlan: '午前外出', note: '長い備考の表示確認'
    })) }));
    render();
    // inputイベントや保存を起こさず、リサイズで入力DOMが消えないことを確認する。
    document.querySelector('#row-fixture-0-0 [name="note"]').value = '未保存の表示確認';
  });
  const screenshots = process.env.BOARD_SCREENSHOTS;
  if (screenshots) await fs.mkdir(screenshots, { recursive: true });
  for (const width of [320, 360, 390, 600, 768, 820, 960, 1024, 1280, 1400, 1536, 1540, 1920, 2560, 3440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction(() => lastW === getContainerWidth());
    const result = await page.evaluate(() => {
      const panel = board.querySelector('.panel'), body = panel.querySelector('tbody');
      const rows = [...body.querySelectorAll('tr')].map(row => row.getBoundingClientRect());
      const controlsFit = [...board.querySelectorAll('input, select')].filter(input => input.getClientRects().length).every(input => {
        const field = input.getBoundingClientRect(), row = input.closest('tr').getBoundingClientRect();
        return field.width >= 60 && field.right <= row.right + 1;
      });
      return { cards: board.classList.contains('force-cards'), columns: new Set(rows.filter(row => Math.abs(row.top - rows[0].top) < 2).map(row => Math.round(row.left))).size,
        overflow: document.documentElement.scrollWidth > innerWidth, controlsFit, panels: board.querySelectorAll('.panel').length };
    });
    assert.equal(result.overflow, false, `Page overflow at ${width}`);
    assert.equal(result.controlsFit, true, `Unusable field at ${width}`);
    assert.equal(result.panels, 2);
    if (width <= 768) assert.equal(result.columns, 1, `Narrow layout at ${width}`);
    if ([820, 960, 1024].includes(width)) assert.equal(result.columns, 2, `Half-window cards at ${width}`);
    if ([1280, 1400, 1536, 1540].includes(width)) assert.equal(result.columns, 3, `Wide cards at ${width}`);
    if (width >= 1920) assert.equal(result.cards, false, `Table layout at ${width}`);
    assert.equal(await page.locator('#row-fixture-0-0 [name="note"]').inputValue(), '未保存の表示確認');
    if (screenshots && [390, 820, 960, 1280, 1920].includes(width)) await page.screenshot({ path: path.join(screenshots, `board-${width}.png`), fullPage: true });
  }
  // 拠点の既存しきい値を維持し、広い幅でカード設定でも横並びにする。
  await page.evaluate(() => { OFFICE_COLUMN_CONFIG.layoutConfig = { panelMinWidth: 400, cardBreakpoint: 2000 }; updateCols(); });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => lastW === getContainerWidth());
  assert.equal(await page.locator('#board').evaluate(node => node.classList.contains('force-cards')), true);
  await page.evaluate(() => { OFFICE_COLUMN_CONFIG.layoutConfig.cardBreakpoint = 700; updateCols(); });
  assert.equal(await page.locator('#board').getAttribute('data-cols'), '3', 'Old 800–1400px forced column is removed');

  await page.evaluate(() => { OFFICE_COLUMN_CONFIG.layoutConfig = {}; updateCols(); });
  const menuColors = [];
  assert.equal(await page.locator('[data-appearance-select]').count(), 0, 'Appearance controls removed from login and settings');
  assert.equal(await page.locator('#appearanceChoices input[type="radio"]').count(), 6);
  for (const preset of ['classic', 'pastel', 'metallic', 'forest', 'sakura', 'monochrome']) {
    await page.locator('#appearanceBtn').click();
    await page.locator(`#appearanceChoices input[value="${preset}"]`).check();
    assert.equal(await page.locator('html').getAttribute('data-appearance'), preset);
    assert.equal(await page.evaluate(() => localStorage.getItem(APPEARANCE_STORAGE_KEY)), preset);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#appearanceDialog').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'appearanceBtn');
    for (const width of [390, 820, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => lastW === getContainerWidth());
      const colors = await page.locator('#board tbody tr').evaluateAll(rows => rows.slice(0, 8).map(row => getComputedStyle(row).backgroundColor));
      assert.equal(new Set(colors).size, 8, `Distinct status colors: ${preset}/${width}`);
      const textColors = await page.locator('#board tbody tr').evaluateAll(rows => rows.slice(0, 8).map(row => getComputedStyle(row).color));
      colors.forEach((color, index) => assert(contrast(textColors[index], color) >= 4.5, `State text contrast: ${preset}/${width}/${index}`));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('#row-fixture-0-0 [name="note"]').inputValue(), '未保存の表示確認');
      if (screenshots && [390, 1280].includes(width)) await page.screenshot({ path: path.join(screenshots, `${preset}-board-${width}.png`), fullPage: true });
    }
    await page.locator('#titleBtn').click();
    const menuAccent = await page.locator('[data-target="grp-0"]').getAttribute('data-group-accent');
    assert.equal(menuAccent, await page.locator('#grp-0').getAttribute('data-group-accent'));
    if (screenshots) await page.screenshot({ path: path.join(screenshots, `${preset}-menu.png`) });
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const admin = document.getElementById('adminModal'); admin.classList.add('show'); admin.style.display = 'flex';
    });
    menuColors.push(await page.locator('#adminModal .admin-card').evaluate(card => getComputedStyle(card).backgroundColor));
    assert.equal(await page.locator('#tabBasic [data-appearance-select]').count(), 0);
    if (screenshots) await page.screenshot({ path: path.join(screenshots, `${preset}-admin.png`) });
    await page.evaluate(() => {
      const admin = document.getElementById('adminModal'); admin.classList.remove('show'); admin.style.display = 'none';
    });
    await page.evaluate(() => document.getElementById('login').classList.remove('u-hidden'));
    assert.equal(await page.locator('#loginForm').isVisible(), true);
    if (screenshots) await page.screenshot({ path: path.join(screenshots, `${preset}-login.png`) });
    await page.setViewportSize({ width: 390, height: 600 });
    assert.equal(await page.locator('#loginForm [data-appearance-select]').count(), 0);
    assert.equal(await page.evaluate(() => document.getElementById('login').scrollWidth <= innerWidth), true);
    if (screenshots) await page.screenshot({ path: path.join(screenshots, `${preset}-login-390.png`) });
    await page.evaluate(() => document.getElementById('login').classList.add('u-hidden'));
  }
  assert.equal(new Set(menuColors).size, 6, 'Every pattern has its own menu palette');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'monochrome');
  // 未知の保存値と保存制限でも、外観以外へ作用せず利用できる。
  await page.evaluate(() => localStorage.setItem(APPEARANCE_STORAGE_KEY, 'unknown'));
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'pastel');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Simulated storage restriction'); }; });
  await page.evaluate(() => document.getElementById('login').classList.add('u-hidden'));
  await page.locator('#appearanceBtn').click();
  await page.locator('#appearanceChoices input[value="classic"]').check();
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'classic');
  assert.match(await page.locator('#appearanceDialog [data-appearance-message]').textContent(), /保存できない/);
  assert.deepEqual(errors, []);
  assert(actions.every(action => ['publicListOffices', 'getTools'].includes(action)), 'No shared writes');
  console.log('Board layout checks passed at 15 widths: 1/2/3 card columns, table layout, input retention, existing configuration and no write requests.');
  await page.close();
}
