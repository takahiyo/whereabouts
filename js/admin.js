/**
 * js/admin.js - 管理画面ロジック
 *
 * 管理画面のUI操作、データ保存、設定エクスポート/インポートなどを行う。
 * CSV処理ロジックは `js/services/csv.js` に委譲している。
 * 
 * 依存: js/globals.js, js/services/csv.js, js/constants/*.js
 */

/* 管理UIイベント */
const groupOrderList = document.getElementById('groupOrderList');
const groupOrderEmpty = document.getElementById('groupOrderEmpty');
const btnColumnSave = document.getElementById('btnColumnSave');
// renderColumnConfig はファイル後半（2300行目付近）の実装を使用します。ここでの空の定義を削除。
const btnAddOffice = document.getElementById('btnAddOffice');
const officeTableBody = document.getElementById('officeTableBody');
if (adminOfficeSel) {
  adminOfficeSel.addEventListener('change', () => {
    adminSelectedOfficeId = adminOfficeSel.value || '';
    adminMembersLoaded = false; adminMemberList = []; setMemberTableMessage('読み込み待ち');
    adminToolsLoaded = false; adminToolsOfficeId = '';
    refreshVacationOfficeOptions();
    if (document.getElementById('tabMembers')?.classList.contains('active')) {
      loadAdminMembers(true);
    }
    if (document.getElementById('tabGroups')?.classList.contains('active')) {
      loadAdminMembers(true);
    }
    if (document.getElementById('tabColumns')?.classList.contains('active')) {
      loadColumnConfig();
    }
    if (document.getElementById('tabNotices')?.classList.contains('active')) {
      autoLoadNoticesOnAdminOpen();
    }
    if (document.getElementById('tabEvents')?.classList.contains('active')) {
      loadVacationsList();
    }
    if (document.getElementById('tabTools')?.classList.contains('active')) {
      loadAdminTools(true);
    }
  });
}
if (vacationOfficeSelect) {
  vacationOfficeSelect.addEventListener('change', async () => {
    const officeId = vacationOfficeSelect.value || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
    if (typeof fetchNotices === 'function') {
      await fetchNotices(officeId);
    }
    refreshVacationNoticeOptions();
  });
}
btnExport.addEventListener('click', async () => {
  const office = selectedOfficeId(); if (!office) return;
  const cfg = await adminGetConfigFor(office);
  const dat = await adminGetFor(office);
  if (!(cfg && cfg.groups) || !(dat && typeof dat.data === 'object')) { toast('エクスポート失敗', false); return; }
  const csv = CsvService.makeNormalizedCSV(cfg, dat.data);
  const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const bytes = new TextEncoder().encode(csv);
  const blob = new Blob([BOM, bytes], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `presence_${office}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
});
btnImport.addEventListener('click', async () => {
  const office = selectedOfficeId(); if (!office) return;
  const file = csvFile.files && csvFile.files[0];
  if (!file) { toast('CSVを選択してください', false); return; }

  const text = await file.text();
  const normalizedText = text.replace(/^\uFEFF/, '');
  const rows = CsvService.parseCSV(normalizedText);
  if (!rows.length) { toast('CSVが空です', false); return; }
  const titleCell = (rows[0] && rows[0][0] != null) ? String(rows[0][0]) : '';
  if (!((rows[0] || []).length === 1 && titleCell.trim() === '在席管理CSV')) { toast('CSVヘッダが不正です', false); return; }
  if (rows.length < 2) { toast('CSVヘッダが不正です', false); return; }
  const expectedHeader = ['グループ番号', 'グループ名', '表示順', 'id', '氏名', '内線', '携帯番号', 'Email', '業務時間', 'ステータス', '戻り時間', '明日の予定', '備考'];
  const hdr = (rows[1] || []).map(s => s.trim());
  const headerOk = hdr.length === expectedHeader.length && expectedHeader.every((h, i) => hdr[i] === h);
  if (!headerOk) { toast('CSVヘッダが不正です', false); return; }

  const recs = [];
  const makeCsvId = (() => {
    let seq = 0;
    return () => `csv_${Date.now()}_${(seq++)}_${Math.random().toString(36).slice(2, 6)}`;
  })();

  // まず recs を作る（この段階で id を必ず埋める）
  for (const r of rows.slice(2)) {
    if (!r.some(x => (x || '').trim() !== '')) continue;
    if (r.length !== expectedHeader.length) { toast('CSVデータ行が不正です', false); return; }
    const [gi, gt, mi, id, name, ext, mobile, email, workHours, status, time, tomorrowPlan, note] = r;

    const fixedId = (id || '').trim() || makeCsvId();

    recs.push({
      gi: Number(gi) || 0,
      gt: (gt || ''),
      mi: Number(mi) || 0,
      id: fixedId,
      name: (name || ''),
      ext: (ext || ''),
      mobile: (mobile || ''),
      email: (email || ''),
      workHours: workHours == null ? '' : String(workHours),
      status: (status || (STATUSES[0]?.value || '在席')),
      time: (time || ''),
      tomorrowPlan: (tomorrowPlan || ''),
      note: (note || '')
    });
  }

  // groups を作る（id は必ず入っている前提）
  const groupsMap = new Map();
  for (const r of recs) {
    if (!r.gi || !r.mi || !r.name) continue;
    if (!groupsMap.has(r.gi)) groupsMap.set(r.gi, { title: r.gt || '', members: [] });
    const g = groupsMap.get(r.gi);
    g.title = r.gt || '';
    g.members.push({
      _mi: r.mi,
      name: r.name,
      ext: r.ext || '',
      mobile: r.mobile || '',
      email: r.email || '',
      workHours: r.workHours || '',
      tomorrowPlan: r.tomorrowPlan || '',
      id: r.id
    });
  }

  const groups = Array.from(groupsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([gi, g]) => {
      g.members.sort((a, b) => (a._mi || 0) - (b._mi || 0));
      g.members.forEach(m => delete m._mi);
      return g;
    });

  const cfgToSet = { version: 2, updated: Date.now(), groups, menus: MENUS || undefined };
  const r1 = await adminSetConfigFor(office, cfgToSet);
  if (!r1 || r1.error) {
    console.error('adminSetConfigFor failed:', r1);
    toast(`名簿の設定に失敗: ${r1?.error || 'unknown'}`, false);
    return;
  }

  // dataObj も「全行」必ず作る（id は必ずある）
  const dataObj = {};
  for (const r of recs) {
    const workHours = r.workHours || '';
    dataObj[r.id] = {
      ext: r.ext || '',
      mobile: r.mobile || '',
      email: r.email || '',
      workHours,
      status: STATUSES.some(s => s.value === r.status) ? r.status : (STATUSES[0]?.value || '在席'),
      time: r.time || '',
      tomorrowPlan: r.tomorrowPlan || '',
      note: r.note || ''
    };
  }

  const r2 = await adminSetForChunked(office, dataObj);
  if (!(r2 && r2.ok)) { toast('在席データ更新に失敗', false); return; }
  toast('インポート完了', true);

  if (!(r2 && r2.ok)) { toast('在席データ更新に失敗', false); return; }
  toast('インポート完了', true);
});
btnRenameOffice.addEventListener('click', async () => {
  const office = selectedOfficeId(); if (!office) return;
  const name = (renameOfficeName.value || '').trim();
  if (!name) { toast('新しい拠点名を入力', false); return; }
  const r = await adminRenameOffice(office, name);
  if (r && r.ok) { toast('拠点名を変更しました'); }
  else toast('変更に失敗', false);
});

btnSetPw.addEventListener('click', async () => {
  const office = selectedOfficeId(); if (!office) return;
  const pw = (setPw.value || '').trim();
  const apw = (setAdminPw.value || '').trim();
  if (!pw && !apw) { toast('更新する項目を入力', false); return; }
  const r = await adminSetOfficePassword(office, pw, apw);
  if (r && r.ok) { toast('パスワードを更新しました'); setPw.value = ''; setAdminPw.value = ''; }
  else toast('更新に失敗', false);
});

/* 管理モーダルのタブ切り替え */
if (adminModal) {
  const adminTabButtons = adminModal.querySelectorAll('.admin-tabs .tab-btn');
  const adminTabPanels = adminModal.querySelectorAll('.tab-panel');
  const resetPanelScroll = (panel) => {
    if (!panel) return;
    Array.from(panel.children).forEach((child) => {
      if (child.scrollHeight > child.clientHeight) {
        child.scrollTop = 0;
      }
    });
  };

  adminTabButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetTab = btn.dataset.tab;

      adminTabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      adminTabPanels.forEach(panel => panel.classList.remove('active'));
      const panelMap = {
        basic: adminModal.querySelector('#tabBasic'),
        groups: adminModal.querySelector('#tabGroups'),
        members: adminModal.querySelector('#tabMembers'),
        notices: adminModal.querySelector('#tabNotices'),
        events: adminModal.querySelector('#tabEvents'),
        tools: adminModal.querySelector('#tabTools'),
        columns: adminModal.querySelector('#tabColumns'),
        offices: adminModal.querySelector('#tabOffices')
      };
      const panel = panelMap[targetTab];
      if (panel) {
        panel.classList.add('active');
        resetPanelScroll(panel);

        // ★デバッグログ: タブ切り替え直後
        console.log(`[DEBUG] Tab Switch Initiated: ${targetTab}`);
      }

      if (targetTab === 'notices') {
        if (typeof autoLoadNoticesOnAdminOpen === 'function') {
          await autoLoadNoticesOnAdminOpen();
        }
      } else if (targetTab === 'basic') {
        // no-op for now
      } else if (targetTab === 'groups') {
        if (!adminMembersLoaded) { await loadAdminMembers(); }
        else { renderGroupOrderList(); }
      } else if (targetTab === 'members') {
        if (!adminMembersLoaded) { await loadAdminMembers(); }
        else { renderMemberTable(); }
      } else if (targetTab === 'events') {
        refreshVacationOfficeOptions();
        const officeId = (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
        if (typeof fetchNotices === 'function') {
          await fetchNotices(officeId);
        }
        refreshVacationNoticeOptions();
        await loadVacationsList();
      } else if (targetTab === 'tools') {
        await loadAdminTools();
      } else if (targetTab === 'columns') {
        await loadColumnConfig();
      } else if (targetTab === 'offices') {
        await loadOffices();
      }

      // CSS Grid レイアウトに委ね、前回のインラインスタイル残留をクリア
      const body = document.querySelector('.admin-card-body');
      if (body) {
        body.style.removeProperty('height');
        body.style.removeProperty('max-height');
        body.style.removeProperty('overflow-y');
        body.style.removeProperty('display');
      }
    });
  });
}

/* メンバー管理 */
let adminMemberList = [], adminMemberData = {}, adminGroupOrder = [], adminMembersLoaded = false;
let adminToolsLoaded = false, adminToolsOfficeId = '';
/* カラム構成の編集状態保持用 */
let adminColumnAllKeys = [], adminColumnUiState = {}, adminCustomColumnsState = [], adminColumnLcPrefix = 'adminColumnLc_';

if (btnMemberSave) { btnMemberSave.addEventListener('click', () => handleMemberSave()); }
if (btnColumnSave) { btnColumnSave.addEventListener('click', () => saveColumnConfig()); }
if (btnAddOffice) { btnAddOffice.addEventListener('click', () => addOffice()); }
  if (memberEditForm) {
    memberEditForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitMemberEdit();
    });
  }

  const btnOpenAddMember = document.getElementById('btnOpenAddMember');
  if (btnOpenAddMember) {
    btnOpenAddMember.addEventListener('click', () => {
      openAddMemberModal();
    });
  }

  const btnCloseMemberAdd = document.getElementById('btnCloseMemberAdd');
  if (btnCloseMemberAdd) {
    btnCloseMemberAdd.addEventListener('click', () => {
      closeAddMemberModal();
    });
  }

  const memberAddModal = document.getElementById('memberAddModal');
  if (memberAddModal) {
    memberAddModal.addEventListener('click', (e) => {
      if (e.target === memberAddModal) {
        closeAddMemberModal();
      }
    });
  }
if (memberEditReset) { memberEditReset.addEventListener('click', () => openMemberEditor(null)); }
if (memberFilterInput) { memberFilterInput.addEventListener('input', renderMemberTable); }
if (btnMemberFilterClear) {
  btnMemberFilterClear.addEventListener('click', () => {
    memberFilterInput.value = '';
    renderMemberTable();
  });
}

// グループ追加
const btnGroupAdd = document.getElementById('btnGroupAdd');
const groupAddInput = document.getElementById('groupAddInput');
if (btnGroupAdd && groupAddInput) {
  btnGroupAdd.addEventListener('click', () => {
    const name = groupAddInput.value.trim();
    if (!name) { toast('グループ名を入力してください', false); return; }
    if (adminGroupOrder.includes(name)) { toast('既に存在するグループ名です', false); return; }
    adminGroupOrder.push(name);
    groupAddInput.value = '';
    normalizeMemberOrdering();
    renderGroupOrderList();
    refreshMemberGroupOptions();
    toast(`グループ「${name}」を追加しました`);
  });
  groupAddInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnGroupAdd.click();
    }
  });
}

function setMemberTableMessage(msg) {
  if (!memberTableBody) return;
  memberTableBody.textContent = '';
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 7; td.className = 'text-center text-muted';
  td.textContent = msg;
  tr.appendChild(td);
  memberTableBody.appendChild(tr);
}

async function loadAdminMembers(force) {
  const office = selectedOfficeId(); if (!office) return;
  if (force !== true && adminMembersLoaded && adminMemberList.length) { return; }
  try {
    setMemberTableMessage('読み込み中...');
    const [cfg, dataRes] = await Promise.all([
      adminGetConfigFor(office),
      adminGetFor(office)
    ]);
    if (!(cfg && Array.isArray(cfg.groups))) { setMemberTableMessage('設定の取得に失敗しました'); return; }
    adminMemberData = (dataRes && dataRes.data && typeof dataRes.data === 'object') ? dataRes.data : {};
    adminGroupOrder = (cfg.groups || []).map(g => String(g.title || ''));
    adminMemberList = [];
    const seenIds = new Set();
    cfg.groups.forEach((g) => {
      (g.members || []).forEach((m, mi) => {
        const idRaw = String(m.id || '').trim();
        const id = idRaw || generateMemberId();
        if (seenIds.has(id)) { return; }
        seenIds.add(id);
        adminMemberList.push({
          id,
          name: String(m.name || ''),
          ext: String(m.ext || ''),
          mobile: String(m.mobile || ''),
          email: String(m.email || ''),
          workHours: (m.workHours == null ? '' : String(m.workHours)),
          group: String(g.title || ''),
          order: mi
        });
      });
    });
    normalizeMemberOrdering();
    renderMemberTable();
    renderGroupOrderList();
    openMemberEditor(null);
    adminMembersLoaded = true;
  } catch (err) {
    console.error('loadAdminMembers error', err);
    setMemberTableMessage('メンバーの取得に失敗しました');
  }
}

function normalizeMemberOrdering(options = {}) {
  const { preferCurrentOrder = false } = options;
  const orderBase = [];
  adminGroupOrder.forEach(g => {
    const name = String(g || '');
    if (!name.trim()) return;
    if (!orderBase.includes(name)) orderBase.push(name);
  });
  adminMemberList.forEach(m => {
    const name = String(m.group || '');
    if (name && !orderBase.includes(name)) { orderBase.push(name); }
  });
  adminGroupOrder = orderBase;
  if (preferCurrentOrder) {
    const counters = new Map();
    adminMemberList.forEach(m => {
      const cur = counters.get(m.group) || 0;
      m.order = cur;
      counters.set(m.group, cur + 1);
    });
  }
  adminMemberList.sort((a, b) => {
    const ga = orderBase.indexOf(a.group); const gb = orderBase.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return (a.order || 0) - (b.order || 0);
  });
  const counters = new Map();
  adminMemberList.forEach(m => {
    const cur = counters.get(m.group) || 0;
    m.order = cur;
    counters.set(m.group, cur + 1);
  });
}

function renderGroupOrderList() {
  if (!groupOrderList) return;
  groupOrderList.textContent = '';
  // 空文字を除外したユニークなリスト
  const order = [...new Set(adminGroupOrder.filter(g => (g || '').trim() !== ''))];
  if (groupOrderEmpty) {
    groupOrderEmpty.style.display = order.length ? 'none' : 'block';
  }

  order.forEach((groupName, idx) => {
    const item = document.createElement('div');
    item.className = 'group-order-item';
    item.dataset.groupName = groupName;

    // 名称表示用ラベル
    const label = document.createElement('span');
    label.className = 'group-order-label';
    label.textContent = groupName;
    label.title = 'クリックして名称変更';
    label.addEventListener('click', () => {
      // インライン編集に切り替え
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'group-edit-input';
      input.value = groupName;
      
      const finishEdit = () => {
        const newName = input.value.trim();
        if (newName && newName !== groupName) {
          renameGroup(groupName, newName);
        } else {
          // 変更なし、または空なら元に戻す
          item.replaceChild(label, input);
        }
      };

      input.addEventListener('blur', finishEdit);
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') input.blur();
      });

      item.replaceChild(input, label);
      input.focus();
    });

    const actions = document.createElement('div');
    actions.className = 'group-order-actions';

    const upBtn = document.createElement('button');
    upBtn.className = 'btn-move-up';
    upBtn.textContent = '▲';
    upBtn.title = '上に移動';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveGroupOrder(groupName, -1);
    });

    const downBtn = document.createElement('button');
    downBtn.className = 'btn-move-down';
    downBtn.textContent = '▼';
    downBtn.title = '下に移動';
    downBtn.disabled = idx === order.length - 1;
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveGroupOrder(groupName, 1);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger btn-sm';
    delBtn.innerHTML = '🗑️';
    delBtn.title = 'グループを削除';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteGroup(groupName);
    });

    actions.append(upBtn, downBtn, delBtn);
    item.append(label, actions);
    groupOrderList.appendChild(item);
  });
}

function renameGroup(oldName, newName) {
  if (!newName || oldName === newName) return;
  if (adminGroupOrder.includes(newName)) {
    toast(`「${newName}」は既に使用されています`, false);
    renderGroupOrderList();
    return;
  }

  // グループ順序の更新
  const idx = adminGroupOrder.indexOf(oldName);
  if (idx >= 0) {
    adminGroupOrder[idx] = newName;
  }

  // メンバー情報の更新
  adminMemberList.forEach(m => {
    if (m.group === oldName) {
      m.group = newName;
    }
  });

  normalizeMemberOrdering();
  renderGroupOrderList();
  renderMemberTable();
  refreshMemberGroupOptions();
  toast(`グループ名を「${newName}」に変更しました`);
}

function deleteGroup(groupName) {
  const membersCount = adminMemberList.filter(m => m.group === groupName).length;
  let msg = `グループ「${groupName}」を削除しますか？`;
  if (membersCount > 0) {
    msg += `\n注意：このグループに所属する ${membersCount} 名のメンバーも同時に削除されます。`;
  }

  if (!confirm(msg)) return;

  // グループ順序から削除
  adminGroupOrder = adminGroupOrder.filter(g => g !== groupName);
  // メンバーリストから削除
  adminMemberList = adminMemberList.filter(m => m.group !== groupName);

  normalizeMemberOrdering();
  renderGroupOrderList();
  renderMemberTable();
  refreshMemberGroupOptions();
  toast(`グループ「${groupName}」を削除しました`);
}

function moveGroupOrder(groupName, dir) {
  const order = [...new Set(adminGroupOrder.filter(g => (g || '').trim() !== ''))];
  const idx = order.indexOf(groupName);
  if (idx < 0) return;
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= order.length) return;
  const nextOrder = [...order];
  const [moving] = nextOrder.splice(idx, 1);
  nextOrder.splice(targetIdx, 0, moving);
  adminGroupOrder = nextOrder;
  normalizeMemberOrdering();
  renderMemberTable();
  renderGroupOrderList();
  refreshMemberGroupOptions();
}

function filteredMemberList() {
  const term = (memberFilterInput?.value || '').trim().toLowerCase();
  if (!term) { return [...adminMemberList]; }
  const words = term.split(/\s+/).filter(Boolean);
  return adminMemberList.filter(m => {
    const name = (m.name || '').toLowerCase();
    return words.every(w => name.includes(w));
  });
}

  function renderMemberTable() {
    console.log('[DEBUG] Calling renderMemberTable');
    const container = document.getElementById('memberTableBody');
  if (!memberTableBody) { return; }
  memberTableBody.textContent = '';
  if (!adminMemberList.length) {
    setMemberTableMessage('メンバーが登録されていません');
    return;
  }
  const rows = filteredMemberList();
  if (!rows.length) {
    setMemberTableMessage('条件に一致するメンバーが見つかりません');
    return;
  }


  const fragment = document.createDocumentFragment();
  let currentGroup = null;

  rows.forEach((m, idx) => {
    // グループヘッダーの挿入
    if (m.group !== currentGroup) {
      currentGroup = m.group;
      const groupTr = document.createElement('tr');
      groupTr.className = 'group-header-row'; // styles.cssで定義する
      const groupTd = document.createElement('td');
      groupTd.colSpan = 7;
      groupTd.textContent = currentGroup || '（グループ未設定）';
      groupTr.appendChild(groupTd);
      fragment.appendChild(groupTr);
    }

    const tr = document.createElement('tr');
    tr.dataset.memberId = m.id;

    // --- [修正] 左端: 順番列 (数字 + ボタン) ---
    const orderTd = document.createElement('td');
    // orderTd.className = 'member-order-cell'; // tdに直接flexを当てると罫線トラブルの原因になるので廃止

    const orderWrapper = document.createElement('div');
    orderWrapper.className = 'member-order-cell'; // ラッパーにクラスを移動

    // 3桁ゼロ埋め数字
    const numSpan = document.createElement('span');
    numSpan.className = 'member-order-num';
    numSpan.textContent = String(idx + 1).padStart(3, '0');

    // 移動ボタン群
    const moveActions = document.createElement('div');
    moveActions.className = 'member-move-actions';

    const upBtn = document.createElement('button');
    upBtn.className = 'btn-move-up';
    upBtn.textContent = '▲';
    upBtn.title = '上に移動';
    // 一番上の行は無効化
    upBtn.disabled = (idx === 0);
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveMember(m.id, -1);
    });

    const downBtn = document.createElement('button');
    downBtn.className = 'btn-move-down';
    downBtn.textContent = '▼';
    downBtn.title = '下に移動';
    // 一番下の行は無効化
    downBtn.disabled = (idx === rows.length - 1);
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveMember(m.id, 1);
    });

    moveActions.append(upBtn, downBtn);

    // レイアウト: 数字 + ボタン (コロン削除、ラッパーに追加)
    orderWrapper.append(numSpan, moveActions);
    orderTd.appendChild(orderWrapper);
    // ------------------------------------------

    // --- [修正] 属性列: インライン編集を可能にする ---
    const makeCellEditable = (td, memberId, fieldKey, options = {}) => {
      const { validation, numeric = false, list = null } = options;
      td.classList.add('editable-cell');
      td.title = 'クリックして編集';
      
      const originalValue = td.textContent;
      
      td.addEventListener('click', function onClick() {
        if (td.querySelector('input')) return;
        
        const input = document.createElement('input');
        input.type = numeric ? 'tel' : 'text';
        input.className = 'member-inline-input';
        if (list) input.setAttribute('list', list);
        input.value = td.textContent || '';
        
        const finishEdit = () => {
          const newValue = input.value.trim();
          if (newValue === td.textContent) {
            td.textContent = newValue;
            return;
          }
          
          // バリデーション
          if (validation) {
            const error = validation(newValue);
            if (error) {
              toast(error, false);
              td.textContent = originalValue;
              return;
            }
          }
          
          // データ更新
          const mIdx = adminMemberList.findIndex(m => m.id === memberId);
          if (mIdx >= 0) {
            adminMemberList[mIdx][fieldKey] = newValue;
            // 名簿の並び替え・再描画
            normalizeMemberOrdering();
            renderMemberTable();
            if (fieldKey === 'group') {
              renderGroupOrderList(); // グループ名が変わった可能性
              refreshMemberGroupOptions();
            }
          }
        };
        
        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') {
            input.value = originalValue;
            input.blur();
          }
        });
        
        td.textContent = '';
        td.appendChild(input);
        input.focus();
      });
    };

    const groupTd = document.createElement('td');
    groupTd.textContent = m.group || '';
    makeCellEditable(groupTd, m.id, 'group', {
      list: 'memberGroupOptions',
      validation: (v) => !v ? '所属グループは必須です' : null
    });

    const nameTd = document.createElement('td');
    nameTd.textContent = m.name || '';
    makeCellEditable(nameTd, m.id, 'name', {
      validation: (v) => !v ? '氏名は必須です' : null
    });

    const extTd = document.createElement('td');
    extTd.className = 'numeric-cell';
    extTd.textContent = m.ext || '';
    makeCellEditable(extTd, m.id, 'ext', {
      numeric: true,
      validation: (v) => (v && !/^\d{1,6}$/.test(v.replace(/[^0-9]/g, ''))) ? '内線は数字のみで入力してください（最大6桁）' : null
    });

    const mobileTd = document.createElement('td');
    mobileTd.className = 'numeric-cell';
    mobileTd.textContent = m.mobile || '';
    makeCellEditable(mobileTd, m.id, 'mobile', {
      numeric: true,
      validation: (v) => {
        const d = (v || '').replace(/[^0-9]/g, '');
        if (v && (d.length < 10 || d.length > 11)) return '携帯番号は10〜11桁の数字で入力してください';
        return null;
      }
    });

    const emailTd = document.createElement('td');
    emailTd.className = 'member-email-cell';
    emailTd.textContent = m.email || '';
    makeCellEditable(emailTd, m.id, 'email', {
      validation: (v) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? 'Emailの形式が不正です' : null
    });

    // --- [修正] 右端: 操作列 (横並びコンテナ) ---
    const actionTd = document.createElement('td');

    const actionRow = document.createElement('div');
    actionRow.className = 'member-row-actions'; // 横並び用クラス

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '削除';
    deleteBtn.className = 'btn-danger btn-sm';
    deleteBtn.title = 'メンバーを削除';
    deleteBtn.addEventListener('click', () => deleteMember(m.id));

    actionRow.appendChild(deleteBtn);
    actionTd.appendChild(actionRow);
    // ------------------------------------------

    tr.append(orderTd, groupTd, nameTd, extTd, mobileTd, emailTd, actionTd);
    fragment.appendChild(tr);
  });
  memberTableBody.appendChild(fragment);
}




function openMemberEditor(member) {
  // member 引数が渡された場合は無視し、常に新規追加（空の状態）にする
  if (memberEditId) memberEditId.value = '';
  if (memberEditName) memberEditName.value = '';
  if (memberEditExt) memberEditExt.value = '';
  if (memberEditMobile) memberEditMobile.value = '';
  if (memberEditEmail) memberEditEmail.value = '';
  if (memberEditGroup) memberEditGroup.value = '';
  
  if (memberEditModeLabel) {
    memberEditModeLabel.textContent = '新規メンバー登録フォーム';
  }
  refreshMemberGroupOptions();
}

function refreshMemberGroupOptions() {
  if (!memberGroupOptions) return;
  const groups = [...new Set(adminGroupOrder.filter(Boolean))];
  memberGroupOptions.textContent = '';
  groups.forEach(g => {
    const opt = document.createElement('option'); opt.value = g; memberGroupOptions.appendChild(opt);
  });
}

function submitMemberEdit() {
  const name = (memberEditName?.value || '').trim();
  const ext = (memberEditExt?.value || '').trim();
  const mobile = (memberEditMobile?.value || '').trim();
  const email = (memberEditEmail?.value || '').trim();
  const group = (memberEditGroup?.value || '').trim();
  const idRaw = (memberEditId?.value || '').trim();
  if (!name) { toast('氏名は必須です', false); return; }
  if (!group) { toast('所属グループを入力してください', false); return; }
  if (ext && !/^\d{1,6}$/.test(ext.replace(/[^0-9]/g, ''))) { toast('内線は数字のみで入力してください（最大6桁）', false); return; }
  const mobileDigits = mobile.replace(/[^0-9]/g, '');
  if (mobile && (mobileDigits.length < 10 || mobileDigits.length > 11)) { toast('携帯番号は10〜11桁の数字で入力してください（ハイフン可）', false); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Emailの形式が不正です', false); return; }
  const id = idRaw || generateUniqueMemberId();
  const existingIdx = adminMemberList.findIndex(m => m.id === id);
  if (existingIdx >= 0) {
    adminMemberList[existingIdx] = { ...adminMemberList[existingIdx], id, name, ext, mobile, email, group };
  } else {
    const order = adminMemberList.filter(m => m.group === group).length;
    adminMemberList.push({ id, name, ext, mobile, email, group, order, workHours: '' });
  }
  normalizeMemberOrdering();
  renderGroupOrderList();
  renderMemberTable();
  closeAddMemberModal();
}

function openAddMemberModal() {
  const modal = document.getElementById('memberAddModal');
  if (modal) {
    openMemberEditor(null);
    modal.classList.remove('u-hidden');
    document.body.style.overflow = 'hidden'; // 背景スクロール防止
  }
}

function closeAddMemberModal() {
  const modal = document.getElementById('memberAddModal');
  if (modal) {
    modal.classList.add('u-hidden');
    document.body.style.overflow = '';
  }
}

function generateMemberId() { return `member_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function generateUniqueMemberId() { let id = ''; do { id = generateMemberId(); } while (adminMemberList.some(m => m.id === id)); return id; }

function deleteMember(id) {
  if (!id) return; if (!confirm('このメンバーを削除しますか？')) return;
  adminMemberList = adminMemberList.filter(m => m.id !== id);
  normalizeMemberOrdering();
  renderGroupOrderList();
  renderMemberTable();
}

function moveMember(id, dir) {
  const idx = adminMemberList.findIndex(m => m.id === id); if (idx < 0) return;
  const group = adminMemberList[idx].group;
  let targetIdx = idx + dir;
  while (targetIdx >= 0 && targetIdx < adminMemberList.length && adminMemberList[targetIdx].group !== group) {
    targetIdx += dir;
  }
  if (targetIdx < 0 || targetIdx >= adminMemberList.length) return;
  const tmp = adminMemberList[targetIdx];
  adminMemberList[targetIdx] = adminMemberList[idx];
  adminMemberList[idx] = tmp;
  normalizeMemberOrdering({ preferCurrentOrder: true });
  renderMemberTable();
}

function buildMemberSavePayload() {
  const errors = []; const idSet = new Set();
  const defaultStatus = STATUSES[0]?.value || '在席';
  const cleaned = adminMemberList.map(m => ({
    ...m,
    name: (m.name || '').trim(),
    group: (m.group || '').trim(),
    ext: (m.ext || '').trim(),
    mobile: (m.mobile || '').trim(),
    email: (m.email || '').trim()
  }));
  for (const m of cleaned) {
    if (!m.name) { errors.push('missing_name'); break; }
    if (!m.group) { errors.push('missing_group'); break; }
    if (m.ext && !/^\d{1,6}$/.test(m.ext.replace(/[^0-9]/g, ''))) { errors.push('invalid_ext'); break; }
    const mobileDigits = m.mobile.replace(/[^0-9]/g, '');
    if (m.mobile && (mobileDigits.length < 10 || mobileDigits.length > 11)) { errors.push('invalid_mobile'); break; }
    if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) { errors.push('invalid_email'); break; }
    if (idSet.has(m.id)) { errors.push('duplicate_id'); break; }
    idSet.add(m.id);
  }
  if (errors.length) { return { errors }; }

  const groupOrder = [...adminGroupOrder];
  cleaned.forEach(m => { if (m.group && !groupOrder.includes(m.group)) groupOrder.push(m.group); });
  const grouped = new Map();
  cleaned.forEach(m => {
    const list = grouped.get(m.group) || []; list.push(m); grouped.set(m.group, list);
  });
  const groups = [];
  groupOrder.forEach(gName => {
    const mems = grouped.get(gName) || [];
    // if (!mems.length) return; // 空グループも保持する
    mems.sort((a, b) => (a.order || 0) - (b.order || 0));

    // ★修正: render()で正しく表示されるよう、現在のステータス情報(STATE_CACHE優先)を含める
    const groupsMembers = mems.map((m, idx) => {
      const live = (typeof STATE_CACHE !== 'undefined' ? STATE_CACHE[m.id] : {}) || {};
      const existing = adminMemberData[m.id] || {};
      const merged = { ...existing, ...live };
      return {
        id: m.id,
        name: m.name,
        ext: m.ext,
        mobile: m.mobile,
        email: m.email,
        workHours: merged.workHours == null ? '' : String(merged.workHours || m.workHours || ''),
        status: merged.status || '',
        time: merged.time || '',
        note: merged.note || '',
        tomorrowPlan: merged.tomorrowPlan || '',
        _order: idx
      };
    });

    groups.push({
      title: gName,
      members: groupsMembers
    });
  });

  // ★修正: メイン画面で変更された最新のステータス(STATE_CACHE)を優先的に参照
  const liveCache = (typeof STATE_CACHE !== 'undefined') ? STATE_CACHE : {};
  const dataObj = {};
  groups.forEach(g => {
    g.members.forEach(m => {
      // STATE_CACHE（リアルタイムの変更）を最優先、次にadminMemberData（管理画面読み込み時のデータ）
      const live = liveCache[m.id] || {};
      const existing = adminMemberData[m.id] || {};
      const merged = { ...existing, ...live };
      dataObj[m.id] = {
        ext: m.ext || '',
        mobile: m.mobile || '',
        email: m.email || '',
        workHours: merged.workHours == null ? '' : String(merged.workHours || m.workHours || ''),
        status: STATUSES.some(s => s.value === merged.status) ? merged.status : defaultStatus,
        time: merged.time || '',
        note: merged.note || ''
      };
    });
  });

  groups.forEach(g => g.members.forEach(m => delete m._order));
  return { groups, dataObj };
}

async function handleMemberSave() {
  const office = selectedOfficeId(); if (!office) return;
  const { groups, dataObj, errors } = buildMemberSavePayload();
  if (errors) {
    if (errors.includes('missing_name')) { toast('氏名は必須です', false); return; }
    if (errors.includes('missing_group')) { toast('所属グループを入力してください', false); return; }
    if (errors.includes('invalid_ext')) { toast('内線は数字のみで最大6桁です', false); return; }
    if (errors.includes('invalid_mobile')) { toast('携帯番号は10〜11桁の数字で入力してください', false); return; }
    if (errors.includes('invalid_email')) { toast('Emailの形式が不正です', false); return; }
    if (errors.includes('duplicate_id')) { toast('IDが重複しています。編集画面で修正してください', false); return; }
    toast('入力内容を確認してください', false); return;
  }

  // 管理画面からの保存では、ステータス・時間・備考・勤務時間は現在値を上書きせず、
  // DB内の最新値を維持させるため、送信データから除外する。
  // (連絡先情報 ext, mobile, email のみ更新対象とする)
  Object.values(dataObj).forEach(d => {
    delete d.status;
    delete d.time;
    delete d.note;
    delete d.workHours;
  });
  try {
    const cfgToSet = { version: 2, updated: Date.now(), groups, menus: MENUS || undefined };
    const r1 = await adminSetConfigFor(office, cfgToSet);
    if (!(r1 && r1.ok !== false)) { toast('名簿の保存に失敗しました', false); return; }
    if (office === CURRENT_OFFICE_ID && typeof normalizeConfigClient === 'function') {
      GROUPS = normalizeConfigClient({ groups });
      CONFIG_UPDATED = cfgToSet.updated;
      if (typeof render === 'function') {
        render();
        // ★修正: render()内部でもSTATE_CACHEは適用されるが、
        // 今回保存した最新の連絡先情報(dataObj)を確実に反映させる
        if (typeof applyState === 'function') {
          applyState(dataObj);
        }
      }
    }
    // ★修正: ローカルの管理用データも最新の状態に更新しておく
    Object.assign(adminMemberData, dataObj);

    const r2 = await adminSetForChunked(office, dataObj);
    if (!(r2 && r2.ok !== false)) toast('在席データの保存に失敗しました', false);
    else toast('保存しました');
  } catch (err) {
    console.error('handleMemberSave error', err);
    toast('保存に失敗しました', false);
  }
}

/* お知らせ管理UI */
btnAddNotice.addEventListener('click', () => addNoticeEditorItem());
function resolveNoticeVisibility(item) {
  if (!item || typeof item !== 'object') return true;
  if (Object.prototype.hasOwnProperty.call(item, 'visible')) {
    return item.visible !== false;
  }
  if (Object.prototype.hasOwnProperty.call(item, 'display')) {
    return item.display !== false;
  }
  return true;
}
btnLoadNotices.addEventListener('click', async () => {
  const office = selectedOfficeId(); if (!office) return;
  try {
    const params = { action: 'getNotices', token: SESSION_TOKEN, nocache: '1', office };
    const res = await apiPost(params);

    if (res && res.notices) {
      noticesEditor.innerHTML = '';
      if (res.notices.length === 0) {
        addNoticeEditorItem();
      } else {
        res.notices.forEach((n, idx) => {
          const visible = resolveNoticeVisibility(n);
          const id = n && (n.id != null ? n.id : (n.noticeId != null ? n.noticeId : idx));
          addNoticeEditorItem(n.title, n.content, visible, id);
        });
      }
      toast('お知らせを読み込みました');
    } else if (res && res.error) {
      toast('エラー: ' + res.error, false);
    }
  } catch (e) {
    console.error('Load notices error:', e);
    toast('お知らせの読み込みに失敗', false);
  }
});
btnSaveNotices.addEventListener('click', async () => {
  const office = selectedOfficeId(); if (!office) return;
  const items = noticesEditor.querySelectorAll('.notice-edit-item');
  const notices = [];
  items.forEach((item, idx) => {
    const title = (item.querySelector('.notice-edit-title').value || '').trim();
    const content = (item.querySelector('.notice-edit-content').value || '').trim();
    const displayToggle = item.querySelector('.notice-display-toggle');
    const visible = displayToggle ? displayToggle.checked : true;
    if (title || content) {
      const id = item.dataset.noticeId || `notice_${Date.now()}_${idx}`;
      notices.push({ id, title, content, visible, display: visible });
    }
  });


  const success = await saveNotices(notices, office);
  if (success) toast('お知らせを保存しました');
  else toast('お知らせの保存に失敗', false);
});

function addNoticeEditorItem(title = '', content = '', visible = true, id = null) {
  const item = document.createElement('div');
  item.className = 'notice-edit-item' + (visible ? '' : ' hidden-notice');
  item.draggable = true;
  if (id != null) item.dataset.noticeId = String(id);
  item.innerHTML = `
    <span class="notice-edit-handle">⋮⋮</span>
    <div class="notice-edit-row">
      <input type="text" class="notice-edit-title" placeholder="タイトル" value="${escapeHtml(title)}">
      <div class="notice-edit-controls">
        <label class="notice-visibility-toggle"><input type="checkbox" class="notice-display-toggle" ${visible ? 'checked' : ''}> 表示する</label>
        <button class="btn-move-up" title="上に移動">▲</button>
        <button class="btn-move-down" title="下に移動">▼</button>
        <button class="btn-remove-notice">削除</button>
      </div>
    </div>
    <textarea class="notice-edit-content" placeholder="内容（省略可）&#10;URLを記載すると自動的にリンクになります">${escapeHtml(content)}</textarea>
  `;

  // 削除ボタン
  item.querySelector('.btn-remove-notice').addEventListener('click', () => {
    if (confirm('このお知らせを削除しますか？')) {
      item.remove();
      updateMoveButtons();
    }
  });

  const displayToggle = item.querySelector('.notice-display-toggle');
  if (displayToggle) {
    displayToggle.addEventListener('change', () => {
      if (displayToggle.checked) {
        item.classList.remove('hidden-notice');
      } else {
        item.classList.add('hidden-notice');
      }
    });
  }

  // 上に移動ボタン
  item.querySelector('.btn-move-up').addEventListener('click', () => {
    const prev = item.previousElementSibling;
    if (prev) {
      noticesEditor.insertBefore(item, prev);
      updateMoveButtons();
    }
  });

  // 下に移動ボタン
  item.querySelector('.btn-move-down').addEventListener('click', () => {
    const next = item.nextElementSibling;
    if (next) {
      noticesEditor.insertBefore(next, item);
      updateMoveButtons();
    }
  });

  // ドラッグ&ドロップイベント
  item.addEventListener('dragstart', (e) => {
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    document.querySelectorAll('.notice-edit-item').forEach(i => i.classList.remove('drag-over'));
  });

  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const dragging = noticesEditor.querySelector('.dragging');
    if (dragging && dragging !== item) {
      const rect = item.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (e.clientY < midpoint) {
        noticesEditor.insertBefore(dragging, item);
      } else {
        noticesEditor.insertBefore(dragging, item.nextSibling);
      }
    }
  });

  noticesEditor.appendChild(item);
  updateMoveButtons();
}

// 上下移動ボタンの有効/無効を更新
function updateMoveButtons() {
  const items = noticesEditor.querySelectorAll('.notice-edit-item');
  items.forEach((item, index) => {
    const upBtn = item.querySelector('.btn-move-up');
    const downBtn = item.querySelector('.btn-move-down');
    if (upBtn) upBtn.disabled = (index === 0);
    if (downBtn) downBtn.disabled = (index === items.length - 1);
  });
}

/* ツール管理UI */
const btnSaveAutoClear = document.getElementById('btnSaveAutoClear');
if (btnSaveAutoClear) {
  btnSaveAutoClear.addEventListener('click', async () => {
    const office = selectedOfficeId(); if (!office) return;
    await saveAutoClearSettings(office);
  });
}

if (btnAddTool) { btnAddTool.addEventListener('click', () => addToolEditorItem()); }
if (btnLoadTools) { btnLoadTools.addEventListener('click', () => loadAdminTools(true)); }
if (btnSaveTools) {
  btnSaveTools.addEventListener('click', async () => {
    const office = selectedOfficeId(); if (!office) return;
    const items = toolsEditor.querySelectorAll('.tool-edit-item');
    const tools = [];
    items.forEach((item, idx) => {
      const title = (item.querySelector('.tool-edit-title').value || '').trim();
      const url = (item.querySelector('.tool-edit-url').value || '').trim();
      const note = (item.querySelector('.tool-edit-note').value || '').trim();
      const toggle = item.querySelector('.tool-display-toggle');
      const visible = toggle ? toggle.checked : true;
      if (!title && !url && !note) return;
      let childrenRaw = [];
      try {
        const stored = item.dataset.children || '[]';
        childrenRaw = JSON.parse(stored);
      } catch { }
      const normalizedChildren = Array.isArray(childrenRaw) ? normalizeTools(childrenRaw) : [];
      const id = item.dataset.toolId || `tool_${Date.now()}_${idx}`;
      tools.push({ id, title, url, note, visible, display: visible, children: normalizedChildren });
    });

    const success = await saveTools(tools, office);
    if (success) {
      adminToolsLoaded = true; adminToolsOfficeId = office;
      toast('ツールを保存しました');
    } else {
      toast('ツールの保存に失敗', false);
    }
  });
}

async function loadAdminTools(force = false) {
  const office = selectedOfficeId(); if (!office) return;
  if (!force && adminToolsLoaded && adminToolsOfficeId === office) return;
  try {
    const result = await fetchTools(office);
    const normalized = Array.isArray(result?.list) ? result.list : (Array.isArray(result) ? result : []);
    buildToolsEditor(normalized);
    if (!normalized.length) {
      addToolEditorItem();
    }
    // 自動消去設定の読み込み
    await loadAutoClearSettings(office);
    adminToolsLoaded = true; adminToolsOfficeId = office;
    if (force) { toast('ツールを読み込みました'); }
  } catch (err) {
    console.error('loadAdminTools error', err);
    toast('ツールの読み込みに失敗', false);
  }
}

/**
 * 拠点の自動消去設定をサーバーから読み込み、UIに反映する
 * @param {string} officeId 拠点ID
 */
async function loadAutoClearSettings(officeId) {
  try {
    const params = { action: 'getOfficeSettings', token: SESSION_TOKEN, office: officeId };
    const res = await apiPost(params);
    if (res && res.settings) {
      const s = res.settings;
      const elEnabled = document.getElementById('autoClearEnabled');
      const elHour = document.getElementById('autoClearHour');
      const elFields = document.getElementById('autoClearFields');

      if (elEnabled) elEnabled.checked = !!s.enabled;
      if (elHour) elHour.value = s.hour || 0;

      if (elFields) {
        const fields = s.fields || [];
        const cbs = elFields.querySelectorAll('input[type="checkbox"]');
        cbs.forEach(cb => {
          cb.checked = fields.includes(cb.value);
        });
      }
    }
  } catch (e) {
    console.error('loadAutoClearSettings error:', e);
  }
}

/**
 * 現在のUI上の自動消去設定をサーバーに保存する
 * @param {string} officeId 拠点ID
 */
async function saveAutoClearSettings(officeId) {
  try {
    const elEnabled = document.getElementById('autoClearEnabled');
    const elHour = document.getElementById('autoClearHour');
    const elFields = document.getElementById('autoClearFields');

    const enabled = elEnabled ? elEnabled.checked : false;
    const hour = elHour ? parseInt(elHour.value, 10) : 0;

    let fields = [];
    if (elFields) {
      const cbs = elFields.querySelectorAll('input[type="checkbox"]');
      fields = Array.from(cbs).filter(cb => cb.checked).map(cb => cb.value);
    }

    if (enabled && fields.length === 0) {
      toast('消去する項目を1つ以上選択してください', false);
      return;
    }

    const settings = { enabled, hour, fields };
    const params = {
      action: 'setOfficeSettings',
      token: SESSION_TOKEN,
      office: officeId,
      settings: JSON.stringify(settings)
    };

    const res = await apiPost(params);

    if (res && res.ok) {
      toast('自動消去設定を保存しました');
    } else {
      toast('設定の保存に失敗しました', false);
    }
  } catch (e) {
    console.error('saveAutoClearSettings error:', e);
    toast('設定の保存に失敗しました', false);
  }
}

function buildToolsEditor(list) {
  if (!toolsEditor) return;
  toolsEditor.innerHTML = '';
  const normalized = normalizeTools(list || []);
  if (!normalized.length) {
    addToolEditorItem();
    return;
  }
  normalized.forEach((tool, idx) => {
    const visible = coerceToolVisibleFlag(tool?.visible ?? tool?.display ?? true);
    addToolEditorItem(tool?.title || '', tool?.url || '', tool?.note || '', visible, tool?.children || [], tool?.id ?? idx);
  });
}

function addToolEditorItem(title = '', url = '', note = '', visible = true, children = null, id = null) {
  const item = document.createElement('div');
  item.className = 'tool-edit-item' + (visible ? '' : ' hidden-tool');
  item.draggable = true;
  if (id != null) item.dataset.toolId = String(id);
  if (children != null) {
    try { item.dataset.children = JSON.stringify(children); } catch { }
  }
  item.innerHTML = `
    <span class="tool-edit-handle">⋮⋮</span>
    <div class="tool-edit-row">
      <input type="text" class="tool-edit-title" placeholder="タイトル" value="${escapeHtml(title)}">
      <input type="url" class="tool-edit-url" placeholder="URL" value="${escapeHtml(url)}">
      <div class="tool-edit-controls">
        <label class="tool-visibility-toggle"><input type="checkbox" class="tool-display-toggle" ${visible ? 'checked' : ''}> 表示する</label>
        <button class="btn-move-up" title="上に移動">▲</button>
        <button class="btn-move-down" title="下に移動">▼</button>
        <button class="btn-remove-tool">削除</button>
      </div>
    </div>
    <textarea class="tool-edit-note" placeholder="備考（省略可）">${escapeHtml(note)}</textarea>
  `;

  item.querySelector('.btn-remove-tool').addEventListener('click', () => {
    if (confirm('このツールを削除しますか？')) {
      item.remove();
      updateToolMoveButtons();
    }
  });

  const displayToggle = item.querySelector('.tool-display-toggle');
  if (displayToggle) {
    displayToggle.addEventListener('change', () => {
      if (displayToggle.checked) {
        item.classList.remove('hidden-tool');
      } else {
        item.classList.add('hidden-tool');
      }
    });
  }

  item.querySelector('.btn-move-up').addEventListener('click', () => {
    const prev = item.previousElementSibling;
    if (prev) {
      toolsEditor.insertBefore(item, prev);
      updateToolMoveButtons();
    }
  });

  item.querySelector('.btn-move-down').addEventListener('click', () => {
    const next = item.nextElementSibling;
    if (next) {
      toolsEditor.insertBefore(next, item);
      updateToolMoveButtons();
    }
  });

  item.addEventListener('dragstart', (e) => {
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    document.querySelectorAll('.tool-edit-item').forEach(i => i.classList.remove('drag-over'));
  });

  item.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const dragging = toolsEditor.querySelector('.dragging');
    if (dragging && dragging !== item) {
      const rect = item.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (e.clientY < midpoint) {
        toolsEditor.insertBefore(dragging, item);
      } else {
        toolsEditor.insertBefore(dragging, item.nextSibling);
      }
    }
  });

  toolsEditor.appendChild(item);
  updateToolMoveButtons();
}

function updateToolMoveButtons() {
  const items = toolsEditor.querySelectorAll('.tool-edit-item');
  items.forEach((item, index) => {
    const upBtn = item.querySelector('.btn-move-up');
    const downBtn = item.querySelector('.btn-move-down');
    if (upBtn) upBtn.disabled = (index === 0);
    if (downBtn) downBtn.disabled = (index === items.length - 1);
  });
}

/* イベント管理UI */
if (btnVacationSave) { btnVacationSave.addEventListener('click', handleVacationSave); }
if (btnVacationDelete) { btnVacationDelete.addEventListener('click', handleVacationDelete); }
if (btnVacationReload) { btnVacationReload.addEventListener('click', () => loadVacationsList(true)); }
if (btnVacationClear) { btnVacationClear.addEventListener('click', resetVacationForm); }
if (btnCreateNoticeFromEvent) { btnCreateNoticeFromEvent.addEventListener('click', handleCreateNoticeFromEvent); }

function refreshVacationOfficeOptions() {
  if (!vacationOfficeSelect) return;
  const prev = vacationOfficeSelect.value || '';
  vacationOfficeSelect.textContent = '';

  const adminOptions = (adminOfficeSel && adminOfficeSel.options && adminOfficeSel.options.length) ? Array.from(adminOfficeSel.options) : [];
  const usableOptions = adminOptions.filter(o => o.value);
  if (usableOptions.length) {
    usableOptions.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value; o.textContent = opt.textContent || opt.value;
      vacationOfficeSelect.appendChild(o);
    });
  } else if (CURRENT_OFFICE_ID) {
    const o = document.createElement('option');
    o.value = CURRENT_OFFICE_ID; o.textContent = CURRENT_OFFICE_NAME || CURRENT_OFFICE_ID;
    vacationOfficeSelect.appendChild(o);
  } else {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '対象拠点を選択してください'; o.disabled = true; o.selected = true;
    vacationOfficeSelect.appendChild(o);
  }

  if (prev && vacationOfficeSelect.querySelector(`option[value="${prev}"]`)) {
    vacationOfficeSelect.value = prev;
  } else if (vacationOfficeSelect.options.length) {
    vacationOfficeSelect.selectedIndex = 0;
  }
}

function getVacationTargetOffice() {
  const office = (vacationOfficeSelect && vacationOfficeSelect.value) || selectedOfficeId();
  if (!office) { toast('対象拠点を選択してください', false); }
  return office;
}

function getNoticesForLookup() {
  return Array.isArray(window.CURRENT_NOTICES) ? window.CURRENT_NOTICES : [];
}

function getNoticesForSelection() {
  return getNoticesForLookup().filter(n => n && n.visible !== false && n.display !== false);
}

function refreshVacationNoticeOptions(selectedId) {
  if (!vacationNoticeSelect) return;
  const notices = getNoticesForSelection();
  const prev = selectedId !== undefined ? String(selectedId || '') : (vacationNoticeSelect.value || '');
  vacationNoticeSelect.textContent = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'お知らせを選択';
  vacationNoticeSelect.appendChild(placeholder);

  notices.forEach((notice, idx) => {
    const id = String(notice.id || notice.noticeId || notice.title || idx);
    const title = (notice.title || '(無題)').trim();
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = title;
    opt.dataset.title = title;
    vacationNoticeSelect.appendChild(opt);
  });

  const match = Array.from(vacationNoticeSelect.options || []).find(o => o.value === prev);
  vacationNoticeSelect.value = match ? prev : '';
}

function findNoticeSelectionForItem(item) {
  if (!item) return null;
  const notices = getNoticesForLookup();
  const desiredId = item.noticeId || item.noticeKey || '';
  const desiredTitle = item.noticeTitle || '';
  const legacyNote = item.note || item.memo || '';
  const candidates = [
    notices.find(n => String(n?.id || n?.noticeId || '') === String(desiredId)),
    notices.find(n => (n?.title || '') === desiredTitle),
    notices.find(n => (n?.title || '') === legacyNote)
  ].filter(Boolean);
  const picked = candidates[0];
  if (picked) {
    return { id: String(picked.id || picked.noticeId || picked.title || notices.indexOf(picked)), title: picked.title || desiredTitle || legacyNote || '' };
  }
  if (desiredId || desiredTitle) {
    return { id: String(desiredId || desiredTitle), title: desiredTitle || legacyNote || '' };
  }
  return null;
}

function getSelectedNoticeInfo() {
  if (!vacationNoticeSelect) return null;
  const val = vacationNoticeSelect.value || '';
  if (!val) return null;
  const notices = getNoticesForLookup();
  const found = notices.find(n => String(n?.id || n?.noticeId || n?.title || '') === val);
  const title = (found?.title || vacationNoticeSelect.selectedOptions?.[0]?.textContent || '').trim();
  return { id: val, title };
}

function resetVacationForm() {
  if (vacationTitleInput) vacationTitleInput.value = '';
  if (vacationStartInput) vacationStartInput.value = '';
  if (vacationEndInput) vacationEndInput.value = '';
  if (vacationNoticeSelect) { vacationNoticeSelect.value = ''; refreshVacationNoticeOptions(); }
  cachedVacationLegacyNote = '';
  if (vacationMembersBitsInput) vacationMembersBitsInput.value = '';
  if (vacationIdInput) vacationIdInput.value = '';
  if (vacationTypeText) vacationTypeText.value = '休暇固定（一覧で切替）';
  if (vacationColorSelect) vacationColorSelect.value = 'amber';
  if (window.VacationGantt) {
    window.VacationGantt.reset();
  }
}

function fillVacationForm(item) {
  if (!item) return;
  if (vacationTitleInput) vacationTitleInput.value = item.title || '';
  if (vacationStartInput) vacationStartInput.value = item.startDate || item.start || item.from || '';
  if (vacationEndInput) vacationEndInput.value = item.endDate || item.end || item.to || '';
  cachedVacationLegacyNote = item.note || item.memo || '';
  const noticeSel = findNoticeSelectionForItem(item);
  refreshVacationNoticeOptions(noticeSel?.id);
  if (vacationNoticeSelect) {
    vacationNoticeSelect.value = noticeSel?.id || '';
  }
  if (vacationMembersBitsInput) vacationMembersBitsInput.value = item.membersBits || item.bits || '';
  if (vacationIdInput) vacationIdInput.value = item.id || item.vacationId || '';
  if (vacationTypeText) vacationTypeText.value = getVacationTypeLabel(item.isVacation !== false);
  if (vacationColorSelect) vacationColorSelect.value = item.color || 'amber';
  if (vacationOfficeSelect && item.office) {
    refreshVacationOfficeOptions();
    if (vacationOfficeSelect.querySelector(`option[value="${item.office}"]`)) {
      vacationOfficeSelect.value = item.office;
    }
  }
  if (window.VacationGantt) {
    window.VacationGantt.loadFromString(item.membersBits || item.bits || '');
  }
}

function getVacationTypeLabel(isVacation) { return (isVacation === false) ? '予定のみ' : '休暇固定'; }

let cachedVacationList = [];
let cachedVacationLegacyNote = '';

function normalizeVacationList(list, officeId) {
  if (!Array.isArray(list)) return [];
  const prevList = Array.isArray(cachedVacationList) ? cachedVacationList : [];
  const targetOffice = officeId == null ? '' : String(officeId);
  const normalized = list.map((item, idx) => {
    const idStr = String(item?.id || item?.vacationId || '');
    const itemOffice = String(item?.office || targetOffice || '');
    const prev = prevList.find(v => String(v?.id || v?.vacationId || '') === idStr && String(v?.office || targetOffice || '') === itemOffice);
    const hasIsVacation = item && Object.prototype.hasOwnProperty.call(item, 'isVacation');
    const fallbackHasFlag = prev && Object.prototype.hasOwnProperty.call(prev, 'isVacation');
    const isVacation = hasIsVacation ? item.isVacation : (fallbackHasFlag ? prev.isVacation : false);
    const orderVal = Number(item?.order ?? item?.sortOrder ?? prev?.order ?? (idx + 1));
    return { ...item, office: itemOffice || (item?.office || ''), isVacation, order: Number.isFinite(orderVal) && orderVal > 0 ? orderVal : (idx + 1), _originalIndex: idx };
  });
  normalized.sort((a, b) => {
    const ao = Number(a.order || 0);
    const bo = Number(b.order || 0);
    if (ao !== bo) return ao - bo;
    return (a._originalIndex || 0) - (b._originalIndex || 0);
  });
  normalized.forEach((item, idx) => { if (!item.order) item.order = idx + 1; delete item._originalIndex; });
  return normalized;
}

function renderVacationRows(list, officeId) {
  if (!vacationListBody) return;
  const normalizedList = normalizeVacationList(list, officeId);
  cachedVacationList = normalizedList;
  vacationListBody.textContent = '';
  if (!Array.isArray(normalizedList) || normalizedList.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 9; td.style.textAlign = 'center'; td.textContent = 'イベントはありません';
    tr.appendChild(td); vacationListBody.appendChild(tr); return;
  }

  normalizedList.forEach((item, idx) => {
    const tr = document.createElement('tr');
    const idStr = String(item.id || item.vacationId || '');
    tr.dataset.vacationId = idStr;
    tr.dataset.order = String(item.order || idx + 1);
    const dragTd = document.createElement('td');
    dragTd.className = 'vacation-drag-cell';
    const dragBtn = document.createElement('button');
    dragBtn.type = 'button';
    dragBtn.className = 'vacation-drag-handle';
    dragBtn.draggable = true;
    dragBtn.title = 'ドラッグして並び替え';
    dragBtn.innerHTML = '<span aria-hidden="true">☰</span>';
    dragTd.appendChild(dragBtn);
    const titleTd = document.createElement('td'); titleTd.textContent = item.title || '';
    const start = item.startDate || item.start || item.from || '';
    const end = item.endDate || item.end || item.to || '';
    const periodTd = document.createElement('td'); periodTd.textContent = start || end ? `${start || ''}〜${end || ''}` : '-';
    const officeTd = document.createElement('td'); officeTd.textContent = item.office || '';
    const typeTd = document.createElement('td');
    const typeToggle = document.createElement('input');
    typeToggle.type = 'checkbox';
    typeToggle.checked = item.isVacation === true;
    const typeLabel = document.createElement('span');
    typeLabel.className = 'vacation-type-label';
    typeLabel.textContent = getVacationTypeLabel(typeToggle.checked);
    typeToggle.addEventListener('change', async () => {
      typeToggle.disabled = true;
      const success = await updateVacationFlags(item, { isVacation: typeToggle.checked });
      if (!success) {
        typeToggle.checked = !typeToggle.checked;
      } else {
        typeLabel.textContent = getVacationTypeLabel(typeToggle.checked);
      }
      typeToggle.disabled = false;
    });
    typeTd.append(typeToggle, typeLabel);
    const colorTd = document.createElement('td');
    const colorBadge = document.createElement('span');
    colorBadge.className = `event-color-dot ${getEventColorClass(item.color)}`.trim();
    colorBadge.title = EVENT_COLOR_LABELS[item.color] || '';
    colorTd.appendChild(colorBadge);
    const noteTd = document.createElement('td');
    const noticeSel = findNoticeSelectionForItem(item);
    if (noticeSel && noticeSel.title) {
      const link = document.createElement('a');
      link.href = '#noticesArea';
      link.textContent = noticeSel.title;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof toggleNoticesArea === 'function') { toggleNoticesArea(); }
        const noticesArea = document.getElementById('noticesArea');
        if (noticesArea) {
          noticesArea.style.display = 'block';
          noticesArea.classList.remove('collapsed');
          noticesArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      noteTd.appendChild(link);
    } else if (item.note || item.memo) {
      noteTd.textContent = item.note || item.memo || '';
    } else {
      noteTd.textContent = '-';
    }
    const visibleTd = document.createElement('td');
    const visibleToggle = document.createElement('input');
    visibleToggle.type = 'checkbox';
    visibleToggle.checked = item.visible === true;
    visibleToggle.addEventListener('change', async () => {
      visibleToggle.disabled = true;
      const success = await updateVacationFlags(item, { visible: visibleToggle.checked });
      if (!success) {
        visibleToggle.checked = !visibleToggle.checked;
      }
      visibleToggle.disabled = false;
    });
    visibleTd.appendChild(visibleToggle);
    const actionTd = document.createElement('td');
    const editBtn = document.createElement('button'); editBtn.textContent = '編集'; editBtn.className = 'btn-secondary';
    editBtn.addEventListener('click', () => fillVacationForm(item));
    actionTd.appendChild(editBtn);
    tr.append(dragTd, titleTd, periodTd, officeTd, typeTd, colorTd, noteTd, visibleTd, actionTd);
    vacationListBody.appendChild(tr);
  });
  initVacationSort();
}

function getVacationOrderMapFromDom() {
  const map = new Map();
  if (!vacationListBody) return map;
  let idx = 1;
  vacationListBody.querySelectorAll('tr[data-vacation-id]').forEach(tr => {
    const idStr = tr.dataset.vacationId || '';
    if (!idStr) return;
    map.set(idStr, idx++);
  });
  return map;
}

function hasVacationOrderChanged(orderMap) {
  if (!orderMap || orderMap.size === 0) return false;
  const list = Array.isArray(cachedVacationList) ? cachedVacationList : [];
  return list.some((item, idx) => {
    const idStr = String(item.id || item.vacationId || '');
    if (!idStr) return false;
    const current = orderMap.get(idStr);
    const fallbackOrder = Number(item.order || 0) || (idx + 1);
    return current != null && current !== fallbackOrder;
  });
}

function composeVacationPayloadFromItem(item, overrides = {}) {
  const office = item.office || getVacationTargetOffice();
  if (!office) return null;
  const orderMap = getVacationOrderMapFromDom();
  const idStr = String(item.id || item.vacationId || '');
  const payload = {
    office,
    title: item.title || '',
    start: item.startDate || item.start || item.from || '',
    end: item.endDate || item.end || item.to || '',
    note: item.note || item.memo || item.noticeTitle || '',
    noticeId: item.noticeId || item.noticeKey || '',
    noticeTitle: item.noticeTitle || '',
    membersBits: item.membersBits || item.bits || '',
    visible: overrides.visible !== undefined ? overrides.visible : (item.visible === true),
    isVacation: overrides.isVacation !== undefined ? overrides.isVacation : (item.isVacation !== false),
    color: overrides.color || item.color || 'amber'
  };
  if (idStr) payload.id = idStr;
  const newOrder = (overrides.order !== undefined) ? overrides.order : orderMap.get(idStr);
  if (newOrder != null) {
    payload.order = newOrder;
  } else {
    const maxOrder = Math.max(0, ...Array.from(orderMap.values()));
    payload.order = maxOrder + 1;
  }
  return payload;
}

async function persistVacationOrders(orderMap) {
  const office = getVacationTargetOffice();
  if (!office || !orderMap || orderMap.size === 0) return;
  if (!hasVacationOrderChanged(orderMap)) return;
  const list = Array.isArray(cachedVacationList) ? cachedVacationList : [];
  const payloads = list.map(item => {
    const idStr = String(item.id || item.vacationId || '');
    if (!idStr) return null;
    const orderVal = orderMap.get(idStr);
    if (orderVal == null) return null;
    return composeVacationPayloadFromItem(item, { order: orderVal });
  }).filter(Boolean);
  if (!payloads.length) return;
  try {
    await Promise.all(payloads.map(p => adminSetVacation(office, p)));
    toast('並び順を保存しました');
    await loadVacationsList(false, office);
    await loadEvents(office, false);
  } catch (err) {
    console.error('persistVacationOrders error', err);
    toast('並び順の保存に失敗しました', false);
  }
}

let vacationSortInitialized = false;
let vacationDragRow = null;
function initVacationSort() {
  if (!vacationListBody) return;
  if (vacationSortInitialized) return;
  vacationSortInitialized = true;
  vacationListBody.addEventListener('dragstart', e => {
    const handle = e.target.closest('.vacation-drag-handle');
    if (!handle) { e.preventDefault(); return; }
    const row = handle.closest('tr');
    if (!row) return;
    vacationDragRow = row;
    row.classList.add('vacation-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.vacationId || '');
  });
  vacationListBody.addEventListener('dragover', e => {
    if (!vacationDragRow) return;
    e.preventDefault();
    const targetRow = e.target.closest('tr[data-vacation-id]');
    if (!targetRow || targetRow === vacationDragRow) return;
    const rect = targetRow.getBoundingClientRect();
    const offset = e.clientY - rect.top;
    const shouldInsertBefore = offset < rect.height / 2;
    vacationListBody.insertBefore(vacationDragRow, shouldInsertBefore ? targetRow : targetRow.nextSibling);
  });
  vacationListBody.addEventListener('dragend', () => {
    if (!vacationDragRow) return;
    vacationDragRow.classList.remove('vacation-dragging');
    vacationDragRow = null;
    const orderMap = getVacationOrderMapFromDom();
    persistVacationOrders(orderMap);
  });
}

async function updateVacationFlags(item, overrides = {}) {
  const office = item.office || getVacationTargetOffice(); if (!office) return false;
  const visible = (overrides.visible !== undefined) ? overrides.visible : (item.visible === true);
  const isVacation = (overrides.isVacation !== undefined) ? overrides.isVacation : (item.isVacation === true);
  const payload = composeVacationPayloadFromItem(item, { visible, isVacation });
  if (!payload) return false;
  try {
    const res = await adminSetVacation(office, payload);
    if (res && res.ok !== false) {
      if (res.vacation) {
        item.visible = res.vacation.visible === true;
        item.isVacation = res.vacation.isVacation === true;
        item.color = res.vacation.color || item.color;
      } else {
        item.visible = visible;
        item.isVacation = isVacation;
      }
      toast('イベント設定を更新しました');
      if (Array.isArray(res.vacations)) {
        renderVacationRows(res.vacations, office);
      } else {
        await loadVacationsList(false, office);
      }
      if (office) { await loadEvents(office, false); }
      return true;
    }
    throw new Error(res && res.error ? String(res.error) : 'update_failed');
  } catch (err) {
    console.error('updateVacationFlags error', err);
    toast('イベント設定の更新に失敗しました', false);
    return false;
  }
}

async function loadVacationsList(showToastOnSuccess = false, officeOverride) {
  const office = officeOverride || getVacationTargetOffice(); if (!office) return;
  if (vacationListBody) {
    vacationListBody.textContent = '';
    const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 9; td.style.textAlign = 'center'; td.textContent = '読み込み中...'; tr.appendChild(td); vacationListBody.appendChild(tr);
  }
  try {
    const res = await adminGetVacation(office);
    const list = Array.isArray(res?.vacations) ? res.vacations : (Array.isArray(res?.items) ? res.items : []);
    renderVacationRows(list, office);
    if (showToastOnSuccess) toast('イベントを読み込みました');
  } catch (err) {
    console.error('loadVacationsList error', err);
    if (vacationListBody) {
      vacationListBody.textContent = '';
      const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 9; td.style.textAlign = 'center'; td.textContent = '読み込みに失敗しました'; tr.appendChild(td); vacationListBody.appendChild(tr);
    }
    toast('イベントの取得に失敗しました', false);
  } finally {
    resetVacationForm();
  }
}

function buildVacationPayload() {
  const office = getVacationTargetOffice(); if (!office) return { error: 'office_missing' };
  const title = (vacationTitleInput?.value || '').trim();
  const start = (vacationStartInput?.value || '').trim();
  const end = (vacationEndInput?.value || '').trim();
  if (window.VacationGantt) {
    window.VacationGantt.syncInput();
  }
  const membersBits = (vacationMembersBitsInput?.value || '').trim();
  const id = (vacationIdInput?.value || '').trim();
  const color = (vacationColorSelect?.value || 'amber');

  const payload = { office, title, start, end, membersBits, color };

  const orderMap = getVacationOrderMapFromDom();
  if (id && orderMap.has(id)) {
    payload.order = orderMap.get(id);
  } else if (orderMap.size > 0) {
    const maxOrder = Math.max(0, ...Array.from(orderMap.values()));
    payload.order = maxOrder + 1;
  } else {
    payload.order = 1;
  }

  const noticeSel = getSelectedNoticeInfo();
  if (noticeSel) {
    payload.noticeId = noticeSel.id;
    payload.noticeTitle = noticeSel.title;
    if (noticeSel.title) payload.note = noticeSel.title;
  } else if (cachedVacationLegacyNote) {
    payload.note = cachedVacationLegacyNote;
  }
  if (id) payload.id = id;

  const errors = [];
  if (!title) errors.push('missing_title');
  if (start && end && start > end) errors.push('invalid_range');

  return { payload, errors };
}

async function persistVacationPayload(payload, { resetFormOnSuccess = true, showToast = true } = {}) {
  if (!payload || !payload.office) return false;
  try {
    const res = await adminSetVacation(payload.office, payload);
    if (res && res.ok !== false) {
      if (res.id && vacationIdInput) { vacationIdInput.value = res.id; }
      if (res.vacation) {
        if (vacationTypeText) vacationTypeText.value = getVacationTypeLabel(res.vacation.isVacation !== false);
        if (vacationColorSelect && res.vacation.color) { vacationColorSelect.value = res.vacation.color; }
      }
      if (showToast) toast('イベントを保存しました');
      if (Array.isArray(res.vacations)) {
        renderVacationRows(res.vacations, payload.office);
      } else {
        await loadVacationsList(false, payload.office);
      }
      await loadEvents(payload.office, false);
      if (resetFormOnSuccess) {
        resetVacationForm();
      }
      return true;
    }
    throw new Error(res && res.error ? String(res.error) : 'save_failed');
  } catch (err) {
    console.error('handleVacationSave error', err);
    if (showToast) toast('イベントの保存に失敗しました', false);
    return false;
  }
}

async function handleCreateNoticeFromEvent() {
  const office = getVacationTargetOffice(); if (!office) return;
  const titleInput = prompt('イベントと紐付けるお知らせのタイトルを入力してください（必須）', '');
  if (titleInput === null) return;
  const title = (titleInput || '').trim();
  if (!title) { toast('タイトルを入力してください', false); return; }
  const contentInput = prompt('お知らせの本文（任意）', '');
  const newNotice = {
    id: `notice_${Date.now()}`,
    title,
    content: (contentInput || '').trim(),
    visible: true,
    display: true
  };
  const currentList = Array.isArray(window.CURRENT_NOTICES) ? window.CURRENT_NOTICES.slice() : [];
  const nextNotices = [newNotice, ...currentList];
  const success = await saveNotices(nextNotices, office);
  if (success) {
    refreshVacationNoticeOptions(newNotice.id);
    if (vacationNoticeSelect) { vacationNoticeSelect.value = newNotice.id; }
    toast('お知らせを追加しました');
  } else {
    toast('お知らせの追加に失敗しました', false);
  }
}

async function handleVacationSave() {
  const { payload, errors } = buildVacationPayload();
  if (!payload || errors?.includes('missing_title')) { toast('タイトルを入力してください', false); return; }
  if (errors?.includes('invalid_range')) { toast('開始日と終了日の指定を確認してください', false); return; }
  await persistVacationPayload(payload, { resetFormOnSuccess: true, showToast: true });
}

async function handleVacationAutoSave() {
  const { payload, errors } = buildVacationPayload();
  if (!payload || (errors && errors.length)) { return false; }
  return await persistVacationPayload(payload, { resetFormOnSuccess: false, showToast: false });
}

async function handleVacationDelete() {
  const office = getVacationTargetOffice(); if (!office) return;
  const id = (vacationIdInput?.value || '').trim();
  if (!id) { toast('削除する項目のIDを選択してください', false); return; }
  if (!confirm('選択中のイベントを削除しますか？')) return;
  try {
    const res = await adminDeleteVacation(office, id);
    if (res && res.ok !== false) {
      toast('削除しました');
      resetVacationForm();
      await loadVacationsList();
    } else {
      throw new Error(res && res.error ? String(res.error) : 'delete_failed');
    }
  } catch (err) {
    console.error('handleVacationDelete error', err);
    toast('イベントの削除に失敗しました', false);
  }
}

/* Admin API */
function selectedOfficeId() {
  const office = adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
  if (!office) { toast('操作対象拠点を選択してください', false); }
  return office;
}
async function adminGetFor(office) { return await apiPost({ action: 'getFor', token: SESSION_TOKEN, office, nocache: '1' }); }
async function adminGetConfigFor(office) { return await apiPost({ action: 'getConfigFor', token: SESSION_TOKEN, office, nocache: '1' }); }
async function adminSetConfigFor(office, cfgObj) { const q = { action: 'setConfigFor', token: SESSION_TOKEN, office, data: JSON.stringify(cfgObj) }; return await apiPost(q); }
async function adminSetForChunked(office, dataObjFull) {
  const entries = Object.entries(dataObjFull || {});
  if (entries.length === 0) {
    const base = { action: 'setFor', office, token: SESSION_TOKEN, data: JSON.stringify({ updated: Date.now(), data: {}, full: true }) };
    return await apiPost(base);
  }
  const chunkSize = 30; let first = true, ok = true;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = Object.fromEntries(entries.slice(i, i + chunkSize));
    const obj = { updated: Date.now(), data: chunk, full: first };
    const q = { action: 'setFor', office, token: SESSION_TOKEN, data: JSON.stringify(obj) };
    const r = await apiPost(q);
    if (!(r && r.ok)) ok = false; first = false;
  }
  return ok ? { ok: true } : { error: 'chunk_failed' };
}
async function adminRenameOffice(office, name) { return await apiPost({ action: 'renameOffice', office, name, token: SESSION_TOKEN }); }
async function adminSetOfficePassword(office, pw, apw) { const q = { action: 'setOfficePassword', id: office, token: SESSION_TOKEN }; if (pw) q.password = pw; if (apw) q.adminPassword = apw; return await apiPost(q); }
async function adminGetVacation(office) { return await apiPost({ action: 'getVacation', token: SESSION_TOKEN, office, nocache: '1' }); }
async function adminSetVacation(office, payload) { const q = { action: 'setVacation', token: SESSION_TOKEN, office, data: JSON.stringify(payload) }; return await apiPost(q); }
async function saveVacationBits(office, payload) { const q = { action: 'setVacationBits', token: SESSION_TOKEN, office, data: JSON.stringify(payload) }; return await apiPost(q); }
async function adminDeleteVacation(office, id) { return await apiPost({ action: 'deleteVacation', token: SESSION_TOKEN, office, id }); }

/* CSVパーサ */
/* CSVパーサ・共通関数は js/services/csv.js に移動済み */

/* 管理モーダルを開いたときにお知らせを自動読み込み */
async function autoLoadNoticesOnAdminOpen() {
  const office = adminSelectedOfficeId || CURRENT_OFFICE_ID;
  if (!office) return;
  try {
    const params = { action: 'getNotices', token: SESSION_TOKEN, nocache: '1', office };
    const res = await apiPost(params);
    if (res && res.notices) {
      noticesEditor.innerHTML = '';
      if (res.notices.length === 0) {
        addNoticeEditorItem();
      } else {
        res.notices.forEach((n, idx) => {
          const visible = resolveNoticeVisibility(n);
          const id = n && (n.id != null ? n.id : (n.noticeId != null ? n.noticeId : idx));
          addNoticeEditorItem(n.title, n.content, visible, id);
        });
      }
    }
  } catch (e) {
    console.error('Auto-load notices error:', e);
  }
}

/* イベントエクスポート機能 */
const btnExportEvent = document.getElementById('btnExportEvent');
if (btnExportEvent) {
  btnExportEvent.addEventListener('click', async () => {
    const office = adminSelectedOfficeId || CURRENT_OFFICE_ID;
    if (!office) { toast('拠点が選択されていません', false); return; }

    try {
      // 設定とイベント一覧を取得
      const cfg = await adminGetConfigFor(office);
      const eventsRes = await apiPost({ action: 'getVacation', token: SESSION_TOKEN, office, nocache: '1' });

      if (!cfg || !cfg.groups) { toast('設定の取得に失敗しました', false); return; }
      if (!eventsRes || !eventsRes.vacations) { toast('イベントの取得に失敗しました', false); return; }

      const events = eventsRes.vacations;
      if (!events.length) { toast('エクスポートするイベントがありません'); return; }

      // CSVヘッダー
      const rows = [];
      rows.push(CsvService.toCsvRow(['イベントID', 'タイトル', '開始日', '終了日', 'グループ', '氏名', 'ビット状態']));

      // 各イベントについて処理
      events.forEach(event => {
        const eventId = event.id || event.vacationId || '';
        const title = event.title || '';
        const startDate = event.startDate || event.start || event.from || '';
        const endDate = event.endDate || event.end || event.to || '';
        const membersBits = event.membersBits || event.bits || '';

        // メンバーリストを構築
        const members = [];
        (cfg.groups || []).forEach(g => {
          (g.members || []).forEach(m => {
            members.push({ group: g.title || '', name: m.name || '' });
          });
        });

        // ビット文字列を解析
        const bitChars = membersBits.split('');
        members.forEach((member, idx) => {
          const bitValue = bitChars[idx] === '1' ? '○' : '';
          rows.push(CsvService.toCsvRow([eventId, title, startDate, endDate, member.group, member.name, bitValue]));
        });
      });

      const csv = rows.join('\\n');
      const BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const bytes = new TextEncoder().encode(csv);
      const blob = new Blob([BOM, bytes], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url;
      a.download = `events_${office}_${timestamp}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
      toast('イベントをエクスポートしました');
    } catch (e) {
      console.error('Event export error:', e);
      toast('エクスポートに失敗しました', false);
    }
  });
}
/* 一覧出力（PDF出力）機能 */
const PRINT_LIST_COLUMNS = [
  { key: 'name', label: '氏名', className: 'print-col-name', ratio: 13 },
  { key: 'workHours', label: '業務時間', className: 'print-col-work', ratio: 14 },
  { key: 'status', label: '状態', className: 'print-col-status', ratio: 12 },
  { key: 'time', label: '戻り', className: 'print-col-time', ratio: 10 },
  { key: 'tomorrowPlan', label: '明日の予定', className: 'print-col-next', ratio: 18 },
  { key: 'note', label: '備考', className: 'print-col-note', ratio: 33 }
];
const PRINT_LIST_SEPARATOR_WIDTH = '10px';

const btnPrintList = document.getElementById('btnPrintList');
if (btnPrintList) {
  btnPrintList.addEventListener('click', async () => {
    const office = selectedOfficeId();
    if (!office) return;

    try {
      // データの最新化がまだならロード
      if (!adminMembersLoaded) {
        toast('データを読み込み中...', true);
        await loadAdminMembers(true);
      }

      const sortType = document.getElementById('adminExportSort')?.value || 'default';
      const oneTable = document.getElementById('adminExportOneTable')?.checked || false;

      // 表示用のデータを構築（ステータス情報などを結合）
      const list = adminMemberList.map(m => {
        const live = (typeof STATE_CACHE !== 'undefined' ? STATE_CACHE[m.id] : {}) || {};
        const admin = adminMemberData[m.id] || {};
        return {
          ...m,
          status: live.status || admin.status || '在席',
          time: live.time || admin.time || '',
          note: live.note || admin.note || '',
          workHours: live.workHours || admin.workHours || m.workHours || '',
          tomorrowPlan: live.tomorrowPlan || admin.tomorrowPlan || '' // 明日の予定を追加
        };
      });

      // ソート処理
      if (sortType === 'name') {
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
      } else if (sortType === 'time') {
        list.sort((a, b) => (a.workHours || '').localeCompare(b.workHours || '', 'ja') || (a.name || '').localeCompare(b.name || '', 'ja'));
      } else if (sortType === 'status') {
        const statusOrder = (typeof STATUSES !== 'undefined') ? STATUSES.map(s => s.value) : [];
        list.sort((a, b) => {
          const ia = statusOrder.indexOf(a.status);
          const ib = statusOrder.indexOf(b.status);
          if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          return (a.name || '').localeCompare(b.name || '', 'ja');
        });
      }
      // default の場合は adminMemberList の順序（normalizeMemberOrdering済み）を維持

      // HTML生成
      const workArea = document.getElementById('printListWorkArea');
      if (!workArea) return;
      workArea.innerHTML = '';
      workArea.classList.remove('u-hidden');

      const officeName = (document.getElementById('renameOfficeName')?.value) || (typeof CURRENT_OFFICE_NAME !== 'undefined' ? CURRENT_OFFICE_NAME : '');
      const title = document.createElement('h2');
      title.className = 'print-list-title';
      title.textContent = `${officeName} 在席確認一覧 (${new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })})`;
      workArea.appendChild(title);

      if (oneTable) {
        // 全員一括の1つのリスト（1行に2名分）
        const container = document.createElement('div');
        container.className = 'print-list-container print-list-container--one-table';

        const table = document.createElement('table');
        table.className = 'print-two-col-table';
        appendPrintColGroup(table, PRINT_LIST_COLUMNS, PRINT_LIST_SEPARATOR_WIDTH);

        // THEAD（ページ毎に繰り返し表示）
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        appendHeaderCells(headerRow, PRINT_LIST_COLUMNS);
        const separator = document.createElement('th');
        separator.className = 'col-sep';
        separator.textContent = '';
        headerRow.appendChild(separator);
        appendHeaderCells(headerRow, PRINT_LIST_COLUMNS);

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // TBODY（1行に2名分）
        const tbody = document.createElement('tbody');
        for (let i = 0; i < list.length; i += 2) {
          const leftMember = list[i] || null;
          const rightMember = list[i + 1] || null;
          const tr = document.createElement('tr');

          appendMemberCells(tr, leftMember, PRINT_LIST_COLUMNS);
          const sepTd = document.createElement('td');
          sepTd.className = 'col-sep';
          tr.appendChild(sepTd);
          appendMemberCells(tr, rightMember, PRINT_LIST_COLUMNS);

          tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        container.appendChild(table);
        workArea.appendChild(container);

      } else {
        // グループごとに分割（従来通り）
        const container = document.createElement('div');
        container.className = 'print-list-container';

        const groups = [...new Set(list.map(m => m.group))];
        const sortedGroups = adminGroupOrder.filter(g => groups.includes(g));
        groups.forEach(g => { if (!sortedGroups.includes(g)) sortedGroups.push(g); });

        sortedGroups.forEach(groupName => {
          const groupMembers = list.filter(m => m.group === groupName);
          if (groupMembers.length === 0) return;

          const groupSection = document.createElement('div');
          groupSection.className = 'print-group-section';

          const h3 = document.createElement('div');
          h3.className = 'print-group-header';
          h3.textContent = groupName;
          groupSection.appendChild(h3);

          // カラムヘッダー（DIV構成）
          groupSection.appendChild(createPrintHeaderRowDiv());

          groupMembers.forEach(m => {
            groupSection.appendChild(createPrintRowDiv(m));
          });

          container.appendChild(groupSection);
        });
        workArea.appendChild(container);
      }

      // 印刷実行
      window.print();

      // 印刷後はワークエリアを隠す
      setTimeout(() => {
        workArea.classList.add('u-hidden');
      }, 500);

    } catch (err) {
      console.error('Print list error:', err);
      toast('一覧出力に失敗しました', false);
    }
  });
}

// 2列表示用セル生成ヘルパー
function appendHeaderCells(tr, columns) {
  columns.forEach(({ label, className }) => {
    const th = document.createElement('th');
    th.textContent = label;
    th.className = className;
    tr.appendChild(th);
  });
}

function appendMemberCells(tr, member, columns) {
  columns.forEach(({ key, className }) => {
    const td = document.createElement('td');
    td.textContent = member?.[key] || '';
    td.className = className;
    tr.appendChild(td);
  });
}

function appendPrintColGroup(table, columns, separatorWidth) {
  const colgroup = document.createElement('colgroup');
  const totalRatio = columns.reduce((sum, col) => sum + (Number(col.ratio) || 0), 0) || 1;

  const appendOneSide = () => {
    columns.forEach((col) => {
      const c = document.createElement('col');
      const ratio = Number(col.ratio) || 0;
      c.style.width = `calc((100% - ${separatorWidth}) * ${(ratio / (totalRatio * 2)).toFixed(6)})`;
      colgroup.appendChild(c);
    });
  };

  appendOneSide();
  const sep = document.createElement('col');
  sep.style.width = separatorWidth;
  colgroup.appendChild(sep);
  appendOneSide();

  table.appendChild(colgroup);
}

function createPrintHeaderRowDiv() {
  const row = document.createElement('div');
  row.className = 'print-table-header';

  const name = document.createElement('div'); name.className = 'pm-name'; name.textContent = '氏名';
  const work = document.createElement('div'); work.className = 'pm-work'; work.textContent = '業務時間';
  const status = document.createElement('div'); status.className = 'pm-status'; status.textContent = '状態';
  const ret = document.createElement('div'); ret.className = 'pm-ret'; ret.textContent = '戻り';
  const next = document.createElement('div'); next.className = 'pm-next'; next.textContent = '明日の予定';
  const note = document.createElement('div'); note.className = 'pm-note'; note.textContent = '備考';

  row.append(name, work, status, ret, next, note);
  return row;
}

function createPrintRowDiv(m) {
  const row = document.createElement('div');
  row.className = 'print-member-row';

  const name = document.createElement('div'); name.className = 'pm-name'; name.textContent = m.name || '';
  const work = document.createElement('div'); work.className = 'pm-work'; work.textContent = m.workHours || '';
  const status = document.createElement('div'); status.className = 'pm-status'; status.textContent = m.status || '';
  const ret = document.createElement('div'); ret.className = 'pm-ret'; ret.textContent = m.time || '';
  const next = document.createElement('div'); next.className = 'pm-next'; next.textContent = m.tomorrowPlan || '';
  const note = document.createElement('div'); note.className = 'pm-note'; note.textContent = m.note || '';

  row.append(name, work, status, ret, next, note);
  return row;
}

/* カラム構成管理 (Phase 6) */
async function loadColumnConfig() {
  const office = selectedOfficeId(); if (!office) return;
  try {
    if (columnSettingContainer) {
      columnSettingContainer.innerHTML = '<p class="u-text-center u-text-gray">設定を読み込み中...</p>';
    }
    const res = await apiPost({ action: 'getColumnConfig', token: SESSION_TOKEN, office });
    console.log('[loadColumnConfig] res:', res);
    // サーバーに設定がない場合は null のまま渡す（新拠点＝未設定状態）
    const config = (res && res.columnConfig) || null;
    console.log('[loadColumnConfig] Using config:', config);
    renderColumnConfig(config);
  } catch (e) {
    console.error('loadColumnConfig error', e);
    if (columnSettingContainer) {
      columnSettingContainer.innerHTML = '<p class="u-text-red">設定の同期に失敗しました</p>';
    }
  }
}

let adminColumnsSetup = []; // 統合されたカラム設定の配列

function renderColumnConfig(config) {
  if (!columnSettingContainer) return;
  columnSettingContainer.innerHTML = '';

  // config が null の場合は「未設定状態」: 全カラムを board=false, popup=false で表示
  const isUnconfigured = !config;
  const safeConfig = config || { board: [], popup: [], card: [] };

  const widths = (safeConfig.columnWidths && typeof safeConfig.columnWidths === 'object') ? safeConfig.columnWidths : {};
  const customCols = Array.isArray(safeConfig.customColumns) ? safeConfig.customColumns : [];

  const allKeys = [];
  const setupPropsMap = {}; // key -> properties

  // ヘルパー: stateを構築
  const addKeyToSetup = (k, sourceDef) => {
    if (allKeys.includes(k)) return;
    allKeys.push(k);
    
    // widths や ui state (board/popup)
    const w = widths[k] || {};
    // 未設定状態では全て false にする
    const isBoard = isUnconfigured ? false : ((safeConfig.board || []).includes(k) || k === 'name' || k === 'status');
    const isPopup = isUnconfigured ? false : (safeConfig.popup || []).includes(k);
    
    // Is it a built-in system key?
    const sysDef = COLUMN_DEFINITIONS.find(c => c.key === k);
    const isSystem = !!sysDef;

    // Use custom column data if available (override)
    let custDef = customCols.find(c => c.key === k);
    let finalDef = custDef || sysDef || sourceDef || { key: k, label: k, type: 'textual' };

    setupPropsMap[k] = {
      key: k,
      label: finalDef.label || k,
      type: finalDef.type || 'textual',
      options: finalDef.options ? [...finalDef.options] : [],
      dependsOn: finalDef.dependsOn ? JSON.parse(JSON.stringify(finalDef.dependsOn)) : null,
      board: isBoard,
      popup: isPopup,
      card: isUnconfigured ? false : ((safeConfig.card || []).includes(k) || (safeConfig.card == null && isBoard)),
      min: w.min != null ? w.min : '',
      max: w.max != null ? w.max : '',
      isSystem: isSystem,
      popupEligible: finalDef.popupEligible === undefined ? true : finalDef.popupEligible
    };
  };

  (safeConfig.board || []).forEach(k => addKeyToSetup(k));
  // 未設定状態ではシステムカラムを自動追加しない（空のリストを表示）
  if (!isUnconfigured) {
    COLUMN_DEFINITIONS.forEach(def => addKeyToSetup(def.key, def));
  }
  customCols.forEach(def => addKeyToSetup(def.key, def));

  // Build the array
  adminColumnsSetup = allKeys.map(k => setupPropsMap[k]);

  // モジュールレベル変数に同期（互換性担保用）
  adminColumnAllKeys = allKeys;
  adminColumnUiState = {};
  adminColumnsSetup.forEach(col => {
    adminColumnUiState[col.key] = { board: col.board, popup: col.popup, min: col.min, max: col.max };
  });

  // レイアウト設定 (Phase 8: レスポンシブしきい値)
  const layoutConfig = safeConfig.layoutConfig || {};
  const responsiveSection = el('div', { class: 'admin-subsection layout-config-section' });
  responsiveSection.appendChild(el('h5', { text: '📱 レスポンシブ設定' }));

  const layoutGrid = el('div', { class: 'layout-config-grid', style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px;' });

  const cardBpDiv = el('div', { class: 'config-item' }, [
    el('label', { class: 'config-label', style: 'display: block; font-weight: 700; margin-bottom: 4px;', text: 'カード切替幅 (px)' })
  ]);
  const cardBpInput = el('input', { id: adminColumnLcPrefix + 'cardBreakpoint', type: 'number', class: 'admin-input', placeholder: String(CARD_BREAKPOINT_PX), value: layoutConfig.cardBreakpoint || '' });
  cardBpInput.style.width = '120px';
  cardBpDiv.appendChild(cardBpInput);

  const panelMinDiv = el('div', { class: 'config-item' }, [
    el('label', { class: 'config-label', style: 'display: block; font-weight: 700; margin-bottom: 4px;', text: 'ボード最小幅 (px)' })
  ]);
  const panelMinInput = el('input', { id: adminColumnLcPrefix + 'panelMinWidth', type: 'number', class: 'admin-input', placeholder: String(PANEL_MIN_PX), value: layoutConfig.panelMinWidth || '' });
  panelMinInput.style.width = '120px';
  panelMinDiv.appendChild(panelMinInput);

  layoutGrid.append(cardBpDiv, panelMinDiv);
  responsiveSection.appendChild(layoutGrid);
  columnSettingContainer.appendChild(responsiveSection);

  const orderSection = el('div', { class: 'admin-subsection column-order-section' });
  orderSection.appendChild(el('h5', { text: '📐 カラム設定' }));

  // 未設定状態: システムカラム追加用UIを表示
  if (isUnconfigured || adminColumnsSetup.length === 0) {
    const emptyMsg = el('p', { class: 'u-text-center u-text-gray', style: 'margin: 16px 0;', text: 'この拠点にはカラム設定がありません。下のボタンからカラムを追加してください。' });
    orderSection.appendChild(emptyMsg);
  }

  // システムカラム追加ボタン群
  const sysAddSection = el('div', { style: 'margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;' });
  sysAddSection.appendChild(el('span', { text: 'システムカラム: ', style: 'font-weight: 700; font-size: 0.85em;' }));
  const existingKeys = new Set(adminColumnsSetup.map(c => c.key));
  COLUMN_DEFINITIONS.forEach(def => {
    if (existingKeys.has(def.key)) return;
    const addBtn = el('button', { class: 'btn-secondary btn-sm', text: `+ ${def.label}`, title: `「${def.label}」を追加` });
    addBtn.addEventListener('click', () => {
      adminColumnsSetup.push({
        key: def.key,
        label: def.label,
        type: def.type || 'textual',
        options: [],
        dependsOn: null,
        board: def.key === 'name' || def.key === 'status',
        popup: !!def.popupEligible,
        card: false,
        min: '',
        max: '',
        isSystem: true,
        popupEligible: def.popupEligible === undefined ? true : def.popupEligible
      });
      const rebuilt = extractConfigFromSetup();
      renderColumnConfig(rebuilt);
    });
    sysAddSection.appendChild(addBtn);
  });
  // 全候補が追加済みなら非表示
  if (sysAddSection.querySelectorAll('button').length === 0) {
    sysAddSection.style.display = 'none';
  }
  orderSection.appendChild(sysAddSection);

  const orderList = el('div', { id: 'columnOrderList', class: 'column-order-list' });

  function renderColumnListItems() {
    orderList.innerHTML = '';
    adminColumnsSetup.forEach((col, idx) => {
      // name は削除不可・非表示不可の絶対項目
      const isName = (col.key === 'name');
      const isStatus = (col.key === 'status');
      const boardDisabled = isName || isStatus;
      const popupDisabled = !col.popupEligible;

      const item = el('div', { class: 'column-order-item unified-column-item', style: 'flex-direction: column; align-items: stretch; border: 1px solid var(--border); margin-bottom: 8px; padding: 12px; border-radius: 4px; background: var(--bg-secondary);' });

      // 上部バー: 並び替え, トグル, 削除, 展開
      const topBar = el('div', { style: 'display: flex; align-items: center; gap: 12px;' });
      
      const moveActions = el('div', { class: 'column-order-actions', style: 'flex-shrink: 0;' });
      const upBtn = el('button', { class: 'btn-move-up', text: '▲', title: '上に移動' });
      upBtn.disabled = (idx === 0);
      upBtn.addEventListener('click', () => {
        if (idx <= 0) return;
        const tmp = adminColumnsSetup[idx - 1];
        adminColumnsSetup[idx - 1] = adminColumnsSetup[idx];
        adminColumnsSetup[idx] = tmp;
        renderColumnListItems();
      });
      const downBtn = el('button', { class: 'btn-move-down', text: '▼', title: '下に移動' });
      downBtn.disabled = (idx === adminColumnsSetup.length - 1);
      downBtn.addEventListener('click', () => {
        if (idx >= adminColumnsSetup.length - 1) return;
        const tmp = adminColumnsSetup[idx + 1];
        adminColumnsSetup[idx + 1] = adminColumnsSetup[idx];
        adminColumnsSetup[idx] = tmp;
        renderColumnListItems();
      });
      moveActions.append(upBtn, downBtn);
      
      const titleSpan = el('strong', { text: col.label, style: 'min-width: 120px;' });
      if (isName) titleSpan.appendChild(el('span', { class: 'column-order-badge', text: '必須', style: 'margin-left: 8px;' }));
      if (!col.isSystem) titleSpan.appendChild(el('span', { class: 'column-order-badge', text: '独自', style: 'margin-left: 8px; background: var(--accent); color: white;' }));

      const toggleGrp = el('div', { class: 'column-toggle-grp', style: 'flex: 1;' });
      const boardCb = el('input', { type: 'checkbox', disabled: !!boardDisabled });
      boardCb.checked = col.board;
      boardCb.addEventListener('change', e => col.board = e.target.checked);
      const boardLabel = el('label', { class: 'column-toggle-label' });
      boardLabel.append(boardCb, document.createTextNode(' ボード表示'));

      const popupCb = el('input', { type: 'checkbox', disabled: !!popupDisabled });
      popupCb.checked = col.popup;
      popupCb.addEventListener('change', e => col.popup = e.target.checked);
      const popupLabel = el('label', { class: 'column-toggle-label' });
      popupLabel.append(popupCb, document.createTextNode(' ポップアップ表示'));

      const cardCb = el('input', { type: 'checkbox' });
      cardCb.checked = col.card;
      cardCb.addEventListener('change', e => {
        col.card = e.target.checked;
        renderCardOrderListItems();
      });
      const cardLabel = el('label', { class: 'column-toggle-label' });
      cardLabel.append(cardCb, document.createTextNode(' カード表示'));

      toggleGrp.append(boardLabel, popupLabel, cardLabel);

      const actionGrp = el('div', { style: 'display: flex; gap: 8px;' });
      
      const expandBtn = el('button', { class: 'btn-primary btn-sm', text: '⚙ 詳細' });
      let expanded = false;

      const dupBtn = el('button', { class: 'btn-secondary btn-sm', text: '複製' });
      dupBtn.onclick = () => {
        const newKey = 'custom_' + Date.now().toString(36);
        const dupSetup = JSON.parse(JSON.stringify(col));
        dupSetup.key = newKey;
        dupSetup.label = dupSetup.label + '（コピー）';
        dupSetup.isSystem = false;
        adminColumnsSetup.splice(idx + 1, 0, dupSetup);
        renderColumnListItems();
      };
      
      const delBtn = el('button', { class: 'btn-danger btn-sm', text: '削除' });
      delBtn.disabled = isName; // nameは削除禁止
      delBtn.onclick = () => {
        if (confirm(`「${col.label}」を削除しますか？\n（既存の入力値やこのカラムに依存する設定が機能しなくなります）`)) {
          adminColumnsSetup.splice(idx, 1);
          renderColumnListItems();
        }
      };
      
      actionGrp.append(dupBtn, delBtn, expandBtn);
      topBar.append(moveActions, titleSpan, toggleGrp, actionGrp);
      item.appendChild(topBar);

      // 詳細設定パネル (アコーディオン)
      const detailPanel = el('div', { style: 'display: none; margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--border); grid-template-columns: 1fr 1fr; gap: 12px;' });
      
      expandBtn.onclick = () => {
        expanded = !expanded;
        expandBtn.textContent = expanded ? '⚙ 閉じる' : '⚙ 詳細';
        detailPanel.style.display = expanded ? 'grid' : 'none';
      };

      // 表示名
      const labelGroup = el('div');
      labelGroup.appendChild(el('label', { text: '表示名', style: 'display:block; font-size: 12px; font-weight: bold; margin-bottom: 4px;' }));
      const labelInput = el('input', { type: 'text', class: 'admin-input', value: col.label });
      labelInput.oninput = e => { col.label = e.target.value; titleSpan.firstChild.textContent = col.label; };
      labelGroup.appendChild(labelInput);
      detailPanel.appendChild(labelGroup);

      // 種類
      const typeGroup = el('div');
      typeGroup.appendChild(el('label', { text: '種類', style: 'display:block; font-size: 12px; font-weight: bold; margin-bottom: 4px;' }));
      const typeSel = el('select', { class: 'admin-input' });
      typeSel.innerHTML = `
        <option value="textual">テキスト（自由入力）</option>
        <option value="select">リスト（選択のみ・ステータス型）</option>
        <option value="candidate">候補リスト（選択＋自由入力・備考型）</option>
      `;
      typeSel.value = col.type || 'textual';
      
      const optGroup = el('div', { style: 'margin-top: 12px;' });
      optGroup.style.display = (col.type === 'select' || col.type === 'candidate') ? 'block' : 'none';
      optGroup.appendChild(el('label', { text: '選択肢（カンマ区切り）', style: 'display:block; font-size: 12px; font-weight: bold; margin-bottom: 4px;' }));
      const optInput = el('input', { type: 'text', class: 'admin-input', value: (col.options || []).join(',') });
      optInput.oninput = e => { col.options = e.target.value.split(',').map(s => s.trim()).filter(s => s); };
      optGroup.appendChild(optInput);

      typeSel.onchange = e => {
        col.type = e.target.value;
        optGroup.style.display = (col.type === 'select' || col.type === 'candidate') ? 'block' : 'none';
      };
      typeGroup.append(typeSel, optGroup);
      detailPanel.appendChild(typeGroup);

      // 幅グループ
      const widthGroup = el('div', { class: 'column-width-group', style: 'flex-direction: column; align-items: flex-start; justify-content: flex-start;' });
      widthGroup.appendChild(el('label', { text: 'ボード上での列幅 (px)', style: 'display:block; font-size: 12px; font-weight: bold; margin-bottom: 4px;' }));
      const wFlex = el('div', { style: 'display:flex; align-items:center; gap:4px;' });
      const minInput = el('input', { type: 'number', class: 'column-width-input', placeholder: '100', min: '10', max: '1000' });
      minInput.value = col.min;
      minInput.addEventListener('input', e => col.min = e.target.value);
      const maxInput = el('input', { type: 'number', class: 'column-width-input', placeholder: '自動', min: '10', max: '1000' });
      maxInput.value = col.max;
      maxInput.addEventListener('input', e => col.max = e.target.value);
      wFlex.append(el('span', { text:'最小', style:'font-size:12px;' }), minInput, el('span', { text:'〜' }), el('span', { text:'最大', style:'font-size:12px;' }), maxInput);
      widthGroup.appendChild(wFlex);
      detailPanel.appendChild(widthGroup);

      // 依存関係
      const depGroup = el('div');
      depGroup.appendChild(el('label', { text: '条件付き編集（特定の条件を満たす場合のみ入力可能にする）', style: 'display:block; font-size: 12px; font-weight: bold; margin-bottom: 4px;' }));
      
      const depFlex = el('div', { style: 'display: flex; gap: 8px; align-items: center; margin-top: 8px;' });
      const useDepCb = el('input', { type: 'checkbox' });
      useDepCb.checked = !!col.dependsOn;
      
      const depColSel = el('select', { class: 'admin-input', style: 'width: 120px;' });
      depColSel.innerHTML = '<option value="">(親カラム)</option>';
      adminColumnsSetup.forEach(c => {
         if (c.key !== col.key) {
           depColSel.appendChild(el('option', { value: c.key, text: c.label }));
         }
      });
      
      const depValInput = el('input', { type: 'text', class: 'admin-input', placeholder: '親の値(例: 外出)', style: 'flex: 1;' });
      
      if (col.dependsOn) {
        depColSel.value = col.dependsOn.column || '';
        depValInput.value = (col.dependsOn.values || []).join(',');
      }

      const updateDep = () => {
        if (useDepCb.checked) {
          col.dependsOn = {
            column: depColSel.value,
            values: depValInput.value.split(',').map(s => s.trim()).filter(s => s)
          };
        } else {
          col.dependsOn = null;
        }
      };

      useDepCb.onchange = () => {
        depColSel.disabled = !useDepCb.checked;
        depValInput.disabled = !useDepCb.checked;
        updateDep();
      };
      depColSel.onchange = updateDep;
      depValInput.oninput = updateDep;
      
      depColSel.disabled = !useDepCb.checked;
      depValInput.disabled = !useDepCb.checked;

      depFlex.append(useDepCb, depColSel, el('span', { text: 'が次の値の時:', style: 'font-size: 12px;' }), depValInput);
      depGroup.appendChild(depFlex);
      detailPanel.appendChild(depGroup);

      item.appendChild(detailPanel);
      orderList.appendChild(item);
    });
  }

  renderColumnListItems();
  orderSection.appendChild(orderList);
  columnSettingContainer.appendChild(orderSection);

  // カード表示順序設定セクション
  const cardOrderSection = el('div', { class: 'admin-subsection card-order-section', style: 'margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px;' });
  cardOrderSection.appendChild(el('h5', { text: '📱 カード表示の順序' }));
  
  const cardOrderList = el('div', { id: 'cardOrderList', class: 'column-order-list' });

  // カード表示順序の管理用（config.cardがあればそれを初期順序とし、なければboard順）
  let cardOrderKeys = config.card ? config.card.slice() : adminColumnsSetup.filter(c => c.card).map(c => c.key);

  function renderCardOrderListItems() {
    cardOrderList.innerHTML = '';
    // 有効なキーのみフィルタリング
    const activeKeys = cardOrderKeys.filter(k => adminColumnsSetup.find(c => c.key === k && c.card));
    // adminColumnsSetupにあってcardOrderKeysにない「新規追加されたcard有効項目」を追加
    adminColumnsSetup.forEach(c => {
      if (c.card && !activeKeys.includes(c.key)) activeKeys.push(c.key);
    });
    cardOrderKeys = activeKeys;

    cardOrderKeys.forEach((k, idx) => {
      const col = adminColumnsSetup.find(c => c.key === k);
      if (!col) return;

      const item = el('div', { class: 'column-order-item card-order-item', style: 'display: flex; align-items: center; gap: 12px; border: 1px solid var(--border); margin-bottom: 4px; padding: 8px 12px; border-radius: 4px; background: var(--bg-white);' });
      
      const moveActions = el('div', { class: 'column-order-actions', style: 'flex-shrink: 0;' });
      const upBtn = el('button', { class: 'btn-move-up', text: '▲', title: '上に移動' });
      upBtn.disabled = (idx === 0);
      upBtn.addEventListener('click', () => {
        if (idx <= 0) return;
        const tmp = cardOrderKeys[idx - 1];
        cardOrderKeys[idx - 1] = cardOrderKeys[idx];
        cardOrderKeys[idx] = tmp;
        renderCardOrderListItems();
      });
      const downBtn = el('button', { class: 'btn-move-down', text: '▼', title: '下に移動' });
      downBtn.disabled = (idx === cardOrderKeys.length - 1);
      downBtn.addEventListener('click', () => {
        if (idx >= cardOrderKeys.length - 1) return;
        const tmp = cardOrderKeys[idx + 1];
        cardOrderKeys[idx + 1] = cardOrderKeys[idx];
        cardOrderKeys[idx] = tmp;
        renderCardOrderListItems();
      });
      moveActions.append(upBtn, downBtn);
      
      const label = el('span', { text: col.label, style: 'font-weight: 600;' });
      item.append(moveActions, label);
      cardOrderList.appendChild(item);
    });
    
    // クロージャ経由で外部からアクセス可能にする
    cardOrderSection.dataset.cardKeys = JSON.stringify(cardOrderKeys);
  }

  // extractConfigFromSetup で参照できるように関数を公開
  window._getCardOrderKeys = () => cardOrderKeys;

  renderCardOrderListItems();
  cardOrderSection.appendChild(cardOrderList);
  columnSettingContainer.appendChild(cardOrderSection);
}

document.getElementById('btnAddCustomColumn')?.addEventListener('click', () => {
  const keyName = 'custom_' + Date.now().toString(36);
  adminColumnsSetup.push({
    key: keyName,
    label: '新しい項目',
    type: 'textual',
    options: [],
    dependsOn: null,
    board: true,
    popup: false,
    min: '',
    max: '',
    isSystem: false,
    popupEligible: true,
    card: true
  });
  // 画面再描画
  const fakeConfig = extractConfigFromSetup();
  renderColumnConfig(fakeConfig);
});

// UI全体のadminColumnsSetupから保存用の構成オブジェクトを作成する
function extractConfigFromSetup() {
  const boardKeys = [];
  const popupKeys = [];
  const columnWidths = {};
  const customColumns = [];

  adminColumnsSetup.forEach(col => {
    if (col.board) boardKeys.push(col.key);
    if (col.popup) popupKeys.push(col.key);

    const minRaw = col.min;
    const maxRaw = col.max;
    let minW, maxW;
    if (minRaw !== '') { minW = parseInt(minRaw, 10); if (!isNaN(minW)) { minW = Math.max(10, Math.min(minW, 1000)); } else { minW = null; } }
    if (maxRaw !== '') { maxW = parseInt(maxRaw, 10); if (!isNaN(maxW)) { maxW = Math.max(10, Math.min(maxW, 1000)); } else { maxW = null; } }
    
    if (minW != null || maxW != null) {
      columnWidths[col.key] = {};
      if (minW != null) columnWidths[col.key].min = minW;
      if (maxW != null) columnWidths[col.key].max = maxW;
    }

    // 抽出条件: システム定義ではない、もしくはシステム定義だがプロパティが変更されている場合
    const baseSys = COLUMN_DEFINITIONS.find(c => c.key === col.key);
    const overrides = {
      key: col.key,
      label: col.label,
      type: col.type,
      options: col.options,
      dependsOn: col.dependsOn,
      popupEligible: col.popupEligible,
      tableClass: col.key,
      dataLabel: col.label
    };

    if (!baseSys) {
      customColumns.push(overrides);
    } else {
      // システムカラムから何等かの変更があるかチェック
      const isLabelChanged = (baseSys.label !== col.label);
      const isTypeChanged = (baseSys.type !== col.type) && !(!baseSys.type && col.type === 'textual');
      const isOptsChanged = (JSON.stringify(baseSys.options || []) !== JSON.stringify(col.options || []));
      const isDepChanged = (JSON.stringify(baseSys.dependsOn || null) !== JSON.stringify(col.dependsOn || null));
      
      if (isLabelChanged || isTypeChanged || isOptsChanged || isDepChanged) {
        customColumns.push(overrides);
      }
    }
  });

  // セーフティガード: name と status は常に boardKeys に含める
  if (!boardKeys.includes('name')) boardKeys.unshift('name');
  if (!boardKeys.includes('status')) {
    const idxName = boardKeys.indexOf('name');
    boardKeys.splice(idxName + 1, 0, 'status');
  }

  const cardBpEl = document.getElementById(adminColumnLcPrefix + 'cardBreakpoint');
  const panelMinEl = document.getElementById(adminColumnLcPrefix + 'panelMinWidth');
  const layoutConfig = {
    cardBreakpoint: cardBpEl?.value ? parseInt(cardBpEl.value, 10) : null,
    panelMinWidth: panelMinEl?.value ? parseInt(panelMinEl.value, 10) : null
  };

  const rawCardKeys = (typeof window._getCardOrderKeys === 'function') ? window._getCardOrderKeys() : boardKeys;
  // 有効なキーのみにフィルタリング (adminColumnsSetupに存在し、cardがtrueのもの)
  const cardKeys = Array.isArray(rawCardKeys) 
    ? rawCardKeys.filter(k => adminColumnsSetup.some(c => c.key === k && c.card))
    : boardKeys;

  // name は常に含める
  if (!cardKeys.includes('name')) cardKeys.unshift('name');

  return { board: boardKeys, popup: popupKeys, card: cardKeys, columnWidths, layoutConfig, customColumns };
}

async function saveColumnConfig() {
  const office = selectedOfficeId(); if (!office) return;
  const configPayload = extractConfigFromSetup();

  try {
    const res = await apiPost({
      action: 'setColumnConfig',
      token: SESSION_TOKEN,
      office,
      config: JSON.stringify(configPayload)
    });
    if (res && res.ok) {
      toast('カラム構成を保存しました');
      if (office === CURRENT_OFFICE_ID) {
        OFFICE_COLUMN_CONFIG = configPayload;
        localStorage.setItem(getColumnConfigKey(office), JSON.stringify(OFFICE_COLUMN_CONFIG));
        if (typeof render === 'function') {
          render();
          // ★追加: カラム構成変更後も最新ステータスを維持する
          if (typeof applyState === 'function' && typeof STATE_CACHE !== 'undefined' && Object.keys(STATE_CACHE).length > 0) {
            applyState(STATE_CACHE);
          }
        }
      }
    } else {
      toast('保存に失敗しました: ' + (res.error || '不明なエラー'), false);
    }
  } catch (e) {
    console.error('saveColumnConfig error', e);
    toast('通信エラーが発生しました', false);
  }
}

/* 辞書設定 (Gaiji/Furigana) */
/* 拠点管理 (Phase 7 - Super Admin用) */
async function loadOffices() {
  if (!officeTableBody) return;
  try {
    officeTableBody.innerHTML = '<tr><td colspan="3" class="u-text-center u-text-gray">読み込み中...</td></tr>';
    const res = await apiPost({ action: 'listOffices', token: SESSION_TOKEN });
    if (res && res.ok && Array.isArray(res.offices)) {
      renderOfficeTable(res.offices);
    } else {
      officeTableBody.innerHTML = '<tr><td colspan="3" class="u-text-center u-text-red">取得に失敗しました</td></tr>';
    }
  } catch (e) {
    console.error('loadOffices error', e);
    officeTableBody.innerHTML = '<tr><td colspan="3" class="u-text-center u-text-red">通信エラーが発生しました</td></tr>';
  }
}

function renderOfficeTable(offices) {
  if (!officeTableBody) return;
  officeTableBody.innerHTML = '';
  
  if (offices.length === 0) {
    officeTableBody.innerHTML = '<tr><td colspan="3" class="u-text-center u-text-gray">登録された拠点はありません</td></tr>';
    return;
  }
  
  offices.forEach(o => {
    const tr = el('tr', {}, [
      el('td', { text: o.id }),
      el('td', { text: o.name || o.id }),
      el('td', { class: 'u-text-center' }, [
        el('button', { 
          class: 'btn-danger btn-sm', 
          text: '削除',
          onclick: () => deleteOfficeSingle(o.id, o.name)
        })
      ])
    ]);
    officeTableBody.appendChild(tr);
  });
}

async function addOffice() {
  const officeId = document.getElementById('newOfficeId')?.value.trim();
  const name = document.getElementById('newOfficeName')?.value.trim();
  const password = document.getElementById('newOfficePw')?.value.trim();
  const adminPassword = document.getElementById('newOfficeAdminPw')?.value.trim();
  
  if (!officeId || !name || !password || !adminPassword) {
    toast('すべての項目を入力してください', false);
    return;
  }
  
  try {
    const res = await apiPost({ 
      action: 'addOffice', 
      token: SESSION_TOKEN,
      officeId, name, password, adminPassword
    });
    
    if (res && res.ok) {
      toast('拠点を追加しました');
      ['newOfficeId', 'newOfficeName', 'newOfficePw', 'newOfficeAdminPw'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      await loadOffices();
    } else {
      toast('追加に失敗しました: ' + (res.error || '不明なエラー'), false);
    }
  } catch (e) {
    console.error('addOffice error', e);
    toast('通信エラーが発生しました', false);
  }
}

async function deleteOfficeSingle(id, name) {
  if (!confirm(`拠点「${name || id}」を削除しますか？\nこの操作は取り消せません。`)) return;
  
  try {
    const res = await apiPost({ action: 'deleteOffice', token: SESSION_TOKEN, officeId: id });
    if (res && res.ok) {
      toast('拠点を削除しました');
      await loadOffices();
    } else {
      toast('削除に失敗しました: ' + (res.error || '不明なエラー'), false);
    }
  } catch (e) {
    console.error('deleteOffice error', e);
    toast('通信エラーが発生しました', false);
  }
}

