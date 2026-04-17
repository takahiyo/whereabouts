# ハイブリッド認証実装 デバッグログ

## 作業工程 (2026-04-17)

1. **[修正] `js/constants/messages.js`**
    - `AUTH_MESSAGES` に `CONFIG_INCOMPLETE`, `AUTH_FAILED`, `SESSION_LOCKED` を追加。SSOT原則を維持。
2. **[リファクタリング] `js/auth.js`**
    - `AuthManager` シングルトンを導入し、認証ロジックをカプセル化。
    - ID内の `@` 有無による Firebase/D1 自動ルーティングを実装。
    - `sessionStorage` に `whereabouts_auth_type` を保存し、D1セッション中の Firebase 状態変化をガード（Flicker防止）。
    - 拠点IDの強制小文字化 (`toLowerCase`) を実装。
3. **[堅牢化] `CloudflareWorkers_worker.js`**
    - `safeDbQuery` ヘルパーを導入し、DBクエリのエラーハンドリングを強化。
    - すべてのエラーレスポンスを JSON 形式に統一（`ok: false` と `error` キーを確実に含む）。
    - `getEventColorMap`, `setEventColorMap` 等の主要アクションを保護。
4. **[UI調整] `index.html`**
    - バージョンを更新。
    - `is-d1-authed` クラスによる起動直後のログイン画面非表示ガードを `js/auth-guard.js` に外部化し、CSP違反を解消。

## 白画面バグの対処プロセス (2026-04-17 追加)

### 問題1: CSPブロックと変数参照エラー（解決済）
- `index.html` 内のインラインスクリプトを外部ファイル `js/auth-guard.js` へ分離して解決。
- ES Module化した `auth.js` がグローバル変数（`SESSION_TOKEN`等）を参照できなくなっていた問題を、`window` オブジェクトへの明示的な割り当てによって解決。

### 問題2: UIのフリーズ（白画面）
- **現象**: Console上で `switchAuthView` が呼ばれているにも関わらずログイン画面が表示されない。
- **原因解明**: 
    - Firebaseから `user=null` が返却された際に古いトークンが残っていると、`switchAuthView` 内の以下のガード条件が誤作動していた。
    - `const isBoardVisible = (board && ...) || sessionStorage.getItem(PERSISTENT_SESSION_KEY);`
    - ここで `sessionStorage` 側に過去のセッション残骸（`PERSISTENT_SESSION_KEY`）があると、本来ボードが非表示にも関わらず早期 return してしまい、`loginEl.classList.remove('u-hidden')` が実行されずに両方の `div` が隠れたままになっていた。
- **解決策**:
    1. Firebase `user=null` 時、無効な状態とみなし `localStorage` の `SESSION_KEY` だけでなく、`sessionStorage` の `PERSISTENT_SESSION_KEY` も完全クリアするようにした。
    2. `switchAuthView` の `isBoardVisible` の判定から `sessionStorage` の依存を外し、純粋に DOM (`!board.classList.contains('u-hidden')`) の状態のみで判定するように修正した。

## テスト結果記録

| 日時 | テスト内容 | 結果 | 備考 |
|------|------------|------|------|
| 2026-04-17 | 構文チェック (auth.js) | OK | 巨大ファイルの破損を `write_to_file` で再修正済み |
| 2026-04-17 | Worker JSONレスポンス検証 | OK | 全ての catch ブロックで JSON Response を返すことを確認 |
| 2026-04-17 | フリッカー防止ガードの動作確認 | OK | `js/auth-guard.js` による初期状態セットを確認 |
| 2026-04-17 | 白画面解消の確認 | OK | auth.js v2 へ更新、残存セッション情報クリア時の UI ハンドリング修正完了 |

## 完了の報告
ハイブリッド認証システムの基盤実装および白画面バグの修正が完了しました。
今後、万が一不具合が発生した場合はこのファイルを起点にデバッグを継続します。
ユーザーより「解決した」との返答があれば、ルールに基づきこのファイルを削除します。
