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

1. **D1のデータ確認**
   - D1の対象データベースを開く
   - `offices` テーブルにレコードが存在するか確認

2. **公開設定の確認**
   - `is_public` カラムが 1 になっているか確認

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

必要に応じて Worker の環境変数（Secrets）を設定してください。

## 参考リンク

- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Wrangler CLI リファレンス](https://developers.cloudflare.com/workers/wrangler/)
