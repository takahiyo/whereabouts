#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATTERN_FILE="$ROOT_DIR/scripts/repo-hygiene/blocked-patterns.txt"

if [[ ! -f "$PATTERN_FILE" ]]; then
  echo "❌ ルール定義ファイルが見つかりません: $PATTERN_FILE" >&2
  exit 1
fi

mapfile -t BLOCKED_PATTERNS < <(sed -e 's/#.*$//' -e 's/[[:space:]]*$//' "$PATTERN_FILE" | awk 'NF > 0')

if [[ ${#BLOCKED_PATTERNS[@]} -eq 0 ]]; then
  echo "⚠️ 禁止パターンが定義されていないため、チェックをスキップします。"
  exit 0
fi

blocked_files=""
for pattern in "${BLOCKED_PATTERNS[@]}"; do
  matches="$(git ls-files "$pattern")"
  if [[ -n "$matches" ]]; then
    blocked_files+="$matches"$'\n'
  fi
done

if [[ -n "$blocked_files" ]]; then
  echo "❌ コミット禁止ファイルが Git 管理下にあります。インデックスから除外してください。" >&2
  printf '%s' "$blocked_files" >&2
  exit 1
fi

echo "✅ コミット禁止ファイルは検出されませんでした。"
