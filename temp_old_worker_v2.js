// ????????????loudflare Worker??resence-proxy?? index.js?????????
// ??GAS???????????URL??? POST ???????
// ??CORS: takahiyo.github.io ???????????https://presence-proxy-test.taka-hiyo.workers.dev/
// ????????????? no-store??ogin/renew?? role/office/officeName ?????????????
export default {
  async fetch(req, env, ctx) {
    const GAS_ENDPOINT = env.GAS_ENDPOINT || "https://script.google.com/macros/s/AKfycbwh5BvyQmn14gU-OREIHULyaQ166zF6ByoOf9AlRDiGT10QVBttYPrWY78uQYjyo5ms/exec";
    const ORIGIN = new URL(req.url).origin;
    const origin = req.headers.get('origin') || '';

    // CORS ??????
    const ALLOW_ORIGINS = new Set([
      'https://takahiyo.github.io'
    ]);
    const allowOrigin = ALLOW_ORIGINS.has(origin) ? origin : '';

    // Preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': allowOrigin || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

    // ????????application/x-www-form-urlencoded ?????????GAS??
    const body = await req.text();

    // GAS??????
    const r = await fetch(GAS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      // Cloudflare ?????????????????
      cf: { cacheTtl: 0, cacheEverything: false }
    });

    // JSON???????????????
    const ct = r.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('application/json')) {
      return new Response(JSON.stringify({ error: 'upstream_bad_content_type' }), {
        status: 502,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': allowOrigin || '*',
          'cache-control': 'no-store'
        }
      });
    }

    const json = await r.json();

    // ???? no-store + CORS ?????
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': allowOrigin || '*',
        'cache-control': 'no-store'
      }
    });
  }
};
