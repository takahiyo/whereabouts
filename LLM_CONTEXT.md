# LLM向けプロジェクト・コンテキスト（Whereabouts / 在席ボード）

本ドキュメントは **NotebookLM・外部LLM** がリポジトリを横断解析するための**単一ソース**です。前半に要約、後半に**現行アプリの全ソース全文**を含みます（`archive/` の旧コード・未使用ファイルは除外）。

## 前半: 要約・ナビゲーション

### 本ファイルの役割

| 用途 | 参照先 |
|------|--------|
| 要約＋**全コード本文** | **本ファイル（LLM_CONTEXT.md）** |
| AI向けコーディング規約の索引 | リポジトリ内 `INDEX.md`（必要なら別ソースに取り込み） |
| 最優先の禁止事項 | `CORE_PRINCIPLES.md` |
| システム構成 | `docs/SYSTEM_ARCHITECTURE.md` |

### 技術スタック（要約）

- フロント: Vanilla JS, HTML5, CSS3（`index.html` の `<script>` 順序に依存）
- API: Cloudflare Workers（`CloudflareWorkers_worker.js`）
- DB: Cloudflare D1（`schema.sql`）
- 定数の集約: `js/constants/*`（SSOT）

### 再生成方法

リポジトリの `whereabouts/` で次を実行すると、本ファイルを同じルールで作り直せます。

- PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/build_llm_context.ps1`
- Node: `node scripts/build_llm_context.mjs`

### 結合に含まれるファイル一覧（`archive/` 除く）

- `index.html`
- `styles.css`
- `print-list.css`
- `schema.sql`
- `CloudflareWorkers_worker.js`
- `sw.js`
- `js/config.js`
- `js/constants/storage.js`
- `js/constants/timing.js`
- `js/constants/ui.js`
- `js/constants/defaults.js`
- `js/constants/column-definitions.js`
- `js/constants/messages.js`
- `js/constants/index.js`
- `js/globals.js`
- `js/utils.js`
- `js/services/qr-generator.js`
- `js/services/csv.js`
- `js/layout.js`
- `js/filters.js`
- `js/board.js`
- `js/vacations.js`
- `js/offices.js`
- `js/firebase-config.js`
- `js/firebase-auth.js`
- `js/auth.js`
- `js/sync.js`
- `js/admin.js`
- `js/tools.js`
- `js/notices.js`
- `main.js`
- `package.json`
- `wrangler.toml`

### 後半: 全ソースコード

以下、各ファイルは `### 相対パス` の見出しの直後にコードブロックで**全文**を記載する。

---
### index.html

```html
<!doctype html>
<html lang="ja">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>在籍確認表</title>

  <!-- 強めのキャッシュ抑止（HTMLに効く） -->
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">

  <!-- CSP：Firebase と Worker への通信を許可 -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'self';
               script-src 'self' 'unsafe-eval' https://www.gstatic.com https://*.firebaseapp.com https://static.cloudflareinsights.com;
               connect-src 'self' https://whereabouts.taka-hiyo.workers.dev https://whereabouts-dev.taka-hiyo.workers.dev https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://www.gstatic.com;
               style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
               img-src 'self' data: https://www.gstatic.com;
               font-src 'self' https://fonts.gstatic.com;
               frame-src 'self' https://*.firebaseapp.com;
               object-src 'none';
               base-uri 'self';
               form-action 'self'">
  <link rel="stylesheet" href="styles.css?v=20260414_v2">
  <link rel="stylesheet" href="print-list.css" media="print">
  <link rel="icon" href="data:,">
  
  <script src="js/auth-guard.js"></script>
</head>

<body>
  <header>
    <div class="title-wrap">
      <button id="titleBtn" class="title-btn" aria-haspopup="true" aria-expanded="false"
        aria-controls="groupMenu">在籍確認表</button>
      <div id="groupMenu" class="grp-menu" role="menu" aria-labelledby="titleBtn">
        <h4 id="groupMenuTitle">グループにジャンプ</h4>
        <ul id="groupMenuList"></ul>
      </div>
    </div>
    <button id="adminBtn" class="admin-btn" title="管理">管理</button>
    <input id="nameFilter" class="name-filter" type="search" placeholder="氏名検索（入力と同時に絞り込み）" aria-label="氏名検索"
      autocomplete="off" name="member_search_query" />
    <select id="statusFilter" class="status-filter" aria-label="ステータスで絞り込み"></select>
    <button id="noticesBtn" class="notices-btn" title="お知らせ">お知らせ</button>
    <button id="eventBtn" class="event-btn" title="イベント">📅 イベント</button>
    <button id="toolsBtn" class="tools-btn" title="ツール">🛠️ ツール</button>
    <button id="logoutBtn" class="logout-btn" title="ログオフ">ログオフ</button>
    <button id="manualBtn" class="manual-btn" title="マニュアル">マニュアル</button>
    <button id="qrBtn" class="qr-btn" title="QRcode">📱 QRcode</button>
  </header>

  <!-- 管理モーダル -->
  <div id="adminModal" class="admin-modal" aria-modal="true" role="dialog">
    <div class="admin-card">
      <div class="admin-card-header">
        <div class="admin-modal-header-row">
          <h3>管理パネル</h3><button id="adminClose" class="btn-pill">閉じる</button>
        </div>

        <!-- タブナビゲーション -->
        <div class="admin-tabs">
          <div class="tab-buttons">
            <button class="tab-btn active" data-tab="basic">⚙️ 基本</button>
            <button class="tab-btn" data-tab="groups">📁 グループ</button>
            <button class="tab-btn" data-tab="members">👥 メンバー</button>
            <button class="tab-btn" data-tab="columns">📊 カラム</button>
            <button id="btnTabOffices" class="tab-btn u-hidden" data-tab="offices">🏢 拠点</button>
            <button class="tab-btn" data-tab="notices">📢 お知らせ</button>
            <button class="tab-btn" data-tab="events">📅 イベント</button>
            <button class="tab-btn" data-tab="tools">🛠️ ツール</button>
          </div>
        </div>
      </div>

      <div class="admin-card-body">
        <!-- 開発者用：拠点切り替え行 -->
        <div id="adminOfficeRow" class="admin-office-row u-hidden">
          <div class="admin-office-selector-inner">
            <label for="adminOfficeSel">📍 管理対象拠点:</label>
            <select id="adminOfficeSel"></select>
            <span class="admin-office-hint">※拠点を切り替えると、設定内容もその拠点のものに切り替わります。</span>
          </div>
        </div>

        <!-- タブパネル1: 基本設定 -->
        <div id="tabBasic" class="tab-panel active" data-tab="basic">
          <div class="admin-toolbar">
            <h4>⚙️ 基本設定</h4>
          </div>
          <div class="admin-grid">
            <div class="admin-box admin-box-stacked">
              <h4>📁 CSV管理</h4>
              <div class="admin-subsection">
                <h5>📥 在席確認表リスト エクスポート</h5>
                <div class="admin-row"><button id="btnExport" class="btn-pill">📥 ダウンロード</button></div>
                <div class="admin-note">形式：グループ番号,グループ名,表示順,id,氏名,内線,携帯番号,Email,業務時間,ステータス,戻り時間,明日の予定,備考</div>
                <div class="admin-note u-font-sm u-text-gray">※従来フォーマット（携帯番号・Email列なし）も引き続き対応</div>
              </div>
              <div class="admin-subsection">
                <h5>📤 在席確認表リスト インポート</h5>
                <div class="admin-row">
                  <label for="csvFile" class="btn-pill btn-file-label">📁 ファイルを選択</label>
                  <input type="file" id="csvFile" class="u-hidden-input" accept=".csv,text/csv" />
                  <button id="btnImport" class="btn-pill">📤 取り込み</button>
                </div>
              </div>
            </div>

            <div class="admin-box admin-box-stacked">
              <h4>🏢 拠点設定</h4>
              <div class="admin-subsection">
                <h5>拠点名の変更</h5>
                <div class="admin-row"><input id="renameOfficeName" placeholder="新しい拠点名" /><button
                    id="btnRenameOffice">変更</button></div>
              </div>
              <div class="admin-subsection">
                <h5>一般利用者パスワードの変更</h5>
                <div class="admin-row">
                  <input id="setPw" placeholder="新パスワード (12文字以上, 2種類混在)" aria-label="一般利用者パスワード" autocomplete="new-password" />
                  <button id="btnSetPw">更新</button>
                </div>
                <div class="admin-note">※一般利用者が拠点IDでログインする際の共有パスワードです（管理者・Ownerは個別のFirebase認証を利用してください）。</div>
                <div class="admin-note u-text-red u-font-sm">※12文字以上、かつ英数字・記号など2種類以上の入力が必要です。</div>
              </div>
            </div>

                      <div class="admin-box admin-box-stacked">
                        <h4>🔄 項目自動消去設定</h4>
                        <div class="admin-subsection">
                          <div class="admin-row u-mb-12 auto-clear-setting-row">
                            <label class="auto-clear-checkbox-label">
                              <input type="checkbox" id="autoClearEnabled" class="u-m-0" style="width: 20px; height: 20px;">
                              <span>自動消去を有効にする</span>
                            </label>
            
                            <div style="display: flex; align-items: center; gap: 8px;">
                              <label for="autoClearHour" style="font-weight: 600;">実行時間:</label>
                              <select id="autoClearHour" class="auto-clear-hour-select">
                                <option value="0">0:00 (深夜)</option>
                                <option value="1">1:00</option>
                                <option value="2">2:00</option>
                                <option value="3">3:00</option>
                                <option value="4">4:00</option>
                                <option value="5">5:00</option>
                                <option value="6">6:00</option>
                                <option value="7">7:00</option>
                                <option value="8">8:00</option>
                                <option value="9">9:00</option>
                                <option value="10">10:00</option>
                                <option value="11">11:00</option>
                                <option value="12">12:00 (正午)</option>
                                <option value="13">13:00</option>
                                <option value="14">14:00</option>
                                <option value="15">15:00</option>
                                <option value="16">16:00</option>
                                <option value="17">17:00</option>
                                <option value="18">18:00</option>
                                <option value="19">19:00</option>
                                <option value="20">20:00</option>
                                <option value="21">21:00</option>
                                <option value="22">22:00</option>
                                <option value="23">23:00</option>
                              </select>
                            </div>
            
                            <button id="btnSaveAutoClear" class="btn-success" style="margin-left: auto;">💾 設定を保存</button>
                          </div>
            
                          <div class="admin-note u-mb-8" style="font-weight: 600; color: #4b5563;">消去する項目を選択してください：</div>
                          <div id="autoClearFields" class="auto-clear-fields-container">
                            <label class="auto-clear-field-item"><input type="checkbox" value="workHours"> 業務時間</label>
                            <label class="auto-clear-field-item"><input type="checkbox" value="status"> ステータス</label>
                            <label class="auto-clear-field-item"><input type="checkbox" value="time"> 戻り時間</label>
                            <label class="auto-clear-field-item"><input type="checkbox" value="tomorrowPlan"> 明日の予定</label>
                            <label class="auto-clear-field-item"><input type="checkbox" value="note"> 備考</label>
                          </div>
                          <div class="admin-note u-mt-8">※指定した時間（毎日）に、拠点の全メンバーのチェックした項目が自動的に消去されます。ステータスは「在席」に戻ります。</div>
                        </div>
                      </div>

                      <div class="admin-box admin-box-stacked">
                        <h4>🖨️ 一覧出力（PDF出力）</h4>
                        <div class="admin-subsection">
                          <div class="admin-row u-flex-end-gap" style="align-items: center; flex-wrap: wrap;">
                            <label for="adminExportSort" style="font-weight: 600;">ソート順:</label>
                            <select id="adminExportSort" style="padding: 6px; border-radius: 4px; border: 1px solid #ccc;">
                              <option value="default">表示順設定（デフォルト）</option>
                              <option value="name">氏名順</option>
                              <option value="time">業務時間順</option>
                              <option value="status">ステータス順</option>
                            </select>
            
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600;">
                              <input type="checkbox" id="adminExportOneTable" style="width: 18px; height: 18px;">
                              全てのメンバーを1つの表にまとめる
                            </label>
            
                            <button id="btnPrintList" class="btn-pill">🖨️ 一覧出力（印刷）</button>
                          </div>
                          <div class="admin-note u-mt-8">※ブラウザの印刷機能を使用してPDFとして保存できます。「全てのメンバーを1つの表にまとめる」をチェックするとグループ分けを無視して出力します。
                          </div>
                        </div>
                      </div>

          </div>
        </div>

        <!-- タブパネル: グループ管理 -->
        <div id="tabGroups" class="tab-panel" data-tab="groups">
          <div class="admin-toolbar">
            <h4>📁 グループ操作</h4>
          </div>

          <div class="admin-box">
            <div class="admin-box-header">
              <strong>グループ追加</strong>
            </div>
            <div class="group-add-row u-mt-12">
              <input type="text" id="groupAddInput" placeholder="新しいグループ名を入力" aria-label="新規グループ名" />
              <button type="button" id="btnGroupAdd" class="btn-primary">➕ 追加</button>
            </div>
          </div>

          <div class="admin-box u-mt-16">
            <div class="admin-box-header">
              <strong>並べ替え・名称変更・削除</strong>
            </div>
            <div class="admin-note">
              ドラッグで並べ替え、名前をクリックして編集できます。
            </div>
            <div id="groupOrderList" class="group-order-list"></div>
            <div id="groupOrderEmpty" class="admin-note u-mt-6">グループがありません。</div>
          </div>
        </div>

        <!-- タブパネル: メンバー管理 -->
        <div id="tabMembers" class="tab-panel" data-tab="members">
          <div class="admin-toolbar">
            <h4>👥 メンバー管理</h4>
            <div class="admin-toolbar-actions">
              <button id="btnMemberSave" class="btn-pill">💾 変更を保存</button>
            </div>
          </div>
            <!-- モーダル形式に変更 -->
            <div id="memberAddModal" class="admin-modal-overlay u-hidden">
              <div class="admin-box member-add-popup" id="memberEditTop">
              <div class="admin-box-header">
                <h4>👥 メンバー登録</h4>
                <button type="button" class="btn-close-modal" id="btnCloseMemberAdd">✕</button>
              </div>
              <div class="admin-note">各項目をクリックして直接編集、ドラッグまたは↑↓ボタンで並び替えができます。</div>
              <form id="memberEditForm" class="member-edit-form member-inline-form">
                <input type="hidden" id="memberEditId" />
                <div class="member-edit-grid">
                  <label>氏名（必須）
                    <input id="memberEditName" type="text" required placeholder="例：山田 太郎" />
                  </label>
                  <label>所属グループ（必須）
                    <input id="memberEditGroup" type="text" list="memberGroupOptions" placeholder="既存グループを選択 or 入力" />
                    <datalist id="memberGroupOptions"></datalist>
                  </label>
                  <label>内線
                    <input id="memberEditExt" type="tel" inputmode="numeric" placeholder="数字のみ" />
                  </label>
                  <label>携帯
                    <input id="memberEditMobile" type="tel" inputmode="tel" placeholder="例：090-1234-5678" />
                  </label>
                  <label>Email
                    <input id="memberEditEmail" type="email" placeholder="example@example.com" />
                  </label>
                </div>
                <div class="member-edit-actions">
                  <div class="member-edit-actions-left">
                    <span id="memberEditModeLabel" class="member-edit-mode">新規メンバー登録フォーム</span>
                  </div>
                  <div class="member-edit-actions-right">
                    <button type="button" id="memberEditReset" class="btn-secondary">入力クリア</button>
                    <button type="submit" class="btn-primary">➕ メンバーを登録</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
          <div class="member-filter-row">
            <label for="memberFilterInput" class="member-filter-label">氏名フィルター</label>
            <div class="member-filter-controls">
              <input id="memberFilterInput" type="search" placeholder="在席確認表の氏名で絞り込み" aria-label="氏名フィルター" />
              <button id="btnMemberFilterClear" class="btn-pill" type="button">クリア</button>
              <button id="btnOpenAddMember" class="btn-pill" style="margin-left: auto;">➕ 新規メンバー追加</button>
            </div>
          </div>
          <div class="member-table-wrap">
            <table class="member-table">
              <thead>
                <tr>
                  <th>順番</th>
                  <th>グループ</th>
                  <th>氏名</th>
                  <th>内線</th>
                  <th>携帯</th>
                  <th>Email</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody id="memberTableBody">
                <tr>
                  <td colspan="7" class="u-text-center u-text-gray">読み込み待ち</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <!-- タブパネル: カラム構成 (Phase 6) -->
        <div id="tabColumns" class="tab-panel" data-tab="columns">
          <div class="admin-toolbar">
            <h4>🎛️ カラム構成</h4>
            <div class="admin-toolbar-actions">
              <button id="btnAddCustomColumn" class="btn-pill">➕ 新規追加</button>
              <button id="btnColumnSave" class="btn-pill">💾 保存</button>
            </div>
          </div>
          <div id="columnSettingContainer" class="column-setting-container">
            <!-- JSでレスポンシブ設定やカラム一覧が動的に生成されます -->
            <p class="u-text-center u-text-gray u-my-12">設定を読み込み中...</p>
          </div>
        </div>

        <!-- タブパネル: 拠点管理 (Phase 7 - Super Admin Only) -->
        <div id="tabOffices" class="tab-panel" data-tab="offices">
          <div class="admin-box">
            <div class="admin-box-header">
              <h4>🏢 拠点一覧・追加</h4>
            </div>
            <div class="admin-note">
              システム全体の拠点を管理します。拠点を追加・削除できます。<br>
              ※拠点を削除すると、その拠点のメンバーや設定もすべて削除されます。
            </div>
            <div class="office-add-form u-mb-3">
              <div class="u-grid u-grid-2-cols u-gap-1">
                <input type="text" id="adminNewOfficeId" placeholder="拠点ID (例: tokyo_honsya)" class="u-w-100">
                <input type="text" id="adminNewOfficeName" placeholder="拠点名 (例: 東京本社)" class="u-w-100">
                <input type="password" id="adminNewOfficePw" placeholder="ユーザー用PW" class="u-w-100">
                <input type="password" id="adminNewOfficeAdminPw" placeholder="管理者用PW" class="u-w-100">
              </div>
              <button id="btnAddOffice" class="btn-primary u-w-100 u-mt-2">➕ 新しい拠点を追加</button>
            </div>
            <div class="admin-table-wrapper">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>拠点名</th>
                    <th class="u-text-center">操作</th>
                  </tr>
                </thead>
                <tbody id="officeTableBody">
                  <tr><td colspan="3" class="u-text-center u-text-gray">読み込み中...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- タブパネル2: お知らせ管理 -->
        <div id="tabNotices" class="tab-panel" data-tab="notices">
          <div class="admin-toolbar">
            <h4>📢 お知らせ管理</h4>
            <div class="admin-toolbar-actions">
              <button id="btnLoadNotices" class="btn-secondary btn-sm">🔄 読み込み</button>
              <button id="btnSaveNotices" class="btn-success btn-sm">💾 保存</button>
            </div>
          </div>
          <div class="notices-manager">
            <div class="notices-manager-toolbar">
              <div class="notices-manager-info">
                <p>上にあるものから順に表示されます。ドラッグして並び替え可能です。</p>
              </div>
              <div class="notices-manager-actions">
                <button id="btnAddNotice" class="btn-primary">➕ お知らせを新規追加</button>
              </div>
            </div>

            <div class="notices-manager-scroll">
              <div id="noticesEditor" class="notices-editor"></div>
            </div>
          </div>
        </div>

        <!-- タブパネル3: イベント管理 -->
        <div id="tabEvents" class="tab-panel" data-tab="events">
          <div class="admin-toolbar">
            <h4>📅 イベント管理</h4>
            <div class="admin-toolbar-actions">
              <button id="btnExportEvent" class="btn-secondary btn-sm">📄 エクスポート</button>
            </div>
          </div>
          <div class="vacation-grid">
            <div class="admin-box">
              <div class="u-flex-between-center u-mb-8">
                <h4 class="u-m-0">登録済みのイベント</h4>
              </div>
              <div class="vacation-table-wrap">
                <table class="vacation-table">
                  <thead>
                    <tr>
                      <th class="u-w-44">並び</th>
                      <th>タイトル</th>
                      <th>期間</th>
                      <th>対象拠点</th>
                      <th>休暇固定（種別）</th>
                      <th>色</th>
                      <th>備考</th>
                      <th>表示</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody id="vacationListBody">
                    <tr>
                      <td colspan="9" class="u-text-center u-text-gray">読み込み待ち</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="admin-box">
              <h4>イベントの作成 / 更新</h4>
              <div class="vacation-form">
                <div class="vacation-row">
                  <label>対象拠点
                    <select id="vacationOffice" aria-label="対象拠点"></select>
                  </label>
                </div>
                <div class="vacation-row">
                  <label>タイトル
                    <input id="vacationTitle" type="text" placeholder="例: GW期間休暇" />
                  </label>
                </div>
                <div class="vacation-row vacation-row-two-cols">
                  <label>開始日
                    <input id="vacationStart" type="date" />
                  </label>
                  <label>終了日
                    <input id="vacationEnd" type="date" />
                  </label>
                </div>
                <div class="vacation-row vacation-row-inline">
                  <label>お知らせを選択
                    <select id="vacationNotice" aria-label="イベントに紐づけるお知らせ"></select>
                  </label>
                  <div class="vacation-inline-actions">
                    <button id="btnCreateNoticeFromEvent" class="btn-secondary">➕ お知らせ新規作成</button>
                  </div>
                </div>
                <div class="vacation-row vacation-row-two-cols">
                  <label>
                    種別
                    <input id="vacationTypeText" type="text" value="休暇固定（一覧で切替）" readonly />
                    <span class="vacation-helper">※ 種別は一覧の「休暇固定」列で変更できます。</span>
                  </label>
                  <label>色/カテゴリー
                    <select id="vacationColor" aria-label="色/カテゴリー">
                      <option value="amber">サニー</option>
                      <option value="blue">ブルー</option>
                      <option value="green">グリーン</option>
                      <option value="pink">ピンク</option>
                      <option value="purple">パープル</option>
                      <option value="teal">ティール</option>
                      <option value="gray">グレー</option>
                    </select>
                  </label>
                </div>
                <div class="vacation-row u-hidden">
                  <label>メンバーの休暇指定（ガントで自動入力）
                    <input id="vacationMembersBits" type="text" placeholder="ガント入力で自動反映されます" readonly />
                    <span class="vacation-helper">※ 手入力は不要です。下のガント表で休暇にしたいメンバーと日付をONにしてください。</span>
                  </label>
                </div>
                <div class="vacation-actions">
                  <button id="btnVacationSave" class="btn-pill">💾 作成/更新</button>
                  <button id="btnVacationDelete" class="btn-pill btn-danger">🗑️ 削除</button>
                  <button id="btnVacationClear" class="btn-pill">🧹 入力クリア</button>
                  <button id="btnVacationReload" class="btn-pill">🔄 一覧更新</button>
                </div>
                <div class="vacation-row u-hidden">
                  <div class="vacation-gantt-head">
                    <div class="vacation-gantt-title">ガント入力</div>
                    <div class="vacation-gantt-help">開始日/終了日に合わせて日付スロットを生成し、セルをクリック/ドラッグ（スマホはタップ）するとビットが切り替わります。</div>
                  </div>
                  <div id="vacationGantt" class="vacation-gantt" aria-live="polite"></div>
                </div>
                <div class="vacation-row u-hidden">
                  <label>ID（自動設定）
                    <input id="vacationId" type="text" readonly placeholder="新規作成時は空欄のまま" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- タブパネル4: ツール管理 -->
        <div id="tabTools" class="tab-panel" data-tab="tools">
          <div class="admin-toolbar">
            <h4>🛠️ ツール情報の管理</h4>
          </div>

          <div class="tools-manager">
            <div class="tools-manager-toolbar">
              <div class="tools-manager-info">
                <p>ツールの順序はドラッグ&ドロップまたは▲▼ボタンで入れ替えられます。上にあるものから順に表示されます。</p>
                <p>タイトルとURL、備考を入力できます。表示をOFFにしたツールは利用者画面に表示されません。</p>
              </div>
              <div class="tools-manager-actions">
                <button id="btnAddTool" class="btn-primary">➕ ツールを追加</button>
                <button id="btnLoadTools" class="btn-secondary">🔄 読み込み</button>
                <button id="btnSaveTools" class="btn-success">💾 保存</button>
              </div>
            </div>

            <div class="tools-manager-scroll">
              <div id="toolsEditor" class="tools-editor"></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- イベントモーダル -->
  <div id="eventModal" class="admin-modal event-modal" aria-modal="true" role="dialog" aria-label="イベント表示設定">
    <div class="admin-card">
      <div class="event-modal-header">
        <h3 class="event-modal-title">イベントカレンダー</h3>
        <button id="eventClose">閉じる</button>
      </div>

      <!-- タブパネル: イベント選択 -->
      <div id="tabEvent" class="tab-panel active">
        <div class="vacation-view">
          <div class="event-select-toolbar">
            <label class="event-select-label">
              <span>イベントを選択:</span>
              <select id="eventSelectDropdown" class="event-select-dropdown"></select>
            </label>
            <button id="btnShowEventNotice" class="btn-secondary btn-show-event-notice u-hidden">📄
              イベントの内容を表示</button>
          </div>
          <div id="vacationRadioList" class="vacation-radio-list u-hidden"></div>
          <div id="eventGanttWrap" class="vacation-gantt-head">
            <div class="vacation-gantt-sticky-header">
              <div class="event-toolbar">
                <div class="event-toolbar__hint">
                  <span class="vacation-gantt-touch-hint">セルをクリック/ドラッグ（スマホはタップ）するとON/OFFを切り替えられます。</span>
                  <span id="eventColorManualHint" class="event-color-manual-hint u-hidden" role="status"
                    aria-live="polite"></span>
                </div>
                <div class="vacation-actions u-mb-0 u-flex-end-gap">
                  <button id="btnEventSave" class="btn-primary">💾 保存</button>
                  <button id="btnEventPrint" class="btn-secondary">🖨️ 印刷</button>
                </div>
              </div>
              <div id="eventGroupJumps" class="vacation-group-jumps u-hidden" aria-label="グループジャンプ">
                <span class="jump-label">グループ移動</span>
                <div class="jump-buttons" aria-label="グループジャンプボタン"></div>
                <label class="jump-select u-hidden" aria-label="グループジャンプ選択">
                  <span class="sr-only">グループを選択</span>
                  <select id="eventGroupJumpSelect"></select>
                </label>
              </div>
              <div id="eventLegendModal" class="event-legend event-legend-compact" aria-live="polite"></div>
            </div>
            <div id="eventPrintInfo" class="u-hidden"></div>
            <div id="eventGantt" class="vacation-gantt" aria-live="polite"></div>
            <input id="eventStart" type="hidden" />
            <input id="eventEnd" type="hidden" />
            <input id="eventBits" type="hidden" />
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- お知らせプレビューモーダル（イベント経由専用） -->
  <div id="noticeModal" class="admin-modal notice-modal" aria-modal="true" role="dialog"
    aria-labelledby="noticeModalTitle" aria-hidden="true">
    <div class="admin-card notice-modal-card">
      <div class="notice-modal-header">
        <h3 id="noticeModalTitle">関連お知らせ</h3>
        <button id="noticeModalClose" aria-label="閉じる">閉じる</button>
      </div>
      <div id="noticeModalBody" class="notice-modal-body"></div>
    </div>
  </div>

  <!-- ツールモーダル -->
  <div id="toolsModal" class="admin-modal tools-modal" aria-modal="true" role="dialog"
    aria-labelledby="toolsModalTitle">
    <div class="admin-card tools-modal-card">
      <div class="tools-modal-header">
        <h3 id="toolsModalTitle">🛠️ ツール一覧</h3>
        <button id="toolsModalClose" aria-label="閉じる">閉じる</button>
      </div>
      <div id="toolsList" class="tools-list">
        <div class="tools-empty">ツール情報を読み込み中です…</div>
      </div>
    </div>
  </div>

  <!-- マニュアルモーダル -->
  <div id="manualModal" class="manual-modal" aria-modal="true" role="dialog" aria-labelledby="manualTitle">
    <div class="manual-card" role="document">
      <div>
        <div class="admin-modal-header-row u-mb-12">
          <h3 id="manualTitle" class="u-m-0">マニュアル</h3>
          <button id="manualClose" aria-label="閉じる">閉じる</button>
        </div>
        <div class="manual-tabs">
          <button class="manual-tab-btn active" data-tab="user">📖 ユーザー向け</button>
          <button class="manual-tab-btn" data-tab="admin">⚙️ 管理者向け</button>
        </div>
      </div>

      <section id="manualUser" class="manual-section manual-tab-content active">
        <h4>📖 ユーザーマニュアル - 初めての方へ</h4>

        <div class="manual-alert manual-alert-info">
          <strong>💡 このシステムについて</strong><br>
          在席確認表は、チームメンバーの在席状況をリアルタイムで共有するシステムです。<br>
          入力した内容は自動的に保存され、他の人のPCやスマートフォンにも即座に反映されます。
        </div>

        <h5>🔐 1. 初回ログイン（管理者からパスワードを受け取ってください）</h5>
        <ol class="u-lh-18">
          <li><strong>拠点を選択</strong>：ドロップダウンから所属する拠点（営業所）を選びます</li>
          <li><strong>パスワードを入力</strong>：管理者から教えてもらったパスワードを入力します</li>
          <li><strong>「ログイン」ボタンをクリック</strong></li>
          <li>✅ ログイン成功すると、在席確認表が表示されます</li>
        </ol>
        <p class="manual-subtext">
          ※ログイン状態は1時間保持され、自動的に延長されます。ブラウザを閉じた場合は再ログインが必要です。
        </p>

        <h5>👁️ 2. 画面の見方</h5>
        <ul class="u-lh-18">
          <li><strong>画面上部（ヘッダー）</strong>：
            <ul class="u-mt-4">
              <li>📍 <strong>タイトル</strong>：拠点名が表示されます（クリックするとグループ一覧メニューが開きます）</li>
              <li>🔍 <strong>氏名検索</strong>：特定の人を探すときに使います</li>
              <li>🎯 <strong>ステータス絞り込み</strong>：「外出中の人だけ」など、条件で絞り込めます</li>
              <li>📢 <strong>お知らせ</strong>：お知らせがある場合に表示。クリックで折りたたみ/展開を切り替えます</li>
              <li>⚙️ <strong>管理</strong>：管理者のみ表示されます</li>
              <li>🚪 <strong>ログオフ</strong>：ログアウトします</li>
              <li>📖 <strong>マニュアル</strong>：このマニュアルを表示します</li>
            </ul>
          </li>
          <li><strong>メイン画面</strong>：
            <ul class="u-mt-4">
              <li>チーム（グループ）ごとに表が表示されます</li>
              <li>各行がメンバー1人の情報です</li>
              <li>スマートフォンでは自動的にカード表示に切り替わります</li>
            </ul>
          </li>
        </ul>

        <h5>✍️ 3. 基本操作 - 自分の状態を更新する</h5>

        <p class="u-my-8"><strong>📝 業務時間の入力</strong></p>
        <ol class="u-lh-18">
          <li>自分の行の「業務時間」欄をクリック</li>
          <li>直接入力するか、表示される候補リストから選択（例：<code>09:00-17:30</code>）</li>
          <li>✅ 入力が完了すると、約1秒後に自動保存されます（保存ボタンは不要です）</li>
        </ol>

        <p class="u-mt-16 u-mb-8"><strong>🎨 ステータスの選択（色分けされます）</strong></p>
        <table class="status-table">
          <tr>
            <th>ステータス</th>
            <th>色</th>
            <th>戻り時間</th>
            <th>使用例</th>
          </tr>
          <tr>
            <td>在席</td>
            <td>無色（白）</td>
            <td>不要</td>
            <td>デスクにいるとき</td>
          </tr>
          <tr>
            <td>外出</td>
            <td>🟠 オレンジ</td>
            <td><strong>必須</strong></td>
            <td>銀行、郵便局など</td>
          </tr>
          <tr>
            <td>在宅勤務</td>
            <td>🟣 紫</td>
            <td>不要</td>
            <td>テレワーク中</td>
          </tr>
          <tr>
            <td>出張</td>
            <td>🔵 水色</td>
            <td><strong>必須</strong></td>
            <td>他拠点や客先へ</td>
          </tr>
          <tr>
            <td>研修</td>
            <td>🟢 緑</td>
            <td><strong>必須</strong></td>
            <td>研修・セミナー参加</td>
          </tr>
          <tr>
            <td>健康診断</td>
            <td>🩷 ピンク</td>
            <td><strong>必須</strong></td>
            <td>健康診断受診中</td>
          </tr>
          <tr>
            <td>ドック</td>
            <td>💜 薄紫</td>
            <td><strong>必須</strong></td>
            <td>ドック受診中</td>
          </tr>
          <tr>
            <td>帰宅</td>
            <td>⚪ 灰色</td>
            <td>不要</td>
            <td>退社済み</td>
          </tr>
          <tr>
            <td>休み</td>
            <td>🔴 赤</td>
            <td>不要</td>
            <td>休暇・欠勤</td>
          </tr>
        </table>

        <p class="u-mt-16 u-mb-8"><strong>⏰ 戻り時間の入力（外出、出張、研修などの場合）</strong></p>
        <ol class="u-lh-18">
          <li>ステータスで「外出」「出張」「研修」「健康診断」「ドック」を選ぶと、戻り時間が<strong class="u-text-red">必須</strong>になります</li>
          <li>「戻り時間」のドロップダウンをクリックして選択（07:00〜22:00、30分刻み）</li>
          <li>⚠️ 未入力の場合は赤枠で表示されます（必ず入力してください）</li>
        </ol>
        <p class="u-my-8 u-text-666 u-font-09em">
          💡 ヒント：「在席」「在宅勤務」「帰宅」「休み」を選ぶと、戻り時間と備考が自動的にクリアされます
        </p>

        <p class="u-mt-16 u-mb-8"><strong>📌 備考の入力（任意）</strong></p>
        <ul class="u-lh-18">
          <li>「備考」欄をクリックして、自由に入力できます</li>
          <li>候補から選ぶこともできます：<strong>直出</strong>、<strong>直帰</strong>、<strong>直出・直帰</strong></li>
          <li>空白にしたい場合は「（空白）」を選択してください</li>
        </ul>

        <h5>📅 4. イベントの表示</h5>
        <p><strong>イベント機能とは</strong></p>
        <ul class="u-lh-18">
          <li>GW、年末年始、夏季休暇など、複数日にわたる休暇を簡単に管理できます</li>
          <li>管理者が休暇期間とメンバーを事前に設定しておくことで、休暇中のメンバーがわかりやすくなります</li>
          <li>イベントが登録されている場合のみ、ヘッダーに「イベント」ボタンが表示されます</li>
        </ul>

        <p class="u-mt-12"><strong>イベントの表示方法</strong></p>
        <ol class="u-lh-18">
          <li>ヘッダーの<strong>「イベント」</strong>ボタンをクリック</li>
          <li>登録されているイベントの一覧が表示されます（例：「GW期間休暇」「年末年始休暇」）</li>
          <li>表示したいイベントをクリックして選択</li>
          <li>ガントチャート（カレンダー形式の表）が表示され、どのメンバーがいつ休暇なのかを確認できます</li>
          <li><strong>「表示」</strong>ボタンをクリック → メイン画面で該当メンバーの行が<strong>ハイライト表示</strong>されます</li>
        </ol>

        <p class="u-mt-12"><strong>表示される内容</strong></p>
        <ul class="u-lh-18">
          <li>休暇中のメンバーの行が色付きでハイライトされます</li>
          <li>ステータス欄にイベントのタイトル（例：「GW期間休暇」）が表示されます</li>
          <li>画面上部に「イベント表示中」のバナーが表示されます</li>
        </ul>

        <p class="u-mt-12"><strong>表示を解除する</strong></p>
        <ul class="u-lh-18">
          <li>イベントモーダルで<strong>「表示クリア」</strong>ボタンをクリックすると、ハイライトが解除されます</li>
          <li>別のイベントを選択すると、表示が切り替わります</li>
        </ul>

        <div class="manual-alert manual-alert-warning">
          <strong>💡 ヒント</strong>
          <ul class="u-my-8 u-lh-18">
            <li>イベントの<strong>登録・編集・削除</strong>は管理者のみが行えます</li>
            <li>イベントを設定したい場合は、管理者に問い合わせてください</li>
            <li>イベントボタンが表示されない場合は、現在登録されているイベントがありません</li>
          </ul>
        </div>

        <h5>🔍 5. 他の人の状況を確認する</h5>
        </h5>

        <p><strong>氏名検索の使い方</strong></p>
        <ol class="u-lh-18">
          <li>画面上部の検索ボックスに名前を入力（例：「田中」）</li>
          <li>入力すると同時に、該当する人だけが表示されます</li>
          <li>検索を解除するには、入力内容を削除してください</li>
        </ol>

        <p class="u-mt-12"><strong>ステータスで絞り込み</strong></p>
        <ol class="u-lh-18">
          <li>画面上部の「ステータス絞り込み」ドロップダウンをクリック</li>
          <li>見たいステータスを選択（例：「外出中の人だけ見る」→「外出」を選択）</li>
          <li>全員表示に戻すには「全て」を選択してください</li>
        </ol>

        <p class="u-mt-12"><strong>グループジャンプ（画面が長い場合）</strong></p>
        <ol class="u-lh-18">
          <li>画面上部の拠点名（タイトル）をクリック</li>
          <li>グループ一覧メニューが表示されます</li>
          <li>行きたいグループをクリックすると、その位置にスクロールします</li>
        </ol>

        <h5>📢 5. お知らせ機能の使い方</h5>
        <p><strong>お知らせエリアとは</strong></p>
        <ul class="u-lh-18">
          <li>管理者が登録した重要なお知らせが、ヘッダーとメイン画面の間に表示されます</li>
          <li>システムメンテナンス、業務連絡、注意事項などが掲載されます</li>
          <li>お知らせがない場合は、お知らせエリアとボタンは表示されません</li>
        </ul>

        <p class="u-mt-12"><strong>折りたたみ/展開の切り替え</strong></p>
        <ol class="u-lh-18">
          <li><strong>初期状態（ログイン直後）</strong>：お知らせは<strong>展開</strong>された状態で表示されます</li>
          <li><strong>折りたたみ</strong>：ヘッダーの「お知らせ」ボタンをクリック → 最初のお知らせのタイトルと件数のみ表示されます<br>
            <span class="u-text-666 u-font-09em">例：「システムメンテナンスのお知らせ (他2件)」</span>
          </li>
          <li><strong>展開</strong>：もう一度「お知らせ」ボタンをクリック → すべてのお知らせが表示されます</li>
        </ol>

        <p class="u-mt-12"><strong>お知らせの更新頻度</strong></p>
        <ul class="u-lh-18">
          <li>管理者が追加・編集・削除したお知らせは、約30秒ごとに自動的に反映されます</li>
          <li>すぐに確認したい場合は、ページを再読み込み（F5キー）してください</li>
        </ul>

        <h5>🔄 6. 自動更新について（重要）</h5>
        <div class="manual-alert manual-alert-warning">
          <strong>⚡ リアルタイム同期</strong>
          <ul class="u-my-8 u-lh-18">
            <li>✅ あなたが入力した内容は、<strong>約1秒後</strong>に自動的に保存されます</li>
            <li>✅ 他の人が入力した在席状況は、<strong>約10秒ごと</strong>に自動的にあなたの画面に反映されます</li>
            <li>✅ お知らせや設定の変更は、<strong>約30秒ごと</strong>に自動的に反映されます</li>
            <li>✅ 保存ボタンや更新ボタンは<strong>不要</strong>です</li>
            <li>⚠️ 入力中や変換中は、他の人の更新が一時的に保留されます（入力の邪魔になりません）</li>
          </ul>
        </div>

        <h5>❓ よくある質問</h5>
        <details class="manual-details">
          <summary>Q. 保存ボタンはどこですか？</summary>
          <p>A. 保存ボタンはありません。入力すると自動的に約1秒後に保存されます。</p>
        </details>
        <details class="manual-details">
          <summary>Q. お知らせボタンが表示されません</summary>
          <p>A. お知らせがない場合、お知らせボタンとお知らせエリアは表示されません。管理者がお知らせを登録すると自動的に表示されます（約30秒以内に反映）。
          </p>
        </details>
        <details class="manual-details">
          <summary>Q. お知らせが邪魔で画面が見づらい</summary>
          <p>A. ヘッダーの「お知らせ」ボタンをクリックすると、お知らせエリアを折りたたむことができます。折りたたむと1行のサマリー表示になります。</p>
        </details>
        <details class="manual-details">
          <summary>Q. 戻り時間が選択できません</summary>
          <p>A. ステータスが「在席」「在宅勤務」「帰宅」「休み」の場合、戻り時間は不要なため選択できません。「外出」「出張」などに変更してください。</p>
        </details>
        <details class="manual-details">
          <summary>Q. スマートフォンでも使えますか？</summary>
          <p>A. はい、スマートフォンのブラウザでも利用できます。画面が自動的にカード表示に切り替わります。</p>
        </details>
        <details class="manual-details">
          <summary>Q. 間違えて入力してしまいました</summary>
          <p>A. すぐに正しい内容に入力し直してください。約2秒後に自動保存されます。</p>
        </details>



        <p class="u-mt-16 u-font-095em">
          <strong>📚 さらに詳しく知りたい方へ</strong><br>
          より詳細な情報は <a href="USER_MANUAL.md" target="_blank" class="u-link-blue">詳細マニュアル（USER_MANUAL.md）</a> をご覧ください。
        </p>
      </section>

      <section id="manualAdmin" class="manual-section manual-tab-content">
        <h4>⚙️ 管理者マニュアル</h4>

        <div class="manual-alert manual-alert-warning">
          <strong>🔐 管理者ログインについて</strong><br>
          管理パネルを表示するには、<strong>管理者パスワード</strong>でログインしてください。<br>
          一般ユーザーパスワードではログインできても「管理」ボタンは表示されません。
        </div>

        <h5>📂 1. CSVエクスポート - データのバックアップ</h5>
        <p><strong>用途</strong>：現在の名簿と在席データをExcelで編集できる形式でダウンロードします</p>
        <ol class="u-lh-18">
          <li>画面上部の「管理」ボタンをクリック</li>
          <li>管理パネルが開きます</li>
          <li>「CSVエクスポート」セクションの「ダウンロード」ボタンをクリック</li>
          <li>✅ ファイル <code>presence_<拠点ID>.csv</code> がダウンロードされます</li>
        </ol>
        <p class="u-mt-8 u-text-red u-bold">⚠️ 重要：CSVインポート前に必ずエクスポートでバックアップを取ってください！</p>

        <h5>📥 2. CSVインポート - 名簿の一括登録・更新</h5>
        <p><strong>用途</strong>：Excelで編集した名簿を一括で取り込みます（名簿全体が置き換わります）</p>

        <p class="u-mt-12 u-mb-8"><strong>対応しているCSV形式</strong></p>
        <ul class="u-lh-18">
          <li>
            <strong>最新形式（推奨）</strong>：<code>1行目: 在席管理CSV / 2行目: グループ番号,グループ名,表示順,id,氏名,内線,携帯番号,Email,業務時間,ステータス,戻り時間,備考</code>
          </li>
          <li><strong>標準形式</strong>：<code>グループ番号,グループ名,表示順,id,氏名,内線,業務時間,ステータス,戻り時間,備考</code>（携帯番号・Email列なし、タイトル行なし）
          </li>
          <li><strong>旧形式</strong>：<code>グループ番号,グループ名,表示順,id,氏名,内線,ステータス,戻り時間,備考</code>（業務時間列なし。既存データから引き継ぎます）</li>
        </ul>

        <p class="u-mt-12 u-mb-8"><strong>操作手順</strong></p>
        <ol class="u-lh-18">
          <li><strong class="u-text-red">【重要】まずエクスポートでバックアップを取る</strong></li>
          <li>ダウンロードしたCSVファイルをExcelで開いて編集</li>
          <li>管理パネルの「CSVインポート」セクションで「ファイルを選択」をクリック</li>
          <li>編集したCSVファイルを選択</li>
          <li>「取り込み」ボタンをクリック</li>
          <li>✅「インポート完了」と表示されたら成功です</li>
        </ol>

        <div class="manual-alert manual-alert-danger">
          <strong>⚠️ 注意事項</strong>
          <ul class="u-my-8 u-lh-18">
            <li>インポートすると<strong>名簿全体が置き換わります</strong>（部分更新はできません）</li>
            <li>CSVに含まれないメンバーは削除されます</li>
            <li>元に戻すにはバックアップのCSVを再インポートしてください</li>
            <li>最新形式では1行目がタイトル行、2行目がヘッダー行です（標準・旧形式は1行目がヘッダー行）</li>
          </ul>
        </div>

        <h5>🏢 3. 拠点名の変更</h5>
        <ol class="u-lh-18">
          <li>管理パネルの「拠点名の変更」セクションに新しい拠点名を入力</li>
          <li>「変更」ボタンをクリック</li>
          <li>✅ 画面タイトルとログイン画面の拠点名が変更されます</li>
        </ol>

        <h5>🔑 4. パスワード変更</h5>
        <p>2種類のパスワードを個別に変更できます：</p>
        <ul class="u-lh-18">
          <li><strong>新パスワード</strong>：一般ユーザーがログインするときのパスワード</li>
          <li><strong>新管理者PW</strong>：管理者権限でログインするときのパスワード</li>
        </ul>
        <ol class="u-lh-18">
          <li>変更したいパスワード欄に新しいパスワードを入力（両方でも片方でもOK）</li>
          <li>「更新」ボタンをクリック</li>
          <li>✅「パスワードを更新しました」と表示されたら成功です</li>
        </ol>
        <p class="u-my-8 u-text-666 u-font-09em">
          💡 パスワードは平文で保存されます。<strong>強固なパスワード</strong>を使用してください。
        </p>

        <h5>📢 5. お知らせ管理</h5>
        <p><strong>用途</strong>：拠点のメンバー全員に重要な情報を掲示します</p>

        <div class="manual-alert manual-alert-success">
          <strong>✨ 自動読み込み機能</strong><br>
          管理パネルを開くと、現在のお知らせが<strong>自動的に表示</strong>されます。<br>
          「現在のお知らせを読み込み」ボタンを押す必要はありません。
        </div>

        <p class="u-mt-12 u-mb-8"><strong>お知らせの追加</strong></p>
        <ol class="u-lh-18">
          <li>管理パネルを開く（現在のお知らせが自動表示されます）</li>
          <li>「➕ お知らせを追加」ボタンをクリック → 入力欄が追加されます</li>
          <li><strong>タイトル</strong>（最大200文字）と<strong>内容</strong>（最大2000文字）を入力</li>
          <li>「保存」ボタンをクリック</li>
          <li>✅ お知らせが即座に保存され、約30秒以内に全ユーザーの画面に表示されます</li>
        </ol>

        <p class="u-mt-12 u-mb-8"><strong>お知らせの編集</strong></p>
        <ol class="u-lh-18">
          <li>編集したいお知らせの「編集」ボタンをクリック</li>
          <li>入力欄に内容が表示されるので、修正します</li>
          <li>「保存」ボタンをクリック</li>
        </ol>

        <p class="u-mt-12 u-mb-8"><strong>お知らせの削除</strong></p>
        <ol class="u-lh-18">
          <li>削除したいお知らせの「削除」ボタンをクリック</li>
          <li>確認ダイアログで「OK」をクリック</li>
        </ol>

        <div class="manual-alert manual-alert-teal">
          <strong>💡 お知らせ機能のポイント</strong>
          <ul class="u-my-8 u-lh-18">
            <li>お知らせは<strong>拠点ごと</strong>に独立して管理されます</li>
            <li>1拠点あたり<strong>最大20件</strong>まで登録できます</li>
            <li>お知らせは<strong>追加した順</strong>（古い順）に表示されます</li>
            <li>HTML/スクリプトは自動的に無効化されます（セキュリティ対策）</li>
            <li>全ユーザーの画面に<strong>約30秒以内</strong>に自動反映されます</li>
          </ul>
        </div>

        <p class="u-mt-12 u-mb-8"><strong>お知らせの用途例</strong></p>
        <ul class="u-lh-18">
          <li>🔧 システムメンテナンスの予定</li>
          <li>📅 全体会議やイベントの案内</li>
          <li>⚠️ 業務上の注意事項</li>
          <li>🎉 新機能の案内</li>
          <li>📢 重要な連絡事項</li>
        </ul>

        <h5>📅 5. イベント管理</h5>
        <p><strong>用途</strong>：GW、年末年始、夏季休暇など、複数日にわたる休暇を事前に登録・管理します</p>

        <div class="manual-alert manual-alert-success">
          <strong>✨ イベント機能の特長</strong>
          <ul class="u-my-8 u-lh-18">
            <li>ガントチャート形式で休暇期間とメンバーを視覚的に管理できます</li>
            <li>対象メンバーの在席状況が自動的にハイライト表示されます</li>
            <li>ユーザーは登録されたイベントを選択して表示できます</li>
            <li>表示/非表示の切り替えで、公開するイベントをコントロールできます</li>
          </ul>
        </div>

        <p class="u-mt-12 u-mb-8"><strong>イベントの作成</strong></p>
        <ol class="u-lh-18">
          <li>管理パネルを開き、<strong>「📅 イベント管理」</strong>タブをクリック</li>
          <li><strong>対象拠点</strong>を選択（スーパー管理者の場合）</li>
          <li><strong>タイトル</strong>を入力（例：「GW期間休暇」「年末年始休暇」）</li>
          <li><strong>開始日</strong>と<strong>終了日</strong>を入力（カレンダーから選択可能）</li>
          <li><strong>備考</strong>（任意）を入力（社内共有用のメモなど）</li>
          <li><strong>「表示する」</strong>チェックボックスをONにすると、ユーザーがイベントボタンから選択できるようになります</li>
          <li>ガントチャート（日付×メンバーの表）で、休暇対象のメンバーと日付のセルをクリック/ドラッグしてONにします</li>
          <li><strong>「💾 作成/更新」</strong>ボタンをクリック</li>
          <li>✅「イベントを保存しました」と表示されたら成功です</li>
        </ol>

        <p class="u-mt-12 u-mb-8"><strong>イベントの編集</strong></p>
        <ol class="u-lh-18">
          <li>管理パネルの「登録済みのイベント」一覧から、編集したい項目の<strong>「編集」</strong>ボタンをクリック</li>
          <li>入力欄に現在の設定が表示されます</li>
          <li>必要な項目を修正します</li>
          <li><strong>「💾 作成/更新」</strong>ボタンをクリック</li>
        </ol>

        <p class="u-mt-12 u-mb-8"><strong>イベントの削除</strong></p>
        <ol class="u-lh-18">
          <li>編集したいイベントを選択（編集ボタンをクリック）</li>
          <li><strong>「🗑️ 削除」</strong>ボタンをクリック</li>
          <li>確認ダイアログで「OK」をクリック</li>
        </ol>

        <p class="u-mt-12 u-mb-8"><strong>ガントチャートの操作方法</strong></p>
        <ul class="u-lh-18">
          <li><strong>セルをクリック</strong>：休暇のON/OFFを切り替え</li>
          <li><strong>ドラッグ</strong>：連続した日付やメンバーを一度に設定</li>
          <li><strong>スマートフォン</strong>：タップで操作可能</li>
          <li><strong>グループジャンプ</strong>：メンバーが多い場合、グループ選択で素早く移動できます</li>
          <li><strong>色分け</strong>：土日・祝日は自動的に色付けされます</li>
        </ul>

        <p class="u-mt-12 u-mb-8"><strong>イベントの並び替え</strong></p>
        <p>「登録済みのイベント」一覧では、複数のイベントの表示順序を変更できます。</p>
        <ol class="u-lh-18">
          <li>一覧の「並び」列にある<strong>「↑」「↓」ボタン</strong>をクリックすると、イベントの順序が入れ替わります</li>
          <li>上にあるイベントほど優先度が高く、ユーザーが選択する際のリストの上位に表示されます</li>
          <li>並び替え後、<strong>自動的に保存</strong>されます（保存ボタンを押す必要はありません）</li>
        </ol>
        <div class="manual-hint">
          <strong>💡 ヒント</strong>：現在進行中のイベント（例：GW、年末年始）を上位に配置すると、ユーザーが選択しやすくなります。
        </div>

        <p class="u-mt-12 u-mb-8"><strong>休暇種別（休暇固定）の設定</strong></p>
        <p>各イベントに対して、ステータスとして表示される「休暇種別」を設定できます。</p>
        <ul class="u-lh-18">
          <li><strong>設定場所</strong>：「登録済みのイベント」一覧の<strong>「休暇固定（種別）」</strong>列</li>
          <li><strong>操作方法</strong>：該当の列をクリックすると、ドロップダウンから種別を選択できます</li>
          <li><strong>選択肢</strong>：「休み」「休暇」「特休」「有給」「代休」などから選択可能</li>
          <li><strong>自動保存</strong>：選択すると即座に保存され、ユーザーの画面に反映されます</li>
        </ul>
        <div class="manual-alert manual-alert-success">
          <strong>使用例</strong>
          <ul class="u-my-4 u-lh-16">
            <li>「GW期間休暇」→ 種別：<strong>「休暇」</strong>（通常の長期休暇）</li>
            <li>「年末年始休暇」→ 種別：<strong>「休み」</strong>（会社休業日）</li>
            <li>「夏季休暇」→ 種別：<strong>「有給」</strong>（有給休暇推奨期間）</li>
            <li>「創立記念日」→ 種別：<strong>「特休」</strong>（特別休暇）</li>
          </ul>
        </div>

        <p class="u-mt-12 u-mb-8"><strong>色/カテゴリーの設定</strong></p>
        <p>イベントに色を設定することで、視覚的に区別しやすくなります。</p>
        <ul class="u-lh-18">
          <li><strong>設定場所</strong>：イベント作成/更新フォームの「色/カテゴリー」ドロップダウン</li>
          <li><strong>選択肢</strong>：
            <ul class="u-my-4 u-ml-20">
              <li>🟡 <strong>サニー（amber）</strong>：明るい黄色系（夏季休暇など）</li>
              <li>🔵 <strong>ブルー（blue）</strong>：青系（通常の休暇）</li>
              <li>🟢 <strong>グリーン（green）</strong>：緑系（有給推奨期間など）</li>
              <li>🩷 <strong>ピンク（pink）</strong>：ピンク系（特別イベント）</li>
              <li>🟣 <strong>パープル（purple）</strong>：紫系（記念日など）</li>
              <li>🟦 <strong>ティール（teal）</strong>：青緑系（研修期間など）</li>
              <li>⚫ <strong>グレー（gray）</strong>：灰色系（非アクティブなイベント）</li>
            </ul>
          </li>
          <li><strong>効果</strong>：一覧表示やカレンダー表示時に、設定した色でイベントが識別されます</li>
        </ul>

        <p class="u-mt-12 u-mb-8"><strong>管理者によるユーザー休暇日の編集</strong></p>
        <p>管理者は、イベント作成時のガントチャートで全ユーザーの休暇日を一括設定できます。</p>
        <ol class="u-lh-18">
          <li>イベント作成/更新フォームで<strong>開始日と終了日</strong>を入力すると、ガントチャートが表示されます</li>
          <li>ガントチャート上で、<strong>各メンバーの休暇日をクリック/ドラッグ</strong>してON（青色）に設定します</li>
          <li>複数のメンバーを一度に設定する場合は、<strong>ドラッグ操作</strong>が便利です</li>
          <li>設定後、<strong>「💾 作成/更新」</strong>ボタンをクリックすると保存されます</li>
          <li>✅ ユーザーがそのイベントを選択すると、設定した日が自動的に「休み」ステータスになります</li>
        </ol>
        <div class="manual-alert manual-alert-danger">
          <strong>⚠️ 重要</strong>：イベントカレンダーでユーザー自身が変更した休暇日は、<strong>ユーザー個人のデータ</strong>として保存されます。<br>
          管理者が後からガントチャートを編集しても、既にユーザーが保存した個人設定は上書きされません。
        </div>

        <p class="u-mt-12 u-mb-8"><strong>表示/非表示の切り替え</strong></p>
        <ul class="u-lh-18">
          <li>「登録済みのイベント」一覧の<strong>「表示」チェックボックス</strong>で切り替えられます</li>
          <li>チェックON：ユーザーがイベントボタンから選択できます</li>
          <li>チェックOFF：管理者のみ閲覧可能（ユーザーには表示されません）</li>
          <li>複数のイベントを同時に「表示」にできますが、ユーザーが選択できるのは1つだけです</li>
        </ul>

        <div class="manual-alert manual-alert-teal">
          <strong>💡 イベント機能のポイント</strong>
          <ul class="u-my-8 u-lh-18">
            <li>イベントは<strong>拠点ごと</strong>に独立して管理されます</li>
            <li>ユーザーがイベントを選択すると、該当メンバーの行が<strong>ハイライト表示</strong>されます</li>
            <li>ステータス欄にイベントのタイトルが表示され、内部的には「休み」として扱われます</li>
            <li>イベント表示を解除するまで、該当メンバーのステータスは編集できません</li>
            <li>休暇期間が終了しても自動的には解除されません（手動で非表示にしてください）</li>
          </ul>
        </div>

        <p class="u-mt-12 u-mb-8"><strong>イベントの用途例</strong></p>
        <ul class="u-lh-18">
          <li>🎌 <strong>GW（ゴールデンウィーク）</strong>：5月の連休期間</li>
          <li>🎆 <strong>夏季休暇</strong>：8月のお盆休み期間</li>
          <li>🎄 <strong>年末年始休暇</strong>：12月末〜1月初旬</li>
          <li>🏢 <strong>会社全体休業日</strong>：創立記念日など</li>
          <li>📅 <strong>特定チームの一斉休暇</strong>：部署単位の休暇計画</li>
        </ul>

        <h5>📋 運用上の注意事項</h5>
        <ul class="u-lh-18">
          <li>💾 <strong>バックアップは必須</strong>：重要な操作の前に必ずCSVエクスポートでバックアップを取ってください</li>
          <li>👥 <strong>複数管理者の同時操作は避ける</strong>：競合してデータが失われる可能性があります</li>
          <li>🔄 <strong>定期バックアップ</strong>：週1回程度、定期的にCSVエクスポートすることを推奨します</li>
          <li>🔒 <strong>パスワード管理</strong>：パスワードは平文保存のため、強固なものを使い、関係者以外に漏らさないでください</li>
        </ul>

        <h5>❓ よくある質問（管理者向け）</h5>
        <details class="manual-details">
          <summary>Q. CSVインポートで「CSVヘッダが不正です」と出る</summary>
          <p>A. ヘッダー行（最新形式では2行目）が正しい形式か確認してください。エクスポートしたCSVのヘッダー行をそのまま使うのが確実です。</p>
        </details>
        <details class="manual-details">
          <summary>Q. 誤ってメンバーを削除してしまった</summary>
          <p>A. 削除前のバックアップCSVを再インポートしてください。バックアップがない場合は手動でCSVを作成する必要があります。</p>
        </details>
        <details class="manual-details">
          <summary>Q. メニュー設定のJSONが正しいか不安</summary>
          <p>A.
            オンラインのJSONバリデーター（例：jsonlint.com）で確認できます。保存時にエラーが出た場合は「現在の設定を読み込み」で元に戻してください。</p>
        </details>
        <details class="manual-details">
          <summary>Q. イベントのガントチャートが表示されません</summary>
          <p>A. 開始日と終了日を入力してから、ガントチャートが生成されます。日付を入力していることを確認してください。</p>
        </details>
        <details class="manual-details">
          <summary>Q. イベントを保存したのにユーザーに表示されない</summary>
          <p>A. 「表示する」チェックボックスがONになっているか確認してください。チェックOFFの場合、管理者のみ閲覧可能でユーザーには表示されません。</p>
        </details>
        <details class="manual-details">
          <summary>Q. イベントの表示をやめたい</summary>
          <p>A. イベント管理で該当する休暇の「表示」チェックボックスをOFFにしてください。または、休暇を削除することもできます。</p>
        </details>
        <details class="manual-details">
          <summary>Q. イベントの並び順を変更したい</summary>
          <p>A. 「登録済みのイベント」一覧の「並び」列にある↑↓ボタンをクリックすると順序を変更できます。変更は自動保存されます。</p>
        </details>
        <details class="manual-details">
          <summary>Q. 休暇種別（休暇固定）を変更したい</summary>
          <p>A.
            「登録済みのイベント」一覧の「休暇固定（種別）」列をクリックすると、ドロップダウンから種別（休み、休暇、特休、有給、代休など）を選択できます。選択すると即座に保存されます。</p>
        </details>
        <details class="manual-details">
          <summary>Q. イベントの色を変更したい</summary>
          <p>A. イベント編集画面の「色/カテゴリー」ドロップダウンから、サニー、ブルー、グリーン、ピンク、パープル、ティール、グレーの中から選択できます。</p>
        </details>
        <details class="manual-details">
          <summary>Q. 複数のイベントを同時に表示できますか？</summary>
          <p>A.
            管理者は複数のイベントを「表示する」に設定できますが、ユーザーが実際に選択できるのは1つだけです。ユーザーはイベントボタンから選択して切り替えることができます。</p>
        </details>
        <details class="manual-details">
          <summary>Q. ユーザーが個別に変更した休暇日を管理者が確認できますか？</summary>
          <p>A.
            ユーザーが長期休暇カレンダーで変更した内容は、そのユーザーの「メンバーの休暇指定ビット（membersBits）」として保存されています。管理者はCSVエクスポートで確認できますが、直接編集する機能は現在ありません。各ユーザーが自分で長期休暇カレンダーから変更してください。
          </p>
        </details>
        <details class="manual-details">
          <summary>Q. ガントチャートで設定した休暇日が反映されない</summary>
          <p>A. ガントチャートでセルをクリック/ドラッグした後、必ず「💾
            作成/更新」ボタンをクリックして保存してください。また、ユーザー側で該当イベントを選択していない場合は、休暇日として反映されません。</p>
        </details>
        <details class="manual-details">
          <summary>Q. イベントの対象拠点を変更したい</summary>
          <p>A. イベント編集画面の「対象拠点」ドロップダウンから変更できます（スーパー管理者のみ）。変更後「💾 作成/更新」ボタンで保存してください。</p>
        </details>

        <p class="u-mt-16 u-font-095em">
          <strong>📚 さらに詳しく知りたい方へ</strong><br>
          より詳細な情報は <a href="ADMIN_MANUAL.md" target="_blank" class="u-link-blue">管理者向け詳細マニュアル（ADMIN_MANUAL.md）</a>
          をご覧ください。
        </p>
      </section>
    </div>
  </div>

  <!-- ログイン / サインアップ UI -->
  <div id="login" class="login u-hidden">
    <div id="loginForm" class="card">
      <h2 id="authTitle">在席確認表</h2>

      <!-- 統合ログインフォーム (ID または メール) -->
      <div id="loginFormArea">
        <p class="u-font-09em u-mb-8">拠点名 または メールアドレスでログイン</p>
        <input type="text" id="loginOfficeId" placeholder="オフィス名 (例: 株式会社ABC 本社) または Email" autocomplete="username" />
        <input type="password" id="loginPassword" placeholder="パスワード" autocomplete="current-password" />
        <button id="btnSimpleLogin" type="button" class="u-mt-16 btn-pill">ログイン</button>
        
        <p class="u-mt-24 u-font-08em u-text-center">
          新規開設（管理者登録）をご希望ですか？ 
          <br class="u-mobile-only">
          <a href="#" id="linkGotoSignup" class="u-link-blue">こちらから開始</a>
        </p>
      </div>

      <!-- 2. サインアップ（管理者登録） -->
      <div id="signupFormArea" class="u-hidden u-text-center">
        <p class="u-font-09em u-mb-8">管理者（オーナー）新規登録</p>
        <input type="email" id="signupEmail" placeholder="メールアドレス" class="u-mb-8" />
        <input type="password" id="signupPw" placeholder="パスワード" class="u-mb-4" />
        <p id="signupPwHint" class="u-font-07em u-text-gray u-mb-16">大小英字、数字、記号の内2種類以上を含む12文字以上</p>
        <button id="btnAuthSignup" type="button" class="btn-pill">登録</button>
        <p class="u-mt-16 u-font-08em">
          <a href="#" id="linkGotoLogin" class="u-link-blue">ログインに戻る</a>
        </p>
      </div>

      <!-- 3. メール認証待ち -->
      <div id="verifyEmailArea" class="u-hidden u-text-center">
        <p class="u-mb-8">📩 確認メールを送信しました</p>
        <p class="u-font-08em u-mb-16">メール内のリンクをクリックして認証を完了させた後、この画面に戻ってログインしてください。</p>
        <button id="btnVerifyDone" type="button" class="btn-pill">完了してログイン画面へ</button>
      </div>

      <!-- 4. 拠点作成 -->
      <div id="createOfficeArea" class="u-hidden">
        <p class="u-mb-8">🏢 新しい拠点を立ち上げる</p>
        <input type="text" id="newOfficeId" placeholder="オフィスID (半角英数字、例: abc_honsya)" class="u-mb-8" />
        <input type="text" id="newOfficeName" placeholder="オフィス名 (例: 株式会社ABC 本社)" class="u-mb-8" />
        <input type="password" id="newOfficePw" placeholder="一般利用者用パスワード (12文字以上)" class="u-mb-4" />
        <p class="u-font-07em u-text-gray u-mb-16">※12文字以上、かつ2種類以上の文字種を含めてください</p>
        <button id="btnCreateOffice" type="button" class="btn-pill u-w-full">拠点を登録して開始</button>
      </div>

      <div id="loginMsg" class="login-msg" aria-live="polite"></div>
    </div>
  </div>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <!-- お知らせエリア -->
  <div id="noticesArea" class="notices-area u-hidden">
    <div class="notices-container">
      <div class="notices-header">
        <h3 class="notices-title">📢 お知らせ<span class="notices-hint">（タイトル行や📢ボタンをクリックすると折りたためます）</span></h3>
        <span id="noticesSummary" class="notices-summary u-hidden"></span>
      </div>
      <div id="noticesList" class="notices-list"></div>
    </div>
  </div>

  <div class="wrap">
    <div id="board" class="board u-hidden"></div>
  </div>
  <div id="diag" class="diag"></div>
  <!-- 一覧出力（印刷）用のワークエリア -->
  <div id="printListWorkArea" class="print-list-work-area u-hidden"></div>
  <!-- QRコードモーダル -->
  <div id="qrModal" class="admin-modal qr-modal" aria-modal="true" role="dialog" aria-labelledby="qrModalTitle">
    <div class="admin-card qr-modal-card">
      <div class="qr-modal-header">
        <h3 id="qrModalTitle">📱 共有用QRコード</h3>
        <button id="qrModalClose" class="btn-pill" aria-label="閉じる">閉じる</button>
      </div>
      <div class="qr-modal-body">
        <div class="qr-container">
          <div id="qrOutput" class="qr-image-container"></div>
        </div>
        <p class="qr-help">このQRコードをスマートフォンで読み取ると、拠点名が入力された状態でアクセスできます。</p>
      </div>
    </div>
  </div>

  <script src="js/config.js" defer></script>
  <!-- 定数ファイル (SSOT) - config.jsの後、globals.jsの前に読み込む -->
  <script src="js/constants/storage.js?v=20260414_v2" defer></script>
  <script src="js/constants/timing.js" defer></script>
  <script src="js/constants/ui.js" defer></script>
  <script src="js/constants/defaults.js" defer></script>
  <script src="js/constants/column-definitions.js" defer></script>
  <script src="js/constants/messages.js?v=20260414_v2" defer></script>
  <script src="js/globals.js?v=20260414_v2" defer></script>
  <script src="js/utils.js?v=20260414_v2" defer></script>
  <script src="js/services/qr-generator.js" defer></script>
  <script src="js/services/csv.js" defer></script>
  <script src="js/layout.js?v=20260414_v2" defer></script>
  <script src="js/filters.js" defer></script>
  <script src="js/board.js?v=20260414_v2" defer></script>
  <script src="js/vacations.js" defer></script>
  <script src="js/offices.js" defer></script>
  <script src="js/firebase-auth.js" type="module"></script>
  <script src="js/auth.js?v=20260414_v2" type="module"></script>
  <script src="js/sync.js?v=20260414_v2" defer></script>
  <script src="js/admin.js?v=20260414_v2" defer></script>
  <script src="js/tools.js" defer></script>
  <script src="js/notices.js" defer></script>
  <script src="main.js?v=20260414_v2" defer></script>

</body>

</html>

`

### styles.css

```css
:root {
  /* === パネル表示（多段）用幅定義 (SSOT) === */
  /* カラム幅は js/constants/column-definitions.js をマスターとし、JSから動的に --table-min-width 等を設定する */
  /* ユーザーが「管理画面 > 拠点設定」で設定した最小・最大値により上書きされる */

  /* ステータス幅: --status-fixed が拠点設定にある場合はそれを優先 */
  --status-effective: var(--status-fixed, 134px);

  /* テーブル最小幅 SSOT: 拠点 min 幅設定
     未設定時は table の min-width 属性使用時と同様、panel の横スクロールを制御 */
  --table-min-width: 700px;

  --gap: 20px;
  --line: #d9d9d9;
  --head: #f1ece6;
  --bg: #fafafa;
  --header-height: 56px;

  /* === カラーパレット (SSOT) === */
  --color-white: #ffffff;
  --color-black: #000000;
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-300: #d1d5db;
  --color-gray-400: #9ca3af;
  --color-gray-500: #6b7280;
  --color-gray-600: #4b5563;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;

  --color-blue-50: #eff6ff;
  --color-blue-100: #dbeafe;
  --color-blue-200: #bfdbfe;
  --color-blue-500: #3b82f6;
  --color-blue-600: #2563eb;
  --color-blue-700: #1d4ed8;

  --color-green-50: #f0fdf4;
  --color-green-100: #dcfce7;
  --color-green-500: #22c55e;

  --color-red-50: #fef2f2;
  --color-red-100: #fee2e2;
  --color-red-200: #fecaca;
  --color-red-500: #ef4444;
  --color-red-600: #dc2626;

  --color-amber-50: #fffbeb;
  --color-amber-100: #fef3c7;
  --color-amber-400: #fbbf24;

  --color-pink-50: #fdf2f8;
  --color-pink-100: #fce7f3;
  --color-pink-200: #fbcfe8;

  --color-indigo-50: #eef2ff;
  --color-indigo-100: #e0e7ff;
  --color-indigo-200: #c7d2fe;

  /* 基本のカラー定義 */
  --color-border: var(--line);
  --color-panel-bg: var(--bg);
  --color-header-bg: var(--color-white);
  --color-body-bg: var(--color-white);
  --color-text-main: var(--color-gray-900);
  --color-text-muted: var(--color-gray-500);

  --color-btn-group-bg: #dff1ff;
  /* 陟墓瑳謫よｿｶ・ｲ驍ｯ・ｭ隰・*/
  --color-btn-group-border: #bfe4ff;
  --color-btn-notices-bg: var(--color-amber-50);
  --color-btn-notices-border: var(--color-amber-400);
  --color-btn-admin-bg: #e7f8e7;
  /* ボタングループのボーダー */
  --color-btn-admin-border: #b7e6b7;
  --color-btn-event-bg: var(--color-pink-50);
  --color-btn-event-border: var(--color-pink-200);
  --color-btn-logout-bg: var(--color-red-100);
  --color-btn-logout-border: var(--color-red-200);
  --color-btn-tools-bg: #e0f2fe;
  /* 陟墓瑳謫よｿｶ・ｲ驍ｯ・ｭ隰・*/
  --color-btn-tools-border: #bae6fd;
  --color-btn-manual-bg: var(--color-indigo-50);
  --color-btn-manual-border: var(--color-indigo-200);

  /* === Pill/Round Buttons === */
  --btn-pill-radius: 8px; /* Corrected to rounded rectangle style as requested */
  --btn-pill-padding: 0.5rem 1.25rem;
}

body {
  font-family: "Segoe UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
  background: var(--color-body-bg);
  margin: 16px;
  color: var(--color-text-main);
}

body.modal-open {
  overflow: hidden !important;
}

/* 郢晏･繝｣郢昶ぎ */
header {
  position: sticky;
  top: 0;
  z-index: 1500;
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  background: var(--color-header-bg);
  padding: 6px 0;
  box-shadow: 0 1px 0 rgba(0, 0, 0, .06);
}

.title-wrap {
  position: relative;
}

header .title-btn,
header .notices-btn,
header .admin-btn,
header .event-btn,
header .logout-btn,
header .manual-btn,
header .qr-btn,
header .tools-btn {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-gray-800);
  padding: .35rem .9rem;
  border-radius: 999px;
  line-height: 1.2;
  border: 1px solid transparent;
  cursor: pointer;
}

header .title-btn {
  background: var(--color-btn-group-bg);
  border-color: var(--color-btn-group-border);
}

header .notices-btn {
  background: var(--color-btn-notices-bg);
  border-color: var(--color-btn-notices-border);
  display: none;
}

header .admin-btn {
  background: var(--color-btn-admin-bg);
  border-color: var(--color-btn-admin-border);
  display: none;
}

header .event-btn {
  background: var(--color-btn-event-bg);
  border-color: var(--color-btn-event-border);
  display: none;
}

header .logout-btn {
  background: var(--color-btn-logout-bg);
  border-color: var(--color-btn-logout-border);
  display: none;
}

header .tools-btn {
  background: var(--color-btn-tools-bg);
  border-color: var(--color-btn-tools-border);
  display: none;
}

header .manual-btn {
  background: var(--color-btn-manual-bg);
  border-color: var(--color-btn-manual-border);
  display: none;
}

header .qr-btn {
  background: #f0fdf4; /* green-50邵ｺ・ｫ騾ｶ・ｸ陟冶侭笘・ｹｧ荵昶ｲ隴丞ｮ茨ｽ､・ｺ騾ｧ竊題棔逕ｻ辟夂ｸｺ蠕娯・邵ｺ笳・ｹｧ竏壹￡郢晢ｽｪ郢晢ｽｼ郢晢ｽｳ驍会ｽｻ郢ｧ蜻域ｲｻ騾包ｽｨ */
  border-color: #bbf7d0; /* green-200騾ｶ・ｸ陟・*/
  display: none; /* リクエストにより非表示 */
}

/* 検索/フィルタUIをモバイル等での表示スペース確保のため非表示 */
.name-filter,
.status-filter {
  display: none;
  padding: .35rem .6rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 14px;
}

.name-filter {
  min-width: 220px;
  max-width: 50vw;
}

.status-filter {
  min-width: 170px;
}

/* 郢晏€･繝｣郢昶ぎ陷€隶€諛・ｽｴ・｢郢晄㈱繝｣郢ｧ・ｯ郢ｧ・ｹ邵ｺ・ｮ陜暦ｽｺ陞ｳ螢ｼ・ｹ - 陋ｻ譎・ｄ髯ｦ・ｨ驕会ｽｺ郢ｧ蟶晄直髯ｦ・ｨ驕会ｽｺ(none)邵ｺ・ｫ陞溽判蟲ｩ邵ｺ蜉ｱ繝｡郢晢ｽｩ邵ｺ・､邵ｺ蝓ｼ莠溯ｱ・ｽ｢ */
header #nameFilter,
header .name-filter {
  display: none;
  width: clamp(220px, 32vw, 360px) !important;
  min-width: 220px;
  max-width: 50vw;
  flex: 0 0 auto;
}

.tab-panel[data-tab="members"] .admin-toolbar,
.tab-panel[data-tab="members"] .member-filter-row,
.tab-panel[data-tab="columns"] .admin-toolbar,
.tab-panel[data-tab="notices"] .admin-toolbar {
  padding-left: 24px;
  padding-right: 24px;
}

.tab-panel[data-tab="members"] .admin-toolbar,
.tab-panel[data-tab="columns"] .admin-toolbar,
.tab-panel[data-tab="notices"] .admin-toolbar {
  padding-top: 24px; /* Card body paddingの代わり */
}

.tab-panel[data-tab="members"] .admin-toolbar,
.tab-panel[data-tab="members"] .member-filter-row {
  padding-left: 24px;
  padding-right: 24px;
}

.tab-panel[data-tab="members"] .admin-toolbar {
  padding-top: 24px; /* Card body paddingの代わり */
}

.tab-panel[data-tab="members"] .member-table-wrap {
  flex: 1;
  overflow: auto;
  border-top: 1px solid var(--line);
  background: #fff;
  min-height: 0;
  margin: 0; /* padding:0にしたのでマージンでの打ち消しは不要 */
  border-left: none;
  border-right: none;
  border-bottom: none;
}

.tab-panel[data-tab="members"] table.member-table {
  width: 100%;
  table-layout: auto;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 800px;
}

.tab-panel[data-tab="members"] table.member-table th {
  position: sticky;
  top: 0;
  background: var(--color-gray-100);
  z-index: 10;
  border-bottom: 2px solid var(--line);
  padding: 12px 8px; /* ヘッダーの視認性向上 */
}

/* 各列の最小幅を確保 (極端に縮まないように) */
.tab-panel[data-tab="members"] th:nth-child(1),
.tab-panel[data-tab="members"] td:nth-child(1) { min-width: 55px; text-align: center; } /* 順番 */
.tab-panel[data-tab="members"] th:nth-child(2),
.tab-panel[data-tab="members"] td:nth-child(2) { min-width: 110px; } /* グループ */
.tab-panel[data-tab="members"] th:nth-child(3),
.tab-panel[data-tab="members"] td:nth-child(3) { min-width: 130px; } /* 氏名 */
.tab-panel[data-tab="members"] th:nth-child(4),
.tab-panel[data-tab="members"] td:nth-child(4) { min-width: 65px; } /* 内線 */
.tab-panel[data-tab="members"] th:nth-child(5),
.tab-panel[data-tab="members"] td:nth-child(5) { min-width: 120px; } /* 携帯 */
.tab-panel[data-tab="members"] th:nth-child(6),
.tab-panel[data-tab="members"] td:nth-child(6) { min-width: 160px; } /* Email */
.tab-panel[data-tab="members"] th:nth-child(7),
.tab-panel[data-tab="members"] td:nth-child(7) { min-width: 95px; text-align: center; } /* 操作 */

.tab-panel[data-tab="members"] th,
.tab-panel[data-tab="members"] td {
  padding: 8px 6px !important;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

header #statusFilter,
header .status-filter {
  display: none;
  width: clamp(170px, 22vw, 240px) !important;
  min-width: 170px;
  flex: 0 0 auto;
}

/* 枠 */
.wrap {
  width: 100%;
  margin: 0 auto;
}

.board {
  display: grid;
  gap: var(--gap);
  grid-template-columns: repeat(var(--cols, auto-fit), minmax(min(100%, var(--board-width, 760px)), 1fr));
}

.board[data-cols="1"] .panel {
  background-color: transparent;
  border: none;
  box-shadow: none;
  width: calc(100% + 22px); /* body margin 16px*2 を相殺し、左右5pxずつ余白を確保 */
  margin-left: -11px;
  margin-right: -11px;
  max-width: none !important;
  border-radius: 0; /* 端まで広げる場合は角丸を消す */
}

#board.force-cards {
  grid-template-columns: 1fr;
}

.panel {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  padding: 8px;
  overflow: auto;
  scroll-margin-top: calc(var(--header-height) + 12px);
}

table {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
}

/* 郢昜ｻ｣繝ｭ郢晢ｽｫ陷繝ｦ郢晢ｽｼ郢晄じﾎ・ 陋ｻ諤懶ｽｹ窶ｲ雎域ｯ費ｽｾ迢暦ｽｸ・ｮ陝・ｸ奇ｼ・ｹｧ蠕娯・邵ｺ・育ｸｺ min-width 郢ｧ螳夲ｽｨ・ｭ陞ｳ螢ｹ竄ｬ
   郢昜ｻ｣繝ｭ郢晢ｽｫ陝ｷ窶ｲ闕ｳ蟠趣ｽｶ・ｳ邵ｺ蜷ｶ・玖撻・ｴ陷ｷ蛹ｻ .panel 邵ｺ・ｮ overflow:auto 邵ｺ・ｧ隶難ｽｪ郢ｧ・ｹ郢ｧ・ｯ郢晢ｽｭ郢晢ｽｼ郢晢ｽｫ */
.panel table {
  min-width: var(--table-min-width)
}

thead th {
  position: sticky;
  top: 0;
  background: #f2efe9;
  font-weight: 700
}

th,
td {
  box-sizing: border-box;
  border: 1px solid var(--line);
  padding: 6px;
  font-size: 14px
}

th {
  text-align: left
}

/* th.ext, td.ext 縺ｮ display: none 縺ｯ Phase 3 縺ｧ蟒・ｭ｢ */
/* .ext { } 縺ｯ Phase 3 縺ｧ蟒・ｭ｢繝ｻ蜍慕噪蛻ｶ蠕｡縺ｸ遘ｻ陦・(蜀・ｷ壹き繝ｩ繝陦ｨ遉ｺ逕ｨ) */
.ext {
  /* Dynamic control: js/layout.js & js/constants/column-definitions.js */
  color: var(--color-text-muted);
}

/* === 繧ｫ繝ｩ繝繝・ヵ繧ｩ繝ｫ繝亥ｹ・=== */
/* SSOT 繝槭せ繧ｿ繝ｼ: js/constants/column-definitions.js 縺ｮ defaultWidth */
/* JS 縺ｮ columnWidths 險ｭ螳壹↓繧医ｊJS蜀・〒蜷・そ繝ｫ縺ｮ min-width/max-width縲∫峩蟷・′謖・ｮ壹＆繧後ｋ縺溘ａ縲，SS縺九ｉ縺ｮ蝗ｺ螳壼ｹ・・荳頑嶌縺阪・蟒・ｭ｢縺励∪縺励◆ */

/* === 郢ｧ・ｫ郢晢ｽｼ郢晁歓・｡・ｨ驕会ｽｺ・ｽ・ｽ1陋ｻ證ｦ・ｼ逕ｻ蜃ｾ邵ｺ・ｮ陟托ｽｷ陋ｻ・ｶ郢晢ｽｪ郢ｧ・ｻ郢晢ｿｽ繝ｨ === */
/* 郢昜ｻ｣繝ｭ郢晢ｽｫ髯ｦ・ｨ驕会ｽｺ騾包ｽｨ邵ｺ・ｮ !important 陜暦ｽｺ陞ｳ螢ｼ・ｹ・ｽ・帝囓・｣鬮ｯ・､邵ｺ蜉ｱﾂ・嗟exbox郢晢ｽｬ郢ｧ・､郢ｧ・｢郢ｧ・ｦ郢晏現・定包ｽｩ陷茨ｿｽ */
#board.force-cards th,
#board.force-cards td,
#board.force-cards col {
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
}

@media (max-width: 720px) {
  #board th,
  #board td,
  #board col {
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
  }
}


/* 雎御ｸ樣倹郢晢ｽｻ陋ｯ蜻ｵﾂ・ｽ・ｽ邵ｺ・ｮ陝ｷ・ｽ螳幃ｏ・ｽ・ｼ莠･・､螢ｼ・ｽ郢昜ｻ｣繝ｭ郢晢ｽｫ髯ｦ・ｨ驕会ｽｺ邵ｺ・ｮ髯ｬ諛ｷ・ｮ魃会ｽｼ・ｽ */
th.name {
  min-width: var(--w-name);
  max-width: var(--w-name-max);
}


td.note,
th.note {
  min-width: var(--w-note-min)
}

select,
input[type="text"],
input[type="search"] {
  width: 100%;
  box-sizing: border-box;
  padding: .3rem .35rem;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: #fff;
  font-size: 14px;
  -webkit-appearance: auto;
  appearance: auto;
}

td.status select {
  padding-right: 2.6em
}

td.time select {
  text-align-last: center;
  font-variant-numeric: tabular-nums
}

td.work input {
  font-variant-numeric: tabular-nums;
  letter-spacing: .02em;
  text-align: center;
}

.candidate-input {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
}

.candidate-input input {
  flex: 1 1 auto;
  min-width: 0;
}

.candidate-btn {
  flex: 0 0 auto;
  width: 20px;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 10px;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, transform 0.15s;
}

.candidate-btn:hover {
  color: #374151;
}

.candidate-btn[aria-expanded="true"] {
  transform: rotate(180deg);
}

.candidate-btn:focus-visible {
  outline: 2px solid #4a90e2;
  outline-offset: 1px;
}

.candidate-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 10;
  min-width: 180px;
  max-height: 220px;
  overflow: auto;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  padding: 6px;
  display: none;
}

.candidate-panel.show {
  display: block;
}

.candidate-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.candidate-list li+li {
  margin-top: 4px;
}

.candidate-option {
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #f8f8f8;
  cursor: pointer;
}

.candidate-option:hover,
.candidate-option:focus-visible {
  background: #e8f1ff;
  outline: none;
  border-color: #4a90e2;
}

.contact-overlay {
  position: fixed;
  inset: 0;
  z-index: 1900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, .45);
}

.contact-dialog {
  position: relative;
  width: min(420px, 94vw);
  max-width: 560px;
  border-radius: 14px;
  background: #fff;
  padding: 18px 16px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
  border: 1px solid #e5e7eb;
}

.contact-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.contact-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.contact-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
}

.contact-label {
  font-weight: 700;
  color: #374151;
  min-width: 56px;
}

.contact-link {
  flex: 1;
  text-align: right;
  color: #2563eb;
  font-weight: 700;
  word-break: break-word;
  line-break: anywhere;
  overflow-wrap: anywhere;
  text-decoration: none;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 10px;
  border-radius: 10px;
  background: #e0edff;
}

.contact-link:hover,
.contact-link:focus-visible {
  text-decoration: underline;
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.contact-empty {
  flex: 1;
  text-align: right;
  color: #6b7280;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 10px;
}

.contact-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  color: #374151;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

.contact-close:hover {
  background: #f3f4f6;
}

.contact-close:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

/* 郢ｧ・ｹ郢晢ｿｽ・ｽ郢ｧ・ｿ郢ｧ・ｹ陋ｻ・･邵ｺ・ｮ髯ｦ迹夂横・ｽ莠･諠陝ｶ・ｭ邵ｺ・ｯ郢晢ｿｽ繝ｵ郢ｧ・ｩ郢晢ｽｫ郢晁肩・ｼ・ｽ */
#board tbody tr {
  transition: background-color .15s ease;
}

#board tbody tr.st-here {
  background: transparent;
}

#board tbody tr.st-out {
  background: #fff7ed;
  box-shadow: inset 4px 0 0 #f59e0b;
}

#board tbody tr.st-meeting {
  background: #eff6ff;
  box-shadow: inset 4px 0 0 #3b82f6;
}

#board tbody tr.st-remote {
  background: #f5f3ff;
  box-shadow: inset 4px 0 0 #8b5cf6;
}

#board tbody tr.st-trip {
  background: #ecfdf5;
  box-shadow: inset 4px 0 0 #10b981;
}

#board tbody tr.st-training {
  background: #fefce8;
  box-shadow: inset 4px 0 0 #eab308;
}

#board tbody tr.st-health {
  background: #f0f9ff;
  box-shadow: inset 4px 0 0 #06b6d4;
}

#board tbody tr.st-coadoc {
  background: #fdf2f8;
  box-shadow: inset 4px 0 0 #db2777;
}

#board tbody tr.st-home {
  background: #f3f4f6;
  box-shadow: inset 4px 0 0 #6b7280;
}

#board tbody tr.st-off {
  background: #fef2f2;
  box-shadow: inset 4px 0 0 #ef4444;
  color: #374151;
}

#board tbody tr.st-off input,
#board tbody tr.st-off select {
  color: #374151;
}

/* 隰鯉ｽｻ郢ｧ鬆大・鬮｢轣倩怏蟶呵将・莠･・､髢/闔ｨ螟奇ｽｭ・ｰ */
td.time {
  position: relative;
}

td.time.time-disabled select {
  pointer-events: none;
  opacity: 0.45;
}

td.time.need-time select {
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, .25);
  animation: pulseRing 1.2s ease-in-out infinite;
}

/* 闖ｫ・ｮ雎・ｽ｣: 郢ｧ・ｿ郢昴Γ/鬩包ｽｸ隰壽ｨ頑｡・抄諛会ｽｸ・ｭ蛹ｻ繝ｵ郢ｧ・ｩ郢晢ｽｼ郢ｧ・ｫ郢ｧ・ｹ隴弱ｑ・ｼ蟲ｨ郢ｧ・｢郢昜ｹ斟鍋ｹ晢ｽｼ郢ｧ・ｷ郢晢ｽｧ郢晢ｽｳ郢ｧ蜻茨ｽｭ・｢郢ｧ竏夲ｽ・*/
td.time.need-time select:focus {
  animation: none;
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, .25);
}

/* 闖ｫ・ｮ雎・ｽ｣: 郢ｧ・ｿ郢昴Γ/鬩包ｽｸ隰壽ｨ頑｡・抄諛会ｽｸ・ｭ蛹ｻ繝ｵ郢ｧ・ｩ郢晢ｽｼ郢ｧ・ｫ郢ｧ・ｹ隴弱ｑ・ｼ蟲ｨ郢晏・ﾎｦ郢晏沺譫夊氛蜉ｱ・定ｱｸ蛹ｻ笘・*/
td.time.need-time select:focus~.time-hint {
  display: none;
}

.time-hint {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: #b91c1c;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}

 /* --- Authentication UI (Unified) --- */
.u-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.u-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

#login input {
  width: 100%;
  box-sizing: border-box;
}

/* Auth Area Visibility */
.u-hidden {
  display: none !important;
}

.login-msg {
  margin-top: 12px;
  font-size: 0.85em;
  min-height: 1.2em;
}

/* Safari User Select Fixes */
[style*="user-select: none"] {
  -webkit-user-select: none;
}

.card-header, .btn, .tab-btn {
  -webkit-user-select: none;
  user-select: none;
}

.qr-image-container {
  display: flex;
  justify-content: center;
  align-items: center;
  background: white;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  margin-bottom: 16px;
}

@keyframes pulseRing {
  0% {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, .25);
  }

  70% {
    box-shadow: 0 0 0 6px rgba(239, 68, 68, .06);
  }

  100% {
    box-shadow: 0 0 0 3px rgba(239, 68, 68, .25);
  }
}

/* === 繧ｫ繝ｼ繝芽｡ｨ遉ｺ・・蛻励・繝｢繝舌う繝ｫ・峨・螳夂ｾｩ === */
/* 繝｡繝・ぅ繧｢繧ｯ繧ｨ繝ｪ縲√∪縺溘・JS縺ｫ繧医ｋ蠑ｷ蛻ｶ繧ｯ繝ｩ繧ｹ (.force-cards / [data-cols="1"]) 縺ｧ逋ｺ蜍・*/
@media (max-width: 720px) {
  #board {
    display: block;
  }
  #board colgroup,
  #board thead {
    display: none;
  }
  #board table {
    table-layout: auto;
    min-width: unset;
  }
  #board tbody {
    display: block;
  }
  #board tbody tr {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px;
    margin: 10px 0;
  }
  #board tbody td {
    border: none;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 48%;
    min-width: 140px;
    background: transparent;
  }

  #board tbody td::before {
    content: attr(data-label) !important;
    font-weight: 600;
    color: #6B7280;
    min-width: 6em;
    flex: 0 0 auto;
  }

  tbody td.name {
    flex: 1 1 100%;
    font-weight: 800;
    font-size: 15px;
    line-height: 1.2;
    padding-bottom: 2px;
    user-select: none;
    -webkit-touch-callout: none;
  }

  tbody td.name::before {
    content: "";
    display: none;
  }

  tbody td.work {
    flex: 1 1 100%;
  }

  /* 陷€・ｽ・ｷ螢ｹ・ｽ郢ｧ・ｫ郢晢ｽｼ郢晁歓・｡・ｨ驕会ｽｺ邵ｺ・ｧ邵ｺ・ｯ鬮ｱ讚・ｽ｡・ｨ驕会ｽｺ・ｽ逎ｯﾂ€・｣驍ｨ・｡陷亥現・ｽ郢晢ｿｽ・ｽ郢ｧ・｢郢晢ｿｽ・ｽ邵ｺ・ｸ驕假ｽｻ陷榊桁・ｼ・ｽ */
  tbody td.ext {
    display: none !important;
  }

  tbody td.status {
    flex: 1 1 100%;
  }

  tbody td.time {
    flex: 1 1 100%;
  }

  tbody td.tomorrow-plan {
    flex: 1 1 100%;
  }

  tbody td.note {
    flex: 1 1 100%;
  }
}

/* === JSによる強制適用時も同じスタイルを適用（メディアクエリ外でも有効に） === */
#board.force-cards {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
#board.force-cards colgroup,
#board.force-cards thead {
  display: none;
}
#board.force-cards table {
  table-layout: auto !important;
  min-width: unset !important;
}
#board.force-cards tbody {
  display: block;
}
#board.force-cards tbody tr {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px 12px !important;
  border: 1px solid var(--line) !important;
  border-radius: 10px !important;
  padding: 10px !important;
  margin: 10px 0 !important;
  background: #fff !important;
}
#board.force-cards tbody td {
  border: none !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex: 1 1 48% !important;
  min-width: 140px !important;
  background: transparent !important;
}
#board.force-cards tbody td::before {
  content: attr(data-label) !important;
  font-weight: 600;
  color: #6B7280;
  min-width: 6em;
  flex: 0 0 auto;
}
#board.force-cards tbody td.name {
  flex: 1 1 100% !important;
  font-weight: 800 !important;
  font-size: 15px !important;
}
#board.force-cards tbody td.name::before {
  content: "" !important;
  display: none !important;
}
#board.force-cards tbody td.work {
  flex: 1 1 100% !important;
}
#board.force-cards tbody td.status {
  flex: 1 1 100% !important;
}
#board.force-cards tbody td.time {
  flex: 1 1 100% !important;
}
#board.force-cards tbody td.tomorrow-plan {
  flex: 1 1 100% !important;
}
#board.force-cards tbody td.note {
  flex: 1 1 100% !important;
}
#board.force-cards tbody td.ext {
  display: none !important;
}

/* 1列表示時の補助スタイル */
#board.force-cards td>label.sr-only {
  display: none !important;
}

.sr-only {
  position: absolute !important;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* === ログイン画面 (Login Screen) === */
.login {
  display: flex !important; /* u-hidden が消えた後に有効になる */
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 85vh;
  padding: 20px;
}

#loginForm.card {
  width: 100%;
  max-width: 420px;
  background: var(--color-white);
  padding: 32px;
  border-radius: 16px;
  border: 1px solid var(--color-gray-200);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

#loginForm h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: var(--color-gray-900);
  text-align: center;
}

#loginForm p {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--color-gray-600);
  text-align: center;
}

#loginForm select#officeSel,
#loginForm input#pw {
  width: 100%;
  margin: 0;
}

#loginForm button#btnLogin,
#loginForm button#btnSimpleLogin {
  width: auto;
  min-width: 160px;
  margin: 8px auto 0;
  padding: 10px 24px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: var(--color-blue-600);
  border: none;
  border-radius: 8px; /* Corrected to rounded rectangle style as requested */
  cursor: pointer;
  transition: all 0.2s;
  display: block;
}

#loginForm button#btnLogin:hover,
#loginForm button#btnSimpleLogin:hover {
  background: var(--color-blue-700);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.login-msg {
  min-height: 20px;
  text-align: center;
  font-size: 13px;
  color: var(--color-red-600);
  margin-top: 8px;
}

.admin-modal {
  position: fixed;
  inset: 0;
  z-index: 1850;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, .5);
  padding: 20px;
}

.admin-modal.show {
  display: flex;
}

.admin-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  height: 90vh; /* max-heightではなくheightを強制して内部スクロールを確実にする */
  width: min(1280px, 95vw);
  max-width: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr); /* 1frに明確な最小値0を与え、内容に引きずられて膨らまないようにする */
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  margin: auto; /* Center in viewport */
}

/* QR Modal specific adjustments */
.qr-modal-card {
  height: auto !important; /* Content-fit height */
  max-height: 85vh;
  width: 420px !important;
  max-width: 90vw;
}

.qr-modal-body {
  padding: 12px 24px 24px;
}

.admin-card-header {
  padding: 20px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
}

.admin-card-body {
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 子要素側でスクロールさせるため、外側は隠す */
  min-height: 0;
  padding: 0; /* タブ側でパディングを管理する（フルブリード対応のため） */
  background: var(--color-gray-50);
}

/* tab-panel の定義は後方の統合ブロック（1326行付近）に一本化済み */

/* カラム構成アイテム (Image 1) の視認性向上 */
.unified-column-item,
.column-order-item {
  background: #ffffff !important;
  border: 2px solid #cbd5e1 !important; /* 境界線を太く */
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px !important;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.unified-column-item:nth-child(even) {
  background: #f8fafc !important; /* 1行おきに色を変える */
}

.unified-column-item:hover {
  border-color: var(--color-blue-400) !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.column-setting-item {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.column-setting-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  border-color: var(--color-blue-300);
}

.column-setting-header {
  border-bottom: 2px solid var(--color-gray-100);
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.notice-modal-card {
  width: min(720px, 95vw);
  max-width: 95vw;
}

.notice-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.notice-modal-body {
  max-height: 60vh;
  overflow: auto;
  line-height: 1.6;
  color: #0f172a;
  font-size: 14px;
}

.notice-modal-content {
  white-space: pre-wrap;
}

.tools-modal-card {
  width: min(840px, 95vw);
  max-width: 95vw;
  padding: 16px;
}

.tools-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.tools-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 70vh;
  overflow: auto;
}

.tools-item {
  padding: 10px 0;
}

.tools-item+.tools-item {
  border-top: 1px solid #e5e7eb;
}

.tools-item-title {
  font-weight: 700;
  font-size: 15px;
  color: #0f172a;
}

.tools-item-title a {
  color: inherit;
  text-decoration: none;
}

.tools-item-title a:hover {
  text-decoration: underline;
}

.tools-item-note {
  margin-top: 6px;
  color: #374151;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.tools-empty {
  padding: 12px;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #475569;
  background: #f8fafc;
}

.tab-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.tab-btn {
  padding: .35rem .9rem;
  border: 1px solid var(--line);
  border-radius: 999px; /* 丸型に統一 */
  background: #f3f4f6;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: #e7f8e7;
  border-color: #b7e6b7;
}

.btn-group-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #eef2ff;
  color: #4338ca;
  border: 1px solid #c7d2fe;
  padding: .35rem .9rem;
  border-radius: 999px; /* 丸型に統一 */
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-group-add:hover {
  background: #e0e7ff;
  border-color: #a5b4fc;
}

/* Generic Pill Button */
.btn-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--btn-pill-padding);
  border-radius: var(--btn-pill-radius);
  border: 1px solid var(--color-gray-300);
  background: var(--color-white);
  color: var(--color-gray-700);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.btn-pill:hover {
  background: var(--color-gray-50);
  border-color: var(--color-gray-400);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.btn-pill:active {
  transform: translateY(0);
}

/* File Input Refinement */
.u-hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.btn-file-label {
  display: inline-block;
  margin-bottom: 4px;
}

.btn-close-capsule {
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}

.tab-panel {
  display: none;
  padding-bottom: 100px;
}



.admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  align-items: start;
}

.admin-box-stacked {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-subsection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}

.admin-subsection h5 {
  margin: 0;
  font-size: 14px;
  color: #374151;
}

.admin-divider {
  height: 1px;
  background: #e5e7eb;
  margin: 4px 0;
}

.admin-box {
  margin: 0;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  flex-shrink: 0; /* フレックスボックス内で縮小して不当に収まるのを防ぎ、スクロールを誘発する */
}

.admin-box-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.admin-box-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-left: 8px;
}

.admin-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 8px;
}

.admin-note {
  font-size: 12px;
  color: #6B7280;
  margin-top: 4px;
}

.tab-panel {
  display: none;
  padding: 24px; /* 基本のパディングをタブパネル側に持たせる */
  box-sizing: border-box;
}

.tab-panel.active {
  display: flex;
  flex-direction: column;
  flex: 1; /* height: 100% よりフレックスボックス内での挙動が安定する */
  min-height: 0;
  overflow-y: auto; /* 基本はパネル自体をスクロールさせる */
}

/* 一覧系タブはパディングを個別に調整（フルブリード対応） */
.tab-panel[data-tab="members"],
.tab-panel[data-tab="columns"],
.tab-panel[data-tab="notices"] {
  padding: 0;
}

/* 内部スクロールを行うタブはパネル自体のスクロールを抑制 */
.tab-panel[data-tab="members"].active,
.tab-panel[data-tab="columns"].active,
.tab-panel[data-tab="notices"].active {
  overflow-y: hidden;
}

/* 共通ツールバー（タイトル＋ボタンを1行に集約） */
.admin-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--color-primary-50);
  margin-bottom: 16px;
  flex: 0 0 auto;
}
.admin-toolbar h4 {
  margin: 0;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-gray-800);
}
.admin-toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}
.admin-toolbar-info {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-left: 8px;
}

/* カラム構成タブ: 縦スクロール + スペース効率化 */
.tab-panel[data-tab="columns"] {
  padding-bottom: 0;
}
/* .columns-panel ラッパーはこのタブでは不等値なので直接 container を拡張 */
.tab-panel[data-tab="columns"] .column-setting-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  min-height: 0;
}
.tab-panel[data-tab="columns"] .admin-subsection {
  padding: 8px;
  gap: 6px;
}
.tab-panel[data-tab="columns"] .admin-subsection h5 {
  font-size: 13px;
}

/* 髢ｾ・ｪ陷榊｢難ｽｶ莠･謔蛾坎・ｭ陞ｳ・ｽ UI */
.auto-clear-setting-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.auto-clear-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 600;
}

.auto-clear-hour-select {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
  background: #fff;
  width: auto !important;
}

.auto-clear-fields-container {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  background: #f9fafb;
  padding: 12px;
  border-radius: 8px;
  border: 1px dashed #d1d5db;
}

.group-order-item:hover .group-order-label,
.editable-cell:hover {
  background-color: #f0f7ff;
  border-radius: 4px;
}

.group-edit-input,
.member-inline-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  border: 2px solid #3b82f6;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.numeric-cell.editable-cell .member-inline-input {
  text-align: center;
}

/* メンバーEmail専用の微調整 */
.member-email {
  font-family: var(--font-mono);
  font-size: 13px;
  word-break: break-all;
}

.auto-clear-field-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.auto-clear-field-item input {
  width: 16px;
  height: 16px;
}

.member-save-bar {
  display: flex;
  justify-content: flex-end;
  padding: 10px 0;
  margin-bottom: 16px;
  border-bottom: 1px solid #e5e7eb;
}
/* 元のsticky/fixed設定を解除 */

/* .member-table 関連の重複定義を削除・統合しました（上部 210-239行目付近に集約） */

/* --- 鬯・ｿｽ蛻・崕蜉ｱ・ｽ郢ｧ・ｹ郢ｧ・ｿ郢ｧ・､郢晢ｽｫ --- */
.member-order-cell {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  /* 陝ｾ・ｦ陝・ｿｽ笳・*/
  gap: 8px;
  white-space: nowrap;
  font-family: monospace;
  /* 隰ｨ・ｰ陝・干・ｽ陝ｷ・ｽ・定ｬ・ｽ竏ｴ郢ｧ・ｽ */
}

.member-order-num {
  font-weight: bold;
  color: #555;
}

.member-move-actions {
  display: flex;
  gap: 2px;
}

/* メンバー管理タブ等の無効化ボタン（共通化により移行済み、互換性のために一部保持） */
.member-order-cell .btn-move-up:disabled,
.member-order-cell .btn-move-down:disabled {
  opacity: 0.4;
}

.groups-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.groups-panel .admin-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

#groupOrderList.group-order-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding-right: 4px;
}

#groupOrderList .group-order-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.groups-panel .admin-box {
  margin-bottom: 0;
}

.group-add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.group-add-row input {
  flex: 1;
}

/* === ツール管理 (Tools Manager) === */
.tools-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tools-manager-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end; /* 右寄せ */
  gap: 12px;
  padding-bottom: 12px;
  flex: 0 0 auto;
}

.tools-manager-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-right: 4px;
}

.tools-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tool-edit-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--color-gray-200);
  border-radius: 12px;
  background: var(--color-white);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  position: relative;
}

.tool-edit-item.hidden-tool {
  opacity: 0.6;
  background: var(--color-gray-50);
}

.tool-edit-handle {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  cursor: grab;
  color: var(--color-gray-400);
  font-size: 18px;
  user-select: none;
  padding: 8px 4px;
}

.tool-edit-item:hover {
  border-color: var(--color-blue-300);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.tool-edit-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-left: 20px; /* ハンドル分 */
}

.tool-edit-title {
  flex: 1;
  font-weight: 700;
}

.tool-edit-url {
  flex: 2;
}

.tool-edit-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.tool-display-toggle {
  margin-right: 4px;
}

.tool-edit-note {
  margin-left: 20px;
  width: calc(100% - 20px);
  min-height: 60px;
  resize: vertical;
}

/* レスポンシブ対応 */
@media (max-width: 720px) {
  .tool-edit-row {
    flex-direction: column;
    align-items: stretch;
  }
  .tool-edit-controls {
    justify-content: flex-end;
  }
}


#groupOrderList .group-order-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

#groupOrderList .group-order-label {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: #1e293b;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

#groupOrderList .group-order-label:hover {
  background-color: #f1f5f9;
}

/* 編集中のラベル（input） */
#groupOrderList .group-edit-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  font-weight: 600;
  color: #1e293b;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  outline: none;
}

#groupOrderList .group-order-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* 追加行のスタイル */
.group-add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}

.group-add-row input {
  flex: 1;
  border-radius: 8px;
}

.group-order-item .btn-group-del {
  margin-left: 4px;
  color: #94a3b8;
  background: transparent;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-order-item .btn-group-del:hover {
  color: #ef4444;
  background-color: #fef2f2;
}

/* --- 繧ｫ繝ｩ繝鬆・ｺ上・蟷・ｨｭ螳啅I --- */
.column-order-section {
  margin-top: 12px;
}

.column-order-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.column-order-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  flex-wrap: wrap;
}

.column-order-num {
  font-weight: bold;
  font-family: monospace;
  color: #555;
  min-width: 1.5em;
  text-align: center;
}

.column-order-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.column-order-label {
  font-weight: 600;
  color: #1f2937;
  min-width: 80px;
}

.column-order-badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #6366f1;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 4px;
  padding: 1px 6px;
  vertical-align: middle;
}

.column-width-group {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}

.column-width-label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}

.column-width-sep {
  font-size: 12px;
  color: #9ca3af;
  margin: 0 2px;
}

.column-width-unit {
  font-size: 12px;
  color: #9ca3af;
}

.column-width-input {
  width: 64px;
  padding: 4px 6px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
}

.column-width-input:focus {
  outline: none;
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.column-order-item-unified {
  justify-content: flex-start;
  gap: 16px;
}

.column-move-grp {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 180px;
}

.column-toggle-grp {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1 1 auto;
}

.column-toggle-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
  color: #374151;
}

.column-toggle-label input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 600px) {
  .columns-toolbar {
    flex-wrap: wrap;
  }

  .column-order-item {
    gap: 8px;
    padding: 10px;
    flex-direction: column;
    align-items: stretch;
  }
  
  .column-move-grp, .column-toggle-grp, .column-width-group {
    width: 100%;
    justify-content: flex-start;
  }
  .column-width-group {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px dashed #e5e7eb;
  }


  .column-width-input {
    width: 56px;
  }
}

.member-filter-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 6px 0 4px;
  flex-wrap: wrap;
}

.member-filter-label {
  font-weight: 700;
  color: #374151;
  min-width: 92px;
  display: flex;
  align-items: center;
}

.member-filter-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.member-filter-controls input {
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  min-width: 220px;
  max-width: 340px;
  flex: 1;
}

.member-inline-form {
  margin: 10px 0;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}

.member-edit-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-edit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.member-edit-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-weight: 600;
  color: #374151;
}

.member-edit-grid input {
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
}

.member-edit-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.member-edit-actions-left {
  color: #4b5563;
  font-size: 13px;
}

.member-edit-actions-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.member-edit-mode {
  font-weight: 700;
}

.member-table .numeric-cell {
  white-space: nowrap;
}

/* --- 闔会ｽ･闕ｳ荵敖竏晢ｿｽ陝ｷ・ｽ・ｽ闖ｫ・ｮ雎・ｽ｣ --- */

/* 1陋ｻ遉ｼ蟯ｼ: 鬯・ｿｽ蛻・(150px 陜暦ｽｺ陞ｳ・ｽ) */
.member-table th:nth-child(1),
.member-table td:nth-child(1) {
  width: 150px;
  white-space: nowrap;
  text-align: center;
}

/* 2陋ｻ遉ｼ蟯ｼ: 郢ｧ・ｰ郢晢ｽｫ郢晢ｽｼ郢晢ｿｽ (隴崢闖ｴ・ｽ 400px - 陷ｿ・ｯ陞滂ｿｽ) */
.member-table th:nth-child(2),
.member-table td:nth-child(2) {
  width: 400px;
}

/* 3陋ｻ遉ｼ蟯ｼ: 雎御ｸ樣倹 (隴崢闖ｴ・ｽ 240px - 陷ｿ・ｯ陞滂ｿｽ) */
.member-table th:nth-child(3),
.member-table td:nth-child(3) {
  width: 240px;
}

/* 4陋ｻ遉ｼ蟯ｼ: 陷・ｽ・ｷ・ｽ (80px 陜暦ｽｺ陞ｳ・ｽ) */
.member-table th:nth-child(4),
.member-table td:nth-child(4) {
  width: 80px;
}

/* 5陋ｻ遉ｼ蟯ｼ: 隰ｳ・ｺ陝ｶ・ｯ (180px 陜暦ｽｺ陞ｳ・ｽ) */
.member-table th:nth-child(5),
.member-table td:nth-child(5) {
  width: 180px;
}

/* 6陋ｻ遉ｼ蟯ｼ: Email (隴崢闖ｴ・ｽ 350px - 陷ｿ・ｯ陞滂ｿｽ) */
.member-table th:nth-child(6),
.member-table td:nth-child(6) {
  width: 350px;
}

/* 7陋ｻ遉ｼ蟯ｼ: 隰ｫ蝣ｺ・ｽ・ｽ (180px 陜暦ｽｺ陞ｳ・ｽ) */
.member-table th:nth-child(7),
.member-table td:nth-child(7) {
  width: 180px;
  text-align: center;
}

.member-email {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.35;
}

.member-email .email-domain {
  color: #4b5563;
  font-size: 12px;
  word-break: break-all;
}

.required {
  color: #b91c1c;
  font-weight: 700;
}

.vacation-grid {
  display: grid;
  grid-template-columns: minmax(420px, 1.1fr) minmax(340px, 0.9fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 1023px) {
  .vacation-grid {
    grid-template-columns: 1fr;
  }
}

.vacation-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vacation-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.vacation-row-two-cols {
  flex-direction: row;
  gap: 12px;
  flex-wrap: wrap;
}

.vacation-row-two-cols label {
  flex: 1;
  min-width: 180px;
}

.vacation-row label {
  font-weight: 600;
  color: #374151;
  gap: 4px;
  display: flex;
  flex-direction: column;
}

.vacation-row input,
.vacation-row textarea,
.vacation-row select {
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}

.vacation-row textarea {
  resize: vertical;
}

.vacation-row-inline {
  flex-direction: row;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.vacation-row-inline label {
  flex: 1;
  min-width: 260px;
}

.vacation-inline-actions {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.vacation-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin: 4px 0 8px;
}

.vacation-table-wrap {
  overflow: auto;
  max-height: 340px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.vacation-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.vacation-table th,
.vacation-table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 8px;
  text-align: left;
  vertical-align: top;
}

.vacation-table th {
  background: #f9fafb;
  color: #374151;
  position: sticky;
  top: 0;
  z-index: 1;
}

.vacation-table tr:last-child td {
  border-bottom: none;
}

.vacation-drag-cell {
  width: 44px;
  text-align: center;
}

.vacation-drag-handle {
  cursor: grab;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #6b7280;
  font-size: 14px;
}

.vacation-drag-handle:active {
  cursor: grabbing;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
}

.vacation-dragging {
  opacity: 0.72;
}

.vacation-gantt-sticky-header {
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 30;
  padding-bottom: 4px;
  border-bottom: 2px solid #e5e7eb;
  margin-bottom: 4px;
}

.vacation-gantt {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
  background: #f8fafc;
  overflow: auto;
  max-height: 60vh;
}

.vacation-gantt table {
  border-collapse: collapse;
  min-width: 480px;
  width: 100%;
  font-size: 12px;
}

.vacation-gantt .vac-save-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: #334155;
}

.vacation-gantt .vac-save-status[data-state="error"] {
  color: #b91c1c;
}

.vacation-gantt .vac-save-status[data-state="saved"] {
  color: #16a34a;
}

.vacation-gantt .vac-save-status button {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  background: #fff;
  cursor: pointer;
}

.vacation-gantt .vac-save-status button:hover {
  background: #f8fafc;
}

.vac-save-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #93c5fd;
  border-top-color: #0ea5e9;
  border-radius: 50%;
  animation: vac-save-spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes vac-save-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.vacation-gantt thead th {
  position: sticky;
  top: 0;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  z-index: 5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  vertical-align: middle;
  user-select: none;
}

.vacation-gantt thead tr.vac-month-row th {
  --vac-month-row-height: 34px;
  --vac-head-offset: 0px;
  top: 0;
  padding: 6px 4px;
}

.vacation-gantt thead tr.vac-day-row th {
  --vac-head-offset: var(--vac-month-row-height, 30px);
  top: var(--vac-head-offset);
  padding: 4px 3px;
}

.vacation-gantt th,
.vacation-gantt td {
  border: 1px solid #e5e7eb;
  padding: 4px;
  white-space: nowrap;
  text-align: center;
}

.vacation-gantt th {
  user-select: none;
}

.vacation-gantt th.group-name {
  background: #f3f4f6;
  position: sticky;
  left: 0;
  z-index: 10;
  min-width: 32px;
  width: 32px;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: 8px 4px;
  font-size: 11px;
  letter-spacing: 0.05em;
  border-right: 2px solid #d1d5db;
}

.vacation-gantt th.member-name {
  background: #fff;
  position: sticky;
  left: 32px;
  z-index: 10;
  text-align: left;
  font-weight: 600;
  /* 郢ｧ・ｬ郢晢ｽｳ郢晏現繝ｳ郢晢ｽ･郢晢ｽｼ陝・ｉ逡醍ｸｺ・ｮ雎御ｸ樣倹陋ｻ諤懶ｽｹ・ｽ・ｼ莠･・､螢ｼ・ｽ郢昜ｻ｣繝ｭ郢晢ｽｫ邵ｺ・ｮ --w-name 邵ｺ・ｨ邵ｺ・ｯ霑｢・ｬ驕ｶ蜈ｷ・ｼ・ｽ */
  width: 110px;
  min-width: 85px;
  max-width: 110px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-right: 2px solid #9ca3af;
  user-select: none;
}

.vacation-gantt th.member-name.member-has-bit {
  background: #dbeafe;
  font-weight: 700;
  color: #1e40af;
}

.vacation-gantt thead th.group-name {
  z-index: 20;
  background: #f3f4f6;
}

.vacation-gantt thead th.member-name {
  z-index: 20;
  background: #fff;
}

.vacation-gantt .vac-cell {
  cursor: pointer;
  min-width: 34px;
  transition: background 0.1s ease, color 0.1s ease, box-shadow 0.1s ease;
  user-select: none;
}

.vacation-gantt table.dragging .vac-cell {
  touch-action: none;
}

.vacation-gantt .vac-cell.weekend-sat {
  background: #e0f2fe;
}

.vacation-gantt .vac-cell.weekend-sun {
  background: #fee2e2;
}

.vacation-gantt .vac-cell.holiday {
  background: #ffe4e6;
  color: #b91c1c;
}

.vacation-gantt .vac-day-header {
  background: #fff;
}

.vacation-gantt .vac-day-header.weekend-sat {
  background: #e0f2fe;
}

.vacation-gantt .vac-day-header.weekend-sun {
  background: #fee2e2;
}

.vacation-gantt .vac-day-header.holiday {
  background: #ffe4e6;
  color: #b91c1c;
}

.vacation-gantt .vac-day-header.vac-color-none,
.vacation-gantt .vac-cell.vac-color-none,
.vac-color-option.vac-color-none {
  background: var(--color-white);
}

.vacation-gantt .vac-day-header.vac-color-sat,
.vacation-gantt .vac-cell.vac-color-sat,
.vac-color-option.vac-color-sat {
  background: var(--color-blue-100);
}

.vacation-gantt .vac-day-header.vac-color-sun,
.vacation-gantt .vac-cell.vac-color-sun,
.vac-color-option.vac-color-sun {
  background: var(--color-red-100);
}

.vacation-gantt .vac-day-header.vac-color-holiday,
.vacation-gantt .vac-cell.vac-color-holiday,
.vac-color-option.vac-color-holiday {
  background: var(--color-red-100);
  color: var(--color-red-600);
}

.vacation-gantt .vac-day-header.vac-color-amber,
.vacation-gantt .vac-cell.vac-color-amber,
.vac-color-option.vac-color-amber {
  background: var(--color-amber-100);
}

.vacation-gantt .vac-day-header.vac-color-mint,
.vacation-gantt .vac-cell.vac-color-mint,
.vac-color-option.vac-color-mint {
  background: var(--color-green-100);
}

.vacation-gantt .vac-day-header.vac-color-lavender,
.vacation-gantt .vac-cell.vac-color-lavender,
.vac-color-option.vac-color-lavender {
  background: var(--color-indigo-50);
}

.vacation-gantt .vac-day-header.vac-color-slate,
.vacation-gantt .vac-cell.vac-color-slate,
.vac-color-option.vac-color-slate {
  background: var(--color-gray-200);
}

.vacation-gantt .vac-cell.on {
  background: #0ea5e9;
  color: #fff;
  font-weight: 700;
}

.vacation-gantt .vac-cell.on.weekend-sat {
  background: #0284c7;
  color: #fff;
}

.vacation-gantt .vac-cell.on.weekend-sun,
.vacation-gantt .vac-cell.on.holiday {
  background: #e11d48;
  color: #fff;
}

.vac-color-palette {
  position: absolute;
  z-index: 1860;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.15);
  padding: 10px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: #0f172a;
}

.vac-color-palette__title {
  font-weight: 700;
  font-size: 12px;
  line-height: 1.2;
  color: #111827;
}

.vac-color-palette__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.vac-color-option {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.08s ease, box-shadow 0.08s ease, border-color 0.08s ease;
  min-width: 0;
}

.vac-color-option:hover {
  box-shadow: 0 6px 15px rgba(15, 23, 42, 0.12);
  border-color: #93c5fd;
  transform: translateY(-1px);
}

.vac-color-option__dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.45);
}

.vac-color-option__label {
  font-weight: 700;
  font-size: 11px;
  color: #111827;
  text-transform: capitalize;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media print {
  .vac-color-palette {
    display: none !important;
  }

  .vacation-gantt .vac-day-header.vac-color-none,
  .vacation-gantt .vac-cell.vac-color-none,
  .vac-color-option.vac-color-none {
    background: #fff !important;
    color: #0f172a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .vacation-gantt .vac-day-header.vac-color-sat,
  .vacation-gantt .vac-cell.vac-color-sat,
  .vac-color-option.vac-color-sat {
    background: #e0f2fe !important;
    color: #0f172a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .vacation-gantt .vac-day-header.vac-color-sun,
  .vacation-gantt .vac-cell.vac-color-sun,
  .vac-color-option.vac-color-sun {
    background: #fee2e2 !important;
    color: #0f172a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .vacation-gantt .vac-day-header.vac-color-holiday,
  .vacation-gantt .vac-cell.vac-color-holiday,
  .vac-color-option.vac-color-holiday {
    background: #ffe4e6 !important;
    color: #b91c1c !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .vacation-gantt .vac-day-header.vac-color-amber,
  .vacation-gantt .vac-cell.vac-color-amber,
  .vac-color-option.vac-color-amber {
    background: #fef3c7 !important;
    color: #0f172a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .vacation-gantt .vac-day-header.vac-color-mint,
  .vacation-gantt .vac-cell.vac-color-mint,
  .vac-color-option.vac-color-mint {
    background: #dcfce7 !important;
    color: #0f172a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .vacation-gantt .vac-day-header.vac-color-lavender,
  .vacation-gantt .vac-cell.vac-color-lavender,
  .vac-color-option.vac-color-lavender {
    background: #ede9fe !important;
    color: #0f172a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .vacation-gantt .vac-day-header.vac-color-slate,
  .vacation-gantt .vac-cell.vac-color-slate,
  .vac-color-option.vac-color-slate {
    background: #e5e7eb !important;
    color: #0f172a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}

.vacation-gantt tbody tr.group-last-row {
  border-bottom: 3px solid #6b7280;
}

.vacation-gantt tbody tr.group-last-row th.group-name {
  border-bottom: 3px solid #6b7280;
}

.vacation-gantt tbody tr.group-last-row th.member-name {
  border-bottom: 3px solid #6b7280;
}

.vacation-gantt tbody tr.group-last-row td {
  border-bottom: 3px solid #6b7280;
}

.vacation-gantt tbody tr:hover {
  background: #f0f9ff;
}

.vacation-gantt tbody tr:hover th.member-name {
  background: #dbeafe;
  color: #1e40af;
  font-weight: 700;
}

.vacation-gantt tbody tr:hover td {
  background: #e0f2fe;
}

.vacation-gantt thead th.hover-highlight,
.vacation-gantt td.hover-highlight {
  box-shadow: inset 0 0 0 2px #93c5fd;
}

.vacation-gantt td.hover-highlight:not(.vac-cell.on) {
  background: #dbeafe !important;
  color: #1e40af;
}

.vacation-gantt .vac-cell.on.hover-highlight {
  color: #fff;
  box-shadow: inset 0 0 0 2px #bfdbfe, inset 0 0 0 4px rgba(191, 219, 254, 0.55);
}

.vacation-gantt tbody tr .hover-highlight {
  font-weight: 700;
}

.vacation-gantt .vac-day-label {
  display: flex;
  flex-direction: column;
  gap: 1px;
  align-items: center;
  font-weight: 600;
  white-space: nowrap;
  justify-content: center;
  line-height: 1.1;
}

.vacation-gantt .vac-day-label .vac-date {
  font-size: 12px;
  font-weight: 700;
}

.vacation-gantt .vac-day-label .vac-day {
  font-size: 10px;
  color: #6b7280;
}

.vacation-gantt .vac-month-header {
  background: #f3f4f6;
  font-weight: 700;
  font-size: 12px;
  border-bottom: 2px solid #d1d5db;
}

.vacation-gantt .vac-month-header .vac-month-text {
  display: block;
  line-height: 1.2;
}

.vacation-gantt .vacation-gantt-help {
  margin: 4px 0;
  color: #6b7280;
  font-size: 12px;
}

.vacation-gantt .vacation-gantt-title {
  font-weight: 700;
  color: #0f172a;
  display: none;
}

.vacation-gantt-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 2px;
}

.vacation-gantt-touch-hint {
  font-size: 11px;
  color: #6b7280;
}

.event-color-manual-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 600;
}

.event-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

/* --- メンバー登録モーダル --- */
.admin-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2100;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.member-add-popup {
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  background: white;
  border-radius: 12px;
  position: relative;
  /* モーダル内の余白調整 */
  margin: 0;
  padding-bottom: 20px;
}

.btn-close-modal {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--color-text-muted);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.btn-close-modal:hover {
  background: var(--color-gray-100);
  color: var(--color-text-main);
}

/* 消去: 上記に統合 */

.auto-clear-field-item {
  margin: 0;
}

.event-modal-title {
  margin: 0;
}

.event-modal .admin-card {
  max-height: 92vh;
  width: min(1400px, 100%);
}

.event-modal .admin-card-body {
  padding: 24px;
}

.event-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.event-toolbar__hint {
  color: #6b7280;
  font-size: 12px;
  flex: 1;
  min-width: 200px;
}

.vacation-helper {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
}

.vacation-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vacation-group-jumps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin: 2px 0 4px;
}

.vacation-group-jumps .jump-label {
  font-weight: 700;
  color: #0f172a;
  font-size: 12px;
}

.vacation-group-jumps .jump-btn {
  padding: 4px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  color: #0f172a;
  transition: background .15s ease, border-color .15s ease, box-shadow .15s ease;
}

.vacation-group-jumps .jump-btn:hover {
  background: #e0f2fe;
  border-color: #93c5fd;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.vacation-group-jumps .jump-btn:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

.vacation-group-jumps .jump-select {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.vacation-group-jumps .jump-select select {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  min-width: 180px;
}

.vacation-group-jumps .jump-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.event-modal .vacation-table-wrap {
  max-height: unset;
}

.vacation-select-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
}

.event-select-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  flex-wrap: wrap;
}

.event-select-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
}

.event-select-dropdown {
  padding: 6px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 14px;
  min-width: 200px;
  max-width: 400px;
  flex: 1;
  background: #fff;
}

.btn-show-event-notice {
  padding: 6px 12px;
  font-size: 13px;
  white-space: nowrap;
}

.vacation-radio-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 340px;
  overflow-y: auto;
}

.vacation-radio-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.vacation-radio-item:hover {
  background: #f9fafb;
  border-color: #d1d5db;
}

.vacation-radio-item:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

.vacation-radio-item.selected {
  background: #eff6ff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, .55);
}

.vacation-radio-item.applied {
  background: #ecfdf3;
  border-color: #16a34a;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, .5);
}

.vacation-radio-item.selected::before,
.vacation-radio-item.applied::after {
  position: absolute;
  top: 8px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .01em;
  box-shadow: 0 2px 6px rgba(0, 0, 0, .08);
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity .18s ease, transform .18s ease;
  pointer-events: none;
}

.vacation-radio-item.selected::before {
  content: "隨ｨ・ｽ 鬩包ｽｸ隰壽ｨ費ｽｸ・ｭ";
  background: #dbeafe;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  opacity: 1;
  transform: translateY(0);
}

.vacation-radio-item.applied::after {
  content: "・ｽ譌ｩ 髯ｦ・ｨ驕会ｽｺ闕ｳ・ｭ";
  background: #dcfce7;
  border: 1px solid #86efac;
  color: #166534;
  opacity: 1;
  transform: translateY(0);
}

.vacation-radio-item.selected.applied::before {
  right: 108px;
}

.vacation-radio-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.vacation-radio-header {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}

.vacation-radio-title {
  font-weight: 600;
  color: #0f172a;
  font-size: 14px;
  text-decoration: none;
  flex: 1;
}

.vacation-radio-title:hover {
  text-decoration: underline;
}

.vacation-radio-period {
  color: #6b7280;
  font-size: 12px;
}

.vacation-radio-state {
  color: #475569;
  font-size: 11px;
  white-space: nowrap;
  font-weight: 600;
}

.vacation-radio-item.selected .vacation-radio-state {
  color: #1d4ed8;
}

.vacation-radio-item.applied .vacation-radio-state {
  color: #15803d;
  font-weight: 700;
}

.vacation-radio-actions {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-top: 4px;
  min-height: 32px;
}

.vacation-radio-actions .btn-open-notice {
  padding: 6px 12px;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 600;
}

.vacation-radio-actions .btn-open-notice:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.event-banner {
  display: none !important;
  max-width: 1200px;
  margin: 12px auto;
  padding: 12px 14px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  color: #92400e;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.event-banner__title {
  font-weight: 700;
  margin-bottom: 4px;
}

.event-banner__detail {
  font-size: 13px;
}

.event-banner__members {
  font-size: 13px;
  color: #b45309;
}

.event-highlight {
  background: #f8fafc !important;
  box-shadow: inset 4px 0 0 #94a3b8;
}

.event-color-amber {
  background: #fef9c3 !important;
  box-shadow: inset 4px 0 0 #f59e0b;
}

.event-color-blue {
  background: #e0f2fe !important;
  box-shadow: inset 4px 0 0 #3b82f6;
}

.event-color-green {
  background: #dcfce7 !important;
  box-shadow: inset 4px 0 0 #22c55e;
}

.event-color-pink {
  background: #fdf2f8 !important;
  box-shadow: inset 4px 0 0 #ec4899;
}

.event-color-purple {
  background: #f3e8ff !important;
  box-shadow: inset 4px 0 0 #a855f7;
}

.event-color-teal {
  background: #e0f7f5 !important;
  box-shadow: inset 4px 0 0 #14b8a6;
}

.event-color-gray {
  background: #f1f5f9 !important;
  box-shadow: inset 4px 0 0 #64748b;
}

.event-color-sunday {
  background: #fee2e2 !important;
  box-shadow: inset 4px 0 0 #ef4444;
}

.event-color-holiday {
  background: #ffe4e6 !important;
  box-shadow: inset 4px 0 0 #e11d48;
}

.event-color-slate {
  background: #e5e7eb !important;
  box-shadow: inset 4px 0 0 #475569;
}

.event-color-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #cbd5e1;
  border: 1px solid #cbd5e1;
}

.event-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 28px;
  margin: 8px 0;
}

.event-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  font-size: 12px;
}

.event-legend-text {
  color: #0f172a;
  font-weight: 600;
}

.event-legend-type {
  color: #475569;
  font-size: 11px;
}

.event-legend-empty {
  color: #94a3b8;
  font-size: 12px;
}

.event-legend-compact {
  margin: 4px 0;
}

.vacation-status-label {
  display: none;
  font-weight: 700;
  color: #92400e;
  padding: 4px 8px;
  background: #fef3c7;
  border: 1px solid #fbbf24;
  border-radius: 4px;
  text-align: center;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width:768px) {
  .admin-card {
    padding: 12px;
    width: min(1200px, 98vw);
    max-width: 98vw;
  }

  .vacation-view {
    gap: 8px;
  }
}

@media (max-width:705px) {
  .admin-card {
    padding: 10px;
    width: 100vw;
    max-width: 100vw;
    border-radius: 0;
    max-height: 100vh;
  }

  .vacation-gantt {
    max-height: 55vh;
  }

  .vacation-view {
    gap: 6px;
  }
}

@media (max-width:640px) {
  .vacation-gantt table {
    font-size: 10px;
  }

  .vacation-gantt .vac-cell {
    min-width: 26px;
    max-width: 26px;
    padding: 2px 1px;
    font-size: 9px;
  }

  .vacation-gantt {
    padding: 4px;
    max-height: 50vh;
  }

  .vacation-gantt thead tr.vac-month-row th {
    --vac-month-row-height: 30px;
    padding: 5px 3px;
  }

  .vacation-gantt thead tr.vac-day-row th {
    padding: 3px 2px;
  }

  .vacation-gantt th.group-name {
    min-width: 22px;
    width: 22px;
    font-size: 9px;
    padding: 4px 2px;
    letter-spacing: 0;
  }

  .vacation-gantt th.member-name {
    min-width: 55px;
    max-width: 70px;
    font-size: 10px;
    padding: 2px;
    left: 22px;
  }

  .vacation-gantt .vac-day-label {
    gap: 1px;
    flex-direction: column;
    font-size: 8px;
    line-height: 1.1;
  }

  .vacation-gantt .vac-day-label span {
    font-size: 8px;
    display: block;
    line-height: 1.1;
  }

  .vacation-gantt .vac-day-label .vac-day {
    font-size: 7px;
    display: block;
  }

  .vacation-gantt thead th {
    padding: 2px 1px;
    vertical-align: middle;
    height: auto;
    min-width: 26px;
    max-width: 26px;
  }

  .vacation-gantt-sticky-header {
    padding-bottom: 2px;
  }

  .vacation-gantt-help {
    font-size: 10px;
  }

  .vacation-gantt-touch-hint {
    font-size: 9px;
  }

  .vacation-actions {
    margin-bottom: 2px !important;
  }

  .vacation-actions button {
    font-size: 11px;
    padding: 4px 8px;
  }
}

@media (max-width:480px) {
  .vacation-gantt table {
    font-size: 9px;
  }

  .vacation-gantt .vac-cell {
    min-width: 24px;
    max-width: 24px;
    padding: 1px;
    font-size: 8px;
  }

  .vacation-gantt {
    padding: 3px;
    max-height: 45vh;
  }

  .vacation-gantt thead tr.vac-month-row th {
    --vac-month-row-height: 28px;
    padding: 4px 2px;
  }

  .vacation-gantt thead tr.vac-day-row th {
    padding: 2px 1px;
  }

  .vacation-gantt th.group-name {
    min-width: 18px;
    width: 18px;
    font-size: 8px;
    padding: 3px 1px;
  }

  .vacation-gantt th.member-name {
    min-width: 45px;
    max-width: 60px;
    font-size: 9px;
    padding: 1px;
    left: 18px;
  }

  .vacation-gantt .vac-day-label {
    font-size: 7px;
    gap: 1px;
    flex-direction: column;
    line-height: 1;
  }

  .vacation-gantt .vac-day-label .vac-date {
    font-size: 7px;
    display: block;
    line-height: 1;
  }

  .vacation-gantt .vac-day-label .vac-day {
    font-size: 6px;
    display: block;
    line-height: 1;
  }

  .vacation-gantt .vac-month-header .vac-month-text {
    font-size: 10px;
  }

  .vacation-gantt thead th {
    padding: 1px;
    vertical-align: middle;
    height: auto;
    min-width: 24px;
    max-width: 24px;
  }

  .vacation-gantt-help {
    font-size: 9px;
    gap: 4px !important;
  }

  .vacation-gantt-touch-hint {
    font-size: 8px;
  }

  .vacation-actions button {
    font-size: 10px;
    padding: 3px 6px;
  }

  .vacation-view {
    gap: 4px;
  }

  .vacation-helper {
    font-size: 10px;
  }
}

/* 郢晄ｧｭ繝ｫ郢晢ｽ･郢ｧ・｢郢晢ｽｫ郢晢ｽ｢郢晢ｽｼ郢敖郢晢ｽｫ */
.manual-modal {
  position: fixed;
  inset: 0;
  z-index: 1850;
  display: none;
}

.manual-modal.show {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, .5);
}

.manual-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  width: min(960px, 94vw);
  max-height: 80vh;
  position: relative;
  display: flex;
  flex-direction: column;
}

.manual-card>div:first-child {
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 10;
  padding: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.manual-card>section {
  overflow: auto;
  padding: 0 16px 16px 16px;
  flex: 1;
}

.manual-section {
  margin-bottom: 16px;
}

.manual-section h4 {
  margin: 8px 0;
}

.manual-section table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.manual-section table th,
.manual-section table td {
  border: 1px solid #ddd;
  padding: 6px;
}

/* 郢晄ｧｭ繝ｫ郢晢ｽ･郢ｧ・｢郢晢ｽｫ郢ｧ・ｿ郢晢ｿｽ */
.manual-tabs {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.manual-tab-btn {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  border-radius: 6px 6px 0 0;
  background: #f9fafb;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  transition: all .2s;
}

.manual-tab-btn:hover {
  background: #f3f4f6;
}

.manual-tab-btn.active {
  background: #fff;
  border-bottom-color: #fff;
  color: #0073bb;
  position: relative;
  margin-bottom: -1px;
}

.manual-tab-content {
  display: none;
}

.manual-tab-content.active {
  display: block;
}

/* 郢ｧ・ｰ郢晢ｽｫ郢晢ｽｼ郢晏干ﾎ鍋ｹ昜ｹ斟礼ｹ晢ｽｼ */
.grp-menu {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 100%;
  width: max-content;
  max-width: calc(100vw - 32px);
  background: #dff1ff;
  border: 1px solid #bfe4ff;
  border-radius: 8px;
  padding: 4px 0;
  max-height: calc(100vh - var(--header-height) - 20px);
  overflow: auto;
  box-shadow: 0 4px 8px rgba(0, 0, 0, .08);
  z-index: 1600;
  transition: opacity .15s ease;
  opacity: 0;
  pointer-events: none;
}

.grp-menu.show {
  opacity: 1;
  pointer-events: auto;
}

.grp-menu h4 {
  margin: 0 0 4px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.grp-menu ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.grp-menu li {
  margin: 0;
}

.grp-menu button.grp-item {
  display: block;
  width: 100%;
  background: transparent;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  cursor: pointer;
  white-space: nowrap;
}

.grp-menu button.grp-item:hover {
  background: #bfe4ff;
}

/* 邵ｺ鬘碑｡咲ｹｧ蟲ｨ笳狗ｹｧ・ｨ郢晢ｽｪ郢ｧ・｢ */
.notices-area {
  max-width: 100%;
  margin: 0 auto 16px;
  padding: 0 16px;
  transition: all 0.3s ease;
}

.notices-container {
  background: #fffbeb;
  border: 1px solid #fbbf24;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, .05);
}

.notices-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
  transition: background .2s;
  padding: 4px 8px;
  margin: -4px -8px 8px -8px;
  border-radius: 4px;
}

.notices-header:hover {
  background: rgba(251, 191, 36, 0.1);
}

.notices-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #92400e;
}

.notices-hint {
  font-size: 11px;
  color: #b45309;
  font-weight: 400;
  opacity: 0.8;
  margin-left: 6px;
}

.notices-summary {
  font-size: 14px;
  color: #92400e;
  font-weight: 400;
}

.notices-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 邵ｺ鬘碑｡咲ｹｧ蟲ｨ笳狗ｹｧ・ｨ郢晢ｽｪ郢ｧ・｢邵ｺ遒∝陶邵ｺ蛟･窶ｻ邵ｺ・ｽ・玖ｿ･・ｶ隲ｷ・ｽ */
.notices-area.collapsed .notices-list {
  display: none;
}

.notices-area.collapsed .notices-summary {
  display: inline !important;
}

.notice-item {
  background: #fff;
  border: 1px solid #fbbf24;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  transition: all .2s;
}

.notice-item:hover {
  background: #fef3c7;
  border-color: #f59e0b;
}

.notice-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #92400e;
  user-select: none;
}

.notice-toggle {
  font-size: 14px;
  transition: transform .2s;
}

.notice-item.expanded .notice-toggle {
  transform: rotate(90deg);
}

.notice-title {
  flex: 1;
  font-size: 14px;
}

.notice-content {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #fbbf24;
  font-size: 14px;
  color: #78350f;
  line-height: 1.6;
  white-space: pre-wrap;
  display: none;
}

.notice-item.expanded .notice-content {
  display: block;
}

.notice-content a {
  color: #0073bb;
  text-decoration: underline;
  word-break: break-all;
}

.notice-content a:hover {
  color: #005a8f;
}

/* 郢ｧ・ｿ郢ｧ・､郢晏現ﾎ晉ｸｺ・ｮ邵ｺ・ｿ邵ｺ・ｮ邵ｺ鬘碑｡咲ｹｧ蟲ｨ笳狗ｸｺ・ｯ鬮｢遏ｩ蜩ｩ闕ｳ蟠趣ｽｦ・ｽ */
.notice-item.title-only {
  cursor: default;
}

.notice-item.title-only .notice-toggle {
  display: none;
}

.notice-item.title-only:hover {
  background: #fff;
}

/* 邵ｺ鬘碑｡咲ｹｧ蟲ｨ笳矩ｂ・｡騾・ｿｽI */
.notices-editor,
.tools-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.notice-edit-item,
.tool-edit-item {
  background: #f9fafb;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 12px;
}

.notice-edit-row,
.tool-edit-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.notice-edit-item input[type="text"],
.tool-edit-item input[type="text"],
.tool-edit-item input[type="url"] {
  flex: 1;
  margin-left: 24px;
  min-width: 160px;
}

.notice-edit-item textarea,
.tool-edit-item textarea {
  width: 100%;
  min-height: 80px;
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.btn-remove-notice,
.btn-remove-tool {
  background: #ef4444;
  color: #fff;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.btn-remove-notice:hover,
.btn-remove-tool:hover {
  background: #dc2626;
}

/* 邵ｺ鬘碑｡咲ｹｧ蟲ｨ笳矩ｂ・｡騾・ｿｽ / 郢晢ｿｽ・ｽ郢晢ｽｫ驍ゑｽ｡騾・ｿｽ・ｼ蛹ｻ縺｡郢晞摩・ｽ・ｽ・ｽ */
.notices-manager,
.tools-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.notices-manager-toolbar,
.tools-manager-toolbar {
  flex: 0 0 auto;
  background: #fff;
  padding: 0 0 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notices-manager-scroll,
.tools-manager-scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 12px 0 8px;
  min-height: 0;
}

.notices-manager-info,
.tools-manager-info {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  color: #1e40af;
}

.notices-manager-info p,
.tools-manager-info p {
  margin: 0;
  line-height: 1.6;
}

.notices-manager-actions,
.tools-manager-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-primary {
  background: #0073bb;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background .2s;
}

.btn-primary:hover {
  background: #005a94;
}

.btn-secondary {
  background: #6b7280;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background .2s;
}

.btn-secondary:hover {
  background: #4b5563;
}

.btn-danger {
  background: #ef4444;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background .2s;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-success {
  background: #10b981;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background .2s;
}

/* --- btn-sm: コンパクトボタン（カラム構成・拠点管理等） --- */
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* カラム構成タブ内のアクションボタン視認性向上 */
.column-order-item .btn-sm,
.column-order-item .btn-primary,
.column-order-item .btn-secondary,
.column-order-item .btn-danger {
  border: 1px solid rgba(0, 0, 0, 0.15);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.btn-success:hover {
  background: #059669;
}

/* 郢晏ｳｨﾎ帷ｹ晢ｿｽ縺・郢晏ｳｨﾎ溽ｹ晢ｿｽ・ｽ陝・ｽｾ陟｢諛奇ｿｽ邵ｺ鬘碑｡咲ｹｧ蟲ｨ笳・郢晢ｿｽ・ｽ郢晢ｽｫ郢ｧ・ｨ郢晢ｿｽ縺・ｹｧ・ｿ郢ｧ・｢郢ｧ・､郢晢ｿｽﾎ・*/
.notice-edit-item,
.tool-edit-item {
  position: relative;
  background: #f9fafb;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 12px;
  transition: all .2s;
  cursor: move;
}

.notice-edit-item:hover,
.tool-edit-item:hover {
  border-color: #9ca3af;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .08);
}

.notice-edit-item.dragging,
.tool-edit-item.dragging {
  opacity: 0.5;
  border-color: #0073bb;
  background: #e0f2fe;
}

.notice-edit-item.drag-over,
.tool-edit-item.drag-over {
  border-top: 3px solid #0073bb;
}

.notice-edit-handle,
.tool-edit-handle {
  position: absolute;
  left: 12px;
  top: 12px;
  font-size: 18px;
  color: #9ca3af;
  cursor: move;
  user-select: none;
}

.notice-edit-controls,
.tool-edit-controls {
  display: flex;
  gap: 4px;
  align-items: center;
}

.notice-visibility-toggle,
.tool-visibility-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 4px 8px;
}

.notice-visibility-toggle input[type="checkbox"],
.tool-visibility-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.notice-edit-item.hidden-notice,
.tool-edit-item.hidden-tool {
  border-style: dashed;
  opacity: 0.7;
  background: #fef3c7;
}

/* --- 並べ替えボタン（↑↓）の統一スタイル --- */
.btn-move-up,
.btn-move-down {
  background: #374151; /* より濃いグレーでコントラストを強調 */
  color: #ffffff;
  border: 1px solid #1f2937;
  width: 26px;
  height: 26px;
  min-width: 26px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all .2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.btn-move-up:hover,
.btn-move-down:hover {
  background: #111827; /* ホバー時にさらに濃く */
  border-color: #000;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
}

.btn-move-up:active,
.btn-move-down:active {
  transform: translateY(0);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
}

.btn-move-up:disabled,
.btn-move-down:disabled {
  background: #9ca3af !important;
  color: #f3f4f6 !important;
  border-color: #d1d5db !important;
  cursor: not-allowed;
  opacity: 0.4;
  box-shadow: none;
  transform: none;
  pointer-events: none;
}

/* === 陷奇ｽｰ陋ｻ・ｷ騾包ｽｨ郢ｧ・ｹ郢ｧ・ｿ郢ｧ・､郢晢ｽｫ (SSOT: JS雎包ｽｨ陷茨ｽ･陞溽判辟夂ｸｺ・ｮ陋ｻ・ｩ騾包ｽｨ) === */
@media print {

  /* 1. 騾包ｽｨ驍丞生竊定怦・ｨ闖ｴ讌｢・ｨ・ｭ陞ｳ・ｽ */
  @page {
    size: A4 landscape;
    margin: 5mm;
    /* 闖ｴ蜥丞項郢ｧ雋橸ｽｰ莉｣・髫ｧ・ｰ郢ｧ竏壺ｻ陟趣ｿｽ・･闖ｴ・ｿ邵ｺ蛹ｻ・狗ｹｧ蛹ｻ竕ｧ邵ｺ・ｫ */
  }

  body {
    background: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* 2. 闕ｳ蟠趣ｽｦ竏壺・髫補悪・ｴ・ｽ郢ｧ蟶晄直髯ｦ・ｨ驕会ｽｺ */
  body>*:not(#eventModal) {
    display: none !important;
  }

  /* 郢晢ｽ｢郢晢ｽｼ郢敖郢晢ｽｫ陷・ｽ・ｽ闕ｳ蟠趣ｽｦ竏壹Τ郢晢ｽｼ郢晢ｿｽ謦ｼ髯ｦ・ｨ驕会ｽｺ */
  #eventClose,
  .event-modal-header,
  .event-select-toolbar,
  .event-toolbar,
  .vacation-actions,
  .vacation-group-jumps,
  .event-legend,
  .vac-color-palette,
  .vacation-gantt-touch-hint,
  .event-toolbar__hint,
  .btn-show-event-notice,
  button {
    display: none !important;
  }

  /* 3. 郢晢ｽ｢郢晢ｽｼ郢敖郢晢ｽｫ郢ｧ雋樣ｭり崕・ｷ郢ｧ・ｭ郢晢ｽ｣郢晢ｽｳ郢晁・縺帷ｸｺ・ｨ邵ｺ蜉ｱ窶ｻ郢晢ｽｪ郢ｧ・ｻ郢晢ｿｽ繝ｨ */
  #eventModal {
    display: block !important;
    position: absolute !important;
    /* static邵ｺ・ｽ邵ｺ・ｨ闖ｴ蜥丞項驕ｲ蟲ｨ・ｽ陟厄ｽｱ鬮ｻ・ｿ郢ｧ雋槫･ｳ邵ｺ莉｣・狗ｸｺ阮吮・邵ｺ蠕娯旺郢ｧ荵昶螺郢ｧ竏･bsolute邵ｺ・ｧ陝ｾ・ｦ闕ｳ鄙ｫ竊楢摎・ｺ陞ｳ・ｽ */
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: auto !important;
    background: #fff !important;
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
    box-shadow: none !important;
    overflow: visible !important;
    z-index: 9999 !important;
  }

  /* 陷・ｽﾎ夂ｹｧ・ｳ郢晢ｽｳ郢晢ｿｽ繝ｪ邵ｺ・ｮ郢晢ｽｪ郢ｧ・ｻ郢晢ｿｽ繝ｨ */
  #eventModal .admin-card,
  #eventModal .admin-card-body,
  #eventModal .vacation-table-wrap,
  #eventModal .vacation-gantt {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  /* 4. 郢ｧ・ｬ郢晢ｽｳ郢晏現繝｡郢晢ｽ｣郢晢ｽｼ郢晏現繝ｦ郢晢ｽｼ郢晄じﾎ晉ｸｺ・ｮ隶堤洸ﾂ・ｽ郢ｧ雋橸ｽｼ・ｷ陋ｻ・ｶ */
  .vacation-gantt table {
    display: table !important;
    width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    font-size: var(--print-font-size, 9pt) !important;
  }

  .vacation-gantt thead {
    display: table-header-group !important;
  }

  .vacation-gantt tbody {
    display: table-row-group !important;
  }

  .vacation-gantt tr {
    display: table-row !important;
    page-break-inside: avoid;
    height: auto !important;
  }

  .vacation-gantt th,
  .vacation-gantt td {
    display: table-cell !important;
    border: 1px solid #ccc !important;
    padding: 1px 2px !important;
    vertical-align: middle !important;
    height: var(--print-header-height, 28px) !important;
    background-clip: padding-box !important;
  }

  /* 5. 陋ｻ諤懶ｽｹ・ｽ竊堤ｹ晢ｽｬ郢ｧ・､郢ｧ・｢郢ｧ・ｦ郢晏現・ｽ陷蜥ｲ讓・(SSOT) */

  /* 郢ｧ・ｰ郢晢ｽｫ郢晢ｽｼ郢晄憺倹 (驍ｵ・ｦ隴厄ｽｸ邵ｺ・ｽ) */
  .vacation-gantt th.group-name {
    width: 30px !important;
    background-color: #f3f4f6 !important;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    white-space: nowrap !important;
    position: static !important;
  }

  /* 雎御ｸ樣倹 */
  .vacation-gantt th.member-name {
    width: var(--print-name-width, 120px) !important;
    background-color: #fff !important;
    text-align: left !important;
    padding-left: 4px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    position: static !important;
  }

  /* 隴鯉ｽ･闔牙･縺晉ｹ晢ｽｫ・ｽ蛹ｻ繝ｳ郢晢ｿｽ繝ｨ郢晄ｧｭ縺幃ｩ幢ｽｨ陋ｻ・ｽ・ｼ・ｽ */
  .vacation-gantt th.vac-day-header,
  .vacation-gantt td.vac-cell {
    width: var(--print-cell-width, 30px) !important;
    min-width: var(--print-cell-width, 30px) !important;
    text-align: center !important;
  }

  /* 6. 鬩溷ｴ守横邵ｺ・ｮ陷蜥ｲ讓・(髢ｭ譴ｧ蜍ｹ豼ｶ・ｲ郢ｧ雋橸ｽｼ・ｷ陋ｻ・ｶ) */

  /* 郢晏･繝｣郢敖郢晢ｽｼ郢晢ｽｻ郢晢ｿｽ繝ｵ郢ｧ・ｩ郢晢ｽｫ郢晞メ繝ｬ隴趣ｽｯ */
  .vacation-gantt .vac-day-header.weekend-sat,
  .vacation-gantt .vac-cell.weekend-sat {
    background-color: #e0f2fe !important;
  }

  .vacation-gantt .vac-day-header.weekend-sun,
  .vacation-gantt .vac-cell.weekend-sun {
    background-color: #fee2e2 !important;
  }

  .vacation-gantt .vac-day-header.holiday,
  .vacation-gantt .vac-cell.holiday {
    background-color: #ffe4e6 !important;
    color: #b91c1c !important;
  }

  /* 郢晢ｽｦ郢晢ｽｼ郢ｧ・ｶ郢晢ｽｼ鬩包ｽｸ隰壽ｧｭ縺咲ｹ晢ｽｩ郢晢ｽｼ (陞溽判辟夂ｹｧ雋樞煤陷育｣ｯ竊宣包ｽｨ) */
  .vacation-gantt .vac-cell.vac-color-sat {
    background-color: var(--color-blue-100) !important;
  }

  .vacation-gantt .vac-cell.vac-color-sun {
    background-color: var(--color-red-100) !important;
  }

  .vacation-gantt .vac-cell.vac-color-holiday {
    background-color: var(--color-red-100) !important;
    color: var(--color-red-600) !important;
  }

  .vacation-gantt .vac-cell.vac-color-amber {
    background-color: var(--color-amber-100) !important;
  }

  .vacation-gantt .vac-cell.vac-color-mint {
    background-color: var(--color-green-100) !important;
  }

  .vacation-gantt .vac-cell.vac-color-lavender {
    background-color: var(--color-indigo-50) !important;
  }

  .vacation-gantt .vac-cell.vac-color-slate {
    background-color: var(--color-gray-200) !important;
  }

  /* ON霑･・ｶ隲ｷ蜈ｷ・ｼ蛹ｻ繝ｯ郢ｧ・､郢晢ｽｩ郢ｧ・､郢晁肩・ｼ・ｽ */
  .vacation-gantt .vac-cell.on {
    background-color: #0ea5e9 !important;
    color: #fff !important;
    /* 騾具ｽｽ魄溯ｲ樣ｭり崕・ｷ邵ｺ・ｧ郢ｧ繧・ｽ冗ｸｺ荵晢ｽ狗ｹｧ蛹ｻ竕ｧ邵ｺ・ｫ郢晄㈱・ｽ郢敖郢晢ｽｼ邵ｺ荵昴Τ郢ｧ・ｿ郢晢ｽｼ郢晢ｽｳ郢ｧ雋橸ｿｽ郢ｧ蠕鯉ｽ狗ｸｺ・ｮ郢ｧ繧育・邵ｺ・ｧ邵ｺ蜷ｶ窶ｲ邵ｲ竏ｽ・ｻ髮∝ｱ鍋ｸｺ・ｯWeb陷蜥ｲ讓溯怕・ｪ陷茨ｿｽ */
  }

  .vacation-gantt .vac-cell.on.weekend-sun,
  .vacation-gantt .vac-cell.on.holiday {
    background-color: #e11d48 !important;
  }

  /* 陷奇ｽｰ陋ｻ・ｷ郢ｧ・ｿ郢ｧ・､郢晏現ﾎ・*/
  #eventPrintInfo {
    display: block !important;
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    margin-bottom: 5mm;
    color: #000;
  }
}

/* === Migrated Utilities & Components (v1.5) === */

/* Utilities */

.print-list-title {
  text-align: center;
  font-size: 16pt;
  font-weight: bold;
  margin-bottom: 10px;
}

/* 2陋ｻ蜉ｱﾎ樒ｹｧ・､郢ｧ・｢郢ｧ・ｦ郢晁ご逡醍ｹ晢ｿｽ・ｽ郢晄じﾎ・(Z陝・斡・ｽ・ｽ) */
.print-two-col-table {
  width: 100% !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  table-layout: fixed !important;
}

.print-two-col-table th,
.print-two-col-table td {
  border: 1px solid #000 !important;
  padding: 4px !important;
  font-size: 9pt !important;
  vertical-align: middle !important;
  color: #000 !important;
  height: 30px !important;
  /* 髯ｦ蠕鯉ｿｽ鬯ｮ蛟･・・ｹｧ雋槫ｴ玖楜螢ｹ・邵ｺ・ｦ郢晏｣ｹ・ｽ郢ｧ・ｸ驛｢・ｰ郢ｧ鄙ｫ・定楜迚呻ｽｮ螢ｹ・・ｸｺ蟶呻ｽ・*/
}

.print-two-col-table thead th {
  background-color: #f0f0f0 !important;
  border-bottom: 2px solid #000 !important;
  font-weight: bold !important;
  text-align: center !important;
  font-size: 10pt !important;
}

/* 陝ｾ・ｦ陷ｿ・ｳ郢ｧ・ｫ郢晢ｽｩ郢晢ｿｽ邵ｺ・ｮ陋ｹ・ｺ陋ｻ・ｽ・企こ螟ｲ・ｼ莠包ｽｸ・ｭ陞滂ｽｮ・ｽ・ｽ */
.print-two-col-table td.col-sep,
.print-two-col-table th.col-sep {
  border: none !important;
  width: 10px !important;
  /* 陝ｾ・ｦ陷ｿ・ｳ邵ｺ・ｮ鬮ｫ蜥惹ｿ｣ */
  background: transparent !important;
}

/* 陋ｻ諤懶ｽｹ・ｽ・ｮ螟ゑｽｾ・ｩ (陝ｾ・ｦ郢晢ｽｻ陷ｿ・ｳ陷茨ｽｱ鬨ｾ・ｽ) */
/* 陋ｻ諤懶ｽｹ・ｽ・ｽ js/admin.js 邵ｺ・ｮ colgroup・ｽ・ｽSOT・ｽ蟲ｨ縲帝ｂ・｡騾・ｿｽ */
.print-two-col-table .print-col-name,
.print-two-col-table .print-col-work,
.print-two-col-table .print-col-status,
.print-two-col-table .print-col-time,
.print-two-col-table .print-col-next,
.print-two-col-table .print-col-note {
  width: auto !important;
}

.print-member-row {
  page-break-inside: avoid;
}

/* 郢ｧ・ｰ郢晢ｽｫ郢晢ｽｼ郢晄懈肩髯ｦ・ｨ驕会ｽｺ・ｽ莠･・ｾ謐ｺ謫ゑｿｽ蟲ｨ・ｽ邵ｺ貅假ｽ∫ｸｺ・ｮ郢ｧ・ｹ郢ｧ・ｿ郢ｧ・､郢晢ｽｫ髫ｱ・ｿ隰ｨ・ｴ */
.print-group-section {
  page-break-inside: avoid;
  margin-bottom: 20px;
}

.print-group-header {
  font-size: 14pt;
  font-weight: bold;
  border-bottom: 2px solid #000;
  margin-bottom: 5px;
  margin-top: 10px;
}

.print-table-header {
  display: flex;
  border-bottom: 1px solid #000;
  font-weight: bold;
  font-size: 10pt;
  padding: 4px 0;
}

.print-member-row {
  display: flex;
  border-bottom: 1px solid #ccc;
  font-size: 9pt;
  padding: 4px 0;
}

.pm-name {
  width: 150px;
}

.pm-work {
  width: 120px;
}

.pm-status {
  width: 80px;
}

.pm-ret {
  width: 80px;
}

.pm-next {
  width: 120px;
}

.pm-note {
  flex: 1;
}

.u-mb-8 {
  margin-bottom: 8px !important;
}

.u-mt-6 {
  margin-top: 6px;
}

.u-mt-12 {
  margin-top: 12px;
}

.u-mt-16 {
  margin-top: 16px;
}

.u-mr-4 {
  margin-right: 4px;
}

.u-mb-0 {
  margin-bottom: 0 !important;
}

.u-text-center {
  text-align: center;
}

.u-text-gray {
  color: #6b7280;
}

.u-text-666 {
  color: #666;
}

.u-text-red {
  color: #d00;
}

.u-font-sm {
  font-size: 11px;
}

.u-font-13 {
  font-size: 13px;
}

.u-font-09em {
  font-size: 0.9em;
}

.u-font-095em {
  font-size: 0.95em;
}

.u-w-44 {
  width: 44px;
}

.u-w-64 {
  width: 64px;
}

.u-w-160 {
  width: 160px;
}

.u-bold {
  font-weight: bold;
}

.u-link-blue {
  color: #0073bb;
  text-decoration: underline;
}

.u-cursor-pointer {
  cursor: pointer;
}

.u-lh-16 {
  line-height: 1.6;
}

.u-lh-18 {
  line-height: 1.8;
}

.u-inline-block {
  display: inline-block;
}

/* Components: Manual & Admin */
.manual-alert {
  padding: 12px;
  margin: 12px 0;
  border-left-width: 4px;
  border-left-style: solid;
  border-radius: 4px;
}

.manual-alert-info {
  background: #f0f8ff;
  border-left-color: #0073bb;
}

.manual-alert-success {
  background: #e7f8e7;
  border-left-color: #4ade80;
}

.manual-alert-teal {
  background: #d1ecf1;
  border-left-color: #0c5460;
}

.manual-alert-warning {
  background: #fff3cd;
  border-left-color: #ffc107;
}

.manual-alert-danger {
  background: #f8d7da;
  border-left-color: #dc3545;
}

.manual-hint {
  background: #fff3cd;
  padding: 10px;
  margin: 10px 0;
  border-left: 3px solid #ffc107;
  border-radius: 3px;
}

.status-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
  font-size: 0.9em;
}

.status-table th,
.status-table td {
  padding: 6px;
  border: 1px solid #ddd;
}

.status-table tr:first-child {
  background: #f5f5f5;
}

.manual-details {
  margin: 8px 0;
}

.manual-details summary {
  cursor: pointer;
  font-weight: bold;
  padding: 4px 0;
}

.manual-details p {
  margin: 8px 0 8px 20px;
}

.admin-modal-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

/* 基本設定などの汎用ボタンを視覚的に強化（白飛び防止） */
.admin-subsection button,
.admin-row button {
  padding: .4rem 1rem;
  border: 1px solid #cbd5e1; /* 少し濃いボーダー */
  border-radius: 6px; /* Pillから角丸ボタンに変更し、デザインを統一 */
  background: #f8fafc; /* 白すぎないグレー */
  color: #334155;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.admin-subsection button:hover,
.admin-row button:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* プライマリ等の既存クラスが指定されている場合は、そちらの配色を優先 */
.admin-subsection button.btn-primary,
.admin-row button.btn-primary,
.admin-subsection button.btn-secondary,
.admin-row button.btn-secondary,
.admin-subsection button.btn-danger,
.admin-row button.btn-danger,
.admin-subsection button.btn-success,
.admin-row button.btn-success {
  border-radius: 6px !important; /* ピル型から統一 */
}

/* 特定のプライマリボタンを強調 */
#btnImport, #btnRenameOffice, #btnSetPw {
  background: #eef2ff;
  color: #4338ca;
  border-color: #c7d2fe;
}

#btnImport:hover, #btnRenameOffice:hover, #btnSetPw:hover {
  background: #e0e7ff;
}

.login-msg {
  color: #0073bb;
  margin-top: 8px;
}

.u-flex-end-gap {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.u-m-0 {
  margin: 0 !important;
}

.u-mt-0 {
  margin-top: 0 !important;
}

.u-mt-4 {
  margin-top: 4px;
}

.u-mt-8 {
  margin-top: 8px;
}

.u-mb-12 {
  margin-bottom: 12px;
}

.u-mb-16 {
  margin-bottom: 16px;
}

.u-my-8 {
  margin: 8px 0;
}

.u-my-6 {
  margin: 6px 0;
}

.u-my-4 {
  margin: 4px 0;
}

.u-pl-20 {
  padding-left: 20px;
}

.u-ml-20 {
  margin-left: 20px;
}

.u-visually-hidden {
  position: fixed;
  left: -9999px;
  opacity: 0;
}

.manual-subtext {
  margin: 8px 0 16px 0;
  color: #666;
  font-size: 0.9em;
}

/* === 闕ｳﾂ髫包ｽｧ陷・ｽｺ陷牙ｹ｢・ｼ・ｽDF陷・ｽｺ陷牙ｹ｢・ｼ閾･逡醍ｹｧ・ｹ郢ｧ・ｿ郢ｧ・､郢晢ｽｫ === */
.print-list-work-area {
  background: #fff;
  color: #000;
  padding: 0;
  font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif;
}

.print-list-title {
  text-align: center;
  font-size: 16pt;
  font-weight: bold;
  margin-bottom: 15px;
  border-bottom: 2px solid #000;
  padding-bottom: 5px;
}

/* 2陋ｻ邇ｲ・ｮ・ｵ驍ｨ・ｽ竏ｩ郢ｧ・ｳ郢晢ｽｳ郢晢ｿｽ繝ｪ */
.print-list-container {
  column-count: 2;
  column-gap: 20px;
  width: 100%;
}

/* 1郢晢ｿｽ・ｽ郢晄じﾎ晁怎・ｺ陷牙ｸ呻ｿｽ隹ｿ・ｵ驍ｨ・ｽ竏ｩ邵ｺ蜉ｱ竊醍ｸｺ・ｽ・ｼ・ｽ4隹ｿ・ｵ髣懶ｽｽ陋ｹ螟應ｺ溯ｱ・ｽ｢・ｽ・ｽ */
.print-list-container--one-table {
  column-count: 1;
  column-gap: 0;
}

.print-group-section {
  break-inside: avoid;
  page-break-inside: avoid;
  /* 隴鯉ｽｧ郢晄じﾎ帷ｹｧ・ｦ郢ｧ・ｶ闔蜻磯共 */
  margin-bottom: 15px;
  border: 1px solid #000;
  border-radius: 4px;
}

/* 陷茨ｽｨ陷ｩ・｡髯ｦ・ｨ驕会ｽｺ騾包ｽｨ・ｽ螢ｹ・ｽ郢晢ｽｼ郢ｧ・ｸ髴搾ｽｨ邵ｺ蠑ｱ・帝坎・ｱ陞ｳ・ｹ邵ｺ蜷ｶ・・*/
.print-group-section.no-break-limit {
  break-inside: auto;
  page-break-inside: auto;
}

.print-group-header {
  break-after: avoid;
  /* 髫募唱・ｽ邵ｺ蜉ｱ・ｽ騾ｶ・ｴ陟募ｾ後堤ｸｺ・ｮ隰ｾ・ｹ郢晏｣ｹ・ｽ郢ｧ・ｸ郢ｧ蟶昜ｺ溽ｸｺ・ｽ */
  background-color: #eee;
  border-bottom: 1px solid #000;
  padding: 4px 8px;
  font-size: 11pt;
  font-weight: bold;
}

.print-table-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #000;
  background-color: #f9f9f9;
  font-weight: bold;
  font-size: 8pt;
  /* 郢ｧ・ｵ郢ｧ・､郢ｧ・ｺ驍ｵ・ｮ陝・ｿｽ */
  padding: 2px 4px;
  /* 郢昜ｻ｣繝ｧ郢ｧ・｣郢晢ｽｳ郢ｧ・ｰ驍ｵ・ｮ陝・ｿｽ */
  line-height: 1.1;
}

.print-member-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #ccc;
  padding: 4px 6px;
  font-size: 9pt;
  line-height: 1.2;
  break-inside: avoid;
  /* 髯ｦ蠕鯉ｿｽ鬨ｾ豈費ｽｸ・ｭ邵ｺ・ｧ邵ｺ・ｮ隰ｾ・ｹ郢晏｣ｹ・ｽ郢ｧ・ｸ邵ｺ・ｯ鬮ｦ・ｲ邵ｺ・ｽ */
}

.print-member-row:last-child {
  border-bottom: none;
}

/* 陷ｷ・ｽ・ｽ・ｽ蟯ｼ邵ｺ・ｮ陝ｷ・ｽ・ｪ・ｿ隰ｨ・ｴ (A4隶難ｽｪ郢晢ｽｻ2陋ｻ諤懃√隰・ｽ) */
/* 陷ｷ驛・ｽｨ蛹ｻ窶ｲ100%邵ｺ・ｫ邵ｺ・ｪ郢ｧ荵晢ｽ育ｸｺ・ｽ竊馴坡・ｿ隰ｨ・ｴ: 雎御ｸ樣倹20, 陷搾ｽ､陷搾ｿｽ15, 霑･・ｶ隲ｷ・ｽ10, 隰鯉ｽｻ郢ｧ・ｽ10, 隴丞叙蠕・0, 陋ｯ蜻ｵﾂ・ｽ25 */
.pm-name {
  flex: 0 0 20%;
  /* 雎御ｸ樣倹 */
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 4px;
}

.pm-work {
  flex: 0 0 15%;
  /* 陷搾ｽ､陷榊綜蜃ｾ鬮｢・ｽ */
  white-space: nowrap;
  overflow: hidden;
  font-size: 0.9em;
}

.pm-status {
  flex: 0 0 10%;
  /* 霑･・ｶ隲ｷ・ｽ */
  white-space: nowrap;
  text-align: center;
  font-weight: bold;
}

.pm-ret {
  flex: 0 0 10%;
  /* 隰鯉ｽｻ郢ｧ・ｽ */
  text-align: center;
  white-space: nowrap;
}

.pm-next {
  flex: 0 0 20%;
  /* 隴丞叙蠕狗ｸｺ・ｮ闔莠･・ｮ・ｽ */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 4px;
  padding-right: 4px;
  font-size: 0.9em;
}

.pm-note {
  flex: 1;
  /* 陋ｯ蜻ｵﾂ・ｽ (隹ｿ荵晢ｽ願怦・ｨ邵ｺ・ｦ) */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 4px;
  color: #555;
  font-size: 0.9em;
}

/* 陷奇ｽｰ陋ｻ・ｷ隴弱ｅ・ｽ髯ｦ・ｨ驕会ｽｺ陋ｻ・ｶ陟包ｽ｡ */
@media print {
  @page {
    size: landscape;
    /* 隶難ｽｪ陷ｷ莉｣窶ｳ隰暦ｽｨ陞ゑｽｨ */
    margin: 10mm;
  }

  body {
    background: #fff !important;
    height: auto !important;
    overflow: visible !important;
  }

  /* 闕ｳﾂ髫包ｽｧ陷・ｽｺ陷牙ｸ厥皮ｹ晢ｽｼ郢晏ｳｨ・ｽ隴弱ｅ・ｽ闔画じ・ｽ陷茨ｽｨ邵ｺ・ｦ郢ｧ蟶晏恚邵ｺ・ｽ */
  body:has(#printListWorkArea:not(.u-hidden))>*:not(#printListWorkArea) {
    display: none !important;
  }

  body:has(#printListWorkArea:not(.u-hidden)) #printListWorkArea {
    display: block !important;
    position: static !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  /* 郢晁ｼ斐°郢晢ｽｳ郢晏現縺礼ｹｧ・､郢ｧ・ｺ髫ｱ・ｿ隰ｨ・ｴ */
  .print-list-title {
    font-size: 14pt;
  }

  .print-group-header {
    font-size: 10pt;
  }

  .print-table-header {
    font-size: 8.5pt;
    background-color: #f0f0f0 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-member-row {
    font-size: 8.5pt;
    padding: 2px 5px;
  }
}
  
/* QR繧ｳ繝ｼ繝峨Δ繝ｼ繝繝ｫ繧ｫ繧ｹ繧ｿ繝 */  
.qr-modal-card { max-width: 400px; width: 90vw; }  
.qr-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--color-border); }  
.qr-modal-body { padding: 24px; text-align: center; }  
.qr-container { margin-bottom: 16px; background: #fff; padding: 12px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: inline-block; }  
.qr-image { max-width: 100%; height: auto; display: block; }  
.qr-help { font-size: 14px; color: var(--color-text-muted); line-height: 1.5; } 

/* ============================================================ */
/* 繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ繧ｯ繝ｩ繧ｹ & 譁ｰ讖溯・逕ｨ繧ｹ繧ｿ繧､繝ｫ (Phase 6, 7 霑ｽ蜉) */
/* ============================================================ */

.u-hidden { display: none !important; }
/* 1列表示（カード形式）時のフィルタリング不具合修正用：!important同士の競合を specificity で解決 */
#board tbody tr.u-hidden,
#board section.u-hidden {
  display: none !important;
}
.u-mb-3 { margin-bottom: 1.5rem !important; }
.u-mt-2 { margin-top: 1rem !important; }
.u-w-100 { width: 100% !important; }
.u-grid { display: grid !important; }
.u-grid-2-cols { grid-template-columns: 1fr 1fr !important; }
.u-gap-1 { gap: 0.5rem !important; }
.u-text-center { text-align: center !important; }
.u-text-gray { color: #6B7280 !important; }
.u-text-red { color: #DC2626 !important; }
.u-font-sm { font-size: 0.875rem !important; }

/* 繧ｫ繝ｩ繝讒区・險ｭ螳壹ユ繝ｼ繝悶Ν */
.column-setting-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
.column-setting-table th, .column-setting-table td {
  border: 1px solid var(--line);
  padding: 10px;
}
.column-setting-table th {
  background: #F9FAFB;
  font-weight: 600;
}

/* 諡轤ｹ邂｡逅・ヵ繧ｩ繝ｼ繝 */
.office-add-form {
  padding: 15px;
  background: #F3F4F6;
  border-radius: 8px;
}

/* === トースト通知 (Toast Notifications) === */
.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  z-index: 9999;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}

.toast-panel {
  padding: 14px 28px;
  border-radius: 50px; /* カプセル形状 */
  background: rgba(31, 41, 55, 0.9);
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  white-space: nowrap;
}

/* 成功時：心地よいグリーン */
.toast--success .toast-panel {
  background: rgba(5, 150, 105, 0.9); /* green-600 */
}

/* エラー時：警告のレッド */
.toast--error .toast-panel {
  background: rgba(220, 38, 38, 0.9); /* red-600 */
}

/* レスポンシブ用位置調整 */
@media (max-width: 720px) {
  .toast {
    bottom: 80px; /* モバイルではフッターボタン等に重ならないよう少し上げる */
  }
  .toast-panel {
    padding: 12px 20px;
    font-size: 14px;
    white-space: normal;
    text-align: center;
  }
}

/* 繝ｬ繧ｹ繝昴Φ繧ｷ繝也畑髱櫁｡ｨ遉ｺ */
@media (max-width: 768px) {
  .u-hidden-mobile {
    display: none !important;
  }
}

/* === 開発者用：拠点切り替えセクション === */
.admin-office-row {
  background: var(--color-blue-50);
  border-bottom: 1px solid var(--color-blue-200);
  padding: 12px 24px;
}

.admin-office-selector-inner {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.admin-office-row label {
  font-weight: 700;
  color: var(--color-blue-700);
  white-space: nowrap;
}

#adminOfficeSel {
  width: auto;
  min-width: 200px;
  max-width: 300px;
  border-color: var(--color-blue-200);
  background-color: var(--color-white);
  font-weight: 600;
}

#adminOfficeSel:focus {
  border-color: var(--color-blue-500);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  outline: none;
}

.admin-office-hint {
  font-size: 12px;
  color: var(--color-blue-600);
  opacity: 0.8;
}

@media (max-width: 720px) {
  .admin-office-row {
    padding: 12px 16px;
  }
}

/* ============================================================ */
/* Phase 2: Firebase Authentication & SaaS UI */
/* ============================================================ */

.login {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

#authContainer {
  width: 100%;
  max-width: 400px;
  background: var(--color-white);
  padding: 32px;
  border-radius: 16px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
}

#authContainer h2 {
  margin: 0 0 8px;
  text-align: center;
  font-size: 24px;
  color: var(--color-gray-900);
}

#authContainer p {
  text-align: center;
  color: var(--color-text-muted);
  margin-bottom: 20px;
}

#authContainer input {
  margin-bottom: 12px;
}

#authContainer button {
  width: 100%;
  padding: 12px;
  background: var(--color-blue-600);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

#authContainer button:hover {
  background: var(--color-blue-700);
}

.u-mt-16 { margin-top: 16px !important; }
.u-font-09em { font-size: 0.9em !important; }
.u-link-blue { color: var(--color-blue-600); text-decoration: underline; cursor: pointer; }


`

### print-list.css

```css
/* ======================================================================
 * print-list.css — 一覧出力（印刷）専用モジュール
 * styles.css から独立したファイル。通常画面には影響しない（media="print"で読込）。
 * ====================================================================== */

@media print {

    :root {
        --print-one-col-work-min-width: 88px;
        --print-one-col-time-min-width: 72px;
    }

    /* ==========================================================================
   * 1. 表示切替 — 一覧出力時は他の要素をすべて隠す
   * styles.css Block1 の body>*:not(#eventModal) { display:none } を打ち消し
   * ========================================================================== */

    /* 一覧出力が表示中のとき、body直下の全要素を隠す（#printListWorkArea 含む） */
    body:has(#printListWorkArea:not(.u-hidden))>* {
        display: none !important;
    }

    /* #printListWorkArea だけを表示 */
    body:has(#printListWorkArea:not(.u-hidden))>#printListWorkArea {
        display: block !important;
        position: static !important;
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
        font-family: "Helvetica Neue", Arial, "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
    }

    /* ==========================================================================
   * 2. 用紙設定（一覧出力専用）
   * ========================================================================== */
    body:has(#printListWorkArea:not(.u-hidden)) {
        background: #fff !important;
        margin: 0 !important;
        padding: 0 !important;
    }

    /* ==========================================================================
   * 3. 共通タイトル
   * ========================================================================== */
    .print-list-title {
        text-align: center;
        font-size: 14pt;
        font-weight: bold;
        margin-bottom: 8px;
        border-bottom: 2px solid #000;
        padding-bottom: 4px;
    }

    /* ==========================================================================
   * 4. One Table レイアウト（1人1行テーブル・全メンバー表示）
   *    admin.js が生成する構造:
   *    table.print-one-col-table > colgroup > col[style.width]
   *                              > thead > tr > th.print-col-*
   *                              > tbody > tr > td.print-col-*
   * ========================================================================== */
    .print-one-col-table {
        width: 100% !important;
        border-collapse: collapse !important;
        border-spacing: 0 !important;
        table-layout: fixed !important;
        min-width: calc(120px + var(--print-one-col-work-min-width) + 100px + var(--print-one-col-time-min-width) + 150px + 200px) !important;
    }

    .print-one-col-table th.print-one-col-work,
    .print-one-col-table td.print-one-col-work {
        min-width: var(--print-one-col-work-min-width) !important;
        white-space: nowrap !important;
    }

    .print-one-col-table th.print-one-col-time,
    .print-one-col-table td.print-one-col-time {
        min-width: var(--print-one-col-time-min-width) !important;
        white-space: nowrap !important;
    }

    .print-one-col-table th,
    .print-one-col-table td {
        display: table-cell !important;
        border: 1px solid #999 !important;
        padding: 3px 6px !important;
        font-size: 9pt !important;
        vertical-align: middle !important;
        color: #000 !important;
        height: 26px !important;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    /* テーブルヘッダー: ページ毎に繰り返す */
    .print-one-col-table thead {
        display: table-header-group !important;
    }

    .print-one-col-table thead th {
        background-color: #e8e8e8 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        border-bottom: 2px solid #333 !important;
        font-weight: bold !important;
        text-align: center !important;
        font-size: 9pt !important;
        white-space: nowrap;
    }

    /* テーブル行 */
    .print-one-col-table tr {
        display: table-row !important;
        page-break-inside: avoid !important;
    }

    .print-one-col-table tbody {
        display: table-row-group !important;
    }

    /* 氏名列（1列目）は太字 */
    .print-one-col-table td:first-child {
        font-weight: bold;
    }

    /* ★ 列幅は admin.js の colgroup で一元管理（SSOT）
     *   .print-col-* クラスは One Table では使わない
     *   → styles.css の !important 付きルールとの競合を回避 */

    /* ==========================================================================
   * 5. グループ表示レイアウト（従来のFlexbox構成）
   *    admin.js が生成する構造:
   *    div.print-list-container
   *      > div.print-group-section
   *          > div.print-group-header
   *          > div.print-table-header > div.pm-*
   *          > div.print-member-row   > div.pm-*
   * ========================================================================== */
    .print-group-section {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 15px;
    }

    .print-group-header {
        font-size: 10pt;
        font-weight: bold;
        border-bottom: 2px solid #000;
        margin-bottom: 3px;
        margin-top: 8px;
    }

    .print-table-header {
        display: flex;
        align-items: center;
        border-bottom: 1px solid #000;
        background-color: #f0f0f0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        font-weight: bold;
        font-size: 8.5pt;
        padding: 2px 5px;
    }

    .print-member-row {
        display: flex;
        align-items: center;
        border-bottom: 1px solid #ccc;
        font-size: 8.5pt;
        padding: 2px 5px;
        break-inside: avoid;
        page-break-inside: avoid;
    }

    /* Flex各項目の幅（グループ表示用） */
    .pm-name {
        flex: 0 0 18%;
        font-weight: bold;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding-right: 4px;
    }

    .pm-work {
        flex: 0 0 14%;
        overflow: hidden;
        white-space: nowrap;
    }

    .pm-status {
        flex: 0 0 10%;
        text-align: center;
        white-space: nowrap;
    }

    .pm-ret {
        flex: 0 0 10%;
        text-align: center;
        white-space: nowrap;
    }

    .pm-next {
        flex: 0 0 18%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        padding: 0 4px;
    }

    .pm-note {
        flex: 1;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #555;
    }

}
`

### schema.sql

```sql
-- schema.sql
-- Cloudflare D1 用のテーブル定義

-- 事業所テーブル
CREATE TABLE IF NOT EXISTS offices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT,
    admin_password TEXT,
    is_public BOOLEAN DEFAULT 1, -- SQLite には真偽値がないため 0 or 1
    auto_clear_config TEXT DEFAULT NULL, -- 自動消去設定 (JSON文字列)
    created_at INTEGER,
    updated_at INTEGER
);

-- メンバーテーブル
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
    updated INTEGER, -- 同期用のタイムスタンプ (ms)
    PRIMARY KEY (office_id, id),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

-- ツール設定テーブル
CREATE TABLE IF NOT EXISTS tools_config (
    office_id TEXT PRIMARY KEY,
    tools_json TEXT DEFAULT '[]',
    updated_at INTEGER,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

-- お知らせテーブル
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

-- 休暇・行事テーブル
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

-- 高速化のためのインデックス
CREATE INDEX IF NOT EXISTS idx_members_updated ON members(office_id, updated);
CREATE INDEX IF NOT EXISTS idx_notices_updated ON notices(office_id, updated);
CREATE INDEX IF NOT EXISTS idx_vacations_start ON vacations(office_id, start_date);

-- 拠点カラム設定テーブル (Phase 2 追加)
-- 既存テーブルを一切変更せず、拠点毎のカラム構成情報を保持する。
CREATE TABLE IF NOT EXISTS office_column_config (
    office_id TEXT PRIMARY KEY,
    -- 設定JSON: {"columns":[], "popup":[], "card":[], "columnWidths":{}, "columnOrder":[]}
    config_json TEXT DEFAULT NULL,
    updated_at INTEGER,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

-- 行事カレンダー用日付カラー設定
CREATE TABLE IF NOT EXISTS event_color_maps (
    office_id TEXT PRIMARY KEY,
    colors_json TEXT DEFAULT '{}',
    updated INTEGER,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

-- ユーザー管理テーブル (Phase 2 追加)
-- Firebase Authentication の UID と 拠点(office) を紐付ける。
CREATE TABLE IF NOT EXISTS users (
    firebase_uid TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    office_id TEXT, -- 所属拠点ID
    role TEXT DEFAULT 'staff', -- 'owner' (契約者/管理者), 'staff' (一般利用者)
    created_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE SET NULL
);

-- ユーザー検索用のインデックス
CREATE INDEX IF NOT EXISTS idx_users_office ON users(office_id);


`

### CloudflareWorkers_worker.js

```javascript
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
          try {
            const user = await env.DB.prepare('SELECT * FROM users WHERE firebase_uid = ?').bind(fbPayload.sub).first();
            if (user) authContext = { office: user.office_id, role: user.role, email: user.email, isFirebase: true };
          } catch (dbErr) {
            console.error('[Common Auth] D1 User Lookup Error:', dbErr.message);
            // signupアクション自体の場合はここではエラーを投げず、アクション側で詳細に処理させる
            if (action !== 'signup') {
                throw new Error(`Database error during auth: ${dbErr.message}`);
            }
          }
        }
        if (!authContext) {
          const workerPayload = await verifyWorkerToken(providedToken);
          if (workerPayload) authContext = { office: workerPayload.office, role: workerPayload.role, isFirebase: false };
        }
      } catch (authErr) {
        console.error('[Common Auth Critical Error]', authErr);
        // 重大な認証エラー（パース失敗ではなくDB接続不可など）が発生した場合は 500 へ飛ばす
        if (authErr.message.includes('Database')) {
            throw authErr;
        }
      }

      const tokenRole = authContext ? authContext.role : '';
      const tokenOffice = authContext ? authContext.office : '';
      requestContext.officeId = getParam('office') || tokenOffice || null;

      /**
       * データベースクエリ実行用安全ラッパー (SSOT/Robustness)
       * @param {Function} queryFn 
       * @param {string} errorLabel 
       */
      async function safeDbQuery(queryFn, errorLabel = 'database_error') {
        try {
          return await queryFn();
        } catch (e) {
          console.error(`[DB Error ${errorLabel}]`, e.message);
          throw e; // 上位の handleAction 側で JSON 応答として処理
        }
      }

      /* --- Actions --- */
      try {
        const response = await handleAction();
        return response;
      } catch (e) {
        console.error(`[Worker Fatal Error] action=${action}:`, e);
        // すべてのエラーレスポンスを JSON 形式に統一
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

          return new Response(JSON.stringify({ ok: true, message: 'signup_success' }), { headers: corsHeaders });
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
        if (!token || !tokenOffice) {
          console.warn('[renew] Unauthorized:', { hasToken: !!token, hasOffice: !!tokenOffice });
          return new Response(JSON.stringify({ ok: false, error: 'unauthorized', reason: 'invalid_session' }), { headers: corsHeaders });
        }
        
        // 拠点名を取得
        const officeData = await env.DB.prepare('SELECT name FROM offices WHERE id = ?').bind(tokenOffice).first();
        return new Response(JSON.stringify({ 
          ok: true, 
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

`

### sw.js

```javascript
// Service Worker for Whereabouts (Optimized v2)
// [2026-01-20] Fixed: ignore cross-origin requests to prevent stale caching
// [2026-02-05] Updated: cache version bump to force refresh after sync.js fix
// [2026-02-19] Updated: v8 - 印刷レイアウト修正（colgroup追加、列幅調整）
// [2026-02-19] Updated: v9 - 印刷スタイルをモジュール化（print-list.css追加）
const CACHE_NAME = 'whereabouts-v9-worker-only';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './print-list.css',
  './main.js',
  './js/config.js',
  './js/globals.js',
  './js/utils.js',
  './js/layout.js',
  './js/filters.js',
  './js/board.js',
  './js/vacations.js',
  './js/offices.js',
  './js/auth.js',
  './js/sync.js',
  './js/admin.js',
  './js/tools.js',
  './js/notices.js',
  './manifest.json',
  './assets/icon_BookReader_192.png',
  './assets/icon_BookReader_512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 失敗してもインストール自体は続行させる（一部ファイルが無い場合など）
      return cache.addAll(URLS_TO_CACHE).catch(err => {
        console.error('Cache addAll failed:', err);
      });
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ネットワーク優先（HTMLは常に no-store で最新取得を試みる）
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // ★追加: 外部APIへのリクエストはService Workerを経由させず、ブラウザに直接任せる
  // （自分のドメイン以外の通信は無視することで、キャッシュ競合を防ぐ）
  if (!req.url.startsWith(self.location.origin)) {
    return;
  }

  // HTMLナビゲーションは常に最新
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    e.respondWith((async () => {
      try {
        return await fetch(req, { cache: 'no-store' });
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('./index.html') || await cache.match('/');
        return cached || new Response('<!doctype html><title>オフライン</title><h1>オフライン</h1><p>ネットワーク接続を確認してください。</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // それ以外も原則ネットワーク優先＋no-store（必要ならキャッシュに落とす）
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-store' });
      return res;
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      throw new Error('offline');
    }
  })());
});

`

### js/config.js

```javascript
/**
 * js/config.js - アプリケーション設定
 *
 * 環境設定、タイミング設定、カラーパレット設定を管理する。
 * 本ファイルの値は他の定数ファイル（js/constants/）のデフォルト値を上書きできる。
 *
 * 依存: なし（最初に読み込まれる）
 * 参照元: 全JSファイル
 *
 * @see SSOT_GUIDE.md
 */

// 環境判定: 'dev.' で始まるサブドメイン、localhost、または IP 指定の場合は開発環境 (dev worker) を使用
const hostname = window.location.hostname;
const isDev = hostname.startsWith('dev.') || hostname.includes('localhost') || hostname === '127.0.0.1';
console.log('【DEBUG】hostname:', hostname, 'isDev:', isDev);

var CONFIG = {
    // 認証/同期のモード設定（D1移行後は worker を使用）
    authMode: 'worker',
    // 環境に応じてエンドポイントを切り替え
    // ※ 独自ドメインの Worker を使用する場合は、ここをそのドメインに書き換えてください。
    remoteEndpoint: isDev
        ? "https://whereabouts-dev.taka-hiyo.workers.dev"
        : "https://whereabouts.taka-hiyo.workers.dev",

    remotePollMs: 30000,       // 30秒 (D1負荷を考慮したバランス設定)
    nightPollMs: 3600000,      // 夜間時: 1時間 (60分 * 60秒 * 1000)
    configPollMs: 300000,      // 30秒 -> 5分へ変更
    eventSyncIntervalMs: 10 * 60 * 1000, // 5分 -> 10分へ変更
    tokenDefaultTtl: 3600000,
    // 同期自己修復パラメータ（既定値は js/constants/timing.js）。
    // 変更窓口は SSOT_GUIDE.md の『同期自己修復パラメータ一覧』に一本化すること。
    syncSelfHeal: {
        // rev が同値でも serverUpdated の進みを許容する救済ウィンドウ。
        revRescueWindowMs: 180000,
        // rev 不整合(remoteRev <= localRev)時に serverUpdated 差分で救済する閾値。
        revSkewHealWindowMs: 180000,
        // 復元対象とみなす同期キャッシュの寿命。期限超過時は破棄して再同期。
        cacheTtlMs: 21600000,
        // 競合が連続した場合の警告しきい値。運用で多発監視する。
        conflictStreakWarnThreshold: 3
    },
    syncLog: {
        skipWarnThreshold: 3
    },
    // 行単位の競合多発時に自動リセットする復旧パラメータ。
    syncRecovery: {
        // 同一行で一定時間内にこの回数を超えて競合したらリセット。
        conflictThreshold: 3,
        // 競合回数を集計する時間窓。
        windowMs: 180000
    },
    // localStorage 復元時の state cache 検証パラメータ。
    syncCacheValidation: {
        // rev の許容上限（timestamp利用のため 2^53-1 付近まで許容）。
        maxRev: 999999999999999,
        // serverUpdated が現在時刻より先でも許容する最大ズレ。
        maxServerUpdatedAheadMs: 300000,
        // lastSyncTimestamp との乖離がこの閾値を超える場合は全体パージ。
        purgeDriftThresholdMs: 86400000
    },
    publicOfficeFallbacks: [],
    printSettings: {
        cellWidth: '30px',
        memberNameWidth: '120px',
        fontSize: '10pt',
        headerHeight: '30px'
    },
    /* === ストレージキー設定 (SSOT) === */
    storageKeys: {
        stateCache: 'whereabouts_state_cache',
        lastSync: 'whereabouts_last_sync',
        conflictRecovery: 'whereabouts_conflict_recovery'
    },
    /* === カラーパレット設定 (SSOT) === */
    colorPalette: [
        { key: 'none', className: 'vac-color-none', label: 'なし' },
        { key: 'saturday', className: 'vac-color-sat', label: '土曜' },
        { key: 'sunday', className: 'vac-color-sun', label: '日曜' },
        { key: 'holiday', className: 'vac-color-holiday', label: '祝日' },
        { key: 'amber', className: 'vac-color-amber', label: 'サニー' },
        { key: 'mint', className: 'vac-color-mint', label: 'グリーン' },
        { key: 'lavender', className: 'vac-color-lavender', label: 'パープル' },
        { key: 'slate', className: 'vac-color-slate', label: 'グレー' }
    ],
    eventColorLabels: {
        amber: 'サニー',
        blue: 'ブルー',
        green: 'グリーン',
        pink: 'ピンク',
        purple: 'パープル',
        teal: 'ティール',
        gray: 'グレー',
        sunday: '日曜',
        holiday: '祝日',
        slate: 'スレート'
    },
    // パレットキーからイベントカラー名への変換
    paletteToEventColor: {
        none: '',
        saturday: 'blue',
        sunday: 'sunday',
        holiday: 'holiday',
        amber: 'amber',
        mint: 'green',
        lavender: 'purple',
        slate: 'slate'
    },
    // イベントカラー名からパレットキーへの変換
    eventColorToPalette: {
        amber: 'amber',
        blue: 'saturday',
        green: 'mint',
        purple: 'lavender',
        sunday: 'sunday',
        saturday: 'saturday',
        holiday: 'holiday',
        teal: 'mint',
        pink: 'sunday',
        gray: 'slate',
        slate: 'slate'
    }
};

`

### js/constants/storage.js

```javascript
/**
 * js/constants/storage.js - ストレージキー定数 (SSOT)
 *
 * localStorage / sessionStorage で使用するキーを一元管理する。
 * キーの重複や変更漏れを防ぐため、すべてのストレージアクセスは
 * 本ファイルの定数を参照すること。
 *
 * @see SSOT_GUIDE.md
 */

// ============================================
// セッション関連キー
// ============================================
/** セッショントークン保存キー */
const SESSION_KEY = "presence-session-token";

/** ユーザー権限保存キー */
const SESSION_ROLE_KEY = "presence-role";

/** 拠点ID保存キー */
const SESSION_OFFICE_KEY = "presence-office";

/** 拠点名保存キー */
const SESSION_OFFICE_NAME_KEY = "presence-office-name";

/** 拠点カラム設定保存キー (Phase 2) */
function getColumnConfigKey(officeId) {
  return `presence-column-config:${officeId || 'default'}`;
}

// ============================================
// ローカルストレージキー
// ============================================
/** 自動ログイン用拠点ID保存キー */
const LOCAL_OFFICE_KEY = "presence_office";

/** 自動ログイン用ユーザー権限保存キー */
const LOCAL_ROLE_KEY = "presence_role";

/** 自動ログイン用拠点名保存キー */
const LOCAL_OFFICE_NAME_KEY = "presence_office_name";

/** ボードデータ保存用キーベース */
const STORE_KEY_BASE = "presence-board-v4";

/** お知らせ折りたたみ状態キー */
const NOTICE_COLLAPSE_STORAGE_KEY = 'noticeAreaCollapsed';

// ============================================
// キャッシュ関連キー
// ============================================
/**
 * 状態キャッシュキー（CONFIG.storageKeysから参照）
 * 値は sync.js で { savedAt, state } の自己修復用エンベロープ保存にも利用される。
 * @deprecated CONFIG.storageKeys.stateCache を使用すること
 */
const STORAGE_KEY_CACHE_FALLBACK = 'whereabouts_state_cache';

/**
 * 最終同期時刻キー（CONFIG.storageKeysから参照）
 * @deprecated CONFIG.storageKeys.lastSync を使用すること
 */
const STORAGE_KEY_SYNC_FALLBACK = 'whereabouts_last_sync';

/**
 * 行単位競合回復状態キー（CONFIG.storageKeysから参照）
 * @deprecated CONFIG.storageKeys.conflictRecovery を使用すること
 */
const STORAGE_KEY_CONFLICT_RECOVERY_FALLBACK = 'whereabouts_conflict_recovery';

// ============================================
// イベント選択状態キー生成
// ============================================
/**
 * イベント選択状態のストレージキーを生成
 * @param {string} officeId - 拠点ID
 * @returns {string} ストレージキー
 */
function eventSelectionKey(officeId) {
  return `${STORE_KEY_BASE}:event:${officeId || '__none__'}`;
}

`

### js/constants/timing.js

```javascript
/**
 * js/constants/timing.js - タイミング関連定数 (SSOT)
 *
 * ポーリング間隔、タイムアウト、デバウンス等の時間関連定数を一元管理する。
 * 変更時は本ファイルのみを修正すれば全体に反映される。
 *
 * 注意: 一部の値は CONFIG (config.js) で上書き可能。
 *       CONFIGに値がある場合はそちらが優先される。
 *
 * @see SSOT_GUIDE.md
 */

// ============================================
// ポーリング間隔（デフォルト値）
// ============================================
/** リモート同期ポーリング間隔（ミリ秒）- CONFIG.remotePollMs で上書き可 */
const DEFAULT_REMOTE_POLL_MS = 60000;

/** 夜間ポーリング間隔（ミリ秒）- CONFIG.nightPollMs で上書き可 */
const DEFAULT_NIGHT_POLL_MS = 3600000;

/** 設定監視ポーリング間隔（ミリ秒）- CONFIG.configPollMs で上書き可 */
const DEFAULT_CONFIG_POLL_MS = 300000;

/** イベント同期間隔（ミリ秒）- CONFIG.eventSyncIntervalMs で上書き可 */
const DEFAULT_EVENT_SYNC_INTERVAL_MS = 600000; // 10分

/** トークンデフォルトTTL（ミリ秒）- CONFIG.tokenDefaultTtl で上書き可 */
const DEFAULT_TOKEN_TTL_MS = 3600000;

// ============================================
// 同期自己修復（デフォルト値）
// ============================================
/**
 * rev救済ウィンドウ（ミリ秒）- CONFIG.syncSelfHeal.revRescueWindowMs で上書き可
 * revが同値でも serverUpdated がこの範囲内で進んでいれば追随を許可する。
 */
const DEFAULT_SYNC_REV_RESCUE_WINDOW_MS = 180000;

/**
 * rev不整合時の救済判定ウィンドウ（ミリ秒）- CONFIG.syncSelfHeal.revSkewHealWindowMs で上書き可
 * remoteRev <= localRev でも serverUpdated がこの閾値以上進んでいれば救済適用する。
 */
const DEFAULT_SYNC_REV_SKEW_HEAL_WINDOW_MS = 180000;

/**
 * 同期キャッシュ寿命（ミリ秒）- CONFIG.syncSelfHeal.cacheTtlMs で上書き可
 * 期限切れキャッシュは復元せず、破損時の自己修復を優先する。
 */
const DEFAULT_SYNC_CACHE_TTL_MS = 21600000;

/**
 * 競合連続判定しきい値（回）- CONFIG.syncSelfHeal.conflictStreakWarnThreshold で上書き可
 * 連続競合の多発を早期検知するための警告しきい値。
 */
const DEFAULT_SYNC_CONFLICT_STREAK_WARN_THRESHOLD = 3;

/**
 * 行単位リセット発動しきい値（回）- CONFIG.syncRecovery.conflictThreshold で上書き可
 * 同一行でこの回数を超えて競合した場合に自動修復（行リセット）を行う。
 */
const DEFAULT_SYNC_RECOVERY_CONFLICT_THRESHOLD = 3;

/**
 * 行単位リセット判定ウィンドウ（ミリ秒）- CONFIG.syncRecovery.windowMs で上書き可
 * 直近 windowMs 内の競合回数で自動修復の発動可否を判定する。
 */
const DEFAULT_SYNC_RECOVERY_WINDOW_MS = 180000;

/**
 * state cache 内の rev の上限値 - CONFIG.syncCacheValidation.maxRev で上書き可
 * 不正な巨大値混入による比較異常を防ぐ。
 */
const DEFAULT_SYNC_CACHE_MAX_REV = 2147483647;

/**
 * state cache 内の serverUpdated の許容未来ズレ（ミリ秒）
 * - CONFIG.syncCacheValidation.maxServerUpdatedAheadMs で上書き可
 */
const DEFAULT_SYNC_CACHE_MAX_SERVER_UPDATED_AHEAD_MS = 300000;

/**
 * lastSyncTimestamp と各行 serverUpdated の最大乖離（ミリ秒）
 * - CONFIG.syncCacheValidation.purgeDriftThresholdMs で上書き可
 * この閾値を超える行があれば cache 全体をパージする。
 */
const DEFAULT_SYNC_CACHE_PURGE_DRIFT_THRESHOLD_MS = 86400000;

// ============================================
// API通信
// ============================================
/** APIリクエストデフォルトタイムアウト（ミリ秒） */
const API_TIMEOUT_MS = 20000;

// ============================================
// UI関連タイミング
// ============================================
/** トースト表示時間（ミリ秒） */
const TOAST_DURATION_MS = 2400;

/** 自動保存ステータス表示時間（ミリ秒） */
const AUTO_SAVE_STATUS_DISPLAY_MS = 2000;

/** 日付カラー自動保存デバウンス（ミリ秒） */
const EVENT_COLOR_SAVE_DEBOUNCE_MS = 800;

/** 保存ボタン再有効化遅延（ミリ秒） */
const SAVE_BUTTON_REENABLE_DELAY_MS = 1000;

/** イベント同期再開遅延（ミリ秒） */
const EVENT_SYNC_RESUME_DELAY_MS = 5000;

// ============================================
// 時刻選択範囲
// ============================================
/** 時刻選択開始（分） - 07:00 */
const TIME_RANGE_START_MIN = 7 * 60;

/** 時刻選択終了（分） - 22:00 */
const TIME_RANGE_END_MIN = 22 * 60;

// ============================================
// 夜間モード判定
// ============================================
/** 夜間モード開始時刻（時） */
const NIGHT_MODE_START_HOUR = 22;

/** 夜間モード終了時刻（時） */
const NIGHT_MODE_END_HOUR = 7;

`

### js/constants/ui.js

```javascript
/**
 * js/constants/ui.js - UI関連定数 (SSOT)
 *
 * ステータス、CSSクラス、レイアウト関連の定数を一元管理する。
 *
 * @see SSOT_GUIDE.md
 */

// ============================================
// ステータス関連CSSクラス
// ============================================
/**
 * 行ステータスに対応するCSSクラス一覧
 * @type {string[]}
 */
const ROW_STATUS_CLASSES = Object.freeze([
  'st-here',      // 在席
  'st-out',       // 外出
  'st-meeting',   // 会議
  'st-remote',    // 在宅勤務
  'st-trip',      // 出張
  'st-training',  // 研修
  'st-health',    // 健康診断
  'st-coadoc',    // ドック
  'st-home',      // 帰宅
  'st-off'        // 休み
]);

/**
 * ステータス値からCSSクラスへのマッピング
 * @type {Map<string, string>}
 */
const STATUS_CLASS_MAPPING = Object.freeze(new Map([
  ['在席', 'st-here'],
  ['外出', 'st-out'],
  ['会議', 'st-meeting'],
  ['在宅勤務', 'st-remote'],
  ['出張', 'st-trip'],
  ['研修', 'st-training'],
  ['健康診断', 'st-health'],
  ['ドック', 'st-coadoc'],
  ['帰宅', 'st-home'],
  ['休み', 'st-off']
]));

// ============================================
// レイアウト関連
// ============================================
/** パネル最小幅（px） */
const PANEL_MIN_PX = 760;

/** パネル間ギャップ（px） */
const GAP_PX = 20;

/** 最大カラム数 */
const MAX_COLS = 3;

/** カード表示強制ブレークポイント（px） */
const CARD_BREAKPOINT_PX = 760;

// ============================================
// お知らせ関連
// ============================================
/** お知らせ最大件数 */
const MAX_NOTICE_ITEMS = 100;

// ============================================
// イベントカラー関連
// ============================================
/**
 * パレットキー一覧
 * @type {string[]}
 */
const PALETTE_KEYS = Object.freeze([
  'none',
  'saturday',
  'sunday',
  'holiday',
  'amber',
  'mint',
  'lavender',
  'slate'
]);

/**
 * イベントカラーからパレットキーへの変換マップ
 * @type {Object<string, string>}
 */
const EVENT_COLOR_TO_PALETTE_MAP = Object.freeze({
  amber: 'amber',
  blue: 'saturday',
  green: 'mint',
  purple: 'lavender',
  teal: 'mint',
  sunday: 'sunday',
  holiday: 'holiday',
  slate: 'slate',
  pink: 'sunday',
  gray: 'slate',
  grey: 'slate',
  none: 'none',
  saturday: 'saturday'
});

/**
 * レガシーカラーキーの正規化マッピング
 * @type {Object<string, string>}
 */
const EVENT_COLOR_LEGACY_FALLBACKS = Object.freeze({
  gray: 'slate',
  grey: 'slate',
  teal: 'green',
  pink: 'sunday'
});

/**
 * トランスポート用カラーキーのフォールバック
 * @type {Object<string, string>}
 */
const EVENT_COLOR_TRANSPORT_FALLBACKS = Object.freeze({
  slate: 'gray',
  green: 'teal'
});

// ============================================
// 入力バリデーション
// ============================================
/** ID形式の正規表現 */
const ID_RE = /^[0-9A-Za-z_-]+$/;

// ============================================
// UI 文言 (SSOT)
// ============================================
/** ヘッダータイトルの接尾辞 */
const TITLE_SUFFIX = "在籍確認表";
/** ヘッダータイトルの区切り文字 */
const TITLE_SEPARATOR = "　";

`

### js/constants/defaults.js

```javascript
/**
 * js/constants/defaults.js - デフォルト値定数 (SSOT)
 *
 * 初期値・フォールバック値を一元管理する。
 *
 * @see SSOT_GUIDE.md
 */

// ============================================
// 勤務時間デフォルト選択肢
// ============================================
/**
 * デフォルトの勤務時間選択肢
 * @type {string[]}
 */
const DEFAULT_BUSINESS_HOURS = Object.freeze([
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
  "12:00-20:30",
]);

// ============================================
// デフォルトメニュー設定
// ============================================
/**
 * デフォルトのステータス設定
 * @type {Array<{value: string, class: string, requireTime?: boolean, clearOnSet?: boolean}>}
 */
const DEFAULT_STATUSES = Object.freeze([
  { value: "在席", class: "st-here", clearOnSet: true },
  { value: "外出", requireTime: true, class: "st-out" },
  { value: "在宅勤務", class: "st-remote", clearOnSet: true },
  { value: "出張", requireTime: true, class: "st-trip" },
  { value: "研修", requireTime: true, class: "st-training" },
  { value: "健康診断", requireTime: true, class: "st-health" },
  { value: "ドック", requireTime: true, class: "st-coadoc" },
  { value: "帰宅", class: "st-home" },
  { value: "休み", class: "st-off", clearOnSet: true }
]);

/**
 * デフォルトの備考選択肢
 * @type {string[]}
 */
const DEFAULT_NOTE_OPTIONS = Object.freeze([
  "直出",
  "直帰",
  "直出・直帰"
]);

/**
 * デフォルトの明日の予定選択肢
 * @type {string[]}
 */
const DEFAULT_TOMORROW_PLAN_OPTIONS = Object.freeze([
  "出勤",
  "直行",
  "在宅勤務",
  "出張・会議",
  "AM休",
  "PM休",
  "休み",
  "健診・ドック"
]);

// ============================================
// API関連デフォルト
// ============================================
/**
 * デフォルトのWorkerエンドポイント（フォールバック用）
 * @type {string}
 */
const DEFAULT_WORKER_ENDPOINT = "https://whereabouts.taka-hiyo.workers.dev";

`

### js/constants/column-definitions.js

```javascript
/**
 * js/constants/column-definitions.js - カラム定義マスター (SSOT)
 *
 * 全拠点で使用可能なカラムのマスター定義。
 * 各カラムの表示ラベル、属性、制約を一元管理する。
 *
 * @see SSOT_GUIDE.md
 */

/**
 * カラム定義の一覧
 * @type {ReadonlyArray<Object>}
 */
const COLUMN_DEFINITIONS = Object.freeze([
  {
    key: 'name',
    label: '氏名',
    dbField: 'name',
    type: 'text',
    required: true,
    tableClass: 'name',
    dataLabel: '氏名',
    defaultWidth: 110,
    popupEligible: false,
    cardEligible: true,
    description: 'メンバーの氏名'
  },
  {
    key: 'status',
    label: 'ステータス',
    dbField: 'status',
    type: 'select',
    required: true,
    tableClass: 'status',
    dataLabel: 'ステータス',
    defaultWidth: 134,
    popupEligible: false,
    cardEligible: true,
    description: '現在の在席状況'
  },
  {
    key: 'time',
    label: '戻り時間',
    dbField: 'time',
    type: 'time-select',
    required: false,
    tableClass: 'time',
    dataLabel: '戻り時間',
    defaultWidth: 85,
    popupEligible: false,
    cardEligible: true,
    description: '外出時の帰着予定時刻'
  },
  {
    key: 'workHours',
    label: '業務時間',
    dbField: 'work_hours',
    type: 'candidate',
    required: false,
    tableClass: 'work',
    dataLabel: '業務時間',
    defaultWidth: 107,
    popupEligible: false,
    cardEligible: false,
    description: '当日の勤務シフト時間'
  },
  {
    key: 'tomorrowPlan',
    label: '明日の予定',
    dbField: 'tomorrow_plan',
    type: 'select',
    required: false,
    tableClass: 'tomorrow-plan',
    dataLabel: '明日の予定',
    defaultWidth: 134,
    popupEligible: false,
    cardEligible: false,
    description: '翌営業日の予定'
  },
  {
    key: 'note',
    label: '備考',
    dbField: 'note',
    type: 'candidate',
    required: false,
    tableClass: 'note',
    dataLabel: '備考',
    defaultWidth: 87,
    popupEligible: false,
    cardEligible: true,
    description: '自由記述の補足情報'
  },
  {
    key: 'ext',
    label: '内線',
    dbField: 'ext',
    type: 'display',
    required: false,
    tableClass: 'ext',
    dataLabel: '内線',
    defaultWidth: 70,
    popupEligible: true,
    cardEligible: true,
    description: '社内内線番号'
  },
  {
    key: 'mobile',
    label: '携帯',
    dbField: 'mobile',
    type: 'display',
    required: false,
    tableClass: 'mobile',
    dataLabel: '携帯',
    defaultWidth: 120,
    popupEligible: true,
    cardEligible: true,
    description: '携帯電話番号（通常はポップアップのみ）'
  },
  {
    key: 'email',
    label: 'メール',
    dbField: 'email',
    type: 'display',
    required: false,
    tableClass: 'email',
    dataLabel: 'メール',
    defaultWidth: 200,
    popupEligible: true,
    cardEligible: true,
    description: 'メールアドレス（通常はポップアップのみ）'
  }
]);

/**
 * キーからカラム定義を取得する
 * 拠点独自のカスタムカラム定義(OFFICE_COLUMN_CONFIG.customColumns)があればそれを優先し、
 * なければシステムデフォルト(COLUMN_DEFINITIONS)を返す。
 * @param {string} key - カラムキー
 * @returns {Object|null}
 */
function getColumnDefinition(key) {
  // 1. 拠点カスタムカラムの検索
  if (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && Array.isArray(OFFICE_COLUMN_CONFIG.customColumns)) {
    const customDef = OFFICE_COLUMN_CONFIG.customColumns.find(d => d.key === key);
    if (customDef) return customDef;
  }
  // 2. システム標準カラムの検索
  return COLUMN_DEFINITIONS.find(d => d.key === key) || null;
}

`

### js/constants/messages.js

```javascript
/**
 * js/constants/messages.js - UI 文言・エラーメッセージ定数 (SSOT)
 */

const AUTH_MESSAGES = Object.freeze({
  ERROR: {
    EMAIL_ALREADY_IN_USE: "このメールアドレスは既に登録されています",
    WEAK_PASSWORD: "パスワードが短すぎます",
    INVALID_PASSWORD_FORMAT: "パスワードは大小英字、数字、記号の内2種類以上を含む12文字以上で入力してください",
    INVALID_EMAIL: "正しいメールアドレスを入力してください",
    SYSTEM_ERROR: "システムエラーが発生しました",
    NOT_FOUND: "拠点名またはパスワードが正しくありません",
    UNAUTHORIZED: "ログインに失敗しました。認証情報を確認してください",
    CONFIG_INCOMPLETE: "Firebaseの設定（API Key）が未完了です。js/firebase-config.js を確認してください。",
    AUTH_FAILED: "ログインに失敗しました。IDまたはパスワードが正しくありません。",
    SESSION_LOCKED: "別のセッションがアクティブです。再ログインするには一度ログアウトしてください。",
  },
  INFO: {
    VERIFY_EMAIL_SENT: "確認メールを送信しました",
    CREATE_OFFICE_SUCCESS: "ユーザー登録が完了しました！拠点の基本設定を行ってください",
  },
  UI: {
    BTN_REGISTER: "登録",
    BTN_DONE: "完了してログイン画面へ",
    PASSWORD_REQUIREMENT: "大小英字、数字、記号の内2種類以上を含む12文字以上",
  }
});

`

### js/constants/index.js

```javascript
/**
 * js/constants/index.js - 定数バレルファイル (SSOT)
 *
 * 本ファイルはすべての定数モジュールを再エクスポートする。
 * 利用側は `import { ... } from './constants/index.js'` で一括インポート可能。
 *
 * 構成:
 * - storage.js: ストレージ関連キー
 * - dom.js: DOM ID・セレクタ
 * - timing.js: タイミング関連定数
 * - ui.js: UI関連定数（ステータス、カラー等）
 *
 * @see SSOT_GUIDE.md
 */

// 各定数モジュールを読み込み順に列挙
// ※ ES Modules未使用のため、HTML側でscriptタグ順に読み込む
// ※ 将来的にES Modules化する際はここで export * from を使用

// 現在はグローバルスコープで動作するため、このファイルは
// ドキュメント用のインデックスとして機能する

`

### js/globals.js

```javascript
/**
 * js/globals.js - グローバル変数・DOM要素・状態管理
 *
 * 本ファイルはアプリケーション全体で共有される状態とDOM参照を管理する。
 * 定数は js/constants/ に集約されているため、本ファイルでは定義しない。
 *
 * 依存: js/config.js, js/constants/*.js
 * 参照元: 全JSファイル
 *
 * @see CORE_PRINCIPLES.md
 * @see SSOT_GUIDE.md
 */

/* ===== 接続設定 ===== */
/* config.js で CONFIG を定義 */
/* セッションキーは constants/storage.js で定義 */

/* 要素 */
const board = document.getElementById('board'), toastEl = document.getElementById('toast'), diag = document.getElementById('diag');
const loginEl = document.getElementById('login'), loginMsg = document.getElementById('loginMsg'), pwInput = document.getElementById('authPw'), officeSel = document.getElementById('authEmail'), btnLogin = document.getElementById('btnAuthLogin');
const menuEl = document.getElementById('groupMenu'), menuList = document.getElementById('groupMenuList'), menuTitle = document.getElementById('groupMenuTitle'), titleBtn = document.getElementById('titleBtn');
const noticesBtn = document.getElementById('noticesBtn'), adminBtn = document.getElementById('adminBtn'), logoutBtn = document.getElementById('logoutBtn'), adminModal = document.getElementById('adminModal'), adminClose = document.getElementById('adminClose');
const toolsBtn = document.getElementById('toolsBtn'), toolsModal = document.getElementById('toolsModal'), toolsModalClose = document.getElementById('toolsModalClose');
const eventBtn = document.getElementById('eventBtn'), eventModal = document.getElementById('eventModal'), eventClose = document.getElementById('eventClose');
const qrBtn = document.getElementById('qrBtn'), qrModal = document.getElementById('qrModal'), qrModalClose = document.getElementById('qrModalClose');
const vacationRadioList = document.getElementById('vacationRadioList');
const eventGanttWrap = document.getElementById('eventGanttWrap');
const eventGantt = document.getElementById('eventGantt');
const eventGroupJumps = document.getElementById('eventGroupJumps');
const eventColorManualHint = document.getElementById('eventColorManualHint');
const eventStartInput = document.getElementById('eventStart');
const eventEndInput = document.getElementById('eventEnd');
const eventBitsInput = document.getElementById('eventBits');
const btnEventPrint = document.getElementById('btnEventPrint');
const btnEventSave = document.getElementById('btnEventSave');
const btnExport = document.getElementById('btnExport'), csvFile = document.getElementById('csvFile'), btnImport = document.getElementById('btnImport');
const renameOfficeName = document.getElementById('renameOfficeName'), btnRenameOffice = document.getElementById('btnRenameOffice');
const setPw = document.getElementById('setPw'), setAdminPw = document.getElementById('setAdminPw'), btnSetPw = document.getElementById('btnSetPw');
const memberTableBody = document.getElementById('memberTableBody'), btnMemberSave = document.getElementById('btnMemberSave'), btnMemberReload = document.getElementById('btnMemberReload');
const memberEditForm = document.getElementById('memberEditForm');
const memberEditTop = document.getElementById('memberEditTop');
const memberEditName = document.getElementById('memberEditName'), memberEditExt = document.getElementById('memberEditExt'), memberEditMobile = document.getElementById('memberEditMobile'), memberEditEmail = document.getElementById('memberEditEmail'), memberEditGroup = document.getElementById('memberEditGroup');
const memberGroupOptions = document.getElementById('memberGroupOptions'), memberEditId = document.getElementById('memberEditId'), memberEditModeLabel = document.getElementById('memberEditModeLabel');
const memberEditReset = document.getElementById('memberEditReset'), memberFilterInput = document.getElementById('memberFilterInput'), btnMemberFilterClear = document.getElementById('btnMemberFilterClear');
const adminOfficeRow = document.getElementById('adminOfficeRow'), adminOfficeSel = document.getElementById('adminOfficeSel');
const manualBtn = document.getElementById('manualBtn'), manualModal = document.getElementById('manualModal'), manualClose = document.getElementById('manualClose'), manualUser = document.getElementById('manualUser'), manualAdmin = document.getElementById('manualAdmin');
const nameFilter = document.getElementById('nameFilter'), statusFilter = document.getElementById('statusFilter');
const noticesEditor = document.getElementById('noticesEditor'), btnAddNotice = document.getElementById('btnAddNotice'), btnLoadNotices = document.getElementById('btnLoadNotices'), btnSaveNotices = document.getElementById('btnSaveNotices');
const toolsEditor = document.getElementById('toolsEditor'), btnAddTool = document.getElementById('btnAddTool'), btnLoadTools = document.getElementById('btnLoadTools'), btnSaveTools = document.getElementById('btnSaveTools');
const noticeModal = document.getElementById('noticeModal'), noticeModalTitle = document.getElementById('noticeModalTitle'), noticeModalBody = document.getElementById('noticeModalBody'), noticeModalClose = document.getElementById('noticeModalClose');
const toolsList = document.getElementById('toolsList');
const vacationTitleInput = document.getElementById('vacationTitle'), vacationStartInput = document.getElementById('vacationStart'), vacationEndInput = document.getElementById('vacationEnd');
const vacationNoticeSelect = document.getElementById('vacationNotice'), vacationOfficeSelect = document.getElementById('vacationOffice'), vacationMembersBitsInput = document.getElementById('vacationMembersBits');
const btnCreateNoticeFromEvent = document.getElementById('btnCreateNoticeFromEvent');
const vacationIdInput = document.getElementById('vacationId'), vacationListBody = document.getElementById('vacationListBody');
const vacationTypeText = document.getElementById('vacationTypeText');
const vacationColorSelect = document.getElementById('vacationColor');
const btnVacationSave = document.getElementById('btnVacationSave'), btnVacationDelete = document.getElementById('btnVacationDelete'), btnVacationReload = document.getElementById('btnVacationReload'), btnVacationClear = document.getElementById('btnVacationClear');

/* 状態 */
let GROUPS = [], CONFIG_UPDATED = 0, MENUS = null, STATUSES = [], requiresTimeSet = new Set(), clearOnSet = new Set(), statusClassMap = new Map();
let tokenRenewTimer = null, ro = null, remotePullTimer = null, configWatchTimer = null, eventSyncTimer = null;
let resumeRemoteSyncOnVisible = false, resumeConfigWatchOnVisible = false, resumeEventSyncOnVisible = false;
/* storeKeyBase は constants/storage.js で STORE_KEY_BASE として定義 */
let storeKeyBase = STORE_KEY_BASE;
const PENDING_ROWS = new Set();
let adminSelectedOfficeId = '';
let currentEventIds = [];
let currentEventOfficeId = '';
let cachedEvents = { officeId: '', list: [] };
let appliedEventIds = [];
let appliedEventOfficeId = '';
let appliedEventTitles = [];
let eventGanttController = null;
let eventSelectedId = '';
let selectedEventIds = [];
let eventDateColorState = { officeId: '', map: new Map(), lastSaved: new Map(), autoSaveTimer: null, saveInFlight: false, queued: false, statusEl: null, loaded: false };
const eventSyncBase = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.remotePollMs))
  ? CONFIG.remotePollMs
  : 10000;
const EVENT_SYNC_INTERVAL_MS = (typeof CONFIG !== 'undefined' && CONFIG.eventSyncIntervalMs)
  ? CONFIG.eventSyncIntervalMs
  : Math.max(eventSyncBase, 15000);

/* 認証状態 */
/* --- 状態 --- */
let CURRENT_OFFICE_ID = '';
let CURRENT_OFFICE_NAME = '';
let CURRENT_ROLE = 'user'; // 'user', 'officeAdmin', 'superAdmin'
let SESSION_TOKEN = localStorage.getItem(SESSION_KEY) || '';
/** 拠点カラム設定 (Phase 3) */
let OFFICE_COLUMN_CONFIG = null;
try {
  // 自動ログイン等のため、拠点IDが判明している場合はそこから読み込む
  const storedOffice = localStorage.getItem(LOCAL_OFFICE_KEY);
  const savedConfig = localStorage.getItem(getColumnConfigKey(storedOffice));
  if (savedConfig) OFFICE_COLUMN_CONFIG = JSON.parse(savedConfig);
} catch (e) {
  console.error("Failed to load column config from storage:", e);
}

// 拠点名の初期化 (localStorage から復元)
if (!CURRENT_OFFICE_NAME) {
  CURRENT_OFFICE_NAME = localStorage.getItem(LOCAL_OFFICE_NAME_KEY) || '';
}

/**
 * ヘッダーのタイトルボタン表示を更新する (SSOT)
 * @param {string} [officeName] 
 */
function updateTitleBtn(officeName) {
  if (officeName) CURRENT_OFFICE_NAME = officeName;
  if (!titleBtn) return;

  if (CURRENT_OFFICE_NAME) {
    titleBtn.textContent = `${CURRENT_OFFICE_NAME}${TITLE_SEPARATOR}${TITLE_SUFFIX}`;
  } else {
    titleBtn.textContent = TITLE_SUFFIX;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    resumeRemoteSyncOnVisible = remotePullTimer != null;
    resumeConfigWatchOnVisible = configWatchTimer != null;
    resumeEventSyncOnVisible = eventSyncTimer != null;
    clearInterval(remotePullTimer);
    clearInterval(configWatchTimer);
    clearInterval(eventSyncTimer);
    remotePullTimer = null;
    configWatchTimer = null;
    eventSyncTimer = null;
  } else {
    if (resumeRemoteSyncOnVisible && SESSION_TOKEN) {
      if (typeof startRemoteSync === 'function') startRemoteSync(true);
    }
    if (resumeConfigWatchOnVisible && SESSION_TOKEN) {
      startConfigWatch();
    }
    if (resumeEventSyncOnVisible && SESSION_TOKEN) {
      startEventSync(true);
    }
    resumeRemoteSyncOnVisible = false;
    resumeConfigWatchOnVisible = false;
    resumeEventSyncOnVisible = false;
  }
});
function isOfficeAdmin() { return CURRENT_ROLE === 'officeAdmin' || CURRENT_ROLE === 'superAdmin'; }

function getRosterOrdering() {
  if (!Array.isArray(GROUPS)) return [];
  return GROUPS.map(g => ({
    title: g.title || '',
    members: Array.isArray(g.members) ? g.members : []
  }));
}

/* イベントの表示 */
function summarizeVacationMembers(bitsStr) {
  if (!bitsStr || typeof getRosterOrdering !== 'function') return '';
  const members = getRosterOrdering().flatMap(g => g.members || []);
  if (!members.length) return '';
  const onSet = new Set();
  bitsStr.split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
    const bits = part.includes(':') ? (part.split(':')[1] || '') : part;
    for (let i = 0; i < bits.length && i < members.length; i++) {
      if (bits[i] === '1') onSet.add(i);
    }
  });
  const names = members.map(m => m.name || '').filter((_, idx) => onSet.has(idx));
  if (names.length === 0) return '';
  if (names.length <= 3) return names.join('、');
  return `${names.slice(0, 3).join('、')} ほか${names.length - 3}名`;
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

function renderVacationRadioMessage(message) {
  // プルダウン形式の場合
  const dropdown = document.getElementById('eventSelectDropdown');
  if (dropdown) {
    dropdown.innerHTML = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = message;
    option.disabled = true;
    option.selected = true;
    dropdown.appendChild(option);
    dropdown.disabled = true;
    return;
  }

  // 旧形式（カードリスト）のフォールバック
  if (!vacationRadioList) return;
  vacationRadioList.style.display = 'block';
  vacationRadioList.textContent = '';
  const div = document.createElement('div');
  div.style.textAlign = 'center';
  div.style.padding = '20px';
  div.style.color = 'var(--color-text-muted)';
  div.textContent = message;
  vacationRadioList.appendChild(div);
}

// ★修正: CONFIG から設定を取得 (SSOT)
const EVENT_COLOR_LABELS = (typeof CONFIG !== 'undefined' && CONFIG.eventColorLabels) ? CONFIG.eventColorLabels : {};
const PALETTE_TO_EVENT_COLOR_MAP = (typeof CONFIG !== 'undefined' && CONFIG.paletteToEventColor) ? CONFIG.paletteToEventColor : {};
const EVENT_COLOR_KEYS = Object.keys(EVENT_COLOR_LABELS);

/* EVENT_COLOR_TO_PALETTE_MAP, PALETTE_KEYS は constants/ui.js で定義 */

/* EVENT_COLOR_LEGACY_FALLBACKS, EVENT_COLOR_TRANSPORT_FALLBACKS は constants/ui.js で定義 */

function getEventColorClass(color) {
  const key = (color || '').toString().trim().toLowerCase();
  if (!key) return '';
  return `event-color-${key}`;
}

function getEventColorClasses() {
  return EVENT_COLOR_KEYS.map(key => getEventColorClass(key)).filter(Boolean);
}

function normalizeEventDateKey(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeEventColorKeyClient(raw) {
  const key = (raw || '').toString().trim().toLowerCase();
  if (EVENT_COLOR_LEGACY_FALLBACKS[key]) return EVENT_COLOR_LEGACY_FALLBACKS[key];
  return EVENT_COLOR_KEYS.includes(key) ? key : '';
}

function toTransportEventColorKey(raw) {
  const normalizedEvent = normalizeEventColorKeyClient(raw);
  if (normalizedEvent) {
    return EVENT_COLOR_TRANSPORT_FALLBACKS[normalizedEvent] || normalizedEvent;
  }
  const paletteKey = normalizePaletteKey(raw);
  if (paletteKey) {
    const eventColor = paletteKeyToEventColor(paletteKey);
    const normalizedFromPalette = normalizeEventColorKeyClient(eventColor);
    if (normalizedFromPalette) {
      return EVENT_COLOR_TRANSPORT_FALLBACKS[normalizedFromPalette] || normalizedFromPalette;
    }
    return eventColor || paletteKey;
  }
  return '';
}

/* eventSelectionKey は constants/storage.js で定義 */

function loadSavedEventIds(officeId) {
  if (currentEventOfficeId === officeId && Array.isArray(currentEventIds)) return currentEventIds;
  let saved = [];
  try {
    const raw = localStorage.getItem(eventSelectionKey(officeId)) || '[]';
    const parsed = JSON.parse(raw);
    saved = Array.isArray(parsed) ? parsed.map(v => String(v)).filter(Boolean) : [];
  }
  catch { saved = []; }
  currentEventOfficeId = officeId || '';
  currentEventIds = saved;
  return currentEventIds;
}

function saveEventIds(officeId, ids) {
  const uniqIds = Array.from(new Set((ids || []).map(v => String(v).trim()).filter(Boolean)));
  currentEventIds = uniqIds;
  currentEventOfficeId = officeId || '';
  try { localStorage.setItem(eventSelectionKey(officeId), JSON.stringify(uniqIds)); }
  catch { }
}

function getEventTargetOfficeId() {
  return (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
}

function hasRelatedNotice(item) {
  return !!(item?.noticeTitle || item?.noticeId || item?.noticeKey || item?.note || item?.memo);
}

function ensureEventColorStatusEl() {
  if (eventDateColorState.statusEl) return eventDateColorState.statusEl;
  const el = document.createElement('div');
  el.className = 'vac-save-status';
  eventDateColorState.statusEl = el;
  const container = eventGanttWrap || eventGantt || document.getElementById('eventGanttWrap') || document.getElementById('eventGantt');
  if (container) { container.appendChild(el); }
  return el;
}

function renderEventColorStatus(type, message, actions) {
  const el = ensureEventColorStatusEl();
  el.textContent = '';
  el.dataset.state = type || '';
  if (!message) return;
  const msgSpan = document.createElement('span');
  msgSpan.className = 'vac-save-message';
  msgSpan.textContent = message;
  el.appendChild(msgSpan);
  if (type === 'saving') {
    const spinner = document.createElement('span');
    spinner.className = 'vac-save-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    el.prepend(spinner);
  }
  (actions || []).forEach(({ label, onClick, className }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = className || 'vac-save-action';
    btn.addEventListener('click', onClick);
    el.appendChild(btn);
  });
}

function updateEventColorManualHint(hasManualColor) {
  const hintEl = eventColorManualHint || document.getElementById('eventColorManualHint');
  if (!hintEl) return;
  const admin = isOfficeAdmin && typeof isOfficeAdmin === 'function' ? isOfficeAdmin() : false;
  if (!admin) {
    hintEl.style.display = 'none';
    hintEl.textContent = '';
    hintEl.title = '';
    return;
  }
  const targetOffice = getEventTargetOfficeId();
  const shouldShow = !!hasManualColor && !!targetOffice && eventDateColorState.officeId === targetOffice;
  if (shouldShow) {
    hintEl.style.display = 'inline-flex';
    hintEl.textContent = '🎨 手動色が適用されています（セルを右クリックでクリアできます）';
    hintEl.title = 'セルを右クリックすると手動色を個別にクリアできます。';
  } else {
    hintEl.style.display = 'none';
    hintEl.textContent = '';
    hintEl.title = '';
  }
}

function paletteKeyToEventColor(key) {
  const normalized = (key || '').toString().trim().toLowerCase();
  return PALETTE_TO_EVENT_COLOR_MAP[normalized] ?? '';
}

function paletteKeyFromEventColorKey(key) {
  const normalized = (key || '').toString().trim().toLowerCase();
  if (EVENT_COLOR_TO_PALETTE_MAP[normalized]) return EVENT_COLOR_TO_PALETTE_MAP[normalized];
  if (PALETTE_KEYS.includes(normalized)) return normalized;
  return '';
}

function normalizePaletteKey(raw) {
  const normalized = (raw || '').toString().trim().toLowerCase();
  return PALETTE_KEYS.includes(normalized) ? normalized : '';
}

function normalizeEventDateColorValue(raw) {
  const normalizedColor = normalizeEventColorKeyClient(raw);
  if (normalizedColor) return normalizedColor;
  return normalizePaletteKey(raw);
}

function applyEventDateColorsToController(colorMap) {
  if (!eventGanttController || typeof eventGanttController.applyDateColorMap !== 'function') return;
  try {
    eventGanttController.applyDateColorMap(colorMap || new Map());
  } catch (err) {
    console.error('applyDateColorMap error', err);
  }
}

function showEventColorSavingStatus() {
  renderEventColorStatus('saving', '日付カラーを保存しています…');
}

function showEventColorSavedStatus() {
  renderEventColorStatus('saved', '自動保存済み');
  setTimeout(() => {
    if (eventDateColorState.statusEl && eventDateColorState.statusEl.dataset.state === 'saved') {
      eventDateColorState.statusEl.textContent = '';
      eventDateColorState.statusEl.dataset.state = '';
    }
  }, 2000);
}

function rollbackEventDateColors() {
  const lastSaved = eventDateColorState.lastSaved instanceof Map ? eventDateColorState.lastSaved : new Map();
  eventDateColorState.map = new Map(lastSaved);
  applyManualEventColorsToGantt();
  applyEventDateColorsToController(eventDateColorState.map);
  toast('保存前の状態に戻しました', false);
}

function showEventColorErrorStatus() {
  const actions = [{
    label: '再試行',
    onClick: () => scheduleEventDateColorSave('retry'),
    className: 'vac-save-retry'
  }];
  if (eventDateColorState.lastSaved) {
    actions.push({
      label: 'ロールバック',
      onClick: rollbackEventDateColors,
      className: 'vac-save-rollback'
    });
  }
  renderEventColorStatus('error', '保存に失敗しました。再試行するかロールバックできます。', actions);
}

function resetEventDateColorState() {
  const statusEl = eventDateColorState.statusEl || null;
  eventDateColorState = { officeId: '', map: new Map(), lastSaved: new Map(), autoSaveTimer: null, saveInFlight: false, queued: false, statusEl, loaded: false };
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.dataset.state = '';
  }
  applyManualEventColorsToGantt();
  applyEventDateColorsToController(new Map());
}

function updateEventDateColorState(date, colorKey, officeId) {
  const targetOffice = officeId || getEventTargetOfficeId();
  const normalizedDate = normalizeEventDateKey(date);
  if (!targetOffice || !normalizedDate) return;
  if (colorKey === null) {
    const mapToClear = eventDateColorState.map instanceof Map ? eventDateColorState.map : new Map();
    mapToClear.delete(normalizedDate);
    eventDateColorState.map = mapToClear;
    applyManualEventColorsToGantt();
    applyEventDateColorsToController(mapToClear);
    scheduleEventDateColorSave();
    return;
  }
  const normalizedColor = normalizeEventDateColorValue(colorKey);
  const statusEl = eventDateColorState.statusEl || ensureEventColorStatusEl();
  if (eventDateColorState.autoSaveTimer) {
    clearTimeout(eventDateColorState.autoSaveTimer);
    eventDateColorState.autoSaveTimer = null;
  }
  if (eventDateColorState.officeId && eventDateColorState.officeId !== targetOffice) {
    eventDateColorState = { officeId: targetOffice, map: new Map(), lastSaved: new Map(), autoSaveTimer: null, saveInFlight: false, queued: false, statusEl, loaded: false };
  } else if (!eventDateColorState.officeId) {
    eventDateColorState = { ...eventDateColorState, officeId: targetOffice, statusEl };
  }
  const map = eventDateColorState.map instanceof Map ? eventDateColorState.map : new Map();
  if (!normalizedColor) {
    return;
  }
  map.set(normalizedDate, normalizedColor);
  eventDateColorState.map = map;
  eventDateColorState.loaded = true;
  applyManualEventColorsToGantt();
  applyEventDateColorsToController(map);
  scheduleEventDateColorSave();
}

function applyManualEventColorsToGantt() {
  const gantt = eventGantt || document.getElementById('eventGantt');
  const targetOffice = getEventTargetOfficeId();
  if (!gantt) return;
  const colorClasses = getEventColorClasses();
  const map = (eventDateColorState.officeId && eventDateColorState.officeId !== targetOffice) ? new Map() : (eventDateColorState.map || new Map());
  gantt.querySelectorAll('td.vac-cell').forEach(cell => {
    cell.classList.remove(...colorClasses);
    if (cell.title && cell.title.includes('手動')) {
      cell.removeAttribute('title');
    }
    delete cell.dataset.manualColor;
    delete cell.dataset.manualColorBound;
  });

  const applyColorToDayHeader = (cell) => {
    cell.classList.remove(...colorClasses);
    const date = normalizeEventDateKey(cell.dataset.date || '');
    const storedColorKey = map.get(date) || '';
    const paletteColor = paletteKeyFromEventColorKey(storedColorKey);
    const eventColorKey = normalizeEventColorKeyClient(storedColorKey) || paletteKeyToEventColor(paletteColor);
    if (eventColorKey) {
      const cls = getEventColorClass(eventColorKey);
      if (cls) cell.classList.add(cls);
      cell.dataset.manualColor = storedColorKey;
      const label = EVENT_COLOR_LABELS[eventColorKey] || '手動色';
      cell.title = `${label}（手動設定）: 右クリックでクリア`;
    } else {
      delete cell.dataset.manualColor;
      if (cell.title && cell.title.includes('手動')) {
        cell.removeAttribute('title');
      }
    }
  };
  gantt.querySelectorAll('.vac-day-header').forEach(applyColorToDayHeader);
  updateEventColorManualHint(map.size > 0);
}

function buildEventDateColorPayload() {
  const payload = {};
  (eventDateColorState.map || new Map()).forEach((color, date) => {
    const value = toTransportEventColorKey(color);
    if (date && value) { payload[date] = value; }
  });
  return payload;
}

function getManualEventColorForDate(date, officeId) {
  const normalized = normalizeEventDateKey(date);
  const targetOffice = officeId || appliedEventOfficeId || getEventTargetOfficeId();
  if (!normalized || !targetOffice) return '';
  if (eventDateColorState.officeId !== targetOffice) return '';
  return eventDateColorState.map.get(normalized) || '';
}

async function loadEventDateColors(officeId, options = {}) {
  const targetOfficeId = officeId || getEventTargetOfficeId();
  const opts = options || {};
  const silent = opts.silent === true;
  const forceReload = opts.force === true;
  if (!targetOfficeId || !SESSION_TOKEN) {
    resetEventDateColorState();
    return new Map();
  }
  const hasLoadedCurrentOffice = eventDateColorState.officeId === targetOfficeId && eventDateColorState.loaded;
  if (hasLoadedCurrentOffice && !forceReload) {
    applyManualEventColorsToGantt();
    return eventDateColorState.map || new Map();
  }
  const mapsAreEqual = (a, b) => {
    if (!(a instanceof Map) || !(b instanceof Map)) return false;
    if (a.size !== b.size) return false;
    for (const [key, val] of a.entries()) {
      if (!b.has(key) || b.get(key) !== val) return false;
    }
    return true;
  };
  try {
    const res = await apiPost({ action: 'getEventColorMap', token: SESSION_TOKEN, office: targetOfficeId, nocache: '1' });
    if (res?.error === 'unauthorized') {
      await logout();
      return new Map();
    }
    const map = new Map();
    const colors = (res && typeof res.colors === 'object') ? res.colors : {};
    Object.keys(colors || {}).forEach(date => {
      const normalizedDate = normalizeEventDateKey(date);
      if (!normalizedDate) return;
      const paletteKey = paletteKeyFromEventColorKey(colors[date]);
      const normalizedColor = paletteKey || normalizeEventDateColorValue(colors[date]);
      if (normalizedColor) { map.set(normalizedDate, normalizedColor); }
    });
    const shouldApply = !hasLoadedCurrentOffice || forceReload || !mapsAreEqual(eventDateColorState.map, map);
    eventDateColorState = {
      ...eventDateColorState,
      officeId: targetOfficeId,
      map,
      lastSaved: new Map(map),
      loaded: true
    };
    if (shouldApply) {
      applyManualEventColorsToGantt();
      applyEventDateColorsToController(map);
    }
    return map;
  } catch (err) {
    console.error('loadEventDateColors error', err);
    resetEventDateColorState();
    if (!silent) toast('日付カラーの読み込みに失敗しました', false);
    return new Map();
  }
}

async function flushEventDateColorSave() {
  if (eventDateColorState.saveInFlight) {
    eventDateColorState.queued = true;
    return;
  }
  const officeId = eventDateColorState.officeId || getEventTargetOfficeId();
  if (!officeId || !SESSION_TOKEN || !isOfficeAdmin()) return;
  eventDateColorState.saveInFlight = true;
  eventDateColorState.queued = false;
  showEventColorSavingStatus();
  try {
    const payload = buildEventDateColorPayload();
    const res = await apiPost({ action: 'setEventColorMap', token: SESSION_TOKEN, office: officeId, data: JSON.stringify({ colors: payload }) });
    if (res && res.ok !== false) {
      eventDateColorState.lastSaved = new Map(eventDateColorState.map || []);
      showEventColorSavedStatus();
      toast('日付カラーを保存しました');
    } else {
      throw new Error(res && res.error ? String(res.error) : 'save_failed');
    }
  } catch (err) {
    console.error('flushEventDateColorSave error', err);
    toast('日付カラーの保存に失敗しました', false);
    showEventColorErrorStatus();
  } finally {
    eventDateColorState.saveInFlight = false;
    if (eventDateColorState.queued) {
      eventDateColorState.queued = false;
      flushEventDateColorSave();
    }
  }
}

function scheduleEventDateColorSave() {
  if (!SESSION_TOKEN || !isOfficeAdmin()) return;
  if (eventDateColorState.autoSaveTimer) {
    clearTimeout(eventDateColorState.autoSaveTimer);
  }
  eventDateColorState.autoSaveTimer = setTimeout(() => {
    eventDateColorState.autoSaveTimer = null;
    flushEventDateColorSave();
  }, 800);
}

function refreshAppliedEventHighlights() {
  const officeId = appliedEventOfficeId || getEventTargetOfficeId();
  const sourceList = (cachedEvents.officeId === officeId && Array.isArray(cachedEvents.list)) ? cachedEvents.list : [];
  const idSet = new Set((appliedEventIds || []).map(id => String(id)));
  const visibleItems = sourceList.filter(item => {
    const id = String(item?.id || item?.vacationId || '');
    return idSet.has(id) && coerceVacationVisibleFlag(item?.visible);
  });
  applyEventHighlightForItems(visibleItems, undefined);
}

function renderVacationRadioList(list, options) {
  const dropdown = document.getElementById('eventSelectDropdown');
  const noticeBtn = document.getElementById('btnShowEventNotice');
  if (!dropdown) return;

  dropdown.innerHTML = '';
  const opts = options || {};
  const onSelectChange = typeof opts.onSelectChange === 'function' ? opts.onSelectChange : null;
  const onFocus = typeof opts.onFocus === 'function' ? opts.onFocus : null;
  const selectedIds = new Set((opts.selectedIds || []).map(v => String(v)));
  const syncSelectedIds = () => {
    selectedIds.clear();
    (selectedEventIds || []).forEach(v => selectedIds.add(String(v)));
  };

  if (!Array.isArray(list) || list.length === 0) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '登録されたイベントはありません';
    placeholder.disabled = true;
    dropdown.appendChild(placeholder);
    dropdown.disabled = true;
    if (noticeBtn) noticeBtn.style.display = 'none';
    return;
  }

  const officeId = list[0]?.office || CURRENT_OFFICE_ID || '';
  dropdown.disabled = false;

  // プレースホルダー
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'イベントを選択してください';
  dropdown.appendChild(placeholder);

  const itemMap = new Map();

  list.forEach((item, idx) => {
    const id = String(item.id || item.vacationId || idx);
    const option = document.createElement('option');
    option.value = id;
    const start = item.startDate || item.start || item.from || '';
    const end = item.endDate || item.end || item.to || '';
    const period = start || end ? ` (${start || ''}〜${end || ''})` : ' ';
    option.textContent = `${item.title || ''}${period}`;
    dropdown.appendChild(option);
    itemMap.set(id, item);
  });

  // 選択イベントを復元
  syncSelectedIds();
  const firstSelected = Array.from(selectedIds)[0];
  if (firstSelected) {
    dropdown.value = firstSelected;
  }

  // お知らせボタンの状態を更新
  function updateNoticeButton() {
    const currentId = dropdown.value;
    const currentItem = itemMap.get(currentId);
    if (currentItem && noticeBtn) {
      const hasNotice = hasRelatedNotice(currentItem);
      noticeBtn.style.display = hasNotice ? 'inline-block' : 'none';
      noticeBtn.disabled = !hasNotice;
    } else if (noticeBtn) {
      noticeBtn.style.display = 'none';
    }
  }
  updateNoticeButton();

  // プルダウン変更イベント
  dropdown.addEventListener('change', () => {
    const id = dropdown.value;
    if (!id) return;
    syncSelectedIds();
    selectedIds.clear();
    selectedIds.add(id);
    const arr = Array.from(selectedIds);
    selectedEventIds = arr;
    saveEventIds(officeId, arr);
    const item = itemMap.get(id) || null;
    updateNoticeButton();
    if (onSelectChange) onSelectChange(arr, item, id, true);
    if (onFocus) onFocus(item, id);
  });

  // お知らせボタンのクリックイベント
  if (noticeBtn) {
    const existingListeners = noticeBtn.cloneNode(true);
    noticeBtn.parentNode.replaceChild(existingListeners, noticeBtn);
    existingListeners.addEventListener('click', () => {
      const id = dropdown.value;
      const item = itemMap.get(id);
      if (item) {
        openRelatedNotice(item, { fromEventCalendar: true, openMode: 'modal' });
      }
    });
  }

  selectedEventIds = Array.from(selectedIds);

  // 初期フォーカス
  if (firstSelected) {
    const firstItem = itemMap.get(firstSelected);
    if (firstItem && onFocus) {
      onFocus(firstItem, firstSelected);
    }
  }
}

function updateEventCardStates() {
  // プルダウン形式では不要だが、互換性のため残す
  return;
}

function findNoticeFromCache(item) {
  const normalizeKeyFn = typeof normalizeNoticeKey === 'function'
    ? normalizeNoticeKey
    : (value) => { if (value == null) return ''; return String(value).replace(/\s+/g, ' ').trim().toLowerCase(); };

  const noticeId = item?.noticeId || item?.id || '';
  const noticeKey = item?.noticeKey || '';
  const noticeTitle = item?.noticeTitle || item?.title || '';
  const normalizedId = normalizeKeyFn(noticeId);
  const normalizedKey = normalizeKeyFn(noticeKey);
  const normalizedTitle = normalizeKeyFn(noticeTitle);
  const list = Array.isArray(window.CURRENT_NOTICES) ? window.CURRENT_NOTICES : [];

  let target = list.find(n => normalizedId && normalizeKeyFn(n?.id || n?.noticeId || n?.uid || '') === normalizedId) || null;
  if (!target) {
    target = list.find(n => normalizedKey && normalizeKeyFn(n?.noticeKey || n?.key || '') === normalizedKey) || null;
  }
  if (!target) {
    target = list.find(n => normalizedTitle && normalizeKeyFn(n?.title || '') === normalizedTitle) || null;
  }
  if (!target) return null;

  return {
    ...target,
    id: target?.id || target?.noticeId || target?.uid || '',
    noticeKey: target?.noticeKey || target?.key || '',
    title: target?.title || '',
    content: target?.content || ''
  };
}

function hideNoticeModal() {
  if (!noticeModal) return;
  noticeModal.classList.remove('show');
  noticeModal.setAttribute('aria-hidden', 'true');
}

function showNoticeModal(notice) {
  if (!noticeModal || !noticeModalTitle || !noticeModalBody) return false;
  hideNoticeModal();
  noticeModalTitle.textContent = notice?.title || '関連お知らせ';
  noticeModalBody.textContent = '';
  const content = document.createElement('div');
  content.className = 'notice-modal-content';
  const bodyText = notice?.content || '';
  if (bodyText) {
    if (typeof linkifyText === 'function') {
      content.innerHTML = linkifyText(bodyText).replace(/\n/g, '<br>');
    } else {
      content.textContent = bodyText;
    }
  } else {
    content.textContent = '本文が設定されていません';
  }
  noticeModalBody.appendChild(content);
  noticeModal.classList.add('show');
  noticeModal.setAttribute('aria-hidden', 'false');
  return true;
}

function openNoticeInNewWindow(notice) {
  try {
    const win = window.open('', '_blank', 'noopener');
    if (!win) return false;
    const title = notice?.title || '関連お知らせ';
    const contentStr = notice?.content || '';
    win.document.title = title;
    const wrapper = win.document.createElement('div');
    wrapper.style.fontFamily = 'sans-serif';
    wrapper.style.maxWidth = '720px';
    wrapper.style.margin = '24px auto';
    wrapper.style.padding = '12px';
    wrapper.style.lineHeight = '1.6';
    const heading = win.document.createElement('h1');
    heading.textContent = title;
    heading.style.fontSize = '20px';
    heading.style.marginBottom = '12px';
    const body = win.document.createElement('div');
    body.style.whiteSpace = 'pre-wrap';
    body.style.fontSize = '14px';
    body.textContent = contentStr || '本文が設定されていません';
    wrapper.appendChild(heading);
    wrapper.appendChild(body);
    win.document.body.appendChild(wrapper);
    return true;
  } catch (err) {
    console.error('openNoticeInNewWindow error', err);
    return false;
  }
}

function renderRelatedNoticePopup(notice, options = {}) {
  const opts = options || {};
  const mode = (opts.openMode || 'modal').toLowerCase();
  if (mode === 'window') {
    const opened = openNoticeInNewWindow(notice);
    if (opened) return true;
  }
  return showNoticeModal(notice);
}

function openRelatedNotice(item, options = {}) {
  const opts = options || {};
  const hasNotice = hasRelatedNotice(item);
  const fromEvent = opts.fromEventCalendar === true || opts.fromEvent === true;
  if (!hasNotice) {
    if (opts.toastOnMissing !== false) toast('関連するお知らせがありません', false);
    return false;
  }

  if (fromEvent) {
    const targetNotice = findNoticeFromCache(item);
    if (targetNotice) {
      return renderRelatedNoticePopup(targetNotice, opts);
    }
    if (opts.toastOnMissing !== false) toast('該当するお知らせが見つかりませんでした', false);
    return false;
  }
  const noticesArea = document.getElementById('noticesArea');
  if (noticesArea) {
    noticesArea.style.display = 'block';
    noticesArea.classList.remove('collapsed');
    noticesArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (noticesArea?.classList.contains('collapsed') && typeof toggleNoticesArea === 'function') {
    toggleNoticesArea();
  }

  const normalizeKeyFn = typeof normalizeNoticeKey === 'function'
    ? normalizeNoticeKey
    : (value) => {
      if (value == null) return '';
      return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
    };
  const noticesList = document.getElementById('noticesList');
  const noticeId = item?.noticeId || item?.id || '';
  const noticeKey = item?.noticeKey || '';
  const noticeTitle = item?.noticeTitle || item?.title || '';
  let targetEl = null;

  if (noticesList) {
    const items = Array.from(noticesList.querySelectorAll('.notice-item'));
    if (noticeId) {
      const normalizedId = normalizeKeyFn(noticeId);
      targetEl = items.find(el => normalizeKeyFn(el.dataset.noticeId) === normalizedId);
    }
    if (!targetEl && noticeKey) {
      const normalizedKey = normalizeKeyFn(noticeKey);
      targetEl = items.find(el => normalizeKeyFn(el.dataset.noticeKey || el.dataset.noticeId || '') === normalizedKey);
    }
    if (!targetEl && noticeTitle) {
      const normalizedTitle = normalizeKeyFn(noticeTitle);
      targetEl = items.find(el => {
        const titleText = el.querySelector('.notice-title')?.textContent || '';
        return normalizeKeyFn(titleText) === normalizedTitle;
      });
    }
  }

  if (targetEl) {
    targetEl.classList.add('expanded');
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }

  if (opts.toastOnMissing !== false) toast('該当するお知らせが見つかりませんでした', false);
  return false;
}

if (noticeModalClose) {
  noticeModalClose.addEventListener('click', hideNoticeModal);
}
if (noticeModal) {
  noticeModal.addEventListener('click', (e) => {
    if (e.target === noticeModal) hideNoticeModal();
  });
}

function getEventGanttController() {
  if (eventGanttController) return eventGanttController;
  if (typeof createVacationGantt !== 'function' || !eventGantt) {
    return null;
  }
  const handleDateColorSelect = (selection) => {
    if (!selection) return selection;
    const resolvedColor = selection.eventColor || paletteKeyToEventColor(selection.paletteKey) || selection.paletteKey;
    const colorKey = normalizeEventDateColorValue(resolvedColor);
    updateEventDateColorState(selection.date || '', colorKey || selection.paletteKey || '', getEventTargetOfficeId());
    return selection;
  };
  eventGanttController = createVacationGantt({
    rootEl: eventGantt,
    startInput: eventStartInput,
    endInput: eventEndInput,
    bitsInput: eventBitsInput,
    autoBind: true,
    autoInit: false,
    groupJumpContainer: eventGroupJumps,
    scrollContainer: eventGantt,
    groupJumpMode: 'select',
    saveMode: 'event-auto',
    onDateColorSelect: handleDateColorSelect
  });
  if (eventGanttController && typeof eventGanttController.init === 'function') {
    eventGanttController.init();
  }
  applyManualEventColorsToGantt();
  applyEventDateColorsToController(eventDateColorState.map || new Map());
  loadEventDateColors(getEventTargetOfficeId()).catch(err => console.error('initial loadEventDateColors failed', err));
  return eventGanttController;
}

function updateEventDetail(item, officeId) {
  const ctrl = getEventGanttController();
  if (!item) {
    eventSelectedId = '';
    if (ctrl) {
      ctrl.setRangeAndBits('', '', '');
      ctrl.applyBitsToCells();
    }
    return;
  }
  const start = item.startDate || item.start || item.from || '';
  const end = item.endDate || item.end || item.to || '';
  eventSelectedId = String(item.id || item.vacationId || '');
  if (ctrl) {
    ctrl.setRangeAndBits(start, end, item.membersBits || item.bits || '');
    ctrl.applyBitsToCells();
  }
}

function handleEventSelection(itemOrId) {
  const officeId = (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
  const item = typeof itemOrId === 'object' && itemOrId ? itemOrId : findCachedEvent(officeId, itemOrId);
  updateEventDetail(item || null, officeId);
}

function updateEventButtonVisibility(officeId, list) {
  if (!eventBtn) return;
  const loggedIn = !!SESSION_TOKEN;
  const targetOfficeId = officeId || CURRENT_OFFICE_ID || '';
  let sourceList = null;
  if (Array.isArray(list)) {
    sourceList = list;
  } else if (cachedEvents.officeId === targetOfficeId) {
    sourceList = cachedEvents.list;
  }
  const hasVisible = loggedIn && Array.isArray(sourceList)
    && sourceList.some(item => coerceVacationVisibleFlag(item?.visible) && (!targetOfficeId || String(item.office || targetOfficeId) === targetOfficeId));
  eventBtn.style.display = hasVisible ? 'inline-block' : 'none';
}

async function refreshEventDataSilent(officeId) {
  const targetOfficeId = officeId || getEventTargetOfficeId();
  if (!SESSION_TOKEN || !targetOfficeId) return [];
  try {
    const res = await apiPost({ action: 'getVacation', token: SESSION_TOKEN, office: targetOfficeId, nocache: '1' });
    if (res?.error === 'unauthorized') {
      await logout();
      return [];
    }
    const list = Array.isArray(res?.vacations) ? res.vacations : (Array.isArray(res?.items) ? res.items : []);
    const prevList = (cachedEvents.officeId === targetOfficeId && Array.isArray(cachedEvents.list)) ? cachedEvents.list : [];
    const normalizedList = list.map(item => {
      const idStr = String(item?.id || item?.vacationId || '');
      const prev = prevList.find(v => String(v?.id || v?.vacationId || '') === idStr);
      const hasIsVacation = item && Object.prototype.hasOwnProperty.call(item, 'isVacation');
      const fallbackHasFlag = prev && Object.prototype.hasOwnProperty.call(prev, 'isVacation');
      const isVacation = hasIsVacation ? item.isVacation : (fallbackHasFlag ? prev.isVacation : undefined);
      return {
        ...item,
        office: item?.office || targetOfficeId,
        visible: coerceVacationVisibleFlag(item?.visible),
        isVacation,
        color: item?.color || 'amber'
      };
    });
    const filteredList = (isOfficeAdmin() ? normalizedList : normalizedList.filter(item => item.visible === true));
    cachedEvents = { officeId: targetOfficeId, list: filteredList };
    const savedIds = loadSavedEventIds(targetOfficeId);
    if (Array.isArray(savedIds) && savedIds.length) {
      selectedEventIds = savedIds;
    }
    const visibleItems = filteredList.filter(item => item.visible === true);
    if (eventModal && eventModal.classList.contains('show')) {
      renderVacationRadioList(filteredList, {
        selectedIds: selectedEventIds,
        onSelectChange: (ids) => {
          selectedEventIds = ids;
          saveEventIds(targetOfficeId, ids);
        },
        // ▼ 修正: 自動更新時は、詳細データの再読み込み（上書き）を行わないようにするため null を指定
        onFocus: null
      });
    }
    updateEventButtonVisibility(targetOfficeId, normalizedList);
    const firstSelected = selectedEventIds?.[0] || '';
    if (firstSelected) {
      const selectedItem = findCachedEvent(targetOfficeId, firstSelected);
      // ▼ 修正: 編集中（未保存）の内容が上書きされて消えるのを防ぐためコメントアウト
      /* if (selectedItem) updateEventDetail(selectedItem, targetOfficeId);
      */
    }
    await applyEventDisplay(selectedEventIds && selectedEventIds.length ? selectedEventIds : visibleItems);
    return filteredList;
  } catch (err) {
    console.error('refreshEventDataSilent error', err);
    return [];
  }
}

async function loadEvents(officeId, showToastOnSuccess = false, options = {}) {
  const opts = options || {};
  const targetOfficeId = officeId || CURRENT_OFFICE_ID || '';
  renderVacationRadioMessage('読み込み中...');
  if (!SESSION_TOKEN || !targetOfficeId) {
    cachedEvents = { officeId: '', list: [] };
    resetEventDateColorState();
    renderVacationRadioMessage('拠点にログインすると表示できます');
    updateEventDetail(null, targetOfficeId);
    updateEventButtonVisibility(targetOfficeId, []);
    selectedEventIds = [];
    updateEventLegend([]);
    return [];
  }
  try {
    const res = await apiPost({ action: 'getVacation', token: SESSION_TOKEN, office: targetOfficeId, nocache: '1' });
    if (res?.error === 'unauthorized') {
      if (typeof logout === 'function') { await logout(); }
      cachedEvents = { officeId: '', list: [] };
      resetEventDateColorState();
      updateEventDetail(null, targetOfficeId);
      updateEventButtonVisibility(targetOfficeId, []);
      return [];
    }
    const list = Array.isArray(res?.vacations) ? res.vacations : (Array.isArray(res?.items) ? res.items : []);
    const prevList = (cachedEvents.officeId === targetOfficeId && Array.isArray(cachedEvents.list)) ? cachedEvents.list : [];
    const normalizedList = list.map(item => {
      const idStr = String(item?.id || item?.vacationId || '');
      const prev = prevList.find(v => String(v?.id || v?.vacationId || '') === idStr);
      const hasIsVacation = item && Object.prototype.hasOwnProperty.call(item, 'isVacation');
      const fallbackHasFlag = prev && Object.prototype.hasOwnProperty.call(prev, 'isVacation');
      const isVacation = hasIsVacation ? item.isVacation : (fallbackHasFlag ? prev.isVacation : undefined);
      return {
        ...item,
        office: item?.office || targetOfficeId,
        visible: coerceVacationVisibleFlag(item?.visible),
        isVacation,
        color: item?.color || 'amber'
      };
    });
    const filteredList = (isOfficeAdmin() && opts.visibleOnly !== true)
      ? normalizedList
      : normalizedList.filter(item => item.visible === true);
    await loadEventDateColors(targetOfficeId);
    const emptyMessage = filteredList.length === 0 && normalizedList.length > 0
      ? '現在表示中のイベントはありません。管理者が「表示」に設定するとここに表示されます。'
      : '登録されたイベントはありません';
    const savedIds = loadSavedEventIds(targetOfficeId);
    selectedEventIds = savedIds;
    cachedEvents = { officeId: targetOfficeId, list: filteredList };
    const visibleItems = filteredList.filter(item => item.visible === true);
    renderVacationRadioList(filteredList, {
      selectedIds: savedIds,
      emptyMessage,
      onSelectChange: (ids) => {
        selectedEventIds = ids;
        saveEventIds(targetOfficeId, ids);
      },
      onFocus: handleEventSelection
    });
    const initialSelection = savedIds.map(id => findCachedEvent(targetOfficeId, id)).find(Boolean)
      || (opts.visibleOnly === true ? visibleItems[0] : (visibleItems[0] || filteredList[0]))
      || null;
    if (initialSelection) {
      handleEventSelection(initialSelection);
      if (opts.onSelect) { opts.onSelect(initialSelection, String(initialSelection.id || initialSelection.vacationId || '')); }
    } else {
      updateEventDetail(null, targetOfficeId);
      if (opts.onSelect) { opts.onSelect(null, ''); }
    }
    updateEventLegend(visibleItems);
    updateEventButtonVisibility(targetOfficeId, normalizedList);
    await applyEventDisplay(visibleItems);
    if (showToastOnSuccess) toast('イベントを読み込みました');
    return filteredList;
  } catch (err) {
    console.error('loadEvents error', err);
    cachedEvents = { officeId: '', list: [] };
    resetEventDateColorState();
    renderVacationRadioMessage('読み込みに失敗しました');
    updateEventDetail(null, targetOfficeId);
    updateEventButtonVisibility(targetOfficeId, []);
    if (showToastOnSuccess) toast('イベントの取得に失敗しました', false);
    return [];
  }
}

function findCachedEvent(officeId, id) {
  if (!id) return null;
  const targetOfficeId = officeId || '';
  if (cachedEvents.officeId !== targetOfficeId) return null;
  const list = Array.isArray(cachedEvents.list) ? cachedEvents.list : [];
  const idStr = String(id);
  return list.find(item => String(item?.id || item?.vacationId || '') === idStr) || null;
}

function updateCachedMembersBits(officeId, id, membersBits) {
  if (!officeId || !id || cachedEvents.officeId !== officeId) return null;
  const list = Array.isArray(cachedEvents.list) ? cachedEvents.list : [];
  const idStr = String(id);
  const target = list.find(item => String(item?.id || item?.vacationId || '') === idStr) || null;
  if (target) {
    target.membersBits = membersBits;
    target.bits = membersBits;
  }
  return target;
}

function parseVacationMembersForDate(bitsStr, targetDate, startDate, endDate) {


  const members = getRosterOrdering().flatMap(g => g.members || []);
  if (!members.length) {

    return { memberIds: [], memberNames: '' };
  }

  // 日付の正規化
  function normalizeDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const target = normalizeDate(targetDate);
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  const parts = (bitsStr || '').split(';').map(s => s.trim()).filter(Boolean);


  const buildResultFromBits = (bits) => {
    const onSet = new Set();
    for (let i = 0; i < bits.length && i < members.length; i++) {
      if (bits[i] === '1') onSet.add(i);
    }
    const memberIds = members.map(m => m.id != null ? String(m.id) : '').filter((_, idx) => onSet.has(idx));
    const memberNames = members.filter((_, idx) => onSet.has(idx)).map(m => m.name || '').filter(Boolean).join('、');

    return { memberIds, memberNames };
  };

  const fallbackByParts = () => {
    if (parts.length === 0 || !target) {

      return { memberIds: [], memberNames: '' };
    }
    const matchedPart = parts.find(p => {
      if (!p.includes(':')) return false;
      const [pDate] = p.split(':');
      return normalizeDate(pDate) === target;
    }) || (parts.length === 1 ? parts[0] : null);
    if (!matchedPart) {

      return { memberIds: [], memberNames: '' };
    }
    const bits = matchedPart.includes(':') ? (matchedPart.split(':')[1] || '') : matchedPart;

    return buildResultFromBits(bits);
  };

  if (!target) {

    return { memberIds: [], memberNames: '' };
  }

  if (!start || !end) {

    return fallbackByParts();
  }

  // 対象日が期間内かチェック。範囲外の場合もビット列直接評価を試みる
  if (target < start || target > end) {

    return fallbackByParts();
  }

  // 日付スロットを生成
  const dateSlots = [];
  const current = new Date(start);
  const endD = new Date(end);
  while (current <= endD) {
    dateSlots.push(normalizeDate(current));
    current.setDate(current.getDate() + 1);
  }



  // 対象日のインデックスを取得
  const targetIdx = dateSlots.indexOf(target);


  if (targetIdx < 0) {

    return fallbackByParts();
  }

  // ビット文字列をパース


  if (parts.length === 0 || targetIdx >= parts.length) {

    return fallbackByParts();
  }

  const part = parts[targetIdx];
  const bits = part.includes(':') ? (part.split(':')[1] || '') : part;


  return buildResultFromBits(bits);
}

/* ROW_STATUS_CLASSES は constants/ui.js で定義 */

function getEventMembersForDate(item, targetDate) {
  const today = new Date(targetDate || Date.now());
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const start = item.startDate || item.start || item.from || '';
  const end = item.endDate || item.end || item.to || '';
  const bits = item.membersBits || item.bits || '';
  const { memberIds, memberNames } = parseVacationMembersForDate(bits, todayStr, start, end);
  return { memberIds, memberNames, targetDate: todayStr };
}

function applyVacationStatus(tr, statusTd, statusSelect, titles) {
  const labelTitle = titles.join(' / ') || 'イベント';
  tr.dataset.event = '1';
  tr.dataset.eventTitle = labelTitle;
  if (!statusTd || !statusSelect) return;
  if (statusSelect.dataset.originalValue === undefined) {
    statusSelect.dataset.originalValue = statusSelect.value || '';
  }
  statusSelect.style.display = 'none';
  statusSelect.disabled = true;
  let vacationLabel = statusTd.querySelector('.vacation-status-label');
  if (!vacationLabel) {
    vacationLabel = document.createElement('div');
    vacationLabel.className = 'vacation-status-label';
    statusTd.appendChild(vacationLabel);
  }
  vacationLabel.textContent = labelTitle;
  vacationLabel.style.display = 'block';
  statusSelect.value = '休み';
  ROW_STATUS_CLASSES.forEach(cls => tr.classList.remove(cls));
  tr.classList.add('st-off');
  tr.dataset.status = '休み';
}

function restoreStatusField(tr, statusTd, statusSelect) {
  delete tr.dataset.event;
  delete tr.dataset.eventTitle;
  if (!statusTd || !statusSelect) return;
  statusSelect.style.display = '';
  statusSelect.disabled = false;
  const vacationLabel = statusTd.querySelector('.vacation-status-label');
  if (vacationLabel) { vacationLabel.style.display = 'none'; }
  if (statusSelect.dataset.originalValue !== undefined) {
    const originalValue = statusSelect.dataset.originalValue;
    statusSelect.value = originalValue;
    delete statusSelect.dataset.originalValue;
    ROW_STATUS_CLASSES.forEach(cls => tr.classList.remove(cls));
    // モジュールレベルの statusClassMap（sync.jsでサーバーデータから構築）を使用（SSOT）
    const cls = statusClassMap.get(originalValue);
    if (cls) tr.classList.add(cls);
    tr.dataset.status = originalValue;
  }
}

function applyEventHighlightForItems(eventItems, targetDate) {
  if (!board) {
    console.warn('applyEventHighlight: board element not found');
    return;
  }
  applyManualEventColorsToGantt();
  const normalizedTargetDate = normalizeEventDateKey(targetDate || Date.now());
  const manualColorForTarget = getManualEventColorForDate(normalizedTargetDate, appliedEventOfficeId || getEventTargetOfficeId());
  const hasManualColor = !!manualColorForTarget;
  // eventItems の順序はサーバーで設定された並びを保持する想定。
  // 同日に複数のイベントが重複する場合、配列先頭（上位）を優先して色や休暇固定の適用を行う。
  const colorClasses = getEventColorClasses();
  const effectMap = new Map();
  (eventItems || []).forEach(item => {
    const { memberIds } = getEventMembersForDate(item, targetDate);

    // ▼ ログ抑制のためコメントアウト
    /*
    if (!memberIds.length) {
      console.warn('applyEventHighlight: memberIds empty', {
        id: item.id || item.vacationId || '',
        title: item.title || '',
        targetDate,
        isVacation: item.isVacation !== false,
        start: item.startDate || item.start || item.from || '',
        end: item.endDate || item.end || item.to || ''
      });
    }
    */
    // ▲ ここまで

    memberIds.forEach(id => {
      const key = String(id);
      const ref = effectMap.get(key) || { vacations: [], highlights: [] };
      if (item.isVacation !== false) { ref.vacations.push(item); }
      ref.highlights.push(item);
      effectMap.set(key, ref);
    });
  });

  board.querySelectorAll('tbody tr').forEach(tr => {
    const key = String(tr.dataset.key || '');
    const effect = effectMap.get(key);
    const statusTd = tr.querySelector('td.status');
    const statusSelect = statusTd?.querySelector('select[name="status"]');
    tr.classList.remove('event-highlight', ...colorClasses);
    if (effect) {
      const manualColorKey = hasManualColor ? (normalizeEventColorKeyClient(manualColorForTarget) || paletteKeyToEventColor(manualColorForTarget) || manualColorForTarget) : '';
      const colorKey = hasManualColor ? manualColorKey : (effect.vacations[0]?.color || effect.highlights[0]?.color || '');
      const colorClass = getEventColorClass(colorKey);
      tr.classList.add('event-highlight');
      if (colorClass) { tr.classList.add(colorClass); }
      if (effect.vacations.length > 0) {

        applyVacationStatus(tr, statusTd, statusSelect, effect.vacations.map(v => v.title || 'イベント'));
      } else {
        restoreStatusField(tr, statusTd, statusSelect);
      }
    } else {
      restoreStatusField(tr, statusTd, statusSelect);
    }
  });
}

function updateEventLegend(items) {
  const target = document.getElementById('eventLegendModal') || document.getElementById('eventLegend');
  if (!target) return;
  target.textContent = '';
  if (!items || items.length === 0) {
    const span = document.createElement('span');
    span.className = 'event-legend-empty';
    span.textContent = '選択されたイベントはありません';
    target.appendChild(span);
    return;
  }
  items.forEach(item => {
    const pill = document.createElement('div');
    pill.className = 'event-legend-item';
    const dot = document.createElement('span');
    dot.className = `event-color-dot ${getEventColorClass(item.color)}`.trim();
    dot.title = EVENT_COLOR_LABELS[item.color] || '';
    const text = document.createElement('span');
    text.className = 'event-legend-text';
    text.textContent = item.title || 'イベント';
    const type = document.createElement('span');
    type.className = 'event-legend-type';
    type.textContent = item.isVacation === false ? '予定のみ' : '休暇固定';
    pill.append(dot, text, type);
    target.appendChild(pill);
  });
}

async function saveEventFromModal() {
  const officeId = (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
  const selectedId = eventSelectedId || (selectedEventIds?.[0] || '');
  if (!officeId || !selectedId) { toast('表示するイベントを取得できませんでした', false); return false; }
  const item = findCachedEvent(officeId, selectedId);
  if (!item) { toast('イベントの情報を取得できませんでした', false); return false; }
  const ctrl = getEventGanttController();
  const membersBits = ctrl ? ctrl.getBitsString() : (eventBitsInput?.value || '');
  const id = item.id || item.vacationId || selectedId;
  const bitsPayload = { id, membersBits };

  // ▼ 修正: 管理者用ペイロード作成（必要であれば使うが、今回は専用APIを使う）
  const adminPayload = {
    office: officeId,
    title: item.title || '',
    start: item.startDate || item.start || item.from || '',
    end: item.endDate || item.end || item.to || '',
    note: item.noticeTitle || item.note || item.memo || '',
    noticeId: item.noticeId || item.noticeKey || '',
    noticeTitle: item.noticeTitle || '',
    membersBits,
    isVacation: item.isVacation !== false,
    color: item.color || ''
  };
  if ('visible' in item) adminPayload.visible = item.visible;
  if (id) adminPayload.id = id;

  try {
    if (eventSyncTimer) {
      clearInterval(eventSyncTimer);
      eventSyncTimer = null;
    }

    let res = null;

    // ★修正: ユーザー権限でも保存できる専用API (setVacationBits) を使用
    res = await apiPost({
      action: 'setVacationBits',
      token: SESSION_TOKEN,
      office: officeId,
      data: JSON.stringify(bitsPayload)
    });

    // ★修正: 成功判定を厳密にする (res.ok が true であること)
    if (res && res.ok === true) {
      toast('イベントを保存しました');
      updateCachedMembersBits(officeId, id, membersBits);
      if (Array.isArray(res.vacations)) {
        cachedEvents = { officeId, list: res.vacations };
        await applyEventDisplay(selectedEventIds.length ? selectedEventIds : [id]);
        updateEventButtonVisibility(officeId, res.vacations);
      } else {
        // ▼ 修正: loadEventsを呼ばない（KVキャッシュが古いまま返されるため）
        // ローカルキャッシュは updateCachedMembersBits で既に更新済み
        await applyEventDisplay(selectedEventIds.length ? selectedEventIds : [id]);
      }

      if (SESSION_TOKEN) {
        setTimeout(() => {
          if (!eventSyncTimer) {
            startEventSync(false);
          }
        }, 5000);
      }

      return true;
    }

    // エラーの場合
    throw new Error(res && res.error ? String(res.error) : 'save_failed');

  } catch (err) {
    if (!eventSyncTimer && SESSION_TOKEN) {
      startEventSync(false);
    }
    console.error('saveEventFromModal error', err);
    toast('イベントの保存に失敗しました', false);
    throw err;
  }
}

async function applyEventDisplay(items) {
  const officeId = (vacationOfficeSelect?.value) || adminSelectedOfficeId || CURRENT_OFFICE_ID || '';
  const sourceList = Array.isArray(items)
    ? (() => {
      const itemsAreIds = items.every(v => typeof v === 'string' || typeof v === 'number');
      if (itemsAreIds) {
        const baseList = cachedEvents.officeId === officeId ? cachedEvents.list : [];
        const idSet = new Set(items.map(v => String(v)));
        return (Array.isArray(baseList) ? baseList : []).filter(item => idSet.has(String(item?.id || item?.vacationId || '')));
      }
      return items;
    })()
    : (cachedEvents.officeId === officeId ? cachedEvents.list : []);
  const visibleItems = (Array.isArray(sourceList) ? sourceList : [])
    .filter(item => coerceVacationVisibleFlag(item?.visible));

  if (!officeId) { return false; }

  const ids = visibleItems.map(v => String(v.id || v.vacationId || '')).filter(Boolean);
  appliedEventIds = ids;
  appliedEventOfficeId = officeId;
  appliedEventTitles = visibleItems.map(v => v.title || 'イベント');

  applyEventHighlightForItems(visibleItems);
  updateEventLegend(visibleItems);
  updateEventCardStates();
  return true;
}

async function autoApplySavedEvent() {
  const officeId = CURRENT_OFFICE_ID || '';
  if (!officeId) { return; }
  let retries = 0;
  const maxRetries = 30;
  while (!board && retries < maxRetries) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }
  if (!board) { return; }
  try {
    await applyEventDisplay();
  } catch (err) {
    console.error('Auto-apply failed:', err);
  }
}

function startEventSync(immediate = false) {
  if (eventSyncTimer) { clearInterval(eventSyncTimer); eventSyncTimer = null; }
  if (!SESSION_TOKEN) return;
  const runSync = async () => {
    const officeId = getEventTargetOfficeId();
    if (!officeId) return;
    await refreshEventDataSilent(officeId);
    const forceReloadColors = !(typeof isOfficeAdmin === 'function' && isOfficeAdmin());
    await loadEventDateColors(officeId, { silent: true, force: forceReloadColors });
  };
  if (immediate) { runSync().catch(err => console.error('eventSync (immediate) failed', err)); }
  eventSyncTimer = setInterval(() => {
    runSync().catch(err => console.error('eventSync failed', err));
  }, EVENT_SYNC_INTERVAL_MS);
}

/* イベントカレンダー保存ボタン（手動保存） */
if (btnEventSave) {
  btnEventSave.addEventListener('click', async () => {
    btnEventSave.disabled = true;
    try {
      const success = await saveEventFromModal();
      if (!success) {
        // saveEventFromModal handles toast errors
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => { btnEventSave.disabled = false; }, 1000);
    }
  });
}

/* イベントカレンダー印刷 */
if (btnEventPrint) {
  btnEventPrint.addEventListener('click', () => {
    const dropdown = document.getElementById('eventSelectDropdown');
    if (!dropdown || !dropdown.value) {
      toast('印刷するイベントを選択してください', false);
      return;
    }

    const gantt = document.getElementById('eventGantt');
    if (!gantt || !gantt.querySelector('table')) {
      toast('カレンダーが表示されていません', false);
      return;
    }

    // 印刷用タイトルを更新
    const selectedOption = dropdown.options[dropdown.selectedIndex];
    const eventTitle = selectedOption ? selectedOption.textContent : '';
    const printInfo = document.getElementById('eventPrintInfo');
    if (printInfo && eventTitle) {
      printInfo.textContent = `イベントカレンダー: ${eventTitle}`;
    }

    // 印刷実行（スタイル制御は CSS の visibility: visible に任せる）
    window.print();
  });
}

/* レイアウト定数は constants/ui.js で定義 */
/* PANEL_MIN_PX, GAP_PX, MAX_COLS, CARD_BREAKPOINT_PX */
// --- Module Compatibility Window Exports ---
// ES Modules (like auth.js) cannot access top-level let/const from plain scripts.
window.SESSION_TOKEN = SESSION_TOKEN;
window.CURRENT_ROLE = CURRENT_ROLE;
window.CURRENT_OFFICE_ID = CURRENT_OFFICE_ID;
window.CURRENT_OFFICE_NAME = CURRENT_OFFICE_NAME;
window.OFFICE_COLUMN_CONFIG = OFFICE_COLUMN_CONFIG;

// また、値が更新された際にも window 側が同期されるように、代入時に注意が必要だが、
// 現状のコードベースではこれらへの再代入は auth.js 等で行われるため、
// auth.js 側で window.SESSION_TOKEN = ... のように扱うのが確実。

`

### js/utils.js

```javascript
/**
 * js/utils.js - ユーティリティ関数
 *
 * アプリケーション全体で使用する汎用関数を提供する。
 * - toast: 通知表示
 * - apiPost: API通信
 * - セッション管理
 * - キャッシュ管理
 *
 * 依存: js/constants/*.js, js/globals.js
 * 参照元: 全JSファイル
 *
 * @see MODULE_GUIDE.md
 */

/* ユーティリティ */
function toast(msg, ok = true) {
  if (!toastEl) return;
  if (toastEl._toastTimer) { clearTimeout(toastEl._toastTimer); }
  toastEl.textContent = '';
  const panel = document.createElement('div');
  panel.className = 'toast-panel';
  panel.textContent = msg;
  toastEl.appendChild(panel);
  toastEl.classList.remove('toast--error', 'toast--success');
  toastEl.classList.add(ok ? 'toast--success' : 'toast--error', 'show');
  toastEl._toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2400);
}
function diagAdd(line) {
  diag.classList.add('show');
  const div = document.createElement('div');
  div.textContent = line;
  diag.appendChild(div);
}
function stripCtl(s) { return (s == null ? '' : String(s)).replace(/[\u0000-\u001F\u007F]/g, ''); }
function sanitizeText(s) {
  s = stripCtl(s);

  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/* ID_RE は constants/ui.js で定義 */

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (let [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      e.addEventListener(k.slice(2).toLowerCase(), v);
    }
    else if (['disabled', 'checked', 'readonly', 'required'].includes(k)) {
      if (v) e.setAttribute(k, k);
      else e.removeAttribute(k);
    }
    else if (k === 'value' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName)) {
      e.value = v;
    }
    else e.setAttribute(k, String(v));
  }
  (children || []).forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return e;
}
function qsEncode(obj) { const p = new URLSearchParams(); Object.entries(obj || {}).forEach(([k, v]) => { if (v == null) return; p.append(k, String(v)); }); return p.toString(); }
const API_POST_CONTENT_TYPE = 'application/json';
const API_POST_LEGACY_CONTENT_TYPE = 'application/x-www-form-urlencoded';
async function apiPost(params, timeout = 20000) {
  /**
   * apiPost 送信仕様:
   * - 現行: Content-Type: application/json
   *   - body: { data: { ...params, tokenOffice?, tokenRole? } }
   * - 旧仕様 (互換): application/x-www-form-urlencoded
   *   - body: key=value&...
   * data は常にオブジェクトとして送信する。
   */
  const payload = { ...params };
  if (typeof CURRENT_OFFICE_ID !== 'undefined' && CURRENT_OFFICE_ID) {
    payload.tokenOffice = CURRENT_OFFICE_ID;
  }
  if (typeof CURRENT_ROLE !== 'undefined' && CURRENT_ROLE) {
    payload.tokenRole = CURRENT_ROLE;
  }
  const body = JSON.stringify({ data: payload });
  const controller = new AbortController(); const t = setTimeout(() => controller.abort(), timeout); try { const endpoint = (typeof CONFIG !== 'undefined' && CONFIG.remoteEndpoint) ? CONFIG.remoteEndpoint : "https://presence-proxy-prod.taka-hiyo.workers.dev"; const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': API_POST_CONTENT_TYPE }, body, signal: controller.signal, credentials: 'omit', cache: 'no-store' }); const ct = (res.headers.get('content-type') || '').toLowerCase(); if (!ct.includes('application/json')) return { ok: false, error: 'invalid_content_type' }; return await res.json(); } catch (err) { console.error(err); return { ok: false, error: err }; } finally { clearTimeout(t); }
}
/* セッションメタ(F5耐性) */
function saveSessionMeta() { try { sessionStorage.setItem(SESSION_ROLE_KEY, CURRENT_ROLE || 'user'); sessionStorage.setItem(SESSION_OFFICE_KEY, CURRENT_OFFICE_ID || ''); sessionStorage.setItem(SESSION_OFFICE_NAME_KEY, CURRENT_OFFICE_NAME || ''); } catch { } }
function loadSessionMeta() { try { CURRENT_ROLE = sessionStorage.getItem(SESSION_ROLE_KEY) || 'user'; CURRENT_OFFICE_ID = sessionStorage.getItem(SESSION_OFFICE_KEY) || ''; CURRENT_OFFICE_NAME = sessionStorage.getItem(SESSION_OFFICE_NAME_KEY) || ''; } catch { } }

// ★追加: キャッシュクリア用ヘルパー
function clearLocalCache() {
  try {
    const k1 = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys) ? CONFIG.storageKeys.stateCache : 'whereabouts_state_cache';
    const k2 = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys) ? CONFIG.storageKeys.lastSync : 'whereabouts_last_sync';
    localStorage.removeItem(k1);
    localStorage.removeItem(k2);
    
    // メモリ上のキャッシュもリセット（sync.jsがグローバルスコープにある前提）
    if (typeof STATE_CACHE !== 'undefined') {
        // STATE_CACHE は let 宣言されているため再代入可能なら空にする、または中身を削除
        for (const key in STATE_CACHE) delete STATE_CACHE[key];
    }
    if (typeof lastSyncTimestamp !== 'undefined') {
        lastSyncTimestamp = 0;
    }
    console.log("Local cache cleared.");
  } catch (e) {
    console.error("Cache clear failed:", e);
  }
}

`

### js/services/qr-generator.js

```javascript
/**
 * qrcode-generator v1.4.4
 * (c) 2009 Kazuhiko Arase (MIT License)
 * https://github.com/kazuhikoarase/qrcode-generator
 */
const qrcode = function() {
    var _typeNumber = 0;
    var _errorCorrectionLevel = 'L';
    var _modules = null;
    var _moduleCount = 0;
    var _dataList = [];
    var _qr = {};

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    _qr.getTypeNumber = function() { return _typeNumber; };
    _qr.setTypeNumber = function(typeNumber) { _typeNumber = typeNumber; };
    _qr.getErrorCorrectionLevel = function() { return _errorCorrectionLevel; };
    _qr.setErrorCorrectionLevel = function(errorCorrectionLevel) { _errorCorrectionLevel = errorCorrectionLevel; };
    _qr.addData = function(data) { _dataList.push(qr8BitByte(data)); _modules = null; };
    _qr.isDark = function(row, col) {
        if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) { throw new Error(row + "," + col); }
        return _modules[row][col];
    };
    _qr.getModuleCount = function() { return _moduleCount; };
    _qr.make = function() {
        if (_typeNumber < 1) {
            var typeNumber = 1;
            var maxTypeNumber = Math.floor(qrRSBlock.RS_BLOCK_TABLE.length / 4);
            for (typeNumber = 1; typeNumber <= maxTypeNumber; typeNumber++) {
                var rsBlocks = qrRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
                var buffer = qrBitBuffer();
                var totalDataCount = 0;
                for (var i = 0; i < rsBlocks.length; i++) { totalDataCount += rsBlocks[i].dataCount; }
                for (var i = 0; i < _dataList.length; i++) {
                    var data = _dataList[i];
                    buffer.put(data.mode, 4);
                    buffer.put(data.getLength(), qrUtil.getLengthInBits(data.mode, typeNumber) );
                    data.write(buffer);
                }
                if (buffer.getLengthInBits() <= totalDataCount * 8) break;
            }
            if (typeNumber > maxTypeNumber) {
                throw new Error("data too large for available QR versions (max " + maxTypeNumber + ")");
            }
            _typeNumber = typeNumber;
        }
        makeImpl(false, getBestMaskPattern() );
    };

    _qr.createImgTag = function(cellSize, margin) {
        cellSize = cellSize || 2;
        margin = (typeof margin == 'undefined') ? cellSize * 4 : margin;
        var size = _moduleCount * cellSize + margin * 2;
        var min = margin;
        var max = size - margin;
        return qrUtil.createImgTag(size, size, function(x, y) {
            if (min <= x && x < max && min <= y && y < max) {
                var col = Math.floor((x - min) / cellSize);
                var row = Math.floor((y - min) / cellSize);
                if (_qr.isDark(row, col)) return 0;
            }
            return 1;
        });
    };

    _qr.createSvgTag = function(cellSize, margin) {
        cellSize = cellSize || 2;
        margin = (typeof margin == 'undefined') ? cellSize * 4 : margin;
        var size = _moduleCount * cellSize + margin * 2;
        var c = '<svg xmlns="http://www.w3.org/2000/svg"';
        c += ' width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
        c += '<rect width="100%" height="100%" fill="#ffffff" />';
        for (var r = 0; r < _moduleCount; r++) {
            for (var col = 0; col < _moduleCount; col++) {
                if (_qr.isDark(r, col)) {
                    c += '<rect x="' + (col * cellSize + margin) + '" y="' + (r * cellSize + margin) + '" width="' + cellSize + '" height="' + cellSize + '" fill="#000000" />';
                }
            }
        }
        c += '</svg>';
        return c;
    };

    var makeImpl = function(test, maskPattern) {
        _moduleCount = _typeNumber * 4 + 17;
        _modules = new Array(_moduleCount);
        for (var row = 0; row < _moduleCount; row++) {
            _modules[row] = new Array(_moduleCount);
            for (var col = 0; col < _moduleCount; col++) { _modules[row][col] = null; }
        }
        setupPositionProbePattern(0, 0);
        setupPositionProbePattern(_moduleCount - 7, 0);
        setupPositionProbePattern(0, _moduleCount - 7);
        setupPositionAdjustPattern();
        setupTimingPattern();
        setupTypeInfo(test, maskPattern);
        if (_typeNumber >= 7) { setupTypeNumber(test); }
        var data = createData(_typeNumber, _errorCorrectionLevel, _dataList);
        mapData(data, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {
        for (var r = -1; r <= 7; r++) {
            if (row + r <= -1 || _moduleCount <= row + r) continue;
            for (var c = -1; c <= 7; c++) {
                if (col + c <= -1 || _moduleCount <= col + c) continue;
                if ( (0 <= r && r <= 6 && (c == 0 || c == 6) ) || (0 <= c && c <= 6 && (r == 0 || r == 6) ) || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
                    _modules[row + r][col + c] = true;
                } else {
                    _modules[row + r][col + c] = false;
                }
            }
        }
    };

    var getBestMaskPattern = function() {
        var minLostPoint = 0;
        var pattern = 0;
        for (var i = 0; i < 8; i++) {
            makeImpl(true, i);
            var lostPoint = qrUtil.getLostPoint(_qr);
            if (i == 0 || minLostPoint > lostPoint) {
                minLostPoint = lostPoint;
                pattern = i;
            }
        }
        return pattern;
    };

    var setupPositionAdjustPattern = function() {
        var pos = qrUtil.getPatternPosition(_typeNumber);
        for (var i = 0; i < pos.length; i++) {
            for (var j = 0; j < pos.length; j++) {
                var row = pos[i];
                var col = pos[j];
                if (_modules[row][col] != null) continue;
                for (var r = -2; r <= 2; r++) {
                    for (var c = -2; c <= 2; c++) {
                        if (Math.abs(r) == 2 || Math.abs(c) == 2 || (r == 0 && c == 0) ) {
                            _modules[row + r][col + c] = true;
                        } else {
                            _modules[row + r][col + c] = false;
                        }
                    }
                }
            }
        }
    };

    var setupTimingPattern = function() {
        for (var i = 8; i < _moduleCount - 8; i++) {
            if (_modules[i][6] != null) continue;
            _modules[i][6] = (i % 2 == 0);
        }
        for (var i = 8; i < _moduleCount - 8; i++) {
            if (_modules[6][i] != null) continue;
            _modules[6][i] = (i % 2 == 0);
        }
    };

    var setupTypeNumber = function(test) {
        var bits = qrUtil.getBCHTypeNumber(_typeNumber);
        for (var i = 0; i < 18; i++) {
            var mod = (!test && ( (bits >> i) & 1) == 1);
            _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
        }
        for (var i = 0; i < 18; i++) {
            var mod = (!test && ( (bits >> i) & 1) == 1);
            _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
        }
    };

    var setupTypeInfo = function(test, maskPattern) {
        var data = (_errorCorrectionLevel << 3) | maskPattern;
        var bits = qrUtil.getBCHTypeInfo(data);
        for (var i = 0; i < 15; i++) {
            var mod = (!test && ( (bits >> i) & 1) == 1);
            if (i < 6) { _modules[i][8] = mod; } 
            else if (i < 8) { _modules[i + 1][8] = mod; } 
            else { _modules[_moduleCount - 15 + i][8] = mod; }
        }
        for (var i = 0; i < 15; i++) {
            var mod = (!test && ( (bits >> i) & 1) == 1);
            if (i < 8) { _modules[8][_moduleCount - i - 1] = mod; } 
            else if (i < 9) { _modules[8][15 - i - 1 + 1] = mod; } 
            else { _modules[8][15 - i - 1] = mod; }
        }
        _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {
        var inc = -1;
        var row = _moduleCount - 1;
        var bitIndex = 7;
        var byteIndex = 0;
        for (var col = _moduleCount - 1; col > 0; col -= 2) {
            if (col == 6) col--;
            while (true) {
                for (var c = 0; c < 2; c++) {
                    if (_modules[row][col - c] == null) {
                        var dark = false;
                        if (byteIndex < data.length) { dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1); }
                        var mask = qrUtil.getMask(maskPattern, row, col - c);
                        if (mask) { dark = !dark; }
                        _modules[row][col - c] = dark;
                        bitIndex--;
                        if (bitIndex == -1) { byteIndex++; bitIndex = 7; }
                    }
                }
                row += inc;
                if (row < 0 || _moduleCount <= row) {
                    row -= inc;
                    inc = -inc;
                    break;
                }
            }
        }
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {
        var rsBlocks = qrRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);
        var buffer = qrBitBuffer();
        for (var i = 0; i < dataList.length; i++) {
            var data = dataList[i];
            buffer.put(data.mode, 4);
            buffer.put(data.getLength(), qrUtil.getLengthInBits(data.mode, typeNumber) );
            data.write(buffer);
        }
        var totalDataCount = 0;
        for (var i = 0; i < rsBlocks.length; i++) { totalDataCount += rsBlocks[i].dataCount; }
        if (buffer.getLengthInBits() > totalDataCount * 8) { throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")"); }
        if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) { buffer.put(0, 4); }
        while (buffer.getLengthInBits() % 8 != 0) { buffer.putBit(false); }
        while (true) {
            if (buffer.getLengthInBits() >= totalDataCount * 8) break;
            buffer.put(PAD0, 8);
            if (buffer.getLengthInBits() >= totalDataCount * 8) break;
            buffer.put(PAD1, 8);
        }
        return createBytes(buffer, rsBlocks);
    };

    var createBytes = function(buffer, rsBlocks) {
        var offset = 0;
        var maxDcCount = 0;
        var maxEcCount = 0;
        var dcdata = new Array(rsBlocks.length);
        var ecdata = new Array(rsBlocks.length);
        for (var r = 0; r < rsBlocks.length; r++) {
            var dcCount = rsBlocks[r].dataCount;
            var ecCount = rsBlocks[r].totalCount - dcCount;
            maxDcCount = Math.max(maxDcCount, dcCount);
            maxEcCount = Math.max(maxEcCount, ecCount);
            dcdata[r] = new Array(dcCount);
            for (var i = 0; i < dcdata[r].length; i++) { dcdata[r][i] = 0xff & buffer.buffer[i + offset]; }
            offset += dcCount;
            var rsPoly = qrUtil.getErrorCorrectionPolynomial(ecCount);
            var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
            var modPoly = rawPoly.mod(rsPoly);
            ecdata[r] = new Array(rsPoly.getLength() - 1);
            for (var i = 0; i < ecdata[r].length; i++) {
                var modIndex = i + modPoly.getLength() - ecdata[r].length;
                ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
            }
        }
        var totalCodeCount = 0;
        for (var i = 0; i < rsBlocks.length; i++) { totalCodeCount += rsBlocks[i].totalCount; }
        var data = new Array(totalCodeCount);
        var index = 0;
        for (var i = 0; i < maxDcCount; i++) {
            for (var r = 0; r < rsBlocks.length; r++) {
                if (i < dcdata[r].length) { data[index++] = dcdata[r][i]; }
            }
        }
        for (var i = 0; i < maxEcCount; i++) {
            for (var r = 0; r < rsBlocks.length; r++) {
                if (i < ecdata[r].length) { data[index++] = ecdata[r][i]; }
            }
        }
        return data;
    };

    return _qr;
};

// ---------------------------------------------------------------------
// Utils & Internal Classes
// ---------------------------------------------------------------------
var qrMode = { MODE_NUMBER : 1 << 0, MODE_ALPHA_NUM : 1 << 1, MODE_8BIT_BYTE : 1 << 2, MODE_KANJI : 1 << 3 };
var qrErrorCorrectionLevel = { L : 1, M : 0, Q : 3, H : 2 };
var qrMaskPattern = { PATTERN000 : 0, PATTERN001 : 1, PATTERN010 : 2, PATTERN011 : 3, PATTERN100 : 4, PATTERN101 : 5, PATTERN110 : 6, PATTERN111 : 7 };
var qrUtil = (function() {
    var PATTERN_POSITION_TABLE = [ [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170] ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
    var _qrUtil = {};
    _qrUtil.getBCHTypeInfo = function(data) {
        var res = data << 10;
        while (qrUtil.getBCHDigit(res) - qrUtil.getBCHDigit(G15) >= 0) { res ^= (G15 << (qrUtil.getBCHDigit(res) - qrUtil.getBCHDigit(G15) ) ); }
        return ( (data << 10) | res) ^ G15_MASK;
    };
    _qrUtil.getBCHTypeNumber = function(data) {
        var res = data << 12;
        while (qrUtil.getBCHDigit(res) - qrUtil.getBCHDigit(G18) >= 0) { res ^= (G18 << (qrUtil.getBCHDigit(res) - qrUtil.getBCHDigit(G18) ) ); }
        return (data << 12) | res;
    };
    _qrUtil.getBCHDigit = function(data) { var digit = 0; while (data != 0) { digit++; data >>>= 1; } return digit; };
    _qrUtil.getPatternPosition = function(typeNumber) { return PATTERN_POSITION_TABLE[typeNumber - 1]; };
    _qrUtil.getMask = function(maskPattern, i, j) {
        switch (maskPattern) {
            case qrMaskPattern.PATTERN000 : return (i + j) % 2 == 0;
            case qrMaskPattern.PATTERN001 : return i % 2 == 0;
            case qrMaskPattern.PATTERN010 : return j % 3 == 0;
            case qrMaskPattern.PATTERN011 : return (i + j) % 3 == 0;
            case qrMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0;
            case qrMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 == 0;
            case qrMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 == 0;
            case qrMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 == 0;
            default : throw new Error("bad maskPattern:" + maskPattern);
        }
    };
    _qrUtil.getErrorCorrectionPolynomial = function(errorCorrectionLength) {
        var a = qrPolynomial([1], 0);
        for (var i = 0; i < errorCorrectionLength; i++) { a = a.multiply(qrPolynomial([1, qrMath.gexp(i)], 0) ); }
        return a;
    };
    _qrUtil.getLengthInBits = function(mode, type) {
        if (1 <= type && type < 10) {
            switch (mode) {
                case qrMode.MODE_NUMBER : return 10;
                case qrMode.MODE_ALPHA_NUM : return 9;
                case qrMode.MODE_8BIT_BYTE : return 8;
                case qrMode.MODE_KANJI : return 8;
                default : throw new Error("mode:" + mode);
            }
        } else if (type < 27) {
            switch (mode) {
                case qrMode.MODE_NUMBER : return 12;
                case qrMode.MODE_ALPHA_NUM : return 11;
                case qrMode.MODE_8BIT_BYTE : return 16;
                case qrMode.MODE_KANJI : return 10;
                default : throw new Error("mode:" + mode);
            }
        } else if (type < 41) {
            switch (mode) {
                case qrMode.MODE_NUMBER : return 14;
                case qrMode.MODE_ALPHA_NUM : return 13;
                case qrMode.MODE_8BIT_BYTE : return 16;
                case qrMode.MODE_KANJI : return 12;
                default : throw new Error("mode:" + mode);
            }
        } else { throw new Error("type:" + type); }
    };
    _qrUtil.getLostPoint = function(qrCode) {
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        for (var row = 0; row < moduleCount; row++) {
            for (var col = 0; col < moduleCount; col++) {
                var sameCount = 0;
                var dark = qrCode.isDark(row, col);
                for (var r = -1; r <= 1; r++) {
                    if (row + r < 0 || moduleCount <= row + r) continue;
                    for (var c = -1; c <= 1; c++) {
                        if (col + c < 0 || moduleCount <= col + c) continue;
                        if (r == 0 && c == 0) continue;
                        if (dark == qrCode.isDark(row + r, col + c) ) { sameCount++; }
                    }
                }
                if (sameCount > 5) { lostPoint += (3 + sameCount - 5); }
            }
        }
        for (var row = 0; row < moduleCount - 1; row++) {
            for (var col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row, col) ) count++;
                if (qrCode.isDark(row + 1, col) ) count++;
                if (qrCode.isDark(row, col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count == 0 || count == 4) { lostPoint += 3; }
            }
        }
        for (var row = 0; row < moduleCount; row++) {
            for (var col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) && qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) && qrCode.isDark(row, col + 6) ) { lostPoint += 40; }
            }
        }
        for (var col = 0; col < moduleCount; col++) {
            for (var row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) && qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) && qrCode.isDark(row + 6, col) ) { lostPoint += 40; }
            }
        }
        var darkCount = 0;
        for (var col = 0; col < moduleCount; col++) {
            for (var row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) { darkCount++; }
            }
        }
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;
        return lostPoint;
    };
    return _qrUtil;
})();

var qrMath = (function() {
    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);
    for (var i = 0; i < 8; i++) { EXP_TABLE[i] = 1 << i; }
    for (var i = 8; i < 256; i++) { EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8]; }
    for (var i = 0; i < 255; i++) { LOG_TABLE[EXP_TABLE[i]] = i; }
    var _qrMath = {};
    _qrMath.gexp = function(n) { while (n < 0) { n += 255; } while (n >= 256) { n -= 255; } return EXP_TABLE[n]; };
    _qrMath.glog = function(n) { if (n < 1) { throw new Error("glog(" + n + ")"); } return LOG_TABLE[n]; };
    return _qrMath;
})();

function qrPolynomial(num, shift) {
    if (num.length == undefined) { throw new Error(num.length + "/" + shift); }
    var _num = (function() {
        var offset = 0;
        while (offset < num.length && num[offset] == 0) { offset++; }
        var _num = new Array(num.length - offset + shift);
        for (var i = 0; i < num.length - offset; i++) { _num[i] = num[i + offset]; }
        return _num;
    })();
    var _qrPolynomial = {};
    _qrPolynomial.get = function(index) { return _num[index]; };
    _qrPolynomial.getLength = function() { return _num.length; };
    _qrPolynomial.multiply = function(e) {
        var num = new Array(_qrPolynomial.getLength() + e.getLength() - 1);
        for (var i = 0; i < _qrPolynomial.getLength(); i++) {
            for (var j = 0; j < e.getLength(); j++) { num[i + j] ^= qrMath.gexp(qrMath.glog(_qrPolynomial.get(i) ) + qrMath.glog(e.get(j) ) ); }
        }
        return qrPolynomial(num, 0);
    };
    _qrPolynomial.mod = function(e) {
        if (_qrPolynomial.getLength() - e.getLength() < 0) { return _qrPolynomial; }
        var ratio = qrMath.glog(_qrPolynomial.get(0) ) - qrMath.glog(e.get(0) );
        var num = new Array(_qrPolynomial.getLength() );
        for (var i = 0; i < _qrPolynomial.getLength(); i++) { num[i] = _qrPolynomial.get(i); }
        for (var i = 0; i < e.getLength(); i++) { num[i] ^= qrMath.gexp(qrMath.glog(e.get(i) ) + ratio); }
        return qrPolynomial(num, 0).mod(e);
    };
    return _qrPolynomial;
};

function qrRSBlock(totalCount, dataCount) {
    var _qrRSBlock = {};
    _qrRSBlock.totalCount = totalCount;
    _qrRSBlock.dataCount = dataCount;
    return _qrRSBlock;
};

qrRSBlock.RS_BLOCK_TABLE = [ [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9], [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16], [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13], [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9], [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12], [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15], [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14], [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15], [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13], [2, 86, 68, 2, 87, 69], [4, 43, 27, 1, 44, 28], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16] ];
qrRSBlock.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
    var rsBlock = qrRSBlock.getRsBlockTable(typeNumber, errorCorrectionLevel);
    if (rsBlock == undefined) { throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel); }
    var length = rsBlock.length / 3;
    var list = [];
    for (var i = 0; i < length; i++) {
        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];
        for (var j = 0; j < count; j++) { list.push(qrRSBlock(totalCount, dataCount) ); }
    }
    return list;
};
qrRSBlock.getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
    var ecl = errorCorrectionLevel;
    if (typeof ecl === 'string') {
        switch (ecl.toUpperCase()) {
            case 'L': ecl = qrErrorCorrectionLevel.L; break;
            case 'M': ecl = qrErrorCorrectionLevel.M; break;
            case 'Q': ecl = qrErrorCorrectionLevel.Q; break;
            case 'H': ecl = qrErrorCorrectionLevel.H; break;
        }
    }
    switch (ecl) {
        case qrErrorCorrectionLevel.L : return qrRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case qrErrorCorrectionLevel.M : return qrRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case qrErrorCorrectionLevel.Q : return qrRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case qrErrorCorrectionLevel.H : return qrRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default : return undefined;
    }
};

function qrBitBuffer() {
    var _buffer = [];
    var _length = 0;
    var _qrBitBuffer = {};
    _qrBitBuffer.buffer = _buffer;
    _qrBitBuffer.getLengthInBits = function() { return _length; };
    _qrBitBuffer.get = function(index) { var bufIndex = Math.floor(index / 8); return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1; };
    _qrBitBuffer.put = function(num, length) { for (var i = 0; i < length; i++) { _qrBitBuffer.putBit( ( (num >>> (length - i - 1) ) & 1) == 1); } };
    _qrBitBuffer.putBit = function(bit) {
        var bufIndex = Math.floor(_length / 8);
        if (_buffer.length <= bufIndex) { _buffer.push(0); }
        if (bit) { _buffer[bufIndex] |= (0x80 >>> (_length % 8) ); }
        _length++;
    };
    return _qrBitBuffer;
};

function qr8BitByte(data) {
    var _mode = qrMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = (function() {
        var bytes = [];
        for (var i = 0; i < data.length; i++) {
            var c = data.charCodeAt(i);
            if (c > 0xff) {
                // UTF-8 encode
                bytes.push(0xe0 | ( (c >> 12) & 0x0f) );
                bytes.push(0x80 | ( (c >> 6) & 0x3f) );
                bytes.push(0x80 | (c & 0x3f) );
            } else {
                bytes.push(c);
            }
        }
        return bytes;
    })();
    var _qr8BitByte = {};
    _qr8BitByte.mode = _mode;
    _qr8BitByte.getLength = function() { return _bytes.length; };
    _qr8BitByte.write = function(buffer) { for (var i = 0; i < _bytes.length; i++) { buffer.put(_bytes[i], 8); } };
    return _qr8BitByte;
}

window.qrcode = qrcode;

`

### js/services/csv.js

```javascript
/**
 * js/services/csv.js
 * CSV操作に関するユーティリティ関数群
 *
 * 依存: なし (makeNormalizedCSVでSTATUSESを使用する場合は引数推奨、またはグローバルSTATUSESへのフォールバックあり)
 */
(function (global) {
    'use strict';

    /**
     * 文字列が計算式として評価されないようにエスケープ処理を行う
     * @param {string} s
     * @returns {string}
     */
    function csvProtectFormula(s) {
        if (s == null) return '';
        const v = String(s);
        return (/^[=\+\-@\t]/.test(v)) ? "'" + v : v;
    }

    /**
     * 配列をCSVの1行（カンマ区切り文字列）に変換する
     * 必要に応じてダブルクォートで囲み、エスケープする
     * @param {Array<string|number>} arr
     * @returns {string}
     */
    function toCsvRow(arr) {
        return arr.map(v => {
            const s = csvProtectFormula(v);
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
    }

    /**
     * CSVテキストをパースして2次元配列を返す
     * @param {string} text
     * @returns {Array<Array<string>>}
     */
    function parseCSV(text) {
        const out = []; let i = 0, row = [], field = '', inq = false;
        function pushField() { row.push(field); field = ''; }
        function pushRow() { out.push(row); row = []; }
        while (i < text.length) {
            const c = text[i++];
            if (inq) {
                if (c == '"' && text[i] == '"') { field += '"'; i++; }
                else if (c == '"') { inq = false; }
                else field += c;
            } else {
                if (c === ',') { pushField(); }
                else if (c == '"') { inq = true; }
                else if (c == '\n') { pushField(); pushRow(); }
                else if (c == '\r') { }
                else field += c;
            }
        }
        const endsWithComma = text.length > 0 && text[text.length - 1] === ',';
        if (field !== '' || endsWithComma) pushField();
        if (row.length) pushRow();
        return out;
    }

    /**
     * メンバーリスト用CSVデータを生成する
     * @param {Object} cfg - 拠点設定オブジェクト (groups, members を含む)
     * @param {Object} data - メンバーの状態データ
     * @param {Array} statuses - ステータス定義リスト (Optional)
     * @returns {string} CSVテキスト
     */
    function makeNormalizedCSV(cfg, data, statuses = []) {
        const rows = [];
        rows.push(toCsvRow(['在席管理CSV']));
        rows.push(toCsvRow(['グループ番号', 'グループ名', '表示順', 'id', '氏名', '内線', '携帯番号', 'Email', '業務時間', 'ステータス', '戻り時間', '明日の予定', '備考']));

        // STATUSESへの依存を解決: 引数で渡されるか、グローバルから取得
        const statusList = (Array.isArray(statuses) && statuses.length > 0) ? statuses : (typeof global.STATUSES !== 'undefined' ? global.STATUSES : []);
        const defaultStatus = statusList[0]?.value || '在席';

        (cfg.groups || []).forEach((g, gi) => {
            (g.members || []).forEach((m, mi) => {
                const id = m.id || '';
                const rec = (data && data[id]) || {};
                const workHours = rec.workHours || m.workHours || '';
                rows.push(toCsvRow([
                    gi + 1,
                    g.title || '',
                    mi + 1,
                    id,
                    m.name || '',
                    m.ext || '',
                    m.mobile || rec.mobile || '',
                    m.email || rec.email || '',
                    workHours,
                    rec.status || defaultStatus,
                    rec.time || '',
                    rec.tomorrowPlan || m.tomorrowPlan || '',
                    rec.note || ''
                ]));
            });
        });
        return rows.join('\n');
    }

    // グローバルに公開
    global.CsvService = {
        csvProtectFormula,
        toCsvRow,
        parseCSV,
        makeNormalizedCSV
    };

})(window);

`

### js/layout.js

```javascript
/**
 * js/layout.js - レイアウト管理
 *
 * グリッドレイアウトのカラム数計算とリサイズ監視を管理する。
 *
 * 依存: js/constants/ui.js (PANEL_MIN_PX, GAP_PX, MAX_COLS)
 * 参照元: js/board.js
 *
 * @see MODULE_GUIDE.md
 */

function getContainerWidth(){ const elc=board.parentElement||document.body; const r=elc.getBoundingClientRect(); return Math.max(0,Math.round(r.width)); }
function getBoardWidth() {
  // ボード（パネル）の固定幅。これを基準にカード表示しきい値やグリッドの列数を計算する (ユーザー要望: 1つの設定で管理)
  if (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.layoutConfig && OFFICE_COLUMN_CONFIG.layoutConfig.panelMinWidth) {
    const val = parseInt(OFFICE_COLUMN_CONFIG.layoutConfig.panelMinWidth, 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return typeof PANEL_MIN_PX !== 'undefined' ? PANEL_MIN_PX : 760;
}

function getTableMinWidth() {
  // テーブル自体の最小幅。パネル内での横スクロールを判定するために使用
  const enabledKeys = typeof getEnabledColumns === 'function' ? getEnabledColumns() : ['name', 'workHours', 'status', 'time', 'tomorrowPlan', 'note'];
  const colWidths = (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.columnWidths) || {};

  let total = 0;
  enabledKeys.forEach(k => {
    const def = typeof getColumnDefinition === 'function' ? getColumnDefinition(k) : null;
    let minW = def && def.defaultWidth ? Number(def.defaultWidth) : 100;

    const w = colWidths[k];
    if (w && w.min != null) {
      const configMin = Number(w.min);
      if (!isNaN(configMin)) {
        minW = configMin;
      }
    }
    total += minW;
  });

  return Math.max(Number(total) + 20, 300); // パディング等考慮
}

let lastW = -1;
let lastTableMin = -1;
let lastBoardWidth = -1;
let lastN = -1;
let lastIsForceCards = null;

function updateCols(){
  if (!board) return;
  const w = getContainerWidth();
  const boardWidth = getBoardWidth();
  const tableMin = getTableMinWidth();
  
  // 拠点設定のカード表示しきい値 (Phase 8)
  let cardBp = boardWidth;
  if (typeof OFFICE_COLUMN_CONFIG !== 'undefined' && OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.layoutConfig && OFFICE_COLUMN_CONFIG.layoutConfig.cardBreakpoint) {
    const val = parseInt(OFFICE_COLUMN_CONFIG.layoutConfig.cardBreakpoint, 10);
    if (!isNaN(val) && val > 0) {
      cardBp = val;
    }
  }

  // カラム数を先に計算
  let n = Math.floor((w + GAP_PX) / (boardWidth + GAP_PX));

  // ユーザー要望: 800px〜1400pxの間は強制的に1列
  if (w >= 800 && w <= 1400) {
    n = 1;
  }

  if (n < 1) n = 1;
  if (n > MAX_COLS) n = MAX_COLS;

  // 拠点設定のカード表示しきい値 (Phase 8)、または1列しか表示できない場合はカード表示
  const isForceCards = (w < cardBp) || (n <= 1);

  // 変動がない場合はスキップ (ResizeObserver の無限ループ防止)
  if (w === lastW && 
      boardWidth === lastBoardWidth && 
      tableMin === lastTableMin && 
      n === lastN && 
      isForceCards === lastIsForceCards) {
    return;
  }

  lastW = w;
  lastBoardWidth = boardWidth;
  lastTableMin = tableMin;
  lastN = n;
  lastIsForceCards = isForceCards;

  // CSS変数の更新
  board.style.setProperty('--table-min-width', `${tableMin}px`);
  board.style.setProperty('--board-width', `${boardWidth}px`);

  // カード表示への強制切り替え判定
  if (isForceCards) {
    board.classList.add('force-cards');
    board.dataset.cols = '1';
    board.style.removeProperty('--cols');
    return;
  }

  board.style.setProperty('--cols', String(n));
  board.dataset.cols = String(n);
  board.classList.remove('force-cards');
}
function startGridObserver(){
  if(ro){
    ro.disconnect();
    ro=null;
  }
  window.removeEventListener('resize', updateCols);
  if(typeof ResizeObserver!=='undefined'){
    ro=new ResizeObserver(() => {
      // requestAnimationFrame を使い、ブラウザの描画サイクルに合わせることでループのリスクを低減
      window.requestAnimationFrame(updateCols);
    });
    ro.observe(board.parentElement||document.body);
  }else{
    window.addEventListener('resize', updateCols, {passive:true});
  }
  updateCols();
}

`

### js/filters.js

```javascript
/**
 * js/filters.js - フィルター機能
 *
 * 氏名検索とステータスフィルターを管理する。
 *
 * 依存: js/globals.js (nameFilter, statusFilter, board, MENUS, STATUSES)
 * 参照元: js/sync.js, js/board.js
 *
 * @see MODULE_GUIDE.md
 */

function buildStatusFilterOptions(){
  statusFilter.replaceChildren();
  const optAll = document.createElement('option'); optAll.value=''; optAll.textContent='（全てのステータス）';
  statusFilter.appendChild(optAll);
  (MENUS?.statuses||[]).forEach(s=>{
    const o=document.createElement('option');
    o.value=String(s.value); o.textContent=String(s.value);
    statusFilter.appendChild(o);
  });
}
function applyFilters(){
  const q=(nameFilter.value||'').trim().toLowerCase();
  const st=statusFilter.value||'';
  board.querySelectorAll('section.panel').forEach(sec=>{
    let anyRow=false;
    sec.querySelectorAll('tbody tr').forEach(tr=>{
      const nameCell=tr.querySelector('td.name');
      const nameText=(nameCell?.textContent||'').toLowerCase();
      const rowSt = tr.querySelector('select[name="status"]')?.value || '';
      const showByName = !q || nameText.includes(q);
      const showByStatus = !st || rowSt === st;
      const show = showByName && showByStatus;
      
      // u-hidden クラスを使用して非表示を制御する（!importantによる上書きを防ぐため）
      tr.classList.toggle('u-hidden', !show);
      
      if(show) anyRow=true;
    });
    // 該当行が無いパネルは隠す
    sec.classList.toggle('u-hidden', !anyRow);
  });
}
nameFilter.addEventListener('input', applyFilters);
statusFilter.addEventListener('change', applyFilters);

function updateStatusFilterCounts(){
  // 現在の人数（全件）を集計
  const totalRows = board.querySelectorAll('tbody tr').length;
  const counts = new Map();
  STATUSES.forEach(s=>counts.set(s.value,0));
  board.querySelectorAll('tbody tr').forEach(tr=>{
    const st = tr.dataset.status || tr.querySelector('select[name="status"]')?.value || "";
    if(!counts.has(st)) counts.set(st,0);
    counts.set(st, counts.get(st)+1);
  });
  const cur = statusFilter.value;
  statusFilter.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = ''; optAll.textContent = `全て（${totalRows}）`;
  statusFilter.appendChild(optAll);
  STATUSES.forEach(s=>{
    const o=document.createElement('option');
    o.value=s.value; o.textContent=`${s.value}（${counts.get(s.value)||0}）`;
    statusFilter.appendChild(o);
  });
  statusFilter.value = (cur==='' || STATUSES.some(x=>x.value===cur)) ? cur : '';
}

`

### js/board.js

```javascript
/**
 * js/board.js - ボード描画・インタラクション
 *
 * 在席確認表のテーブル/カード描画とユーザー操作を管理する。
 *
 * 依存: js/constants/*.js, js/globals.js, js/utils.js
 * 参照元: js/sync.js (applyState), main.js
 *
 * @see MODULE_GUIDE.md
 */

/* === 時刻メニュー（07:00〜22:00） === */
/* TIME_RANGE_START_MIN, TIME_RANGE_END_MIN は constants/timing.js で定義 */
function buildTimeOptions(stepMin) {
  const frag = document.createDocumentFragment();
  frag.appendChild(el('option', { value: "", text: "" }));
  const step = Math.max(5, Math.min(60, Number(stepMin || 30)));
  for (let m = TIME_RANGE_START_MIN; m <= TIME_RANGE_END_MIN; m += step) {
    const h = Math.floor(m / 60), mm = m % 60;
    const t = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    frag.appendChild(el('option', { value: t, text: t }));
  }
  return frag;
}

function buildCandidateList(options) {
  const vals = [''].concat(Array.isArray(options) ? options.map(v => String(v ?? '')) : []);
  const ul = el('ul', { class: 'candidate-list' });
  vals.forEach(v => {
    const label = v === '' ? '（空白）' : v;
    const btn = el('button', {
      type: 'button',
      class: 'candidate-option',
      'data-value': v,
      text: label
    });
    ul.appendChild(el('li', {}, [btn]));
  });
  return ul;
}

function renderCandidatePanel(panel, type) {
  if (!panel) return;
  let options = [];
  const def = getColumnDefinition(type);
  if (type === 'workHours') {
    options = MENUS?.businessHours || [];
  } else if (type === 'note') {
    options = MENUS?.noteOptions || [];
  } else if (def && Array.isArray(def.options)) {
    options = def.options;
  }
  panel.replaceChildren();
  panel.appendChild(buildCandidateList(options));
}

function hideAllCandidatePanels() {
  board.querySelectorAll('.candidate-panel.show').forEach(p => {
    p.classList.remove('show');
    const btn = p.closest('.candidate-input')?.querySelector('.candidate-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

let contactHoldTimer = null;
let contactScrollBound = false;
let currentContactOverlay = null;

/**
 * IDからメンバー情報を取得する (Phase 4)
 * @param {string} id
 * @returns {Object|null}
 */
function findMemberById(id) {
  if (!id || !Array.isArray(GROUPS)) return null;
  for (const g of GROUPS) {
    if (!g.members) continue;
    const m = g.members.find(x => x.id === id);
    if (m) return m;
  }
  return null;
}

/**
 * 現在の拠点設定に基づき、ポップアップ表示対象のカラムキー配列を返す。
 * @returns {string[]}
 */
function getEnabledPopupColumns() {
  if (!OFFICE_COLUMN_CONFIG || !Array.isArray(OFFICE_COLUMN_CONFIG.popup)) {
    return []; // デフォルトを廃止し、空を返す
  }
  return OFFICE_COLUMN_CONFIG.popup;
}

function clearContactHoldTimer() {
  if (contactHoldTimer) {
    clearTimeout(contactHoldTimer);
    contactHoldTimer = null;
  }
}

function bindContactScrollClearer() {
  if (contactScrollBound) return;
  contactScrollBound = true;
  window.addEventListener('scroll', clearContactHoldTimer, { passive: true, capture: true });
}

function closeContactPopup() {
  if (currentContactOverlay) {
    currentContactOverlay.remove();
    currentContactOverlay = null;
  }
  document.removeEventListener('keydown', handleContactEsc);
}

function handleContactEsc(e) {
  if (e.key === 'Escape') closeContactPopup();
}

function showContactPopup(member) {
  if (!member) return;
  closeContactPopup();
  const overlay = el('div', { class: 'contact-overlay' });
  const dialogLabel = `${sanitizeText(member.name || '')}の連絡先`;
  const dialog = el('div', { class: 'contact-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': dialogLabel });
  const closeBtn = el('button', { type: 'button', class: 'contact-close', 'aria-label': '閉じる' }, ['×']);
  const title = el('h4', { class: 'contact-title', text: dialogLabel });

  const popupKeys = getEnabledPopupColumns();
  const body = el('div', { class: 'contact-body' });
  
  popupKeys.forEach(k => {
    const def = getColumnDefinition(k);
    if (!def) return;
    
    const val = String(member[k] || '').trim();
    const row = el('div', { class: 'contact-row' }, [
      el('span', { class: 'contact-label', text: def.label })
    ]);
    
    if (val) {
      let href = '';
      // 特徴的なプレフィックス設定
      if (k === 'ext' || k === 'mobile') href = `tel:${val}`;
      else if (k === 'email') href = `mailto:${encodeURIComponent(val)}`;
      
      if (href) {
        row.appendChild(el('a', { class: 'contact-link', href: href, text: val }));
      } else {
        // リンクではない通常の表示
        row.appendChild(el('span', { class: 'contact-link', style: 'text-decoration:none; cursor:default;', text: val }));
      }
    } else {
      row.appendChild(el('span', { class: 'contact-empty', text: '未登録' }));
    }
    body.appendChild(row);
  });

  closeBtn.addEventListener('click', closeContactPopup);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeContactPopup(); });
  document.addEventListener('keydown', handleContactEsc);

  dialog.append(closeBtn, title, body);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  currentContactOverlay = overlay;
  closeBtn.focus({ preventScroll: true });
}



function toggleCandidatePanel(wrapper) {
  if (!wrapper) return;
  const panel = wrapper.querySelector('.candidate-panel');
  const btn = wrapper.querySelector('.candidate-btn');
  const type = wrapper.dataset.type;
  if (!panel || !type) return;
  const isOpen = panel.classList.contains('show');
  hideAllCandidatePanels();
  if (isOpen) {
    panel.classList.remove('show');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    return;
  }
  renderCandidatePanel(panel, type);
  panel.classList.add('show');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function buildCandidateField({ id, name, placeholder, type, value }) {
  const wrapper = el('div', { class: 'candidate-input', 'data-type': type });
  const input = el('input', {
    id,
    name,
    type: 'text',
    placeholder,
    autocomplete: 'off',
    inputmode: 'text'
  });
  if (value != null) input.value = value;

  let btn = null;
  if (type !== 'note' && type !== 'workHours') {
    btn = el('button', {
      type: 'button',
      class: 'candidate-btn',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-label': '候補を表示'
    });
    btn.innerHTML = '▼';
  }

  const panel = el('div', { class: 'candidate-panel', role: 'listbox' });

  wrapper.appendChild(input);
  if (btn) wrapper.appendChild(btn);
  wrapper.appendChild(panel);

  if (type === 'note' || type === 'workHours') {
    input.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!panel.classList.contains('show')) {
        hideAllCandidatePanels();
        renderCandidatePanel(panel, type);
        panel.classList.add('show');
      }
    });
  }

  return { wrapper, input };
}

let candidatePanelGlobalsBound = false;
function bindCandidatePanelGlobals() {
  if (candidatePanelGlobalsBound) return;
  candidatePanelGlobalsBound = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.candidate-input')) hideAllCandidatePanels();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAllCandidatePanels();
  });
}

/* --- 動的カラムユーティリティ (Phase 3) --- */
/**
 * 現在の拠点設定に基づき、表示対象のカラムキー配列を返す。
 * 設定がない場合はデフォルトの6カラムを返す。
 * @returns {string[]}
 */
function getEnabledColumns() {
  if (!OFFICE_COLUMN_CONFIG || !Array.isArray(OFFICE_COLUMN_CONFIG.board)) {
    // [AFTER] 新規拠点などで設定が未完了の場合は、標準的なカラムセットを表示する
    return ['name', 'workHours', 'status', 'time', 'tomorrowPlan', 'note'];
  }
  return OFFICE_COLUMN_CONFIG.board;
}

/**
 * 現在の拠点設定に基づき、カード表示（1列表示）時のカラム順序を返す。
 * 設定がない場合はボード表示の順序(getEnabledColumns)をデフォルトとする。
 * @returns {string[]}
 */
function getCardColumns() {
  if (!OFFICE_COLUMN_CONFIG || !Array.isArray(OFFICE_COLUMN_CONFIG.card)) {
    return getEnabledColumns();
  }
  return OFFICE_COLUMN_CONFIG.card; // 氏名の強制注入を停止
}

/* 行UI */
function buildRow(member, enabledKeys, cardKeys) {
  const key = member.id || member.key || "";
  const tr = el('tr', { id: `row-${key}`, 'data-key': key });

  // enabledKeys と cardKeys が未定義の場合は再取得（フォールバック）
  if (!enabledKeys) enabledKeys = getEnabledColumns();
  if (!cardKeys) cardKeys = getCardColumns();

  // 拡張データ（モバイル/メール/内線）はデータ属性に保持（ポップアップ等で使用）
  tr.dataset.extension = member.ext || '';
  tr.dataset.mobile = member.mobile || '';
  tr.dataset.email = member.email || '';

  enabledKeys.forEach(colKey => {
    const def = getColumnDefinition(colKey);
    if (!def) {
      console.warn(`[buildRow] Column definition not found for key: ${colKey}`);
      return;
    }

    const td = el('td', { class: colKey });
    // カード表示用に見出し(ラベル)を持たせる
    td.setAttribute('data-label', def.label || '');
    
    // カード表示用の順序をインラインスタイルで設定
    const cardIdx = cardKeys.indexOf(colKey);
    if (cardIdx !== -1) {
      td.style.order = String(cardIdx);
    }
    
    // カスタマイズされているか判定
    const baseSys = COLUMN_DEFINITIONS.find(c => c.key === colKey);
    const isCustomized = !baseSys || def.type !== baseSys.type || (def.options && def.options.length > 0) || def.dependsOn;

    // nameガラムは特別扱い
    if (colKey === 'name') {
      td.textContent = sanitizeText(member.name || "");
      tr.appendChild(td);
      return;
    }

    if (isCustomized) {
      // 汎用ビルダー（カスタムカラムや設定変更されたシステムカラム）
      if (def.type === 'textual' || def.type === 'text') {
        const input = el('input', { type: 'text', name: colKey, class: 'candidate-input', style: 'width: 100%; border: 1px solid var(--border); border-radius: 4px; padding: 4px;' });
        input.value = member[colKey] || '';
        if (def.dependsOn && def.dependsOn.column) {
          const pVal = member[def.dependsOn.column] || '';
          if (!Array.isArray(def.dependsOn.values) || !def.dependsOn.values.includes(pVal)) {
             input.disabled = true;
          }
        }
        td.appendChild(input);
      } else if (def.type === 'select') {
        const sel = el('select', { id: `${colKey}-${key}`, name: colKey, class: 'admin-input', style: 'width: 100%; padding: 4px;' });
        td.appendChild(el('label', { class: 'sr-only', for: `${colKey}-${key}`, text: def.label }));
        const opts = def.options || [];
        sel.appendChild(el('option', { value: '', text: '' }));
        opts.forEach(v => sel.appendChild(el('option', { value: String(v), text: String(v) })));
        sel.value = member[colKey] || '';
        if (def.dependsOn && def.dependsOn.column) {
          const pVal = member[def.dependsOn.column] || '';
          if (!Array.isArray(def.dependsOn.values) || !def.dependsOn.values.includes(pVal)) {
             sel.disabled = true;
          }
        }
        td.appendChild(sel);
      } else if (def.type === 'candidate') {
        const field = buildCandidateField({ id: `${colKey}-${key}`, name: colKey, placeholder: def.label, type: colKey, value: member[colKey] || '' });
        if (def.dependsOn && def.dependsOn.column) {
          const pVal = member[def.dependsOn.column] || '';
          if (!Array.isArray(def.dependsOn.values) || !def.dependsOn.values.includes(pVal)) {
             field.input.disabled = true;
          }
        }
        td.appendChild(field.wrapper);
      } else {
        td.textContent = member[def.dbField || colKey] || "";
      }
    } else {
      // システム標準のビルダー
      switch (colKey) {
        case 'status': {
          const sel = el('select', { id: `status-${key}`, name: 'status' });
          td.appendChild(el('label', { class: 'sr-only', for: `status-${key}`, text: 'ステータス' }));
          STATUSES.forEach(s => sel.appendChild(el('option', { value: s.value, text: s.value })));
          sel.value = member.status || STATUSES[0]?.value || "";
          td.appendChild(sel);
          break;
        }
        case 'time': {
          const sel = el('select', { id: `time-${key}`, name: 'time' });
          td.appendChild(el('label', { class: 'sr-only', for: `time-${key}`, text: '戻り時間' }));
          sel.appendChild(buildTimeOptions(MENUS?.timeStepMinutes));
          sel.value = member.time || "";
          td.appendChild(sel);
          break;
        }
        case 'workHours': {
          const val = member.workHours == null ? '' : String(member.workHours);
          const field = buildCandidateField({ id: `work-${key}`, name: 'workHours', placeholder: '09:00-17:30', type: 'workHours', value: val });
          td.appendChild(el('label', { class: 'sr-only', for: `work-${key}`, text: '業務時間' }));
          td.appendChild(field.wrapper);
          break;
        }
        case 'tomorrowPlan': {
          const sel = el('select', { id: `tomorrow-plan-${key}`, name: 'tomorrowPlan' });
          td.appendChild(el('label', { class: 'sr-only', for: `tomorrow-plan-${key}`, text: '明日の予定' }));
          const planOptions = Array.isArray(MENUS?.tomorrowPlanOptions) ? MENUS.tomorrowPlanOptions : [];
          sel.appendChild(el('option', { value: '', text: '' }));
          planOptions.forEach(v => sel.appendChild(el('option', { value: String(v), text: String(v) })));
          sel.value = member.tomorrowPlan == null ? '' : String(member.tomorrowPlan);
          td.appendChild(sel);
          break;
        }
        case 'note': {
          const field = buildCandidateField({ id: `note-${key}`, name: 'note', placeholder: '備考', type: 'note', value: member.note || "" });
          td.appendChild(field.wrapper);
          break;
        }
        default:
          td.textContent = member[def.dbField || colKey] || "";
          break;
      }
    }
    
    tr.appendChild(td);
  });

  return tr;
}

/* 既存行の自己修復 (現在は動的レンダリングのため主にスキップ。最低限の構造のみ確認) */
function ensureRowControls(tr) {
  if (!tr) return;
  // 全て buildRow で適切に生成されます。
}

/* 描画 */
function buildPanel(g, idx, enabledKeys, cardKeys) {
  const gid = `grp-${idx}`; const sec = el('section', { class: 'panel', id: gid }); sec.dataset.groupIndex = String(idx);
  const title = fallbackGroupTitle(g, idx); sec.appendChild(el('h3', { class: 'title', text: title }));
  const table = el('table', { 'aria-label': `在席表（${title}）` });
  
  if (!enabledKeys) enabledKeys = getEnabledColumns();
  if (!cardKeys) cardKeys = getCardColumns();
  
  /**
   * カラム幅の適用ヘルパー
   * columnWidths 設定があればインラインスタイルで上書きし、
   * CSS のデフォルト値よりも優先させる。
   * SSOT: ベース幅は COLUMN_DEFINITIONS.defaultWidth を参照
   * @param {HTMLElement} element - 幅を適用する要素
   * @param {Object|undefined} w - { min, max } の幅設定
   * @param {string} k - カラムキー
   */

  // どのカラムを「強欲なストレッチ列 (width: 100%)」にするか決定
  // 幅設定がないカラムのうち、最も右にあるものを採用する
  const colWidths = (OFFICE_COLUMN_CONFIG && OFFICE_COLUMN_CONFIG.columnWidths) || {};
  let stretchKey = null;
  enabledKeys.forEach(k => {
    const config = colWidths[k];
    const def = getColumnDefinition(k);
    if (!def) return;

    let maxVal = null;
    if (config && config.max) {
      maxVal = parseInt(config.max);
      if (isNaN(maxVal)) maxVal = null;
    } else if (!config) {
      maxVal = def.defaultWidth;
      // 既存の note 自動拡張ルールを維持
      if (k === 'note') maxVal = null;
    }
    // 指定値がない（null）のカラムをストレッチ候補とする
    if (maxVal == null) stretchKey = k;
  });

  const applyWidthStyle = (element, w, k, isStretch) => {
    const def = getColumnDefinition(k);
    if (!def) return;

    let minVal = null;
    let maxVal = null;

    if (w) {
      if (w.min != null && w.min !== '') {
        const p = parseInt(w.min);
        if (!isNaN(p)) minVal = p;
      }
      if (w.max != null && w.max !== '') {
        const p = parseInt(w.max);
        if (!isNaN(p)) maxVal = p;
      }
    } else {
      minVal = def.defaultWidth;
      maxVal = def.defaultWidth;
      if (k === 'note') maxVal = null;
    }

    if (minVal != null) {
      element.style.minWidth = `${minVal}px`;
    }

    if (maxVal != null) {
      // 最大幅指定がある場合、それを基本幅および最大幅として適用
      element.style.width = `${maxVal}px`;
      element.style.maxWidth = `${maxVal}px`;
    } else {
      element.style.maxWidth = 'none';
      if (isStretch) {
        // 最大幅未指定のカラムのみが余計な余白を吸収するように auto に設定
        element.style.width = 'auto';
      } else {
        // その他の不定幅
        element.style.width = 'auto';
      }
    }
  };

  // colgroup の動的生成（幅制約を適用）
  const colgroup = el('colgroup');
  enabledKeys.forEach(k => {
    const def = getColumnDefinition(k);
    const tableClass = def ? def.tableClass : k;
    const colEl = el('col', { class: `col-${tableClass}` });
    applyWidthStyle(colEl, colWidths[k], k, k === stretchKey);
    colgroup.appendChild(colEl);
  });
  table.appendChild(colgroup);

  // thead の動的生成（th にも幅制約を適用して確実にレンダリングに反映）
  const thead = el('thead');
  const thr = el('tr');
  enabledKeys.forEach(k => {
    const def = getColumnDefinition(k);
    if (def) {
      const thAttributes = { text: def.label, class: def.tableClass };
      if (def.description) {
        thAttributes.title = def.description;
      }
      const th = el('th', thAttributes);
      applyWidthStyle(th, colWidths[k], k);
      thr.appendChild(th);
    }
  });
  thead.appendChild(thr);
  table.appendChild(thead);

  const tbody = el('tbody');
  if (Array.isArray(g.members)) {
    g.members.forEach(m => {
      try {
        tbody.appendChild(buildRow(m, enabledKeys, cardKeys));
      } catch (e) {
        console.error(`[buildPanel] Failed to build row for member: ${m.name}`, e);
      }
    });
  }
  table.appendChild(tbody);
  
  sec.appendChild(table);
  return sec;
}
function render() {
  if (!board) return;
  board.replaceChildren();

  // 表示設定を一度だけ取得（キャッシュ）
  const enabledKeys = getEnabledColumns();
  const cardKeys = getCardColumns();

  try {
    const frag = document.createDocumentFragment();
    // 修正箇所: ボードの表示をここで確実にする（早期リターンの前に行う）
    board.classList.remove('u-hidden');

    if (!GROUPS || GROUPS.length === 0) {
      const isAdmin = (typeof CURRENT_ROLE !== 'undefined' && (CURRENT_ROLE === 'owner' || CURRENT_ROLE === 'officeAdmin' || CURRENT_ROLE === 'superAdmin'));
      const msg = isAdmin 
        ? '表示するメンバーがいません。右上の「管理」ボタン（または管理パネル）からメンバーを登録してください。'
        : '表示するメンバーがいません。管理者にお問い合わせください。';
      
      const emptyDiv = el('div', { 
        class: 'u-text-center u-text-gray', 
        style: 'padding: 80px 20px; font-size: 16px;',
        text: msg
      });
      board.appendChild(emptyDiv);
      return;
    }
    GROUPS.forEach((g, i) => {
      try {
        frag.appendChild(buildPanel(g, i, enabledKeys, cardKeys));
      } catch (e) {
        console.error(`[render] Failed to build panel for group indexed ${i}`, e);
      }
    });
    board.appendChild(frag);
  } catch (e) {
    console.error('[render] Critical failure in render loop:', e);
    const errDiv = el('div', { 
      class: 'u-text-center u-text-red', 
      style: 'padding: 20px;',
      text: '表示データの構築に失敗しました。ページを再読み込みしてください。' 
    });
    board.appendChild(errDiv);
  }

  // 自己修復
  board.querySelectorAll('tbody tr').forEach(ensureRowControls);
  wireEvents(); recolor();
  
  // ★追加: 最新のステータス情報(STATE_CACHE)を即座に適用して初期化を防ぐ
  if (typeof applyState === 'function' && typeof STATE_CACHE !== 'undefined' && Object.keys(STATE_CACHE).length > 0) {
    applyState(STATE_CACHE);
  }

  try {
    startGridObserver();
  } catch (e) {
    console.error(e);
  } finally {
    buildGroupMenu();
    updateCols();
  }
  buildStatusFilterOptions(); updateStatusFilterCounts();
  applyFilters();
  if (window.VacationGantt) {
    try {
      window.VacationGantt.rebuild();
    } catch (e) {
      console.error(e);
    }
  }
}

/* グループメニュー */
function buildGroupMenu() {
  menuList.replaceChildren();
  if (!Array.isArray(GROUPS)) return;
  const total = (GROUPS || []).reduce((s, g) => s + ((g.members && g.members.length) || 0), 0);
  menuTitle.textContent = 'グループにジャンプ';
  menuList.appendChild(el('li', {}, [el('button', { class: 'grp-item', 'role': 'menuitem', 'data-target': 'top', text: `全体（合計：${total}名）` })]));
  GROUPS.forEach((g, i) => { const title = fallbackGroupTitle(g, i); const sub = (g && g.members && g.members.length) ? `（${g.members.length}名）` : '（0名）'; menuList.appendChild(el('li', {}, [el('button', { class: 'grp-item', 'role': 'menuitem', 'data-target': `grp-${i}` }, [title, el('span', { class: 'muted', text: ` ${sub}` })])])) });
  menuList.querySelectorAll('button.grp-item').forEach(btn => btn.addEventListener('click', () => { const id = btn.getAttribute('data-target'); closeMenu(); if (id === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } const sec = document.getElementById(id); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}
function openMenu() { menuEl.classList.add('show'); titleBtn.setAttribute('aria-expanded', 'true'); }
function closeMenu() { menuEl.classList.remove('show'); titleBtn.setAttribute('aria-expanded', 'false'); }
function toggleMenu() { menuEl.classList.contains('show') ? closeMenu() : openMenu(); }
titleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', (e) => { if (menuEl.classList.contains('show')) { const within = menuEl.contains(e.target) || titleBtn.contains(e.target); if (!within) closeMenu(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

/* 行状態 */
function getRowStateByTr(tr) {
  if (!tr) return { ext: "", workHours: "", status: STATUSES[0]?.value || "在席", time: "", tomorrowPlan: "", note: "" };
  const workHoursInput = tr.querySelector('input[name="workHours"]');
  const state = {};

  const enabledKeys = getEnabledColumns();
  enabledKeys.forEach(colKey => {
    // 編集・更新に関わらない純粋な表示用フィールドはスキップ
    if (colKey === 'name' || colKey === 'ext' || colKey === 'mobile' || colKey === 'email') return;

    const def = getColumnDefinition(colKey);
    if (!def) return;

    if (def.type === 'textual' || def.type === 'text' || def.type === 'candidate') {
      const input = tr.querySelector(`input[name="${colKey}"]`);
      if (input) state[colKey] = input.value;
    } else if (def.type === 'select' || def.type === 'time-select') {
      const select = tr.querySelector(`select[name="${colKey}"]`);
      if (select) state[colKey] = select.value;
    }
  });

  return state;
}
function getRowState(id) { return getRowStateByTr(document.getElementById(`row-${id}`)); }
function getState() { const data = {}; board.querySelectorAll("tbody tr").forEach(tr => { data[tr.dataset.key] = getRowStateByTr(tr); }); return data; }

/* 編集適用 */
function isEditingField(el) { return !!(el && ((el.dataset && el.dataset.editing === '1') || (el.dataset && el.dataset.composing === '1') || el === document.activeElement)); }
function setIfNeeded(el, v) { if (!el) return; if (isEditingField(el)) return; if (el.value !== (v ?? "")) el.value = v ?? ""; }

// ★修正: applyState は js/sync.js 側に移動（キャッシュ処理集約のため）
// ここにあった重複定義を削除しました

function recolor() { board.querySelectorAll("tbody tr").forEach(tr => { const st = tr.querySelector('select[name="status"]')?.value || ""; statusClassMap.forEach(cls => tr.classList.remove(cls)); const cls = statusClassMap.get(st); if (cls) tr.classList.add(cls); tr.dataset.status = st; }); }
function toggleTimeEnable(statusEl, timeEl) {
  const needsTime = requiresTimeSet.has(statusEl.value);
  if (!timeEl) return;
  const timeTd = timeEl.closest('td.time');
  if (needsTime) {
    timeEl.setAttribute('aria-disabled', 'false');
    timeEl.tabIndex = 0;
    timeTd?.classList.remove('time-disabled');
  } else {
    timeEl.setAttribute('aria-disabled', 'true');
    timeEl.tabIndex = -1;
    timeTd?.classList.add('time-disabled');
  }
}
function ensureTimePrompt(tr) {
  if (!tr) return;
  const statusEl = tr.querySelector('select[name="status"]');
  const timeTd = tr.querySelector('td.time');
  const timeEl = tr.querySelector('select[name="time"]');
  if (!(statusEl && timeTd && timeEl)) return;
  const needs = requiresTimeSet.has(statusEl.value);
  const empty = !timeEl.value;
  if (needs && empty) {
    timeTd.classList.add('need-time');
    timeEl.setAttribute('aria-invalid', 'true');
    let hint = timeTd.querySelector('.time-hint');
    if (!hint) { hint = document.createElement('span'); hint.className = 'time-hint'; hint.textContent = '戻り時間を選択'; timeTd.appendChild(hint); }
  } else {
    timeTd.classList.remove('need-time');
    timeEl.removeAttribute('aria-invalid');
    const hint = timeTd.querySelector('.time-hint'); if (hint) hint.remove();
  }
}

/* ローカル保存 */
function localKey() { return `${storeKeyBase}:${CURRENT_OFFICE_ID || '__none__'}:${CONFIG_UPDATED || 0}`; }
function saveLocal() { }
function loadLocal() { }

/* 同期（行ごとデバウンス送信） */
const rowTimers = new Map();
function debounceRowPush(key, delay = 900) { PENDING_ROWS.add(key); if (rowTimers.has(key)) clearTimeout(rowTimers.get(key)); rowTimers.set(key, setTimeout(() => { rowTimers.delete(key); pushRowDelta(key); }, delay)); }

function clearPendingRows() {
  rowTimers.forEach(timerId => {
    try { clearTimeout(timerId); } catch { }
  });
  rowTimers.clear();
  PENDING_ROWS.clear();
}

/* 入力イベント（IME配慮・デバウンス） */
function wireEvents() {
  bindCandidatePanelGlobals();

  // 連絡先ロングプレス（Event Delegation）
  const HOLD_DELAY_MS = 900;
  const MOVE_TOLERANCE_PX = 10;
  let startTouchPoint = null;
  let currentTargetTd = null;

  const startHold = (touchPoint, td) => {
    clearContactHoldTimer();
    currentTargetTd = td;
    startTouchPoint = touchPoint ? { x: touchPoint.clientX, y: touchPoint.clientY } : null;
    contactHoldTimer = setTimeout(() => {
      contactHoldTimer = null;
      if (!currentTargetTd) return;
      const tr = currentTargetTd.closest('tr');
      const member = findMemberById(tr?.dataset.key);
      if (member) showContactPopup(member);
      currentTargetTd = null;
    }, HOLD_DELAY_MS);
  };

  const cancelHold = () => {
    startTouchPoint = null;
    currentTargetTd = null;
    clearContactHoldTimer();
  };

  board.addEventListener('touchstart', (e) => {
    const td = e.target.closest('td.name');
    if (!td) return;
    // e.preventDefault(); // ここではpreventDefaultしない（スクロールやタップ判定に影響するため）
    const touch = e.touches?.[0];
    startHold(touch, td);
  }, { passive: true }); // passive: true にしてスクロール性能を確保

  board.addEventListener('touchend', cancelHold);
  board.addEventListener('touchcancel', cancelHold);

  board.addEventListener('touchmove', (e) => {
    if (!startTouchPoint || !contactHoldTimer) return;
    const touch = e.touches?.[0];
    if (!touch) {
      cancelHold();
      return;
    }
    const dx = Math.abs(touch.clientX - startTouchPoint.x);
    const dy = Math.abs(touch.clientY - startTouchPoint.y);
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
      cancelHold();
    }
  }, { passive: true });

  board.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const td = e.target.closest('td.name');
    if (!td) return;
    startHold(null, td);
  });

  board.addEventListener('mouseup', cancelHold);
  board.addEventListener('mouseleave', cancelHold);

  bindContactScrollClearer();

  board.addEventListener('click', (e) => {
    const candidateBtn = e.target.closest('.candidate-btn');
    if (candidateBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleCandidatePanel(candidateBtn.closest('.candidate-input'));
      return;
    }

    const candidateOpt = e.target.closest('.candidate-option');
    if (candidateOpt) {
      e.preventDefault();
      const wrapper = candidateOpt.closest('.candidate-input');
      const input = wrapper?.querySelector('input');
      if (input) {
        input.value = candidateOpt.dataset.value ?? '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      }
      hideAllCandidatePanels();
      return;
    }
  });

  // IME対策
  board.addEventListener('compositionstart', e => { const t = e.target; if (t && t.dataset) t.dataset.composing = '1'; });
  board.addEventListener('compositionend', e => { const t = e.target; if (t && t.dataset) delete t.dataset.composing; });

  board.addEventListener('focusin', e => {
    const t = e.target;
    if (t && t.dataset) t.dataset.editing = '1';
    if (t && (t.name === 'status' || t.name === 'time' || t.name === 'tomorrowPlan')) {
      t.dataset.prevValue = t.value;
    }
    if (t && t.name === 'time' && t.dataset) {
      t.dataset.editingTime = '1';
    }
  });
  board.addEventListener('focusout', e => {
    const t = e.target;
    if (!(t && t.dataset)) return;
    const tr = t.closest('tr');
    const key = tr?.dataset.key;
    if ((t.name === 'note' || t.name === 'workHours') && key && PENDING_ROWS.has(key)) { t.dataset.editing = '1'; }
    else { delete t.dataset.editing; }
    if (t.name === 'status' || t.name === 'time' || t.name === 'tomorrowPlan') {
      delete t.dataset.prevValue;
    }
    if (t.name === 'time') {
      delete t.dataset.editingTime;
    }
  });
  // 入力（備考：入力中は自動更新停止 → setIfNeeded が弾く）
  board.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t && t.name)) return;
    const tr = t.closest('tr'); if (!tr) return;
    const key = tr.dataset.key;
    if (t.name === 'note') { debounceRowPush(key); return; }
    if (t.name === 'workHours') { debounceRowPush(key); return; }
    
    // カスタムカラム(候補やテキスト)
    const def = getColumnDefinition(t.name);
    if (def && (def.type === 'textual' || def.type === 'candidate' || def.type === 'text')) {
      debounceRowPush(key);
    }
  });

  // 変更（ステータス/時間/明日の予定）
  const handleStatusTimeChange = (e) => {
    const t = e.target;
    if (!t) return;
    const tr = t.closest('tr'); if (!tr) return;
    const key = tr.dataset.key;
    const prevVal = t.dataset?.prevValue;
    const lastCommitted = t.dataset?.lastCommittedValue;

    if (prevVal !== undefined && prevVal === t.value) return;
    if (lastCommitted !== undefined && lastCommitted === t.value) return;

    if (t.dataset) {
      t.dataset.prevValue = t.value;
    }

    if (t.name === 'status') {
      t.dataset.editing = '1';
      const timeSel = tr.querySelector('select[name="time"]');
      const noteInp = tr.querySelector('input[name="note"]');
      const isEditingTime = timeSel?.dataset?.editingTime === '1';
      const timeDisabled = timeSel?.getAttribute('aria-disabled') === 'true';

      if (!isEditingTime) {
        toggleTimeEnable(t, timeSel);
      }
      const timeDisabledAfter = timeSel?.getAttribute('aria-disabled') === 'true';

      // 汎用依存関係の適用
      const enabledKeys = getEnabledColumns();
      enabledKeys.forEach(colKey => {
        const cDef = getColumnDefinition(colKey);
        if (cDef && cDef.dependsOn && cDef.dependsOn.column === t.name) {
          const isActive = Array.isArray(cDef.dependsOn.values) && cDef.dependsOn.values.includes(t.value);
          const cInput = tr.querySelector(`input[name="${colKey}"], select[name="${colKey}"]`);
          if (cInput) {
            cInput.disabled = !isActive;
            if (!isActive && cInput.value) { cInput.value = ''; }
          }
        }
      });


      if (!isEditingTime && clearOnSet.has(t.value)) {
        if (timeSel) timeSel.value = '';
        if (noteInp && isNotePresetValue(noteInp.value)) { noteInp.value = ''; }
      }

      ensureTimePrompt(tr);
      recolor();
      updateStatusFilterCounts();
      if (t.dataset) t.dataset.lastCommittedValue = t.value;
      debounceRowPush(key);
      return;
    }

    if (t.name === 'time' || t.name === 'tomorrowPlan') {
      t.dataset.editing = '1';

      ensureTimePrompt(tr);
      if (t.dataset) t.dataset.lastCommittedValue = t.value;
      debounceRowPush(key);
      return;
    }
    
    // カスタムカラムのselect等の変更
    const def = getColumnDefinition(t.name);
    if (def && def.type === 'select') {
      t.dataset.editing = '1';
      debounceRowPush(key);
      return;
    }
  };

  board.addEventListener('change', handleStatusTimeChange);
}

`

### js/vacations.js

```javascript
/* =========================================
   Part 1: ガントチャートUI制御 (既存コード)
   ========================================= */
(function () {
  const HOLIDAY_API_URL = window.HOLIDAY_API_URL || 'https://holidays-jp.github.io/api/v1/date.json';
  const MANUAL_HOLIDAYS = Array.isArray(window.MANUAL_HOLIDAYS) ? window.MANUAL_HOLIDAYS : [];
  const holidayCache = new Map(); // year -> Set<string>

  // ★修正: CONFIG からパレット定義を取得 (SSOT)
  const COLOR_PALETTE = (typeof CONFIG !== 'undefined' && CONFIG.colorPalette) ? CONFIG.colorPalette : [];
  const PALETTE_EVENT_COLOR_MAP = (typeof CONFIG !== 'undefined' && CONFIG.paletteToEventColor) ? CONFIG.paletteToEventColor : {};
  const EVENT_COLOR_TO_PALETTE_MAP = (typeof CONFIG !== 'undefined' && CONFIG.eventColorToPalette) ? CONFIG.eventColorToPalette : {};


  const FALLBACK_DAYS = 7;

  function normalizeDateStr(str) {
    if (!str) return '';
    const d = new Date(str);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function createVacationGanttController(config) {
    const opts = config || {};
    const startInput = opts.startInput || null;
    const endInput = opts.endInput || null;
    const bitsInput = opts.bitsInput || null;
    let ganttRoot = opts.rootEl || null;
    const jumpContainer = opts.groupJumpContainer || null;
    const groupJumpMode = opts.groupJumpMode || 'buttons';
    const scrollContainer = opts.scrollContainer || null;
    let tableEl = null;

    // ★追加: 印刷用CSS変数の注入 (SSOT)
    if (ganttRoot && typeof CONFIG !== 'undefined' && CONFIG.printSettings) {
      const ps = CONFIG.printSettings;
      ganttRoot.style.setProperty('--print-cell-width', ps.cellWidth);
      ganttRoot.style.setProperty('--print-name-width', ps.memberNameWidth);
      ganttRoot.style.setProperty('--print-font-size', ps.fontSize);
      ganttRoot.style.setProperty('--print-header-height', ps.headerHeight);
    }

    let orderedMembers = [];
    let dateSlots = [];
    let bitsByDate = new Map(); // date -> Array<boolean>
    let draggingState = null;
    let autoSaveTimer = null;
    let saveInFlight = false;
    let queuedSave = false;
    let latestRequestedState = null;
    let lastSavedState = null;
    const dateColorMap = new Map(); // date -> palette index
    let latestHolidaySet = new Set();
    const paletteClassNames = COLOR_PALETTE.map(c => c.className);
    const holidayPaletteIndex = COLOR_PALETTE.findIndex(c => c.key === 'holiday');

    function getDefaultColorIndex(date) {
      const d = new Date(date);
      const dow = d.getDay();
      if (dow === 0) {
        const sundayIdx = COLOR_PALETTE.findIndex(c => c.key === 'sunday');
        return sundayIdx >= 0 ? sundayIdx : 0;
      }
      if (dow === 6) {
        const saturdayIdx = COLOR_PALETTE.findIndex(c => c.key === 'saturday');
        return saturdayIdx >= 0 ? saturdayIdx : 0;
      }
      return 0;
    }

    function ensureDateColor(date) {
      const normalized = normalizeDateStr(date);
      if (!normalized) return 0;
      if (!dateColorMap.has(normalized)) {
        dateColorMap.set(normalized, getDefaultColorIndex(normalized));
      }
      return dateColorMap.get(normalized) ?? 0;
    }

    function syncDateColorMapWithSlots() {
      const available = new Set(dateSlots);
      Array.from(dateColorMap.keys()).forEach(date => {
        if (!available.has(date)) {
          dateColorMap.delete(date);
        }
      });
      dateSlots.forEach(date => ensureDateColor(date));
    }

    function applyColumnColor(date) {
      if (!tableEl) return;
      const idx = ensureDateColor(date) % COLOR_PALETTE.length;
      const className = COLOR_PALETTE[idx]?.className || '';
      const shouldShowHoliday = latestHolidaySet.has(date) && idx === holidayPaletteIndex;
      tableEl.querySelectorAll(`[data-date="${date}"]`).forEach(el => {
        paletteClassNames.forEach(cls => el.classList.remove(cls));
        if (className) {
          el.classList.add(className);
        }
        el.dataset.colorIndex = String(idx);
        el.classList.toggle('holiday', shouldShowHoliday);
      });
    }

    function applyAllColumnColors() {
      dateSlots.forEach(date => applyColumnColor(date));
    }

    let palettePopupEl = null;
    let paletteCurrentDate = '';
    let paletteCleanupFns = [];

    function closePalettePopup() {
      if (palettePopupEl && palettePopupEl.parentNode) {
        palettePopupEl.parentNode.removeChild(palettePopupEl);
      }
      palettePopupEl = null;
      paletteCurrentDate = '';
      paletteCleanupFns.forEach(fn => {
        try { fn(); } catch (err) { console.error(err); }
      });
      paletteCleanupFns = [];
    }

    function positionPalettePopup(anchorEl) {
      if (!palettePopupEl || !anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const popupRect = palettePopupEl.getBoundingClientRect();
      const top = rect.bottom + window.scrollY + 6;
      let left = rect.left + window.scrollX + (rect.width / 2) - (popupRect.width / 2);
      const minLeft = 8;
      const maxLeft = Math.max(minLeft, window.scrollX + document.documentElement.clientWidth - popupRect.width - 8);
      left = Math.min(Math.max(left, minLeft), maxLeft);
      palettePopupEl.style.top = `${top}px`;
      palettePopupEl.style.left = `${left}px`;
    }

    function paletteKeyFromIndex(idx) {
      const normalizedIdx = Math.max(0, idx % COLOR_PALETTE.length);
      return COLOR_PALETTE[normalizedIdx]?.key || '';
    }

    function paletteIndexFromKey(key) {
      const normalized = (key || '').toString().trim().toLowerCase();
      return COLOR_PALETTE.findIndex(c => c.key === normalized);
    }

    function toEventColorKeyFromPalette(key) {
      const normalized = (key || '').toString().trim().toLowerCase();
      return PALETTE_EVENT_COLOR_MAP[normalized] ?? '';
    }

    function paletteKeyFromEventColor(key) {
      const normalized = (key || '').toString().trim().toLowerCase();
      if (EVENT_COLOR_TO_PALETTE_MAP[normalized]) return EVENT_COLOR_TO_PALETTE_MAP[normalized];
      const paletteIdx = paletteIndexFromKey(normalized);
      return paletteIdx >= 0 ? paletteKeyFromIndex(paletteIdx) : '';
    }

    function handlePaletteColorSelect(date, idx) {
      if (!date) return null;
      const normalizedDate = normalizeDateStr(date) || date;
      const paletteKey = paletteKeyFromIndex(idx);
      const normalizedIdx = Math.max(0, idx % COLOR_PALETTE.length);
      dateColorMap.set(normalizedDate, normalizedIdx);
      applyColumnColor(normalizedDate);
      const result = {
        date: normalizedDate,
        paletteIndex: normalizedIdx,
        paletteKey,
        eventColor: toEventColorKeyFromPalette(paletteKey)
      };
      if (typeof opts.onDateColorSelect === 'function') {
        try {
          opts.onDateColorSelect({ ...result });
        } catch (err) {
          console.error('onDateColorSelect error', err);
        }
      }
      closePalettePopup();
      return result;
    }

    function createPalettePopup(anchorEl, date) {
      closePalettePopup();
      paletteCurrentDate = date;
      const popup = document.createElement('div');
      popup.className = 'vac-color-palette';

      const title = document.createElement('div');
      title.className = 'vac-color-palette__title';
      title.textContent = '列カラーを選択';
      popup.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'vac-color-palette__grid';
      COLOR_PALETTE.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `vac-color-option ${item.className}`;
        btn.dataset.colorKey = item.key;
        btn.setAttribute('aria-label', `${item.key} を選択`);
        const mark = document.createElement('span');
        mark.className = 'vac-color-option__dot';
        btn.appendChild(mark);
        const label = document.createElement('span');
        label.className = 'vac-color-option__label';
        label.textContent = item.key;
        btn.appendChild(label);
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          handlePaletteColorSelect(date, idx);
        });
        grid.appendChild(btn);
      });
      popup.appendChild(grid);

      document.body.appendChild(popup);
      palettePopupEl = popup;

      requestAnimationFrame(() => positionPalettePopup(anchorEl));

      const handleOutside = (ev) => {
        if (!palettePopupEl) return;
        const target = ev.target;
        if (palettePopupEl.contains(target) || anchorEl.contains(target)) return;
        closePalettePopup();
      };

      const closeOnScroll = () => closePalettePopup();

      ['mousedown', 'touchstart', 'pointerdown'].forEach(ev => {
        document.addEventListener(ev, handleOutside, true);
        paletteCleanupFns.push(() => document.removeEventListener(ev, handleOutside, true));
      });
      window.addEventListener('scroll', closeOnScroll, true);
      paletteCleanupFns.push(() => window.removeEventListener('scroll', closeOnScroll, true));
      window.addEventListener('resize', closeOnScroll, true);
      paletteCleanupFns.push(() => window.removeEventListener('resize', closeOnScroll, true));
    }

    function applyExternalDateColors(colorMap) {
      if (!colorMap) {
        syncDateColorMapWithSlots();
        applyAllColumnColors();
        return;
      }
      const entries = colorMap instanceof Map ? Array.from(colorMap.entries()) : Object.entries(colorMap);
      const previous = new Map(dateColorMap);
      dateColorMap.clear();
      syncDateColorMapWithSlots();
      let changed = true;
      entries.forEach(([rawDate, colorValue]) => {
        const date = normalizeDateStr(rawDate);
        if (!date) return;
        const paletteKey = paletteKeyFromEventColor(colorValue);
        if (!paletteKey) {
          if (previous.has(date)) {
            dateColorMap.set(date, previous.get(date));
            changed = true;
          }
          return;
        }
        const idx = paletteIndexFromKey(paletteKey);
        if (idx < 0) {
          if (previous.has(date)) {
            dateColorMap.set(date, previous.get(date));
            changed = true;
          }
          return;
        }
        dateColorMap.set(date, idx % COLOR_PALETTE.length);
        changed = true;
      });
      if (changed) {
        applyAllColumnColors();
      }
    }

    function handleColorCycle(e) {
      const isAdmin = typeof isOfficeAdmin === 'function' ? isOfficeAdmin() : false;
      if (!isAdmin) return;
      const target = e.target.closest('.vac-day-header');
      if (!target) return;
      const date = target.dataset.date;
      if (!date) return;
      e.preventDefault();
      e.stopPropagation();
      if (palettePopupEl && paletteCurrentDate === date) {
        closePalettePopup();
        return;
      }
      createPalettePopup(target, date);
    }
    let statusEl = null;
    let saveMode = opts.saveMode || 'vacation';
    let initialized = false;
    let groupAnchors = [];

    function captureCurrentState() {
      const stateBits = getBitsString();
      return {
        start: startInput?.value || '',
        end: endInput?.value || '',
        bits: stateBits
      };
    }

    function ensureStatusElement() {
      if (statusEl) return statusEl;
      const el = document.createElement('div');
      el.className = 'vac-save-status';
      statusEl = el;
      if (ganttRoot) {
        ganttRoot.appendChild(el);
      }
      return el;
    }

    function renderStatus(type, message, actions) {
      const el = ensureStatusElement();
      el.textContent = '';
      el.dataset.state = type;
      const msgSpan = document.createElement('span');
      msgSpan.className = 'vac-save-message';
      msgSpan.textContent = message;
      el.appendChild(msgSpan);
      if (type === 'saving') {
        const spinner = document.createElement('span');
        spinner.className = 'vac-save-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        el.prepend(spinner);
      }
      (actions || []).forEach(({ label, onClick, className }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.className = className || 'vac-save-action';
        btn.addEventListener('click', onClick);
        el.appendChild(btn);
      });
    }

    function showSavingStatus() {
      renderStatus('saving', '変更を保存しています…');
    }

    function showSavedStatus() {
      renderStatus('saved', '自動保存済み');
      setTimeout(() => {
        if (statusEl && statusEl.dataset.state === 'saved') {
          statusEl.textContent = '';
          statusEl.dataset.state = '';
        }
      }, 2000);
    }

    function rollbackToLastSaved() {
      if (!lastSavedState) return;
      setRangeAndBits(lastSavedState.start, lastSavedState.end, lastSavedState.bits);
      toast('保存前の状態に戻しました', false);
    }

    function showErrorStatus() {
      const actions = [{
        label: '再試行',
        onClick: () => scheduleAutoSave('retry'),
        className: 'vac-save-retry'
      }];
      if (lastSavedState) {
        actions.push({
          label: 'ロールバック',
          onClick: rollbackToLastSaved,
          className: 'vac-save-rollback'
        });
      }
      renderStatus('error', '保存に失敗しました。再試行するかロールバックできます。', actions);
    }

    function isEventModalSaveMode() {
      return saveMode === 'event-modal' || saveMode === 'event-auto';
    }

    async function invokeSaveHandler() {
      if (isEventModalSaveMode() && typeof window.saveEventFromModal === 'function') {
        return await window.saveEventFromModal();
      }
      if (typeof window.saveLongVacationFromModal === 'function') {
        return await window.saveLongVacationFromModal();
      }
      if (typeof window.handleVacationAutoSave === 'function') {
        return await window.handleVacationAutoSave();
      }
      if (typeof window.handleVacationSave === 'function') {
        return await window.handleVacationSave();
      }
      throw new Error('save_handler_missing');
    }

    async function flushAutoSave() {
      if (saveInFlight) {
        queuedSave = true;
        return;
      }
      if (!latestRequestedState) return;
      saveInFlight = true;
      queuedSave = false;
      showSavingStatus();
      try {
        await invokeSaveHandler();
        lastSavedState = captureCurrentState();
        showSavedStatus();
      } catch (err) {
        console.error('自動保存に失敗しました', err);
        showErrorStatus();
      } finally {
        saveInFlight = false;
        if (queuedSave) {
          queuedSave = false;
          flushAutoSave();
        }
      }
    }

    function scheduleAutoSave(reason) {
      latestRequestedState = captureCurrentState();
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        flushAutoSave();
      }, 800);
    }

    function getGroupTitle(group, idx) {
      if (typeof fallbackGroupTitle === 'function') {
        return fallbackGroupTitle(group, idx);
      }
      const raw = (group && typeof group.title === 'string') ? group.title.trim() : '';
      return raw || `グループ${idx + 1}`;
    }

    function getDateRange() {
      const startRaw = startInput?.value || '';
      const endRaw = endInput?.value || '';
      const start = normalizeDateStr(startRaw) || normalizeDateStr(new Date());
      let end = normalizeDateStr(endRaw);
      if (!end) {
        const base = start ? new Date(start) : new Date();
        const tmp = new Date(base);
        tmp.setDate(base.getDate() + (FALLBACK_DAYS - 1));
        end = normalizeDateStr(tmp);
      }
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (endDate < startDate) {
        return { start: normalizeDateStr(endDate), end: normalizeDateStr(startDate) };
      }
      return { start, end };
    }

    function buildDateSlots() {
      const { start, end } = getDateRange();
      const out = [];
      if (!start || !end) return out;
      const current = new Date(start);
      const endDate = new Date(end);
      while (current <= endDate) {
        out.push(normalizeDateStr(current));
        current.setDate(current.getDate() + 1);
      }
      return out;
    }

    function getMembersOrdered() {
      if (typeof getRosterOrdering === 'function') {
        return getRosterOrdering().flatMap((g, gi) => (g.members || []).map(m => ({
          ...m,
          groupTitle: getGroupTitle(g, gi)
        })));
      }
      return [];
    }

    function ensureBits(date) {
      if (!bitsByDate.has(date)) {
        bitsByDate.set(date, new Array(orderedMembers.length).fill(false));
      }
      const arr = bitsByDate.get(date) || [];
      if (arr.length < orderedMembers.length) {
        const diff = orderedMembers.length - arr.length;
        bitsByDate.set(date, arr.concat(new Array(diff).fill(false)));
      }
    }

    function parseBitsString(raw) {
      bitsByDate.clear();
      if (!raw) {
        dateSlots.forEach(d => ensureBits(d));
        return;
      }
      const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
      if (parts.length === 0) {
        dateSlots.forEach(d => ensureBits(d));
        return;
      }
      const useSlots = dateSlots.length ? dateSlots : parts.map((_, i) => i.toString());
      parts.forEach((part, idx) => {
        let key = '';
        let bits = part;
        if (part.includes(':')) {
          const [k, v] = part.split(':');
          key = normalizeDateStr(k) || useSlots[idx] || '';
          bits = v || '';
        } else {
          key = useSlots[idx] || '';
        }
        ensureBits(key);
        const arr = bitsByDate.get(key) || [];
        const chars = (bits || '').trim();
        for (let i = 0; i < orderedMembers.length; i++) {
          arr[i] = chars[i] === '1';
        }
        bitsByDate.set(key, arr);
      });
      dateSlots.forEach(d => ensureBits(d));
    }

    function serializeBits() {
      const rows = [];
      dateSlots.forEach(date => {
        const arr = bitsByDate.get(date) || [];
        const bits = orderedMembers.map((_, i) => arr[i] ? '1' : '0').join('');
        rows.push(`${date}:${bits}`);
      });
      return rows.join(';');
    }

    function updateBitsInput() {
      if (!bitsInput) return;
      bitsInput.value = serializeBits();
    }

    function toggleBit(date, memberIdx, on) {
      ensureBits(date);
      const arr = bitsByDate.get(date) || [];
      arr[memberIdx] = on;
      bitsByDate.set(date, arr);
      updateBitsInput();
      // scheduleAutoSave('cell');
    }

    function applyBitsToCells() {
      if (!tableEl) return;
      // メンバーごとにビットが1つでもあるかをチェック
      const memberHasBit = new Map();
      bitsByDate.forEach((arr) => {
        if (!Array.isArray(arr)) return;
        arr.forEach((on, idx) => {
          if (on) memberHasBit.set(idx, true);
        });
      });

      tableEl.querySelectorAll('.vac-cell').forEach(cell => {
        const date = cell.dataset.date;
        const idx = Number(cell.dataset.memberIndex || '-1');
        const arr = bitsByDate.get(date);
        const on = Array.isArray(arr) ? !!arr[idx] : false;
        cell.classList.toggle('on', on);
        cell.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      // メンバー名のハイライト表示
      tableEl.querySelectorAll('th.member-name').forEach(th => {
        const idx = Number(th.dataset.memberIndex || '-1');
        const hasBit = memberHasBit.has(idx);
        th.classList.toggle('member-has-bit', hasBit);
      });
    }

    function createHeaderRow() {
      const thead = document.createElement('thead');
      const monthRow = document.createElement('tr');
      monthRow.className = 'vac-month-row';
      const dayRow = document.createElement('tr');
      dayRow.className = 'vac-day-row';

      const groupHeader = document.createElement('th');
      groupHeader.textContent = 'グループ';
      groupHeader.className = 'group-name';
      groupHeader.rowSpan = 2;
      monthRow.appendChild(groupHeader);
      const nameHeader = document.createElement('th');
      nameHeader.textContent = '氏名';
      nameHeader.className = 'member-name';
      nameHeader.rowSpan = 2;
      monthRow.appendChild(nameHeader);

      const monthGroups = [];
      let currentMonth = '';
      let spanStart = 0;
      dateSlots.forEach((date, idx) => {
        const d = new Date(date);
        const monthLabel = `${d.getFullYear()}年${d.getMonth() + 1}月`;
        if (currentMonth === '') {
          currentMonth = monthLabel;
          spanStart = idx;
        } else if (monthLabel !== currentMonth) {
          monthGroups.push({ label: currentMonth, start: spanStart, end: idx - 1 });
          currentMonth = monthLabel;
          spanStart = idx;
        }
        const dow = d.getDay();
        const dayTh = document.createElement('th');
        dayTh.dataset.date = date;
        dayTh.className = 'vac-day-header';
        if (dow === 0) dayTh.classList.add('weekend-sun');
        if (dow === 6) dayTh.classList.add('weekend-sat');

        const label = document.createElement('div');
        label.className = 'vac-day-label';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'vac-date';
        dateSpan.textContent = `${d.getDate()}日`;

        const daySpan = document.createElement('span');
        daySpan.textContent = ['日', '月', '火', '水', '木', '金', '土'][dow] || '';
        daySpan.className = 'vac-day';

        label.appendChild(dateSpan);
        label.appendChild(daySpan);
        dayTh.appendChild(label);
        dayRow.appendChild(dayTh);
      });

      if (currentMonth) {
        monthGroups.push({ label: currentMonth, start: spanStart, end: dateSlots.length - 1 });
      }

      monthGroups.forEach(group => {
        const th = document.createElement('th');
        th.className = 'vac-month-header';
        th.colSpan = group.end - group.start + 1;
        const span = document.createElement('span');
        span.className = 'vac-month-text';
        span.textContent = group.label;
        th.appendChild(span);
        monthRow.appendChild(th);
      });

      thead.appendChild(monthRow);
      thead.appendChild(dayRow);
      return thead;
    }

    function createBodyRows() {
      const fragment = document.createDocumentFragment();
      groupAnchors = [];
      let cursor = 0;
      const grouped = (typeof getRosterOrdering === 'function') ? getRosterOrdering() : [];

      grouped.forEach((group, gi) => {
        const members = group.members || [];
        if (members.length === 0) return;

        // ★修正: グループごとに tbody を分ける
        const groupTbody = document.createElement('tbody');
        groupTbody.className = 'gantt-group';

        const groupTitle = getGroupTitle(group, gi);
        const anchorId = `${(ganttRoot && ganttRoot.id) ? `${ganttRoot.id}-` : ''}group-${gi}`;
        groupAnchors.push({ id: anchorId, title: groupTitle, memberCount: members.length });

        members.forEach((member, mi) => {
          const tr = document.createElement('tr');
          // グループの最後の行にクラスを追加
          if (mi === members.length - 1) {
            tr.classList.add('group-last-row');
          }
          if (mi === 0) {
            tr.id = anchorId;
            tr.dataset.groupIndex = String(gi);
            const gth = document.createElement('th');
            gth.textContent = groupTitle;
            gth.className = 'group-name';
            gth.rowSpan = members.length;
            tr.appendChild(gth);
          }
          const nameTh = document.createElement('th');
          nameTh.textContent = member.name || '';
          nameTh.className = 'member-name';
          nameTh.dataset.memberIndex = String(cursor);
          tr.appendChild(nameTh);

          dateSlots.forEach(date => {
            const td = document.createElement('td');
            td.className = 'vac-cell';
            td.dataset.date = date;
            td.dataset.memberIndex = String(cursor);
            const d = new Date(date);
            const dow = d.getDay();
            if (dow === 0) td.classList.add('weekend-sun');
            if (dow === 6) td.classList.add('weekend-sat');
            td.setAttribute('role', 'button');
            td.setAttribute('aria-label', `${group.title || ''} ${member.name || ''} ${date}`);
            td.setAttribute('aria-pressed', 'false');
            tr.appendChild(td);
          });
          groupTbody.appendChild(tr);
          cursor += 1;
        });
        fragment.appendChild(groupTbody);
      });
      return fragment;
    }

    function applyHolidayColor(holidays) {
      latestHolidaySet = holidays instanceof Set ? holidays : new Set();
      if (!tableEl) return;
      if (holidayPaletteIndex >= 0) {
        latestHolidaySet.forEach(date => {
          const currentIdx = ensureDateColor(date);
          const defaultIdx = getDefaultColorIndex(date);
          if (currentIdx === defaultIdx) {
            dateColorMap.set(date, holidayPaletteIndex);
          }
        });
      }
      applyAllColumnColors();
    }

    async function resolveHolidays() {
      // 手動定義の祝日リストのみを使用（CSP違反回避のため外部API呼び出しを削除）
      const set = new Set(MANUAL_HOLIDAYS.map(normalizeDateStr).filter(Boolean));
      return set;
    }

    function renderTable() {
      if (!ganttRoot) return;
      ganttRoot.textContent = '';
      tableEl = document.createElement('table');
      tableEl.appendChild(createHeaderRow());
      tableEl.appendChild(createBodyRows());
      // DOM追加前にスタイル適用を行うことでLayout Thrashingを防ぐ
      applyAllColumnColors();
      applyBitsToCells();
      resolveHolidays().then(set => {
        applyHolidayColor(set);
        ganttRoot.appendChild(tableEl);
        if (statusEl) {
          ganttRoot.appendChild(statusEl);
        }
      });
    }

    function handlePointerDown(e) {
      const cell = e.target.closest('.vac-cell');
      if (!cell) return;
      // 左クリック（button === 0）のみ受け付ける
      if (e.button !== 0) return;
      const idx = Number(cell.dataset.memberIndex || '-1');
      if (idx < 0) return;
      const date = cell.dataset.date;
      const currentOn = cell.classList.contains('on');
      const toValue = !currentOn;
      draggingState = {
        toValue,
        startX: e.clientX,
        startY: e.clientY,
        hasDragged: false,
        startCell: cell
      };
      if (tableEl) {
        tableEl.classList.add('dragging');
      }
      toggleBit(date, idx, toValue);
      cell.classList.toggle('on', toValue);
    }

    function handlePointerOver(e) {
      if (!draggingState) return;
      const cell = e.target.closest('.vac-cell');
      if (!cell) return;
      const idx = Number(cell.dataset.memberIndex || '-1');
      if (idx < 0) return;
      const date = cell.dataset.date;
      if (draggingState.startCell && draggingState.startCell !== cell) {
        draggingState.hasDragged = true;
      }
      toggleBit(date, idx, draggingState.toValue);
      cell.classList.toggle('on', draggingState.toValue);
    }

    function handlePointerMove(e) {
      if (!draggingState) return;
      const movedX = typeof draggingState.startX === 'number' ? Math.abs((e.clientX || 0) - draggingState.startX) : 0;
      const movedY = typeof draggingState.startY === 'number' ? Math.abs((e.clientY || 0) - draggingState.startY) : 0;
      if (movedX > 2 || movedY > 2) {
        draggingState.hasDragged = true;
      }
      if (draggingState.hasDragged && e.cancelable) {
        e.preventDefault();
      }
    }

    function handlePointerUp() {
      draggingState = null;
      if (tableEl) {
        tableEl.classList.remove('dragging');
      }
    }

    function clearHoverHighlights() {
      if (!tableEl) return;
      tableEl.querySelectorAll('.hover-highlight').forEach(el => el.classList.remove('hover-highlight'));
    }

    function applyHoverHighlights(cell) {
      if (!tableEl || !cell) return;
      clearHoverHighlights();
      const date = cell.dataset.date;
      if (date) {
        tableEl.querySelectorAll(`[data-date="${date}"]`).forEach(el => el.classList.add('hover-highlight'));
      }
      const row = cell.closest('tr');
      if (row) {
        row.querySelectorAll('th, td').forEach(el => el.classList.add('hover-highlight'));
      }
    }

    function scrollToGroup(anchorId) {
      if (!anchorId || !tableEl) return;
      const target = tableEl.querySelector(`#${anchorId}`);
      if (target) {
        const container = scrollContainer || ganttRoot;
        if (container && container !== document.body && typeof container.scrollTo === 'function') {
          const targetRect = target.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const offsetTop = targetRect.top - containerRect.top + container.scrollTop;
          container.scrollTo({ top: offsetTop, behavior: 'smooth' });
        } else {
          target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        }
      }
    }

    function renderGroupJumps() {
      if (!jumpContainer) return;
      if (!groupAnchors.length) {
        jumpContainer.style.display = 'none';
        return;
      }
      jumpContainer.style.display = 'flex';
      const label = jumpContainer.querySelector('.jump-label') || (() => {
        const el = document.createElement('span');
        el.className = 'jump-label';
        el.textContent = 'グループジャンプ';
        jumpContainer.appendChild(el);
        return el;
      })();

      const buttonsWrap = jumpContainer.querySelector('.jump-buttons') || (() => {
        const wrap = document.createElement('div');
        wrap.className = 'jump-buttons';
        jumpContainer.appendChild(wrap);
        return wrap;
      })();

      const selectWrap = jumpContainer.querySelector('.jump-select') || (() => {
        const wrap = document.createElement('label');
        wrap.className = 'jump-select';
        const select = document.createElement('select');
        wrap.appendChild(select);
        jumpContainer.appendChild(wrap);
        return wrap;
      })();
      const selectEl = selectWrap.querySelector('select');

      const showButtons = groupJumpMode === 'buttons' || groupJumpMode === 'both';
      const showSelect = groupJumpMode === 'select' || groupJumpMode === 'both';

      label.style.display = '';

      buttonsWrap.textContent = '';
      if (showButtons) {
        buttonsWrap.style.display = 'flex';
        groupAnchors.forEach(anchor => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'jump-btn';
          const memberInfo = typeof anchor.memberCount === 'number' ? `（${anchor.memberCount}名）` : '';
          btn.textContent = `${anchor.title}${memberInfo}`;
          btn.addEventListener('click', () => scrollToGroup(anchor.id));
          buttonsWrap.appendChild(btn);
        });
      } else {
        buttonsWrap.style.display = 'none';
      }

      if (showSelect) {
        selectWrap.style.display = 'inline-flex';
        if (selectEl) {
          selectEl.innerHTML = '';
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = 'グループを選択';
          selectEl.appendChild(placeholder);
          groupAnchors.forEach(anchor => {
            const opt = document.createElement('option');
            opt.value = anchor.id;
            const memberInfo = typeof anchor.memberCount === 'number' ? `（${anchor.memberCount}名）` : '';
            opt.textContent = `${anchor.title}${memberInfo}`;
            selectEl.appendChild(opt);
          });
          selectEl.onchange = (e) => {
            const targetId = e.target.value;
            if (targetId) {
              scrollToGroup(targetId);
            }
          };
        }
      } else {
        selectWrap.style.display = 'none';
      }
    }

    function bindTableEvents() {
      if (!tableEl) return;
      const isAdmin = typeof isOfficeAdmin === 'function' ? isOfficeAdmin() : false;
      const thead = tableEl.querySelector('thead');
      if (thead) {
        thead.removeEventListener('click', handleColorCycle);
        if (isAdmin) {
          thead.addEventListener('click', handleColorCycle);
        }
      }
      tableEl.addEventListener('pointerdown', handlePointerDown);
      tableEl.addEventListener('pointerover', handlePointerOver);
      tableEl.addEventListener('pointermove', handlePointerMove, { passive: false });
      tableEl.addEventListener('touchmove', handlePointerMove, { passive: false });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => tableEl.addEventListener(ev, handlePointerUp));
      const tbody = tableEl.querySelector('tbody');
      if (tbody) {
        const handleHover = (e) => {
          const cell = e.target.closest('td.vac-cell');
          if (!cell) return;
          applyHoverHighlights(cell);
        };
        const handleOut = (e) => {
          const cell = e.target.closest('td.vac-cell');
          if (!cell) return;
          clearHoverHighlights();
        };
        tbody.addEventListener('mouseover', handleHover);
        tbody.addEventListener('mouseout', handleOut);
        tbody.addEventListener('focusin', handleHover);
        tbody.addEventListener('focusout', handleOut);
      }
      tableEl.addEventListener('mouseleave', clearHoverHighlights);
    }

    function rebuild() {
      if (!ganttRoot) return;
      closePalettePopup();
      orderedMembers = getMembersOrdered();
      dateSlots = buildDateSlots();
      syncDateColorMapWithSlots();
      parseBitsString(bitsInput?.value || '');
      renderTable();
      renderGroupJumps();
      bindTableEvents();
    }

    function init() {
      if (initialized) return;
      initialized = true;
      if (!ganttRoot) return;
      rebuild();
      if (opts.autoBind !== false) {
        if (startInput) {
          startInput.addEventListener('change', () => {
            rebuild();
            scheduleAutoSave('date-change');
          });
        }
        if (endInput) {
          endInput.addEventListener('change', () => {
            rebuild();
            scheduleAutoSave('date-change');
          });
        }
        if (bitsInput) {
          bitsInput.addEventListener('input', () => {
            parseBitsString(bitsInput.value);
            applyBitsToCells();
            // scheduleAutoSave('bits-input');
          });
        }
      }
      lastSavedState = captureCurrentState();
    }

    function reset() {
      bitsByDate.clear();
      if (tableEl) {
        tableEl.querySelectorAll('.vac-cell').forEach(td => td.classList.remove('on'));
      }
      rebuild();
    }

    function loadFromString(str) {
      parseBitsString(str || '');
      applyBitsToCells();
      updateBitsInput();
    }

    function setRangeAndBits(start, end, bits) {
      if (startInput) startInput.value = normalizeDateStr(start) || '';
      if (endInput) endInput.value = normalizeDateStr(end) || '';
      if (bitsInput) bitsInput.value = bits || '';
      rebuild();
    }

    function getBitsString() {
      updateBitsInput();
      return bitsInput?.value || '';
    }

    if (opts.autoInit !== false) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    }

    return {
      rebuild,
      reset,
      loadFromString,
      syncInput: updateBitsInput,
      init,
      setRangeAndBits,
      getBitsString,
      applyBitsToCells,
      applyDateColorMap: applyExternalDateColors,
      setSaveMode: (mode) => { saveMode = mode || 'vacation'; }
    };
  }

  // ★修正: DOM要素の取得を安全に行う
  const defaultController = createVacationGanttController({
    rootEl: document.getElementById('vacationGantt'),
    startInput: document.getElementById('vacationStartInput'),
    endInput: document.getElementById('vacationEndInput'),
    bitsInput: document.getElementById('vacationMembersBitsInput')
  });

  window.createVacationGantt = createVacationGanttController;
  window.VacationGantt = defaultController || {
    rebuild: () => { },
    reset: () => { },
    loadFromString: () => { },
    syncInput: () => { }
  };
})();

/* =========================================
   Part 2: データ通信・リスト制御 (追加部分)
   ========================================= */

let CURRENT_VACATIONS = [];
window.CURRENT_VACATIONS = CURRENT_VACATIONS;
let vacationsPollTimer = null;

// 休暇データの取得
async function fetchVacations(requestedOfficeId) {
  if (!SESSION_TOKEN) return;
  
  const targetOffice = requestedOfficeId || CURRENT_OFFICE_ID || '';
  if (!targetOffice) return;

  try {
    const res = await apiPost({
      action: 'getVacation',
      token: SESSION_TOKEN,
      office: targetOffice,
      nocache: '1' // ポーリング時はWorkerキャッシュを利用するため、ここではnocache=1でも問題ない(Worker側で制御)
    });

    if (res && res.vacations) {
      applyVacations(res.vacations);
    } else if (res && res.error === 'unauthorized') {
      await logout();
    }
  } catch (err) {
    console.error('fetchVacations error:', err);
  }
}

// 休暇データの適用・リスト描画
function applyVacations(list) {
  CURRENT_VACATIONS = Array.isArray(list) ? list : [];
  window.CURRENT_VACATIONS = CURRENT_VACATIONS;
  renderVacationList(CURRENT_VACATIONS);
}

// 休暇リストのHTML描画
function renderVacationList(list) {
  const container = document.getElementById('vacationList');
  if (!container) return;

  container.innerHTML = '';
  if (!list || list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'vacation-empty';
    empty.textContent = '予定は登録されていません';
    container.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach(v => {
    // visible=false のものは表示しない (管理画面ではないため)
    // ※もし管理画面兼用ならフラグチェックで分岐する
    if (v.visible === false) return;

    const item = document.createElement('div');
    item.className = 'vacation-item';
    if (v.color) item.classList.add(`vac-color-${v.color}`);
    
    // 日付整形
    const startStr = v.startDate ? v.startDate.replace(/-/g, '/') : '';
    const endStr = v.endDate ? v.endDate.replace(/-/g, '/') : '';
    const dateRange = (startStr === endStr || !endStr) 
      ? startStr 
      : `${startStr} ～ ${endStr}`;

    const titleDiv = document.createElement('div');
    titleDiv.className = 'vacation-item-title';
    titleDiv.textContent = v.title || '(名称なし)';
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'vacation-item-meta';
    metaDiv.textContent = dateRange;

    // クリックで詳細などを表示したい場合はイベントリスナーを追加
    // item.addEventListener('click', () => { ... });

    item.appendChild(titleDiv);
    item.appendChild(metaDiv);
    frag.appendChild(item);
  });
  container.appendChild(frag);
}

// ポーリング開始 (sync.jsから呼ばれる)
// ★修正: Visibility API対応
function startVacationsPolling() {
  if (vacationsPollTimer || window._vacationsVisibilityHandler) return;
  
  // 設定値を利用（なければ10分）
  const interval = (typeof CONFIG !== 'undefined' && CONFIG.eventSyncIntervalMs) 
    ? CONFIG.eventSyncIntervalMs 
    : 600000;

  // 初回即時実行
  fetchVacations();

  // ★追加: Visibility API対応
  window._vacationsVisibilityHandler = () => {
    if (document.hidden) {
      if (vacationsPollTimer) {
        clearInterval(vacationsPollTimer);
        vacationsPollTimer = null;
      }
    } else {
      if (!vacationsPollTimer) {
        fetchVacations();
        vacationsPollTimer = setInterval(fetchVacations, interval);
      }
    }
  };
  document.addEventListener('visibilitychange', window._vacationsVisibilityHandler);

  if (!document.hidden) {
    vacationsPollTimer = setInterval(() => {
        fetchVacations();
    }, interval);
  }
}

function stopVacationsPolling() {
  if (vacationsPollTimer) { clearInterval(vacationsPollTimer); vacationsPollTimer = null; }
  // ★追加: Visibility Handler解除
  if (window._vacationsVisibilityHandler) {
    document.removeEventListener('visibilitychange', window._vacationsVisibilityHandler);
    window._vacationsVisibilityHandler = null;
  }
}

// グローバル公開
window.fetchVacations = fetchVacations;
window.startVacationsPolling = startVacationsPolling;
window.stopVacationsPolling = stopVacationsPolling;
window.renderVacationList = renderVacationList;
window.applyVacations = applyVacations;

`

### js/offices.js

```javascript
/**
 * js/offices.js - 拠点管理
 *
 * 公開拠点一覧の取得と選択UIを管理する。
 *
 * 依存: js/constants/ui.js (ID_RE), js/globals.js, js/utils.js
 * 参照元: js/auth.js, main.js
 *
 * @see MODULE_GUIDE.md
 */

/* 認証UI（公開オフィス一覧） */
function ensureAuthUIPublicError(){}

async function refreshPublicOfficeSelect(selectedId){
  const loginBtn=document.getElementById('btnLogin');
  if(officeSel) officeSel.disabled=false;
  if(pwInput) pwInput.disabled=false;
  if(loginBtn) loginBtn.disabled=false;
  if(loginMsg) loginMsg.textContent='';

  // 開発モード（isDev=true）の場合、あるいは管理用フォールバック
  if (typeof isDev !== 'undefined' && isDev) {
    console.log("【DEBUG】開発モード: 手入力ログインが有効です");
  }

  // 自動または引数で渡されたIDがあればセット
  if(selectedId && officeSel) {
    officeSel.value=selectedId;
  }
}

`

### js/firebase-config.js

```javascript
/**
 * js/firebase-config.js
 * 
 * Firebase プロジェクトの設定情報を記述します。
 * Firebase コンソール > プロジェクト設定 > 全般 > マイアプリ で取得した内容を貼り付けてください。
 */

export const firebaseConfig = {
  // Firebase コンソールから取得したプロジェクト設定
  apiKey: "AIzaSyA_CKaAyt7aiZ0tXgv-0lHviCVV4y8urBQ",
  authDomain: "whereabouts-f3388.firebaseapp.com",
  projectId: "whereabouts-f3388",
  storageBucket: "whereabouts-f3388.firebasestorage.app",
  messagingSenderId: "578171146712",
  appId: "1:578171146712:web:b36ba48f99eae97f6ba2ad",
  measurementId: "G-SLXCBCX483"
};

`

### js/firebase-auth.js

```javascript
/**
 * js/firebase-auth.js
 * 
 * Firebase Authentication (Email/Password) と Worker バックエンドを連携させる。
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendEmailVerification,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * ユーザー登録 (サインアップ)
 * 1. Firebase Auth でアカウント作成
 * 2. 確認メール送信
 */
export async function signup(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCredential.user);
    return { ok: true, user: userCredential.user };
  } catch (error) {
    console.error('Signup Error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * ログイン
 */
export async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      // [AFTER] 未認証の場合は自動で確認メールを再送する
      await sendEmailVerification(user);
      return { ok: false, error: 'email_not_verified' };
    }

    // Worker 側へアカウント同期 (初回ログイン時など)
    const token = await user.getIdToken();
    const resp = await syncUserWithWorker(token);

    return { ok: true, user, workerResult: resp };
  } catch (error) {
    console.error('Login Error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Worker にユーザー情報を登録 (サインアップ後の初アクセス時など)
 */
async function syncUserWithWorker(token) {
  const params = new URLSearchParams();
  params.append('action', 'signup');
  params.append('token', token);

  const endpoint = CONFIG.remoteEndpoint;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return await resp.json();
}

/**
 * 現在の有効な ID Token を取得
 */
export async function getValidToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken(true);
}

/**
 * ログアウト
 */
export async function logout() {
  await signOut(auth);
  // localStorage.clear(); // [FIX] 他拠点の保存データまで消してしまうため、Firebaseのサインアウトのみに留める
  location.reload();
}

/**
 * 認証状態の監視
 */
export function watchAuthState(callback) {
  onAuthStateChanged(auth, (user) => {
    callback(user);
  });
}

`

### js/auth.js

```javascript
/**
 * js/auth.js - 認証 UI & ハイブリッド連携 (Shared PW + Firebase)
 * 
 * 1. 拠点ログイン (共有パスワード): 現場社員・管理スタッフ用
 * 2. 管理者ポータル (Firebase): オーナー用 (拠点開設・管理者登録)
 * 
 * [REF] js/constants/messages.js, js/sync.js, CloudflareWorkers_worker.js
 */

import { 
  signup as fbSignup, 
  login as fbLogin, 
  logout as fbLogout, 
  watchAuthState,
  getValidToken as getFbToken
} from './firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

/**
 * @typedef {Object} SessionContext
 * @property {'firebase'|'d1'} authType - 認証方式
 * @property {string} officeId - 拠点ID（小文字統一）
 * @property {string} role - 権限（'admin'|'staff'）
 * @property {string} token - Firebase idToken または D1 セッションID
 */

// DOM Elements
const loginEl = document.getElementById('login');
const loginFormEl = document.getElementById('loginForm');
const board = document.getElementById('board');
const loginMsg = document.getElementById('loginMsg');
const adminBtn = document.getElementById('adminBtn');
const logoutBtn = document.getElementById('logoutBtn');
const toolsBtn = document.getElementById('toolsBtn');
const manualBtn = document.getElementById('manualBtn');
const qrBtn = document.getElementById('qrBtn');
const qrModal = document.getElementById('qrModal');
const btnSimpleLogin = document.getElementById('btnSimpleLogin');

// Auth State Variables
let isBooting = true;
const PERSISTENT_SESSION_KEY = 'whereabouts_persistent_session';
const D1_SESSION_LOCK_KEY = 'whereabouts_auth_type';

console.log('【DEBUG】js/auth.js Loaded (Version: v20260414_v2)');

/**
 * ハイブリッド認証（Firebase/D1）の管理クラス
 */
export const AuthManager = {
    config: null,
    session: null,

    /**
     * 初期化処理。D1セッションをFirebaseより優先してチェックする（Flicker防止）。
     */
    async init(config) {
        this.config = config;
        this.checkFirebaseConfig();
        
        console.log('【DEBUG】AuthManager.init 開始');

        // URLパラメータによる自動入力 (?office=拠点ID)
        this.handleUrlParams();

        // 1. D1セッションロックの確認（Flicker防止）
        const authType = sessionStorage.getItem(D1_SESSION_LOCK_KEY);
        if (authType === 'd1') {
            console.log("[Auth] D1 Session Lock Active.");
            const restored = await this.restoreD1Session();
            if (restored) return true;
        }

        // 2. Firebase の状態を確認 (オーナー用)
        return new Promise((resolve) => {
            watchAuthState(async (user) => {
                console.log('【DEBUG】watchAuthState 通知受理. User:', user ? user.email : 'null');
                
                // D1セッションがアクティブな場合は Firebase の状態変化を完全に遮断
                if (sessionStorage.getItem(D1_SESSION_LOCK_KEY) === 'd1') {
                    console.log('【DEBUG】[ガード] D1セッション中につき Firebase 状態変化を無視します');
                    return;
                }

                if (user) {
                    const result = await this.handleFirebaseUser(user);
                    resolve(result);
                } else {
                    if (isBooting && !window.SESSION_TOKEN) {
                        switchAuthView('officeLogin');
                    }
                    resolve(false);
                }
                isBooting = false;
            });
        });
    },

    /**
     * Firebase 設定バリデーション
     */
    checkFirebaseConfig() {
        if (!firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY') {
            console.warn('[Auth] Firebase configuration is incomplete.');
            if (btnSimpleLogin) {
                // IDに@が含まれる場合はFirebaseログインを促すため、バリデーションはログイン時に行う
                // ただし、管理者登録ボタンなどはここで制御可能
            }
        }
    },

    /**
     * URLパラメータの処理
     */
    handleUrlParams() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const officeParam = urlParams.get('office');
            if (officeParam) {
                const idInput = document.getElementById('loginOfficeId');
                if (idInput) {
                    idInput.value = officeParam;
                    idInput.style.backgroundColor = '#f0f9ff'; 
                    setTimeout(() => { idInput.style.backgroundColor = ''; }, 2000);
                }
            }
        } catch (e) {
            console.warn('URL parameter auto-fill failed:', e);
        }
    },

    /**
     * D1セッションの復元
     */
    async restoreD1Session() {
        const storedToken = localStorage.getItem(SESSION_KEY);
        const storedOffice = localStorage.getItem(LOCAL_OFFICE_KEY);
        
        if (storedToken && storedOffice) {
            try {
                const res = await this.fetchFromWorker('renew', { token: storedToken });
                if (res.ok && res.office === storedOffice) {
                    console.log('【DEBUG】D1セッションの検証に成功しました');
                    this.session = this.createSessionContext('d1', {
                        token: storedToken,
                        officeId: storedOffice,
                        role: res.role || localStorage.getItem(LOCAL_ROLE_KEY) || 'user',
                        officeName: localStorage.getItem(LOCAL_OFFICE_NAME_KEY) || storedOffice
                    });
                    await finalizeLogin(res);
                    isBooting = false;
                    return true;
                }
            } catch (e) {
                console.error('【DEBUG】D1セッション復元中に例外発生:', e);
            }
        }
        sessionStorage.removeItem(D1_SESSION_LOCK_KEY);
        return false;
    },

    /**
     * Firebaseユーザーの処理
     */
    async handleFirebaseUser(user) {
        if (user.email && !user.emailVerified) {
            const urlParams = new URLSearchParams(window.location.search);
            const hasOfficeParam = !!urlParams.get('office');
            
            if (window.SESSION_TOKEN || sessionStorage.getItem(PERSISTENT_SESSION_KEY) || hasOfficeParam) {
                return;
            }
            switchAuthView('verify');
            return false;
        }

        try {
            const fbToken = await getFbToken();
            const resp = await this.fetchFromWorker('signup', { token: fbToken });
            
            if (resp.ok) {
                if (resp.user && resp.user.office_id) {
                    const loginResp = await this.fetchFromWorker('renew', { token: fbToken });
                    if (loginResp.ok) {
                        this.session = this.createSessionContext('firebase', {
                            token: fbToken,
                            officeId: loginResp.office,
                            role: loginResp.role,
                            officeName: loginResp.officeName
                        });
                        await finalizeLogin(loginResp);
                        return true;
                    }
                } else if (isBooting) {
                    switchAuthView('createOffice');
                }
            } else {
                this.handleWorkerError(resp);
            }
        } catch (e) {
            showError(`通信エラーが発生しました: ${e.message}`);
        }
        return false;
    },

    /**
     * 入力値によるログイン仕分け
     */
    async login(id, password) {
        if (loginMsg) loginMsg.textContent = '認証中...';

        if (id.includes('@')) {
            // Firebase設定チェック
            if (!firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY') {
                showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.CONFIG_INCOMPLETE : 'Firebaseの設定が未完了です。');
                return;
            }
            const res = await fbLogin(id, password);
            if (res.ok) {
                sessionStorage.setItem(D1_SESSION_LOCK_KEY, 'firebase');
                location.reload();
            } else {
                if (res.error === 'email_not_verified') switchAuthView('verify');
                else showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.AUTH_FAILED : 'ログインに失敗しました。');
            }
        } else {
            // IDを小文字化してD1認証へ
            const officeId = id.toLowerCase();
            const res = await this.fetchFromWorker('login', { office: officeId, password });
            if (res.ok) {
                this.session = this.createSessionContext('d1', {
                    token: res.token,
                    officeId: res.office,
                    role: res.role,
                    officeName: res.officeName
                });
                await finalizeLogin(res);
            } else {
                showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.NOT_FOUND : 'ログインに失敗しました。');
            }
        }
    },

    /**
     * 統一されたSessionContextの生成
     * @param {'firebase'|'d1'} type
     * @param {Object} data
     * @returns {SessionContext}
     */
    createSessionContext(type, data) {
        const session = {
            authType: type,
            officeId: data.officeId.toLowerCase(),
            role: data.role || 'staff',
            token: data.token
        };
        sessionStorage.setItem(D1_SESSION_LOCK_KEY, type);
        return session;
    },

    /**
     * Worker 通通信用ヘルパー
     */
    async fetchFromWorker(action, bodyParams) {
        const params = new URLSearchParams();
        params.append('action', action);
        for (const key in bodyParams) {
          if (bodyParams[key] != null) params.append(key, bodyParams[key]);
        }

        const endpoint = window.CONFIG ? window.CONFIG.remoteEndpoint : (typeof CONFIG !== 'undefined' ? CONFIG.remoteEndpoint : '');
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params
        });
        return await resp.json();
    },

    handleWorkerError(resp) {
        if (resp.error === 'email_not_verified') {
            switchAuthView('verify');
        } else {
            if (loginEl) loginEl.classList.remove('u-hidden');
            switchAuthView('officeLogin');
            const errMsg = resp.hint ? `${resp.message} (${resp.hint})` : (resp.message || resp.error || '不明なエラー');
            showError(`システムエラー: ${errMsg}`);
        }
    }
};

/**
 * UI の切り替え
 */
function switchAuthView(view) {
  console.log(`【DEBUG】switchAuthView 遷移先: ${view}`);
  const areas = ['loginFormArea', 'signupFormArea', 'verifyEmailArea', 'createOfficeArea'];
  areas.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('u-hidden');
  });

  if (loginEl && loginFormEl) {
    const isVerifiedView = (view === 'officeLogin' || view === 'verify' || view === 'createOffice');
    const isBoardVisible = (board && !board.classList.contains('u-hidden')) || sessionStorage.getItem(PERSISTENT_SESSION_KEY);
    
    if (isVerifiedView && (SESSION_TOKEN || sessionStorage.getItem(PERSISTENT_SESSION_KEY)) && isBoardVisible) {
      return;
    }
    
    loginEl.classList.remove('u-hidden');
    loginFormEl.classList.remove('u-hidden');
  }

  if (board && view !== 'adminPortal') board.classList.add('u-hidden');

  const targetId = {
    'officeLogin': 'loginFormArea',
    'adminPortal': 'loginFormArea',
    'signup': 'signupFormArea',
    'verify': 'verifyEmailArea',
    'createOffice': 'createOfficeArea'
  }[view];

  if (targetId) {
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.classList.remove('u-hidden');
      if (loginMsg) loginMsg.textContent = '';
    }
  }
}

/**
 * ログイン完了処理
 */
async function finalizeLogin(data) {
  if (!data || !data.office) {
    console.error('【DEBUG】不正なログインデータです。', data);
    return;
  }

  window.CURRENT_OFFICE_ID = data.office;
  window.CURRENT_ROLE = data.role || 'user';
  window.SESSION_TOKEN = data.token;
  isBooting = false;

  localStorage.setItem(SESSION_KEY, window.SESSION_TOKEN);
  localStorage.setItem(LOCAL_OFFICE_KEY, window.CURRENT_OFFICE_ID);
  localStorage.setItem(LOCAL_ROLE_KEY, CURRENT_ROLE);
  const officeName = data.officeName || CURRENT_OFFICE_ID;
  localStorage.setItem(LOCAL_OFFICE_NAME_KEY, officeName);
  
  if (typeof updateTitleBtn === 'function') updateTitleBtn(officeName);

  if (loginEl) loginEl.classList.add('u-hidden');
  if (loginFormEl) loginFormEl.classList.add('u-hidden');
  if (board) board.classList.remove('u-hidden');
  
  sessionStorage.setItem(PERSISTENT_SESSION_KEY, 'true');
  ensureAuthUI();

  // 同期サイクル
  if (typeof startRemoteSync === 'function') startRemoteSync(true);
  if (typeof startConfigWatch === 'function') startConfigWatch();
  if (typeof startNoticesPolling === 'function') startNoticesPolling();
  if (typeof startEventSync === 'function') startEventSync(true);
  if (typeof loadEvents === 'function') loadEvents(window.CURRENT_OFFICE_ID);
}

/**
 * エラー表示
 */
function showError(msg) {
  if (loginMsg) {
    let displayMsg = msg;
    if (typeof AUTH_MESSAGES !== 'undefined') {
      if (msg.includes('auth/email-already-in-use')) displayMsg = AUTH_MESSAGES.ERROR.EMAIL_ALREADY_IN_USE;
      else if (msg.includes('auth/weak-password')) displayMsg = AUTH_MESSAGES.ERROR.WEAK_PASSWORD;
      else if (msg.includes('auth/invalid-email')) displayMsg = AUTH_MESSAGES.ERROR.INVALID_EMAIL;
      else if (msg.includes('auth/user-not-found') || msg.includes('auth/wrong-password')) displayMsg = AUTH_MESSAGES.ERROR.NOT_FOUND;
    }
    
    loginMsg.textContent = displayMsg;
    loginMsg.style.color = 'var(--color-red-600)';
  }
}

/**
 * パスワードバリデーション
 */
function validatePassword(pw) {
    if (!pw) return false;
    if (pw.length < 12) return false;
    let types = 0;
    if (/[a-z]/.test(pw)) types++;
    if (/[A-Z]/.test(pw)) types++;
    if (/[0-9]/.test(pw)) types++;
    if (/[^a-zA-Z0-9]/.test(pw)) types++;
    return types >= 2;
}

// ---------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------

// ユニファイド・ログイン
document.getElementById('btnSimpleLogin')?.addEventListener('click', async () => {
    const loginId = document.getElementById('loginOfficeId').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!loginId || !password) return showError('拠点名またはメールアドレスとパスワードを入力してください。');
    
    await AuthManager.login(loginId, password);
});

// 管理者登録
document.getElementById('btnAuthSignup')?.addEventListener('click', async () => {
  const email = document.getElementById('signupEmail').value;
  const pw = document.getElementById('signupPw').value;

  if (!firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    return showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.CONFIG_INCOMPLETE : 'Firebaseの設定が完了していません。');
  }

  if (!email) return showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.INVALID_EMAIL : '正しいメールアドレスを入力してください。');
  
  if (!validatePassword(pw)) {
    return showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.INVALID_PASSWORD_FORMAT : 'パスワードは2種類以上の文字種を含む12文字以上で入力してください。');
  }

  const res = await fbSignup(email, pw);
  if (res.ok) {
    if (loginMsg) loginMsg.textContent = '';
    switchAuthView('verify');
  } else {
    showError(res.error || '登録失敗');
  }
});

// 新規拠点作成
document.getElementById('btnCreateOffice')?.addEventListener('click', async () => {
  const toHalfWidth = (str) => str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  
  const rawId = document.getElementById('newOfficeId').value.trim();
  const officeId = toHalfWidth(rawId).toLowerCase();
  const name = document.getElementById('newOfficeName').value.trim();
  const password = document.getElementById('newOfficePw').value;

  if (!officeId) return showError('オフィスIDを入力してください。');
  if (!officeId.match(/^[a-z0-9_]+$/)) return showError('オフィスIDは半角英数字と(_)のみ使用可能です。');
  if (!name || !password) return showError('全ての項目を入力してください。');

  if (!validatePassword(password)) {
    return showError(typeof AUTH_MESSAGES !== 'undefined' ? AUTH_MESSAGES.ERROR.INVALID_PASSWORD_FORMAT : 'パスワードは12文字以上、かつ2種類以上の文字種を含めてください。');
  }

  const fbToken = await getFbToken();
  const res = await AuthManager.fetchFromWorker('createOffice', { 
    token: fbToken, officeId, name, password 
  });
  
  if (res.ok) {
    toast('オフィスを作成しました！管理パネルで初期設定を行ってください。');
    const loginResp = await AuthManager.fetchFromWorker('renew', { token: fbToken });
    if (loginResp.ok) {
      await finalizeLogin(loginResp);
      if (typeof window.openAdminModal === 'function') window.openAdminModal();
    } else {
      location.reload();
    }
  } else {
    showError('作成失敗: ' + (res.error || '既にIDが使われています'));
  }
});

/**
 * QRコードモーダルの表示と動的生成
 */
export function showQrModal(show) {
  if (!qrModal) return;
  if (show) {
    let targetUrl = window.location.origin + window.location.pathname;
    if (CURRENT_OFFICE_ID) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'office=' + encodeURIComponent(CURRENT_OFFICE_ID);
    }

    try {
      const qrElement = document.getElementById('qrOutput');
      if (qrElement && typeof qrcode === 'function') {
        const qr = qrcode();
        qr.setTypeNumber(0);
        qr.setErrorCorrectionLevel('M');
        qr.addData(targetUrl);
        qr.make();
        
        qrElement.innerHTML = qr.createSvgTag(6, 8);
        const svg = qrElement.querySelector('svg');
        if (svg) {
          svg.style.width = '100%';
          svg.style.height = 'auto';
          svg.style.maxWidth = '200px';
          svg.style.margin = '0 auto';
          svg.style.display = 'block';
        }
      }
    } catch (e) {
      console.error('QR Generation failed:', e);
    }

    qrModal.classList.add('show');
    qrModal.style.display = 'flex';
  } else {
    qrModal.classList.remove('show');
    qrModal.style.display = 'none';
  }
}

document.getElementById('linkGotoSignup')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthView('signup'); });
document.getElementById('linkGotoLogin')?.addEventListener('click', (e) => { e.preventDefault(); switchAuthView('officeLogin'); });
document.getElementById('linkBackToLoginFromVerify')?.addEventListener('click', (e) => { e.preventDefault(); logoutAction(); });
document.getElementById('qrModalClose')?.addEventListener('click', () => showQrModal(false));
qrModal?.addEventListener('click', (e) => { if (e.target === qrModal) showQrModal(false); });
document.getElementById('btnVerifyDone')?.addEventListener('click', () => location.reload());

const logoutAction = async () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LOCAL_OFFICE_KEY);
  localStorage.removeItem(LOCAL_ROLE_KEY);
  sessionStorage.removeItem(PERSISTENT_SESSION_KEY);
  sessionStorage.removeItem(D1_SESSION_LOCK_KEY);
  await fbLogout();
};
document.getElementById('logoutBtn')?.addEventListener('click', logoutAction);
window.logout = logoutAction;
window.showQrModal = showQrModal;

function ensureAuthUI() {
  const loggedIn = !!window.SESSION_TOKEN;
  const isAdmin = loggedIn && (window.CURRENT_ROLE === 'owner' || window.CURRENT_ROLE === 'officeAdmin' || window.CURRENT_ROLE === 'superAdmin');
  
  if (adminBtn) adminBtn.style.display = isAdmin ? 'inline-block' : 'none';
  if (logoutBtn) logoutBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (toolsBtn) toolsBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (manualBtn) manualBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (qrBtn) qrBtn.style.display = loggedIn ? 'inline-block' : 'none';
  
  const nameFilter = document.getElementById('nameFilter');
  const statusFilter = document.getElementById('statusFilter');
  if (nameFilter) nameFilter.style.display = loggedIn ? 'inline-block' : 'none';
  if (statusFilter) statusFilter.style.display = loggedIn ? 'inline-block' : 'none';
  
  const adminOfficeRow = document.getElementById('adminOfficeRow');
  if (adminOfficeRow) adminOfficeRow.style.display = (window.CURRENT_ROLE === 'superAdmin') ? 'flex' : 'none';
}
window.ensureAuthUI = ensureAuthUI;
export const checkLogin = () => AuthManager.init({ remoteEndpoint: window.CONFIG ? window.CONFIG.remoteEndpoint : (typeof CONFIG !== 'undefined' ? CONFIG.remoteEndpoint : '') });
window.checkLogin = checkLogin;

`

### js/sync.js

```javascript
/**
 * js/sync.js - データ同期・通信ロジック
 *
 * Cloudflare Workers経由のポーリングと設定監視を管理する。
 *
 * 依存: js/config.js, js/constants/*.js, js/globals.js, js/utils.js
 * 参照元: js/auth.js, main.js
 *
 * @see MODULE_GUIDE.md
 */

/* ===== メニュー・正規化・通信・同期 ===== */
/* DEFAULT_BUSINESS_HOURS は constants/defaults.js で定義 */

// ポーリング状態管理
let lastPollTime = 0;

// ★修正: STATE_CACHE と lastSyncTimestamp を localStorage から初期化
let STATE_CACHE = {};
let lastSyncTimestamp = 0;
let conflictRecoveryState = {};

const SYNC_DECISION = Object.freeze({
  APPLY: 'apply',
  SKIP: 'skip',
  HEAL: 'heal'
});

const SYNC_LOG_KEYS = Object.freeze({
  memberId: 'memberId',
  remoteRev: 'remoteRev',
  localRev: 'localRev',
  remoteServerUpdated: 'remoteServerUpdated',
  localServerUpdated: 'localServerUpdated',
  decision: 'decision'
});

const DEFAULT_SYNC_LOG_SETTINGS = Object.freeze({
  skipWarnThreshold: DEFAULT_SYNC_CONFLICT_STREAK_WARN_THRESHOLD
});

let syncSkipStreak = 0;
let syncConflictStreak = 0;

function getSyncLogSettings() {
  const fromConfig = (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.syncLog === 'object')
    ? CONFIG.syncLog
    : null;
  const threshold = Number(fromConfig?.skipWarnThreshold);
  return {
    skipWarnThreshold: Number.isFinite(threshold) && threshold > 0
      ? threshold
      : DEFAULT_SYNC_LOG_SETTINGS.skipWarnThreshold
  };
}

function getSyncSelfHealSettings() {
  const fromConfig = (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.syncSelfHeal === 'object')
    ? CONFIG.syncSelfHeal
    : null;
  const revRescueWindowMs = Number(fromConfig?.revRescueWindowMs);
  const revSkewHealWindowMs = Number(fromConfig?.revSkewHealWindowMs);
  const cacheTtlMs = Number(fromConfig?.cacheTtlMs);
  const conflictStreakWarnThreshold = Number(fromConfig?.conflictStreakWarnThreshold);

  return {
    revRescueWindowMs: Number.isFinite(revRescueWindowMs) && revRescueWindowMs > 0
      ? revRescueWindowMs
      : DEFAULT_SYNC_REV_RESCUE_WINDOW_MS,
    revSkewHealWindowMs: Number.isFinite(revSkewHealWindowMs) && revSkewHealWindowMs > 0
      ? revSkewHealWindowMs
      : DEFAULT_SYNC_REV_SKEW_HEAL_WINDOW_MS,
    cacheTtlMs: Number.isFinite(cacheTtlMs) && cacheTtlMs > 0
      ? cacheTtlMs
      : DEFAULT_SYNC_CACHE_TTL_MS,
    conflictStreakWarnThreshold: Number.isFinite(conflictStreakWarnThreshold) && conflictStreakWarnThreshold > 0
      ? conflictStreakWarnThreshold
      : DEFAULT_SYNC_CONFLICT_STREAK_WARN_THRESHOLD
  };
}

function getSyncRecoverySettings() {
  const fromConfig = (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.syncRecovery === 'object')
    ? CONFIG.syncRecovery
    : null;
  const conflictThreshold = Number(fromConfig?.conflictThreshold);
  const windowMs = Number(fromConfig?.windowMs);

  return {
    conflictThreshold: Number.isFinite(conflictThreshold) && conflictThreshold > 0
      ? conflictThreshold
      : DEFAULT_SYNC_RECOVERY_CONFLICT_THRESHOLD,
    windowMs: Number.isFinite(windowMs) && windowMs > 0
      ? windowMs
      : DEFAULT_SYNC_RECOVERY_WINDOW_MS
  };
}

function getSyncCacheValidationSettings() {
  const fromConfig = (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.syncCacheValidation === 'object')
    ? CONFIG.syncCacheValidation
    : null;
  const maxRev = Number(fromConfig?.maxRev);
  const maxServerUpdatedAheadMs = Number(fromConfig?.maxServerUpdatedAheadMs);
  const purgeDriftThresholdMs = Number(fromConfig?.purgeDriftThresholdMs);

  return {
    maxRev: Number.isInteger(maxRev) && maxRev > 0
      ? maxRev
      : DEFAULT_SYNC_CACHE_MAX_REV,
    maxServerUpdatedAheadMs: Number.isFinite(maxServerUpdatedAheadMs) && maxServerUpdatedAheadMs >= 0
      ? maxServerUpdatedAheadMs
      : DEFAULT_SYNC_CACHE_MAX_SERVER_UPDATED_AHEAD_MS,
    purgeDriftThresholdMs: Number.isFinite(purgeDriftThresholdMs) && purgeDriftThresholdMs > 0
      ? purgeDriftThresholdMs
      : DEFAULT_SYNC_CACHE_PURGE_DRIFT_THRESHOLD_MS
  };
}

function logSyncDecision(input) {
  const payload = input && typeof input === 'object' ? input : {};
  const settings = getSyncLogSettings();
  const decision = String(payload.decision || SYNC_DECISION.SKIP);

  const event = {
    [SYNC_LOG_KEYS.memberId]: String(payload.memberId || ''),
    [SYNC_LOG_KEYS.remoteRev]: Number(payload.remoteRev || 0),
    [SYNC_LOG_KEYS.localRev]: Number(payload.localRev || 0),
    [SYNC_LOG_KEYS.remoteServerUpdated]: Number(payload.remoteServerUpdated || 0),
    [SYNC_LOG_KEYS.localServerUpdated]: Number(payload.localServerUpdated || 0),
    [SYNC_LOG_KEYS.decision]: decision
  };

  console.info('[sync-decision]', event);

  if (decision === SYNC_DECISION.SKIP) {
    syncSkipStreak += 1;
    if (syncSkipStreak >= settings.skipWarnThreshold && (syncSkipStreak % settings.skipWarnThreshold) === 0) {
      console.warn('[sync-decision-skip-streak]', {
        skipStreak: syncSkipStreak,
        skipWarnThreshold: settings.skipWarnThreshold,
        lastMemberId: event.memberId
      });
    }
    return;
  }

  syncSkipStreak = 0;
}

function reportConflictStreak(memberId) {
  const settings = getSyncSelfHealSettings();
  syncConflictStreak += 1;
  if (syncConflictStreak >= settings.conflictStreakWarnThreshold && (syncConflictStreak % settings.conflictStreakWarnThreshold) === 0) {
    console.warn('[sync-conflict-streak]', {
      conflictStreak: syncConflictStreak,
      conflictStreakWarnThreshold: settings.conflictStreakWarnThreshold,
      lastMemberId: String(memberId || '')
    });
  }
}

function resetConflictStreak() {
  syncConflictStreak = 0;
}

const SYNC_HEAL_REASON = Object.freeze({
  NONE: 'none',
  NORMAL: 'normal',
  HEAL: 'heal',
  REPAIR: 'repair'
});

function evaluateRemoteStateDecision(remoteRev, localRev, remoteServerUpdated, localServerUpdated) {
  const settings = getSyncSelfHealSettings();
  const cacheValidation = getSyncCacheValidationSettings();
  const hasInvalidLocalRev = !Number.isFinite(localRev) || localRev < 0 || localRev > cacheValidation.maxRev;

  if (hasInvalidLocalRev) {
    return {
      shouldApply: true,
      reason: SYNC_HEAL_REASON.REPAIR
    };
  }

  if (remoteRev > localRev) {
    return {
      shouldApply: true,
      reason: SYNC_HEAL_REASON.NORMAL
    };
  }

  const skewMs = remoteServerUpdated - localServerUpdated;
  if (remoteRev <= localRev && skewMs > settings.revSkewHealWindowMs) {
    return {
      shouldApply: true,
      reason: SYNC_HEAL_REASON.HEAL
    };
  }

  return {
    shouldApply: false,
    reason: SYNC_HEAL_REASON.NONE
  };
}

// Configからキーを取得（読み込み順序に依存するため安全策をとる）
const STORAGE_KEY_CACHE = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys) ? CONFIG.storageKeys.stateCache : STORAGE_KEY_CACHE_FALLBACK;
const STORAGE_KEY_SYNC = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys) ? CONFIG.storageKeys.lastSync : STORAGE_KEY_SYNC_FALLBACK;
const STORAGE_KEY_CONFLICT_RECOVERY = (typeof CONFIG !== 'undefined' && CONFIG.storageKeys && typeof CONFIG.storageKeys.conflictRecovery === 'string' && CONFIG.storageKeys.conflictRecovery)
  ? CONFIG.storageKeys.conflictRecovery
  : STORAGE_KEY_CONFLICT_RECOVERY_FALLBACK;

function serializeStateCachePayload(cache) {
  return JSON.stringify({
    savedAt: Date.now(),
    state: cache
  });
}

function restoreStateCache(rawCache) {
  if (!rawCache) return;
  try {
    const parsed = JSON.parse(rawCache);
    const settings = getSyncSelfHealSettings();

    if (parsed && typeof parsed === 'object' && parsed.state && typeof parsed.state === 'object') {
      const savedAt = Number(parsed.savedAt || 0);
      const isFresh = Number.isFinite(savedAt) && (Date.now() - savedAt) <= settings.cacheTtlMs;
      if (isFresh) {
        STATE_CACHE = parsed.state;
        return;
      }
      // 有効期限切れの場合は同期時刻もリセットして漏れを防ぐ
      purgeSyncLocalCache('cache-expired');
      return;
    }

    if (parsed && typeof parsed === 'object') {
      STATE_CACHE = parsed;
    }
  } catch (e) {
    console.error('Failed to parse state cache:', e);
    purgeSyncLocalCache('parse-error');
  }
}

function purgeSyncLocalCache(reason, details = {}) {
  STATE_CACHE = {};
  lastSyncTimestamp = 0;
  localStorage.removeItem(STORAGE_KEY_CACHE);
  localStorage.removeItem(STORAGE_KEY_SYNC);
  console.warn('[sync-cache-restore]', {
    fullPurge: true,
    reason: String(reason || 'unspecified'),
    removedRows: Number(details.removedRows || 0),
    ...details
  });
}

function sanitizeStateCache(cache, lastSyncTs) {
  if (!cache || typeof cache !== 'object') {
    return {
      sanitizedCache: {},
      removedRows: 0,
      fullPurge: false
    };
  }

  const settings = getSyncCacheValidationSettings();
  const now = Date.now();
  const sanitizedCache = {};
  let removedRows = 0;
  let hasDriftOverflow = false;

  Object.entries(cache).forEach(([memberId, row]) => {
    if (!row || typeof row !== 'object') {
      removedRows += 1;
      return;
    }

    const rev = Number(row.rev);
    const serverUpdated = Number(row.serverUpdated);
    const isRevValid = Number.isInteger(rev) && rev >= 0 && rev <= settings.maxRev;
    const isServerUpdatedValid = Number.isFinite(serverUpdated)
      && serverUpdated >= 0
      && serverUpdated <= (now + settings.maxServerUpdatedAheadMs);

    if (!isRevValid || !isServerUpdatedValid) {
      removedRows += 1;
      return;
    }

    if (Number.isFinite(lastSyncTs) && lastSyncTs > 0) {
      const drift = Math.abs(serverUpdated - lastSyncTs);
      if (drift > settings.purgeDriftThresholdMs) {
        hasDriftOverflow = true;
      }
    }

    sanitizedCache[String(memberId)] = row;
  });

  return {
    sanitizedCache,
    removedRows,
    fullPurge: hasDriftOverflow,
    driftThresholdMs: settings.purgeDriftThresholdMs
  };
}

function normalizeConflictRecoveryState(rawState) {
  if (!rawState || typeof rawState !== 'object') {
    return {};
  }

  const normalized = {};
  Object.entries(rawState).forEach(([memberId, value]) => {
    if (!value || typeof value !== 'object') {
      return;
    }
    const count = Number(value.count || 0);
    const lastConflictAt = Number(value.lastConflictAt || 0);
    if (count > 0 || lastConflictAt > 0) {
      normalized[String(memberId)] = {
        count: count > 0 ? count : 0,
        lastConflictAt: lastConflictAt > 0 ? lastConflictAt : 0
      };
    }
  });

  return normalized;
}

function saveConflictRecoveryState() {
  try {
    localStorage.setItem(STORAGE_KEY_CONFLICT_RECOVERY, JSON.stringify(conflictRecoveryState));
  } catch (e) {
    console.error('Failed to persist conflict recovery state:', e);
  }
}

function clearConflictRecoveryState(memberId) {
  if (!memberId) {
    return;
  }
  const key = String(memberId);
  if (conflictRecoveryState[key]) {
    delete conflictRecoveryState[key];
    saveConflictRecoveryState();
  }
}

function trackConflictAndShouldReset(memberId, nowTs = Date.now()) {
  const key = String(memberId || '');
  if (!key) {
    return false;
  }

  const settings = getSyncRecoverySettings();
  const prev = conflictRecoveryState[key] || { count: 0, lastConflictAt: 0 };
  const withinWindow = prev.lastConflictAt > 0 && (nowTs - prev.lastConflictAt) <= settings.windowMs;
  const nextCount = withinWindow ? (prev.count + 1) : 1;

  conflictRecoveryState[key] = {
    count: nextCount,
    lastConflictAt: nowTs
  };
  saveConflictRecoveryState();

  return nextCount > settings.conflictThreshold;
}

function applyRowConflictReset(memberId) {
  const key = String(memberId || '');
  if (!key) {
    return;
  }

  const tr = document.getElementById(`row-${key}`);
  if (tr && tr.dataset) {
    delete tr.dataset.rev;
    delete tr.dataset.serverUpdated;
  }
  if (Object.prototype.hasOwnProperty.call(STATE_CACHE, key)) {
    delete STATE_CACHE[key];
  }
  try {
    localStorage.setItem(STORAGE_KEY_CACHE, serializeStateCachePayload(STATE_CACHE));
  } catch (e) {
    console.error('Failed to persist state cache after conflict reset:', e);
  }
  clearConflictRecoveryState(key);
}

try {
  const cached = localStorage.getItem(STORAGE_KEY_CACHE);
  restoreStateCache(cached);
  // ★追加: 最終同期時刻も復元する
  const cachedTs = localStorage.getItem(STORAGE_KEY_SYNC);
  if (cachedTs) {
    const ts = Number(cachedTs);
    if (Number.isFinite(ts)) {
      lastSyncTimestamp = ts;
    }
  }

  const validation = sanitizeStateCache(STATE_CACHE, lastSyncTimestamp);
  if (validation.fullPurge) {
    purgeSyncLocalCache('drift-over-threshold', {
      removedRows: validation.removedRows,
      driftThresholdMs: validation.driftThresholdMs
    });
  } else {
    STATE_CACHE = validation.sanitizedCache;
    if (validation.removedRows > 0) {
      localStorage.setItem(STORAGE_KEY_CACHE, serializeStateCachePayload(STATE_CACHE));
    }
    console.info('[sync-cache-restore]', {
      fullPurge: false,
      removedRows: validation.removedRows
    });
  }

  const rawConflictRecovery = localStorage.getItem(STORAGE_KEY_CONFLICT_RECOVERY);
  if (rawConflictRecovery) {
    conflictRecoveryState = normalizeConflictRecoveryState(JSON.parse(rawConflictRecovery));
  }
} catch (e) {
  console.error("Local cache restore failed:", e);
}

/**
 * デフォルトのメニュー設定オブジェクトを返す。
 * ステータス・備考選択肢は constants/defaults.js の定数を参照（SSOT）。
 * @returns {{ timeStepMinutes: number, statuses: Array, noteOptions: string[], tomorrowPlanOptions: string[], businessHours: string[] }}
 */
function defaultMenus() {
  return {
    timeStepMinutes: 30,
    statuses: DEFAULT_STATUSES.slice(),              /* constants/defaults.js (SSOT) */
    noteOptions: DEFAULT_NOTE_OPTIONS.slice(),        /* constants/defaults.js (SSOT) */
    tomorrowPlanOptions: DEFAULT_TOMORROW_PLAN_OPTIONS.slice(),
    businessHours: DEFAULT_BUSINESS_HOURS.slice()
  };
}

function normalizeBusinessHours(arr) {
  if (Array.isArray(arr)) {
    if (arr.length === 0) {
      return [];
    }
    return arr.map(v => String(v ?? ""));
  }
  return DEFAULT_BUSINESS_HOURS.slice();
}

function buildWorkHourOptions(hours) {
  const list = Array.isArray(hours) ? hours : [];
  const frag = document.createDocumentFragment();

  if (!list.length) {
    return frag;
  }

  const optBlank = document.createElement('option');
  optBlank.value = "";
  optBlank.label = "（空白）";
  optBlank.textContent = "（空白）";
  frag.appendChild(optBlank);

  list.forEach(value => {
    const s = String(value ?? "");
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    frag.appendChild(opt);
  });

  return frag;
}
function setupMenus(m) {
  const base = defaultMenus();
  MENUS = (m && typeof m === 'object') ? Object.assign({}, base, m) : base;
  if (!Array.isArray(MENUS.businessHours)) {
    const legacy1 = Array.isArray(MENUS.workHourOptions) ? MENUS.workHourOptions : null;
    const legacy2 = Array.isArray(MENUS.workHoursOptions) ? MENUS.workHoursOptions : null;
    MENUS.businessHours = legacy1 || legacy2 || MENUS.businessHours;
  }

  if (!Array.isArray(MENUS.statuses)) MENUS.statuses = base.statuses;
  if (!Array.isArray(MENUS.noteOptions)) MENUS.noteOptions = base.noteOptions;
  if (!Array.isArray(MENUS.tomorrowPlanOptions)) MENUS.tomorrowPlanOptions = base.tomorrowPlanOptions;
  MENUS.businessHours = normalizeBusinessHours(MENUS.businessHours);
  const sts = Array.isArray(MENUS.statuses) ? MENUS.statuses : base.statuses;

  STATUSES = sts.map(s => ({ value: String(s.value) }));
  requiresTimeSet = new Set(sts.filter(s => s.requireTime).map(s => String(s.value)));
  clearOnSet = new Set(sts.filter(s => s.clearOnSet).map(s => String(s.value)));
  statusClassMap = new Map(sts.map(s => [String(s.value), String(s.class || "")]));

  let dl = document.getElementById('noteOptions');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'noteOptions'; document.body.appendChild(dl); }
  dl.replaceChildren();
  const optBlank = document.createElement('option'); optBlank.value = ""; optBlank.label = "（空白）"; optBlank.textContent = "（空白）"; dl.appendChild(optBlank);
  (MENUS.noteOptions || []).forEach(t => { const opt = document.createElement('option'); opt.value = String(t); dl.appendChild(opt); });

  let workDl = document.getElementById('workHourOptions');
  if (!workDl) { workDl = document.createElement('datalist'); workDl.id = 'workHourOptions'; document.body.appendChild(workDl); }
  workDl.replaceChildren();
  workDl.appendChild(buildWorkHourOptions(MENUS.businessHours));

  buildStatusFilterOptions();
}
function isNotePresetValue(val) {
  const v = (val == null ? "" : String(val)).trim();
  if (v === "") return true;
  const set = new Set((MENUS?.noteOptions || []).map(x => String(x)));
  return set.has(v);
}
function fallbackGroupTitle(g, idx) {
  const t = (g && g.title != null) ? String(g.title).trim() : "";
  return t || `グループ${idx + 1}`;
}
function getRosterOrdering() {
  return (GROUPS || []).map((g, gi) => ({
    title: fallbackGroupTitle(g, gi),
    members: (g.members || []).map((m, mi) => ({
      id: (m && m.id != null && String(m.id)) ? String(m.id) : `__auto_${gi}_${mi}`,
      name: String(m?.name || ""),
      ext: String(m?.ext || ""),
      mobile: String(m?.mobile || ""),
      email: String(m?.email || ""),
      order: mi
    }))
  }));
}
function normalizeConfigClient(cfg) {
  const groups = (cfg && Array.isArray(cfg.groups)) ? cfg.groups : [];
  return groups.map(g => {
    const members = Array.isArray(g.members) ? g.members : [];
    return {
      title: g.title || "",
      members: members.map(m => ({
        id: String(m.id ?? "").trim(),
        name: String(m.name ?? ""),
        ext: String(m.ext ?? ""),
        mobile: String(m.mobile ?? ""),
        email: String(m.email ?? ""),
        workHours: m.workHours == null ? '' : String(m.workHours),
        tomorrowPlan: m.tomorrowPlan == null ? '' : String(m.tomorrowPlan),
        status: m.status || '',
        time: m.time || '',
        note: m.note || '',
        updated: m.updated || 0
      })).filter(m => m.id || m.name)
    };
  });
}

// Workers経由のポーリング
async function startWorkerPolling(immediate) {
  if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }

  // ポーリング実行関数
  const pollAction = async (isFirstRun = false) => {
    if (!isFirstRun) {
      const nowMs = Date.now();
      const dateObj = new Date();
      const hour = dateObj.getHours();

      const normalInterval = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.remotePollMs))
        ? CONFIG.remotePollMs
        : 60000;
      const nightInterval = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.nightPollMs))
        ? CONFIG.nightPollMs
        : 3600000;

      let isNightMode = (hour >= 22 || hour < 7);

      /* 【将来的な拡張用スペース】
         拠点（Office ID）ごとに稼働時間が異なる場合や、24時間稼働の拠点がある場合は
         ここで判定を行い、isNightMode を false に上書きしてください。
 
         例:
         const allDayOffices = ['tokyo_control_room', 'osaka_support'];
         if (typeof CURRENT_OFFICE_ID !== 'undefined' && allDayOffices.includes(CURRENT_OFFICE_ID)) {
           isNightMode = false; // この拠点は夜間も通常通り更新する
         }
      */

      const requiredInterval = isNightMode ? nightInterval : normalInterval;

      if (nowMs - lastPollTime < requiredInterval) {
        return;
      }

      lastPollTime = nowMs;
    }

    const payload = { action: 'get', token: SESSION_TOKEN, since: lastSyncTimestamp };

    // 初回でもキャッシュを活用するため nocache を付与しない

    const r = await apiPost(payload);
    if (r?.error === 'unauthorized') {
      if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }
      await logout();
      return;
    }
    const maxUpdated = Number.isFinite(Number(r?.maxUpdated)) ? Number(r.maxUpdated) : 0;
    const serverNow = Number.isFinite(Number(r?.serverNow)) ? Number(r.serverNow) : 0;
    const nextSyncTimestamp = Math.max(lastSyncTimestamp, maxUpdated);

    if (nextSyncTimestamp > lastSyncTimestamp) {
      lastSyncTimestamp = nextSyncTimestamp;
      // ★追加: 同期時刻が進んだらローカルストレージに保存
      try {
        localStorage.setItem(STORAGE_KEY_SYNC, String(lastSyncTimestamp));
      } catch (e) { /* 無視 */ }
    }

    if (r && r.data && Object.keys(r.data).length > 0) {
      applyState(r.data);
    } else {
      logSyncDecision({
        memberId: '__poll__',
        remoteRev: 0,
        localRev: 0,
        remoteServerUpdated: maxUpdated,
        localServerUpdated: lastSyncTimestamp,
        decision: SYNC_DECISION.SKIP
      });
    }
  };

  if (immediate) {
    pollAction(true).catch(() => { });
  }
  const remotePollMs = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.remotePollMs))
    ? CONFIG.remotePollMs
    : 10000;
  // 定期実行時はキャッシュ利用 (isFirstRun = undefined/false)
  remotePullTimer = setInterval(pollAction, remotePollMs);
}

function startRemoteSync(immediate) {
  if (remotePullTimer) { clearInterval(remotePullTimer); remotePullTimer = null; }

  if (typeof CURRENT_OFFICE_ID === 'undefined' || !CURRENT_OFFICE_ID) {
    console.error("Office ID not found. Cannot start sync.");
    return;
  }

  console.log("Starting sync via Cloudflare Worker.");

  startWorkerPolling(immediate);

  if (typeof startToolsPolling === 'function') { startToolsPolling(); }
  if (typeof startNoticesPolling === 'function') { startNoticesPolling(); }
  if (typeof startVacationsPolling === 'function') { startVacationsPolling(); }
}

async function fetchConfigOnce(nocache = false) {
  const payload = { action: 'getConfig', token: SESSION_TOKEN };
  if (nocache) payload.nocache = '1';

  const cfg = await apiPost(payload);
  if (cfg?.error === 'unauthorized') {
    await logout();
    return;
  }
  if (cfg && !cfg.error) {
    const updated = (typeof cfg.updated === 'number') ? cfg.updated : 0;
    const groups = cfg.groups || cfg.config?.groups || [];
    const menus = cfg.menus || cfg.config?.menus || null;

    // 同期基準の更新
    const remoteMaxUpdated = Number(cfg.maxUpdated || 0);
    if (remoteMaxUpdated > lastSyncTimestamp) {
      lastSyncTimestamp = remoteMaxUpdated;
      try { localStorage.setItem(STORAGE_KEY_SYNC, String(lastSyncTimestamp)); } catch (e) { }
    }

    const shouldUpdate = (updated && updated !== CONFIG_UPDATED) || (!updated && CONFIG_UPDATED === 0);
    if (shouldUpdate) {
      const normalizedGroups = normalizeConfigClient({ groups });
      // 空のグループでも許容するが、データ構造が壊れている場合はスキップ
      if (Array.isArray(normalizedGroups)) {
        GROUPS = normalizedGroups;
        CONFIG_UPDATED = updated || Date.now();
      }
      
      // カラム設定の更新 (Phase 3)
      const columnConfig = cfg.columnConfig || cfg.config?.columnConfig || null;
      OFFICE_COLUMN_CONFIG = columnConfig;
      const configKey = getColumnConfigKey(CURRENT_OFFICE_ID);
      if (columnConfig) {
        localStorage.setItem(configKey, JSON.stringify(columnConfig));
      } else {
        localStorage.removeItem(configKey);
      }

      setupMenus(menus);
      
      render();

      // ★追加: DOM描画直後に最新キャッシュを適用
      if (typeof STATE_CACHE !== 'undefined' && Object.keys(STATE_CACHE).length > 0) {
        if (typeof applyState === 'function') {
          applyState(STATE_CACHE);
        }
      }
    }
  }
}

function startConfigWatch(immediate = true) {
  if (configWatchTimer) { clearInterval(configWatchTimer); configWatchTimer = null; }
  if (immediate) {
    // 初回はキャッシュをバイパスして最新を取得
    fetchConfigOnce(true).catch(console.error);
  }
  const configPollMs = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.configPollMs))
    ? CONFIG.configPollMs
    : 30000;
  configWatchTimer = setInterval(fetchConfigOnce, configPollMs);
}

function scheduleRenew(ttlMs) {
  if (tokenRenewTimer) { clearTimeout(tokenRenewTimer); tokenRenewTimer = null; }
  const tokenDefaultTtl = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.tokenDefaultTtl))
    ? CONFIG.tokenDefaultTtl
    : 3600000;
  const delay = Math.max(10_000, Number(ttlMs || tokenDefaultTtl) - 60_000);
  tokenRenewTimer = setTimeout(async () => {
    tokenRenewTimer = null;
    const me = await apiPost({ action: 'renew', token: SESSION_TOKEN });
    if (!me || me.error === 'unauthorized') {
      await logout();
      return;
    }
    if (!me.ok) {
      toast('ログイン状態を再確認してください', false);
      await logout();
      return;
    }
    if (me.ok) {
      const prevRole = CURRENT_ROLE;
      CURRENT_ROLE = me.role || CURRENT_ROLE;
      saveSessionMeta();
      if (CURRENT_ROLE !== prevRole) {
        ensureAuthUI();
        applyRoleToManual();
      }
      const tokenDefaultTtl = (typeof CONFIG !== 'undefined' && Number.isFinite(CONFIG.tokenDefaultTtl))
        ? CONFIG.tokenDefaultTtl
        : 3600000;
      scheduleRenew(Number(me.exp) || tokenDefaultTtl);
    }
  }, delay);
}

async function pushRowDelta(key) {
  const tr = document.getElementById(`row-${key}`);
  try {
    if (!tr) return;
    const st = getRowState(key);
    st.workHours = st.workHours == null ? '' : String(st.workHours);
    const baseRev = {}; baseRev[key] = Number(tr.dataset.rev || 0);
    // ★修正: apiPostが { data: payload } でラップするため、
    // ここでは直接メンバーデータを渡す（三重ネスト問題を解消）
    const memberData = { [key]: st };

    const r = await apiPost({ action: 'set', token: SESSION_TOKEN, data: memberData, baseRev: baseRev });


    if (!r) { toast('通信エラー', false); return; }

    if (r.error === 'conflict') {
      const c = (r.conflicts && r.conflicts.find(x => x.id === key)) || null;
      if (c && c.server) {
        reportConflictStreak(key);
        const shouldResetRow = trackConflictAndShouldReset(key);
        logSyncDecision({
          memberId: key,
          remoteRev: Number(c.server.rev || 0),
          localRev: Number(tr?.dataset.rev || 0),
          remoteServerUpdated: Number(c.server.serverUpdated || 0),
          localServerUpdated: Number(tr?.dataset.serverUpdated || 0),
          decision: SYNC_DECISION.HEAL
        });

        if (shouldResetRow) {
          applyRowConflictReset(key);
          toast('同一行で競合が続いたため自動修復を実施しました。次回同期で最新値を再取得します。', false);
        } else {
          applyState({ [key]: c.server });
          toast('他端末と競合しました（サーバ値で更新）', false);
        }
      } else {
        const rev = Number((r.rev && r.rev[key]) || 0);
        const ts = Number((r.serverUpdated && r.serverUpdated[key]) || 0);
        if (rev) { tr.dataset.rev = String(rev); tr.dataset.serverUpdated = String(ts || 0); }
        saveLocal();
      }
      return;
    }

    if (!r.error) {
      const rev = Number((r.rev && r.rev[key]) || 0);
      const ts = Number((r.serverUpdated && r.serverUpdated[key]) || 0);
      if (rev) { tr.dataset.rev = String(rev); tr.dataset.serverUpdated = String(ts || 0); }

      // ★修正: 送信成功時、ローカルキャッシュ(STATE_CACHE)とLocalStorageを即座に更新する
      if (!STATE_CACHE[key]) STATE_CACHE[key] = {};
      Object.assign(STATE_CACHE[key], st);
      try {
        localStorage.setItem(STORAGE_KEY_CACHE, serializeStateCachePayload(STATE_CACHE));
      } catch (e) {
        console.error("Failed to update local cache:", e);
      }

      resetConflictStreak();
      clearConflictRecoveryState(key);
      saveLocal();
      return;
    }

    console.error('Push Row Error:', r);
    toast(`保存に失敗しました: ${r.error || '不明なエラー'}`, false);
  } finally {
    PENDING_ROWS.delete(key);
    if (tr) {
      tr.querySelectorAll('input[name="note"],input[name="workHours"],select[name="status"],select[name="time"],select[name="tomorrowPlan"]').forEach(inp => {
        if (inp && inp.dataset) delete inp.dataset.editing;
      });
    }
  }
}

// applyState関数の定義
function applyState(data) {
  if (!data) return;

  let hasStateCacheUpdates = false;

  Object.entries(data).forEach(([k, v]) => {
    if (PENDING_ROWS.has(k)) {
      const trPending = document.getElementById(`row-${k}`);
      logSyncDecision({
        memberId: k,
        remoteRev: Number(v?.rev),
        localRev: Number(trPending?.dataset.rev),
        remoteServerUpdated: Number(v?.serverUpdated),
        localServerUpdated: Number(trPending?.dataset.serverUpdated),
        decision: SYNC_DECISION.SKIP
      });
      return;
    }

    const tr = document.getElementById(`row-${k}`);
    ensureRowControls(tr);

    if (tr) {
      if (v.ext !== undefined) {
        const extTd = tr.querySelector('td.ext');
        if (extTd) extTd.textContent = String(v.ext || '').replace(/[^0-9]/g, '');
      }
      if (v.mobile !== undefined) { tr.dataset.mobile = String(v.mobile ?? '').trim(); }
      if (v.email !== undefined) { tr.dataset.email = String(v.email ?? '').trim(); }

      const enabledKeys = getEnabledColumns();
      enabledKeys.forEach(colKey => {
        if (['name', 'ext', 'mobile', 'email'].includes(colKey)) return;
        if (v[colKey] !== undefined) {
          const input = tr.querySelector(`input[name="${colKey}"], select[name="${colKey}"]`);
          const val = (v[colKey] === null) ? '' : String(v[colKey]);
          if (input && input.value !== val) {
             input.value = val;
          }
        }
      });

      const s = tr.querySelector('[name="status"]');
      const t = tr.querySelector('[name="time"]');
      if (s && t && typeof toggleTimeEnable === 'function') {
        toggleTimeEnable(s, t);
      }
    }

    const remoteRev = Number(v?.rev ?? v?.serverUpdated ?? 0);
    const localRev = Number(tr?.dataset.rev || STATE_CACHE[k]?.rev || 0);
    const remoteServerUpdated = Number(v?.serverUpdated || 0);
    const localServerUpdated = Number(tr?.dataset.serverUpdated || STATE_CACHE[k]?.serverUpdated || 0);
    const decisionResult = evaluateRemoteStateDecision(remoteRev, localRev, remoteServerUpdated, localServerUpdated);
    const decision = decisionResult.shouldApply ? SYNC_DECISION.APPLY : SYNC_DECISION.SKIP;
    logSyncDecision({
      memberId: k,
      remoteRev,
      localRev,
      remoteServerUpdated,
      localServerUpdated,
      decision
    });

    if (decisionResult.shouldApply) {
      const nextRev = Number.isFinite(remoteRev) ? remoteRev : 0;
      const nextServerUpdated = Number.isFinite(remoteServerUpdated) ? remoteServerUpdated : 0;
      if (tr) {
        tr.dataset.rev = String(nextRev);
        tr.dataset.serverUpdated = String(nextServerUpdated);
      }

      if (!STATE_CACHE[k] || typeof STATE_CACHE[k] !== 'object') {
        STATE_CACHE[k] = {};
      }
      Object.assign(STATE_CACHE[k], v, {
        rev: nextRev,
        serverUpdated: nextServerUpdated
      });
      hasStateCacheUpdates = true;

      if (decisionResult.reason !== SYNC_HEAL_REASON.NONE) {
        console.info('[sync-heal]', {
          memberId: k,
          reason: decisionResult.reason,
          remoteRev: nextRev,
          localRev,
          remoteServerUpdated: nextServerUpdated,
          localServerUpdated
        });
      }
    }

    ensureTimePrompt(tr);
  });

  if (hasStateCacheUpdates) {
    try {
      localStorage.setItem(STORAGE_KEY_CACHE, serializeStateCachePayload(STATE_CACHE));
    } catch (e) {
      // quota exceededなどは無視
    }
  }

  recolor();
  updateStatusFilterCounts();
  applyFilters();
}

`

### js/admin.js

```javascript
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

/**
 * 管理モーダルを開く
 */
function openAdminModal() {
  if (!adminModal) return;
  adminModal.classList.add('show');
  adminModal.style.display = 'flex';
  
  // 初期データの読み込み
  if (!adminMembersLoaded) {
    loadAdminMembers(true);
  }
  
  // 必要に応じてお知らせなどの自動読み込み
  if (typeof autoLoadNoticesOnAdminOpen === 'function') {
    autoLoadNoticesOnAdminOpen();
  }
  
  // 管理者には拠点選択を表示するように戻す（将来的なマルチ拠点対応を見越して）
  // ただし現在のSSOT原則に基づき、CURRENT_OFFICE_IDを初期値とする
  if (adminOfficeSel && CURRENT_OFFICE_ID) {
    adminOfficeSel.value = CURRENT_OFFICE_ID;
  }

  // アクティブなタブに応じた初期データのロード
  const office = selectedOfficeId();
  if (office) {
    if (document.getElementById('tabBasic')?.classList.contains('active')) {
      loadAutoClearSettings(office);
    }
  }
}

/**
 * 管理モーダルを閉じる
 */
function closeAdminModal() {
  if (!adminModal) return;
  adminModal.classList.remove('show');
  adminModal.style.display = 'none';
}

// ボタンにリスナーを登録
if (adminBtn) {
  adminBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openAdminModal();
  });
}
if (adminClose) {
  adminClose.addEventListener('click', (e) => {
    e.preventDefault();
    closeAdminModal();
  });
}

// グローバルに公開（auth.jsなどからの呼び出し用）
window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;

// renderColumnConfig はファイル後半（2300行目付近）の実装を使用します。ここでの空の定義を削除。
const btnAddOffice = document.getElementById('btnAddOffice');
const officeTableBody = document.getElementById('officeTableBody');
if (adminOfficeSel) {
  adminOfficeSel.addEventListener('change', () => {
    // データ隔離: 管理者は自分の拠点のみ。SuperAdminのみ切り替えを許可（将来用）
    if (CURRENT_ROLE !== 'superAdmin') {
      adminOfficeSel.value = CURRENT_OFFICE_ID;
      return;
    }
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
    if (document.getElementById('tabBasic')?.classList.contains('active')) {
      loadAutoClearSettings(adminSelectedOfficeId || CURRENT_OFFICE_ID);
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
  if (r && r.ok) {
    toast('拠点名を変更しました');
    // グローバル状態とストレージを更新
    if (typeof CURRENT_OFFICE_NAME !== 'undefined') {
      CURRENT_OFFICE_NAME = name;
    }
    if (typeof LOCAL_OFFICE_NAME_KEY !== 'undefined') {
      localStorage.setItem(LOCAL_OFFICE_NAME_KEY, name);
    }
    // UIを即時反映
    if (typeof updateTitleBtn === 'function') {
      updateTitleBtn(name);
    }
  }
  else toast('変更に失敗', false);
});

btnSetPw.addEventListener('click', async () => {
  const office = selectedOfficeId(); if (!office) return;
  const pw = (setPw.value || '').trim();

  // [VALIDATION] 12文字以上、2種類以上の文字種
  if (!pw) {
    toast('パスワードを入力してください', false);
    return;
  }

  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNum = /[0-9]/.test(pw);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw);
  const typeCount = [hasUpper, hasLower, hasNum, hasSymbol].filter(Boolean).length;

  if (pw.length < 12 || typeCount < 2) {
    toast(AUTH_MESSAGES.ERROR.INVALID_PASSWORD_FORMAT, false);
    return;
  }

  const r = await adminSetUserPassword(office, pw);
  if (r && r.ok) {
    toast('一般利用者パスワードを更新しました');
    setPw.value = '';
  } else {
    toast('更新に失敗: ' + (r.message || r.error || '不明なエラー'), false);
  }
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
        const office = selectedOfficeId();
        if (office) {
          await loadAutoClearSettings(office);
        }
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
  // データ隔離: 常にログイン中の拠点を優先
  const office = (CURRENT_ROLE === 'superAdmin' && vacationOfficeSelect) 
    ? (vacationOfficeSelect.value || CURRENT_OFFICE_ID)
    : CURRENT_OFFICE_ID;
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
  // データ隔離: 常にログイン中の拠点を優先
  const office = (CURRENT_ROLE === 'superAdmin')
    ? (adminSelectedOfficeId || CURRENT_OFFICE_ID)
    : CURRENT_OFFICE_ID;
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
async function adminSetUserPassword(office, pw) { return await apiPost({ action: 'setUserPassword', office, password: pw, token: SESSION_TOKEN }); }
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
    const isBoard = (safeConfig.board || []).includes(k);
    const isPopup = (safeConfig.popup || []).includes(k);
    
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
      card: (safeConfig.card || []).includes(k),
      min: w.min != null ? w.min : '',
      max: w.max != null ? w.max : '',
      isSystem: isSystem,
      popupEligible: finalDef.popupEligible === undefined ? true : finalDef.popupEligible
    };
  };

  (safeConfig.board || []).forEach(k => addKeyToSetup(k));
  (safeConfig.popup || []).forEach(k => addKeyToSetup(k));
  (safeConfig.card || []).forEach(k => addKeyToSetup(k));
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
      const boardDisabled = false; // 全ての制限を解除
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
      // 制限を全廃。管理者が完全にコントロールできるようにする。
      delBtn.onclick = () => {
        const isThisName = (col.key === 'name');
        const confirmMsg = isThisName 
          ? '「氏名」カラムを削除すると、ボードに名前が表示されなくなります。よろしいですか？'
          : `「${col.label}」を削除しますか？`;
        
        if (confirm(confirmMsg)) {
          adminColumnsSetup.splice(idx, 1);
          renderColumnListItems();
          renderCardOrderListItems(); // 削除時にカード順序も連動させる
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

  // カード表示順序の管理用（safeConfig.cardがあればそれを初期順序とし、なければboard順）
  let cardOrderKeys = (safeConfig.card && Array.isArray(safeConfig.card)) ? safeConfig.card.slice() : adminColumnsSetup.filter(c => c.card).map(c => c.key);

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

  // セーフティガード廃止（管理者が明示的に選ばない限り追加しない）

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

  // name強制注入を停止

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
  const officeId = document.getElementById('adminNewOfficeId')?.value.trim();
  const name = document.getElementById('adminNewOfficeName')?.value.trim();
  const password = document.getElementById('adminNewOfficePw')?.value.trim();
  const adminPassword = document.getElementById('adminNewOfficeAdminPw')?.value.trim();
  
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
      ['adminNewOfficeId', 'adminNewOfficeName', 'adminNewOfficePw', 'adminNewOfficeAdminPw'].forEach(id => {
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


`

### js/tools.js

```javascript
/**
 * js/tools.js - ツール機能
 *
 * ツールリストの表示とポーリングを管理する。
 *
 * 依存: js/constants/*.js, js/globals.js, js/utils.js
 * 参照元: js/auth.js, js/sync.js
 *
 * @see MODULE_GUIDE.md
 */

/* ツールモーダル＋ポーリング */
let CURRENT_TOOLS = [];
let CURRENT_TOOLS_WARNINGS = [];
let toolsPollTimer = null;
let toolsPollOfficeId = '';
const TOOLS_POLL_INTERVAL = 300 * 1000; // 1分 -> 5分に変更

function coerceToolArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed[0] === '[' || trimmed[0] === '{') {
      try { return coerceToolArray(JSON.parse(trimmed)); } catch (_) { /* fallthrough */ }
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
  let id = base; let i = 1;
  while (ctx.seen.has(id)) {
    id = `${base}_${i}`; i += 1;
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

function normalizeToolsWithMeta(raw) {
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
      if (count >= 300) { return; }
      count += 1;
      if (item.children?.length) { item.children = prune(item.children); }
      out.push(item);
    });
    return out;
  }
  const pruned = prune(roots);
  if (count < filtered.length) {
    ctx.warnings.push('ツールが上限を超えたため一部を省略しました');
  }

  return { list: pruned, warnings: ctx.warnings, flat: filtered };
}

function normalizeTools(raw) {
  return normalizeToolsWithMeta(raw).list;
}

function filterVisibleTools(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => {
      if (!item) return null;
      const visible = coerceToolVisibleFlag(item.visible ?? item.display ?? item.show ?? true);
      if (!visible) return null;
      const copy = { ...item };
      copy.children = filterVisibleTools(item.children || []);
      return copy;
    })
    .filter(Boolean);
}

function linkifyToolText(text) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return text.replace(urlRegex, url => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`);
}

function renderToolItems(list, container, depth) {
  const visibleTools = filterVisibleTools(list);
  if (visibleTools.length === 0) {
    return;
  }
  visibleTools.forEach(tool => {
    const item = document.createElement('div');
    item.className = 'tools-item';
    if (depth > 0) { item.style.paddingLeft = `${depth * 12}px`; }

    const titleRow = document.createElement('div');
    titleRow.className = 'tools-item-title';
    const hasUrl = !!tool.url;
    const titleEl = document.createElement(hasUrl ? 'a' : 'span');
    titleEl.textContent = tool.title || (hasUrl ? tool.url : 'ツール');
    if (hasUrl) {
      titleEl.href = tool.url;
      titleEl.target = '_blank';
      titleEl.rel = 'noopener noreferrer';
    }
    titleRow.appendChild(titleEl);
    item.appendChild(titleRow);

    const noteRow = document.createElement('div');
    noteRow.className = 'tools-item-note';
    noteRow.innerHTML = linkifyToolText(tool.note || '備考：記載なし');
    item.appendChild(noteRow);

    container.appendChild(item);

    if (tool.children && tool.children.length) {
      renderToolItems(tool.children, container, depth + 1);
    }
  });
}

function renderToolsList(list) {
  if (!toolsList) return;
  toolsList.textContent = '';
  const normalizedMeta = normalizeToolsWithMeta(list);
  const visibleTools = filterVisibleTools(normalizedMeta.list);
  if (visibleTools.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tools-empty';
    empty.textContent = 'ツール情報がまだありません。後で再読み込みしてください。';
    toolsList.appendChild(empty);
    return;
  }
  renderToolItems(visibleTools, toolsList, 0);
}

function applyToolsData(raw, warnings) {
  const meta = normalizeToolsWithMeta(raw);
  if (Array.isArray(warnings)) {
    meta.warnings = Array.from(new Set([...(meta.warnings || []), ...warnings]));
  }
  CURRENT_TOOLS = meta.list;
  CURRENT_TOOLS_WARNINGS = meta.warnings || [];
  renderToolsList(CURRENT_TOOLS);
  if (CURRENT_TOOLS_WARNINGS.length && typeof isOfficeAdmin === 'function' && isOfficeAdmin()) {
    toast('ツールデータに整合性の警告があります。管理タブを確認してください');
  }
}

async function fetchTools(officeId) {
  if (!SESSION_TOKEN) { return { list: [], warnings: [] }; }
  try {
    const params = { action: 'getTools', token: SESSION_TOKEN, nocache: '1' };
    const targetOffice = officeId || CURRENT_OFFICE_ID || '';
    if (targetOffice) params.office = targetOffice;
    const res = await apiPost(params);
    if (res && res.tools) {
      const meta = normalizeToolsWithMeta(res.tools);
      if (Array.isArray(res.warnings)) {
        meta.warnings = Array.from(new Set([...(meta.warnings || []), ...res.warnings.map(String)]));
      }
      applyToolsData(meta.list, meta.warnings);
      return meta;
    }
    if (res && res.error === 'unauthorized') {
      toast('セッションの有効期限が切れました。再度ログインしてください', false);
      await logout();
      return { list: [], warnings: [] };
    }
    if (res && res.error) {
      console.error('fetchTools error:', res.error, res.debug || '');
    }
  } catch (err) {
    console.error('ツール取得エラー:', err);
  }
  return { list: [], warnings: [] };
}

async function saveTools(tools, officeId) {
  if (!SESSION_TOKEN) { return false; }
  try {
    const payload = normalizeTools(tools);
    const params = { action: 'setTools', token: SESSION_TOKEN, tools: JSON.stringify(payload) };
    const targetOffice = officeId || CURRENT_OFFICE_ID || '';
    if (targetOffice) params.office = targetOffice;
    const res = await apiPost(params);
    if (res && res.ok) {
      const nextTools = Object.prototype.hasOwnProperty.call(res, 'tools') ? normalizeTools(res.tools) : payload;
      applyToolsData(nextTools, res.warnings);
      return true;
    }
    if (res && res.error === 'forbidden') {
      toast('ツールの編集権限がありません');
      return false;
    }
    if (res && res.error === 'unauthorized') {
      toast('セッションの有効期限が切れました。再度ログインしてください', false);
      await logout();
      return false;
    }
    if (res && res.error) {
      const debugInfo = res.debug ? ` (${res.debug})` : '';
      toast('エラー: ' + res.error + debugInfo);
      console.error('setTools error details:', res);
      return false;
    }
    console.error('Unexpected setTools response:', res);
    toast('ツールの保存に失敗しました（不明なレスポンス）');
  } catch (err) {
    console.error('ツール保存エラー:', err);
    toast('通信エラーが発生しました: ' + err.message);
  }
  return false;
}

// ★修正: Visibility API対応
function startToolsPolling(officeId) {
  const targetOffice = officeId || CURRENT_OFFICE_ID || '';
  if (!targetOffice) return;

  // 再開用にIDを保持
  toolsPollOfficeId = targetOffice;

  // Visibility Handlerの登録（重複防止）
  if (!window._toolsVisibilityHandler) {
    window._toolsVisibilityHandler = () => {
      if (document.hidden) {
        // 非表示になったら停止（リスナー解除・タイマー停止）
        stopToolsPolling(false); // false = ハンドラ自体は解除しない
      } else {
        // 表示されたら再開
        startToolsPolling(toolsPollOfficeId);
      }
    };
    document.addEventListener('visibilitychange', window._toolsVisibilityHandler);
  }

  // 画面が非表示なら起動しない
  if (document.hidden) return;

  // ★修正: Workerポーリングに一本化
  startLegacyToolsPolling(targetOffice);
}

function startLegacyToolsPolling(officeId) {
  if (toolsPollTimer) { clearInterval(toolsPollTimer); toolsPollTimer = null; }
  if (!SESSION_TOKEN) return;
  toolsPollOfficeId = officeId || CURRENT_OFFICE_ID || '';
  
  // 初回取得
  fetchTools(toolsPollOfficeId).catch(() => { });
  
  // 定期実行
  toolsPollTimer = setInterval(() => {
    fetchTools(toolsPollOfficeId).catch(() => { });
  }, TOOLS_POLL_INTERVAL);
}

// ★修正: Visibility Handlerの解除制御を追加
function stopToolsPolling(removeHandler = true) {
  if (toolsPollTimer) { clearInterval(toolsPollTimer); toolsPollTimer = null; }
  if (window.toolsUnsubscribe) { window.toolsUnsubscribe(); window.toolsUnsubscribe = null; }
  
  if (removeHandler && window._toolsVisibilityHandler) {
    document.removeEventListener('visibilitychange', window._toolsVisibilityHandler);
    window._toolsVisibilityHandler = null;
  }
}

window.applyToolsData = applyToolsData;
window.renderToolsList = renderToolsList;
window.fetchTools = fetchTools;
window.saveTools = saveTools;
window.normalizeTools = normalizeTools;
window.normalizeToolsWithMeta = normalizeToolsWithMeta;
window.coerceToolVisibleFlag = coerceToolVisibleFlag;
window.startToolsPolling = startToolsPolling;
window.stopToolsPolling = stopToolsPolling;

`

### js/notices.js

```javascript
/**
 * js/notices.js - お知らせ機能
 *
 * お知らせの表示・管理・ポーリングを管理する。
 *
 * 依存: js/constants/*.js, js/globals.js, js/utils.js
 * 参照元: js/auth.js, js/admin.js, js/sync.js
 *
 * @see MODULE_GUIDE.md
 */

/* お知らせ機能 */

let CURRENT_NOTICES = [];
window.CURRENT_NOTICES = CURRENT_NOTICES; // グローバルに公開してadmin.jsから参照可能にする
/* MAX_NOTICE_ITEMS は constants/ui.js で定義 */
/* NOTICE_COLLAPSE_STORAGE_KEY は constants/storage.js で定義 */
let noticeCollapsePreference = loadNoticeCollapsePreference();

// URLを自動リンク化する関数
function linkifyText(text) {
  if (!text) return '';

  // URL正規表現（http, https, ftp対応）
  const urlRegex = /(https?:\/\/[^\s]+|ftps?:\/\/[^\s]+)/gi;

  return text.replace(urlRegex, (url) => {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
  });
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function coerceNoticeDisplayFlag(raw) {
  if (raw === false) return false;
  if (raw === true || raw == null) return true;
  const s = String(raw).toLowerCase();
  return !(s === 'false' || s === '0' || s === 'off' || s === 'no' || s === 'hide');
}

function coerceNoticeVisibleFlag(raw) {
  return coerceNoticeDisplayFlag(raw);
}

function normalizeNoticeKey(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
window.normalizeNoticeKey = normalizeNoticeKey;

function coerceNoticeArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed[0] === '[' || trimmed[0] === '{') {
      try {
        return coerceNoticeArray(JSON.parse(trimmed));
      } catch (_) {
        // treat as plain text fallback
      }
    }
    return [trimmed];
  }
  if (typeof raw === 'object') {
    if (Array.isArray(raw.list)) return raw.list;
    if (Array.isArray(raw.items)) return raw.items;
    return Object.keys(raw)
      .sort()
      .map((key) => raw[key])
      .filter((value) => value != null);
  }
  return [];
}

function normalizeNoticeEntries(raw) {
  const arr = coerceNoticeArray(raw);
  const normalized = arr
    .map((item, idx) => {
      if (item == null) return null;
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        const id = `notice_str_${idx}`;
        return { id, title: text.slice(0, 200), content: '', display: true, visible: true };
      }
      if (Array.isArray(item)) {
        const titleRaw = item[0] == null ? '' : String(item[0]);
        const contentRaw = item[1] == null ? '' : String(item[1]);
        const title = titleRaw.slice(0, 200);
        const content = contentRaw.slice(0, 2000);
        if (!title.trim() && !content.trim()) return null;
        const id = `notice_arr_${idx}`;
        return { id, title, content, display: true, visible: true };
      }
      if (typeof item === 'object') {
        const titleSource =
          item.title ?? item.subject ?? item.headline ?? '';
        const contentSource =
          item.content ?? item.body ?? item.text ?? item.description ?? '';
        const titleStr = titleSource == null ? '' : String(titleSource);
        const contentStr = contentSource == null ? '' : String(contentSource);
        const title = titleStr.slice(0, 200);
        const content = contentStr.slice(0, 2000);
        const visible = coerceNoticeVisibleFlag(
          item.visible ?? item.display ?? item.show ?? true
        );
        if (!title.trim() && !content.trim()) return null;
        const id = item.id ?? item.noticeId ?? item.uid ?? `notice_obj_${idx}`;
        return { id, title, content, display: visible, visible };
      }
      return null;
    })
    .filter(Boolean);
  if (normalized.length > MAX_NOTICE_ITEMS) {
    return normalized.slice(0, MAX_NOTICE_ITEMS);
  }
  return normalized;
}

function applyNotices(raw) {
  const normalized = normalizeNoticeEntries(raw);
  CURRENT_NOTICES = normalized;
  window.CURRENT_NOTICES = normalized; // グローバルに公開してadmin.jsから参照可能にする
  // 現在の開閉状態をリロード
  noticeCollapsePreference = loadNoticeCollapsePreference();
  renderNotices(normalized);
}

// お知らせを描画
function renderNotices(notices) {
  const noticesArea = document.getElementById('noticesArea');
  const noticesList = document.getElementById('noticesList');
  const noticesSummary = document.getElementById('noticesSummary');
  const noticesBtn = document.getElementById('noticesBtn');

  if (!noticesArea || !noticesList) return;

  const normalizedList = Array.isArray(notices)
    ? notices
    : normalizeNoticeEntries(notices);
  const list = normalizedList
    .map((n) => {
      if (!n || typeof n !== 'object') return null;
      const visible = coerceNoticeVisibleFlag(
        n.visible ?? n.display ?? n.show ?? true
      );
      if (!n.visible && n.display == null) {
        // 正規化されていない古いデータも合わせて扱う
        return { ...n, visible, display: visible };
      }
      return visible ? n : null;
    })
    .filter(Boolean);

  if (!list || list.length === 0) {
    noticesList.innerHTML = '';
    // [BEFORE] noticesArea.style.display = 'none';
    noticesArea.classList.add('u-hidden');

    if (noticesBtn) noticesBtn.style.display = 'none';
    window.CURRENT_NOTICES = []; // グローバルにも空配列を反映
    return;
  }

  noticesList.innerHTML = '';
  const frag = document.createDocumentFragment();

  list.forEach((notice) => {
    const title = notice && notice.title != null ? String(notice.title) : '';
    const content = notice && notice.content != null ? String(notice.content) : '';
    const hasContent = content.trim().length > 0;
    const noticeId = notice?.id ?? notice?.noticeId ?? notice?.uid ?? '';
    const noticeKey = notice?.noticeKey ?? notice?.key ?? normalizeNoticeKey(title);

    const item = document.createElement('div');
    if (hasContent) {
      item.className = 'notice-item';
      item.innerHTML = `
        <div class="notice-header">
          <span class="notice-toggle">➤</span>
          <span class="notice-title">${escapeHtml(title)}</span>
        </div>
        <div class="notice-content">${linkifyText(content)}</div>
      `;
      item.querySelector('.notice-header').addEventListener('click', () => {
        item.classList.toggle('expanded');
      });
    } else {
      item.className = 'notice-item title-only';
      item.innerHTML = `
        <div class="notice-header">
          <span class="notice-title">${escapeHtml(title)}</span>
        </div>
      `;
    }
    if (noticeId) item.dataset.noticeId = String(noticeId);
    if (noticeKey) item.dataset.noticeKey = normalizeNoticeKey(noticeKey);
    frag.appendChild(item);
  });
  noticesList.appendChild(frag);

  // サマリー更新
  if (noticesSummary) {
    const firstTitle = list[0] && list[0].title ? String(list[0].title) : '';
    const remaining = list.length - 1;
    if (remaining > 0) {
      noticesSummary.textContent = `${escapeHtml(firstTitle)} (他${remaining}件)`;
    } else {
      noticesSummary.textContent = escapeHtml(firstTitle);
    }
  }

  // [BEFORE] noticesArea.style.display = 'block';
  noticesArea.classList.remove('u-hidden');
  noticesArea.style.display = ''; // インラインスタイルをクリアしてCSS定義を優先させる

  if (noticesBtn) noticesBtn.style.display = 'inline-block';

  applyNoticeCollapsedState(noticesArea);


  // お知らせヘッダーをクリックで開閉できるようにする
  const noticesHeader = noticesArea.querySelector('.notices-header');
  if (noticesHeader) {
    // 既存のリスナーを削除するため、一度クローンして置き換え
    const newHeader = noticesHeader.cloneNode(true);
    noticesHeader.parentNode.replaceChild(newHeader, noticesHeader);

    newHeader.addEventListener('click', () => {
      toggleNoticesArea();
    });
  }
}

// お知らせエリアの開閉トグル
function toggleNoticesArea() {
  const noticesArea = document.getElementById('noticesArea');
  if (!noticesArea) return;

  const isCollapsed = noticesArea.classList.toggle('collapsed');
  saveNoticeCollapsePreference(isCollapsed);
}

// お知らせを取得
async function fetchNotices(requestedOfficeId) {
  if (!SESSION_TOKEN) {

    return;
  }

  try {
    const targetOfficeId = requestedOfficeId || CURRENT_OFFICE_ID || '';
    const params = {
      action: 'getNotices',
      token: SESSION_TOKEN,
      nocache: '1'
    };
    if (targetOfficeId) {
      params.office = targetOfficeId;
    }


    const res = await apiPost(params);


    if (res && Object.prototype.hasOwnProperty.call(res, 'notices')) {

      applyNotices(res.notices);
    } else if (res && res.error) {
      if (res.error === 'unauthorized') {
        toast('セッションの有効期限が切れました。再度ログインしてください', false);
        await logout();
        stopNoticesPolling();
      } else {
        console.error('fetchNotices error:', res.error, res.debug || '');
      }
    } else {
      console.warn('fetchNotices: Unexpected response format', res);
    }
  } catch (e) {
    console.error('お知らせ取得エラー:', e);
  }
}

// お知らせを保存（管理者のみ）
async function saveNotices(notices, office) {
  if (!SESSION_TOKEN) {
    console.error('saveNotices: SESSION_TOKEN is not set');
    return false;
  }



  try {
    const payload = normalizeNoticeEntries(notices);


    const params = {
      action: 'setNotices',
      token: SESSION_TOKEN,
      notices: JSON.stringify(payload)
    };

    const targetOffice = office || CURRENT_OFFICE_ID || '';
    if (targetOffice) {
      params.office = targetOffice;
    }



    const res = await apiPost(params);



    if (res && res.ok) {
      const nextNotices = Object.prototype.hasOwnProperty.call(res, 'notices')
        ? res.notices
        : payload;
      applyNotices(nextNotices || []);
      return true;
    }

    if (res && res.error === 'forbidden') {
      toast('お知らせの編集権限がありません');
      return false;
    }

    if (res && res.error === 'unauthorized') {
      toast('セッションの有効期限が切れました。再度ログインしてください', false);
      await logout();
      return false;
    }

    if (res && res.error) {
      const debugInfo = res.debug ? ` (${res.debug})` : '';
      toast('エラー: ' + res.error + debugInfo);
      console.error('setNotices error details:', res);
      return false;
    }

    // レスポンスが不明な場合
    console.error('Unexpected setNotices response:', res);
    toast('お知らせの保存に失敗しました（不明なレスポンス）');
    return false;
  } catch (e) {
    console.error('お知らせ保存エラー:', e);
    toast('通信エラーが発生しました: ' + e.message);
  }

  return false;
}

// お知らせの自動更新（Workerポーリング）
let noticesPollingTimer = null;

function startNoticesPolling() {
  // すでにポーリングが動いていれば何もしない
  if (window.noticesUnsubscribe) return;

  // ★修正: Workerポーリングに一本化
  // これにより ERR_BLOCKED_BY_CLIENT を回避し、リクエスト数を削減する
  startLegacyNoticesPolling();
}

// 従来のポーリングロジックを別名関数に退避
function startLegacyNoticesPolling() {
  // 重複起動防止
  if (noticesPollingTimer || window._noticesVisibilityHandler) return;

  const pollInterval = 60000 * 5; // 5分に1回

  const runPoll = () => {
    if (SESSION_TOKEN) fetchNotices();
    else stopNoticesPolling();
  };

  // 初回実行
  if (SESSION_TOKEN) fetchNotices();

  // ★追加: Visibility API対応
  window._noticesVisibilityHandler = () => {
    if (document.hidden) {
      if (noticesPollingTimer) {
        clearInterval(noticesPollingTimer);
        noticesPollingTimer = null;
      }
    } else {
      if (!noticesPollingTimer && SESSION_TOKEN) {
        runPoll(); // 復帰時実行
        noticesPollingTimer = setInterval(runPoll, pollInterval);
      }
    }
  };
  document.addEventListener('visibilitychange', window._noticesVisibilityHandler);

  if (!document.hidden && SESSION_TOKEN) {
    noticesPollingTimer = setInterval(runPoll, pollInterval);
  }
}

function stopNoticesPolling() {
  // ポーリング停止
  if (noticesPollingTimer) { clearInterval(noticesPollingTimer); noticesPollingTimer = null; }
  // リスナー解除
  if (window.noticesUnsubscribe) { window.noticesUnsubscribe(); window.noticesUnsubscribe = null; }
  // ★追加: Visibility Handler解除
  if (window._noticesVisibilityHandler) {
    document.removeEventListener('visibilitychange', window._noticesVisibilityHandler);
    window._noticesVisibilityHandler = null;
  }
}

function loadNoticeCollapsePreference() {
  try {
    const officeKey = `${NOTICE_COLLAPSE_STORAGE_KEY}_${CURRENT_OFFICE_ID || 'default'}`;
    const raw = localStorage.getItem(officeKey);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch (e) {
    console.warn('Failed to read notice collapse preference', e);
  }
  return false;
}

function saveNoticeCollapsePreference(collapsed) {
  noticeCollapsePreference = collapsed === true;
  try {
    const officeKey = `${NOTICE_COLLAPSE_STORAGE_KEY}_${CURRENT_OFFICE_ID || 'default'}`;
    localStorage.setItem(officeKey, noticeCollapsePreference ? 'true' : 'false');

  } catch (e) {
    console.warn('Failed to save notice collapse preference', e);
  }
}

function applyNoticeCollapsedState(noticesArea) {
  if (!noticesArea) return;
  if (noticeCollapsePreference) {
    noticesArea.classList.add('collapsed');
  } else {
    noticesArea.classList.remove('collapsed');
  }
}

`

### main.js

```javascript
/**
 * main.js - アプリケーションエントリーポイント
 *
 * DOMContentLoaded後の初期化処理を管理する。
 * - 拠点リスト取得
 * - ログイン状態確認
 * - UIイベントハンドラ設定
 *
 * 依存: js/config.js, js/constants/*.js, js/globals.js, js/auth.js, js/offices.js
 * 参照元: index.html (最後に読み込み)
 *
 * @see MODULE_GUIDE.md
 */

/* 起動 */
document.addEventListener('DOMContentLoaded', async () => {
  // 拠点リスト取得（public-list）
  try {
    if (typeof refreshPublicOfficeSelect === 'function') {
      await refreshPublicOfficeSelect();
    }
  } catch (e) { console.error(e); }

  // ログイン状態確認
  // js/auth.js で定義された checkLogin を呼び出す
  if (typeof checkLogin === 'function') {
    await checkLogin();
  } else {
    console.error("checkLogin function not found");
  }

  // お知らせボタンのイベントハンドラ
  // （本来は notices.js などに移動すべきだが、main.js に残っていたので維持）
  const noticesBtn = document.getElementById('noticesBtn');
  if (noticesBtn) {
    noticesBtn.addEventListener('click', () => {
      // [BEFORE] noticesArea.style.display = noticesArea.style.display === 'none' ? 'block' : 'none';
      // [AFTER] notices.js の toggleNoticesArea を呼び出す（collapsed クラスのトグル）
      if (typeof toggleNoticesArea === 'function') {
        toggleNoticesArea();
      }
      // スクロール
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    });
  }


  /* === ▼ 追加箇所: イベントボタンの処理 ▼ === */
  const eventBtn = document.querySelector('header .event-btn');
  const eventModal = document.getElementById('eventModal');
  // モーダル内の閉じるボタン（ID指定またはクラス指定）
  const eventCloseBtn = document.getElementById('eventClose') || (eventModal ? eventModal.querySelector('.close-btn') : null);

  if (eventBtn && eventModal) {
    eventBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // モーダルを表示するクラスを付与
      eventModal.classList.add('show');
      // 必要であれば display も明示的に操作
      eventModal.style.display = 'flex';
    });
  }

  // 閉じるボタンの処理
  if (eventCloseBtn && eventModal) {
    eventCloseBtn.addEventListener('click', () => {
      eventModal.classList.remove('show');
      eventModal.style.display = 'none';
    });
  }
  // QRコードボタンのイベントハンドラ
  if (qrBtn) {
    qrBtn.addEventListener('click', () => {
      if (typeof showQrModal === 'function') {
        showQrModal(true);
      }
    });
  }

  /* === ▼ 追加箇所: ツールボタンの処理 ▼ === */
  const toolsBtnEl = document.getElementById('toolsBtn');
  const toolsModalEl = document.getElementById('toolsModal');
  const toolsModalCloseEl = document.getElementById('toolsModalClose');

  if (toolsBtnEl && toolsModalEl) {
    toolsBtnEl.addEventListener('click', (e) => {
      e.preventDefault();
      toolsModalEl.classList.add('show');
      toolsModalEl.style.display = 'flex';
      // ツール一覧を最新化
      if (typeof fetchTools === 'function') {
        fetchTools().catch(err => console.error('fetchTools error:', err));
      }
    });
  }

  if (toolsModalCloseEl && toolsModalEl) {
    toolsModalCloseEl.addEventListener('click', () => {
      toolsModalEl.classList.remove('show');
      toolsModalEl.style.display = 'none';
    });
  }
  /* === ▲ 追加箇所ここまで ▲ === */
});


`

### package.json

```json
{
  "name": "whereabouts-migration",
  "version": "1.0.0",
  "description": "Migration scripts for Whereabouts",
  "main": "migrate.js",
  "scripts": {
    "migrate": "node migrate.js"
  },
  "dependencies": {
    "@playwright/test": "^1.58.2"
  }
}

`

### wrangler.toml

```toml
name = "whereabouts"
main = "CloudflareWorkers_worker.js"
compatibility_date = "2024-01-14"

# ▼▼▼ グローバル設定 ▼▼▼
account_id = "01f96b532d61f9cebe2c01bd3e4082f2"

kv_namespaces = [
  { binding = "STATUS_CACHE", id = "cc4d3c16d44e4f299d9395c3c8ecde89" }
]

[triggers]
crons = ["0 * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "whereabouts-db"
database_id = "350bb3cf-27be-4e96-9ce4-c2bf89ab678c"

# 本番用 (default) の変数
[vars]
STATUS_CACHE_TTL_SEC = "604800"

# ▼▼▼ 開発環境 (dev) の設定 ▼▼▼
[env.dev]
name = "whereabouts-dev"
workers_dev = true

[[env.dev.kv_namespaces]]
binding = "STATUS_CACHE"
id = "695bec76282e488c8d7b76fd5f0a1f4f"

# ★追加: dev環境用の変数を定義（これがないとdev環境で変数が空になります）
[env.dev.vars]
STATUS_CACHE_TTL_SEC = "604800"

[[env.dev.d1_databases]]
binding = "DB"
database_name = "whereabouts-db"
database_id = "350bb3cf-27be-4e96-9ce4-c2bf89ab678c"

[env.dev.triggers]
crons = ["0 * * * *"]

`

