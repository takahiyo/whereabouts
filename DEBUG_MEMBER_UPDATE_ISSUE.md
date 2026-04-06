# メンバー更新時にボード表示が消失する不具合の調査

## 調査状況
- **問題の特定**: メンバー管理画面での更新処理後にボードが消失する（真っ白になる）現象を確認。ブラウザのリロードで復旧することから、クライアントサイドのレンダリング処理または状態管理の不整合が疑われます。
- **原因の特定**: 
    - `admin.js` の `handleMemberSave` 内で `GROUPS` を更新する際、使用する `groups` データに `status`, `time`, `note` 等のステータス情報が含まれていない。
    - その結果、`render()` によってステータスが空の行が生成される。
    - ブラウザでステータスフィルター（例：「在席」）が有効な場合、`applyFilters()` によってすべての行が `display: none` になり、パネル全体が表示されなくなる。
- **現状の把握**: `admin.js` 内の保存ロジックにおいて、既存のステータス情報を保持するように修正が必要。

## 調査フロー
1. [x] `admin.js` 内の `handleMemberSave` の定義箇所を特定
2. [x] 保存処理実行時の `GROUPS` 更新と `render()` 呼び出しを確認
3. [x] `normalizeConfigClient` と `applyFilters` の挙動を確認
4. [ ] 修正案の作成と実施

## 修正案
- `admin.js` の `buildMemberSavePayload` で生成する `groups` に現在のステータス情報を含める。
- `handleMemberSave` での `applyState` 呼び出しを整理する。
