/**
 * admin-prototype.browser.mjs - 統合管理試作の端末幅・作業フロー・隔離を検証する。
 * 依存: Playwright（browserは呼出元から注入）。参照元: scripts/test-browser.mjs。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FIXTURE } from '../prototypes/admin/constants.mjs';
import { copyRoster } from '../prototypes/admin/model.mjs';
import { createRosterCsv } from '../prototypes/admin/csv.mjs';
import { csvService } from './fixtures/csv.mjs';

const WIDTHS = [320, 390, 599, 600, 768, 820, 899, 900, 1024, 1199, 1200, 1280, 1920, 2560, 3440];
const csv = createRosterCsv(csvService);

/** @param {object} page 試作 @param {string} scenario 架空名簿 @returns {Promise<void>} */
async function loadSample(page, scenario) {
  if (!await page.locator('#sample-scenario').isVisible()) await page.locator('.sample-options summary').click();
  await page.locator('#sample-scenario').selectOption(scenario);
  await page.locator('#load-sample').click();
}

/** @param {object} page 試作 @param {string} text CSV本文 @returns {Promise<void>} */
async function selectCsv(page, text) {
  await page.locator('#csv-file').setInputFiles({ name: 'sample.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
}

/** @param {object} page 試作 @param {string} origin ローカルURL @param {number} width 幅 @param {string} screenshotDir 画像出力先 @returns {Promise<void>} */
async function checkCsvWorkflow(page, origin, width, screenshotDir) {
  // 前のフローのdraftは別ページとしてリセットし、APIを使わずCSV置換の安全境界を確認する。
  const acceptNavigation = dialog => dialog.accept();
  page.on('dialog', acceptNavigation);
  await page.goto(`${origin}/prototypes/admin/index.html`);
  page.off('dialog', acceptNavigation);
  await page.locator('#csv').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#csv-export').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'whereabouts-sample.csv');
  const stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = Buffer.concat(chunks).toString('utf8');
  assert.deepEqual(csv.previewImport(exported, FIXTURE).changes, []);
  await selectCsv(page, exported);
  await page.getByRole('heading', { name: '検証完了 · 6名 / 3グループ' }).waitFor();
  assert.equal(await page.locator('#csv-apply').isDisabled(), true);

  await selectCsv(page, '在席管理CSV\n不正ヘッダ');
  await page.getByRole('heading', { name: '取込みできません' }).waitFor();
  assert.equal(await page.locator('#csv-apply').isDisabled(), true);
  const replacement = copyRoster(FIXTURE);
  replacement.members = replacement.members.slice(0, 2);
  replacement.members[0].tomorrowPlan = '明日の新しい予定';
  replacement.members[0].id = 'quoted"id,[]';
  replacement.members[0].name = '<img src=x onerror=alert(1)> CSV氏名';
  replacement.groups = replacement.groups.slice(0, 1);
  await selectCsv(page, csv.exportRoster(replacement));
  await page.getByRole('heading', { name: '検証完了 · 2名 / 1グループ' }).waitFor();
  assert.equal(await page.locator('#csv-apply').isDisabled(), true);
  assert.equal(await page.locator('#csv-result img').count(), 0);
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `csv-preview-${width}.png`) });
  await page.locator('#csv-delete-confirm').check();
  await page.locator('#csv-apply').click();
  assert.equal(await page.locator('.member-row').count(), 2);
  await page.locator('[data-group="sample-sales"]').click();
  await page.locator('#member-order').click();
  await page.locator('[data-position]').first().fill('2');
  await page.locator('[data-position]').first().press('Tab');
  await page.locator('#member-order').click();
  await page.locator('#review').click();
  assert.match(await page.locator('.change-list').textContent(), /メンバー削除/);
  await page.keyboard.press('Escape');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#discard').click();
  assert.equal(await page.locator('.member-row').count(), 6);

  // 同一IDの在席情報の変更だけでも未確定/差分の対象になる。
  const stateOnly = copyRoster(FIXTURE); stateOnly.members[0].tomorrowPlan = '明日の新しい予定';
  await page.locator('#csv').click();
  await selectCsv(page, csv.exportRoster(stateOnly));
  await page.getByRole('heading', { name: '検証完了 · 6名 / 3グループ' }).waitFor();
  assert.match(await page.locator('#csv-result').textContent(), /明日の予定: 午前は外出 → 明日の新しい予定/);
  await page.locator('#csv-apply').click();
  await page.locator('#review').click();
  assert.match(await page.locator('.change-list').textContent(), /明日の新しい予定/);
  await page.getByRole('dialog').getByRole('button', { name: '試作内で確定', exact: true }).click();
  assert.match(await page.locator('#draft-summary').textContent(), /変更はありません/);

  await page.locator('#add-member').click();
  await page.locator('#member-form [name="name"]').fill('途中の入力');
  await page.locator('#csv').click();
  assert.equal(await page.getByRole('dialog').isVisible(), false);
  assert.match(await page.locator('#status').textContent(), /入力途中/);
  await page.locator('#resume-edit').click();
  assert.equal(await page.locator('#member-form [name="name"]').inputValue(), '途中の入力');
}

/** @param {object} page Playwrightページ @param {string} name メニュー表示名 @returns {Promise<void>} */
async function navigate(page, name) {
  const item = page.getByRole('navigation').getByRole('button', { name, exact: true });
  if (!await item.isVisible()) await page.locator('#menu').click();
  await item.click();
}

/** @param {object} browser 注入されたブラウザ @param {string} origin ローカルサーバー @returns {Promise<void>} */
export async function runAdminPrototypeChecks(browser, origin) {
  const screenshotDir = process.env.PROTOTYPE_SCREENSHOTS;
  if (screenshotDir) await fs.mkdir(screenshotDir, { recursive: true });
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], unexpectedRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    // 許可するのは静的試作のassetsだけ。既存アプリ/API/CDNに接続したら失敗。
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && (url.pathname.startsWith('/prototypes/admin/') || url.pathname === '/js/services/csv.js')) return route.continue();
      unexpectedRequests.push(url.href); return route.abort();
    });
    await page.goto(`${origin}/prototypes/admin/index.html`);
    await page.getByRole('heading', { name: 'メンバー・グループ', exact: true }).waitFor();
    assert.equal(await page.locator('.member-row').count(), 6);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`);
    if (screenshotDir && [390, 820, 1280, 1920].includes(width)) await page.screenshot({ path: path.join(screenshotDir, `admin-${width}.png`), fullPage: true });
    await navigate(page, 'お知らせ・予定');
    assert.equal(await page.getByRole('heading', { name: '関連お知らせの選択・作成' }).isVisible(), true);
    await navigate(page, 'メンバー・グループ');

    await loadSample(page, 'large');
    assert.equal(await page.locator('.member-row').count(), 100);
    await page.locator('[data-group="large-group-0"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Long group/name overflow at ${width}`);
    await page.locator('#member-order').click();
    assert.equal(await page.locator('input[data-position]').count(), await page.locator('.member-row').count());
    assert.equal(await page.locator('.row-order option').count(), 0);
    await page.locator('#member-order').click();
    await page.locator('input[data-select]').nth(0).check();
    await page.locator('input[data-select]').nth(1).check();
    assert.match(await page.locator('#move-selected').textContent(), /2名/);
    await page.locator('#search').fill('一致しない検索語');
    assert.equal(await page.locator('.member-row').count(), 0);
    assert.equal(await page.locator('#move-selected').isDisabled(), true);
    await page.locator('#clear-search').click();
    await loadSample(page, 'empty');
    assert.equal(await page.locator('.member-row').count(), 0);
    assert.match(await page.locator('[data-group=""]').textContent(), /0名/);
    await loadSample(page, 'standard');

    if ([390, 1280].includes(width)) {
      await page.locator('[data-group="sample-sales"]').click();
      await page.locator('#search').fill('花子');
      assert.equal(await page.locator('.member-row').count(), 1);
      assert.match(await page.locator('.member-info').textContent(), /順序 1\/2/);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#member-order').click();
      assert.equal(await page.locator('.member-row').count(), 2);
      await page.getByRole('button', { name: '佐藤 花子を下へ', exact: true }).click();
      assert.match(await page.locator('.member-info').first().textContent(), /鈴木 太郎/);
      await page.locator('#member-order').click();

      await page.locator('#add-group').click();
      await page.getByRole('dialog').locator('input[name="name"]').fill('新部署');
      await page.getByRole('button', { name: '下書きに追加', exact: true }).click();
      await page.locator('#commit').click();
      await page.getByRole('dialog').getByRole('button', { name: '試作内で確定', exact: true }).click();
      assert.match(await page.locator('#status').textContent(), /下書きグループ/);
      await page.locator('#add-member').click();
      await page.locator('#member-form [name="name"]').fill('試作 メンバー');
      await page.locator('#member-form [name="ext"]').fill('501');
      // 主ナビ切替と幅変更でも編集中のフォームを保持する。
      await navigate(page, 'ツール');
      await navigate(page, 'メンバー・グループ');
      assert.equal(await page.locator('#member-form [name="name"]').inputValue(), '試作 メンバー');
      await page.setViewportSize({ width: width === 390 ? 1280 : 390, height: 900 });
      assert.equal(await page.locator('#member-form [name="name"]').inputValue(), '試作 メンバー');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#member-form').getByRole('button', { name: '下書きに反映' }).click();
      await page.locator('#detail-body [data-back]').click();
      await page.locator('[data-group=""]').click();
      assert.equal(await page.locator('.member-row').count(), 7);
      await page.getByRole('checkbox', { name: '佐藤 花子を選択', exact: true }).check();
      await page.locator('#move-selected').click();
      await page.getByRole('dialog').locator('select').selectOption({ label: '新部署' });
      await page.getByRole('dialog').getByRole('button', { name: '下書きに反映' }).click();
      await page.locator('#review').click();
      assert.match(await page.locator('.change-list').textContent(), /所属変更: 佐藤 花子/);
      await page.getByRole('dialog').getByRole('button', { name: '試作内で確定', exact: true }).click();
      assert.match(await page.locator('#draft-summary').textContent(), /変更はありません/);
      assert.match(await page.locator('#status').textContent(), /実際の名簿への保存は行っていません/);
      assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
      await page.reload();
      assert.equal(await page.locator('.member-row').count(), 6);

      await page.locator('[data-group="sample-sales"]').click();
      await page.getByRole('button', { name: 'グループを削除', exact: true }).click();
      await page.getByRole('dialog').locator('select').selectOption('sample-product');
      await page.getByRole('button', { name: '移動してグループを削除', exact: true }).click();
      await page.locator('[data-group=""]').click();
      assert.equal(await page.locator('.member-row').count(), 6);
      assert.equal(await page.locator('[data-group="sample-sales"]').count(), 0);

      await page.locator('#group-order').click();
      assert.equal(await page.getByRole('dialog').isVisible(), true);
      await page.getByRole('button', { name: '開発を下へ', exact: true }).click();
      assert.equal(await page.locator('.group-order-row strong').first().textContent(), '管理');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'group-order');

      page.once('dialog', dialog => dialog.accept());
      await page.locator('#discard').click();
      assert.equal(await page.locator('[data-group="sample-sales"]').count(), 1);
      await page.locator('#add-member').click();
      await page.locator('#member-form [name="name"]').fill('未反映の入力');
      await page.locator('#detail-body [data-back]').click();
      await page.locator('#resume-edit').click();
      assert.equal(await page.locator('#member-form [name="name"]').inputValue(), '未反映の入力');
      await page.locator('#member-form [name="name"]').fill('<img src=x onerror=alert(1)>');
      await page.locator('#member-form [name="group"]').selectOption('sample-sales');
      await page.locator('#member-form').getByRole('button', { name: '下書きに反映' }).click();
      assert.equal(await page.locator('#detail-body img').count(), 0);
      assert.equal(await page.locator('#detail-body h2').textContent(), '<img src=x onerror=alert(1)>');
      await checkCsvWorkflow(page, origin, width, screenshotDir);
    }
    assert.deepEqual(errors, [], `Runtime errors at ${width}`);
    assert.deepEqual(unexpectedRequests, [], `Prototype isolation at ${width}`);
    console.log(`Admin prototype checks passed at ${width}px: layout, navigation, 100/0 members, long names, selection reset, isolation${[390, 1280].includes(width) ? ', roster/CSV workflows, draft retention, deletion and local confirmation' : ''}.`);
    await page.close();
  }
}
