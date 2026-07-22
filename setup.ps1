# ============================================================================
#  ProcessHub Markdown Preview - setup for team members.
#  Run by double-clicking setup.cmd (it launches this script).
#
#  What it does:
#    1) builds the .vsix package from extension/ (or reuses an existing one);
#    2) installs it via the official "cursor --install-extension" command
#       (safe: does not touch other extensions or the extensions registry);
#    3) SAFELY merges one preview setting into settings.json (keeps your own);
#    4) adds the Ctrl+Shift+V shortcut for the built-in markdown preview.
#  Every file that is changed is backed up first (....bak-<timestamp>).
# ============================================================================

$ErrorActionPreference = "Stop"
$root  = $PSScriptRoot
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Info($m){ Write-Host $m -ForegroundColor Cyan }
function Ok($m){ Write-Host $m -ForegroundColor Green }
function Warn($m){ Write-Host $m -ForegroundColor Yellow }

function Write-Utf8NoBom($path, $text){
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $text, $enc)
}

# Light JSONC cleanup: strip only whole-line comments (// at line start, so we
# don't touch "https://" inside values) and trailing commas.
function Read-Jsonc($path){
    $raw = Get-Content $path -Raw -Encoding UTF8
    $raw = $raw -replace '(?m)^\s*//.*$', ''
    $raw = $raw -replace '/\*[\s\S]*?\*/', ''
    $raw = $raw -replace ',(\s*[}\]])', '$1'
    return ($raw | ConvertFrom-Json)
}

# --- 0. Paths ---
$userDir  = Join-Path $env:APPDATA "Cursor\User"
$settings = Join-Path $userDir "settings.json"
$keybinds = Join-Path $userDir "keybindings.json"

Info "== ProcessHub Markdown Preview setup =="

# --- 1. Build the .vsix package ---
Info "`n[1/4] Building the extension package (.vsix)..."
$vsix = $null
try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "build-vsix.ps1") | Out-Host
    $vsix = Get-ChildItem $root -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
} catch {
    Warn "  Build failed: $($_.Exception.Message)"
}
if (-not $vsix) {
    # fall back to a prebuilt package shipped with the folder, if any
    $vsix = Get-ChildItem $root -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if ($vsix) { Ok ("  Package: " + $vsix.Name) } else { Warn "  No .vsix package available." }

# --- 2. Install the extension ---
Info "`n[2/4] Installing the extension..."
$cursorCli = Get-Command cursor -ErrorAction SilentlyContinue
if ($vsix -and $cursorCli) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & cursor --install-extension $vsix.FullName 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) {
        Ok "  Extension installed."
    } else {
        Warn "  CLI install failed (exit $LASTEXITCODE)."
        Warn "  Install manually: Ctrl+Shift+P -> 'Extensions: Install from VSIX...' -> pick $($vsix.Name)"
    }
    $ErrorActionPreference = $prev
} elseif ($vsix) {
    Warn "  'cursor' CLI not found in PATH."
    Warn "  Install manually: Ctrl+Shift+P -> 'Extensions: Install from VSIX...' -> pick $($vsix.Name)"
} else {
    Warn "  Skipped (no package)."
}

# --- 3. settings.json (merge one key, keep personal ones) ---
Info "`n[3/4] Preview settings (settings.json)..."
$desired = [ordered]@{
    "markdown.preview.frontMatter" = "show"
}
if (-not (Test-Path $userDir)) { New-Item -ItemType Directory -Force -Path $userDir | Out-Null }
try {
    if (Test-Path $settings) {
        Copy-Item $settings "$settings.bak-$stamp" -Force
        $obj = Read-Jsonc $settings
    } else {
        $obj = [pscustomobject]@{}
    }
    foreach ($k in $desired.Keys) {
        $obj | Add-Member -NotePropertyName $k -NotePropertyValue $desired[$k] -Force
    }
    Write-Utf8NoBom $settings ($obj | ConvertTo-Json -Depth 30)
    Ok "  Setting merged (personal ones kept; backup next to file)."
} catch {
    Warn "  Could not edit settings.json automatically (non-standard format?)."
    Warn "  Reason: $($_.Exception.Message)"
    Warn '  Add manually:  "markdown.preview.frontMatter": "show"'
}

# --- 4. keybindings.json (Ctrl+Shift+V -> built-in markdown preview) ---
Info "`n[4/4] Keyboard shortcut (keybindings.json)..."
try {
    $arr = @()
    if (Test-Path $keybinds) {
        Copy-Item $keybinds "$keybinds.bak-$stamp" -Force
        $parsed = Read-Jsonc $keybinds
        if ($parsed) { $arr = @($parsed) }
    }
    # drop old MPE binding if present, keep everything else
    $arr = @($arr | Where-Object { $_.command -ne "markdown-preview-enhanced.openPreviewToTheSide" })
    $hasPreview = $false
    foreach ($e in $arr) { if ($e.command -eq "markdown.showPreviewToSide") { $hasPreview = $true } }
    if (-not $hasPreview) {
        $hasUnbind = $false
        foreach ($e in $arr) { if ($e.command -eq "-frontMatter.insertSnippet") { $hasUnbind = $true } }
        if (-not $hasUnbind) {
            $arr += [pscustomobject]@{ key="ctrl+shift+v"; command="-frontMatter.insertSnippet" }
        }
        $arr += [pscustomobject]@{ key="ctrl+shift+v"; command="markdown.showPreviewToSide"; when="editorLangId == 'markdown' && !notebookEditorFocused" }
    }
    $kbJson = @($arr) | ConvertTo-Json -Depth 30
    if (-not $kbJson.TrimStart().StartsWith('[')) { $kbJson = "[`n$kbJson`n]" }
    Write-Utf8NoBom $keybinds $kbJson
    Ok "  Ctrl+Shift+V -> built-in markdown preview."
} catch {
    Warn "  Could not edit keybindings.json automatically - not critical."
    Warn "  Reason: $($_.Exception.Message)"
}

Ok "`nDone! Restart Cursor. Open a .md file and press Ctrl+Shift+V."
