# Restores preview configs from the master (this folder) into the real Cursor/MPE paths.
# Before overwriting, it backs up the current file (....bak-<timestamp>).
# Run:  powershell -ExecutionPolicy Bypass -File .\restore.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$map = @(
    @{ src = "crossnote\parser.js";          dst = "$env:USERPROFILE\.crossnote\parser.js" },
    @{ src = "crossnote\style.less";         dst = "$env:USERPROFILE\.crossnote\style.less" },
    @{ src = "crossnote\head.html";          dst = "$env:USERPROFILE\.crossnote\head.html" },
    @{ src = "cursor-user\settings.json";    dst = "$env:APPDATA\Cursor\User\settings.json" },
    @{ src = "cursor-user\keybindings.json"; dst = "$env:APPDATA\Cursor\User\keybindings.json" }
)

foreach ($m in $map) {
    $src = Join-Path $root $m.src
    $dst = $m.dst
    if (-not (Test-Path $src)) { Write-Warning "Missing master: $src - skip"; continue }

    $dstDir = Split-Path $dst -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }

    if (Test-Path $dst) {
        Copy-Item $dst "$dst.bak-$stamp" -Force
        Write-Host "backup: $dst -> $dst.bak-$stamp"
    }
    Copy-Item $src $dst -Force
    Write-Host "restore: $($m.src) -> $dst"
}

Write-Host ""
Write-Host "Done. Restart Cursor or reopen the preview so MPE re-reads the files."
