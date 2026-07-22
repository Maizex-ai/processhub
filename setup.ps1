# ============================================================================
#  Markdown preview (MPE) setup for Cursor - for team members.
#  Run by double-clicking setup.cmd (it launches this script).
#  What it does:
#    1) installs the Markdown Preview Enhanced extension (if the cursor CLI exists);
#    2) copies parser.js and style.less into the profile (%USERPROFILE%\.crossnote);
#    3) SAFELY merges the required MPE keys into settings.json (keeps your own);
#    4) adds the Ctrl+Shift+V shortcut to keybindings.json.
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
$crossnote = Join-Path $env:USERPROFILE ".crossnote"
$userDir   = Join-Path $env:APPDATA "Cursor\User"
$settings  = Join-Path $userDir "settings.json"
$keybinds  = Join-Path $userDir "keybindings.json"

Info "== Markdown preview setup for Cursor =="

# --- 1. MPE extension ---
Info "`n[1/4] Markdown Preview Enhanced extension..."
$cursorCli = Get-Command cursor -ErrorAction SilentlyContinue
if ($cursorCli) {
    # Native CLI may write to stderr; do not let strict mode turn that into a throw.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $installed = @()
    try { $installed = & cursor --list-extensions 2>$null } catch {}
    if ($installed -contains "shd101wyy.markdown-preview-enhanced") {
        Ok "  Extension already installed."
    } else {
        & cursor --install-extension shd101wyy.markdown-preview-enhanced 2>&1 | Out-Host
        if ($LASTEXITCODE -eq 0) {
            Ok "  Extension installed/updated."
        } else {
            Warn "  Could not install via CLI (exit $LASTEXITCODE). Install manually: 'Markdown Preview Enhanced'."
        }
    }
    $ErrorActionPreference = $prev
} else {
    Warn "  'cursor' CLI not found in PATH."
    Warn "  Install manually: Extensions -> find 'Markdown Preview Enhanced' -> Install."
}

# --- 2. parser.js + style.less ---
Info "`n[2/4] Styles and parser (.crossnote)..."
if (-not (Test-Path $crossnote)) { New-Item -ItemType Directory -Force -Path $crossnote | Out-Null }
foreach ($f in @("parser.js","style.less","head.html")) {
    $src = Join-Path $root "crossnote\$f"
    $dst = Join-Path $crossnote $f
    if (-not (Test-Path $src)) { Warn "  Missing master $src - skip"; continue }
    if (Test-Path $dst) { Copy-Item $dst "$dst.bak-$stamp" -Force }
    Copy-Item $src $dst -Force
    Ok "  $f -> $dst"
}

# --- 3. settings.json (merge keys, keep personal ones) ---
Info "`n[3/4] MPE settings (settings.json)..."
$desired = [ordered]@{
    "markdown-preview-enhanced.plantumlServer"             = "https://www.plantuml.com/plantuml"
    "markdown-preview-enhanced.mermaidTheme"               = "dark"
    "markdown-preview-enhanced.enableScriptExecution"      = $true
    "markdown-preview-enhanced.frontMatterRenderingOption" = "none"
    "markdown-preview-enhanced.previewTheme"               = "vscode.css"
    "markdown-preview-enhanced.enablePreviewZenMode"       = $true
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
    Ok "  MPE settings added (personal ones kept; backup next to file)."
} catch {
    Warn "  Could not edit settings.json automatically (non-standard format?)."
    Warn "  Reason: $($_.Exception.Message)"
    Warn "  Add these keys to settings.json manually:"
    foreach ($k in $desired.Keys) {
        $v = $desired[$k]; if ($v -is [bool]) { $v = $v.ToString().ToLower() } else { $v = '"' + $v + '"' }
        Warn ('    "' + $k + '": ' + $v)
    }
}

# --- 4. keybindings.json (Ctrl+Shift+V -> MPE preview) ---
Info "`n[4/4] Keyboard shortcut (keybindings.json)..."
try {
    $arr = @()
    if (Test-Path $keybinds) {
        Copy-Item $keybinds "$keybinds.bak-$stamp" -Force
        $parsed = Read-Jsonc $keybinds
        if ($parsed) { $arr = @($parsed) }
    }
    $hasPreview = $false
    foreach ($e in $arr) { if ($e.command -eq "markdown-preview-enhanced.openPreviewToTheSide") { $hasPreview = $true } }
    if (-not $hasPreview) {
        $arr += [pscustomobject]@{ key="ctrl+shift+v"; command="-frontMatter.insertSnippet" }
        $arr += [pscustomobject]@{ key="ctrl+shift+v"; command="markdown-preview-enhanced.openPreviewToTheSide"; when="editorLangId =~ /^(markdown|quarto)$/" }
    }
    $kbJson = @($arr) | ConvertTo-Json -Depth 30
    if ($kbJson.TrimStart() -notlike '[*') { $kbJson = "[`n$kbJson`n]" }
    Write-Utf8NoBom $keybinds $kbJson
    if ($hasPreview) { Ok "  Ctrl+Shift+V already configured." }
    else { Ok "  Ctrl+Shift+V -> open MPE preview." }
} catch {
    Warn "  Could not edit keybindings.json automatically - not critical."
    Warn "  Reason: $($_.Exception.Message)"
}

Ok "`nDone! Restart Cursor. Open a .md file and press Ctrl+Shift+V."
