# SessionStart フック — using-superpowers スキルをセッションコンテキストに注入する
# allergy-scan-app 用 (PowerShell / Windows)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$skillPath  = Join-Path $scriptDir "..\skills\using-superpowers\SKILL.md"
$skillPath  = (Resolve-Path $skillPath -ErrorAction SilentlyContinue)?.Path

if (-not $skillPath -or -not (Test-Path $skillPath)) {
    # スキルファイルが見つからない場合は空のコンテキストで終了
    Write-Output '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":""}}'
    exit 0
}

$skillContent = Get-Content -Path $skillPath -Raw -Encoding UTF8

# JSON エスケープ処理
$escaped = $skillContent `
    -replace '\\', '\\\\' `
    -replace '"',  '\"'   `
    -replace "`r`n", '\n' `
    -replace "`n",   '\n' `
    -replace "`r",   '\n' `
    -replace "`t",   '\t'

$sessionContext = "<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n**以下はあなたの 'using-superpowers' スキルの全内容です — スキルの使い方の紹介です。他のスキルはすべて 'Skill' ツールを使って呼び出してください:**\n\n$escaped\n</EXTREMELY_IMPORTANT>"

# JSON エスケープ（二重エスケープ）
$contextEscaped = $sessionContext `
    -replace '\\', '\\\\' `
    -replace '"',  '\"'   `
    -replace "`r`n", '\n' `
    -replace "`n",   '\n' `
    -replace "`r",   '\n' `
    -replace "`t",   '\t'

# Claude Code 形式で出力
Write-Output "{`"hookSpecificOutput`":{`"hookEventName`":`"SessionStart`",`"additionalContext`":`"$contextEscaped`"}}"
