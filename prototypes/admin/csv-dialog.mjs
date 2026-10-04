/**
 * csv-dialog.mjs - ファイル検証→差分確認→下書き反映。保存APIは受け取らない。
 * 依存: csv/constants/view-utils。参照元: app.mjs。dialog/名簿への作用は注入する。
 */
import { createRosterCsv, decodeCsvFile } from './csv.mjs';
import { CSV_ENCODINGS } from './constants.mjs';
import { escapeHtml as escape } from './view-utils.mjs';

/** @param {object} config UIと名簿の依存 @returns {void} ローカルCSV操作だけを開く */
export function openCsvDialog({ service, openDialog, closeDialog, getDraft, apply, announce }) {
  const csv = createRosterCsv(service);
  openDialog('CSV入出力', `<p>取込みは名簿全体の置換です。現在の下書きと比較し、反映前に削除・在席情報の変更を確認できます。</p><button id="csv-export" type="button">現在の下書きをCSVで書き出す</button><div class="csv-input"><label>文字コード<select id="csv-encoding">${CSV_ENCODINGS.map(item => `<option value="${item.value}">${item.label}</option>`).join('')}</select></label><label>CSVファイル（試作では2MiB・2000名まで）<input id="csv-file" type="file" accept=".csv,text/csv"></label></div><div id="csv-result" aria-live="polite"><p class="hint">ファイルを選ぶと、検証結果と差分を表示します。</p></div><div class="dialog-actions"><button data-close type="button">閉じる</button><button id="csv-apply" type="button" class="primary" disabled>名簿の下書きを置換</button></div>`);
  const dialog = document.querySelector('dialog[open]');
  const fileInput = dialog.querySelector('#csv-file'), encoding = dialog.querySelector('#csv-encoding');
  const result = dialog.querySelector('#csv-result'), applyButton = dialog.querySelector('#csv-apply');
  let generation = 0, preview = null;

  /** @returns {Promise<void>} 遅い旧ファイルの読込み結果を新しい選択へ適用しない */
  async function inspectFile() {
    const token = ++generation, file = fileInput.files[0];
    preview = null; applyButton.disabled = true;
    if (!file) { result.innerHTML = '<p class="hint">ファイルを選択してください。</p>'; return; }
    result.textContent = 'CSVを読み込み、検証しています…';
    try {
      const text = await decodeCsvFile(file, encoding.value);
      if (token !== generation || !fileInput.isConnected || !dialog.open) return;
      preview = csv.previewImport(text, getDraft());
      if (preview.errors.length) {
        result.innerHTML = `<div class="form-error" role="alert"><h3>取込みできません</h3><ul class="change-list">${preview.errors.map(message => `<li>${escape(message)}</li>`).join('')}</ul></div>`;
        return;
      }
      const { summary, changes, warnings } = preview;
      result.innerHTML = `<h3>検証完了 · ${summary.total}名 / ${summary.groups}グループ</h3><p>追加 ${summary.added}名 · 削除 ${summary.removed.length}名 · 差分 ${changes.length}件</p><p class="hint">CSVの在席・業務時間・戻り時間・明日の予定・備考も置換対象です。</p>${warnings.length ? `<ul class="change-list">${warnings.map(message => `<li>${escape(message)}</li>`).join('')}</ul>` : ''}${changes.length ? `<ul class="change-list">${changes.map(message => `<li>${escape(message)}</li>`).join('')}</ul>` : '<p>現在の下書きからの変更はありません。</p>'}${summary.removed.length ? `<div class="csv-deletions"><h3>削除対象</h3><ul class="change-list">${summary.removed.map(member => `<li>${escape(member.name)}（ID: ${escape(member.id)}）</li>`).join('')}</ul><label class="confirm-target"><input id="csv-delete-confirm" type="checkbox">CSVに含まれない${summary.removed.length}名を下書きから削除することを確認しました</label></div>` : ''}`;
      applyButton.disabled = !changes.length || Boolean(summary.removed.length);
      result.querySelector('#csv-delete-confirm')?.addEventListener('change', event => { applyButton.disabled = !event.target.checked || !changes.length; });
    } catch (error) {
      if (token !== generation || !fileInput.isConnected || !dialog.open) return;
      result.innerHTML = `<p class="form-error" role="alert">${escape(error.message)}</p>`;
    }
  }

  fileInput.addEventListener('change', inspectFile); encoding.addEventListener('change', inspectFile);
  applyButton.addEventListener('click', () => {
    if (applyButton.disabled || !preview?.roster) return;
    apply(preview.roster); closeDialog(); announce('CSVの内容を名簿の下書きに反映しました。試作内での確定はまだ行っていません。');
  });
  dialog.querySelector('#csv-export').addEventListener('click', () => {
    const blob = new Blob([csv.exportRoster(getDraft())], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'whereabouts-sample.csv'; document.body.append(link); link.click();
    setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 0);
  });
}
