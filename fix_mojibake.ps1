$indexHtmlPath = 'c:\TEMP\GitHub\Whereabouts\whereabouts\index.html'
$content = [System.IO.File]::ReadAllLines($indexHtmlPath, [System.Text.Encoding]::UTF8)
$content[500] = '            <h4>🛠️ ツール情報の管理</h4>'
$content[506] = '                <p>ツールの順序はドラッグ&ドロップまたは▲▼ボタンで入れ替えられます。上にあるものから順に表示されます。</p>'
$content[507] = '                <p>タイトルとURL、備考を入力できます。表示をOFFにしたツールは利用者画面に表示されません。</p>'
$content[510] = '                <button id="btnAddTool" class="btn-primary">➕ ツールを追加</button>'
$content[511] = '                <button id="btnLoadTools" class="btn-secondary">🔄 読み込み</button>'
$content[512] = '                <button id="btnSaveTools" class="btn-success">💾 保存</button>'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($indexHtmlPath, $content, $utf8NoBom)

$stylesCssPath = 'c:\TEMP\GitHub\Whereabouts\whereabouts\styles.css'
$cssContent = [System.IO.File]::ReadAllLines($stylesCssPath, [System.Text.Encoding]::UTF8)
$cssContent[1] = '  /* === パネル表示（多段）用幅定義 (SSOT) === */'
$cssContent[2] = '  /* カラム幅は js/constants/column-definitions.js をマスターとし、JSから動的に --table-min-width 等を設定する */'
$cssContent[3] = '  /* ユーザーが「管理画面 > 拠点設定」で設定した最小・最大値により上書きされる */'
[System.IO.File]::WriteAllLines($stylesCssPath, $cssContent, $utf8NoBom)
