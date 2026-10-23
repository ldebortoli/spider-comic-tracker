. (Join-Path $PSScriptRoot "server-common.ps1")

function Stop-TelegramBotProcess {
  $botPidFile = Join-Path $script:DataDir "telegram-bot.pid"
  if (-not (Test-Path -LiteralPath $botPidFile)) {
    return
  }

  try {
    $botPid = (Get-Content -LiteralPath $botPidFile -Raw -ErrorAction Stop).Trim()
    if ($botPid -match "^\d+$") {
      $botProcess = Get-Process -Id ([int] $botPid) -ErrorAction SilentlyContinue
      if ($botProcess) {
        Stop-TrackerProcessTree -ProcessId $botProcess.Id
      }
    }
  } catch {
    throw "No se pudo comprobar o detener el bot administrado."
  }

  try {
    if (Test-Path -LiteralPath $botPidFile) {
      Remove-Item -LiteralPath $botPidFile -Force -ErrorAction Stop
    }
  } catch {
    # Puede desaparecer si el servidor lo limpia al mismo tiempo.
  }
}

$running = Get-TrackerProcess
if (-not $running) {
  Stop-TelegramBotProcess
  Clear-TrackerPid
  Write-Host "El servidor ya está apagado." -ForegroundColor Yellow
  exit 0
}

Stop-TrackerProcessTree -ProcessId $running.ProcessId
Clear-TrackerPid
Stop-TelegramBotProcess
Write-Host "Servidor apagado." -ForegroundColor Green
