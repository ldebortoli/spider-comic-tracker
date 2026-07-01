$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$taskName = "Spider Tracker - Actualizacion semanal"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $projectRoot "data\weekly-task-installed.json") -Force -ErrorAction SilentlyContinue
Write-Host "Tarea semanal eliminada." -ForegroundColor Green
