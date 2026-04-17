# デバッグ記録: ハイブリッド認証のセキュリティ・不整合修正

## 問題の概要
- **不具合**: Firebaseでログインした新ユーザーが、キャッシュに残っていた他拠点のボードに管理者として入れてしまう。
- **原因**: 
  1. クライアント側の `localStorage` に以前の `officeId` と `SESSION_TOKEN` が残っている。
  2. Worker側で Firebase ユーザーと対象拠点の権限照合（Authorization）が不十分。
  3. Workerが古いD1トークンを優先または許容してしまっている。

## 調査工程 (2026-04-17)
- `js/auth.js` の初期化・ログイン・ログアウトロジックを確認。
- `CloudflareWorkers_worker.js` の認証コンテキスト生成および各アクションのガード条件を確認。
- `js/constants/storage.js` で管理されているキーを確認。
- `main.js` の初期化順序を確認。

## 修正計画 (実装プラン参照)
1. Worker側での厳格な `officeId` 検証の実装。
2. ストレージの完全クリアロジックの実装。
3. Firebaseユーザーに対する `renew` アクションの挙動修正。

## 実行ログ (2026-04-17)
- [x] プラン承認済み
- [x] `js/constants/storage.js` 更新: クリア対象キーの定数化
- [x] `js/auth.js` 修正: `clearSession()` 実装、ログアウト・ログイン切り替え時のキャッシュクリア強制
- [x] `CloudflareWorkers_worker.js` 修正: Firebase認証時の `officeId` 強制照合、`renew` アクションの不整合修正
- [x] 動作確認準備完了

## ユーザーテスト依頼内容
1. `taka.hiyo@gmail.com` （または新規Firebaseユーザー）でログインし、勝手に他人の拠点（elenia等）が開かれないことを確認してください。
2. ログイン後、正しく「拠点作成（Create Office）」画面が表示されることを確認してください。
3. ログアウトした際、開発者ツールの Application > Local Storage が空（または重要情報が消えている）であることを確認してください。
