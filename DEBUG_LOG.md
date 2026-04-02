# 管理パネル表示不具合 デバッグログ

## 現状の問題
1. **カラム構成タブのスクロール不全**:
   - モーダル内のコンテンツが溢れているが、縦スクロールバーが表示されない。
   - 代わりに背景（在席確認表）がスクロールしてしまう。
2. **カード表示時の余白**:
   - 1列表示（カード形式）の際、左右に5pxずつの余白が欲しい。

## 調査履歴

### 2026-04-02 調査 1
- **仮説**: Flexbox のネストにより、`.admin-card-body` が正しい高さを認識できていない。
- **実施した修正**: `.admin-card` を CSS Grid (`grid-template-rows: auto 1fr`) に変更。
- **結果**: ❌ 変化なし。

### 2026-04-02 調査 2
- **実施内容**: `minmax(0, 1fr)` への変更、`display: flex` を Body に追加、html/body 両方の overflow ロック。
- **結果**: ❌ 変化なし。

### 2026-04-02 調査 3
- **実施内容**: HTML構造の統一（admin-boxをcolumns-panelに変更）、tab-panel.active を flex 化。
- **結果**: ❌ 変化なし。

### 2026-04-02 調査 4 — 根本原因の特定 ★
- **コンソールログより決定的なデータ取得**:
  ```
  [Members タブ - 成功]
  Body scrollHeight: 1379px, offsetHeight: 674px → Needs Scroll: true ✅

  [Columns タブ - 失敗]
  Body scrollHeight: 48px, offsetHeight: 48px → Needs Scroll: false ❌
  Panel scrollHeight: 1886px, offsetHeight: 1886px
  ```
- **根本原因**:
  `.admin-card-body` に `display: flex` を設定したことが原因。
  CSS Grid の子要素（`minmax(0, 1fr)`）がさらに Flex コンテナになると、
  Flex の `flex-shrink` 計算が Grid の高さ制約と競合し、
  Body が 674px ではなく **48px に崩壊**する。
  
  メンバー管理タブでは TABLE 要素の固有最小サイズが Flex 縮小に抵抗するため偶然成功していた。
  カラム構成タブでは div ベースのコンテンツが縮小可能なため、Body ごと崩壊した。

- **修正内容**:
  1. `.admin-card-body` から `display: flex`, `flex-direction: column`, `flex: 1 1 auto` を**全て削除**。
  2. `.tab-panel.active` を `display: block` に戻す（`display: flex !important` を撤廃）。
  3. `.members-panel, .columns-panel` から `flex: 1 1 auto` を削除。
  4. Body は純粋な block 要素 + `overflow-y: auto` + `min-height: 0` のみ。
  5. Gridの `minmax(0, 1fr)` が Body の高さを確実に制約 → コンテンツが溢れる → スクロール発生。

- **カード表示修正**: `calc(100% + 22px)` + `margin: 0 -11px` で左右5pxずつの余白を確保。

## 対応工程状況
- [x] `DEBUG_LOG.md` の作成
- [x] 調査1: Grid化 → 失敗
- [x] 調査2: minmax + flex → 失敗
- [x] 調査3: HTML統一 + flex → 失敗
- [x] 調査4: 根本原因特定 → **flex 全排除で修正**
- [ ] ユーザー確認待ち
