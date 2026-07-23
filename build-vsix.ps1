# ============================================================================
#  Build a .vsix package from the extension/ folder (no vsce required).
#  A .vsix is a zip archive with a manifest; Cursor installs it natively via
#  "cursor --install-extension file.vsix" or the "Install from VSIX" command.
#  Entry names are written with forward slashes on purpose: PS5.1
#  Compress-Archive uses backslashes which some zip readers reject.
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File .\build-vsix.ps1
#    powershell -ExecutionPolicy Bypass -File .\build-vsix.ps1 -OutFile C:\tmp\x.vsix
# ============================================================================
param(
    [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$extDir = Join-Path $root "extension"

if (-not (Test-Path (Join-Path $extDir "package.json"))) {
    throw "extension/package.json not found next to this script."
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Escape-Xml([string]$s) {
    return $s -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace '"', '&quot;'
}

$pkg = Get-Content (Join-Path $extDir "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$id  = $pkg.name
$ver = $pkg.version
$pub = $pkg.publisher

# One stable filename for the team zip / Install from VSIX.
# Version lives inside the package (extension.vsixmanifest), not in the filename —
# so updates overwrite the same file instead of piling up 0.1, 0.2, 0.3...
if (-not $OutFile) {
    $OutFile = Join-Path $root ("{0}.{1}.vsix" -f $pub, $id)
}

# Drop any older/versioned .vsix next to the script (keep only the target we build).
Get-ChildItem $root -Filter "*.vsix" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $OutFile } |
    Remove-Item -Force

$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="$id" Version="$ver" Publisher="$pub" />
    <DisplayName>$(Escape-Xml $pkg.displayName)</DisplayName>
    <Description xml:space="preserve">$(Escape-Xml $pkg.description)</Description>
    <Categories>Other</Categories>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
"@

$contentTypes = @"
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="css" ContentType="text/css" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
</Types>
"@

if (Test-Path $OutFile) { Remove-Item $OutFile -Force }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$fs = [System.IO.File]::Open($OutFile, [System.IO.FileMode]::Create)
$zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    function Add-TextEntry($name, $text) {
        $entry = $zip.CreateEntry($name)
        $stream = $entry.Open()
        $bytes = $utf8.GetBytes($text)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Dispose()
    }
    Add-TextEntry "extension.vsixmanifest" $manifest
    Add-TextEntry "[Content_Types].xml" $contentTypes

    $extDirFull = (Resolve-Path $extDir).Path
    Get-ChildItem $extDirFull -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($extDirFull.Length).TrimStart('\', '/') -replace '\\', '/'
        $entry = $zip.CreateEntry("extension/$rel")
        $stream = $entry.Open()
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Dispose()
    }
}
finally {
    $zip.Dispose()
    $fs.Dispose()
}

Write-Host ("VSIX built: " + $OutFile) -ForegroundColor Green
