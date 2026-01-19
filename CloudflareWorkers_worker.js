/**
 * Cloudflare Worker for Whereabouts Board (Firestore Backend)
 * KV Cache Implementation:
 * - getConfig: Configuration data caching (60s TTL)
 * - getVacation: Vacation data caching (60s TTL)
 * - getNotices: Notice data caching (60s TTL)
 * - getTools: Tools data caching (60s TTL)
 * - getEventColorMap: Event color mapping caching (60s TTL)
 * * Cache invalidation on write operations:
 * - set, setFor: INVALIDATE status cache (delete) to prevent stale data
 * - setNotices, setTools, setEventColorMap
 * - setVacation, setVacationBits, deleteVacation
 */

export default {
  async fetch(req, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: corsHeaders });

    try {
      const formData = await req.formData();
      const action = formData.get('action');

      // 1. Google認証トークンの取得
      const accessToken = await getGoogleAuthToken(env);
      const projectId = env.FIREBASE_PROJECT_ID;
      const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

      // --- Helper: Firestore通信用の共通関数 ---
      const firestoreFetch = async (path) => {
        const url = `${baseUrl}/${path}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        const json = await res.json();
        if (res.status !== 200) {
          throw new Error(`Firestore Error (${res.status}): ${JSON.stringify(json.error || json)}`);
        }
        return json;
      };
      const firestoreFetchOptional = async (path) => {
        const url = `${baseUrl}/${path}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (res.status === 404) return null;
        const json = await res.json();
        if (res.status !== 200) {
          throw new Error(`Firestore Error (${res.status}): ${JSON.stringify(json.error || json)}`);
        }
        return json;
      };
      const firestorePatch = async (path, body, updateMask = []) => {
        const params = updateMask.length
          ? `?${updateMask.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')}`
          : '';
        const url = `${baseUrl}/${path}${params}`;
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        if (res.status !== 200) {
          throw new Error(`Firestore Error (${res.status}): ${JSON.stringify(json.error || json)}`);
        }
        return json;
      };
      const firestoreUpsert = async (collectionPath, docId, body, updateMask = []) => {
        const encodedId = encodeURIComponent(docId);
        const params = updateMask.length
          ? `?${updateMask.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')}`
          : '';
        const patchUrl = `${baseUrl}/${collectionPath}/${encodedId}${params}`;
        let res = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.status === 404) {
          const createUrl = `${baseUrl}/${collectionPath}?documentId=${encodedId}`;
          res = await fetch(createUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        }
        const json = await res.json();
        if (res.status !== 200) {
          throw new Error(`Firestore Error (${res.status}): ${JSON.stringify(json.error || json)}`);
        }
        return json;
      };
      const firestoreBatchWrite = async (writes) => {
        if (!writes.length) return { status: 'empty' };
        const url = `${baseUrl}:batchWrite`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ writes })
        });
        const json = await res.json();
        if (res.status !== 200) {
          throw new Error(`Firestore Error (${res.status}): ${JSON.stringify(json.error || json)}`);
        }
        return json;
      };
      const firestoreRunQuery = async (parentPath, structuredQuery) => {
        const parent = `projects/${projectId}/databases/(default)/documents/${parentPath}`;
        const url = `${baseUrl}:runQuery`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent, structuredQuery })
        });
        const json = await res.json();
        if (res.status !== 200) {
          throw new Error(`Firestore Error (${res.status}): ${JSON.stringify(json.error || json)}`);
        }
        return Array.isArray(json) ? json : [];
      };
      const BATCH_WRITE_SIZE = 200;
      const MEMBER_UPDATED_FIELD = 'updated';
      const MEMBER_STATUS_FIELDS = ['status', 'time', 'note'];
      const MEMBER_STATUS_FIELDS_WITH_WORK_HOURS = [...MEMBER_STATUS_FIELDS, 'workHours'];
      const MEMBER_STATUS_FIELDS_FOR_GET = [...MEMBER_STATUS_FIELDS_WITH_WORK_HOURS, MEMBER_UPDATED_FIELD];
      const MEMBER_STATUS_FIELDS_FOR_GET_FOR = [...MEMBER_STATUS_FIELDS_FOR_GET, 'ext'];
      
      const buildFieldMaskQuery = (fieldPaths) => {
        const uniquePaths = Array.from(new Set(fieldPaths));
        if (!uniquePaths.length) return '';
        return uniquePaths.map(f => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&');
      };
      const withFieldMask = (path, fieldPaths) => {
        const maskQuery = buildFieldMaskQuery(fieldPaths);
        if (!maskQuery) return path;
        return path.includes('?') ? `${path}&${maskQuery}` : `${path}?${maskQuery}`;
      };
      const parsePositiveNumber = (value) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? num : null;
      };
      const getMemberUpdatedTimestamp = (doc) => {
        const updatedField = doc?.fields?.[MEMBER_UPDATED_FIELD];
        const updatedValue = Number(
          updatedField?.integerValue
          || updatedField?.doubleValue
          || updatedField?.stringValue
          || 0
        );
        return Number.isFinite(updatedValue) ? updatedValue : 0;
      };
      const buildMemberStatusFields = (status, nowTs) => ({
        status: toFirestoreValue(status.status == null ? '' : String(status.status)),
        time: toFirestoreValue(status.time == null ? '' : String(status.time)),
        note: toFirestoreValue(status.note == null ? '' : String(status.note)),
        updated: toFirestoreValue(nowTs)
      });
      const normalizeStatusValue = (value) => (value == null ? '' : String(value));
      
      // --- KV Cache Helpers ---
      const statusCache = env.STATUS_CACHE;
      const statusCacheTtlSec = parsePositiveNumber(env.STATUS_CACHE_TTL_SEC);
      const statusCacheTtlMs = statusCacheTtlSec ? statusCacheTtlSec * 1000 : null;
      const statusCacheWarmOnWrite = String(env.STATUS_CACHE_WARM_ON_WRITE || '').toLowerCase();
      const shouldWarmStatusCacheOnWrite = statusCacheWarmOnWrite === 'true' || statusCacheWarmOnWrite === '1';
      const statusCacheKey = (officeId) => `status:${officeId}`;
      
      const readStatusCacheRaw = async (officeId) => {
        if (!statusCache) return null;
        const cached = await statusCache.get(statusCacheKey(officeId));
        if (!cached) return null;
        try {
          return JSON.parse(cached);
        } catch (e) {
          return null;
        }
      };
      const readStatusCacheFresh = async (officeId, nowTs) => {
        if (!statusCache || !statusCacheTtlMs) return null;
        const cached = await readStatusCacheRaw(officeId);
        if (!cached || !cached.cachedAt) return null;
        if (nowTs - cached.cachedAt > statusCacheTtlMs) return null;
        return cached;
      };
      const writeStatusCache = async (officeId, entry) => {
        if (!statusCache || !statusCacheTtlSec) return;
        await statusCache.put(statusCacheKey(officeId), JSON.stringify(entry), {
          expirationTtl: statusCacheTtlSec
        });
      };
      const buildStatusCacheMembers = (documents) => {
        const members = {};
        documents.forEach(doc => {
          const f = doc.fields || {};
          const id = doc.name.split('/').pop();
          if (!id) return;
          members[id] = {
            status: f.status?.stringValue || '',
            time: f.time?.stringValue || '',
            note: f.note?.stringValue || '',
            workHours: f.workHours?.stringValue || '',
            updated: getMemberUpdatedTimestamp(doc)
          };
        });
        return members;
      };
      const buildStatusCacheEntry = (documents, nowTs, fallbackMaxUpdated = 0) => {
        const members = buildStatusCacheMembers(documents);
        const updatedCandidates = documents
          .map(getMemberUpdatedTimestamp)
          .filter(v => Number.isFinite(v) && v > 0);
        const maxUpdated = updatedCandidates.length
          ? Math.max(...updatedCandidates)
          : fallbackMaxUpdated;
        return {
          cachedAt: nowTs,
          maxUpdated,
          members
        };
      };
      const refreshStatusCacheFromFirestore = async (officeId, nowTs) => {
        if (!statusCache || !statusCacheTtlSec) return null;
        const json = await firestoreFetch(`offices/${officeId}/members?pageSize=300`);
        const documents = json.documents || [];
        const entry = buildStatusCacheEntry(documents, nowTs);
        await writeStatusCache(officeId, entry);
        return entry;
      };
      // ※ 今回の修正では使用しませんが、ヘルパーとして残しておきます
      const updateStatusCacheAfterWrite = async (officeId, updates, nowTs, options = {}) => {
        if (!statusCache || !statusCacheTtlSec) return;
        let cacheEntry = await readStatusCacheRaw(officeId);
        if (!cacheEntry || !cacheEntry.members) {
          if (!shouldWarmStatusCacheOnWrite) return;
          cacheEntry = await refreshStatusCacheFromFirestore(officeId, nowTs);
        }
        if (!cacheEntry || !cacheEntry.members) return;
        const members = { ...cacheEntry.members };
        const { preserveWorkHours = false, clearIds = [] } = options;
        Object.keys(updates || {}).forEach((userId) => {
          const status = updates[userId] || {};
          const existing = members[userId] || {};
          members[userId] = {
            status: normalizeStatusValue(status.status),
            time: normalizeStatusValue(status.time),
            note: normalizeStatusValue(status.note),
            workHours: preserveWorkHours && !Object.prototype.hasOwnProperty.call(status, 'workHours')
              ? normalizeStatusValue(existing.workHours)
              : normalizeStatusValue(status.workHours),
            updated: nowTs
          };
        });
        clearIds.forEach((id) => {
          if (!id) return;
          members[id] = {
            status: '',
            time: '',
            note: '',
            workHours: '',
            updated: nowTs
          };
        });
        const maxUpdated = Math.max(cacheEntry.maxUpdated || 0, nowTs);
        await writeStatusCache(officeId, {
          cachedAt: nowTs,
          maxUpdated,
          members
        });
      };
      const buildStatusEtag = (officeId, maxUpdated, since) => `W/"${officeId}-${maxUpdated}-${since || 0}"`;
      const firestoreDelete = async (path) => {
        const url = `${baseUrl}/${path}`;
        const res = await fetch(url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.status === 404) {
          return false;
        }
        if (res.status !== 200) {
          const json = await res.json();
          throw new Error(`Firestore Error (${res.status}): ${JSON.stringify(json.error || json)}`);
        }
        return true;
      };

      // --- Logging Helper ---
      const LOG_PREFIX = '[KV-Cache]';
      const logKvHit = (action, key) => console.log(`${LOG_PREFIX} HIT - action=${action}, key=${key}`);
      const logKvMiss = (action, key) => console.log(`${LOG_PREFIX} MISS - action=${action}, key=${key}`);
      const logKvWrite = (action, key) => console.log(`${LOG_PREFIX} WRITE - action=${action}, key=${key}`);
      const logKvDelete = (action, key) => console.log(`${LOG_PREFIX} DELETE - action=${action}, key=${key}`);
      const logFirestoreRead = (action, path) => console.log(`${LOG_PREFIX} FIRESTORE_READ - action=${action}, path=${path}`);
      const logStart = (action) => console.log(`${LOG_PREFIX} START - action=${action}`);
      const logEnd = (action) => console.log(`${LOG_PREFIX} END - action=${action}`);

      // 2. アクションごとの処理

      // LOGIN: パスワード照合
      if (action === 'login') {
        const officeId = formData.get('office');
        const password = formData.get('password');
        const json = await firestoreFetch(`offices/${officeId}`);
        const f = json.fields || {};

        let role = '';
        if (password === f.adminPassword?.stringValue) role = 'officeAdmin';
        else if (password === f.password?.stringValue) role = 'user';
        else return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });

        return new Response(JSON.stringify({
          ok: true,
          role,
          office: officeId,
          officeName: f.name?.stringValue || officeId
        }), { headers: corsHeaders });
      }

      // getConfig: 名簿構造の取得
      // 【フェーズ3+4実装】
      // 設計原則:
      //   1. KV を読む
      //   2. KV hit の場合は即 return（Firestore 処理禁止）
      //   3. KV miss の場合のみ Firestore を 1 回読む
      //   4. 読んだデータを KV に保存
      //   5. nocache=1 は管理者のみ有効（フェーズ4）
      if (action === 'getConfig') {
        logStart('getConfig');
        const officeId = formData.get('tokenOffice') || 'nagoya_chuo';
        
        // ★フェーズ4: nocache=1 は管理者のみ有効
        const noCacheRequested = formData.get('nocache') === '1';
        const isAdmin = roleIsOfficeAdmin(tokenRole);
        const useNoCache = noCacheRequested && isAdmin;
        
        if (useNoCache) {
          console.log(`${LOG_PREFIX} NOCACHE_ADMIN - action=getConfig, officeId=${officeId}`);
        }
        
        // --- 設定データのKVキャッシュ確認 ---
        const configCacheKey = `config_v2:${officeId}`;
        // KV を読む（管理者のnocache時はスキップ）
        if (!useNoCache && statusCache) {
          try {
            const cached = await statusCache.get(configCacheKey);
            // KV hit の場合は即 return（Firestore 処理禁止）
            if (cached) {
              logKvHit('getConfig', configCacheKey);
              logEnd('getConfig');
              return new Response(cached, { headers: corsHeaders });
            }
            logKvMiss('getConfig', configCacheKey);
          } catch (e) { console.error('Config Cache Read Error', e); }
        }

        // KV miss の場合のみ Firestore を 1 回読む（または管理者のnocache時）
        logFirestoreRead('getConfig', `offices/${officeId}/members`);
        const json = await firestoreFetch(`offices/${officeId}/members?pageSize=300`);

        const members = (json.documents || []).map(doc => {
          const f = doc.fields || {};
          return {
            id: doc.name.split('/').pop(),
            name: f.name?.stringValue || '',
            group: f.group?.stringValue || '',
            order: Number(f.order?.integerValue || f.order?.doubleValue || 0),
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

        const updatedCandidates = (json.documents || [])
          .map(getMemberUpdatedTimestamp)
          .filter(v => Number.isFinite(v) && v > 0);
        const updated = updatedCandidates.length ? Math.max(...updatedCandidates) : 0;

        const responseBody = JSON.stringify({
          ok: true,
          groups: Object.values(groupsMap),
          updated
        });

        // --- 設定データのKV保存 ---
        if (statusCache) {
          const ttl = statusCacheTtlSec || 60;
          try {
            logKvWrite('getConfig', configCacheKey);
            ctx.waitUntil(statusCache.put(configCacheKey, responseBody, { expirationTtl: ttl }));
          } catch (e) { console.error('Config Cache Write Error', e); }
        }

        logEnd('getConfig');
        return new Response(responseBody, { headers: corsHeaders });
      }

      if (action === 'getFor') {
        const officeId = formData.get('office') || formData.get('tokenOffice') || 'nagoya_chuo';
        const membersPath = withFieldMask(`offices/${officeId}/members?pageSize=300`, MEMBER_STATUS_FIELDS_FOR_GET_FOR);
        const json = await firestoreFetch(membersPath);
        const dataMap = {};
        const updatedCandidates = (json.documents || [])
          .map(getMemberUpdatedTimestamp)
          .filter(v => Number.isFinite(v) && v > 0);
        const updated = updatedCandidates.length ? Math.max(...updatedCandidates) : 0;
        (json.documents || []).forEach(doc => {
          const f = doc.fields || {};
          dataMap[doc.name.split('/').pop()] = {
            status: f.status?.stringValue || '',
            time: f.time?.stringValue || '',
            note: f.note?.stringValue || '',
            workHours: f.workHours?.stringValue || '',
            ext: f.ext?.stringValue || ''
          };
        });
        return new Response(JSON.stringify({ updated, data: dataMap }), { headers: corsHeaders });
      }

      if (action === 'getConfigFor') {
        const officeId = formData.get('office') || formData.get('tokenOffice') || 'nagoya_chuo';
        const configCollectionPath = `offices/${officeId}/config`;
        const configDocPath = `${configCollectionPath}/config`;
        const legacyConfigDocPath = `offices/${officeId}/config`;
        const legacyOfficeDocPath = `offices/${officeId}`;
        let cfgDoc = await firestoreFetchOptional(configDocPath);
        let cfgFromDoc = null;
        const migrateConfigDoc = async (doc) => {
          const normalized = normalizeConfig(fromFirestoreDoc(doc));
          const configFields = {
            version: toFirestoreValue(normalized.version),
            updated: toFirestoreValue(normalized.updated),
            groups: toFirestoreValue(normalized.groups || []),
            menus: toFirestoreValue(normalized.menus || {})
          };
          await firestoreUpsert(configCollectionPath, 'config', { fields: configFields });
          return normalized;
        };
        if (!cfgDoc) {
          const legacyConfigDoc = await firestoreFetchOptional(legacyConfigDocPath);
          if (legacyConfigDoc) {
            cfgFromDoc = await migrateConfigDoc(legacyConfigDoc);
          } else {
            const legacyOfficeDoc = await firestoreFetchOptional(legacyOfficeDocPath);
            if (legacyOfficeDoc?.fields?.groups || legacyOfficeDoc?.fields?.menus) {
              cfgFromDoc = await migrateConfigDoc(legacyOfficeDoc);
            }
          }
        }
        if (cfgDoc && !cfgFromDoc) {
          cfgFromDoc = normalizeConfig(fromFirestoreDoc(cfgDoc));
        }
        if (cfgFromDoc) {
          const hasMembers = (cfgFromDoc.groups || []).some(g => (g.members || []).length > 0);
          if (hasMembers) {
            return new Response(JSON.stringify(cfgFromDoc), { headers: corsHeaders });
          }
        }
        const json = await firestoreFetch(`offices/${officeId}/members?pageSize=300`);
        const members = (json.documents || []).map(doc => {
          const f = doc.fields || {};
          return {
            id: doc.name.split('/').pop(),
            name: f.name?.stringValue || '',
            group: f.group?.stringValue || '',
            order: Number(f.order?.integerValue || f.order?.doubleValue || 0),
            ext: f.ext?.stringValue || '',
            mobile: f.mobile?.stringValue || '',
            email: f.email?.stringValue || '',
            workHours: f.workHours?.stringValue || ''
          };
        });
        const groupsMap = {};
        members.sort((a, b) => a.order - b.order).forEach(m => {
          if (!groupsMap[m.group]) groupsMap[m.group] = { title: m.group, members: [] };
          groupsMap[m.group].members.push({
            id: m.id,
            name: m.name,
            ext: m.ext,
            mobile: m.mobile,
            email: m.email,
            workHours: m.workHours
          });
        });
        const updatedCandidates = (json.documents || [])
          .map(doc => doc.updateTime)
          .filter(Boolean)
          .map(v => Date.parse(v))
          .filter(v => Number.isFinite(v));
        const updatedFromMembers = updatedCandidates.length ? Math.max(...updatedCandidates) : Date.now();
        const merged = {
          groups: Object.values(groupsMap),
          updated: cfgFromDoc ? Math.max(cfgFromDoc.updated || 0, updatedFromMembers) : updatedFromMembers,
          menus: cfgFromDoc?.menus || undefined
        };
        const cfg = normalizeConfig(merged);
        return new Response(JSON.stringify(cfg), { headers: corsHeaders });
      }

      if (action === 'setConfigFor') {
        const officeId = formData.get('office') || formData.get('tokenOffice') || 'nagoya_chuo';
        const configCollectionPath = `offices/${officeId}/config`;
        let incoming;
        try {
          incoming = JSON.parse(formData.get('data') || '{}') || {};
        } catch (e) {
          return new Response(JSON.stringify({ error: 'bad_json' }), { headers: corsHeaders });
        }
        const nowTs = Date.now();
        const parsed = normalizeConfig({ ...incoming, updated: nowTs });

        const sanitizeDocId = (id) => {
          if (!id) return '';
          return String(id)
            .replace(/\//g, '_')
            .replace(/\.\./g, '__')
            .replace(/^__/, 'id_')
            .trim();
        };

        let newIdCounter = 0;
        const randomSuffix = () => Math.random().toString(36).substring(2, 6);
        (parsed.groups || []).forEach(group => {
          (group.members || []).forEach(member => {
            if (!member.id || member.id.trim() === '') {
              newIdCounter++;
              member.id = `mem_${nowTs}_${newIdCounter}_${randomSuffix()}`;
            } else {
              member.id = sanitizeDocId(member.id);
            }
          });
        });

        const configFields = {
          version: toFirestoreValue(parsed.version),
          updated: toFirestoreValue(parsed.updated),
          groups: toFirestoreValue(parsed.groups || []),
          menus: toFirestoreValue(parsed.menus || {})
        };
        await firestoreUpsert(configCollectionPath, 'config', { fields: configFields });

        const desiredIds = new Set();
        let order = 0;
        const memberWrites = [];
        (parsed.groups || []).forEach(group => {
          const title = group.title || '';
          (group.members || []).forEach(member => {
            const id = String(member.id || '').trim();
            if (!id) return;
            desiredIds.add(id);
            order += 1;
            const fields = {
              name: toFirestoreValue(member.name || ''),
              group: toFirestoreValue(title),
              order: toFirestoreValue(order),
              ext: toFirestoreValue(member.ext || ''),
              mobile: toFirestoreValue(member.mobile || ''),
              email: toFirestoreValue(member.email || ''),
              workHours: toFirestoreValue(member.workHours == null ? '' : String(member.workHours))
            };
            memberWrites.push({
              update: {
                name: `projects/${projectId}/databases/(default)/documents/offices/${officeId}/members/${encodeURIComponent(id)}`,
                fields
              },
              updateMask: { fieldPaths: ['name', 'group', 'order', 'ext', 'mobile', 'email', 'workHours'] }
            });
          });
        });

        for (let i = 0; i < memberWrites.length; i += BATCH_WRITE_SIZE) {
          await firestoreBatchWrite(memberWrites.slice(i, i + BATCH_WRITE_SIZE));
        }

        const existing = await firestoreFetch(`offices/${officeId}/members?pageSize=300`);
        const deletions = (existing.documents || [])
          .map(doc => doc.name.split('/').pop())
          .filter(id => id && !desiredIds.has(id))
          .map(id => ({
            delete: `projects/${projectId}/databases/(default)/documents/offices/${officeId}/members/${encodeURIComponent(id)}`
          }));
        for (let i = 0; i < deletions.length; i += BATCH_WRITE_SIZE) {
          await firestoreBatchWrite(deletions.slice(i, i + BATCH_WRITE_SIZE));
        }

        return new Response(JSON.stringify(parsed), { headers: corsHeaders });
      }

      if (action === 'setFor') {
        const officeId = formData.get('office') || formData.get('tokenOffice') || 'nagoya_chuo';
        let incoming;
        try {
          incoming = JSON.parse(formData.get('data') || '{}') || {};
        } catch (e) {
          return new Response(JSON.stringify({ error: 'bad_json' }), { headers: corsHeaders });
        }
        const incomingData = incoming.data || {};
        const full = !!incoming.full;
        const writes = [];
        const nowTs = Date.now();
        const clearIds = [];

        if (full) {
          const existing = await firestoreFetch(`offices/${officeId}/members?pageSize=300`);
          const incomingIds = new Set(Object.keys(incomingData));
          const missingIds = (existing.documents || [])
            .map(doc => doc.name.split('/').pop())
            .filter(id => id && !incomingIds.has(id))
          clearIds.push(...missingIds);
          const clears = missingIds.map(id => ({
              update: {
                name: `projects/${projectId}/databases/(default)/documents/offices/${officeId}/members/${encodeURIComponent(id)}`,
                fields: {
                  status: toFirestoreValue(''),
                  time: toFirestoreValue(''),
                  note: toFirestoreValue(''),
                  workHours: toFirestoreValue(''),
                  updated: toFirestoreValue(nowTs)
                }
              },
              updateMask: { fieldPaths: [...MEMBER_STATUS_FIELDS_WITH_WORK_HOURS, MEMBER_UPDATED_FIELD] }
            }));
          writes.push(...clears);
        }

        Object.keys(incomingData).forEach((userId) => {
          const s = incomingData[userId] || {};
          const fields = buildMemberStatusFields(s, nowTs);
          const updateMask = [...MEMBER_STATUS_FIELDS, MEMBER_UPDATED_FIELD];
          if (Object.prototype.hasOwnProperty.call(s, 'workHours')) {
            fields.workHours = toFirestoreValue(s.workHours == null ? '' : String(s.workHours));
            updateMask.push('workHours');
          }
          if (Object.prototype.hasOwnProperty.call(s, 'ext')) {
            fields.ext = toFirestoreValue(s.ext == null ? '' : String(s.ext));
            updateMask.push('ext');
          }
          writes.push({
            update: {
              name: `projects/${projectId}/databases/(default)/documents/offices/${officeId}/members/${encodeURIComponent(userId)}`,
              fields
            },
            updateMask: { fieldPaths: updateMask }
          });
        });

        for (let i = 0; i < writes.length; i += BATCH_WRITE_SIZE) {
          await firestoreBatchWrite(writes.slice(i, i + BATCH_WRITE_SIZE));
        }

        // ★修正: データの整合性を保証するため、キャッシュを削除して次回Firestoreから再取得させる
        if (statusCache) {
          try {
            const key = `status:${officeId}`;
            logKvDelete('setFor', key);
            await statusCache.delete(key);
          } catch (e) {
            console.error("Cache invalidation failed (setFor):", e);
          }
        }

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // get: ステータスのみ取得
      // 【フェーズ1+4実装】
      // 設計原則:
      //   1. SSOT は Firestore
      //   2. Workers KV は Read キャッシュ専用
      //   3. Firestore Read は KV ミス時のみ・1 回だけ許容
      //   4. TTL は 60 秒固定
      //   5. nocache=1 は管理者のみ有効（フェーズ4）
      if (action === 'get') {
        logStart('get');
        const officeId = formData.get('tokenOffice') || 'nagoya_chuo';
        const sinceRaw = formData.get('since');
        const since = Number(sinceRaw);
        const hasSince = Number.isFinite(since) && since > 0;
        const nowTs = Date.now();
        const statusKey = statusCacheKey(officeId);

        // ★フェーズ4: nocache=1 は管理者のみ有効
        const noCacheRequested = formData.get('nocache') === '1';
        const isAdmin = roleIsOfficeAdmin(tokenRole);
        const useNoCache = noCacheRequested && isAdmin;
        
        if (useNoCache) {
          console.log(`${LOG_PREFIX} NOCACHE_ADMIN - action=get, officeId=${officeId}`);
        }

        // KV を読む（TTL内のキャッシュを確認）
        // ★フェーズ4: 管理者のnocache時はキャッシュをスキップ
        let cachedEntry = null;
        if (!useNoCache) {
          cachedEntry = await readStatusCacheFresh(officeId, nowTs);
          if (cachedEntry) {
            logKvHit('get', statusKey);
          } else {
            logKvMiss('get', statusKey);
          }
        }

        // KV hit の場合は即 return（Firestore 処理禁止）
        // ★フェーズ4: 管理者のnocache時はこのブロックをスキップ
        if (cachedEntry && cachedEntry.members) {
          const members = cachedEntry.members;
          const dataMap = {};
          const updatedCandidates = [];
          Object.keys(members).forEach((id) => {
            const member = members[id] || {};
            const updated = Number(member.updated || 0);
            // since がある場合はフィルタリング
            if (hasSince && updated <= since) return;
            dataMap[id] = {
              status: member.status || '',
              time: member.time || '',
              note: member.note || '',
              workHours: member.workHours || ''
            };
            if (Number.isFinite(updated) && updated > 0) {
              updatedCandidates.push(updated);
            }
          });
          const maxUpdated = hasSince
            ? (updatedCandidates.length ? Math.max(...updatedCandidates) : since)
            : (cachedEntry.maxUpdated || 0);
          const etag = buildStatusEtag(officeId, maxUpdated, hasSince ? since : 0);
          if (req.headers.get('if-none-match') === etag) {
            logEnd('get');
            return new Response(null, { status: 304, headers: { ...corsHeaders, ETag: etag } });
          }
          logEnd('get');
          return new Response(JSON.stringify({
            ok: true,
            data: dataMap,
            maxUpdated,
            serverNow: nowTs
          }), { headers: { ...corsHeaders, ETag: etag } });
        }

        // KV miss の場合のみ Firestore を 1 回読む
        // ★フェーズ1: since の有無に関わらず、常に全件取得してキャッシュに保存
        logFirestoreRead('get', `offices/${officeId}/members (full)`);
        const membersPath = withFieldMask(`offices/${officeId}/members?pageSize=300`, MEMBER_STATUS_FIELDS_FOR_GET);
        const json = await firestoreFetch(membersPath);
        const documents = json.documents || [];

        const dataMap = {};
        documents.forEach(doc => {
          const f = doc.fields || {};
          const id = doc.name.split('/').pop();
          const updated = getMemberUpdatedTimestamp(doc);
          // since がある場合はフィルタリング（レスポンス用）
          if (hasSince && updated <= since) return;
          dataMap[id] = {
            status: f.status?.stringValue || '',
            time: f.time?.stringValue || '',
            note: f.note?.stringValue || '',
            workHours: f.workHours?.stringValue || ''
          };
        });

        // 全ドキュメントから maxUpdated を計算
        const allUpdatedCandidates = documents
          .map(getMemberUpdatedTimestamp)
          .filter(v => Number.isFinite(v) && v > 0);
        const maxUpdatedFromDocs = allUpdatedCandidates.length
          ? Math.max(...allUpdatedCandidates)
          : 0;
        const maxUpdated = hasSince
          ? (Object.keys(dataMap).length > 0 ? maxUpdatedFromDocs : since)
          : maxUpdatedFromDocs;

        // 読んだデータを KV に保存（TTL 60秒固定）
        logKvWrite('get', statusKey);
        const entry = buildStatusCacheEntry(documents, nowTs, maxUpdatedFromDocs);
        await writeStatusCache(officeId, entry);

        const etag = buildStatusEtag(officeId, maxUpdated, hasSince ? since : 0);
        if (req.headers.get('if-none-match') === etag) {
          logEnd('get');
          return new Response(null, { status: 304, headers: { ...corsHeaders, ETag: etag } });
        }
        logEnd('get');
        return new Response(JSON.stringify({
          ok: true,
          data: dataMap,
          maxUpdated,
          serverNow: nowTs
        }), { headers: { ...corsHeaders, ETag: etag } });
      }

      // set: ステータス更新
      if (action === 'set') {
        logStart('set');
        const officeId = formData.get('tokenOffice') || 'nagoya_chuo';
        const updates = JSON.parse(formData.get('data')).data || {};
        const nowTs = Date.now();
        const updateMask = [...MEMBER_STATUS_FIELDS_WITH_WORK_HOURS, MEMBER_UPDATED_FIELD];

        const promises = Object.keys(updates).map(async (userId) => {
          const s = updates[userId];
          const fields = buildMemberStatusFields(s, nowTs);
          fields.workHours = toFirestoreValue(s.workHours == null ? '' : String(s.workHours));
          return firestorePatch(`offices/${officeId}/members/${encodeURIComponent(userId)}`, { fields }, updateMask);
        });
        await Promise.all(promises);

        // ★修正: ctx.waitUntil を使用して削除を確実にする
        if (statusCache) {
          const key = `status:${officeId}`;
          logKvDelete('set', key);
          const deletePromise = statusCache.delete(key).catch(e => console.error("Cache invalidation failed (set):", e));
          ctx.waitUntil(deletePromise);
        }

        logEnd('set');
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const tokenOffice = formData.get('tokenOffice') || '';
      const tokenRole = formData.get('tokenRole') || '';
      const resolveOffice = (requestedOffice, fallbackOffice = 'nagoya_chuo') => {
        let office = tokenOffice || requestedOffice || fallbackOffice;
        if (requestedOffice && requestedOffice !== tokenOffice && canAdminOffice(tokenRole, tokenOffice, requestedOffice)) {
          office = requestedOffice;
        }
        return office;
      };

      if (action === 'renameOffice') {
        const officeId = formData.get('office') || tokenOffice || 'nagoya_chuo';
        if (!canAdminOffice(tokenRole, tokenOffice, officeId)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        const name = (formData.get('name') || '').trim();
        if (!name) {
          return new Response(JSON.stringify({ error: 'bad_request' }), { headers: corsHeaders });
        }
        const officeDoc = await firestoreFetchOptional(`offices/${officeId}`);
        if (!officeDoc) {
          return new Response(JSON.stringify({ error: 'not_found' }), { headers: corsHeaders });
        }
        await firestorePatch(`offices/${officeId}`, {
          fields: {
            name: toFirestoreValue(name),
            updated: toFirestoreValue(Date.now())
          }
        }, ['name', 'updated']);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      if (action === 'setOfficePassword') {
        const officeId = (formData.get('id') || tokenOffice || '').trim();
        if (!officeId) {
          return new Response(JSON.stringify({ error: 'bad_request' }), { headers: corsHeaders });
        }
        if (!canAdminOffice(tokenRole, tokenOffice, officeId)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        const pw = formData.get('password') || '';
        const apw = formData.get('adminPassword') || '';
        if (!pw && !apw) {
          return new Response(JSON.stringify({ error: 'bad_request' }), { headers: corsHeaders });
        }
        const officeDoc = await firestoreFetchOptional(`offices/${officeId}`);
        if (!officeDoc) {
          return new Response(JSON.stringify({ error: 'not_found' }), { headers: corsHeaders });
        }
        const fields = { updated: toFirestoreValue(Date.now()) };
        const updateMask = ['updated'];
        if (pw) {
          fields.password = toFirestoreValue(String(pw));
          updateMask.push('password');
        }
        if (apw) {
          fields.adminPassword = toFirestoreValue(String(apw));
          updateMask.push('adminPassword');
        }
        await firestorePatch(`offices/${officeId}`, { fields }, updateMask);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // getNotices: お知らせ取得
      // 【フェーズ3実装】フェーズ1と同一ロジック
      if (action === 'getNotices') {
        logStart('getNotices');
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);

        // --- KV を読む ---
        const cacheKey = `notices:${officeId}`;
        if (statusCache) {
          try {
            const cached = await statusCache.get(cacheKey);
            // KV hit の場合は即 return（Firestore 処理禁止）
            if (cached) {
              logKvHit('getNotices', cacheKey);
              logEnd('getNotices');
              return new Response(cached, { headers: corsHeaders });
            }
            logKvMiss('getNotices', cacheKey);
          } catch (e) {}
        }

        // KV miss の場合のみ Firestore を 1 回読む
        logFirestoreRead('getNotices', `offices/${officeId}/notices`);
        const json = await firestoreFetchOptional(`offices/${officeId}/notices?pageSize=${MAX_NOTICES_PER_OFFICE}`);
        const normalized = normalizeNoticesArray((json?.documents || []).map(doc => ({
          id: doc.name.split('/').pop(),
          ...fromFirestoreDoc(doc)
        })));
        const isAdmin = roleIsOfficeAdmin(tokenRole);
        const notices = isAdmin
          ? normalized
          : normalized.filter(n => coerceNoticeVisibleFlag(n.visible != null ? n.visible : (n.display != null ? n.display : true)));
        
        const responseBody = JSON.stringify({
          ok: true,
          notices,
          updated: Date.now()
        });

        // --- 読んだデータを KV に保存 ---
        if (statusCache) {
           const ttl = statusCacheTtlSec || 60;
           logKvWrite('getNotices', cacheKey);
           ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: ttl }));
        }

        logEnd('getNotices');
        return new Response(responseBody, { headers: corsHeaders });
      }

      if (action === 'setNotices') {
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);
        if (!roleIsOfficeAdmin(tokenRole)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        if (requestedOffice && requestedOffice !== tokenOffice && !canAdminOffice(tokenRole, tokenOffice, requestedOffice)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        let parsedNotices;
        try {
          parsedNotices = JSON.parse(formData.get('notices') || '[]');
        } catch (e) {
          return new Response(JSON.stringify({ error: 'bad_json' }), { headers: corsHeaders });
        }
        const normalized = normalizeNoticesArray(parsedNotices);
        const nowTs = Date.now();
        const desiredIds = new Set();
        const writes = [];
        normalized.forEach((notice, idx) => {
          const id = String(notice.id || `notice_${nowTs}_${idx + 1}`);
          desiredIds.add(id);
          const fields = {
            title: toFirestoreValue(notice.title || ''),
            content: toFirestoreValue(notice.content || ''),
            visible: toFirestoreValue(coerceNoticeVisibleFlag(notice.visible != null ? notice.visible : notice.display)),
            order: toFirestoreValue(Number(notice.order || (idx + 1))),
            updated: toFirestoreValue(nowTs)
          };
          writes.push({
            update: {
              name: `projects/${projectId}/databases/(default)/documents/offices/${officeId}/notices/${encodeURIComponent(id)}`,
              fields
            },
            updateMask: { fieldPaths: ['title', 'content', 'visible', 'order', 'updated'] }
          });
        });
        for (let i = 0; i < writes.length; i += BATCH_WRITE_SIZE) {
          await firestoreBatchWrite(writes.slice(i, i + BATCH_WRITE_SIZE));
        }
        const existing = await firestoreFetchOptional(`offices/${officeId}/notices?pageSize=${MAX_NOTICES_PER_OFFICE}`);
        const deletions = (existing?.documents || [])
          .map(doc => doc.name.split('/').pop())
          .filter(id => id && !desiredIds.has(id))
          .map(id => ({
            delete: `projects/${projectId}/databases/(default)/documents/offices/${officeId}/notices/${encodeURIComponent(id)}`
          }));
        for (let i = 0; i < deletions.length; i += BATCH_WRITE_SIZE) {
          await firestoreBatchWrite(deletions.slice(i, i + BATCH_WRITE_SIZE));
        }

        // --- キャッシュ無効化 ---
        if (statusCache) {
          try {
            await statusCache.delete(`notices:${officeId}`);
          } catch (e) { console.error('Cache invalidation failed (setNotices):', e); }
        }

        return new Response(JSON.stringify({ ok: true, notices: normalized, updated: nowTs }), { headers: corsHeaders });
      }

      // getTools: ツール一覧取得
      // 【フェーズ3実装】フェーズ1と同一ロジック
      if (action === 'getTools') {
        logStart('getTools');
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);

        // --- KV を読む ---
        const cacheKey = `tools:${officeId}`;
        if (statusCache) {
          try {
            const cached = await statusCache.get(cacheKey);
            // KV hit の場合は即 return（Firestore 処理禁止）
            if (cached) {
              logKvHit('getTools', cacheKey);
              logEnd('getTools');
              return new Response(cached, { headers: corsHeaders });
            }
            logKvMiss('getTools', cacheKey);
          } catch (e) {}
        }

        // KV miss の場合のみ Firestore を 1 回読む
        logFirestoreRead('getTools', `offices/${officeId}/tools/config`);
        const toolsDoc = await firestoreFetchOptional(`offices/${officeId}/tools/config`);
        const stored = toolsDoc ? fromFirestoreDoc(toolsDoc) : {};
        const normalized = normalizeToolsArray(stored.tools || []);
        const isAdmin = roleIsOfficeAdmin(tokenRole);
        const tools = isAdmin ? normalized.list : filterVisibleTools(normalized.list);
        
        const responseBody = JSON.stringify({
          tools,
          warnings: normalized.warnings,
          updated: Number(stored.updated || 0) || Date.now()
        });

        // --- 読んだデータを KV に保存 ---
        if (statusCache) {
           const ttl = statusCacheTtlSec || 60;
           logKvWrite('getTools', cacheKey);
           ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: ttl }));
        }

        logEnd('getTools');
        return new Response(responseBody, { headers: corsHeaders });
      }

      if (action === 'setTools') {
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);
        if (!roleIsOfficeAdmin(tokenRole)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        if (requestedOffice && requestedOffice !== tokenOffice && !canAdminOffice(tokenRole, tokenOffice, requestedOffice)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        let parsedTools;
        try {
          parsedTools = JSON.parse(formData.get('tools') || '[]');
        } catch (e) {
          return new Response(JSON.stringify({ error: 'bad_json' }), { headers: corsHeaders });
        }
        const normalized = normalizeToolsArray(parsedTools);
        const nowTs = Date.now();
        await firestoreUpsert(`offices/${officeId}/tools`, 'config', {
          fields: {
            tools: toFirestoreValue(normalized.list),
            updated: toFirestoreValue(nowTs)
          }
        });

        // --- キャッシュ無効化 ---
        if (statusCache) {
          try {
            await statusCache.delete(`tools:${officeId}`);
          } catch (e) { console.error('Cache invalidation failed (setTools):', e); }
        }

        return new Response(JSON.stringify({ ok: true, tools: normalized.list, warnings: normalized.warnings, updated: nowTs }), { headers: corsHeaders });
      }

      // getEventColorMap: イベントカラーマップ取得
      // 【フェーズ3実装】フェーズ1と同一ロジック
      if (action === 'getEventColorMap') {
        logStart('getEventColorMap');
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);

        // --- KV を読む ---
        const cacheKey = `eventColors:${officeId}`;
        if (statusCache) {
          try {
            const cached = await statusCache.get(cacheKey);
            // KV hit の場合は即 return（Firestore 処理禁止）
            if (cached) {
              logKvHit('getEventColorMap', cacheKey);
              logEnd('getEventColorMap');
              return new Response(cached, { headers: corsHeaders });
            }
            logKvMiss('getEventColorMap', cacheKey);
          } catch (e) {}
        }

        // KV miss の場合のみ Firestore を 1 回読む
        logFirestoreRead('getEventColorMap', `offices/${officeId}/eventColors/config`);
        const colorDoc = await firestoreFetchOptional(`offices/${officeId}/eventColors/config`);
        const stored = colorDoc ? fromFirestoreDoc(colorDoc) : {};
        const normalized = normalizeEventColorMap(stored);
        if (!normalized.updated) {
          normalized.updated = Date.now();
        }
        
        const responseBody = JSON.stringify(normalized);

        // --- 読んだデータを KV に保存 ---
        if (statusCache) {
           const ttl = statusCacheTtlSec || 60;
           logKvWrite('getEventColorMap', cacheKey);
           ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: ttl }));
        }

        logEnd('getEventColorMap');
        return new Response(responseBody, { headers: corsHeaders });
      }

      if (action === 'setEventColorMap') {
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);
        if (!roleIsOfficeAdmin(tokenRole)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        if (requestedOffice && requestedOffice !== tokenOffice && !canAdminOffice(tokenRole, tokenOffice, requestedOffice)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        let payload;
        try {
          payload = JSON.parse(formData.get('data') || '{}') || {};
        } catch (e) {
          return new Response(JSON.stringify({ error: 'bad_json' }), { headers: corsHeaders });
        }
        const normalized = normalizeEventColorMap(payload);
        const nowTs = Date.now();
        await firestoreUpsert(`offices/${officeId}/eventColors`, 'config', {
          fields: {
            colors: toFirestoreValue(normalized.colors || {}),
            updated: toFirestoreValue(nowTs)
          }
        });

        // --- キャッシュ無効化 ---
        if (statusCache) {
          try {
            await statusCache.delete(`eventColors:${officeId}`);
          } catch (e) { console.error('Cache invalidation failed (setEventColorMap):', e); }
        }

        return new Response(JSON.stringify({ ok: true, colors: normalized.colors || {}, updated: nowTs }), { headers: corsHeaders });
      }

      // getVacation: 休暇データの取得
      // 【フェーズ3+4実装】
      // 設計原則:
      //   1. KV を読む
      //   2. KV hit の場合は即 return（Firestore 処理禁止）
      //   3. KV miss の場合のみ Firestore を 1 回読む
      //   4. 読んだデータを KV に保存
      //   5. nocache=1 は管理者のみ有効（フェーズ4）
      if (action === 'getVacation') {
        logStart('getVacation');
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);
        
        // ★フェーズ4: nocache=1 は管理者のみ有効
        const noCacheRequested = formData.get('nocache') === '1';
        const isAdmin = roleIsOfficeAdmin(tokenRole);
        const useNoCache = noCacheRequested && isAdmin;
        
        if (useNoCache) {
          console.log(`${LOG_PREFIX} NOCACHE_ADMIN - action=getVacation, officeId=${officeId}`);
        }

        // --- KV を読む（管理者のnocache時はスキップ） ---
        const cacheKey = `vacations:${officeId}`;
        if (!useNoCache && statusCache) {
          try {
            const cached = await statusCache.get(cacheKey);
            // KV hit の場合は即 return（Firestore 処理禁止）
            if (cached) {
              logKvHit('getVacation', cacheKey);
              logEnd('getVacation');
              return new Response(cached, { headers: corsHeaders });
            }
            logKvMiss('getVacation', cacheKey);
          } catch (e) {}
        }

        // KV miss の場合のみ Firestore を 1 回読む（または管理者のnocache時）
        logFirestoreRead('getVacation', `offices/${officeId}/vacations`);
        const json = await firestoreFetchOptional(`offices/${officeId}/vacations?pageSize=200`);
        let vacations = (json?.documents || []).map(doc => normalizeVacationItem({
          id: doc.name.split('/').pop(),
          ...fromFirestoreDoc(doc)
        }, officeId)).filter(Boolean);
        vacations = vacations.map((v, idx) => {
          const orderVal = Number(v.order || 0);
          return { ...v, order: orderVal > 0 ? orderVal : (idx + 1) };
        }).sort((a, b) => {
          const ao = Number(a.order || 0);
          const bo = Number(b.order || 0);
          if (ao !== bo) return ao - bo;
          return Number(a.updated || 0) - Number(b.updated || 0);
        });
        
        const responseBody = JSON.stringify({ vacations, updated: Date.now() });

        // --- キャッシュ保存 ---
        if (statusCache) {
           const ttl = statusCacheTtlSec || 60;
           logKvWrite('getVacation', cacheKey);
           ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: ttl }));
        }

        logEnd('getVacation');
        return new Response(responseBody, { headers: corsHeaders });
      }

      if (action === 'setVacationBits') {
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);
        // 権限チェック: ログインしていればOK（officeAdminでなくても良い）
        if (!tokenRole) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        }

        let payload;
        try {
          payload = JSON.parse(formData.get('data') || '{}') || {};
        } catch (e) {
          return new Response(JSON.stringify({ error: 'bad_json' }), { headers: corsHeaders });
        }

        const id = payload.id;
        const membersBits = String(payload.membersBits || '').trim();

        if (!id) {
          return new Response(JSON.stringify({ error: 'bad_request' }), { headers: corsHeaders });
        }

        // 既存データの取得（存在確認）
        const docPath = `offices/${officeId}/vacations/${encodeURIComponent(id)}`;
        const existing = await firestoreFetchOptional(docPath);
        if (!existing) {
          return new Response(JSON.stringify({ error: 'not_found' }), { headers: corsHeaders });
        }

        // membersBits と updated のみを更新
        const nowTs = Date.now();
        await firestorePatch(docPath, {
          fields: {
            membersBits: toFirestoreValue(membersBits),
            updated: toFirestoreValue(nowTs)
          }
        }, ['membersBits', 'updated']);

        // 更新後のリストを返却（キャッシュ更新用）
        const json = await firestoreFetchOptional(`offices/${officeId}/vacations?pageSize=200`);
        let vacations = (json?.documents || []).map(doc => normalizeVacationItem({
          id: doc.name.split('/').pop(),
          ...fromFirestoreDoc(doc)
        }, officeId)).filter(Boolean);

        // 並び替え
        vacations = vacations.map((v, idx) => {
          const orderVal = Number(v.order || 0);
          return { ...v, order: orderVal > 0 ? orderVal : (idx + 1) };
        }).sort((a, b) => {
          const ao = Number(a.order || 0);
          const bo = Number(b.order || 0);
          if (ao !== bo) return ao - bo;
          return Number(a.updated || 0) - Number(b.updated || 0);
        });

        const savedItem = vacations.find(v => v.id === id) || null;

        // --- キャッシュ無効化 ---
        if (statusCache) {
          try {
            await statusCache.delete(`vacations:${officeId}`);
          } catch (e) { console.error('Cache invalidation failed (setVacationBits):', e); }
        }

        return new Response(JSON.stringify({ ok: true, id, vacation: savedItem, vacations }), { headers: corsHeaders });
      }

      if (action === 'setVacation') {
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);
        if (!roleIsOfficeAdmin(tokenRole)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        if (requestedOffice && requestedOffice !== tokenOffice && !canAdminOffice(tokenRole, tokenOffice, requestedOffice)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        let payload;
        try {
          payload = JSON.parse(formData.get('data') || '{}') || {};
        } catch (e) {
          return new Response(JSON.stringify({ error: 'bad_json' }), { headers: corsHeaders });
        }
        const json = await firestoreFetchOptional(`offices/${officeId}/vacations?pageSize=200`);
        let vacations = (json?.documents || []).map(doc => normalizeVacationItem({
          id: doc.name.split('/').pop(),
          ...fromFirestoreDoc(doc)
        }, officeId)).filter(Boolean);

        const id = payload.id || payload.vacationId || (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : `vac_${Date.now()}`);
        const title = String(payload.title || '').substring(0, 200);
        const startDate = String(payload.start || payload.startDate || '').trim();
        const endDate = String(payload.end || payload.endDate || '').trim();
        const noticeId = String(payload.noticeId || payload.noticeKey || '').substring(0, 200);
        const noticeTitle = String(payload.noticeTitle || '').substring(0, 200);
        const note = String(payload.note || noticeTitle || '').substring(0, 2000);
        const membersBits = String(payload.membersBits || '').trim();
        const visible = coerceVacationVisibleFlag(payload.visible);
        const isVacation = coerceVacationTypeFlag(payload.isVacation);
        const color = String(payload.color || payload.eventColor || 'amber').trim() || 'amber';
        const orderRaw = Number(payload.order || payload.sortOrder || 0);
        const hasOrder = Number.isFinite(orderRaw) && orderRaw > 0;
        const base = { id, office: officeId, title, startDate, endDate, note, noticeId, noticeTitle, membersBits, visible, isVacation, color, updated: Date.now() };
        if (hasOrder) {
          base.order = orderRaw;
        }
        const newItem = normalizeVacationItem(base, officeId);
        const existingIndex = vacations.findIndex(v => v.id === id);
        if (existingIndex >= 0) {
          vacations[existingIndex] = newItem;
        } else {
          vacations.push(newItem);
        }

        vacations = vacations.map((v, idx) => {
          const orderVal = Number(v.order || 0);
          return { ...v, order: orderVal > 0 ? orderVal : (idx + 1) };
        }).sort((a, b) => {
          const ao = Number(a.order || 0);
          const bo = Number(b.order || 0);
          if (ao !== bo) return ao - bo;
          return Number(a.updated || 0) - Number(b.updated || 0);
        }).map((v, idx) => normalizeVacationItem({ ...v, order: Number(v.order || 0) || (idx + 1) }, officeId));

        const writes = vacations.map(v => ({
          update: {
            name: `projects/${projectId}/databases/(default)/documents/offices/${officeId}/vacations/${encodeURIComponent(v.id)}`,
            fields: {
              title: toFirestoreValue(v.title || ''),
              startDate: toFirestoreValue(v.startDate || ''),
              endDate: toFirestoreValue(v.endDate || ''),
              office: toFirestoreValue(v.office || officeId),
              noticeId: toFirestoreValue(v.noticeId || ''),
              noticeTitle: toFirestoreValue(v.noticeTitle || ''),
              note: toFirestoreValue(v.note || ''),
              membersBits: toFirestoreValue(v.membersBits || ''),
              visible: toFirestoreValue(v.visible === true),
              isVacation: toFirestoreValue(v.isVacation !== false),
              color: toFirestoreValue(v.color || 'amber'),
              order: toFirestoreValue(Number(v.order || 0)),
              updated: toFirestoreValue(Number(v.updated || 0) || Date.now())
            }
          },
          updateMask: { fieldPaths: ['title', 'startDate', 'endDate', 'office', 'noticeId', 'noticeTitle', 'note', 'membersBits', 'visible', 'isVacation', 'color', 'order', 'updated'] }
        }));
        for (let i = 0; i < writes.length; i += BATCH_WRITE_SIZE) {
          await firestoreBatchWrite(writes.slice(i, i + BATCH_WRITE_SIZE));
        }

        const savedItem = vacations.find(v => v.id === id) || newItem;

        // --- キャッシュ無効化 ---
        if (statusCache) {
          try {
            await statusCache.delete(`vacations:${officeId}`);
          } catch (e) { console.error('Cache invalidation failed (setVacation):', e); }
        }

        return new Response(JSON.stringify({ ok: true, id, vacation: savedItem, vacations }), { headers: corsHeaders });
      }

      if (action === 'deleteVacation') {
        const requestedOffice = formData.get('office') || '';
        const officeId = resolveOffice(requestedOffice);
        if (!roleIsOfficeAdmin(tokenRole)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        if (requestedOffice && requestedOffice !== tokenOffice && !canAdminOffice(tokenRole, tokenOffice, requestedOffice)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { headers: corsHeaders });
        }
        const id = (formData.get('id') || '').trim();
        if (!id) {
          return new Response(JSON.stringify({ error: 'bad_request' }), { headers: corsHeaders });
        }
        await firestoreDelete(`offices/${officeId}/vacations/${encodeURIComponent(id)}`);

        // --- キャッシュ無効化 ---
        if (statusCache) {
          try {
            await statusCache.delete(`vacations:${officeId}`);
          } catch (e) { console.error('Cache invalidation failed (deleteVacation):', e); }
        }

        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // publicListOffices: 拠点一覧
      if (action === 'publicListOffices') {
        const json = await firestoreFetch(`offices`);
        const offices = (json.documents || []).map(doc => ({
          id: doc.name.split('/').pop(),
          name: doc.fields?.name?.stringValue || doc.name.split('/').pop()
        }));
        return new Response(JSON.stringify({ ok: true, offices }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: 'unknown_action' }), { headers: corsHeaders });

    } catch (e) {
      // エラーハンドリング
      return new Response(JSON.stringify({ error: e.message, ok: false }), { status: 500, headers: corsHeaders });
    }
  }
};

// --- Google Auth ---
async function getGoogleAuthToken(env) {
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const binaryDer = Uint8Array.from(atob(pem.split('-----')[2].replace(/\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", binaryDer.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = btoa(JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now }));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const strSig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${claim}.${strSig}`
  });
  return (await res.json()).access_token;
}

function defaultMenus() {
  return {
    timeStepMinutes: 30,
    statuses: [
      { value: "在席", class: "st-here", clearOnSet: true },
      { value: "外出", requireTime: true, class: "st-out" },
      { value: "在宅勤務", class: "st-remote", clearOnSet: true },
      { value: "出張", requireTime: true, class: "st-trip" },
      { value: "研修", requireTime: true, class: "st-training" },
      { value: "健康診断", requireTime: true, class: "st-health" },
      { value: "コアドック", requireTime: true, class: "st-coadoc" },
      { value: "帰宅", class: "st-home", clearOnSet: true },
      { value: "休み", class: "st-off", clearOnSet: true }
    ],
    noteOptions: ["直出", "直帰", "直出・直帰"],
    businessHours: [
      "07:00-15:30",
      "07:30-16:00",
      "08:00-16:30",
      "08:30-17:00",
      "09:00-17:30",
      "09:30-18:00",
      "10:00-18:30",
      "10:30-19:00",
      "11:00-19:30",
      "11:30-20:00",
      "12:00-20:30"
    ]
  };
}

function normalizeConfig(cfg) {
  const groupsSrc = Array.isArray(cfg?.groups) ? cfg.groups : [];
  return {
    version: 2,
    updated: Number(cfg?.updated || 0),
    groups: groupsSrc.map(g => {
      const members = Array.isArray(g?.members) ? g.members : [];
      return {
        title: String(g?.title || ''),
        members: members.map(m => ({
          id: String(m?.id || '').trim(),
          name: String(m?.name || ''),
          ext: String(m?.ext || ''),
          mobile: String(m?.mobile || ''),
          email: String(m?.email || ''),
          workHours: m?.workHours == null ? '' : String(m.workHours)
        })).filter(m => m.id || m.name)
      };
    }),
    menus: (cfg?.menus && typeof cfg.menus === 'object') ? cfg.menus : defaultMenus()
  };
}

function fromFirestoreDoc(doc) {
  const fields = doc?.fields || {};
  const out = {};
  Object.keys(fields).forEach(key => {
    out[key] = fromFirestoreValue(fields[key]);
  });
  return out;
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const values = value.arrayValue.values || [];
    return values.map(fromFirestoreValue);
  }
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {};
    const out = {};
    Object.keys(fields).forEach(key => {
      out[key] = fromFirestoreValue(fields[key]);
    });
    return out;
  }
  return null;
}

function toFirestoreValue(value) {
  if (value == null) return { nullValue: null };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === 'object') {
    const fields = {};
    Object.keys(value).forEach(key => {
      fields[key] = toFirestoreValue(value[key]);
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

const MAX_NOTICES_PER_OFFICE = 100;
const MAX_EVENT_COLOR_ENTRIES = 400;
const MAX_TOOLS_PER_OFFICE = 300;
const EVENT_COLOR_KEYS = ['amber', 'blue', 'green', 'pink', 'purple', 'teal', 'gray'];

function roleIsOfficeAdmin(role) {
  return role === 'officeAdmin' || role === 'superAdmin';
}

function canAdminOffice(role, tokenOffice, office) {
  if (role === 'superAdmin') return true;
  return role === 'officeAdmin' && tokenOffice === office;
}

function coerceNoticeArray(src) {
  if (src == null) return [];
  if (Array.isArray(src)) return src;
  if (typeof src === 'string') {
    const trimmed = src.trim();
    if (!trimmed) return [];
    if (trimmed[0] === '[' || trimmed[0] === '{') {
      try { return coerceNoticeArray(JSON.parse(trimmed)); } catch (_) { }
    }
    return [trimmed];
  }
  if (typeof src === 'object') {
    if (Array.isArray(src.list)) return src.list;
    if (Array.isArray(src.items)) return src.items;
    return Object.keys(src).sort().map(k => src[k]).filter(v => v != null);
  }
  return [];
}

function coerceNoticeVisibleFlag(raw) {
  if (raw === false) return false;
  if (raw === true || raw == null) return true;
  const s = String(raw).toLowerCase();
  return !(s === 'false' || s === '0' || s === 'off' || s === 'no' || s === 'hide');
}

function normalizeNoticeItem(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    return { title: text.substring(0, 200), content: '', display: true, visible: true };
  }
  if (Array.isArray(raw)) {
    const title = raw[0] == null ? '' : String(raw[0]).substring(0, 200);
    const content = raw[1] == null ? '' : String(raw[1]).substring(0, 2000);
    if (!title.trim() && !content.trim()) return null;
    return { title, content, display: true, visible: true };
  }
  if (typeof raw !== 'object') return null;
  const id = raw.id != null ? raw.id : (raw.noticeId != null ? raw.noticeId : (raw.uid != null ? raw.uid : undefined));
  const titleSrc = raw.title != null ? raw.title : (raw.subject != null ? raw.subject : raw.headline);
  const contentSrc = raw.content != null ? raw.content : (raw.body != null ? raw.body : (raw.text != null ? raw.text : raw.description));
  const title = titleSrc == null ? '' : String(titleSrc).substring(0, 200);
  const content = contentSrc == null ? '' : String(contentSrc).substring(0, 2000);
  const visible = coerceNoticeVisibleFlag(raw.visible != null ? raw.visible : (raw.display != null ? raw.display : (raw.show != null ? raw.show : true)));
  if (!title.trim() && !content.trim()) return null;
  const result = { title, content, display: visible, visible: visible };
  if (id != null) result.id = id;
  if (raw.order != null) result.order = Number(raw.order || 0);
  return result;
}

function normalizeNoticesArray(raw) {
  const arr = coerceNoticeArray(raw);
  const normalized = arr.map(normalizeNoticeItem).filter(Boolean);
  if (normalized.length > MAX_NOTICES_PER_OFFICE) {
    return normalized.slice(0, MAX_NOTICES_PER_OFFICE);
  }
  return normalized;
}

function coerceToolArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed[0] === '[' || trimmed[0] === '{') {
      try { return coerceToolArray(JSON.parse(trimmed)); } catch (_) { }
    }
    return [trimmed];
  }
  if (typeof raw === 'object') {
    if (Array.isArray(raw.list)) return raw.list;
    if (Array.isArray(raw.items)) return raw.items;
    return Object.keys(raw).sort().map(k => raw[k]).filter(v => v != null);
  }
  return [];
}

function coerceToolVisibleFlag(raw) {
  if (raw === true || raw == null) return true;
  if (raw === false) return false;
  const s = String(raw).trim().toLowerCase();
  return !(s === 'false' || s === '0' || s === 'off' || s === 'no' || s === 'hide');
}

function ensureUniqueToolId(ctx, preferred) {
  let base = (preferred == null ? '' : String(preferred)).trim();
  if (!base) { base = `tool_${ctx.seq}`; ctx.seq += 1; }
  let id = base;
  let i = 1;
  while (ctx.seen.has(id)) {
    id = `${base}_${i}`;
    i += 1;
  }
  ctx.seen.add(id);
  return id;
}

function normalizeToolItem(raw, ctx, parentId) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    const id = ensureUniqueToolId(ctx, `tool_${ctx.seq}`);
    return { id, title: text, url: '', note: '', visible: true, display: true, parentId: parentId || '', children: [] };
  }
  if (typeof raw !== 'object') return null;

  const idRaw = raw.id ?? raw.toolId ?? raw.key;
  const id = ensureUniqueToolId(ctx, idRaw);
  const titleSrc = raw.title ?? raw.name ?? raw.label ?? '';
  const urlSrc = raw.url ?? raw.link ?? '';
  const noteSrc = raw.note ?? raw.memo ?? raw.remark ?? '';
  const visible = coerceToolVisibleFlag(raw.visible ?? raw.display ?? raw.show ?? true);
  const parentSrc = raw.parentId != null ? String(raw.parentId) : '';
  const titleStr = String(titleSrc || '').trim();
  const urlStr = String(urlSrc || '').trim();
  const noteStr = String(noteSrc || '').trim();
  const parent = parentSrc.trim() || parentId || '';
  const node = {
    id,
    title: titleStr || urlStr || id,
    url: urlStr,
    note: noteStr,
    visible,
    display: visible,
    parentId: parent,
    children: []
  };
  const childrenRaw = coerceToolArray(raw.children ?? raw.items ?? []);
  childrenRaw.forEach(child => {
    const c = normalizeToolItem(child, ctx, id);
    if (c) { ctx.nodes.push(c); }
  });
  return node;
}

function normalizeToolsArray(raw) {
  const arr = coerceToolArray(raw);
  const ctx = { seq: 0, seen: new Set(), nodes: [], warnings: [] };

  arr.forEach(item => {
    const n = normalizeToolItem(item, ctx, '');
    if (n) { ctx.nodes.push(n); }
  });

  const filtered = ctx.nodes.filter(n => n && (n.title || n.url || n.note));
  const map = new Map();
  filtered.forEach(n => { n.children = []; map.set(n.id, n); });

  filtered.forEach(n => {
    let pid = n.parentId || '';
    if (pid && (!map.has(pid) || pid === n.id)) {
      if (pid === n.id) { ctx.warnings.push(`ツール ${n.id} が自身を親にしていたためルートに移動しました`); }
      if (!map.has(pid)) { ctx.warnings.push(`ツール ${n.id} の親 ${pid} が存在しないためルートに移動しました`); }
      pid = '';
    }
    n.parentId = pid;
  });

  filtered.forEach(n => {
    const visited = new Set();
    let pid = n.parentId;
    while (pid) {
      if (visited.has(pid)) {
        ctx.warnings.push(`ツール ${n.id} の親子関係に循環が見つかったためルートに移動しました`);
        n.parentId = '';
        break;
      }
      visited.add(pid);
      const p = map.get(pid);
      if (!p) { n.parentId = ''; break; }
      pid = p.parentId;
    }
  });

  filtered.forEach(n => {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId).children.push(n);
    }
  });

  const roots = filtered.filter(n => !n.parentId);
  let count = 0;
  function prune(list) {
    const out = [];
    list.forEach(item => {
      if (count >= MAX_TOOLS_PER_OFFICE) { return; }
      count += 1;
      if (item.children && item.children.length) {
        item.children = prune(item.children);
      }
      out.push(item);
    });
    return out;
  }
  const pruned = prune(roots);
  if (count < filtered.length) {
    ctx.warnings.push(`ツールが${MAX_TOOLS_PER_OFFICE}件を超えたため、超過分を省略しました`);
  }
  return { list: pruned, warnings: ctx.warnings };
}

function filterVisibleTools(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach(item => {
    if (!item) return;
    const visible = coerceToolVisibleFlag(item.visible != null ? item.visible : (item.display != null ? item.display : true));
    if (!visible) return;
    const copy = Object.assign({}, item);
    copy.children = filterVisibleTools(item.children || []);
    out.push(copy);
  });
  return out;
}

function coerceVacationVisibleFlag(raw) {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (!s) return false;
    return !(s === 'false' || s === '0' || s === 'off' || s === 'no' || s === 'hide');
  }
  return false;
}

function coerceVacationTypeFlag(raw) {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (!s) return true;
    return !(s === 'false' || s === '0' || s === 'off' || s === 'no' || s === 'hide');
  }
  if (typeof raw === 'number') return raw !== 0;
  return true;
}

function normalizeDateStr(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeEventColorKey(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return EVENT_COLOR_KEYS.includes(s) ? s : '';
}

function normalizeEventColorMap(raw) {
  const source = (raw && typeof raw === 'object' && raw.colors && typeof raw.colors === 'object')
    ? raw.colors
    : (raw && typeof raw === 'object' ? raw : {});
  const out = { colors: {}, updated: Number(raw && raw.updated || 0) || 0 };
  Object.keys(source || {}).sort().slice(0, MAX_EVENT_COLOR_ENTRIES).forEach(date => {
    const normalizedDate = normalizeDateStr(date);
    const colorKey = normalizeEventColorKey(source[date]);
    if (normalizedDate && colorKey) {
      out.colors[normalizedDate] = colorKey;
    }
  });
  if (!out.updated) {
    out.updated = Date.now();
  }
  return out;
}

function normalizeVacationItem(raw, office) {
  if (raw == null) return null;
  const id = String(raw.id || raw.vacationId || '').trim();
  const title = String(raw.title || raw.subject || '').substring(0, 200);
  const startDate = String(raw.startDate || raw.start || raw.from || '').trim();
  const endDate = String(raw.endDate || raw.end || raw.to || '').trim();
  const noticeId = String(raw.noticeId || raw.noticeKey || '').trim();
  const noticeTitle = String(raw.noticeTitle || '').substring(0, 200);
  const note = String(raw.note || raw.memo || noticeTitle || '').substring(0, 2000);
  const membersBits = String(raw.membersBits || raw.bits || '').trim();
  const visible = coerceVacationVisibleFlag(raw.visible);
  const isVacation = coerceVacationTypeFlag(raw.isVacation);
  const color = String(raw.color || raw.eventColor || 'amber').trim() || 'amber';
  const orderRaw = Number(raw.order || raw.sortOrder || raw.position || 0);
  const order = Number.isFinite(orderRaw) && orderRaw > 0 ? orderRaw : 0;
  const updated = Number(raw.updated || raw.serverUpdated || 0) || Date.now();
  return { id, office: String(raw.office || office || ''), title, startDate, endDate, note, noticeId, noticeTitle, membersBits, updated, visible, isVacation, color, order };
}
