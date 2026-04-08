# グループ管理タブ スクロール不具合 デバッグログ

## 問題
グループ管理タブで縦スクロールバーが表示されず、下部のコンテンツが切れている

## 原因特定
styles.css内に`.tab-panel`関連のCSS定義が**2箇所に重複**して存在していた。

### 古い定義（1047-1065行目）← 問題の根本原因
```css
.tab-panel {
  display: none;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
}

.tab-panel.active {
  display: block;
}

.tab-panel.active[data-tab="members"],
.tab-panel.active[data-tab="columns"],
.tab-panel.active[data-tab="notices"],
.tab-panel.active[data-tab="groups"] {  /* ← グループにもoverflow-y: hiddenが！ */
  display: flex;
  flex-direction: column;
  overflow-y: hidden;  /* ← これがスクロールを殺していた */
}
```

### 新しい定義（1326-1352行目）← 今回の修正で追加
```css
.tab-panel { ... padding: 24px; ... }
.tab-panel.active { ... flex: 1; overflow-y: auto; ... }
```

### 結論
古い定義の `.tab-panel.active[data-tab="groups"]` に `overflow-y: hidden` があり、
CSSの詳細度（specificity）が高いため、新しい `.tab-panel.active` の `overflow-y: auto` を上書きしていた。

## 修正内容
- 古い定義（1047-1065行目）を削除し、新しい定義に一本化

## テスト結果
- [ ] ユーザー確認待ち
