# LLM向けプロジェクト・コンテキスト（Whereabouts / 在席ボード）

本ドキュメントは **NotebookLM・外部LLM** がリポジトリを横断解析するための**単一ソース**です。前半に要約、後半に**現行アプリの全ソース全文**を含みます（`archive/` の旧コード・未使用ファイルは除外）。

## 前半: 要約・ナビゲーション

### 本ファイルの役割

| 用途 | 参照先 |
|------|--------|
| 要約＋**全コード本文** | **本ファイル（LLM_CONTEXT.md）** |
| AI向けコーディング規約の索引 | リポジトリ内 `INDEX.md`（必要なら別ソースに取り込み） |
| 最優先の禁止事項 | `CORE_PRINCIPLES.md` |
| システム構成 | `docs/SYSTEM_ARCHITECTURE.md` |

### 技術スタック（要約）

- フロント: Vanilla JS, HTML5, CSS3（`index.html` の `<script>` 順序に依存）
- API: Cloudflare Workers（`CloudflareWorkers_worker.js`）
- DB: Cloudflare D1（`schema.sql`）
- 定数の集約: `js/constants/*`（SSOT）

### 再生成方法

リポジトリの `whereabouts/` で次を実行すると、本ファイルを同じルールで作り直せます。

- PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/build_llm_context.ps1`
- Node: `node scripts/build_llm_context.mjs`

### 結合に含まれるファイル一覧（`archive/` 除く）

{{FILE_LIST}}

### 後半: 全ソースコード

以下、各ファイルは `### 相対パス` の見出しの直後にコードブロックで**全文**を記載する。

---
