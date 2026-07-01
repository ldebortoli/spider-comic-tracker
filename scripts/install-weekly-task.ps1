$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$scheduleDay = "WEDNESDAY"
$scheduleHour = 12
$scheduleMinute = 0

if (Test-Path -LiteralPath $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match "^\s*SCHEDULE_DAY\s*=\s*(.+?)\s*$") { $scheduleDay = $matches[1].Trim('"', "'").ToUpperInvariant() }
    if ($line -match "^\s*SCHEDULE_HOUR\s*=\s*(\d+)\s*$") { $scheduleHour = [int] $matches[1] }
    if ($line -match "^\s*SCHEDULE_MINUTE\s*=\s*(\d+)\s*$") { $scheduleMinute = [int] $matches[1] }
  }
}

$dayMap = @{
  MONDAY = "Monday"; TUESDAY = "Tuesday"; WEDNESDAY = "Wednesday";
  THURSDAY = "Thursday"; FRIDAY = "Friday"; SATURDAY = "Saturday"; SUNDAY = "Sunday"
}
if (-not $dayMap.ContainsKey($scheduleDay)) { throw "SCHEDULE_DAY no es válido: $scheduleDay" }

$taskName = "Spider Tracker - Actualizacion semanal"
$wakeScript = Join-Path $PSScriptRoot "scheduled-weekly-wakeup.ps1"
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$wakeScript`"" -WorkingDirectory $projectRoot
$at = [DateTime]::Today.AddHours($scheduleHour).AddMinutes($scheduleMinute)
$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek $dayMap[$scheduleDay] -At $at
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Inicia Spider Tracker para ejecutar la revisión semanal y actualizar los catálogos." -Force | Out-Null

$marker = Join-Path $projectRoot "data\weekly-task-installed.json"
New-Item -ItemType Directory -Path (Split-Path -Parent $marker) -Force | Out-Null
@{
  taskName = $taskName
  installedAt = (Get-Date).ToString("o")
  day = $scheduleDay
  hour = $scheduleHour
  minute = $scheduleMinute
} | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8

Write-Host "Tarea semanal instalada: $taskName" -ForegroundColor Green
Write-Host "$scheduleDay $($at.ToString('HH:mm'))"
