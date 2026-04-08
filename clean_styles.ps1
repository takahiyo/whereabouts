$filePath = "c:\TEMP\GitHub\Whereabouts\whereabouts\styles.css"
$lines = Get-Content $filePath -Encoding UTF8

$cleanLines = New-Object System.Collections.Generic.List[string]
$corruptedCount = 0

foreach ($line in $lines) {
    # 文字化けの特徴的なパターン（繝, 郢, 邵, 陝など）が含まれるコメント行を検出
    if ($line -match "/\*.*[繝郢邵陝].*\*/") {
        $corruptedCount++
        continue # この行をスキップ
    }
    # 文字化けが含まれる行でも、プロパティ定義などの場合はコメント部分のみを削除したいが、
    # 今回はコメント行単体での破損が多いため、まずは行単体で削除してみる
    $cleanLines.Add($line)
}

# 波括弧のバランスチェック
$fullText = [string]::Join("`n", $cleanLines)
$openCount = ($fullText.ToCharArray() | Where-Object { $_ -eq '{' }).Count
$closeCount = ($fullText.ToCharArray() | Where-Object { $_ -eq '}' }).Count

Write-Output "Removed $corruptedCount corrupted comment lines."
Write-Output "Braces: Open=$openCount, Close=$closeCount"

if ($openCount -ne $closeCount) {
    Write-Warning "Brace mismatch detected! Check styles.css syntax."
}

# 書き出し
[System.IO.File]::WriteAllLines($filePath, $cleanLines, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Successfully cleaned and saved styles.css"
