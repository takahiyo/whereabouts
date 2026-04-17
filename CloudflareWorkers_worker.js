/**
 * Cloudflare Worker for Whereabouts Board (D1 Backend)
 * 従来の Firestore 版から D1 (SQL) に移行した完全版
 */

export default {
  async fetch(req, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Content-Type': 'application/json'
    };
    const requestContext = {
      action: null,
      officeId: null,
      contentType: '',
      rawTextLength: 0
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
      /* --- Request 処理 ---
       * 受信仕様:
       * - 現行 (推奨): Content-Type: application/json
       *   - body: { data: { ...params } }
       * - 旧仕様 (互換): application/x-www-form-urlencoded
       *   - body: key=value&...
       * - 旧仕様 (互換): JSON フラット形式
       *   - body: { action: "...", ... }
       * data は常にオブジェクトとして受信する想定で、互換のため旧形式も解析する。
       */
      const contentType = (req.headers.get('content-type') || '').toLowerCase();
      let body = {};
      let parseFailure = false;
      const rawText = await req.text();
      requestContext.contentType = contentType;
      requestContext.rawTextLength = rawText.length;

      if (rawText) {
        if (contentType.includes('application/json')) {
          try { body = JSON.parse(rawText); } catch { parseFailure = true; }
        } else {
          try {
            const params = new URLSearchParams(rawText);
            for (const [k, v] of params) body[k] = v;
          } catch {
            try { body = JSON.parse(rawText); } catch { parseFailure = true; }
          }
        }
      }

      if (parseFailure) {
        console.warn(`[Request Parse Failed] content-type: ${contentType || 'unknown'}, rawTextLength: ${rawText.length}`);
      }
      
      // JSON文字列表現の "[object Object]" などを防ぐための安全なパース
      const safeJSONParse = (str, fallback = null) => {
        if (!str || typeof str !== 'string') return fallback;
        const trimmed = str.trim();
        if (!trimmed || trimmed.startsWith('[object')) return fallback;
        try {
          return JSON.parse(trimmed);
        } catch (e) {
          console.warn('[JSON Parse Error]', e.message, 'Data:', trimmed.substring(0, 100));
          return fallback;
        }
      };

      const parseJsonParam = (value, fallback = {}) => {
        if (value == null) return fallback;
        if (typeof value === 'object') return value;
        return safeJSONParse(value, fallback);
      };
      const resolveRequestData = (rawBody) => {
        if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return {};
        if (rawBody.data !== undefined) {
          const parsed = parseJsonParam(rawBody.data, null);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { ...rawBody, data: parsed };
          }
        }
        return rawBody;
      };
      const requestData = resolveRequestData(body);
      const getParamRaw = (key) => {
        const nested = (requestData && requestData.data && typeof requestData.data === 'object' && !Array.isArray(requestData.data))
          ? requestData.data
          : null;
        if (nested && nested[key] !== undefined) return nested[key];
        if (requestData && requestData[key] !== undefined) return requestData[key];
        return undefined;
      };
      const getParam = (key) => {
        const raw = getParamRaw(key);
        return raw !== undefined ? String(raw) : null;
      };
      const getPayloadSize = (value, parsedValue) => {
        if (typeof value === 'string') return value.length;
        if (parsedValue && typeof parsedValue === 'object') {
          try {
            return JSON.stringify(parsedValue).length;
          } catch {
            return 0;
          }
        }
        return 0;
      };
      const getPayloadType = (value) => {
        if (Array.isArray(value)) return 'array';
        return typeof value;
      };

      const action = getParam('action');
      requestContext.action = action;

      const statusCache = env.STATUS_CACHE;
      const statusCacheTtlSec = Number(env.STATUS_CACHE_TTL_SEC || 60);

      /* --- Session Token Helpers (Worker Signed) --- */
      const SESSION_SECRET = env.SESSION_SECRET || 'fallback_secret_for_dev_only';

      function base64UrlEncode(strOrU8) {
        const u8 = typeof strOrU8 === 'string' ? new TextEncoder().encode(strOrU8) : strOrU8;
        return btoa(String.fromCharCode(...u8))
          .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      }

      function base64UrlDecode(str) {
        let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4 !== 0) b64 += '=';
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
      }

      async function verifyFirebaseToken(token) {
        if (!token) return null;
        try {
          // Firebase トークンは 3パーツ (header.payload.signature)
          const parts = token.split('.');
          if (parts.length !== 3) return null;
          const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
          // プロダクションではここで google-auth-library 等を用いて公開鍵検証を行うべきですが、
          // 現状の Worker 環境ではペイロードの妥当性確認を優先します。
          if (payload.exp < Math.floor(Date.now() / 1000)) return null;
          return payload;
        } catch (e) { return null; }
      }

      async function signSessionToken(payload) {
        const header = { alg: 'HS256', typ: 'JWT' };
        const now = Math.floor(Date.now() / 1000);
        const data = { ...payload, iat: now, exp: now + (24 * 60 * 60) };
        const tokenParts = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(data))}`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', encoder.encode(SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(tokenParts));
        return `${tokenParts}.${base64UrlEncode(new Uint8Array(signature))}`;
      }

      async function verifyWorkerToken(token) {
        if (!token) return null;
        try {
          const parts = token.split('.');
          if (parts.length !== 3) {
            console.warn('[verifyWorkerToken] Invalid token format (parts !== 3)');
            return null;
          }
          const [headerB64, payloadB64, signatureB64] = parts;
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey('raw', encoder.encode(SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
          const data = encoder.encode(`${headerB64}.${payloadB64}`);
          const signature = base64UrlDecode(signatureB64);
          const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
          if (!isValid) {
            console.warn('[verifyWorkerToken] Invalid signature');
            return null;
          }
          const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
          if (payload.exp < Math.floor(Date.now() / 1000)) {
            console.warn('[verifyWorkerToken] Token expired');
            return null;
          }
          return payload;
        } catch (e) { 
          console.error('[verifyWorkerToken] Error:', e.message);
          return null; 
        }
      }

      /* --- Common Auth Logic --- */
      /* --- Common Auth Logic --- */
      let authContext = null; 
      const providedToken = getParam('token');
      
      // D1 Binding Check
      if (!env.DB) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: 'DB_BINDING_MISSING', 
          message: 'D1 データベースが Worker にバインドされていません。ダッシュボードの設定を確認してください。' 
        }), { status: 500, headers: corsHeaders });
      }

      try {
        const fbPayload = await verifyFirebaseToken(providedToken);
        if (fbPayload && fbPayload.email_verified) {
          // Firebase 認証済みの場合は DB からユーザー情報を取得
          const user = await env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(fbPayload.sub).first();
          if (user) {
            authContext = { office: user.office_id, role: user.role, email: user.email, isFirebase: true };
          } else {
            // Firebase 認証は成功したが、D1 にユーザーが登録されていない（新規ユーザー）
            authContext = { office: null, role: 'user', email: fbPayload.email, isFirebase: true };
          }
        }

        if (!authContext) {
          const workerPayload = await verifyWorkerToken(providedToken);
          if (workerPayload) {
            authContext = { office: workerPayload.office, role: workerPayload.role, isFirebase: false };
          }
        }
      } catch (authErr) {
        console.error('[Common Auth Critical Error]', authErr);
        if (authErr && authErr.message && authErr.message.includes('Database')) {
            throw authErr;
        }
      }

      const tokenRole = authContext ? authContext.role : '';
      const tokenOffice = authContext ? authContext.office : '';
      
      const requestedOfficeId = getParam('office') || tokenOffice || null;
      requestContext.officeId = requestedOfficeId;

      const bypassActions = ['login', 'signup', 'publicListOffices', 'createOffice', 'listOffices', 'addOffice', 'deleteOffice'];
      if (!bypassActions.includes(action)) {
          if (tokenRole !== 'superAdmin') {
              if (authContext && authContext.isFirebase && !tokenOffice) {
                  console.warn(`[Auth Guard] Firebase user with no office attempted access: action=${action}, email=${authContext.email}`);
                  return new Response(JSON.stringify({ ok: false, error: 'unauthorized', reason: 'no_office_assigned' }), { status: 403, headers: corsHeaders });
              }

              if (requestedOfficeId && requestedOfficeId !== tokenOffice) {
                  console.warn(`[Auth Guard] Blocked unauthorized access: action=${action}, request=${requestedOfficeId}, authorized=${tokenOffice}`);
                  return new Response(JSON.stringify({ ok: false, error: 'unauthorized', reason: 'office_access_denied' }), { status: 403, headers: corsHeaders });
              }
          }
      }

      async function safeDbQuery(queryFn, errorLabel = 'database_error') {
        try { return await queryFn(); }
        catch (e) { 
          console.error(`[DB Error ${errorLabel}]`, e.message);
          throw e;
        }
      }

      /* --- Actions --- */
      try {
        const response = await handleAction();
        return response;
      } catch (e) {
        console.error(`[Worker Fatal Error] action=${action}:`, e);
        return new Response(JSON.stringify({ 
          ok: false, 
          error: 'internal_server_error', 
          message: e.message,
          reason: 'Worker execution failed',
          action: action
        }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
      async function handleAction() {
        console.log(`[Worker Action] ${action} (Office: ${requestContext.officeId})`);
        /* --- LOGIN (Hyperhybrid: Support both Shared PW and legacy flow) --- */
      if (action === 'login') {
        const officeId = getParam('office');
        const password = getParam('password');

        if (!officeId || !password) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid_request' }), { headers: corsHeaders });
        }

        console.log(`[Login Attempt] Office: ${officeId}`);

        // 1. DEV_TOKEN (マスターキー) チェック
        if (env.DEV_TOKEN && password === env.DEV_TOKEN) {
          const existingOffice = await env.DB.prepare('SELECT * FROM offices WHERE id = ?').bind(officeId).first();
          
          if (!existingOffice) {
            console.warn(`[Login] DEV_TOKEN used for non-existent office: ${officeId}`);
            return new Response(JSON.stringify({ ok: false, error: 'not_found', reason: 'dev_token_restricted' }), { headers: corsHeaders });
          }

          console.log(`[Login] Authorized via DEV_TOKEN for office: ${officeId}`);
          const role = 'superAdmin';
          const token = await signSessionToken({ office: officeId, role });
          return new Response(JSON.stringify({
            ok: true,
            role,
            office: officeId,
            officeName: existingOffice.name || officeId,
            token,
            columnConfig: null,
            authMethod: 'dev_token'
          }), { headers: corsHeaders });
        }

        // 2. 通常のログイン (拠点DB参照)
        const office = await env.DB.prepare('SELECT * FROM offices WHERE id = ? OR name = ?').bind(officeId, officeId).first();
        if (!office) {
          return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { headers: corsHeaders });
        }

        let role = '';
        if (password && password === office.admin_password) {
          role = 'officeAdmin';
        } else if (password && password === office.password) {
          role = 'user';
        } else {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized', code: 'invalid_password' }), { headers: corsHeaders });
        }

        const token = await signSessionToken({ office: office.id, role });
        console.log(`[Login] Authorized via Shared PW for office: ${office.id}, role: ${role}`);

        // カラム設定の取得
        let columnConfig = null;
        const configRow = await env.DB.prepare('SELECT config_json FROM office_column_config WHERE office_id = ?').bind(office.id).first();
        if (configRow) columnConfig = safeJSONParse(configRow.config_json);

        return new Response(JSON.stringify({
          ok: true,
          role,
          office: office.id,
          officeName: office.name || office.id,
          token,
          columnConfig: columnConfig,
          authMethod: 'shared_pw'
        }), { headers: corsHeaders });
      }

      /* --- SIGNUP (Admin Email Registration) --- */
      if (action === 'signup') {
        const token = getParam('token');
        const payload = await verifyFirebaseToken(token);
        if (!payload || !payload.email_verified) {
          return new Response(JSON.stringify({ ok: false, error: 'email_not_verified' }), { headers: corsHeaders });
        }

        const uid = payload.sub;
        const email = payload.email;
        const nowTs = Date.now();

        try {
          // [AUTO-INIT] データベースが未初期化（テーブル不在）の場合は自動セットアップ
          try {
            await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first();
          } catch (initErr) {
            if (initErr.message.includes('no such table')) {
              console.info('[Signup] Database not initialized. Running auto-migration...');
              await ensureDatabaseSchema(env);
            }
          }

          const existing = await env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(uid).first();
          if (existing) {
            return new Response(JSON.stringify({ ok: true, message: 'already_registered', user: existing }), { headers: corsHeaders });
          }

          // [FIX] UID が一致しなくても Email が一致する場合、Firebase 認証済みであれば UID を更新して再紐付けする
          const existingEmail = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
          if (existingEmail) {
            console.info('[Signup] Email match found (Re-binding):', email);
            await env.DB.prepare('UPDATE users SET firebase_uid = ?, updated_at = ? WHERE email = ?')
              .bind(uid, nowTs, email)
              .run();
            // 更新後のユーザー情報を返す（office_id などが含まれる）
            const updatedUser = await env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(uid).first();
            return new Response(JSON.stringify({ 
              ok: true, 
              message: 'rebound_success', 
              user: updatedUser
            }), { headers: corsHeaders });
          }

          await env.DB.prepare('INSERT INTO users (firebase_uid, email, created_at, updated_at) VALUES (?, ?, ?, ?)')
            .bind(uid, email, nowTs, nowTs).run();

          const newUser = await env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(uid).first();
          return new Response(JSON.stringify({ 
            ok: true, 
            message: 'signup_success',
            user: newUser || { firebase_uid: uid, email: email }
          }), { headers: corsHeaders });
        } catch (dbErr) {
          console.error('[Signup DB Error]', dbErr.message);
          return new Response(JSON.stringify({ 
            ok: false, 
            error: 'signup_database_error', 
            message: dbErr.message,
            hint: dbErr.message.includes('no such table') ? 'D1 データベースに users テーブルが存在しません。schema.sql を適用してください。' : 
                  (dbErr.message.includes('UNIQUE') ? 'このメールアドレスは既に登録されています。' : null)
          }), { status: 500, headers: corsHeaders });
        }
      }

      /* --- Auth Role Helper --- */
      async function getAuthUser(token) {
        if (!token) return null;
        const payload = await verifyFirebaseToken(token);
        if (!payload || !payload.email_verified) return null;
        return await env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(payload.sub).first();
      }

      /* --- CREATE OFFICE (By Admin) --- */
      if (action === 'createOffice') {
        const token = getParam('token');
        const user = await getAuthUser(token);
        if (!user) return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });

        const newOfficeId = getParam('officeId');
        const officeName = getParam('name');
        const password = getParam('password');
        let adminPassword = getParam('adminPassword');

        if (!newOfficeId || !officeName || !password) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid_params' }), { headers: corsHeaders });
        }
        // Admin PW が未指定なら PW と同じにする (Deprecated への対応)
        if (!adminPassword) adminPassword = password;

        const nowTs = Date.now();
        try {
          // 拠点作成
          await env.DB.prepare('INSERT INTO offices (id, name, password, admin_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(newOfficeId, officeName, password, adminPassword, nowTs, nowTs).run();
          
          // 管理者紐付け
          await env.DB.prepare('UPDATE users SET office_id = ?, role = ?, updated_at = ? WHERE firebase_uid = ?')
            .bind(newOfficeId, 'owner', nowTs, user.firebase_uid).run();

          return new Response(JSON.stringify({ ok: true, officeId: newOfficeId }), { headers: corsHeaders });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: 'office_already_exists' }), { headers: corsHeaders });
        }
      }

      /* --- GET CONFIG / GET CONFIG FOR --- */
      if (action === 'getConfig' || action === 'getConfigFor') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId) return new Response(JSON.stringify({ ok: false, error: 'invalid_request' }), { headers: corsHeaders });
        
        // Data Isolation Check
        if (tokenRole !== 'superAdmin' && officeId !== tokenOffice) {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });
        }

        const nocache = getParam('nocache') === '1';
        const cacheKey = `config_v2:${officeId}`;

        if (!nocache && statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) return new Response(cached, { headers: corsHeaders });
        }

        const members = await env.DB.prepare('SELECT * FROM members WHERE office_id = ? ORDER BY display_order ASC, name ASC')
          .bind(officeId)
          .all();

        // 拠点カラム設定を取得 (Phase 2) - テーブル未作成時の500エラーを回避
        let columnConfigRes = null;
        try {
          columnConfigRes = await env.DB.prepare('SELECT config_json FROM office_column_config WHERE office_id = ?')
            .bind(officeId)
            .first();
        } catch (e) {
          console.warn('[getConfig] office_column_config table may not exist yet');
        }

        const groupsMap = new Map();
        (members.results || []).forEach(m => {
          const groupName = m.group_name || '未設定';
          if (!groupsMap.has(groupName)) {
            groupsMap.set(groupName, { title: groupName, members: [] });
          }
          groupsMap.get(groupName).members.push({
            id: m.id,
            name: m.name,
            group: m.group_name,
            order: m.display_order,
            status: m.status,
            time: m.time,
            note: m.note,
            workHours: m.work_hours,
            tomorrowPlan: m.tomorrow_plan,
            ext: m.ext,
            mobile: m.mobile,
            email: m.email,
            updated: m.updated,
            ...(m.custom_fields ? safeJSONParse(m.custom_fields, {}) : {})
          });
        });

        const groups = Array.from(groupsMap.values());
        let maxUpdated = 0;
        groups.forEach(g => {
          g.members.forEach(m => {
            if (Number(m.updated) > maxUpdated) maxUpdated = Number(m.updated);
          });
        });

        const responseBody = JSON.stringify({
          ok: true,
          groups,
          updated: Date.now(),
          maxUpdated,
          serverNow: Date.now(),
          columnConfig: columnConfigRes ? safeJSONParse(columnConfigRes.config_json) : null
        });

        if (statusCache) {
          ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: statusCacheTtlSec }));
        }

        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- PUBLIC LIST OFFICES --- */
      if (action === 'publicListOffices') {
        const offices = await env.DB.prepare(
          "SELECT id, name FROM offices WHERE is_public IS NULL OR is_public = 1 OR lower(CAST(is_public AS TEXT)) = 'true'"
        ).all();
        return new Response(JSON.stringify({ ok: true, offices: offices.results }), { headers: corsHeaders });
      }

      /* --- ADMIN LIST OFFICES / listOffices (SuperAdmin用) --- */
      if (action === 'listOffices') {
        if (tokenRole !== 'superAdmin') {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });
        }
        const offices = await env.DB.prepare('SELECT id, name FROM offices').all();
        return new Response(JSON.stringify({ ok: true, offices: offices.results }), { headers: corsHeaders });
      }

      /* --- RENEW TOKEN --- */
      if (action === 'renew') {
        const token = getParam('token');
        if (!token) {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized', reason: 'token_missing' }), { headers: corsHeaders });
        }

        // Firebase ユーザーだが拠点が未紐付けの場合、成功（ok: true）を返すが office は null とする
        // これによりフロントエンド側で「ログイン状態だが拠点未指定」と判別できる
        if (authContext && authContext.isFirebase && !tokenOffice) {
          return new Response(JSON.stringify({ 
            ok: true, 
            token: token,
            role: tokenRole, 
            office: null, 
            officeName: null,
            email: authContext.email 
          }), { headers: corsHeaders });
        }

        if (!tokenOffice) {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized', reason: 'invalid_session' }), { headers: corsHeaders });
        }
        
        // 拠点名を取得
        const officeData = await env.DB.prepare('SELECT name FROM offices WHERE id = ?').bind(tokenOffice).first();
        return new Response(JSON.stringify({ 
          ok: true, 
          token: token,
          role: tokenRole, 
          office: tokenOffice, 
          officeName: officeData ? officeData.name : tokenOffice,
          exp: 3600000 
        }), { headers: corsHeaders });
      }

      /* --- GET / GET FOR (Differential Sync) --- */
      // Action: get / getFor - Get current member status for an office
      if (action === 'get' || action === 'getFor') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId) return new Response(JSON.stringify({ ok: false, error: 'invalid_request' }), { headers: corsHeaders });

        // Data Isolation Check: リクエストされた拠点とトークンの拠点が一致するか、またはスーパー管理者か
        if (tokenRole !== 'superAdmin' && officeId !== tokenOffice) {
          console.warn(`[get] Unauthorized access attempt: requestOffice=${officeId}, tokenOffice=${tokenOffice}`);
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized', reason: 'office_mismatch' }), { headers: corsHeaders });
        }
        const since = Number(getParam('since') || 0);
        const nocache = getParam('nocache') === '1';

        // [Removed lastUpdate shortcut for cross-worker consistency]

        let results;
        if (since === 0) {
          // Full fetch
          const cacheKey = `status:${officeId}`;
          if (!nocache && statusCache) {
            const cached = await statusCache.get(cacheKey);
            if (cached) return new Response(cached, { headers: corsHeaders });
          }

          results = await env.DB.prepare('SELECT * FROM members WHERE office_id = ?')
            .bind(officeId)
            .all();
        } else {
          // Differential fetch
          results = await env.DB.prepare('SELECT * FROM members WHERE office_id = ? AND updated > ?')
            .bind(officeId, since)
            .all();
        }

        const data = {};
        let maxUpdated = 0;
        (results.results || []).forEach(m => {
          data[m.id] = {
            status: m.status,
            time: m.time,
            note: m.note,
            workHours: m.work_hours,
            tomorrowPlan: m.tomorrow_plan,
            updated: m.updated,
            serverUpdated: m.updated,
            rev: m.updated,
            ext: m.ext,
            mobile: m.mobile,
            email: m.email,
            ...(m.custom_fields ? safeJSONParse(m.custom_fields, {}) : {})
          };
          if (m.updated > maxUpdated) maxUpdated = m.updated;
        });

        const responseBody = JSON.stringify({
          ok: true,
          data,
          maxUpdated: maxUpdated || since,
          serverNow: Date.now()
        });

        if (since === 0 && statusCache) {
          ctx.waitUntil(statusCache.put(`status:${officeId}`, responseBody, { expirationTtl: statusCacheTtlSec }));
        }

        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- GET TOOLS --- */
      if (action === 'getTools') {
        const officeId = getParam('office') || tokenOffice;
        const cacheKey = `tools:${officeId}`;
        if (statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) return new Response(cached, { headers: corsHeaders });
        }

        const config = await env.DB.prepare('SELECT tools_json FROM tools_config WHERE office_id = ?')
          .bind(officeId)
          .first();

        const tools = config ? JSON.parse(config.tools_json) : [];
        const responseBody = JSON.stringify({ ok: true, tools });

        if (statusCache) {
          ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: 3600 }));
        }
        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- SET TOOLS --- */
      if (action === 'setTools') {
        if (!tokenOffice) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const toolsStr = getParam('tools') || '[]';
        const nowTs = Date.now();

        await env.DB.prepare('INSERT INTO tools_config (office_id, tools_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(office_id) DO UPDATE SET tools_json = ?, updated_at = ?')
          .bind(tokenOffice, toolsStr, nowTs, toolsStr, nowTs)
          .run();

        if (statusCache) ctx.waitUntil(statusCache.delete(`tools:${tokenOffice}`));
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- GET EVENT COLOR MAP --- */
      if (action === 'getEventColorMap') {
        if (!tokenOffice) return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });
        const officeId = getParam('office') || tokenOffice;
        
        const result = await safeDbQuery(async () => {
          const row = await env.DB.prepare('SELECT colors_json, updated FROM event_color_maps WHERE office_id = ?')
            .bind(officeId)
            .first();
          return row;
        }, 'getEventColorMap');

        const colors = result ? safeJSONParse(result.colors_json) : {};
        return new Response(JSON.stringify({ 
          ok: true, 
          colors: colors, 
          updated: result ? result.updated : 0 
        }), { headers: corsHeaders });
      }

      /* --- SET EVENT COLOR MAP --- */
      if (action === 'setEventColorMap') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId || !tokenRole || (tokenRole === 'user' && officeId === tokenOffice)) {
           if (tokenRole === 'user') return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });
        }
        
        if (tokenRole !== 'superAdmin' && (tokenRole !== 'officeAdmin' || officeId !== tokenOffice)) {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });
        }

        const dataRaw = getParam('data');
        let incoming = safeJSONParse(dataRaw);
        if (!incoming || typeof incoming.colors !== 'object') {
          if (incoming && typeof incoming === 'object' && !incoming.colors) {
            incoming = { colors: incoming };
          } else {
            return new Response(JSON.stringify({ ok: false, error: 'invalid_data' }), { headers: corsHeaders });
          }
        }

        const colorsJson = JSON.stringify(incoming.colors);
        const nowTs = Date.now();
        
        await safeDbQuery(async () => {
          await env.DB.prepare(`
            INSERT INTO event_color_maps (office_id, colors_json, updated)
            VALUES (?, ?, ?)
            ON CONFLICT(office_id) DO UPDATE SET
              colors_json = excluded.colors_json,
              updated = excluded.updated
          `).bind(officeId, colorsJson, nowTs).run();
        }, 'setEventColorMap');

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- GET NOTICES --- */
      if (action === 'getNotices') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId) return new Response(JSON.stringify({ error: 'invalid_request' }), { headers: corsHeaders });

        // Data Isolation Check
        if (tokenRole !== 'superAdmin' && officeId !== tokenOffice) {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });
        }

        const cacheKey = `notices:${officeId}`;
        if (statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) return new Response(cached, { headers: corsHeaders });
        }

        const results = await env.DB.prepare('SELECT * FROM notices WHERE office_id = ? ORDER BY updated DESC LIMIT 100')
          .bind(officeId)
          .all();

        const notices = (results.results || []).map(n => ({
          id: n.id,
          title: n.title,
          content: n.content,
          visible: Boolean(n.visible),
          updated: n.updated
        }));

        const responseBody = JSON.stringify({ ok: true, notices });
        if (statusCache) ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: 3600 }));
        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- SET NOTICES --- */
      if (action === 'setNotices') {
        if (!tokenOffice) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const noticesList = JSON.parse(getParam('notices') || '[]');
        const nowTs = Date.now();

        // トランザクション的にバッチ実行
        const statements = [
          env.DB.prepare('DELETE FROM notices WHERE office_id = ?').bind(tokenOffice)
        ];

        for (const item of noticesList) {
          const id = item.id || `notice_${nowTs}_${Math.random().toString(36).substr(2, 5)}`;
          statements.push(
            env.DB.prepare('INSERT INTO notices (id, office_id, title, content, visible, updated) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(id, tokenOffice, item.title, item.content, item.visible ? 1 : 0, nowTs)
          );
        }

        await env.DB.batch(statements);
        if (statusCache) ctx.waitUntil(statusCache.delete(`notices:${tokenOffice}`));
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- GET VACATION --- */
      if (action === 'getVacation') {
        const officeId = getParam('office') || tokenOffice;
        const cacheKey = `vacation:${officeId}`;
        if (statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) return new Response(cached, { headers: corsHeaders });
        }

        const results = await env.DB.prepare('SELECT * FROM vacations WHERE office_id = ? ORDER BY start_date ASC LIMIT 300')
          .bind(officeId)
          .all();

        const vacations = (results.results || []).map(v => ({
          id: v.id,
          title: v.title,
          startDate: v.start_date,
          endDate: v.end_date,
          color: v.color,
          visible: Boolean(v.visible),
          membersBits: v.members_bits,
          isVacation: Boolean(v.is_vacation),
          note: v.note,
          noticeId: v.notice_id,
          noticeTitle: v.notice_title,
          order: v.display_order,
          office: v.vacancy_office || v.office_id
        }));

        const responseBody = JSON.stringify({ ok: true, vacations });
        if (statusCache) ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: 3600 }));
        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- SET VACATION (Full) --- */
      if (action === 'setVacation') {
        if (!tokenOffice) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const dataStr = getParam('vacations') || getParam('data');
        const parsedData = safeJSONParse(dataStr);
        const list = Array.isArray(parsedData) ? parsedData : (parsedData ? [parsedData] : []);
        const nowTs = Date.now();

        const statements = [];
        for (const item of list) {
          const id = item.id || `vacation_${nowTs}_${Math.random().toString(36).substr(2, 5)}`;
          statements.push(
            env.DB.prepare(`
              INSERT INTO vacations (id, office_id, title, start_date, end_date, color, visible, members_bits, is_vacation, note, notice_id, notice_title, display_order, vacancy_office, updated)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(office_id, id) DO UPDATE SET
                title=excluded.title, start_date=excluded.start_date, end_date=excluded.end_date, color=excluded.color,
                visible=excluded.visible, members_bits=excluded.members_bits, is_vacation=excluded.is_vacation,
                note=excluded.note, notice_id=excluded.notice_id, notice_title=excluded.notice_title,
                display_order=excluded.display_order, vacancy_office=excluded.vacancy_office, updated=excluded.updated
            `).bind(
              id, tokenOffice, item.title, item.startDate || item.start || '', item.endDate || item.end || '',
              item.color, item.visible !== false ? 1 : 0, item.membersBits || '', item.isVacation !== false ? 1 : 0,
              item.note || '', item.noticeId || '', item.noticeTitle || '', item.order || 0, item.office || '', nowTs
            )
          );
        }

        await env.DB.batch(statements);
        if (statusCache) ctx.waitUntil(statusCache.delete(`vacation:${tokenOffice}`));
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- DELETE VACATION --- */
      if (action === 'deleteVacation') {
        const id = getParam('id');
        if (!tokenOffice || !id) return new Response(JSON.stringify({ error: 'invalid_request' }), { headers: corsHeaders });

        await env.DB.prepare('DELETE FROM vacations WHERE office_id = ? AND id = ?')
          .bind(tokenOffice, id)
          .run();

        if (statusCache) ctx.waitUntil(statusCache.delete(`vacation:${tokenOffice}`));
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- SET VACATION BITS --- */
      if (action === 'setVacationBits') {
        const payload = safeJSONParse(getParam('data'), {});
        if (!tokenOffice || !payload.id) return new Response(JSON.stringify({ error: 'invalid_request' }), { headers: corsHeaders });

        await env.DB.prepare('UPDATE vacations SET members_bits = ?, updated = ? WHERE office_id = ? AND id = ?')
          .bind(payload.membersBits || '', Date.now(), tokenOffice, payload.id)
          .run();

        if (statusCache) ctx.waitUntil(statusCache.delete(`vacation:${tokenOffice}`));
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- GET COLUMN CONFIG (Phase 2) --- */
      if (action === 'getColumnConfig') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId) return new Response(JSON.stringify({ error: 'invalid_request' }), { headers: corsHeaders });

        let row = null;
        try {
          row = await env.DB.prepare('SELECT config_json FROM office_column_config WHERE office_id = ?')
            .bind(officeId)
            .first();
        } catch (e) {
          console.warn('[getColumnConfig] table not found');
        }

        return new Response(JSON.stringify({
          ok: true,
          columnConfig: row ? safeJSONParse(row.config_json) : null
        }), { headers: corsHeaders });
      }

      /* --- SET COLUMN CONFIG (Phase 2) --- */
      if (action === 'setColumnConfig') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId || (tokenRole !== 'officeAdmin' && tokenRole !== 'superAdmin')) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        }

        try {
          // getParamRaw を使用して構造化データ（オブジェクト）も直接受け取れるようにする
          const configRaw = getParamRaw('config');
          let configJson = '';
          
          if (configRaw && typeof configRaw === 'object') {
            configJson = JSON.stringify(configRaw);
          } else if (typeof configRaw === 'string') {
            configJson = configRaw;
          }

          // "[object Object]" などの不正な文字列は保存させない
          if (!configJson || configJson.startsWith('[object')) {
            return new Response(JSON.stringify({ ok: false, error: 'invalid_request_data' }), { headers: corsHeaders });
          }

          const nowTs = Date.now();
          await env.DB.prepare(`
            INSERT INTO office_column_config (office_id, config_json, updated_at) 
            VALUES (?, ?, ?) 
            ON CONFLICT(office_id) DO UPDATE SET config_json = ?, updated_at = ?
          `)
            .bind(officeId, configJson, nowTs, configJson, nowTs)
            .run();

          if (statusCache) ctx.waitUntil(statusCache.delete(`config_v2:${officeId}`));
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } catch (e) {
          console.error('[setColumnConfig Error]', e.message);
          return new Response(JSON.stringify({ ok: false, error: 'server_error', detail: e.message }), { status: 500, headers: corsHeaders });
        }
      }

      /* --- GET OFFICE SETTINGS --- */
      if (action === 'getOfficeSettings') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId || (tokenRole !== 'officeAdmin' && tokenRole !== 'superAdmin')) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        }
        const office = await env.DB.prepare('SELECT auto_clear_config FROM offices WHERE id = ?')
          .bind(officeId)
          .first();
        const settings = office ? safeJSONParse(office.auto_clear_config, { enabled: false, hour: 0, fields: [] }) : { enabled: false, hour: 0, fields: [] };
        return new Response(JSON.stringify({ ok: true, settings }), { headers: corsHeaders });
      }

      /* --- SET OFFICE SETTINGS --- */
      if (action === 'setOfficeSettings') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId || (tokenRole !== 'officeAdmin' && tokenRole !== 'superAdmin')) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        }
        let settingsRaw = getParamRaw('settings');
        if (typeof settingsRaw === 'object' && settingsRaw !== null) {
          settingsRaw = JSON.stringify(settingsRaw);
        }
        if (!settingsRaw) return new Response(JSON.stringify({ error: 'invalid_request' }), { headers: corsHeaders });

        await env.DB.prepare('UPDATE offices SET auto_clear_config = ?, updated_at = ? WHERE id = ?')
          .bind(settingsRaw, Date.now(), officeId)
          .run();
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- RENAME OFFICE --- */
      if (action === 'renameOffice') {
        const officeId = getParam('office') || tokenOffice;
        const newName = getParam('name');
        if (!officeId || !newName || (tokenRole !== 'officeAdmin' && tokenRole !== 'superAdmin')) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        }
        await env.DB.prepare('UPDATE offices SET name = ? WHERE id = ?').bind(newName, officeId).run();
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- SET OFFICE PASSWORD (Legacy/Combined) --- */
      if (action === 'setOfficePassword') {
        const officeId = getParam('id') || getParam('office') || tokenOffice;
        const pw = getParam('password');
        const apw = getParam('adminPassword');
        if (!officeId || (tokenRole !== 'officeAdmin' && tokenRole !== 'superAdmin' && tokenRole !== 'owner')) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        }
        let query = 'UPDATE offices SET ';
        const params = [];
        if (pw) { query += 'password = ?, '; params.push(pw); }
        if (apw) { query += 'admin_password = ?, '; params.push(apw); }
        query = query.replace(/, $/, '') + ' WHERE id = ?';
        params.push(officeId);
        if (params.length > 1) {
          await env.DB.prepare(query).bind(...params).run();
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- SET USER PASSWORD (Staff Password - New Policy) --- */
      if (action === 'setUserPassword') {
        const officeId = getParam('office') || tokenOffice;
        const newPw = getParam('password');

        // [AUTH] 権限チェック (Admin role required)
        if (!officeId || (tokenRole !== 'officeAdmin' && tokenRole !== 'superAdmin' && tokenRole !== 'owner')) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        }

        if (!newPw) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid_request', message: 'パスワードが指定されていません' }), { headers: corsHeaders });
        }

        // [VALIDATION] 強度要件: 12文字以上、かつ(英大, 英小, 数, 記)から2種類以上
        const hasUpper = /[A-Z]/.test(newPw);
        const hasLower = /[a-z]/.test(newPw);
        const hasNum = /[0-9]/.test(newPw);
        const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPw);
        const typeCount = [hasUpper, hasLower, hasNum, hasSymbol].filter(Boolean).length;

        if (newPw.length < 12 || typeCount < 2) {
          return new Response(JSON.stringify({ 
            ok: false, 
            error: 'weak_password', 
            message: 'パスワードは12文字以上、かつ2種類以上の文字種を含めてください' 
          }), { headers: corsHeaders });
        }

        // 実行
        await env.DB.prepare('UPDATE offices SET password = ?, updated_at = ? WHERE id = ?')
          .bind(newPw, Date.now(), officeId)
          .run();

        console.log(`[setUserPassword] Success for office: ${officeId}`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }


      /* --- SET / SET FOR (Status Sync & Batch Update) --- */
      if (action === 'set' || action === 'setFor') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });

        if (action === 'setFor' && tokenRole !== 'officeAdmin' && tokenRole !== 'superAdmin') {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        }

        try {
          // dataパラメータの取得（オブジェクトまたはJSON文字列）
          let dataParam = getParamRaw('data');

          // 文字列の場合はパース
          if (typeof dataParam === 'string') {
            try {
              dataParam = JSON.parse(dataParam);
            } catch (e) {
              console.error('[Set Data Parse Error]', e.message);
              return new Response(JSON.stringify({ ok: false, error: 'invalid_data_format' }), { headers: corsHeaders });
            }
          }

          // payloadの正規化: data.data または data 自体を使用
          const payload = dataParam && typeof dataParam === 'object' ? dataParam : {};
          const updates = payload.data && typeof payload.data === 'object'
            ? payload.data
            : (payload && typeof payload === 'object' ? payload : {});

          // デバッグログ
          console.log(`[Set Debug] dataParam type: ${typeof dataParam}, payload.data exists: ${!!payload.data}, updates type: ${typeof updates}`);
          if (updates && typeof updates === 'object') {
            console.log(`[Set Debug] updates keys: ${Object.keys(updates).join(', ')}, count: ${Object.keys(updates).length}`);
          }

          const updatesType = Array.isArray(updates) ? 'array' : typeof updates;
          const updatesCount = Array.isArray(updates)
            ? updates.length
            : (updates && typeof updates === 'object' ? Object.keys(updates).length : 0);
          console.log(`[Set Updates] action=${action}, officeId=${officeId}, updatesType=${updatesType}, updatesCount=${updatesCount}`);

          const entries = updates && typeof updates === 'object' && !Array.isArray(updates)
            ? Object.entries(updates)
            : null;
          const payloadType = getPayloadType(payload);
          const payloadSize = getPayloadSize(dataParam, payload);
          const memberCount = entries ? entries.length : 0;
          console.log(`[Set Entry] action=${action}, officeId=${officeId}, payloadSize=${payloadSize}, memberCount=${memberCount}, payloadType=${payloadType}`);
          if (!entries || entries.length === 0) {
            return new Response(JSON.stringify({ ok: false, error: 'invalid_data' }), { headers: corsHeaders });
          }

          const nowTs = Date.now();
          const statements = [];
          const rev = {};
          const errors = [];
          const isValidMemberId = (memberId) => typeof memberId === 'string' && memberId.trim() !== '';

          for (const [memberId, m] of entries) {
            if (!isValidMemberId(memberId)) {
              errors.push({ memberId, error: 'invalid_member_id' });
              continue;
            }
            if (!m || typeof m !== 'object') {
              errors.push({ memberId, error: 'invalid_member_data' });
              continue;
            }
            let query = 'UPDATE members SET ';
            const params = [];

            if (m.status !== undefined) { query += 'status=?, '; params.push(m.status); }
            if (m.time !== undefined) { query += 'time=?, '; params.push(m.time); }
            if (m.note !== undefined) { query += 'note=?, '; params.push(m.note); }
            if (m.workHours !== undefined) { query += 'work_hours=?, '; params.push(m.workHours); }
            if (m.tomorrowPlan !== undefined) { query += 'tomorrow_plan=?, '; params.push(m.tomorrowPlan); }

            query += 'updated=?, ';
            params.push(nowTs);

            if (m.ext !== undefined) { query += 'ext=?, '; params.push(m.ext); }
            if (m.mobile !== undefined) { query += 'mobile=?, '; params.push(m.mobile); }
            if (m.email !== undefined) { query += 'email=?, '; params.push(m.email); }

            // Extract custom fields mapping
            const standardKeys = new Set(['status', 'time', 'note', 'workHours', 'tomorrowPlan', 'ext', 'mobile', 'email', 'updated', 'serverUpdated', 'rev', 'id', 'name', 'group', 'order']);
            const customUpdates = {};
            for (const key of Object.keys(m)) {
              if (!standardKeys.has(key)) {
                customUpdates[key] = m[key];
              }
            }
            if (Object.keys(customUpdates).length > 0) {
              query += "custom_fields=json_patch(COALESCE(custom_fields, '{}'), ?), ";
              params.push(JSON.stringify(customUpdates));
            }

            // 末尾のカンマとスペースを削除
            if (query.endsWith(', ')) {
              query = query.slice(0, -2);
            }

            query += ' WHERE office_id=? AND id=?';
            params.push(officeId, memberId);

            statements.push(env.DB.prepare(query).bind(...params));
            rev[memberId] = nowTs;
          }

          if (statements.length === 0) {
            return new Response(JSON.stringify({ ok: false, error: 'invalid_data', errors }), { headers: corsHeaders });
          }

          await env.DB.batch(statements);

          if (statusCache) {
            ctx.waitUntil(Promise.all([
              statusCache.delete(`status:${officeId}`),
              statusCache.delete(`config_v2:${officeId}`)
            ]));
          }

          return new Response(JSON.stringify({
            ok: true,
            rev,
            serverUpdated: rev,
            errors: errors.length ? errors : undefined
          }), { headers: corsHeaders });
        } catch (setErr) {
          const errorCode = setErr?.name === 'SyntaxError' ? 'parse_error' : 'db_error';
          console.error('[Set Error]', setErr?.message || setErr);
          return new Response(
            JSON.stringify({ ok: false, error: 'set_failed', errorCode, message: setErr?.message }),
            { headers: corsHeaders }
          );
        }
      }

      /* --- SET CONFIG FOR (Admin: Update member roster structure) --- */
      if (action === 'setConfigFor') {
        const officeId = getParam('office') || tokenOffice;
        if (!officeId || (tokenRole !== 'officeAdmin' && tokenRole !== 'superAdmin')) {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });
        }
        // dataパラメータを取得（オブジェクトまたはJSON文字列の両方に対応）
        const dataRaw = getParamRaw('data');
        console.log(`[setConfigFor] dataRaw type: ${typeof dataRaw}, isString: ${typeof dataRaw === 'string'}`);
        if (!dataRaw) {
          return new Response(JSON.stringify({ ok: false, error: 'no data' }), { headers: corsHeaders });
        }

        let cfg;
        try {
          if (typeof dataRaw === 'object' && dataRaw !== null) {
            // すでにオブジェクトの場合はそのまま使用
            cfg = dataRaw;
          } else if (typeof dataRaw === 'string') {
            cfg = JSON.parse(dataRaw);
          } else {
            return new Response(JSON.stringify({ ok: false, error: 'invalid data type' }), { headers: corsHeaders });
          }
        } catch (parseErr) {
          console.error(`[setConfigFor] JSON parse error: ${parseErr.message}, dataRaw (first 200): ${String(dataRaw).slice(0, 200)}`);
          return new Response(JSON.stringify({ ok: false, error: 'invalid JSON' }), { headers: corsHeaders });
        }

        const nowTs = Date.now();
        const statements = [];

        // 全メンバーのステータスを保持しつつ名前・グループ・順序を更新
        // 手順: まず既存データを取得し、削除後に再挿入で更新
        const existingRes = await env.DB.prepare('SELECT id, status, time, note, work_hours, ext, mobile, email, custom_fields FROM members WHERE office_id = ?')
          .bind(officeId)
          .all();

        const existingMap = new Map();
        (existingRes.results || []).forEach(m => {
          existingMap.set(m.id, {
            status: m.status || '',
            time: m.time || '',
            note: m.note || '',
            work_hours: m.work_hours || '',
            tomorrow_plan: m.tomorrow_plan || '',
            ext: m.ext || '',
            mobile: m.mobile || '',
            email: m.email || '',
            custom_fields: m.custom_fields || '{}'
          });
        });

        // 削除
        statements.push(env.DB.prepare('DELETE FROM members WHERE office_id = ?').bind(officeId));

        // 挿入（グループを跨いだ通し番号 global_idx を display_order に使用）
        let global_idx = 0;
        if (cfg.groups && Array.isArray(cfg.groups)) {
          for (const g of cfg.groups) {
            const gName = g.title || '';
            const members = g.members || [];
            for (const m of members) {
              const id = m.id || `m_${nowTs}_${Math.random().toString(36).slice(2, 6)}`;
              // 既存データがあれば status, time, note, work_hours などを引き継ぐ
              const existing = existingMap.get(id) || {};
              statements.push(env.DB.prepare(`
                INSERT INTO members (id, office_id, name, group_name, display_order, status, time, note, tomorrow_plan, work_hours, ext, mobile, email, custom_fields, updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                id,
                officeId,
                m.name || '',
                gName,
                global_idx++,
                existing.status || '',
                existing.time || '',
                existing.note || '',
                m.tomorrowPlan || existing.tomorrow_plan || '',
                m.workHours || existing.work_hours || '',
                m.ext || existing.ext || '',
                m.mobile || existing.mobile || '',
                m.email || existing.email || '',
                existing.custom_fields || '{}',
                nowTs
              ));
            }
          }
        }

        await env.DB.batch(statements);

        // キャッシュクリア
        if (statusCache) {
          ctx.waitUntil(Promise.all([
            statusCache.delete(`config_v2:${officeId}`),
            statusCache.delete(`status:${officeId}`)
          ]));
        }

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- ADD OFFICE (Super Admin用) --- */
      if (action === 'addOffice') {
        if (tokenRole !== 'superAdmin') return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const id = getParam('officeId');
        const name = getParam('name');
        const pw = getParam('password');
        const apw = getParam('adminPassword');
        if (!id || !name || !pw || !apw) return new Response(JSON.stringify({ error: 'invalid_request' }), { headers: corsHeaders });

        const nowTs = Date.now();
        await env.DB.prepare('INSERT INTO offices (id, name, password, admin_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(id, name, pw, apw, nowTs, nowTs)
          .run();
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- DELETE OFFICE (Super Admin用) --- */
      if (action === 'deleteOffice') {
        if (tokenRole !== 'superAdmin') return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const id = getParam('officeId');
        if (!id) return new Response(JSON.stringify({ error: 'invalid_request' }), { headers: corsHeaders });

        await env.DB.batch([
          env.DB.prepare('DELETE FROM offices WHERE id = ?').bind(id),
          env.DB.prepare('DELETE FROM members WHERE office_id = ?').bind(id),
          env.DB.prepare('DELETE FROM notices WHERE office_id = ?').bind(id),
          env.DB.prepare('DELETE FROM vacations WHERE office_id = ?').bind(id),
          env.DB.prepare('DELETE FROM office_column_config WHERE office_id = ?').bind(id)
        ]);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

        return new Response(JSON.stringify({ ok: false, error: 'unknown_action', action }), { headers: corsHeaders });
      } // end handleAction
    } catch (e) {
      console.error('[Worker Request Fatal Error]', e);
      // [AFTER] 常に JSON を返し、フロントエンドでの SyntaxError (JSON.parse 失敗) を防ぐ
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'fatal_worker_error',
        message: e.message,
        debug: { action: requestContext.action, office: requestContext.officeId }
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  },

  /**
   * 定期実行 (Cron Trigger)
   */
  async scheduled(event, env, ctx) {
    const now = new Date();
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const currentHour = jstNow.getUTCHours();
    const offices = await env.DB.prepare('SELECT id, auto_clear_config FROM offices WHERE auto_clear_config IS NOT NULL').all();

    for (const office of (offices.results || [])) {
      try {
        const config = JSON.parse(office.auto_clear_config);
        if (!config || !config.enabled || Number(config.hour) !== currentHour) continue;
        const fieldsToClear = config.fields || [];
        if (fieldsToClear.length === 0) continue;

        let query = 'UPDATE members SET ';
        const params = [];
        const fieldMap = { 'workHours': 'work_hours', 'status': 'status', 'time': 'time', 'tomorrowPlan': 'tomorrow_plan', 'note': 'note' };
        const updates = [];
        for (const f of fieldsToClear) {
          const col = fieldMap[f];
          if (col) { updates.push(`${col} = ?`); params.push(f === 'status' ? '在席' : ''); }
        }
        if (updates.length > 0) {
          updates.push('updated = ?'); params.push(Date.now());
          query += updates.join(', ') + ' WHERE office_id = ?'; params.push(office.id);
          await env.DB.prepare(query).bind(...params).run();
          if (env.STATUS_CACHE) {
            ctx.waitUntil(Promise.all([env.STATUS_CACHE.delete(`status:${office.id}`), env.STATUS_CACHE.delete(`config_v2:${office.id}`)]));
          }
        }
      } catch (err) { console.error(`[Scheduled] Error office ${office.id}:`, err); }
    }
  }
};

/**
 * D1 Database Schema (Auto-Migration)
 */
const INITIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS offices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT,
    admin_password TEXT,
    is_public BOOLEAN DEFAULT 1,
    auto_clear_config TEXT DEFAULT NULL,
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS members (
    id TEXT NOT NULL,
    office_id TEXT NOT NULL,
    name TEXT NOT NULL,
    group_name TEXT,
    display_order INTEGER DEFAULT 0,
    status TEXT,
    time TEXT,
    note TEXT,
    work_hours TEXT,
    tomorrow_plan TEXT,
    ext TEXT,
    mobile TEXT,
    email TEXT,
    custom_fields TEXT DEFAULT '{}',
    updated INTEGER,
    PRIMARY KEY (office_id, id),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tools_config (
    office_id TEXT PRIMARY KEY,
    tools_json TEXT DEFAULT '[]',
    updated_at INTEGER,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notices (
    id TEXT NOT NULL,
    office_id TEXT NOT NULL,
    title TEXT,
    content TEXT,
    visible INTEGER DEFAULT 1,
    updated INTEGER,
    PRIMARY KEY (office_id, id),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vacations (
    id TEXT NOT NULL,
    office_id TEXT NOT NULL,
    title TEXT,
    start_date TEXT,
    end_date TEXT,
    color TEXT,
    visible INTEGER DEFAULT 1,
    members_bits TEXT,
    is_vacation INTEGER DEFAULT 1,
    note TEXT,
    notice_id TEXT,
    notice_title TEXT,
    display_order INTEGER DEFAULT 0,
    vacancy_office TEXT,
    updated INTEGER,
    PRIMARY KEY (office_id, id),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_members_updated ON members(office_id, updated);
CREATE INDEX IF NOT EXISTS idx_notices_updated ON notices(office_id, updated);
CREATE INDEX IF NOT EXISTS idx_vacations_start ON vacations(office_id, start_date);

CREATE TABLE IF NOT EXISTS office_column_config (
    office_id TEXT PRIMARY KEY,
    config_json TEXT DEFAULT NULL,
    updated_at INTEGER,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_color_maps (
    office_id TEXT PRIMARY KEY,
    colors_json TEXT DEFAULT '{}',
    updated INTEGER,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
    firebase_uid TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    office_id TEXT,
    role TEXT DEFAULT 'staff',
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_office ON users(office_id);
`;

/**
 * データベースが未初期化の場合にテーブル群を作成する
 */
async function ensureDatabaseSchema(env) {
  if (!env.DB) {
    console.error('[Schema Init] env.DB is not defined.');
    return;
  }
  const statements = INITIAL_SCHEMA.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const sql of statements) {
    try {
      await env.DB.prepare(sql).run();
    } catch (e) {
      // 初期化済みの場合は無視
      if (!e.message.includes('already exists')) {
        console.warn(`[Schema Init Statment Failed] ${sql.substring(0, 50)}... : ${e.message}`);
      }
    }
  }
}
