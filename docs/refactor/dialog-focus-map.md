# 閲覧dialogのfocus機能マップ

対象: js/services/dialog-focus.js。新規モジュール追加であり既存コードの物理分割ではない。

## 責務

QR・ツール・マニュアルの閲覧dialogを、初期focus、Tab循環、Escape、開いた要素への復帰で補助する。既存のshow/style/classと閉じるボタンを利用し、通信・データ保存を行わない。

## 依存・参照

- constants/ui.js: READ_ONLY_DIALOGS、DIALOG_FOCUSABLE_SELECTOR。
- index.html: notices.jsの後、main.jsの前にdeferで読み込む。
- auth.js: QRの既存showQrModalとcloseボタン。
- main.js: toolsの既存開閉、manualの復旧した開閉/タブ。
- scripts/build_llm_context.{mjs,ps1}: ソースを資料へ含める。

DOMContentLoadedで対象を一度だけ登録。MutationObserverはdialog rootのclass/style/hiddenだけを監視し、子要素更新や文書全体は監視しない。属性更新では表示状態が変わったときだけfocusを移す。

## 公開API

外部へ公開しない。既存の開閉イベント/関数をそのまま使う。定数への登録を増やす際は、編集内容・未保存確認・閉じる操作を先に調べる。

## 制約と検証

管理・メンバー編集・自動保存の行事dialogは対象外。未保存確認と入れ子全体の閉じ方を別に設計する。pointerでの画面外focus抑止/inertは未導入であり、全dialogのアクセシビリティ完了とはしない。

npm run test:browserで1280/360pxの起動、閲覧dialog3件のTab/Shift+Tab/Escape/復帰、マニュアルtab、toolsの上にQRを開く入れ子を検証する。全外部通信はモック。
