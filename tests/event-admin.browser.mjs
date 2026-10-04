/** イベントの保存後表示・未選択・全グループ日付操作と管理全作業の回帰試験。外部通信はすべてモック。 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function runEventAdminChecks(browser, origin) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], externalActions = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) {
      if (url.pathname.endsWith('/firebase-auth.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.watchAuthState = cb => { cb(null); return () => {}; };' });
      return route.continue();
    }
    const body = route.request().postData();
    if (body) { const payload = JSON.parse(body); externalActions.push((payload.data || payload).action); }
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, offices: [], tools: [] }) });
  });
  await page.goto(`${origin}/?office=fixture`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    document.getElementById('login').classList.add('u-hidden');
    SESSION_TOKEN = 'local-fixture'; CURRENT_OFFICE_ID = 'fixture'; CURRENT_ROLE = 'officeAdmin';
    adminSelectedOfficeId = 'fixture';
    window.fixtureCalls = [];
    startEventSync = () => {}; // 明示保存後のtimerもモック環境に限定し、古いGETで試験原稿を消さない。
    // 保存APIは{ok:true}だけ返し、GETは古い空一覧を返す。実Workerのキャッシュ失効直後を再現。
    apiPost = async payload => {
      window.fixtureCalls.push(structuredClone(payload));
      if (payload.action === 'setVacation' && window.fixtureSaveFailure) return { ok: false, error: 'simulated_save_failure' };
      if (payload.action === 'getConfigFor') return { groups: GROUPS };
      if (payload.action === 'getFor') return { data: {} };
      if (payload.action === 'getNotices') return { ok: true, notices: [{ id: 'notice-fixture', title: '連絡事項', content: '本文', visible: true }] };
      if (payload.action === 'getTools') return { ok: true, tools: [{ id: 'tool-fixture', title: '連絡先', url: 'https://example.com', visible: true }] };
      if (payload.action === 'getVacation') return { ok: true, vacations: window.fixtureReadEvents || [] };
      if (payload.action === 'getColumnConfig') return { columnConfig: { board: ['name', 'status', 'note'], card: ['name', 'status'], popup: [], customColumns: [] } };
      return { ok: true, colors: {}, settings: {} };
    };
    GROUPS = Array.from({ length: 3 }, (_, gi) => ({ title: `確認グループ${gi + 1}`, members: Array.from({ length: 2 }, (_, mi) => ({ id: `fixture-${gi}-${mi}`, name: `確認メンバー${gi + 1}-${mi + 1}` })) }));
    STATUSES = DEFAULT_STATUSES.map(status => ({ ...status })); statusClassMap = new Map(STATUSES.map(status => [status.value, status.class]));
    document.getElementById('adminModal').classList.add('show'); document.getElementById('adminModal').style.display = 'flex';
    refreshVacationOfficeOptions();
  });
  assert.equal(await page.locator('.admin-area-btn').count(), 5);
  assert.equal(await page.locator('#btnExport').evaluate(el => el.closest('.tab-panel').id), 'tabCsv');
  assert.equal(await page.locator('#btnPrintList').evaluate(el => el.closest('.tab-panel').id), 'tabOutput');
  assert.equal(await page.locator('#btnRenameOffice').evaluate(el => el.closest('.tab-panel').id), 'tabAccess');
  await page.locator('[data-area="communication"]').click();
  await page.locator('#vacationTitle').fill('最初のイベント');
  await page.locator('#vacationStart').fill('2026-10-30');
  await page.locator('#vacationEnd').fill('2026-11-02');
  await page.locator('#btnVacationSave').click();
  await page.waitForFunction(() => cachedVacationList.length === 1);
  const saved = await page.evaluate(() => JSON.parse(window.fixtureCalls.find(call => call.action === 'setVacation').data));
  assert.equal(saved.visible, true); assert.equal(saved.isVacation, true); assert.match(saved.id, /^vacation_/);
  assert.equal(await page.locator('#eventBtn').isVisible(), true, 'First saved event immediately enables main button despite stale GET');
  assert.equal(await page.locator('#vacationListBody article').count(), 1);
  assert.equal(await page.locator('#eventSelectDropdown').inputValue(), '');
  assert.equal(await page.locator('#eventGanttWrap').isVisible(), false);
  assert.equal(await page.evaluate(() => eventSelectedId), '');
  assert.equal(await page.evaluate(() => window.fixtureCalls.filter(call => call.action === 'getVacation').length), 1, 'No stale GET after successful save');

  await page.locator('.event-admin-card-heading button').click();
  await page.locator('#vacationTitle').fill('保存に失敗する変更');
  await page.evaluate(() => { window.fixtureSaveFailure = true; });
  await page.locator('#btnVacationSave').click();
  await page.waitForFunction(() => !document.getElementById('btnVacationSave').disabled);
  assert.equal(await page.evaluate(() => cachedVacationList[0].title), '最初のイベント', 'Failed save never changes displayed cache');
  assert.equal(await page.locator('#vacationTitle').inputValue(), '保存に失敗する変更', 'Failed save retains input for retry');
  await page.evaluate(() => { window.fixtureSaveFailure = false; });

  // 編集でも公開/休暇固定を保存し、新規作成時の既定値を押し付けない。
  await page.locator('.event-admin-card-heading button').click();
  await page.locator('#vacationVisible').uncheck(); await page.locator('#vacationIsVacation').uncheck();
  await page.locator('#btnVacationSave').click();
  await page.waitForFunction(() => cachedVacationList[0]?.visible === false);
  assert.equal(await page.locator('#eventBtn').isVisible(), false);
  await page.locator('.event-admin-card-controls input').first().check();
  await page.waitForFunction(() => cachedVacationList[0]?.visible === true);
  assert.equal(await page.locator('#eventBtn').isVisible(), true);

  await page.evaluate(async saved => {
    window.fixtureEvents = [cachedVacationList[0], { ...saved, id: 'fixture-second', title: '二つ目のイベント', visible: true, noticeId: 'notice-fixture' }];
    window.fixtureReadEvents = window.fixtureEvents;
    for (let i = 0; i < 3; i++) await loadEvents('fixture', false, { list: window.fixtureEvents });
    window.CURRENT_NOTICES = [{ id: 'notice-fixture', title: '連絡事項', content: '本文', visible: true }];
    closeAdminModal(); document.getElementById('eventModal').classList.add('show'); document.getElementById('eventModal').style.display = 'flex';
  }, saved);
  await page.locator('#eventSelectDropdown').selectOption('fixture-second');
  await page.waitForFunction(() => document.querySelectorAll('#eventGantt tbody').length === 3);
  assert.equal(await page.evaluate(() => eventSelectedId), 'fixture-second');
  assert.equal(await page.locator('#btnShowEventNotice').isVisible(), true);
  assert.equal(await page.locator('#eventSelectionEmpty').isVisible(), false);
  const dayWidths = await page.locator('#eventGantt .vac-day-header').evaluateAll(headers => headers.map(el => el.getBoundingClientRect().width));
  assert(dayWidths.every(width => width >= 31 && width <= 36), `Compact date widths: ${dayWidths}`);
  for (let group = 0; group < 3; group++) {
    const cell = page.locator('#eventGantt tbody').nth(group).locator('.vac-cell').first();
    const before = await cell.evaluate(el => getComputedStyle(el).backgroundColor);
    await cell.hover();
    assert.equal(await page.locator('#eventGantt .vac-axis-cell').count(), 1);
    assert.equal(await cell.evaluate(el => el.classList.contains('vac-axis-cell')), true, `Hover group ${group}`);
    assert.equal(await page.locator('#eventGantt tbody .vac-axis-column').count(), 6, 'Date axis spans every group');
    assert.equal(await cell.evaluate(el => getComputedStyle(el).backgroundColor), before, 'Axis preserves holiday/category background');
    await cell.click(); assert.equal(await cell.getAttribute('aria-pressed'), 'true');
  }
  const firstCell = page.locator('#eventGantt .vac-cell').first();
  await firstCell.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-pressed')), 'true');
  assert.equal(await page.evaluate(() => window.fixtureCalls.filter(call => call.action === 'setVacationBits').length), 0, 'Cell edits keep existing explicit save behavior');
  const unsavedBits = await page.evaluate(() => getEventGanttController().getBitsString());
  await page.evaluate(async () => { await refreshEventDataSilent('fixture'); });
  assert.equal(await page.evaluate(() => getEventGanttController().getBitsString()), unsavedBits, 'Polling does not overwrite unsaved bits');
  await page.locator('#eventSelectDropdown').selectOption(saved.id);
  assert.equal(await page.evaluate(() => eventSelectedId), saved.id, 'Selection still works after polling rebuilt dropdown');
  await page.locator('#eventSelectDropdown').selectOption('fixture-second');
  await page.evaluate(bits => { getEventGanttController().loadFromString(bits); }, unsavedBits);
  await page.locator('#btnEventSave').click();
  await page.waitForFunction(() => window.fixtureCalls.some(call => call.action === 'setVacationBits'));
  const bits = await page.evaluate(() => JSON.parse(window.fixtureCalls.find(call => call.action === 'setVacationBits').data));
  assert.equal(bits.id, 'fixture-second');
  assert.match(bits.membersBits, /2026-10-30:101010/);
  assert.match(bits.membersBits, /2026-10-31:100000/);
  if (process.env.ADMIN_EVENT_SCREENSHOTS) {
    await fs.mkdir(process.env.ADMIN_EVENT_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.ADMIN_EVENT_SCREENSHOTS, 'calendar-1280.png') });
  }
  await page.evaluate(async () => { await loadEvents('fixture', false, { list: window.fixtureEvents }); });
  assert.equal(await page.locator('#eventSelectDropdown').inputValue(), 'fixture-second', 'Selection and detail restored together');
  await page.locator('#eventSelectDropdown').selectOption('');
  assert.equal(await page.locator('#eventSelectionEmpty').isVisible(), true);
  assert.equal(await page.locator('#eventGanttWrap').isVisible(), false);
  assert.equal(await page.evaluate(() => eventSelectedId), '');

  const screenshots = process.env.ADMIN_EVENT_SCREENSHOTS;
  if (screenshots) await fs.mkdir(screenshots, { recursive: true });
  await page.evaluate(() => {
    document.getElementById('eventModal').classList.remove('show'); document.getElementById('eventModal').style.display = 'none';
    const admin = document.getElementById('adminModal'); admin.classList.add('show'); admin.style.display = 'flex';
    renderVacationRows(window.fixtureEvents, 'fixture');
  });
  // 領域を往復しても、保存前の入力を勝手に再取得で消さない。
  await page.locator('[data-area="communication"]').click();
  await page.locator('#vacationTitle').fill('編集途中のイベント');
  await page.locator('.tab-btn[data-tab="notices"]').click();
  await page.locator('.notice-edit-title').first().fill('編集途中のお知らせ');
  await page.locator('[data-area="tools"]').click();
  await page.locator('.tool-edit-title').first().fill('編集途中のツール');
  await page.locator('[data-area="communication"]').click();
  assert.equal(await page.locator('#vacationTitle').inputValue(), '編集途中のイベント');
  await page.locator('.tab-btn[data-tab="notices"]').click();
  assert.equal(await page.locator('.notice-edit-title').first().inputValue(), '編集途中のお知らせ');
  await page.locator('[data-area="tools"]').click();
  assert.equal(await page.locator('.tool-edit-title').first().inputValue(), '編集途中のツール');
  await page.evaluate(() => { closeAdminModal(); openAdminModal(); });
  assert.equal(await page.locator('.tool-edit-title').first().inputValue(), '編集途中のツール', 'Reopening management retains same-office edit');
  // 全作業・全テーマを通り、孤立したパステル色と横はみ出しを検出する。
  for (const theme of ['pastel', 'classic', 'metallic', 'forest', 'sakura', 'monochrome']) {
    await page.evaluate(theme => { document.documentElement.dataset.appearance = theme; }, theme);
    for (const width of [360, 820, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const area of ['roster', 'communication', 'tools', 'board', 'access']) {
        await page.locator(`[data-area="${area}"]`).click();
        const pages = await page.locator('.admin-tabs .tab-btn:visible').evaluateAll(buttons => buttons.map(button => button.dataset.tab));
        for (const tab of pages) {
          assert.equal(await page.locator(`.admin-tabs [data-tab="${tab}"]`).isVisible(), true, JSON.stringify(await page.locator('.admin-tabs button').evaluateAll(buttons => buttons.map(button => ({ tab: button.dataset.tab, area: button.dataset.area, cls: button.className })))));
          await page.locator(`.admin-tabs [data-tab="${tab}"]`).click();
          // 各領域のネットワークfixtureは全て同期Promise。動的描画完了を待つ。
          await page.waitForTimeout(40);
          const overflow = await page.locator('#adminModal .admin-card-body').evaluate(card => card.scrollWidth > card.clientWidth + 1);
          if (overflow && screenshots) await page.screenshot({ path: path.join(screenshots, 'overflow.png') });
          const protrusions = overflow ? await page.locator('#adminModal .tab-panel.active').evaluate(panel => [...panel.querySelectorAll('*')].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > panel.getBoundingClientRect().right + 1).slice(0, 8).map(el => ({ class: el.className, tag: el.tagName, width: el.getBoundingClientRect().width }))) : [];
          assert.equal(overflow, false, `Admin card overflow ${theme}/${width}/${tab}: ${JSON.stringify(protrusions)}`);
          if (tab === 'members' && width === 360) {
            const fits = await page.locator('#memberTableBody tr[data-member-id]').evaluateAll(rows => rows.every(row => [...row.children].every(cell => cell.getBoundingClientRect().right <= row.getBoundingClientRect().right + 1)));
            assert.equal(fits, true, `Member card fields fit at ${theme}/${width}`);
            assert.equal(await page.locator('.member-table-wrap').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'Mobile roster does not require horizontal scrolling');
          }
          if (['notices', 'tools'].includes(tab)) {
            const palette = await page.locator(tab === 'notices' ? '.notice-edit-item' : '.tool-edit-item').first().evaluate(el => ({ actual: getComputedStyle(el).backgroundColor, expected: getComputedStyle(el).getPropertyValue('--ui-section-surface').trim() }));
            const expected = await page.evaluate(color => { const element = document.createElement('span'); element.style.backgroundColor = color; document.body.append(element); const result = getComputedStyle(element).backgroundColor; element.remove(); return result; }, palette.expected);
            assert.equal(palette.actual, expected, `${tab} editor follows theme ${theme}`);
          }
          if (screenshots && ['events', 'notices', 'columns', 'members'].includes(tab) && [360, 1280].includes(width)) await page.screenshot({ path: path.join(screenshots, `${theme}-${tab}-${width}.png`) });
        }
      }
    }
  }
  assert.equal(await page.locator('.tab-btn[data-tab="offices"]').isVisible(), false, 'Own-office admin cannot open cross-office management');
  await page.evaluate(() => { CURRENT_ROLE = 'superAdmin'; updateAdminNavigation('access'); });
  assert.equal(await page.locator('.tab-btn[data-tab="offices"]').isVisible(), true);
  await page.locator('.tab-btn[data-tab="offices"]').click();
  assert.equal(await page.locator('#tabOffices').isVisible(), true);
  assert.equal(await page.locator('#adminModal .admin-card-body').evaluate(card => card.scrollWidth <= card.clientWidth + 1), true);
  page.on('dialog', dialog => dialog.accept());
  await page.evaluate(async () => {
    for (const item of [...cachedVacationList]) { fillVacationForm(item); await handleVacationDelete(); }
  });
  assert.equal(await page.locator('#eventBtn').isVisible(), false, 'Deleting last event hides main button');
  assert.equal(await page.locator('#vacationListBody article').count(), 0);
  assert.equal(await page.evaluate(() => eventSelectedId), '');
  assert.deepEqual(errors, []);
  assert(externalActions.every(action => ['publicListOffices', 'getTools'].includes(action)), 'All edit requests use in-memory mock, never shared D1');
  console.log('Event/admin checks passed: first creation, flags, selection/restore/clear, compact dates, every group hover, keyboard, 6 themes × 3 widths × all management pages.');
  await page.close();
}
