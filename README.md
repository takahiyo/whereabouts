# 在席確認表 (Whereabouts Board)

## 🤖 AI Development Guidelines (AI開発者向けガイドライン)

**本プロジェクトは AI Vibe Coding によって開発・運用されます。以下のアーキテクチャおよび制約を厳守してください。**

### 1. 技術スタックとインフラ (Technology Stack)
- **Code Management**: GitHub
- **Frontend Hosting**: **Cloudflare Pages** (NOT GitHub Pages)
- **Backend / API**: **Cloudflare Workers**
- **Database**: **Cloudflare D1**
  - **Access Strategy**: **Worker経由のみ (SSOT)**
    - **Read/Write**: すべて **Cloudflare Workers を経由** します。
- **Language**: Vanilla JavaScript (ES6+), HTML5, CSS3

### 2. 禁止事項 (Constraints)
- **Google Apps Script (GAS) の使用禁止**: 旧バージョンのコードに含まれるGAS関連の記述やファイルは無視し、提案しないでください。
- **Write操作の直接実行禁止 (推奨)**: データの整合性とセキュリティを担保するため、書き込み操作は原則として Workers API を通じて行ってください。
- **複雑なビルドツールの回避**: 現状の Vanilla JS 構成を維持してください（必要最低限のバンドルは可）。
- **Service Worker の使用禁止**: オフラインキャッシュは未使用です。

---

## データフロー (Worker → D1)

本システムは、**クライアント → Cloudflare Workers → D1** の経路に統一しています。

### 1. 読み取り / 書き込み (Read / Write)
* **Method**: Client → Workers → D1
* **理由**: 認証・キャッシュ・書き込み制御をWorkerに集約し、通信経路を単純化するため。

### 2. 認証 (Auth)
* **認証基盤**: Workers 側のID/パスワード検証
* **セッション**: クライアントはWorkerの応答を保存して利用

---

## プロジェクト構成


```

.
├── webapp/                      # フロントエンド (Cloudflare Pagesデプロイ対象)
│   ├── index.html               # メインHTML（タイトル・CSP設定含む）
│   ├── js/config.js             # 環境設定（認証モード・Workerエンドポイント）
│   ├── main.js                  # アプリケーション起動処理
│   ├── styles.css               # スタイル定義
│   └── js/
│       ├── globals.js           # グローバル変数
│       ├── sync.js              # データ同期（ハイブリッド通信ロジック）
│       ├── auth.js              # 認証処理
│       └── ... (その他jsファイル)
├── workers/                     # バックエンド (Cloudflare Workers)
│   ├── src/
│   │   └── index.js             # Worker エントリポイント
│   └── wrangler.toml            # Workers設定
├── docs/                        # ドキュメント集
│   ├── USER_MANUAL.md           # ユーザー向け詳細マニュアル
│   └── ADMIN_MANUAL.md          # 管理者向け詳細マニュアル
└── README.md                    # 本ドキュメント

```

---

## セットアップとデプロイ手順

### 1. D1 データベースの準備

1.  D1 データベースを作成
2.  `schema.sql` を使って初期スキーマを適用
3.  `wrangler.toml` の `[[d1_databases]]` にバインド設定を確認

### 2. Cloudflare Workers (Backend) の設定

#### 環境変数 (Secrets) の設定

必要に応じて Cloudflare ダッシュボード側で Worker の環境変数を設定します。

#### KVキャッシュの設定

`action === "get"` のレスポンスをKVにキャッシュするため、KVネームスペースを作成して `wrangler.toml` の `kv_namespaces` にIDを設定します。

```bash
npx wrangler kv:namespace create STATUS_CACHE
```

`wrangler.toml` の `STATUS_CACHE_TTL_SEC` と `STATUS_CACHE_WARM_ON_WRITE` でキャッシュのTTLと書き込み時のウォームアップを制御します。

#### デプロイ

```bash
cd workers
npm install
npx wrangler deploy

```

### 3. Cloudflare Pages (Frontend) の設定

#### `js/config.js` の設定

Workerのエンドポイントと認証モードを設定します。

**ファイル**: `webapp/js/config.js`

```javascript
const CONFIG = {
  authMode: "worker",
  remoteEndpoint: "https://whereabouts.taka-hiyo.workers.dev"
};

```

### 4. `index.html` の変更 (CSP)

Workerのエンドポイントが許可されていることを確認してください。

---

## 環境別設定ファイルの管理（推奨）

複数環境を管理する場合、設定ファイルを分けて管理することを推奨します。

```bash
cp js/config.js js/config.dev.js
cp js/config.js js/config.prod.js

```

---

## 変更チェックリスト

本番デプロイ前に以下を確認してください：

### D1設定

* [ ] **D1バインド**: `wrangler.toml` の `[[d1_databases]]` が正しいか

### フロントエンド設定

* [ ] **js/config.js**: `CONFIG.authMode` と `CONFIG.remoteEndpoint` が正しく設定されているか
* [ ] **index.html**: Workerのエンドポイントが CSP に含まれているか

### 動作確認

* [ ] **Write確認**: ステータス変更が正常に保存されるか（Workers経由）

---

## 開発・デバッグ

### ローカル開発サーバー

```bash
npx http-server -p 8000

```

ブラウザで `http://localhost:8000` にアクセス

### デバッグログ

Worker経由の通信ログはブラウザのコンソールで確認できます。

---


## ローカル生成物の取り扱い

コミット禁止対象と運用手順は `docs/REPO_HYGIENE.md` に集約しています。
詳細はそちらを参照してください。

---

## ライセンス・サポート

このプロジェクトは開発者による内部利用を想定しています。

```

```
