$filePath = "c:\TEMP\GitHub\Whereabouts\whereabouts\styles.css"
$lines = Get-Content $filePath -Encoding UTF8

# 1-indexedの行番号を指定（配列は0-indexedなので -1 する）
# 注意: すでに一部置換されている可能性があるため、慎重に行う

$replacements = @{
    2 = "  /* === パネル表示（多段）用幅定義 (SSOT) === */";
    3 = "  /* カラム幅は js/constants/column-definitions.js をマスターとし、JSから動的に --table-min-width 等を設定する */";
    4 = "  /* ユーザーが「管理画面 > 拠点設定」で設定した最小・最大値により上書きされる */";
    6 = "  /* ステータス幅: --status-fixed が拠点設定にある場合はそれを優先 */";
    9 = "  /* テーブル最小幅 SSOT: 拠点 min 幅設定 */";
    10 = "  /* 未設定時は table の min-width 属性使用時と同様、panel の横スクロールを制御 */";
    19 = "  /* === カラーパレット (SSOT) === */";
    62 = "  /* 基本のカラー定義 */";
    71 = "  /* ボタングループ背景・ボーダー */";
    72 = "  --color-btn-group-border: #bfe4ff;";
    76 = "  /* ボタングループのボーダー */";
    77 = "  --color-btn-admin-border: #b7e6b7;";
    83 = "  /* ボタングループのボーダー */";
    84 = "  --color-btn-tools-border: #bae6fd;";
    96 = "/* ヘッダー */";
    176 = "  background: #f0fdf4; /* green-50：以前の設定を維持 */";
    178 = "  display: none; /* 非表示設定 */";
    181 = "/* 検索/フィルタUIを非表示 */";
    200 = "/* ヘッダー内要素のアライメント */";
    218 = "/* 枠 */";
    253 = "/* パネル内のテーブルは、各拠点の設定を優先適用する */";
    254 = "/* これにより、パネルの横スクロールを制御する */";
    299 = "/* === カード表示時のスタイルリセット === */";
    300 = "/* インライン指定などを !important でリセットします */";
    323 = "/* 名前カラムなど特定のカラム幅設定 */";
    681 = "/* === カード表示（モバイル用）の定義 === */";
    682 = "/* メディアクエリ、またはJSでの強制クラスで発動 */";
    747 = "  /* モバイル表示時は一部情報を非表示にする */"
}

foreach ($entry in $replacements.GetEnumerator()) {
    $idx = [int]$entry.Name - 1
    if ($idx -lt $lines.Count) {
        $lines[$idx] = $entry.Value
    }
}

# UTF8 (BOMなし) で書き出し
[System.IO.File]::WriteAllLines($filePath, $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Successfully cleaned styles.css"
