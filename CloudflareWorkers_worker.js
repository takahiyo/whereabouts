/**
 * Cloudflare Worker for Whereabouts Board (Firestore Backend)
 * FIXED VERSION (with getVacation)
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

      // 404を許容するフェッチ関数（サブリソース取得用）
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
            const isPublic = f.public?.booleanValue;
            
            // publicフィールドが明示的にfalseの場合のみ除外、それ以外は全て表示
            if (isPublic !== false) {
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
         getVacation（休暇データ取得 - 追加）
      ========================================================= */
      if (action === 'getVacation') {
        // officeパラメータがあればそれを使う（指定がなければトークンの拠点）
        const officeId = formData.get('office') || tokenOffice;
        
        if (!officeId) {
           return new Response(
             JSON.stringify({ ok: false, error: 'office_required' }),
             { headers: corsHeaders }
           );
        }

        try {
          // 404許容のFetchを使用 (コレクションが無い場合も想定)
          const json = await firestoreFetchOptional(`offices/${officeId}/vacations?pageSize=300`);
          
          let vacations = [];
          if (json && json.documents) {
            vacations = json.documents.map(doc => {
               const f = doc.fields || {};
               return {
                 id: doc.name.split('/').pop(),
                 title: f.title?.stringValue || '',
                 startDate: f.startDate?.stringValue || '',
                 endDate: f.endDate?.stringValue || '',
                 color: f.color?.stringValue || '',
                 visible: f.visible?.booleanValue ?? true
               };
            });
            
            // 日付順にソート (開始日昇順)
            vacations.sort((a, b) => {
              if (a.startDate < b.startDate) return -1;
              if (a.startDate > b.startDate) return 1;
              return 0;
            });
          }

          return new Response(
            JSON.stringify({ ok: true, vacations }),
            { headers: corsHeaders }
          );

        } catch(err) {
          console.error('getVacation error:', err);
          return new Response(
            JSON.stringify({ ok: false, error: err.message, vacations: [] }),
            { headers: corsHeaders }
          );
        }
      }

      /* =========================================================
         set（在席データの更新）
      ========================================================= */
      if (action === 'set') {
        // 認証チェック（ログイン済みユーザーのみ）
        if (!tokenOffice) {
          return new Response(
            JSON.stringify({ error: 'unauthorized' }),
            { headers: corsHeaders }
          );
        }

        const officeId = tokenOffice;
        
        // リクエストからデータを取得
        let payload;
        try {
          const dataStr = formData.get('data');
          if (!dataStr) {
            throw new Error('data parameter is required');
          }
          payload = JSON.parse(dataStr);
        } catch (err) {
          return new Response(
            JSON.stringify({ error: 'invalid_data', message: err.message }),
            { headers: corsHeaders }
          );
        }

        // payloadの構造: { updated: timestamp, data: { memberId: { status, time, note, workHours } } }
        const updates = payload.data || {};
        const rev = {};
        const serverUpdated = {};

        try {
          // 各メンバーのステータスを更新
          for (const [memberId, memberData] of Object.entries(updates)) {
            const docPath = `offices/${officeId}/members/${memberId}`;
            
            // Firestoreのフィールド形式に変換
            const fields = {
              status: { stringValue: String(memberData.status || '') },
              time: { stringValue: String(memberData.time || '') },
              note: { stringValue: String(memberData.note || '') },
              workHours: { stringValue: String(memberData.workHours || '') },
              updated: { integerValue: String(Date.now()) }
            };

            // PATCHリクエストでFirestoreを更新
            const updateRes = await fetch(`${baseUrl}/${docPath}?updateMask.fieldPaths=status&updateMask.fieldPaths=time&updateMask.fieldPaths=note&updateMask.fieldPaths=workHours&updateMask.fieldPaths=updated`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ fields })
            });

            if (updateRes.status !== 200) {
              const errorData = await updateRes.json();
              console.error('Firestore update error:', errorData);
              throw new Error(`Failed to update member ${memberId}`);
            }

            // レスポンスデータ
            rev[memberId] = Date.now(); // 簡易的なリビジョン番号
            serverUpdated[memberId] = Date.now();
          }

          // キャッシュを無効化
          if (statusCache) {
            const cacheKey = statusCacheKey(officeId);
            ctx.waitUntil(statusCache.delete(cacheKey));
          }

          return new Response(
            JSON.stringify({
              ok: true,
              rev,
              serverUpdated
            }),
            { headers: corsHeaders }
          );
        } catch (err) {
          console.error('set action error:', err);
          return new Response(
            JSON.stringify({ 
              error: 'update_failed', 
              message: err.message 
            }),
            { headers: corsHeaders }
          );
        }
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
