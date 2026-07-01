. (Join-Path $PSScriptRoot "server-common.ps1")

$running = Get-TrackerProcess
if ($running) {
  Save-TrackerPid -ProcessId $running.ProcessId
  Write-Host "El servidor ya está encendido (PID $($running.ProcessId))." -ForegroundColor Yellow
  Write-Host "http://localhost:$script:ServerPort"
  exit 0
}

$occupied = Get-NetTCPConnection -LocalPort $script:ServerPort -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
  Write-Host "No se pudo iniciar: el puerto $script:ServerPort está ocupado por otro programa." -ForegroundColor Red
  exit 1
}

New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null
$stdout = Join-Path $script:DataDir "server.log"
$stderr = Join-Path $script:DataDir "server-error.log"
$node = (Get-Command node -ErrorAction Stop).Source
$process = Start-Process -FilePath $node `
  -ArgumentList "src/server.js" `
  -WorkingDirectory $script:ProjectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Save-TrackerPid -ProcessId $process.Id

for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
  Start-Sleep -Milliseconds 250
  if ($process.HasExited) {
    Clear-TrackerPid
    Write-Host "El servidor no pudo iniciar. Revisá data/server-error.log." -ForegroundColor Red
    exit 1
  }

  $connection = Get-NetTCPConnection -LocalPort $script:ServerPort -State Listen -ErrorAction SilentlyContinue
  if ($connection) {
    Write-Host "Servidor encendido (PID $($process.Id))." -ForegroundColor Green
    Write-Host "http://localhost:$script:ServerPort"
    exit 0
  }
}

Write-Host "El proceso inició, pero el puerto todavía no responde. Revisá data/server-error.log." -ForegroundColor Yellow
exit 1
