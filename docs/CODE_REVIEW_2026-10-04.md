# コードレビュー・整理記録

確認日: 2026-10-04（日本時間）。対象: このリポジトリのローカル作業ツリー。実稼働環境・利用ログ・Cloudflare/Firebase設定の確認は含まない。

## 結論

在席共有に必要な機能は揃っている。一方、認証の署名検証と名簿保存に、見た目の整理より先に対応すべき問題がある。今回の実装変更は不要資産・診断用記述・誤ったドキュメント・検証導線の整理に限定した。以下の認証・保存仕様の問題は**未修正**であり、[開発計画](DEVELOPMENT_PLAN.md)の段階1以降で対応する。

本番・開発のD1共有は意図された仕様（ユーザー確認済み）。共有自体を不具合として扱わず、両Workerからの変更、独立KVの鮮度、Cronの重複を運用・設計課題として扱う。

## 現行機能と調査範囲

| 領域 | 主なソース | 把握した責務 |
|---|---|---|
| 起動・認証 | index.html、main.js、auth-guard.js、auth.js、firebase-auth.js | 初期表示、拠点共有ログイン、Firebaseオーナーログイン、セッション復元 |
| 在席表示 | board.js、filters.js、layout.js、globals.js | 行・グループ、列、検索、戻り時間、連絡先、詳細、共有状態 |
| 同期 | sync.js、config.js、constants/ | 差分取得、ポーリング、localStorage復元、rev比較、競合回復 |
| 管理 | admin.js | 名簿・グループ・列・拠点設定、入出力、管理UI |
| 付随機能 | vacations.js、notices.js、tools.js、services/ | 休暇・行事、お知らせ、リンク集、CSV、QR |
| API・DB | CloudflareWorkers_worker.js、schema.sql | 認証、拠点スコープ、各種CRUD、KV、Cron、signup時の初期DDL |
| 配信・資料 | wrangler.toml、.github/workflows、README、docs、scripts | 環境、デプロイ、資料生成、旧補助スクリプト |

アクティブな入口・主要データフロー・危険な境界を中心に静的レビューした。全CSSセレクタの未使用判定や全UI操作の網羅試験ではない。CSSは約5,200行、admin.jsは約3,100行、globals.jsは約1,600行あり、画面状態から動的に使われるコードを検索回数だけで削除しない。

## 重要な指摘（未修正）

行番号は整理後の2026-10-04時点。今後は関数名・action名も併せて検索する。

| ID / 重要度 | 根拠 | 影響と再現条件 | 対応 |
|---|---|---|---|
| R01 / 最優先 | Worker:147 verifyFirebaseToken | JWTのpayloadをデコードしexp比較するだけで署名・issuer・audienceを検証しない。email_verifiedと既存UIDを含む署名なしトークンで、そのDBユーザーとして認可され得る。モックDBのgetToolsで受理を再現 | A01。公式要件は[S1](https://firebase.google.com/docs/auth/admin/verify-id-tokens) |
| R02 / 最優先 | Worker:130 SESSION_SECRET | Secret未設定時に公開コード中の固定値で署名。未設定環境ではセッションを偽造可能。実環境のSecret設定有無は未確認 | A02。未設定時拒否、鍵更新と既存セッション移行 |
| R03 / 高 | Worker login/createOffice/setOfficePassword、schema.sqlのpassword列 | パスワードを文字列比較・直接保存。DB閲覧や漏えい時の影響が大きい | A03。既存ログインを考慮した段階的ハッシュ移行 |
| R04 / 高 | Worker:1231 setConfigFor | 既存SELECTにtomorrow_planがないのに後段で保持しようとする。クライアントがtomorrowPlanを省略すると既存の明日の予定が空になる | D01。名簿だけの変更で予定保持をテスト |
| R05 / 高 | Worker:1251 setConfigFor | DELETEを先に単独runし、INSERTを後のbatchで実行。不正groupsや挿入失敗で名簿を失う。並行更新も全置換に巻き込まれ得る | D02/D03。検証、原子性、競合設計。D1 batchはトランザクションを提供[S3](https://developers.cloudflare.com/d1/worker-api/d1-database/) |
| R06 / 高 | sync.js:769–774、Worker set/setFor | クライアントはbaseRevを送信するがWorkerは読まず、UPDATE条件はoffice_idとidだけ。古い端末からの更新が新しい値を上書きし得る | D03。条件更新と409相当の統一競合応答 |
| R07 / 中 | Worker set/setForのrev生成・batch結果 | 影響行数を確認せずrevと成功を返す。名簿から削除されたIDにも保存成功と見える | D04。対象消失を明示 |
| R08 / 中 | Worker renew:603、signSessionToken | renewは新しいトークンを発行せず元トークンを返す一方、応答にexp=3600000を返す。更新という名称と24時間のJWT期限が一致しない | A06。延命か検証のみかを確定し期限境界テスト |
| R09 / 中 | tools.js:199 titleEl.href | URLをそのままhrefに設定。schemeの許可リストが見当たらない。CSP等で動作差はあり得るが、保存データとして危険schemeを拒否すべき | A08。保存・表示両方で検証 |
| R10 / 中 | wrangler.toml、Worker scheduled/KV失効 | 共有D1に対し両環境にCronがあり、書込み後に失効するKVはそのWorkerのnamespaceだけ。反対環境に古いキャッシュが残り得る | D05/D06。共有仕様を維持して整合・冪等性を設計 |
| R11 / 中 | config.js:14–15 | 接続先はホスト名依存で、ブランチやPagesプレビューを直接見ていない。devプレビューでも本番Workerに接続し得る | M05。許可ホストと接続先を明示・検証 |
| R12 / 中 | Worker:67 safeJSONParse、setConfigForのparseエラー、fatal応答 | 入力断片や内部エラーをログ/応答へ出す。トークンを含み得るフロントのログも要棚卸し | A10。機微情報除外とrequest ID |
| R13 / 中 | Worker createOffice | 拠点INSERTとowner UPDATEが個別実行。後者失敗時に未紐付け拠点が残る | D08。一括成功/失敗に変更 |
| R14 / 中 | Worker INITIAL_SCHEMAとschema.sql | スキーマが二重管理。INITIAL_SCHEMAはsignupの救済から呼ばれており、未使用ではない | D07。migration導入後に重複を解消 |
| R15 / 要検証 | Worker:9 CORS、index.html CSP | originをそのまま反映、unsafe-evalを許可。これだけで認証回避とは断定しないが、運用origin・SDK要件との照合が必要 | A09。必要権限の実測後に絞る |
| R16 / 要検証 | sw.js | 現HTML/JSに登録処理はないが旧ファイルが配信可能。以前登録したブラウザの制御有無は不明。存在しないmanifest/icon参照、他cacheへの広い削除処理がある | M08。既存登録調査→限定的な退役。単純削除では解除されない |

## 今回実施した整理

- `build.ps1`を削除。別チェックアウトの絶対パスと存在しない旧モジュール名を前提にした単一HTML生成処理で、現行CI・起動・資料からの呼出しがない。
- `clean_styles.ps1`、`fix_styles_v2.ps1`、`fix_mojibake.ps1`を削除。過去の個人ディレクトリ・固定行番号に対する一回限りの修復処理で、再実行すると現行ファイルを誤編集する可能性がある。復元はGit履歴から可能。
- `package.json`の存在しないmigrate.jsのmain/migrateエントリを撤去。アプリ名・説明を現状に合わせ、privateを設定。lockfileの名前も一致させた。依存バージョンは変更していない。
- 起動時のバージョン/DEBUGログ、ログだけの開発モード分岐、Worker保存処理の重複診断ログとそれ専用の中間値を削除。エラー・競合追跡と保存件数等の主要診断は維持。
- main.jsのBEFORE/AFTER・追加箇所・経緯コメント、重複セクション見出しを整理。ポーリング間隔コメントは現在値の説明へ変更。
- 定数index.jsの「再exportする」「存在しないdom.js」といった誤説明を修正。現在はclassic scriptであることを明記。
- READMEの存在しないwebapp/構成、認証、キャッシュ設定の説明を修正。SYSTEM_ARCHITECTUREを共有D1仕様に合わせて書き直した。
- `npm run check`で25個のHTML script参照、ローカルアセット、classic scriptの構文・宣言衝突、Firebase module構文、Worker/旧SW構文を外部通信なしに確認できるようにした。
- Node/PowerShell双方のLLM_CONTEXT生成に実際に使われるauth-guard.jsを追加し、PowerShell版のMarkdown終了フェンスを修正。現行ソースからLLM_CONTEXTを再生成した。
- 改善78案と、依存・工数・完了条件を持つ段階的開発計画を作成。旧計画と索引からリンクした。

## 残したものと理由

- Firebase認証: 現在も読み込まれ、オーナー経路で利用されるため残す。
- auth-guard.js: headから同期読込みされるため残す。
- INITIAL_SCHEMA: signup経路からの実呼出しがあるため残す。
- 旧形式API、自己修復、復元処理: 稼働クライアントの利用状況が未確認なので、参照が少ないだけで撤去しない。
- styles.cssの上書き・動的クラス: ブレークポイント・印刷・管理UIの検証なしに一括削除しない。
- archive/とDEBUG_*.md: 履歴資料として保持。新しいレビューが現行課題の入口。旧資料を現行仕様とみなさない。
- sw.js: 既存登録ブラウザへの影響を調べてから退役する。

## 検証結果と限界

- Node.js v24.19.0で `npm run check` 成功。外部依存のダウンロードなし。
- ローカルHTTPサーバー＋インストール済みEdge/Playwrightで起動確認。Firebaseはスタブ、外向きリクエストはすべて固定応答に差替え。未ログイン画面の起動、officeクエリからの拠点ID補完を確認し、pageerrorは0件。
- ローカルWorker＋モックDBで、未認証リクエストは403、署名なしFirebase形状トークンはgetToolsで成功を返すことを再現（R01）。本番/開発APIへの攻撃・データアクセスはしていない。
- 明日の予定のSELECT漏れ、baseRev未処理、DELETEとINSERTの分離はソースで確認。実DBへの障害注入はしていない。
- 78件のID重複とローカル資料リンク、Node/PowerShell資料生成の一致（改行正規化後）、リポジトリ生成物チェック、git diff --checkを確認。
- 認証済みでの実業務操作、印刷の全レイアウト、Firebase実認証、実D1/KV、Cron、外部サービス連携は未検証。
- 本番反映・コミット・push・依存更新は行っていない。UI刷新と重要指摘の修正は今後の開発計画に残る。

## dev先行改善の追記（同日）

ユーザー指定によりdevで開発。共有D1の変更は後段に回した。今回の追加はフロント、dev CI、ローカルテスト、資料のみ。

- CSV: BOM除去、CR単独/CRLF/LFの認識、引用された空文字・末尾空列の保持、CRを含むセルの引用、空白の後の数式文字と先頭制御文字を保護。
- ツール: HTTP/HTTPS/mailto/telと既存相対URLのみリンク化。備考本文をHTMLエスケープする。R09の表示側を修正、保存側は未修正。
- 表記: 在席確認表・ログアウト・共有QRコードに変更。TITLE_SUFFIXを画面と一致させた。
- 全般のfocus-visibleを画面用CSSで追加し、印刷の配色を変更しない。
- dev CIのdeploy前にnpm run check / npm testを追加。テストはNode標準ライブラリとモックのみ。DBに接続しない。
- localhostの判定を部分一致から完全一致へ変更し、localhostを含む通常ドメインを開発扱いしない。
- 6件の回帰テスト成功。外部通信をスタブ化したEdgeでPC/モバイル起動、リンク・備考表示とfocusを確認。

共有DB・本番/開発のDBバインド・Cron・API書込・認証処理の追加変更は行っていない。mainのブランチ更新・本番デプロイ・devへのpushは行っていない。
