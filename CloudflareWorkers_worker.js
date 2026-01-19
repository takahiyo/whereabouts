/**
 * Cloudflare Worker for Whereabouts Board (Firestore Backend)
 * FIXED VERSION
 */

export default {
  async fetch(req, env, ctx) {

    const corsHeaders = {
      'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'method_not_allowed' }),
        { status: 405, headers: corsHeaders }
      );
    }

    try {
      /* =========================================================
         Request body parsing（1回のみ）
      ========================================================= */
      const contentType = (req.headers.get('content-type') || '').toLowerCase();
      let body = {};
      const rawText = await req.text();

      if (rawText) {
        if (contentType.includes('application/json')) {
          body = JSON.parse(rawText);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(rawText);
          for (const [k, v] of params) body[k] = v;
        } else {
          try {
            body = JSON.parse(rawText);
          } catch {
            const params = new URLSearchParams(rawText);
            for (const [k, v] of params) body[k] = v;
          }
        }
      }

      const formData = {
        get: (key) => (body[key] !== undefined ? String(body[key]) : null),
        _raw: body
      };

      /* =========================================================
         ★★ ここが最重要修正点 ★★
         tokenOffice / tokenRole を action 分岐前に定義
      ========================================================= */
      const action = formData.get('action');
      const tokenOffice = formData.get('tokenOffice') || '';
      const tokenRole = formData.get('tokenRole') || '';

      /* =========================================================
         Auth / Firestore setup
      ========================================================= */
      const accessToken = await getGoogleAuthToken(env);
      const projectId = env.FIREBASE_PROJECT_ID;
      const baseUrl =
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

      const firestoreFetch = async (path) => {
        const res = await fetch(`${baseUrl}/${path}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.status !== 200) {
          const j = await res.json();
          throw new Error(`Firestore Error ${res.status}: ${JSON.stringify(j)}`);
        }
        return res.json();
      };

      const firestoreFetchOptional = async (path) => {
        const res = await fetch(`${baseUrl}/${path}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.status === 404) return null;
        if (res.status !== 200) {
          const j = await res.json();
          throw new Error(`Firestore Error ${res.status}: ${JSON.stringify(j)}`);
        }
        return res.json();
      };

      /* =========================================================
         KV
      ========================================================= */
      const statusCache = env.STATUS_CACHE;
      const statusCacheTtlSec = Number(env.STATUS_CACHE_TTL_SEC || 60);

      const statusCacheKey = (office) => `status:${office}`;

      /* =========================================================
         Helpers
      ========================================================= */
      const roleIsOfficeAdmin = (role) =>
        role === 'officeAdmin' || role === 'superAdmin';

      const canAdminOffice = (role, tokenOffice, office) =>
        role === 'superAdmin' ||
        (role === 'officeAdmin' && tokenOffice === office);

      /* =========================================================
         LOGIN
      ========================================================= */
      if (action === 'login') {
        const officeId = formData.get('office');
        const password = formData.get('password');

        const json = await firestoreFetch(`offices/${officeId}`);
        const f = json.fields || {};

        let role = '';
        if (password === f.adminPassword?.stringValue) role = 'officeAdmin';
        else if (password === f.password?.stringValue) role = 'user';
        else {
          return new Response(
            JSON.stringify({ error: 'unauthorized' }),
            { headers: corsHeaders }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            role,
            office: officeId,
            officeName: f.name?.stringValue || officeId
          }),
          { headers: corsHeaders }
        );
      }

      /* =========================================================
         getConfig（メイン画面構成）
      ========================================================= */
      if (action === 'getConfig') {
        const officeId = tokenOffice || 'nagoya_chuo';

        const cacheKey = `config_v2:${officeId}`;
        if (statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) {
            return new Response(cached, { headers: corsHeaders });
          }
        }

        const json = await firestoreFetch(
          `offices/${officeId}/members?pageSize=300`
        );

        const members = (json.documents || []).map(doc => {
          const f = doc.fields || {};
          return {
            id: doc.name.split('/').pop(),
            name: f.name?.stringValue || '',
            group: f.group?.stringValue || '',
            order: Number(f.order?.integerValue || 0),
            status: f.status?.stringValue || '',
            time: f.time?.stringValue || '',
            note: f.note?.stringValue || '',
            workHours: f.workHours?.stringValue || '',
            ext: f.ext?.stringValue || ''
          };
        });

        const groupsMap = {};
        members.sort((a, b) => a.order - b.order).forEach(m => {
          if (!groupsMap[m.group]) {
            groupsMap[m.group] = { title: m.group, members: [] };
          }
          groupsMap[m.group].members.push(m);
        });

        const responseBody = JSON.stringify({
          ok: true,
          groups: Object.values(groupsMap),
          updated: Date.now()
        });

        if (statusCache) {
          ctx.waitUntil(
            statusCache.put(cacheKey, responseBody, {
              expirationTtl: statusCacheTtlSec
            })
          );
        }

        return new Response(responseBody, { headers: corsHeaders });
      }

      /* =========================================================
         publicListOffices（公開拠点一覧）
      ========================================================= */
      if (action === 'publicListOffices') {
        try {
          const json = await firestoreFetch('offices?pageSize=300');
          const offices = [];
          
          (json.documents || []).forEach(doc => {
            const f = doc.fields || {};
            const officeId = doc.name.split('/').pop();
            const isPublic = f.public?.booleanValue === true;
            
            // 公開設定されている拠点のみ返す
            if (isPublic) {
              offices.push({
                id: officeId,
                name: f.name?.stringValue || officeId
              });
            }
          });

          return new Response(
            JSON.stringify({ ok: true, offices }),
            { headers: corsHeaders }
          );
        } catch (err) {
          console.error('publicListOffices error:', err);
          return new Response(
            JSON.stringify({ ok: false, error: err.message, offices: [] }),
            { headers: corsHeaders }
          );
        }
      }

      /* =========================================================
         listOffices（全拠点一覧 - 管理者用）
      ========================================================= */
      if (action === 'listOffices') {
        // スーパー管理者のみアクセス可能
        if (tokenRole !== 'superAdmin') {
          return new Response(
            JSON.stringify({ ok: false, error: 'unauthorized' }),
            { headers: corsHeaders }
          );
        }

        try {
          const json = await firestoreFetch('offices?pageSize=300');
          const offices = [];
          
          (json.documents || []).forEach(doc => {
            const f = doc.fields || {};
            const officeId = doc.name.split('/').pop();
            offices.push({
              id: officeId,
              name: f.name?.stringValue || officeId
            });
          });

          return new Response(
            JSON.stringify({ ok: true, offices }),
            { headers: corsHeaders }
          );
        } catch (err) {
          console.error('listOffices error:', err);
          return new Response(
            JSON.stringify({ ok: false, error: err.message, offices: [] }),
            { headers: corsHeaders }
          );
        }
      }

      /* =========================================================
         get（在席データ）
      ========================================================= */
      if (action === 'get') {
        const officeId = tokenOffice || 'nagoya_chuo';
        const cacheKey = statusCacheKey(officeId);

        if (statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) {
            return new Response(cached, { headers: corsHeaders });
          }
        }

        const json = await firestoreFetch(
          `offices/${officeId}/members?pageSize=300`
        );

        const data = {};
        (json.documents || []).forEach(doc => {
          const f = doc.fields || {};
          data[doc.name.split('/').pop()] = {
            status: f.status?.stringValue || '',
            time: f.time?.stringValue || '',
            note: f.note?.stringValue || '',
            workHours: f.workHours?.stringValue || ''
          };
        });

        const responseBody = JSON.stringify({
          ok: true,
          data,
          maxUpdated: Date.now()
        });

        if (statusCache) {
          ctx.waitUntil(
            statusCache.put(cacheKey, responseBody, {
              expirationTtl: statusCacheTtlSec
            })
          );
        }

        return new Response(responseBody, { headers: corsHeaders });
      }

      /* =========================================================
         fallback
      ========================================================= */
      return new Response(
        JSON.stringify({ error: 'unknown_action', action }),
        { headers: corsHeaders }
      );

    } catch (e) {
      console.error('[Worker Error]', e.message, e.stack);
      return new Response(
        JSON.stringify({
          ok: false,
          error: e.message,
          timestamp: Date.now()
        }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};

/* =========================================================
   Google Auth
========================================================= */
async function getGoogleAuthToken(env) {
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;

  const binaryDer = Uint8Array.from(
    atob(pem.split('-----')[2].replace(/\s/g, '')),
    c => c.charCodeAt(0)
  );

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = btoa(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claim}`)
  );

  const strSig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:
        `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` +
        `&assertion=${header}.${claim}.${strSig}`
    }
  );

  return (await res.json()).access_token;
}
