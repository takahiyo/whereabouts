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
      /* --- Request 処理 --- */
      const contentType = (req.headers.get('content-type') || '').toLowerCase();
      let body = {};
      const rawText = await req.text();

      if (rawText) {
        if (contentType.includes('application/json')) {
          try { body = JSON.parse(rawText); } catch { }
        } else {
          try {
            const params = new URLSearchParams(rawText);
            for (const [k, v] of params) body[k] = v;
          } catch {
            try { body = JSON.parse(rawText); } catch { }
          }
        }
      }

      const getParam = (key) => (body[key] !== undefined ? String(body[key]) : null);

      const action = getParam('action');
      const tokenOffice = getParam('tokenOffice') || '';
      const tokenRole = getParam('tokenRole') || '';

      const statusCache = env.STATUS_CACHE;
      const statusCacheTtlSec = Number(env.STATUS_CACHE_TTL_SEC || 60);

      /* --- Actions --- */

      /* --- LOGIN --- */
      if (action === 'login') {
        const officeId = getParam('office');
        const password = getParam('password');

        const office = await env.DB.prepare('SELECT * FROM offices WHERE id = ?')
          .bind(officeId)
          .first();

        if (!office) {
          return new Response(JSON.stringify({ error: 'unauthorized', code: 'office_not_found' }), { headers: corsHeaders });
        }

        let role = '';
        if (password === office.admin_password) role = 'officeAdmin';
        else if (password === office.password) role = 'user';
        else {
          return new Response(JSON.stringify({ error: 'unauthorized', code: 'invalid_password' }), { headers: corsHeaders });
        }

        return new Response(
          JSON.stringify({
            ok: true,
            role,
            office: officeId,
            officeName: office.name || officeId
          }),
          { headers: corsHeaders }
        );
      }

      /* --- GET CONFIG --- */
      if (action === 'getConfig') {
        const officeId = tokenOffice || 'nagoya_chuo';
        const nocache = getParam('nocache') === '1';
        const cacheKey = `config_v2:${officeId}`;

        if (!nocache && statusCache) {
          const cached = await statusCache.get(cacheKey);
          if (cached) return new Response(cached, { headers: corsHeaders });
        }

        const members = await env.DB.prepare('SELECT * FROM members WHERE office_id = ? ORDER BY display_order ASC, name ASC')
          .bind(officeId)
          .all();

        const groupsMap = {};
        (members.results || []).forEach(m => {
          const groupName = m.group_name || '未設定';
          if (!groupsMap[groupName]) groupsMap[groupName] = { title: groupName, members: [] };
          groupsMap[groupName].members.push({
            id: m.id,
            name: m.name,
            group: m.group_name,
            order: m.display_order,
            status: m.status,
            time: m.time,
            note: m.note,
            workHours: m.work_hours,
            ext: m.ext
          });
        });

        const responseBody = JSON.stringify({
          ok: true,
          groups: Object.values(groupsMap),
          updated: Date.now()
        });

        if (statusCache) {
          ctx.waitUntil(statusCache.put(cacheKey, responseBody, { expirationTtl: 3600 }));
        }

        return new Response(responseBody, { headers: corsHeaders });
      }

      /* --- PUBLIC LIST OFFICES --- */
      if (action === 'publicListOffices') {
        const offices = await env.DB.prepare('SELECT id, name FROM offices WHERE is_public = 1')
          .all();
        return new Response(JSON.stringify({ ok: true, offices: offices.results }), { headers: corsHeaders });
      }

      /* --- ADMIN LIST OFFICES (SuperAdmin用) --- */
      if (action === 'listOffices') {
        if (tokenRole !== 'superAdmin') {
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { headers: corsHeaders });
        }
        const offices = await env.DB.prepare('SELECT id, name FROM offices').all();
        return new Response(JSON.stringify({ ok: true, offices: offices.results }), { headers: corsHeaders });
      }

      /* --- GET (Differential Sync) --- */
      if (action === 'get') {
        const officeId = tokenOffice || 'nagoya_chuo';
        const since = Number(getParam('since') || 0);
        const nocache = getParam('nocache') === '1';

        const lastUpdateKey = `lastUpdate:${officeId}`;
        if (since > 0 && !nocache && statusCache) {
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

        let query, results;
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
            updated: m.updated,
            serverUpdated: m.updated
          };
          if (m.updated > maxUpdated) maxUpdated = m.updated;
        });

        const responseBody = JSON.stringify({
          ok: true,
          data,
          maxUpdated: maxUpdated || since || Date.now(),
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

      /* --- GET NOTICES --- */
      if (action === 'getNotices') {
        const officeId = getParam('office') || tokenOffice;
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
        const list = Array.isArray(JSON.parse(dataStr)) ? JSON.parse(dataStr) : [JSON.parse(dataStr)];
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
        const payload = JSON.parse(getParam('data') || '{}');
        if (!tokenOffice || !payload.id) return new Response(JSON.stringify({ error: 'invalid_request' }), { headers: corsHeaders });

        await env.DB.prepare('UPDATE vacations SET members_bits = ?, updated = ? WHERE office_id = ? AND id = ?')
          .bind(payload.membersBits || '', Date.now(), tokenOffice, payload.id)
          .run();

        if (statusCache) ctx.waitUntil(statusCache.delete(`vacation:${tokenOffice}`));
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      /* --- SET (Main Status Sync) --- */
      if (action === 'set') {
        if (!tokenOffice) return new Response(JSON.stringify({ error: 'unauthorized' }), { headers: corsHeaders });
        const payload = JSON.parse(getParam('data') || '{}');
        const updates = payload.data || {};
        const nowTs = Date.now();

        const statements = [];
        const rev = {};

        for (const [memberId, m] of Object.entries(updates)) {
          statements.push(
            env.DB.prepare('UPDATE members SET status=?, time=?, note=?, work_hours=?, updated=? WHERE office_id=? AND id=?')
              .bind(m.status, m.time, m.note, m.workHours, nowTs, tokenOffice, memberId)
          );
          rev[memberId] = nowTs;
        }

        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        if (statusCache) {
          ctx.waitUntil(Promise.all([
            statusCache.delete(`status:${tokenOffice}`),
            statusCache.put(`lastUpdate:${tokenOffice}`, String(nowTs))
          ]));
        }

        return new Response(JSON.stringify({ ok: true, rev, serverUpdated: rev }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: 'unknown_action', action }), { headers: corsHeaders });

    } catch (e) {
      console.error('[Worker Error]', e.message);
      return new Response(
        JSON.stringify({ ok: false, error: e.message, timestamp: Date.now() }),
        { status: 500, headers: corsHeaders }
      );
    }
  }
};
