# PowerShell helper to run backend locally on Windows
# This script will try to auto-detect a local Blender executable from common locations or from PATH.
# If detection fails, edit the $env:BLENDER_PATH variable below to point to your blender.exe.

Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$defaultBlend = Join-Path $scriptDir "..\参数化.blend"

# Common candidate locations (add more if your Blender is installed elsewhere)
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
		if (Test-Path $p) { $found = (Resolve-Path $p).Path; break }
	} catch { }
}

# Fall back to checking PATH
if (-not $found) {
	$cmd = Get-Command blender -ErrorAction SilentlyContinue
	if ($cmd) { $found = $cmd.Source }
}

if (-not $found) {
	Write-Host "Blender executable not found. Please edit scripts/run-local.ps1 and set BLENDER_PATH to your blender.exe path." -ForegroundColor Yellow
	Write-Host "Common paths:" -ForegroundColor Yellow
	$candidates | ForEach-Object { Write-Host "  $_" }
	exit 1
}

$env:BLENDER_PATH = $found

# Resolve .blend path
try {
	$env:BLEND_FILE = (Resolve-Path $defaultBlend -ErrorAction Stop).Path
} catch {
	# 如果默认中文名不存在，尝试常用 ASCII 名称 param.blend
	$altBlend = Join-Path $scriptDir "..\param.blend"
	try {
		$env:BLEND_FILE = (Resolve-Path $altBlend -ErrorAction Stop).Path
		Write-Host "Found alternate blend: $env:BLEND_FILE"
	} catch {
		# 回退：在项目根查找任意 .blend 文件并使用第一个匹配项
		$projectRoot = Join-Path $scriptDir ".."
		$blends = Get-ChildItem -Path $projectRoot -Filter *.blend -ErrorAction SilentlyContinue
		if ($blends -and $blends.Count -gt 0) {
			$env:BLEND_FILE = $blends[0].FullName
			Write-Host "Auto-detected blend: $env:BLEND_FILE"
		} else {
			# 最后回退到原始默认（可能包含非 ASCII 名称）以便错误提示保留原信息
			$env:BLEND_FILE = $defaultBlend
		}
	}
}

$env:ALLOWED_ORIGINS = '*' # adjust to your frontend origin in production
$env:PORT = '3000'

Write-Host "Using BLENDER_PATH=$env:BLENDER_PATH"
Write-Host "Using BLEND_FILE=$env:BLEND_FILE"

# Run the server (uses tsx)
npx tsx server.ts
