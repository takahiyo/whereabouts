# デプロイメント状況

## 現在の状態

### ✅ 完了した修正

#### 1. 拠点リスト表示の修正
- **問題**: ログイン画面で拠点リストが表示されない
- **原因**: `publicListOffices` アクションが未実装
- **修正**: Worker に `publicListOffices` と `listOffices` アクションを追加

#### 2. ステータス更新機能の修正
- **問題**: ステータスの変更が保存できない
- **原因**: `set` アクションが未実装、フロントエンドの未定義変数
- **修正**: 
  - Worker に `set` アクションを実装
  - `EVENT_COLOR_LEGACY_FALLBACKS` と `EVENT_COLOR_TRANSPORT_FALLBACKS` 定数を追加

### 📦 実装済みアクション

Worker に実装されているアクション：
- ✅ `login` - ログイン認証
- ✅ `getConfig` - 設定データ取得
- ✅ `get` - メンバーステータス取得
- ✅ `set` - メンバーステータス更新
- ✅ `publicListOffices` - 公開拠点リスト取得
- ✅ `listOffices` - 全拠点リスト取得（管理者用）

### ⚠️ 未実装アクション

今後実装が必要な可能性があるアクション：
- ❌ `renew` - セッショントークン更新
- ❌ `setConfigFor` - 設定更新（管理者用）
- ❌ `getConfigFor` - 特定拠点の設定取得
- ❌ `renameOffice` - 拠点名変更
- ❌ `setOfficePassword` - 拠点パスワード変更
- ❌ `getVacation` - イベント取得
- ❌ `setVacation` - イベント作成/更新
- ❌ `deleteVacation` - イベント削除
- ❌ `setVacationBits` - イベントメンバー設定
- ❌ `getEventColorMap` - イベントカラーマップ取得
- ❌ `setEventColorMap` - イベントカラーマップ保存

## デプロイ手順

詳細は `DEPLOY_WORKER.md` を参照してください。

### クイックデプロイ

1. https://dash.cloudflare.com/ にログイン
2. Workers & Pages → `whereabouts` を選択
3. Quick Edit をクリック
4. `CloudflareWorkers_worker.js` の内容をコピー＆ペースト
5. Save and Deploy をクリック

### 動作確認

```bash
# 拠点リスト取得のテスト
curl -X POST https://whereabouts.taka-hiyo.workers.dev \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "action=publicListOffices"

# 期待されるレスポンス: {"ok":true,"offices":[...]}
```

## 次のステップ

### 1. 即座に必要な対応
- [x] Worker のデプロイ
- [ ] ログイン画面で拠点リスト表示を確認
- [ ] ステータス更新が保存されることを確認

### 2. 今後必要になる可能性がある対応

アプリの機能を使用する際に、以下のエラーが発生する場合は追加実装が必要：

- 管理機能（拠点設定変更など）を使用時
- イベント/休暇管理機能を使用時
- その他の管理者専用機能を使用時

エラーが発生した場合は、コンソールログで `unknown_action` エラーを確認し、
必要なアクションを特定してください。

## トラブルシューティング

### 拠点リストが表示されない

1. Worker が最新版にデプロイされているか確認
2. D1 に拠点データが存在するか確認
3. `offices` テーブルに拠点データが格納されているか確認

### ステータス更新が失敗する

1. Worker が最新版にデプロイされているか確認
2. D1 に該当メンバーのレコードが存在するか確認
3. `members` テーブルの更新が実行できるか確認

### その他のエラー

コンソールログを確認して、`unknown_action` エラーが発生している場合は、
該当アクションの実装が必要です。Issue を作成してください。

## 参考リンク

- プルリクエスト: https://github.com/takahiyo/whereabouts/pull/30
- Cloudflare Workers: https://dash.cloudflare.com/
