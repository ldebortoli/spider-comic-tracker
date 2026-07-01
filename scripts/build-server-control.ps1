$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot "src\ServerControl.cs"
$iconPath = Join-Path $projectRoot "assets\spider-tracker-icon.ico"
$binDir = Join-Path $projectRoot "bin"
$outputPath = Join-Path $binDir "SpiderTrackerServerControl.exe"

New-Item -ItemType Directory -Path $binDir -Force | Out-Null
Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue

$compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path -LiteralPath $compiler)) {
  $compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path -LiteralPath $compiler)) {
  throw "No se encontró el compilador de .NET Framework."
}

& $compiler `
  /nologo `
  /target:winexe `
  "/win32icon:$iconPath" `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Drawing.dll `
  /reference:System.Windows.Forms.dll `
  "/out:$outputPath" `
  $sourcePath

if ($LASTEXITCODE -ne 0) {
  throw "La compilación del panel falló con código $LASTEXITCODE."
}

Write-Output $outputPath
