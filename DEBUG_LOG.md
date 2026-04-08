# デバッグログ: 管理パネル カラム構成タブのスクロール不具合

## 問題
管理パネルで「カラム構成」タブを開いた時、モーダル内の縦スクロールができない。

## 原因分析

コンソールログの重要データ：
```
Body scrollHeight after fix: 724px   ← admin-card-body の scrollHeight
Panel content: 1886px                ← タブパネルの実際のコンテンツ高さ
```

admin-card-body の scrollHeight（724px）にパネルの実コンテンツ（1886px）が反映されていない。

### 根本原因
`auth.js` の `showAdminModal()` と `admin.js` のタブ切り替えロジックで、
`body.style.display = 'block'` をインラインスタイルとして強制設定していた。

`.admin-card` は `display: grid` + `grid-template-rows: auto minmax(0, 1fr)` で構成されている。
Grid子要素の `.admin-card-body` に `display: block` を設定すると、
Grid の `minmax(0, 1fr)` による自動高さ計算が無効化され、
body が正しい高さを取得できずスクロールが機能しなくなっていた。

## 修正内容（工程1）

### auth.js
- `showAdminModal()` 内の `forceBodyScroll()` 関数を削除
- 代わりに、前回のインラインスタイル残留をクリアする処理に変更
- CSS Grid レイアウトに委ねる方式

### admin.js  
- タブ切り替え時の `setTimeout` 内でのインラインスタイル強制設定を削除
- 代わりに `removeProperty` でインラインスタイルをクリアする処理に変更

## テスト結果
- [ ] ユーザーによるテスト待ち
