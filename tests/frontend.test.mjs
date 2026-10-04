/** フロント側の境界・安全表示をDB接続なしで検証する回帰テスト。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const csvContext = vm.createContext({ window: {} });
vm.runInContext(read('js/services/csv.js'), csvContext);
const csv = csvContext.window.CsvService;
// VM内の配列を標準の配列へ変換し、内容を比較する。
const parse = text => JSON.parse(JSON.stringify(csv.parseCSV(text)));

test('CSV preserves empty quoted fields, trailing columns and blank input', () => {
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse('""'), [['']]);
  assert.deepEqual(parse('a,""'), [['a', '']]);
  assert.deepEqual(parse(','), [['', '']]);
  assert.deepEqual(parse('a,b,'), [['a', 'b', '']]);
});

test('CSV accepts BOM and all common line endings without duplicating rows', () => {
  for (const newline of ['\n', '\r', '\r\n']) {
    assert.deepEqual(parse(`\uFEFFa,b${newline}c,d${newline}`), [['a', 'b'], ['c', 'd']]);
  }
});

test('CSV roundtrip preserves quotes, commas and newlines in cells', () => {
  const cells = ['a"b', 'c,d', 'e\rf', 'g\nh', 'i\r\nj', ''];
  assert.deepEqual(parse(csv.toCsvRow(cells)), [cells]);
});

test('CSV protects formula-like values while preserving normal text', () => {
  for (const value of ['=1+1', '+1', '-1', '@cmd', '  =1', '\ttext', '\rtext', '\ntext']) {
    assert.equal(csv.csvProtectFormula(value), "'" + value);
  }
  assert.equal(csv.csvProtectFormula('normal text'), 'normal text');
});

const tools = vm.createContext({ window: {}, URL, document: { baseURI: 'https://board.example/app/', createElement() { return { textContent: '', get innerHTML() { return this.textContent.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); } }; } } });
vm.runInContext(read('js/constants/ui.js'), tools);
// 本番で使うescapeHtmlそのものを取り込む（notice DOM初期化は実行しない）。
const noticesSource = read('js/notices.js');
vm.runInContext(noticesSource.match(/function escapeHtml\(text\)\s*\{[\s\S]*?\n\}/)[0], tools);
vm.runInContext(read('js/tools.js'), tools);

test('Tool links reject executable schemes and retain existing normal links', () => {
  for (const url of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox(1)']) {
    assert.equal(tools.safeToolUrl(url), '');
  }
  assert.equal(tools.safeToolUrl('https://example.com/'), 'https://example.com/');
  assert.equal(tools.safeToolUrl('../help'), 'https://board.example/help');
  assert.equal(tools.safeToolUrl('mailto:staff@example.com'), 'mailto:staff@example.com');
});

test('Tool notes display HTML as text and escape URL attributes', () => {
  assert.equal(tools.linkifyToolText('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  const html = tools.linkifyToolText('help https://example.com/?a="x"&b=1 <script>');
  assert.match(html, /<a href="https:\/\/example.com\//);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|onerror=/);
});

test('Bare external tool URLs remain external after normalization and safety validation', () => {
  const url = tools.normalizeToolUrlValue('egpass.hatolog.jp');
  assert.equal(tools.safeToolUrl(url), 'https://egpass.hatolog.jp/');
  assert.equal(tools.safeToolUrl(tools.normalizeToolUrlValue('../help')), 'https://board.example/help');
  assert.equal(tools.safeToolUrl(tools.normalizeToolUrlValue('javascript:alert(1)')), '');
});
