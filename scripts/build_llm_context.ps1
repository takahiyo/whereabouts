# LLM_CONTEXT.md 生成（Node 不要）
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location $root

$files = @(
  "index.html",
  "styles.css",
  "print-list.css",
  "schema.sql",
  "CloudflareWorkers_worker.js",
  "sw.js",
  "js/config.js",
  "js/constants/storage.js",
  "js/constants/timing.js",
  "js/constants/ui.js",
  "js/constants/defaults.js",
  "js/constants/column-definitions.js",
  "js/constants/messages.js",
  "js/constants/index.js",
  "js/globals.js",
  "js/utils.js",
  "js/services/qr-generator.js",
  "js/services/csv.js",
  "js/layout.js",
  "js/filters.js",
  "js/board.js",
  "js/vacations.js",
  "js/offices.js",
  "js/firebase-config.js",
  "js/firebase-auth.js",
  "js/auth.js",
  "js/sync.js",
  "js/admin.js",
  "js/tools.js",
  "js/notices.js",
  "main.js",
  "package.json",
  "wrangler.toml"
)

function Get-Lang([string]$f) {
  if ($f.EndsWith(".html")) { return "html" }
  if ($f.EndsWith(".css")) { return "css" }
  if ($f.EndsWith(".sql")) { return "sql" }
  if ($f.EndsWith(".json")) { return "json" }
  if ($f.EndsWith(".toml")) { return "toml" }
  return "javascript"
}

$fileListMd = ($files | ForEach-Object { "- ``$_``" }) -join "`n"
# $PSScriptRoot が空になる実行形態があるため、リポジトリルート基準で解決する
$headerPath = Join-Path $root "scripts\LLM_CONTEXT_header.md"
if (-not (Test-Path -LiteralPath $headerPath)) {
  throw "Header template not found: $headerPath"
}
# 外部テンプレートは UTF-8（BOMなし）で保存されている
$headerUtf8 = [System.Text.UTF8Encoding]::new($false)
$headerTemplate = [System.IO.File]::ReadAllText($headerPath, $headerUtf8)
$header = $headerTemplate.Replace("{{FILE_LIST}}", $fileListMd)

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append($header)

foreach ($rel in $files) {
  $abs = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $abs)) {
    throw "Missing file: $rel"
  }
  $body = [System.IO.File]::ReadAllText($abs, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n").Replace("`r", "`n")
  $lang = Get-Lang $rel
  [void]$sb.Append("### $rel`n`n")
  [void]$sb.Append('```' + $lang + "`n")
  [void]$sb.Append($body)
  [void]$sb.Append("`n```n`n")
}

$outPath = Join-Path $root "LLM_CONTEXT.md"
[System.IO.File]::WriteAllText($outPath, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote $outPath size" (Get-Item $outPath).Length
