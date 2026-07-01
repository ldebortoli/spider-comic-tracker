. (Join-Path $PSScriptRoot "server-common.ps1")

$running = Get-TrackerProcess
if (-not $running) {
  Clear-TrackerPid
  Write-Host "El servidor ya está apagado." -ForegroundColor Yellow
  exit 0
}

Stop-Process -Id $running.ProcessId -Force
Clear-TrackerPid
Write-Host "Servidor apagado." -ForegroundColor Green
