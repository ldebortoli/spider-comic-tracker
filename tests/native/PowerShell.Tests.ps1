param([string] $TestRoot, [string] $ProjectRoot)

BeforeAll {
  Add-Type -AssemblyName System.Drawing
  Add-Type -Path (Join-Path $ProjectRoot 'tests\native\PowerShellFrameworkDoubles.cs') -ReferencedAssemblies System.Drawing
  $scripts = Join-Path $TestRoot 'scripts'
  $data = Join-Path $TestRoot 'data'
  New-Item -ItemType Directory -Path $data -Force | Out-Null
  function Get-NetTCPConnection { param($LocalPort, $State, $ErrorAction) }
  function Get-CimInstance { param($ClassName, $Filter, $ErrorAction) }
  function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory) }
  function New-ScheduledTaskTrigger { param([switch]$Weekly,$WeeksInterval,$DaysOfWeek,$At) }
  function New-ScheduledTaskSettingsSet { param([switch]$StartWhenAvailable,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,$ExecutionTimeLimit) }
  function New-ScheduledTaskPrincipal { param($UserId,$LogonType,$RunLevel) }
  function Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Settings,$Principal,$Description,[switch]$Force) }
  function Unregister-ScheduledTask { param($TaskName,$Confirm,$ErrorAction) }
  function New-ProcessDouble([int]$Id=901,[string]$Name='node',[bool]$Exited=$false,[bool]$Wait=$true) {
    $result = [pscustomobject]@{Id=$Id;ProcessId=$Id;ProcessName=$Name;HasExited=$Exited;ExitCode=0;WaitResult=$Wait}
    $result | Add-Member ScriptMethod WaitForExit {param($Timeout) return $this.WaitResult}
    return $result
  }
}

Describe 'Unchanged PowerShell scripts in an isolated synthetic project' {
  BeforeEach {
    Remove-Item -LiteralPath (Join-Path $data 'server.pid'),(Join-Path $data 'telegram-bot.pid'),(Join-Path $TestRoot '.env') -Force -ErrorAction SilentlyContinue
    Mock Write-Host { }
    Mock Get-NetTCPConnection { $null }
    Mock Get-CimInstance { $null }
    Mock Get-Process { $null }
    Mock Start-Process { New-ProcessDouble }
    Mock Start-Sleep { }
    Mock New-ScheduledTaskAction { @{Synthetic='action'} }
    Mock New-ScheduledTaskTrigger { @{Synthetic='trigger'} }
    Mock New-ScheduledTaskSettingsSet { @{Synthetic='settings'} }
    Mock New-ScheduledTaskPrincipal { @{Synthetic='principal'} }
    Mock Register-ScheduledTask { }
    Mock Unregister-ScheduledTask { }
  }

  It 'covers process discovery using PID and verified listener identity' {
    . (Join-Path $scripts 'server-common.ps1')
    Get-TrackerProcess | Should -BeNullOrEmpty
    Set-Content -LiteralPath $script:PidFile -Value 'invalid'
    Get-TrackerProcess | Should -BeNullOrEmpty
    Set-Content -LiteralPath $script:PidFile -Value '901'
    Mock Get-Process { New-ProcessDouble }
    (Get-TrackerProcess).ProcessId | Should -Be 901
    Mock Get-Process { New-ProcessDouble -Name 'unrelated' }
    Mock Get-NetTCPConnection { @{OwningProcess=901} }
    Get-TrackerProcess | Should -BeNullOrEmpty
    Mock Get-CimInstance { [pscustomobject]@{Name='node.exe';CommandLine='node src/server.js';ProcessId=901} }
    (Get-TrackerProcess).ProcessId | Should -Be 901
    Mock Get-CimInstance { [pscustomobject]@{Name='node.exe';CommandLine='node unrelated.js';ProcessId=901} }
    Get-TrackerProcess | Should -BeNullOrEmpty
    Save-TrackerPid -ProcessId 902
    (Get-Content -LiteralPath $script:PidFile -Raw).Trim() | Should -Be '902'
    Clear-TrackerPid
    Test-Path -LiteralPath $script:PidFile | Should -BeFalse
  }

  It 'stops only the owned process tree, reporting kill and timeout failures' {
    . (Join-Path $scripts 'server-common.ps1')
    Stop-TrackerProcessTree 901
    Should -Invoke Start-Process -Times 0
    Mock Get-Process { New-ProcessDouble }
    Stop-TrackerProcessTree 901
    Should -Invoke Start-Process -Times 1 -ParameterFilter { $WindowStyle -eq 'Hidden' -and $ArgumentList -contains '/T' -and $ArgumentList -contains '/F' }
    Mock Start-Process { [pscustomobject]@{ExitCode=1} }
    { Stop-TrackerProcessTree 901 } | Should -Throw '*arbol*'
    Mock Get-Process { New-ProcessDouble -Exited $true }
    Stop-TrackerProcessTree 901
    Mock Get-Process { New-ProcessDouble -Wait $false }
    Mock Start-Process { [pscustomobject]@{ExitCode=0} }
    { Stop-TrackerProcessTree 901 } | Should -Throw '*tiempo esperado*'
  }

  It 'reports the stopped and running server without real process access' {
    & (Join-Path $scripts 'server-status.ps1')
    $LASTEXITCODE | Should -Be 1
    Set-Content -LiteralPath (Join-Path $data 'server.pid') -Value '901'
    Mock Get-Process { New-ProcessDouble }
    & (Join-Path $scripts 'server-status.ps1')
    $LASTEXITCODE | Should -Be 0
  }

  It 'starts hidden, handles existing, occupied, early-exit and timeout cases' {
    Set-Content -LiteralPath (Join-Path $data 'server.pid') -Value '901'
    Mock Get-Process { New-ProcessDouble }
    & (Join-Path $scripts 'server-start.ps1')
    $LASTEXITCODE | Should -Be 0
    Mock Get-Process { $null }; Mock Get-NetTCPConnection { @{OwningProcess=902} }
    & (Join-Path $scripts 'server-start.ps1')
    $LASTEXITCODE | Should -Be 1
    Mock Get-NetTCPConnection { $null }; Mock Start-Process { New-ProcessDouble -Exited $true }
    & (Join-Path $scripts 'server-start.ps1')
    $LASTEXITCODE | Should -Be 1
    Test-Path -LiteralPath (Join-Path $data 'server.pid') | Should -BeFalse
    Mock Start-Process { New-ProcessDouble }
    & (Join-Path $scripts 'server-start.ps1')
    $LASTEXITCODE | Should -Be 1
    Mock Get-NetTCPConnection { @{OwningProcess=901} } -ParameterFilter { $script:ReadyAfterStart }
    Mock Start-Process { $script:ReadyAfterStart=$true; New-ProcessDouble }
    $script:ReadyAfterStart=$false
    & (Join-Path $scripts 'server-start.ps1')
    $LASTEXITCODE | Should -Be 0
    Should -Invoke Start-Process -ParameterFilter { $WindowStyle -eq 'Hidden' -and $ArgumentList -eq 'src/server.js' }
  }

  It 'weekly wakeup avoids duplicates and otherwise starts exactly one hidden process' {
    Set-Content -LiteralPath (Join-Path $data 'server.pid') -Value '901'
    Mock Get-Process { New-ProcessDouble }
    & (Join-Path $scripts 'scheduled-weekly-wakeup.ps1')
    Mock Get-Process { $null }; Mock Get-NetTCPConnection { @{OwningProcess=902} }
    & (Join-Path $scripts 'scheduled-weekly-wakeup.ps1')
    Should -Invoke Start-Process -Times 0
    Mock Get-NetTCPConnection { $null }
    & (Join-Path $scripts 'scheduled-weekly-wakeup.ps1')
    Should -Invoke Start-Process -Times 1 -ParameterFilter { $WindowStyle -eq 'Hidden' }
  }

  It 'stops server and optional bot and handles bot PID faults safely' {
    & (Join-Path $scripts 'server-stop.ps1')
    $LASTEXITCODE | Should -Be 0
    Set-Content -LiteralPath (Join-Path $data 'server.pid') -Value '901'
    Set-Content -LiteralPath (Join-Path $data 'telegram-bot.pid') -Value '902'
    Mock Get-Process { New-ProcessDouble -Id $Id[0] }
    & (Join-Path $scripts 'server-stop.ps1')
    Should -Invoke Start-Process -Times 2
    Test-Path -LiteralPath (Join-Path $data 'telegram-bot.pid') | Should -BeFalse
    Set-Content -LiteralPath (Join-Path $data 'telegram-bot.pid') -Value 'invalid'
    & (Join-Path $scripts 'server-stop.ps1')
    Set-Content -LiteralPath (Join-Path $data 'telegram-bot.pid') -Value '902'
    Mock Get-Process { $null }
    & (Join-Path $scripts 'server-stop.ps1')
    Set-Content -LiteralPath (Join-Path $data 'telegram-bot.pid') -Value '902'
    Mock Remove-Item { throw 'synthetic PID removal race' } -ParameterFilter { $LiteralPath -like '*telegram-bot.pid' }
    & (Join-Path $scripts 'server-stop.ps1')
    $LASTEXITCODE | Should -Be 0
    Set-Content -LiteralPath (Join-Path $data 'telegram-bot.pid') -Value '902'
    Mock Get-Content { throw 'synthetic bot PID read failure' } -ParameterFilter { $LiteralPath -like '*telegram-bot.pid' }
    { & (Join-Path $scripts 'server-stop.ps1') } | Should -Throw '*bot administrado*'
  }

  It 'installs a default or configured weekly task through mocked scheduler boundaries' {
    & (Join-Path $scripts 'install-weekly-task.ps1')
    $marker=Get-Content -LiteralPath (Join-Path $data 'weekly-task-installed.json') -Raw | ConvertFrom-Json
    $marker.day | Should -Be 'WEDNESDAY'
    Set-Content -LiteralPath (Join-Path $TestRoot '.env') -Value @('SCHEDULE_DAY="friday"','SCHEDULE_HOUR=10','SCHEDULE_MINUTE=15','IGNORED=synthetic')
    & (Join-Path $scripts 'install-weekly-task.ps1')
    $marker=Get-Content -LiteralPath (Join-Path $data 'weekly-task-installed.json') -Raw | ConvertFrom-Json
    $marker.day | Should -Be 'FRIDAY'; $marker.hour | Should -Be 10; $marker.minute | Should -Be 15
    Should -Invoke Register-ScheduledTask -Times 2 -ParameterFilter { $TaskName -eq 'Spider Tracker - Actualizacion semanal' }
    Set-Content -LiteralPath (Join-Path $TestRoot '.env') -Value 'SCHEDULE_DAY=invalid'
    { & (Join-Path $scripts 'install-weekly-task.ps1') } | Should -Throw '*SCHEDULE_DAY*'
    & (Join-Path $scripts 'uninstall-weekly-task.ps1')
    Should -Invoke Unregister-ScheduledTask -Times 1
    Test-Path -LiteralPath (Join-Path $data 'weekly-task-installed.json') | Should -BeFalse
  }

  It 'builds and decodes the complete branded PNG-backed ICO in the synthetic project' {
    & (Join-Path $scripts 'build-spider-icon.ps1') | Should -Be (Join-Path $TestRoot 'assets\spider-tracker-icon.ico')
    $icon=New-Object Drawing.Icon((Join-Path $TestRoot 'assets\spider-tracker-icon.ico'))
    try { $icon.Width | Should -Be 256; $icon.Height | Should -Be 256 } finally { $icon.Dispose() }
    $bytes=[IO.File]::ReadAllBytes((Join-Path $TestRoot 'assets\spider-tracker-icon.ico'))
    [BitConverter]::ToUInt16($bytes,2) | Should -Be 1
  }

  It 'compiles the isolated native source and reports unavailable and failed compilers' {
    & (Join-Path $scripts 'build-server-control.ps1') | Should -Be (Join-Path $TestRoot 'bin\SpiderTrackerServerControl.exe')
    Test-Path -LiteralPath (Join-Path $TestRoot 'bin\SpiderTrackerServerControl.exe') | Should -BeTrue
    Mock Test-Path { $false } -ParameterFilter { $LiteralPath -like '*Framework64*csc.exe' }
    & (Join-Path $scripts 'build-server-control.ps1') | Should -Be (Join-Path $TestRoot 'bin\SpiderTrackerServerControl.exe')
    Mock Test-Path { $false } -ParameterFilter { $LiteralPath -like '*csc.exe' }
    { & (Join-Path $scripts 'build-server-control.ps1') } | Should -Throw '*compilador*'
    Mock Test-Path { $true } -ParameterFilter { $LiteralPath -like '*csc.exe' }
    Set-Content -LiteralPath (Join-Path $TestRoot 'src\ServerControl.cs') -Value 'invalid C sharp source'
    { & (Join-Path $scripts 'build-server-control.ps1') } | Should -Throw '*panel*'
  }

  It 'runs every panel action and lifecycle through headless framework and OS boundaries' {
    Mock Add-Type { } -ParameterFilter { $AssemblyName -eq 'System.Windows.Forms' }
    $script:MutexCreated=$true
    Mock New-Object { $ArgumentList[2].Value=$script:MutexCreated; [PowerShellBoundaries.MutexDouble]::new() } -ParameterFilter { $TypeName -eq 'System.Threading.Mutex' }
    $script:TcpReady=$false; $script:TcpWait=$true; $script:TcpBeginThrows=$false; $script:TcpEndThrows=$false
    Mock New-Object {
      $tcp=[PowerShellBoundaries.TcpClientDouble]::new()
      $tcp.Connected=$script:TcpReady; $tcp.Wait=$script:TcpWait; $tcp.BeginThrows=$script:TcpBeginThrows; $tcp.EndThrows=$script:TcpEndThrows
      return $tcp
    } -ParameterFilter { $TypeName -eq 'System.Net.Sockets.TcpClient' }
    . (Join-Path $scripts 'server-control.ps1')
    $statusLabel.Text | Should -Be 'SERVIDOR APAGADO'
    $startButton.Enabled | Should -BeTrue; $stopButton.Enabled | Should -BeFalse
    $timer.Running | Should -BeTrue
    $startButton.PerformClick()
    $statusLabel.Text | Should -Be 'INICIANDO...'
    Should -Invoke Start-Process -ParameterFilter { $WindowStyle -eq 'Hidden' -and $ArgumentList -eq 'src/server.js' }
    Mock Get-Process { New-ProcessDouble }
    Update-ServerStatus
    $statusLabel.Text | Should -Be 'INICIANDO...'
    $script:TcpReady=$true
    $timer.Fire()
    $statusLabel.Text | Should -Be 'SERVIDOR ENCENDIDO'
    $script:OpenApplicationWhenReady | Should -BeFalse
    $openButton.PerformClick(); $refreshButton.PerformClick()
    $startButton.PerformClick()
    $script:TcpWait=$false
    Test-TrackerReady | Should -BeFalse
    $script:TcpWait=$true; $script:TcpBeginThrows=$true
    Test-TrackerReady | Should -BeFalse
    $script:TcpBeginThrows=$false; $script:TcpEndThrows=$true
    Test-TrackerReady | Should -BeFalse
    $script:TcpEndThrows=$false
    $stopButton.PerformClick()
    Mock Get-Process { $null }
    $stopButton.PerformClick()
    Mock Get-NetTCPConnection { @{OwningProcess=902} }
    Start-TrackerFromPanel
    [System.Windows.Forms.MessageBox]::Messages[-1] | Should -BeLike '*No se pudo iniciar*'
    Mock Get-NetTCPConnection { $null }
    Mock Start-Process { throw 'synthetic start failure' }
    $startButton.PerformClick()
    [System.Windows.Forms.MessageBox]::Messages[-1] | Should -BeLike '*Error al iniciar*'
    Mock Get-Process { New-ProcessDouble }
    Set-Content -LiteralPath (Join-Path $data 'server.pid') -Value '901'
    $stopButton.PerformClick()
    [System.Windows.Forms.MessageBox]::Messages[-1] | Should -BeLike '*Error al apagar*'
    $form.TryClose() | Should -BeFalse
    [System.Windows.Forms.MessageBox]::Messages[-1] | Should -BeLike '*No se pudo apagar*'
    Mock Get-Process { $null }
    $form.TryClose() | Should -BeTrue
    $timer.Running | Should -BeFalse
    $panelMutex.Released | Should -BeTrue; $panelMutex.Disposed | Should -BeTrue
    $script:MutexCreated=$false
    . (Join-Path $scripts 'server-control.ps1')
    [System.Windows.Forms.MessageBox]::Messages[-1] | Should -BeLike '*ya esta abierto*'
  }
}
