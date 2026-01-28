/**
 * js/constants/index.js - 定数バレルファイル (SSOT)
 *
 * 本ファイルはすべての定数モジュールを再エクスポートする。
 * 利用側は `import { ... } from './constants/index.js'` で一括インポート可能。
 *
 * 構成:
 * - storage.js: ストレージ関連キー
 * - dom.js: DOM ID・セレクタ
 * - timing.js: タイミング関連定数
 * - ui.js: UI関連定数（ステータス、カラー等）
 *
 * @see SSOT_GUIDE.md
 */

// 各定数モジュールを読み込み順に列挙
// ※ ES Modules未使用のため、HTML側でscriptタグ順に読み込む
// ※ 将来的にES Modules化する際はここで export * from を使用

// 現在はグローバルスコープで動作するため、このファイルは
// ドキュメント用のインデックスとして機能する
