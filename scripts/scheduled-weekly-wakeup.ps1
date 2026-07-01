. (Join-Path $PSScriptRoot "server-common.ps1")

if (Get-TrackerProcess) {
  exit 0
}

$occupied = Get-NetTCPConnection -LocalPort $script:ServerPort -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
  exit 0
}

New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null
$node = (Get-Command node -ErrorAction Stop).Source
$process = Start-Process -FilePath $node `
  -ArgumentList "src/server.js" `
  -WorkingDirectory $script:ProjectRoot `
  -WindowStyle Hidden `
  -PassThru

Save-TrackerPid -ProcessId $process.Id
