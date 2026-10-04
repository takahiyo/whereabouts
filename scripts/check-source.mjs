/**
 * check-source.mjs - 配信ファイルの参照とJavaScript構文をネットワークなしで検証する。
 * 依存: Node.js標準ライブラリ。参照元: npm run check。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const classicScripts = [];
const scripts = [...html.matchAll(/<script\b([^>]*?)src="([^"]+)"([^>]*)>/g)];
const styles = [...html.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/g)];
for (const url of [...scripts.map(m => m[2]), ...styles.map(m => m[1])]) {
  if (/^(?:https?:|data:)/.test(url)) continue;
  const local = url.split(/[?#]/)[0];
  if (!fs.existsSync(path.join(root, local))) throw new Error(`Missing asset: ${local}`);
}
for (const [, before, url, after] of scripts) {
  if (/^https?:/.test(url)) continue;
  const filename = url.split(/[?#]/)[0];
  const source = fs.readFileSync(path.join(root, filename), 'utf8');
  if (/type="module"/.test(before + after)) checkModule(source, filename);
  else {
    new vm.Script(source, { filename });
    classicScripts.push(source);
  }
}
// classic script間のトップレベル宣言衝突も検出する。
new vm.Script(classicScripts.join('\n;\n'), { filename: 'combined-classic-scripts.js' });
checkModule(fs.readFileSync(path.join(root, 'CloudflareWorkers_worker.js'), 'utf8'), 'Worker');
new vm.Script(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), { filename: 'sw.js' });
console.log(`Source checks passed: ${scripts.length} scripts, local assets, Worker and legacy SW.`);

/**
 * ES moduleを実行せず構文検証する（外部importやDBへのアクセスを防ぐ）。
 * @param {string} source ソース本文
 * @param {string} filename エラー表示用ファイル名
 * @returns {void}
 */
function checkModule(source, filename) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${filename}: ${result.stderr}`);
}
