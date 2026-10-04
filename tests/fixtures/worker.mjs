/** Worker試験用の匿名データとDBモック。実D1と外部通信を使用しない。 */
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../CloudflareWorkers_worker.js', import.meta.url), 'utf8');
export const worker = (await import(`data:text/javascript;base64,${Buffer.from(source + '\n//# sourceURL=local-worker-fixture.mjs').toString('base64')}`)).default;
export const fixture = Object.freeze({ office: 'test-office', secret: 'local-test-secret' });
export const member = Object.freeze({ id: 'm-test', name: '試験利用者', status: '在席', updated: 100, custom_fields: '{}' });

/**
 * ローカルだけのWorker署名トークンを作成する。
 * @param {Object} payload 試験用claims
 * @returns {Promise<string>} 署名済みtoken
 */
export async function token(payload = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ office: fixture.office, role: 'user', exp: Math.floor(Date.now() / 1000) + 60, ...payload })}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(fixture.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${data}.${Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))).toString('base64url')}`;
}

/**
 * 読取だけのDBモック。予期しない書込みは即座に例外にする。
 * @param {boolean} failReads 読取障害を発生させるか
 * @returns {Object} DB binding、クエリ記録
 */
export function database(failReads = false) {
  const reads = [];
  return {
    reads,
    prepare(sql) {
      let params = [];
      const read = () => {
        reads.push({ sql, params });
        if (failReads) throw new Error('local simulated database failure');
      };
      return {
        bind(...values) { params = values; return this; },
        async first() { read(); return null; },
        async all() { read(); return { results: sql.includes('FROM members') ? [member] : [] }; },
        async run() { throw new Error('Writes are forbidden in this fixture'); }
      };
    },
    async batch() { throw new Error('Writes are forbidden in this fixture'); }
  };
}

/**
 * Worker.fetchをローカルで実行する。
 * @param {Object} params action等の入力
 * @param {Object} db DBモック
 * @returns {Promise<Response>} 応答
 */
export function request(params, db = database()) {
  return worker.fetch(new Request('https://local.invalid', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: params })
  }), { DB: db, SESSION_SECRET: fixture.secret }, { waitUntil() {} });
}
