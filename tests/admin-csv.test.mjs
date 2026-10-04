/** 置換前検証・削除検知・CSV互換を共有DBなしで再現する。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRosterCsv, decodeCsvFile } from '../prototypes/admin/csv.mjs';
import { FIXTURE, CSV_LIMITS } from '../prototypes/admin/constants.mjs';
import { copyRoster, diffRoster } from '../prototypes/admin/model.mjs';
import { csvService } from './fixtures/csv.mjs';

const csv = createRosterCsv(csvService);
const build = rows => [csvService.toCsvRow([csvService.format.title]), csvService.toCsvRow(csvService.format.header), ...rows.map(row => csvService.toCsvRow(row))].join('\n');
const record = (overrides = {}) => {
  const values = { gi: '1', group: '営業', mi: '1', id: 'sample-1', name: '佐藤 花子', ext: '201', mobile: '', email: '', workHours: '', status: '在席', time: '', tomorrowPlan: '午前は外出', note: '', ...overrides };
  return Object.values(values);
};

test('現行13列CSVを書出し・再読込みでき、ID/所属/明日の予定を保持する', () => {
  const current = copyRoster(FIXTURE), text = csv.exportRoster(current), result = csv.previewImport(text, current);
  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.changes, []);
  assert.equal(result.roster.members.find(member => member.id === 'sample-1').tomorrowPlan, '午前は外出');
  assert.equal(result.roster.members.find(member => member.id === 'sample-1').group, 'sample-sales');
});

test('置換による削除と在席/予定の変更を差分に明示し、検証だけでは原稿を変更しない', () => {
  const current = copyRoster(FIXTURE), before = copyRoster(current);
  const result = csv.previewImport(build([record({ tomorrowPlan: '終日外出', status: '外出' })]), current);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.removed.length, 5);
  assert.match(result.changes.join('\n'), /明日の予定: 午前は外出 → 終日外出/);
  assert.match(diffRoster(current, result.roster).join('\n'), /ステータス: 在席 → 外出/);
  assert.deepEqual(current, before);
});

test('重複ID/所属番号と名称の不整合/順序重複は全体を拒否する', () => {
  for (const second of [record({ mi: '2' }), record({ mi: '2', id: 'other', group: '開発' }), record({ gi: '2', id: 'other' }), record({ id: 'other' })]) {
    const result = csv.previewImport(build([record(), second]), FIXTURE);
    assert(result.errors.some(message => message.startsWith('4行目:')));
    assert.equal(result.roster, null);
  }
});

test('閉じない引用符/閉じた後の文字/引用符の位置が不正なCSVを拒否する', () => {
  for (const text of ['a,"unterminated', '"a"suffix,b', 'a"bad,b']) {
    const result = csv.previewImport(text, FIXTURE);
    assert.match(result.errors[0], /引用符/);
    assert.equal(result.roster, null);
  }
});

test('引用された複数行/CRLF/空欄を保持し、後続の不正行は物理行番号で示す', () => {
  const text = build([record({ note: '一行目\n二行目, "引用"' }), record({ id: 'other', mi: '2', ext: 'invalid' })]).replaceAll('\n', '\r\n');
  const result = csv.previewImport(text, FIXTURE);
  assert.match(result.errors[0], /^5行目:.*内線/);
  const valid = csv.previewImport(build([record({ note: '一行目\n二行目, "引用"' })]), FIXTURE);
  assert.equal(valid.roster.members[0].note, '一行目\n二行目, "引用"');
});

test('空/ヘッダのみ/列数不足/不正順序/空名称と不正な連絡先で置換しない', () => {
  for (const text of ['', build([]), build([['short']]), build([record({ gi: '-1' })]), build([record({ name: ' ' })]), build([record({ mobile: '12' })]), build([record({ email: 'bad' })])]) {
    const result = csv.previewImport(text, FIXTURE);
    assert(result.errors.length > 0);
    assert.equal(result.roster, null);
  }
});

test('ID省略は新規扱いを警告し、同一IDのCSV外属性は保持する', () => {
  const current = copyRoster(FIXTURE); current.members[0].custom = '保持';
  const existing = csv.previewImport(build([record({ name: '  佐藤 花子  ' })]), current);
  assert.equal(existing.roster.members[0].custom, '保持');
  assert.equal(existing.roster.members[0].name, '佐藤 花子');
  const added = csv.previewImport(build([record({ id: '' })]), current, () => 'new-member');
  assert.equal(added.summary.added, 1);
  assert.equal(added.summary.removed.length, current.members.length);
  assert.match(added.warnings[0], /新規メンバー/);
});

test('書出しの数式対策を共通処理で維持し、IDの特殊文字を勝手に変更しない', () => {
  const current = copyRoster(FIXTURE);
  current.members[0].name = '=1+1'; current.members[0].id = 'quoted"id,[]';
  const result = csv.previewImport(csv.exportRoster(current), current);
  assert.equal(result.roster.members[0].name, "'=1+1");
  assert.equal(result.roster.members[0].id, 'quoted"id,[]');
});

test('UTF-8不正バイトと過大ファイルを読込み前に拒否し、Shift_JISは明示選択で読む', async () => {
  await assert.rejects(decodeCsvFile(new File([new Uint8Array([0x82, 0xa0])], 'sjis.csv'), 'utf-8'), /文字コード/);
  assert.equal(await decodeCsvFile(new File([new Uint8Array([0x82, 0xa0])], 'sjis.csv'), 'shift_jis'), 'あ');
  await assert.rejects(decodeCsvFile({ size: CSV_LIMITS.bytes + 1, arrayBuffer() { throw new Error('読んではいけない'); } }, 'utf-8'), /2MiB/);
});

test('過多行は候補名簿を作らず、連絡先エラーも表示上限で打ち切る', () => {
  const many = count => Array.from({ length: count }, (_, index) => record({ id: `row-${index}`, mi: String(index + 1), ext: 'invalid' }));
  const tooMany = csv.previewImport(build(many(CSV_LIMITS.members + 1)), FIXTURE);
  assert.match(tooMany.errors[0], /2000名以内/);
  const bad = csv.previewImport(build(many(CSV_LIMITS.issues + 5)), FIXTURE);
  assert.equal(bad.roster, null);
  assert.equal(bad.errors.length, CSV_LIMITS.issues + 1);
});

test('共通形式の公開後も既存CSV書出しのタイトル/列/フォールバックは同一', () => {
  const text = csvService.makeNormalizedCSV({ groups: [{ title: '営業', members: [{ id: 'test', name: '試験' }] }] }, { test: { mobile: '09012345678', email: 'sample@example.invalid', tomorrowPlan: '午後外出' } });
  assert.equal(text, '在席管理CSV\nグループ番号,グループ名,表示順,id,氏名,内線,携帯番号,Email,業務時間,ステータス,戻り時間,明日の予定,備考\n1,営業,1,test,試験,,09012345678,sample@example.invalid,,在席,,午後外出,');
});
