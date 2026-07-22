# Updates the master (this folder) from the live Cursor/MPE configs.
# Run AFTER you tweaked something in the preview and want to snapshot it into the repo.
# Then: git add . && git commit -m "preview: update".
# Run:  powershell -ExecutionPolicy Bypass -File .\backup.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$map = @(
    @{ dst = "crossnote\parser.js";          src = "$env:USERPROFILE\.crossnote\parser.js" },
    @{ dst = "crossnote\style.less";         src = "$env:USERPROFILE\.crossnote\style.less" },
    @{ dst = "cursor-user\settings.json";    src = "$env:APPDATA\Cursor\User\settings.json" },
    @{ dst = "cursor-user\keybindings.json"; src = "$env:APPDATA\Cursor\User\keybindings.json" }
)

foreach ($m in $map) {
    $src = $m.src
    $dst = Join-Path $root $m.dst
    if (-not (Test-Path $src)) { Write-Warning "Missing live file: $src - skip"; continue }

    $dstDir = Split-Path $dst -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }

    Copy-Item $src $dst -Force
    Write-Host "backup: $src -> $($m.dst)"
}

Write-Host ""
Write-Host "Master updated. Remember: git add . && git commit."
