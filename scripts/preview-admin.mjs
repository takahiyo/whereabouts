/**
 * preview-admin.mjs - 依存追加なしのローカル管理GUIプレビューサーバー。
 * 依存: Node標準API。参照元: docs/ADMIN_GUI_PROTOTYPE.md。
 * localhostのみで静的配信し、書込API・DB処理は提供しない。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const MIME = Object.freeze({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' });
const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/prototypes/admin/index.html' : pathname));
    const relative = path.relative(root, filename);
    const type = MIME[path.extname(filename)];
    if (relative.startsWith('..') || path.isAbsolute(relative) || !type || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(filename));
  } catch { response.writeHead(400); response.end(); }
});
server.listen(0, '127.0.0.1', () => console.log(`Admin GUI preview: http://127.0.0.1:${server.address().port}/prototypes/admin/index.html`));
