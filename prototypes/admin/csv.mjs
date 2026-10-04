/**
 * csv.mjs - CSV置換の事前検証と候補名簿。通信/DB/ストレージは使わない。
 * 依存: model/constantsと注入された既存CsvService。参照元: app.mjs、CSV試験。
 */
import { CSV_LIMITS } from './constants.mjs';
import { copyRoster, putMember, diffRoster } from './model.mjs';

/** @param {string} source CSV @returns {number[]} 各レコードの開始行。曖昧な引用符を先に拒否 */
function validateQuotes(source) {
  const text = source.replace(/^\uFEFF/, '');
  const starts = [1];
  let state = 'start', line = 1;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') i++;
        else state = 'closed';
      }
    } else if (char === '"') {
      if (state !== 'start') throw new Error(`${line}行目: 引用符の位置が不正です。`);
      state = 'quoted';
    } else if (char === ',') state = 'start';
    else if (char !== '\r' && char !== '\n') {
      if (state === 'closed') throw new Error(`${line}行目: 閉じた引用符の後に文字があります。`);
      state = 'plain';
    }
    if (char === '\r' || char === '\n') {
      line++;
      if (char === '\r' && text[i + 1] === '\n') i++;
      if (state !== 'quoted') { state = 'start'; starts.push(line); }
    }
  }
  if (state === 'quoted') throw new Error(`${line}行目: 引用符が閉じられていません。`);
  return starts;
}

/** @param {File} file 選択ファイル @param {string} encoding 文字コード @returns {Promise<string>} 不正な文字コード/過大ファイルを拒否 */
export async function decodeCsvFile(file, encoding) {
  if (file.size > CSV_LIMITS.bytes) throw new Error('試作では2MiB以内のCSVを選択してください。');
  const bytes = await file.arrayBuffer();
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error('選択した文字コードで読めません。UTF-8 / Shift_JISを確認してください。'); }
}

/** @param {object} service 既存の純粋CSV処理 @returns {object} 試作用の検証/書出し関数 */
export function createRosterCsv(service) {
  const { format, parseCSV, makeNormalizedCSV } = service;

  /** @param {object} roster 名簿 @returns {string} 現行13列形式のCSV（数式対策は共通処理） */
  function exportRoster(roster) {
    const cfg = { groups: roster.groups.map(group => ({ title: group.name, members: roster.members.filter(member => member.group === group.id) })) };
    return '\uFEFF' + makeNormalizedCSV(cfg, Object.fromEntries(roster.members.map(member => [member.id, member])));
  }

  /** @param {string} text CSV @param {object} current 下書き @param {Function} makeId 新規ID生成 @returns {object} 検証結果・候補・最終差分 */
  function previewImport(text, current, makeId = () => crypto.randomUUID()) {
    const result = { errors: [], warnings: [], roster: null, changes: [], summary: null };
    try {
      if (new TextEncoder().encode(text).length > CSV_LIMITS.bytes) throw new Error('試作では2MiB以内のCSVを使用してください。');
      const starts = validateQuotes(text), rows = parseCSV(text);
      if (!rows.length || rows[0].length !== 1 || rows[0][0].trim() !== format.title) throw new Error('1行目: 「在席管理CSV」のタイトルが必要です。');
      if (rows[1]?.length !== format.header.length || format.header.some((value, index) => rows[1][index].trim() !== value)) throw new Error('2行目: 現行CSVの13列ヘッダと一致しません。');
      const records = rows.slice(2).map((cells, index) => ({ cells, line: starts[index + 2] })).filter(({ cells }) => cells.some(value => value.trim()));
      if (!records.length) throw new Error('メンバーが0名です。空のCSVで名簿を置換できません。');
      if (records.length > CSV_LIMITS.members) throw new Error(`試作では${CSV_LIMITS.members}名以内のCSVを使用してください。`);
      const incomingIds = new Set(), numbers = new Map(), names = new Map(), positions = new Set(), parsed = [];
      for (const { cells, line } of records) {
        if (result.errors.length >= CSV_LIMITS.issues) { result.errors.push('エラーが多数あります。先の行を修正して再検証してください。'); break; }
        try {
          if (cells.length !== format.header.length) throw new Error('13列でないデータ行です。');
          const [gi, rawGroup, mi, rawId, name, ext, mobile, email, workHours, status, time, tomorrowPlan, note] = cells;
          if (![gi, mi].every(value => /^\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value)) && Number(value) > 0)) throw new Error('グループ番号・表示順は正の整数が必要です。');
          const groupName = rawGroup.trim(), number = Number(gi), position = Number(mi);
          if (!groupName) throw new Error('グループ名を入力してください。');
          if (numbers.has(number) && numbers.get(number) !== groupName) throw new Error('同じグループ番号に異なる名称があります。');
          if (names.has(groupName) && names.get(groupName) !== number) throw new Error('同じグループ名に異なる番号があります。');
          const key = JSON.stringify([number, position]);
          if (positions.has(key)) throw new Error('同じグループ内の表示順が重複しています。');
          const id = rawId.trim() || makeId();
          if (incomingIds.has(id)) throw new Error(`ID「${id}」が重複しています。`);
          incomingIds.add(id); numbers.set(number, groupName); names.set(groupName, number); positions.add(key);
          if (!rawId.trim()) result.warnings.push(`${line}行目: ID未指定のため新規メンバーとして扱います。`);
          parsed.push({ number, position, groupName, id, name, ext, mobile, email, workHours, status: status || format.defaultStatus, time, tomorrowPlan, note, line });
        } catch (error) { result.errors.push(`${line}行目: ${error.message}`); }
      }
      if (result.errors.length) return result;
      const candidate = { groups: [...numbers].sort(([a], [b]) => a - b).map(([, name]) => ({ id: current.groups.find(group => group.name === name)?.id || makeId(), name })), members: [] };
      for (const record of parsed.sort((a, b) => a.number - b.number || a.position - b.position)) {
        if (result.errors.length >= CSV_LIMITS.issues) { result.errors.push('エラーが多数あります。先の行を修正して再検証してください。'); break; }
        try {
          const group = candidate.groups.find(group => group.name === record.groupName).id;
          // CSVにない追加属性は同一IDだけから保持。CSVの在席/予定列は明示的な置換対象。
          const previous = current.members.find(member => member.id === record.id);
          const { number, position, groupName, line, ...fields } = record;
          const member = putMember(candidate, { ...fields, group }, record.id);
          candidate.members[candidate.members.length - 1] = { ...copyRoster(previous || {}), ...fields, ...member };
        } catch (error) { result.errors.push(`${record.line}行目: ${error.message}`); }
      }
      if (result.errors.length) return result;
      result.roster = candidate;
      result.changes = diffRoster(current, candidate);
      result.summary = { total: candidate.members.length, added: candidate.members.filter(member => !current.members.some(item => item.id === member.id)).length, removed: current.members.filter(member => !candidate.members.some(item => item.id === member.id)).map(member => ({ id: member.id, name: member.name })), groups: candidate.groups.length };
    } catch (error) { result.errors.push(error.message); }
    return result;
  }
  return { exportRoster, previewImport };
}
