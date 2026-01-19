# Cloudflare Worker デプロイ手順

このドキュメントでは、`CloudflareWorkers_worker.js` をCloudflareにデプロイする手順を説明します。

## 前提条件

- Cloudflareアカウント（無料プランでOK）
- Workerがすでに作成されている（`whereabouts`）
- GitHubからコードをclone済み

## 方法1: Cloudflareダッシュボードから手動デプロイ（推奨）

### 手順

1. **Cloudflareダッシュボードにアクセス**
   - https://dash.cloudflare.com/ にアクセス
   - Cloudflareアカウントでログイン

2. **Workerページに移動**
   - 左サイドバーから「Workers & Pages」をクリック
   - 既存の `whereabouts` Workerをクリック

3. **Quick Editで編集**
   - 「Quick Edit」ボタンをクリック
   - エディタが開きます

4. **コードを貼り付け**
   - `CloudflareWorkers_worker.js` の内容をすべて選択してコピー
   - Quick Editエディタの内容をすべて削除
   - コピーしたコードを貼り付け

5. **保存してデプロイ**
   - 「Save and Deploy」ボタンをクリック
   - デプロイが完了するまで待機（通常数秒）

6. **動作確認**
   ```bash
   curl -X POST https://whereabouts.taka-hiyo.workers.dev \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "action=publicListOffices"
   ```
   
   期待されるレスポンス：
   ```json
   {"ok":true,"offices":[{"id":"office_id","name":"Office Name"},...]}
   ```

## 方法2: Wrangler CLI でデプロイ

### 初回設定

1. **Cloudflare API トークンを取得**
   - https://dash.cloudflare.com/profile/api-tokens にアクセス
   - 「Create Token」→「Edit Cloudflare Workers」テンプレートを選択
   - 必要な権限：
     - Account: Workers Scripts (Edit)
   - トークンをコピー

2. **環境変数に設定**
   ```bash
   export CLOUDFLARE_API_TOKEN="your_token_here"
   ```

### デプロイコマンド

```bash
# プロジェクトディレクトリに移動
cd /path/to/whereabouts

# Workerをデプロイ
npx wrangler deploy CloudflareWorkers_worker.js
```

### デプロイ後の確認

```bash
# 拠点リスト取得のテスト
curl -X POST https://whereabouts.taka-hiyo.workers.dev \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "action=publicListOffices"

# ログイン機能のテスト
curl -X POST https://whereabouts.taka-hiyo.workers.dev \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "action=login&office=your_office_id&password=your_password"
```

## トラブルシューティング

### 拠点リストが空で返される場合

1. **Firestoreのデータ確認**
   - Firebase Console（https://console.firebase.google.com/）にアクセス
   - プロジェクト `whereabouts-f3388` を選択
   - Firestore Database → `offices` コレクションを確認
   - 拠点ドキュメントが存在するか確認

2. **公開設定の確認**
   - 各拠点ドキュメントに `public` フィールドがある場合
   - `public: false` になっていないか確認
   - 未設定または `public: true` の場合は表示されます

3. **セキュリティルールの確認**
   - Firestore Database → ルール
   - `offices` コレクションの読み取り権限を確認
   ```
   match /offices/{officeId} {
     allow read: if true; // Workerからのアクセスに必要
   }
   ```

### デプロイエラーが発生する場合

1. **認証エラー**
   ```
   ERROR: In a non-interactive environment, it's necessary to set a CLOUDFLARE_API_TOKEN
   ```
   → API トークンを正しく設定してください

2. **権限エラー**
   ```
   ERROR: You do not have permission to deploy this Worker
   ```
   → API トークンの権限を確認してください

3. **構文エラー**
   ```
   ERROR: Your Worker failed validation
   ```
   → `CloudflareWorkers_worker.js` の構文を確認してください

## 環境変数の設定

Workerが正常に動作するには、以下の環境変数（Secrets）が必要です：

1. **FIREBASE_PRIVATE_KEY**
   - Firebase Admin SDK の秘密鍵
   - 設定方法：
   ```bash
   wrangler secret put FIREBASE_PRIVATE_KEY
   ```

2. **wrangler.toml で設定済みの変数**
   ```toml
   FIREBASE_PROJECT_ID = "whereabouts-f3388"
   FIREBASE_CLIENT_EMAIL = "firebase-adminsdk-fbsvc@whereabouts-f3388.iam.gserviceaccount.com"
   STATUS_CACHE_TTL_SEC = "60"
   ```

## 参考リンク

- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Wrangler CLI リファレンス](https://developers.cloudflare.com/workers/wrangler/)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
