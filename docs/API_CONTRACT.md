# API・権限・ステータスの現行契約

確認: 2026-10-04。現行Workerの静的読取りに基づく。仕様整理のみで、API・DB・権限の挙動は変更していない。M01/A04/F01の設計準備用。

## 通信形式

- POSTのみ。OPTIONSはDB接続前に応答、その他methodは405。
- 現行リクエストはJSONの `{ data: params }`。互換としてJSONフラット形式とform-urlencodedを受け付ける。
- 同名パラメータはdataオブジェクト内が外側より優先。名簿/在席等の構造化payloadにもdataというキーを使うため、クライアント側でさらに二重・三重に包まない。
- tokenOffice/tokenRoleをクライアントが送信しても認可の根拠にしない。Workerのtoken検証とusers照合で得たcontextが認可の根拠。
- 一般ガードは認証、所属拠点、要求officeの一致を確認。superAdminは拠点一致の例外。以下の公開/特殊actionは一般ガードを迂回して各action内で検査。
- HTTP成功と業務成功は別。現行は多くの業務エラーを200で返すため、必ずJSONのok/errorも確認する。okを含まないエラーも残る。

## action一覧・現在の許可条件

パラメータ欄は各actionが直接取得する項目（token/officeは共通ガードでも取得）。必須/任意・上限・型の完全なschemaは後段のAPI実装で確定する。ここで希望する権限を現在の挙動と混同しない。

| action | 直接取得するパラメータ | 現行の許可条件 |
|---|---|---|
| `login` | `office`, `password` | 公開（パスワード照合） |
| `signup` | `token` | 検証済みFirebaseメールが必要※ |
| `createOffice` | `token`, `officeId`, `name`, `password`, `adminPassword` | 登録済みFirebase利用者※ |
| `getConfig` / `getConfigFor` | `office`, `nocache` | 認証済み・同一拠点 / 認証済み・同一拠点 |
| `publicListOffices` |  | 公開（公開拠点のみ） |
| `listOffices` |  | superAdmin |
| `renew` |  | token検証・拠点未紐付けは別応答 |
| `get` / `getFor` | `office`, `since`, `nocache` | 認証済み・同一拠点 / 認証済み・同一拠点 |
| `getTools` | `office` | 認証済み・同一拠点 |
| `setTools` | `tools` | officeAdmin / owner / superAdmin |
| `getEventColorMap` | `office` | 認証済み・同一拠点 |
| `setEventColorMap` | `office`, `data` | officeAdmin / owner / superAdmin |
| `getNotices` | `office` | 認証済み・同一拠点 |
| `setNotices` | `notices` | officeAdmin / owner / superAdmin |
| `getVacation` | `office` | 認証済み・同一拠点 |
| `setVacation` | `vacations`, `data` | officeAdmin / owner / superAdmin |
| `deleteVacation` | `id` | officeAdmin / owner / superAdmin |
| `setVacationBits` | `data` | officeAdmin / owner / superAdmin |
| `getColumnConfig` | `office` | 認証済み・同一拠点 |
| `setColumnConfig` | `office`, `config` | officeAdmin / owner / superAdmin |
| `getOfficeSettings` | `office` | officeAdmin / owner / superAdmin |
| `setOfficeSettings` | `office`, `settings` | officeAdmin / owner / superAdmin |
| `renameOffice` | `office`, `name` | officeAdmin / owner / superAdmin |
| `setOfficePassword` | `id`, `office`, `password`, `adminPassword` | officeAdmin / owner / superAdmin |
| `setUserPassword` | `office`, `password` | officeAdmin / owner / superAdmin |
| `set` / `setFor` | `office`, `data` | 認証済み・同一拠点 / officeAdmin / owner / superAdmin |
| `setConfigFor` | `office`, `data` | officeAdmin / owner / superAdmin |
| `addOffice` | `officeId`, `name`, `password`, `adminPassword` | superAdmin |
| `deleteOffice` | `officeId` | superAdmin |

※Firebase token署名検証は未修正（A01）。この表の「認証済み」は実装上のcontext成立条件を指し、現状の安全性を保証するものではない。

DB由来のstaff/ownerと共有ログイン由来のuser/officeAdmin、DEV_TOKEN由来のsuperAdminが併存する。staffをofficeAdminと同一視しない。DEV_TOKENの本番設定有無は未確認。ツール/お知らせ/休暇等の保存は要求officeではなくtokenOfficeを使うため、superAdminならどのactionでも要求拠点へ書けると推測しない。

## 読取り応答とエラー

在席get/getForはdata（member IDをキーとする状態）、maxUpdated、serverNowを返す。since=0は全件、since>0はupdatedがsinceより大きい行。差分から消えたメンバーの通知と同時刻境界の取りこぼしはD13で設計する。nocache=1は在席/設定のKV読取りを迂回する。KVへの書込みが発生する読取り経路もある。

代表的なエラー: unauthorized（no_auth_context / no_office_assigned / office_access_denied）、DB_BINDING_MISSING、invalid_request、unknown_action、internal_server_error。形式とHTTP statusが統一されていないためM01で整理する。内部エラーメッセージの公開はA10で見直す。

在席setはbaseRevを検証しない、renewは署名tokenの期限を延長しない、setConfigForは事前DELETEと予定読取り漏れが残る。[コードレビュー](CODE_REVIEW_2026-10-04.md)のR04〜08を修正前の前提とする。

## 現行ステータス

正はjs/constants/defaults.jsのDEFAULT_STATUSESと拠点のメニュー設定。標準値を強制する新しいDB制約は追加しない。

| 標準値 | 戻り時間入力の要求 | clearOnSet | 色以外の表示 |
|---|---|---|---|
| 在席 | なし | あり | 状態selectの文字 |
| 外出 | あり | なし | 同上 |
| 在宅勤務 | なし | あり | 同上 |
| 出張 | あり | なし | 同上 |
| 研修 | あり | なし | 同上 |
| 健康診断 | あり | なし | 同上 |
| ドック | あり | なし | 同上 |
| 帰宅 | なし | なし | 同上 |
| 休み | なし | あり | 同上 |

clearOnSetは状態変更時に戻り時間と定型の備考を消す既存フロント挙動。任意の備考全文を無条件に消すという意味ではない。入力中の戻り時間を守る条件もある。requireTimeは入力促進の設定で、Workerによる必須検証ではない。現行DEFAULT_STATUSESには会議は含まれないがUIのCSSクラスには存在するため、拠点側で追加される場合を許容する。

本人/代理更新の範囲、戻り予定を過ぎた後の状態、休暇情報の公開範囲は今後の業務仕様として未確定。時刻だけから在席や勤務実績を自動断定しない。

## 環境ホストと検証の範囲

| ホスト | 現行接続先 |
|---|---|
| localhost / 127.0.0.1 / dev.から始まるホスト | dev Worker |
| dev.<Pagesプロジェクト>.pages.dev | dev Worker |
| 通常の本番ホスト | 本番Worker |
| ハッシュpreview / dev.で始まらないpreview | 本番Workerになる（未解消） |

環境ホスト9件をconfig.jsそのもので試験する。ルーティング挙動を把握する試験であり、ハッシュpreviewの誤接続対策の完了ではない。M05の明示設定/許可ホスト設計は後段に残す。

npm testはNode標準ライブラリ、匿名fixture、読取専用DBモックを使う。モックのrun/batchは例外にして予期しない書込みを検出する。npm run test:browserはすべての外部通信を固定応答へ差替え、UIの表示/閉じる操作のみ検証する。実D1・Firebase・KV・Cronの結合確認は含まない。

## 後段の契約確定条件

- action単位の必須/任意/型/文字数/件数上限を定義し、フロントとWorkerの双方で検証。
- 全role×action×所属/別拠点の許否表を試験で固定。試験用office allowlistを設ける。
- 認証拒否・入力不正・競合・対象消失・内部障害を一貫したstatus/error形式にする。
- 保存での部分成功か全件成功かを明記し、影響行数・競合・再送を検証する。
- 後方互換期間とmain/devの混在版、戻し方を定義する。
