# PowerShell helper to run the backend locally on Windows.
# It auto-detects Blender from common install locations, BLENDER_PATH, or PATH.

Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")
$defaultBlend = Join-Path $projectRoot "param.blend"

$candidates = @(
	"$env:BLENDER_PATH",
	'C:\Program Files\Blender Foundation\Blender\blender.exe',
	'C:\Program Files\Steam\steamapps\common\Blender\blender.exe',
	'E:\Program Files\Blender Foundation\Blender\blender.exe',
	'E:\Program\Steam\steamapps\common\Blender\blender.exe'
)

$found = $null
foreach ($p in $candidates) {
	if ([string]::IsNullOrWhiteSpace($p)) { continue }
	try {
		if (Test-Path $p) {
			$found = (Resolve-Path $p).Path
			break
		}
	} catch { }
}

if (-not $found) {
	$cmd = Get-Command blender -ErrorAction SilentlyContinue
	if ($cmd) { $found = $cmd.Source }
}

if (-not $found) {
	Write-Host "Blender executable not found. Set BLENDER_PATH or install Blender in a common location." -ForegroundColor Yellow
	Write-Host "Checked paths:" -ForegroundColor Yellow
	$candidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { Write-Host "  $_" }
	exit 1
}

$env:BLENDER_PATH = $found

try {
	$env:BLEND_FILE = (Resolve-Path $defaultBlend -ErrorAction Stop).Path
} catch {
	$blends = Get-ChildItem -Path $projectRoot -Filter *.blend -ErrorAction SilentlyContinue
	if ($blends -and $blends.Count -gt 0) {
		$env:BLEND_FILE = $blends[0].FullName
		Write-Host "Auto-detected blend: $env:BLEND_FILE"
	} else {
		Write-Host "No .blend file found in $projectRoot" -ForegroundColor Yellow
		exit 1
	}
}

$env:ALLOWED_ORIGINS = '*'
$env:PORT = '3000'

Write-Host "Using BLENDER_PATH=$env:BLENDER_PATH"
Write-Host "Using BLEND_FILE=$env:BLEND_FILE"

npx tsx server.ts
