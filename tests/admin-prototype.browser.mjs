/**
 * admin-prototype.browser.mjs - 統合管理試作の端末幅・作業フロー・隔離を検証する。
 * 依存: Playwright（browserは呼出元から注入）。参照元: scripts/test-browser.mjs。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const WIDTHS = [320, 390, 599, 600, 768, 820, 899, 900, 1024, 1199, 1200, 1280, 1920, 2560, 3440];

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
      if (url.origin === origin && url.pathname.startsWith('/prototypes/admin/')) return route.continue();
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
      await page.locator('#add-member').click();
      assert.equal(await page.locator('#member-form [name="name"]').inputValue(), '未反映の入力');
      await page.locator('#member-form [name="name"]').fill('<img src=x onerror=alert(1)>');
      await page.locator('#member-form [name="group"]').selectOption('sample-sales');
      await page.locator('#member-form').getByRole('button', { name: '下書きに反映' }).click();
      assert.equal(await page.locator('#detail-body img').count(), 0);
      assert.equal(await page.locator('#detail-body h2').textContent(), '<img src=x onerror=alert(1)>');
    }
    assert.deepEqual(errors, [], `Runtime errors at ${width}`);
    assert.deepEqual(unexpectedRequests, [], `Prototype isolation at ${width}`);
    console.log(`Admin prototype checks passed at ${width}px: layout, navigation, isolation${[390, 1280].includes(width) ? ', roster workflows, draft retention, deletion and local confirmation' : ''}.`);
    await page.close();
  }
}
