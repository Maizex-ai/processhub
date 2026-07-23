# ============================================================================
#  ProcessHub Markdown Preview - setup for team members (Cursor and VS Code).
#  Run by double-clicking setup.cmd (it launches this script).
#
#  What it does:
#    1) builds the .vsix package from extension/ (or reuses a prebuilt one);
#    2) installs it via the official CLI (cursor and/or code, whichever exists).
#
#  Nothing else is touched: no settings.json, no keybindings.json, no profile
#  files. The extension carries its own configuration defaults, and
#  Ctrl+Shift+V already opens the built-in markdown preview out of the box.
# ============================================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Info($m){ Write-Host $m -ForegroundColor Cyan }
function Ok($m){ Write-Host $m -ForegroundColor Green }
function Warn($m){ Write-Host $m -ForegroundColor Yellow }

Info "== ProcessHub Markdown Preview setup =="

# --- 1. Build (or find) the .vsix package ---
Info "`n[1/2] Extension package (.vsix)..."
$vsix = $null
try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "build-vsix.ps1") | Out-Host
} catch {
    Warn "  Build failed: $($_.Exception.Message)"
}
$vsix = Get-ChildItem $root -Filter "*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $vsix) {
    Warn "  No .vsix package available - nothing to install."
    exit 1
}
Ok ("  Package: " + $vsix.Name)

# --- 2. Install into every editor that has a CLI in PATH ---
Info "`n[2/2] Installing the extension..."
$installedAnywhere = $false
foreach ($cli in @("cursor", "code")) {
    if (-not (Get-Command $cli -ErrorAction SilentlyContinue)) { continue }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    Info "  -> $cli --install-extension $($vsix.Name)"
    & $cli --install-extension $vsix.FullName 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) {
        Ok "  Installed for '$cli'."
        $installedAnywhere = $true
    } else {
        Warn "  Install via '$cli' failed (exit $LASTEXITCODE)."
        Warn "  If the editor is running with an older copy of this extension,"
        Warn "  close it completely and run this script again."
    }
    $ErrorActionPreference = $prev
}
if (-not $installedAnywhere) {
    Warn "  No editor CLI found (or install failed)."
    Warn "  Manual install: open your editor -> Ctrl+Shift+P ->"
    Warn "  'Extensions: Install from VSIX...' -> pick $($vsix.Name)"
    exit 1
}

Ok "`nDone! Restart the editor. Open a .md file and press Ctrl+Shift+V."
