/**
 * Cloudflare Worker for Whereabouts Board (Firestore Backend)
 * FULL VERSION: Supports Main Sync, Tools, Notices, and Vacations
 * OPTIMIZED: Implements KV caching for all read operations to minimize Firestore costs.
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
         Request body parsing
      ========================================================= */
      const contentType = (req.headers.get('content-type') || '').toLowerCase();
      let body = {};
      const rawText = await req.text();

      if (rawText) {
        if (contentType.includes('application/json')) {
          try { body = JSON.parse(rawText); } catch { }
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
         Parameters
      ========================================================= */
      const action = formData.get('action');
      const tokenOffice = formData.get('tokenOffice') || '';
      const tokenRole = formData.get('tokenRole') || '';

      /* =========================================================
         Auth / Firestore setup
      ========================================================= */
      const accessToken = await getGoogleAuthToken(env);
      const projectId = env.FIREBASE_PROJECT_ID;
      const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

      // GET helper
      const firestoreFetch = async (path) => {
        const res = await fetch(`${baseUrl}/${path}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.status !== 200) {
          const j = await res.json();
          throw new Error(`Firestore Fetch Error ${res.status}: ${JSON.stringify(j)}`);
        }
        return res.json();
      };

      // POST helper (runQuery, commit etc)
      const firestorePost = async (path, payload) => {
        const res = await fetch(`${baseUrl}/${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        if (res.status !== 200) {
          const j = await res.json();
          throw new Error(`Firestore Post Error ${res.status}: ${JSON.stringify(j)}`);
        }
        return res.json();
      };

      // PATCH helper
      const firestorePatch = async (path, payload, maskFields = []) => {
        let url = `${baseUrl}/${path}`;
        if (maskFields.length > 0) {
          const params = maskFields.map(f => `updateMask.fieldPaths=${f}`).join('&');
          url += `?${params}`;
        }
        const res = await fetch(url, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        if (res.status !== 200) {
          const j = await res.json();
          throw new Error(`Firestore Patch Error ${res.status}: ${JSON.stringify(j)}`);
        }
        return res.json();
      };

      // 404 Optional helper
      const firestoreFetchOptional = async (path) => {
        const res = await fetch(`${baseUrl}/${path}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.status === 404) return null;
        if (res.status !== 200) {
          const j = await res.json();
          throw new Error(`Firestore Opt Error ${res.status}: ${JSON.stringify(j)}`);
        }
        return res.json();
      };

      /* =========================================================
         KV Cache
      ========================================================= */
      const statusCache = env.STATUS_CACHE;
      const statusCacheTtlSec = Number(env.STATUS_CACHE_TTL_SEC || 60);
      const statusCacheKey = (office) => `status:${office}`;

      /* =========================================================
         Actions
      ========================================================= */

      /* --- LOGIN --- */
      if (action === 'login') {
        const officeId = formData.get('office');
        const password = formData.get('password');

        const json = await firestoreFetch(`offices/${officeId}`);
        const f = json.fields || {};

        let role = '';
        if (password === f.adminPassword?.stringValue) role = 'officeAdmin';
        else if (password === f.password?.stringValue) role = 'user';
        else {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
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

      /* --- GET CONFIG --- */
      if (action === 'getConfig') {
        const officeId = tokenOffice || 'nagoya_chuo';
        const nocache = formData.get('nocache') === '1';
        const cacheKey = `config_v2:${officeId}`;

        if (!nocache && statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) return new Response(cached, { headers: corsHeaders });
        }

        const json = await firestoreFetch(`offices/${officeId}/members?pageSize=300`);
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
          if (!groupsMap[m.group]) groupsMap[m.group] = { title: m.group, members: [] };
          groupsMap[m.group].members.push(m);
        });

        const responseBody = JSON.stringify({
          ok: true,
          groups: Object.values(groupsMap),
          updated: Date.now()
        });

        if (statusCache) {
          // ★案3: Configは滅多に変わらないため、TTLを1時間(3600秒)に固定して延長する
          ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: 3600 }));
        }

        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- PUBLIC LIST OFFICES --- */
      if (action === 'publicListOffices') {
        const json = await firestoreFetch('offices?pageSize=300');
        const offices = [];
        (json.documents || []).forEach(doc => {
          const f = doc.fields || {};
          const isPublic = f.public?.booleanValue;
          if (isPublic !== false) {
            offices.push({ id: doc.name.split('/').pop(), name: f.name?.stringValue || '' });
          }
        });
        return new Response(JSON.stringify({ ok: true, offices }), { headers: corsHeaders });
      }

      /* --- ADMIN LIST OFFICES --- */
      if (action === 'listOffices') {
        if (tokenRole !== 'superAdmin') {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });
        }
        const json = await firestoreFetch('offices?pageSize=300');
        const offices = (json.documents || []).map(doc => ({
          id: doc.name.split('/').pop(),
          name: doc.fields?.name?.stringValue || ''
        }));
        return new Response(JSON.stringify({ ok: true, offices }), { headers: corsHeaders });
      }

      /* --- GET (Differential Sync) --- */
      if (action === 'get') {
        const officeId = tokenOffice || 'nagoya_chuo';
        const since = Number(formData.get('since') || 0);
        const nocache = formData.get('nocache') === '1';

        // ★案1: 門番チェック (KVにある最終更新時刻を確認)
        if (since > 0 && !nocache && statusCache) {
          const lastUpdateKey = `lastUpdate:${officeId}`;
          const lastUpdateVal = await statusCache.get(lastUpdateKey);

          if (lastUpdateVal && Number(lastUpdateVal) <= since) {
            return new Response(JSON.stringify({
              ok: true,
              data: {},
              maxUpdated: Number(lastUpdateVal),
              serverNow: Date.now()
            }), { headers: corsHeaders });
          }
        }

        // 1. Full Fetch (初回ロード、または強制リロード)
        if (since === 0) {
          const cacheKey = statusCacheKey(officeId);
          if (!nocache && statusCache) {
            const cached = await statusCache.get(cacheKey);
            if (cached) return new Response(cached, { headers: corsHeaders });
          }

          // 全件取得
          const json = await firestoreFetch(`offices/${officeId}/members?pageSize=300`);
          const data = {};
          let maxUpdated = 0;
          (json.documents || []).forEach(doc => {
            const f = doc.fields || {};
            const up = Number(f.updated?.integerValue || 0);
            data[doc.name.split('/').pop()] = {
              status: f.status?.stringValue || '',
              time: f.time?.stringValue || '',
              note: f.note?.stringValue || '',
              workHours: f.workHours?.stringValue || '',
              updated: up,
              serverUpdated: up
            };
            if (up > maxUpdated) maxUpdated = up;
          });

          const responseBody = JSON.stringify({
            ok: true,
            data,
            maxUpdated: maxUpdated || Date.now(),
            serverNow: Date.now()
          });

          if (statusCache) {
            ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: statusCacheTtlSec }));
          }
          return new Response(responseBody, { headers: corsHeaders });
        }

        // 2. Differential Fetch (差分取得 - readOps削減)
        const queryPayload = {
          structuredQuery: {
            from: [{ collectionId: 'members' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'updated' },
                op: 'GREATER_THAN',
                value: { integerValue: String(since) }
              }
            }
          }
        };

        const jsonArr = await firestorePost(`offices/${officeId}:runQuery`, queryPayload);

        const data = {};
        let maxUpdated = 0;

        if (Array.isArray(jsonArr)) {
          jsonArr.forEach(item => {
            if (item.document) {
              const doc = item.document;
              const f = doc.fields || {};
              const mId = doc.name.split('/').pop();
              const up = Number(f.updated?.integerValue || 0);
              data[mId] = {
                status: f.status?.stringValue || '',
                time: f.time?.stringValue || '',
                note: f.note?.stringValue || '',
                workHours: f.workHours?.stringValue || '',
                updated: up,
                serverUpdated: up
              };
              if (up > maxUpdated) maxUpdated = up;
            }
          });
        }

        return new Response(JSON.stringify({
          ok: true,
          data,
          maxUpdated,
          serverNow: Date.now()
        }), { headers: corsHeaders });
      }

      /* --- GET TOOLS --- */
      if (action === 'getTools') {
        const officeId = formData.get('office') || tokenOffice;
        if (!officeId) return new Response(JSON.stringify({ ok: false, error: 'office_required' }), { headers: corsHeaders });

        // ★案5: ツール情報もKVキャッシュ (1時間)
        const cacheKey = `tools:${officeId}`;
        if (statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) return new Response(cached, { headers: corsHeaders });
        }

        const doc = await firestoreFetchOptional(`offices/${officeId}/tools/config`);
        let tools = [];
        if (doc && doc.fields && doc.fields.tools) {
          try {
            tools = JSON.parse(doc.fields.tools.stringValue || '[]');
          } catch (e) { }
        }

        const responseBody = JSON.stringify({ ok: true, tools });

        if (statusCache) {
          ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: 3600 }));
        }

        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- SET TOOLS --- */
      if (action === 'setTools') {
        if (!tokenOffice) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const officeId = tokenOffice;
        const toolsStr = formData.get('tools') || '[]';

        const payload = {
          fields: {
            tools: { stringValue: toolsStr }
          }
        };
        // update (patch) with mask
        await firestorePatch(`offices/${officeId}/tools/config`, payload, ['tools']);

        // ★案5: 更新時にキャッシュ削除
        if (statusCache) {
          ctx.waitUntil(statusCache.delete(`tools:${officeId}`));
        }

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- GET NOTICES --- */
      if (action === 'getNotices') {
        const officeId = formData.get('office') || tokenOffice;
        if (!officeId) return new Response(JSON.stringify({ ok: false, error: 'office_required' }), { headers: corsHeaders });

        // ★案5: お知らせ情報もKVキャッシュ (1時間)
        const cacheKey = `notices:${officeId}`;
        if (statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) return new Response(cached, { headers: corsHeaders });
        }

        const json = await firestoreFetchOptional(`offices/${officeId}/notices?pageSize=100`);
        let notices = [];
        if (json && json.documents) {
          notices = json.documents.map(doc => {
            const f = doc.fields || {};
            return {
              id: doc.name.split('/').pop(),
              title: f.title?.stringValue || '',
              content: f.content?.stringValue || '',
              visible: f.visible?.booleanValue ?? true,
              updated: f.updated?.integerValue ? Number(f.updated.integerValue) : 0
            };
          });
          // Sort by updated desc
          notices.sort((a, b) => b.updated - a.updated);
        }

        const responseBody = JSON.stringify({ ok: true, notices });

        if (statusCache) {
          ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: 3600 }));
        }

        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- SET NOTICES --- */
      if (action === 'setNotices') {
        if (!tokenOffice) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const officeId = tokenOffice;
        const noticesStr = formData.get('notices');
        if (!noticesStr) throw new Error('notices parameter required');

        const noticesList = JSON.parse(noticesStr);

        const writes = [];
        const nowTs = Date.now();

        for (let i = 0; i < noticesList.length; i++) {
          const item = noticesList[i];
          const docId = item.id || `notice_${nowTs}_${i}`;
          const path = `offices/${officeId}/notices/${docId}`;
          const fields = {
            title: { stringValue: String(item.title || '') },
            content: { stringValue: String(item.content || '') },
            visible: { booleanValue: item.visible !== false },
            updated: { integerValue: String(nowTs) }
          };
          writes.push(firestorePatch(path, { fields }, ['title', 'content', 'visible', 'updated']));
        }

        await Promise.all(writes);

        // ★案5: 更新時にキャッシュ削除
        if (statusCache) {
          ctx.waitUntil(statusCache.delete(`notices:${officeId}`));
        }

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- GET VACATION --- */
      if (action === 'getVacation') {
        const officeId = formData.get('office') || tokenOffice;
        if (!officeId) return new Response(JSON.stringify({ ok: false, error: 'office_required' }), { headers: corsHeaders });

        // ★案5: 休暇情報もKVキャッシュ (1時間)
        const cacheKey = `vacation:${officeId}`;
        if (statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) return new Response(cached, { headers: corsHeaders });
        }

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
              visible: f.visible?.booleanValue ?? true,
              membersBits: f.membersBits?.stringValue || ''
            };
          });
          vacations.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
        }

        const responseBody = JSON.stringify({ ok: true, vacations });

        if (statusCache) {
          ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: 3600 }));
        }

        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- SET VACATION (Added) --- */
      if (action === 'setVacation') {
        if (!tokenOffice) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const officeId = tokenOffice;
        const vacationsStr = formData.get('vacations');
        if (!vacationsStr) throw new Error('vacations parameter required');

        const vacationsList = JSON.parse(vacationsStr);
        const writes = [];

        for (let i = 0; i < vacationsList.length; i++) {
          const item = vacationsList[i];
          // IDがあれば更新、なければ新規ID生成 (日時+インデックスで簡易ユニーク化)
          const docId = item.id || `vacation_${Date.now()}_${i}`;
          const path = `offices/${officeId}/vacations/${docId}`;

          const fields = {
            title: { stringValue: String(item.title || '') },
            startDate: { stringValue: String(item.startDate || '') },
            endDate: { stringValue: String(item.endDate || '') },
            color: { stringValue: String(item.color || '') },
            visible: { booleanValue: item.visible !== false }
          };

          writes.push(firestorePatch(path, { fields }, ['title', 'startDate', 'endDate', 'color', 'visible']));
        }

        await Promise.all(writes);

        // ★案5: 更新時にキャッシュ削除
        if (statusCache) {
          ctx.waitUntil(statusCache.delete(`vacation:${officeId}`));
        }

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- SET VACATION BITS (membersBits のみ更新) --- */
      if (action === 'setVacationBits') {
        if (!tokenOffice) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const officeId = formData.get('office') || tokenOffice;
        const dataStr = formData.get('data');
        if (!dataStr) throw new Error('data parameter required');

        const payload = JSON.parse(dataStr);
        const vacationId = payload.id;
        const membersBits = payload.membersBits || '';

        if (!vacationId) throw new Error('vacation id required');

        const path = `offices/${officeId}/vacations/${vacationId}`;
        const fields = {
          membersBits: { stringValue: String(membersBits) }
        };

        await firestorePatch(path, { fields }, ['membersBits']);

        // キャッシュ削除
        if (statusCache) {
          ctx.waitUntil(statusCache.delete(`vacation:${officeId}`));
        }

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- SET --- */
      if (action === 'set') {
        if (!tokenOffice) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const officeId = tokenOffice;
        const dataStr = formData.get('data');
        if (!dataStr) throw new Error('data parameter is required');

        const payload = JSON.parse(dataStr);
        const updates = payload.data || {};
        const rev = {};
        const serverUpdated = {};

        for (const [memberId, memberData] of Object.entries(updates)) {
          const docPath = `offices/${officeId}/members/${memberId}`;
          const nowTs = Date.now();
          const fields = {
            status: { stringValue: String(memberData.status || '') },
            time: { stringValue: String(memberData.time || '') },
            note: { stringValue: String(memberData.note || '') },
            workHours: { stringValue: String(memberData.workHours || '') },
            updated: { integerValue: String(nowTs) } // 更新時刻を保存
          };

          await firestorePatch(docPath, { fields }, ['status', 'time', 'note', 'workHours', 'updated']);

          rev[memberId] = nowTs;
          serverUpdated[memberId] = nowTs;
        }

        // キャッシュ無効化 ＆ ★案1: 最終更新時刻をKVに記録
        if (statusCache) {
          const lastUpdateKey = `lastUpdate:${officeId}`;
          ctx.waitUntil(Promise.all([
            statusCache.delete(statusCacheKey(officeId)),
            statusCache.put(lastUpdateKey, String(Date.now()))
          ]));
        }

        return new Response(JSON.stringify({ ok: true, rev, serverUpdated }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: 'unknown_action', action }), { headers: corsHeaders });

    } catch (e) {
      console.error('[Worker Error]', e.message, e.stack);
      return new Response(
        JSON.stringify({ ok: false, error: e.message, timestamp: Date.now() }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};

/* =========================================================
   Google Auth Helper
========================================================= */
async function getGoogleAuthToken(env) {
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;

  // PEM Parsing
  const binaryDer = Uint8Array.from(atob(pem.split('-----')[2].replace(/\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const claimB64 = btoa(JSON.stringify(claim)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${headerB64}.${claimB64}`)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${headerB64}.${claimB64}.${sigB64}`
  });

  if (res.status !== 200) {
    throw new Error(`Google Auth Failed: ${await res.text()}`);
  }
  return (await res.json()).access_token;
}
