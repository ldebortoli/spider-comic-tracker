. (Join-Path $PSScriptRoot "server-common.ps1")

$running = Get-TrackerProcess
if ($running) {
  Save-TrackerPid -ProcessId $running.ProcessId
  Write-Host "Servidor ENCENDIDO (PID $($running.ProcessId))." -ForegroundColor Green
  Write-Host "http://localhost:$script:ServerPort"
  exit 0
}

Clear-TrackerPid
Write-Host "Servidor APAGADO." -ForegroundColor Yellow
exit 1
