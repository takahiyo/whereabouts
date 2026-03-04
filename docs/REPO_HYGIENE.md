# Repository Hygiene（運用ルール / SSOT）

このドキュメントを、**コミット禁止対象の唯一の運用ルール（SSOT）** とします。

## 目的

- ローカル実行で生成される一時ファイルや個人環境依存ファイルの誤コミットを防ぐ。
- CI とローカル pre-commit で同一ルールを共有し、チェックロジックを DRY に保つ。

## コミット禁止対象（SSOT）

実際の禁止パターンは以下のファイルで一元管理します。

- `scripts/repo-hygiene/blocked-patterns.txt`

主な対象:

- Wrangler ローカル状態（`.wrangler/`）
- SQLite ローカル生成物（`*.sqlite*`）
- ログ（`*.log`）
- キャッシュ（`.cache/`）
- IDE 生成物（`.vscode/`, `.idea/`）
- OS 依存生成物（`.DS_Store`, `Thumbs.db`）

## チェック実装

- 共通スクリプト: `scripts/check-forbidden-tracked-files.sh`
- CI: `.github/workflows/guard-local-artifacts.yml`
- pre-commit hook: `.githooks/pre-commit`

## ローカル有効化手順（初回のみ）

```bash
git config core.hooksPath .githooks
```

以降、`git commit` 時に CI と同一ルールで自動チェックされます。
