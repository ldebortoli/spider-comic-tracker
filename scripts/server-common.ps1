$ErrorActionPreference = "Stop"

$script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$script:DataDir = Join-Path $script:ProjectRoot "data"
$script:PidFile = Join-Path $script:DataDir "server.pid"
$script:ServerPort = 8787

function Get-TrackerProcess {
  if (Test-Path -LiteralPath $script:PidFile) {
    $savedPid = (Get-Content -LiteralPath $script:PidFile -Raw).Trim()
    if ($savedPid -match "^\d+$") {
      $process = Get-Process -Id ([int] $savedPid) -ErrorAction SilentlyContinue
      if ($process -and $process.ProcessName -eq "node") {
        $process | Add-Member -NotePropertyName ProcessId -NotePropertyValue $process.Id -Force
        return $process
      }
    }
  }

  $connection = Get-NetTCPConnection -LocalPort $script:ServerPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $connection) {
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
  if ($process -and $process.Name -eq "node.exe" -and $process.CommandLine -match "src[\\/]server\.js") {
    return $process
  }

  return $null
}

function Save-TrackerPid([int] $ProcessId) {
  New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null
  Set-Content -LiteralPath $script:PidFile -Value $ProcessId -Encoding ascii
}

function Clear-TrackerPid {
  Remove-Item -LiteralPath $script:PidFile -Force -ErrorAction SilentlyContinue
}
