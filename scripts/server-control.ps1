. (Join-Path $PSScriptRoot "server-common.ps1")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$createdNew = $false
$panelMutex = New-Object System.Threading.Mutex($true, "Local\SpiderTrackerServerControl", [ref] $createdNew)
if (-not $createdNew) {
  [System.Windows.Forms.MessageBox]::Show(
    "El panel de Spider Tracker ya esta abierto.",
    "Spider Tracker",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null
  $panelMutex.Dispose()
  return
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "Spider Tracker - Servidor"
$form.StartPosition = "CenterScreen"
$form.ClientSize = New-Object System.Drawing.Size(520, 310)
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(12, 23, 37)
$form.ForeColor = [System.Drawing.Color]::FromArgb(239, 247, 255)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$windowIconPath = Join-Path $script:ProjectRoot "assets\spider-tracker-icon.ico"
if (Test-Path -LiteralPath $windowIconPath) {
  $form.Icon = New-Object System.Drawing.Icon($windowIconPath)
}

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Control del servidor"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 20)
$titleLabel.AutoSize = $true
$titleLabel.Location = New-Object System.Drawing.Point(28, 24)
$form.Controls.Add($titleLabel)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Text = $script:ProjectRoot
$pathLabel.ForeColor = [System.Drawing.Color]::FromArgb(150, 171, 196)
$pathLabel.AutoEllipsis = $true
$pathLabel.Location = New-Object System.Drawing.Point(31, 66)
$pathLabel.Size = New-Object System.Drawing.Size(455, 22)
$form.Controls.Add($pathLabel)

$statusPanel = New-Object System.Windows.Forms.Panel
$statusPanel.Location = New-Object System.Drawing.Point(32, 105)
$statusPanel.Size = New-Object System.Drawing.Size(14, 14)
$form.Controls.Add($statusPanel)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 12)
$statusLabel.AutoSize = $true
$statusLabel.Location = New-Object System.Drawing.Point(55, 99)
$form.Controls.Add($statusLabel)

$detailLabel = New-Object System.Windows.Forms.Label
$detailLabel.ForeColor = [System.Drawing.Color]::FromArgb(150, 171, 196)
$detailLabel.Location = New-Object System.Drawing.Point(32, 132)
$detailLabel.Size = New-Object System.Drawing.Size(455, 23)
$form.Controls.Add($detailLabel)

function New-ControlButton([string] $Text, [int] $X, [int] $Y, [int] $Width) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Object System.Drawing.Point($X, $Y)
  $button.Size = New-Object System.Drawing.Size($Width, 42)
  $button.FlatStyle = "Flat"
  $button.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(55, 72, 94)
  $button.BackColor = [System.Drawing.Color]::FromArgb(28, 41, 58)
  $button.ForeColor = [System.Drawing.Color]::FromArgb(239, 247, 255)
  $button.Cursor = [System.Windows.Forms.Cursors]::Hand
  $form.Controls.Add($button)
  return $button
}

$startButton = New-ControlButton -Text "Encender" -X 32 -Y 172 -Width 138
$stopButton = New-ControlButton -Text "Apagar" -X 181 -Y 172 -Width 138
$openButton = New-ControlButton -Text "Abrir aplicación" -X 330 -Y 172 -Width 158
$refreshButton = New-ControlButton -Text "Actualizar estado" -X 32 -Y 224 -Width 456

$startButton.BackColor = [System.Drawing.Color]::FromArgb(20, 116, 91)
$stopButton.BackColor = [System.Drawing.Color]::FromArgb(180, 45, 64)

$noteLabel = New-Object System.Windows.Forms.Label
$noteLabel.Text = "Cerrar este panel no apaga el servidor. Usá el botón Apagar."
$noteLabel.ForeColor = [System.Drawing.Color]::FromArgb(150, 171, 196)
$noteLabel.Location = New-Object System.Drawing.Point(32, 280)
$noteLabel.Size = New-Object System.Drawing.Size(456, 22)
$form.Controls.Add($noteLabel)

function Update-ServerStatus {
  $running = Get-TrackerProcess
  if ($running) {
    Save-TrackerPid -ProcessId $running.ProcessId
    $statusPanel.BackColor = [System.Drawing.Color]::FromArgb(52, 211, 153)
    $statusLabel.Text = "SERVIDOR ENCENDIDO"
    $detailLabel.Text = "http://localhost:$script:ServerPort  -  PID $($running.ProcessId)"
    $startButton.Enabled = $false
    $stopButton.Enabled = $true
    $openButton.Enabled = $true
    return
  }

  Clear-TrackerPid
  $statusPanel.BackColor = [System.Drawing.Color]::FromArgb(244, 63, 94)
  $statusLabel.Text = "SERVIDOR APAGADO"
  $detailLabel.Text = "La aplicación no está disponible."
  $startButton.Enabled = $true
  $stopButton.Enabled = $false
  $openButton.Enabled = $false
}

function Start-TrackerFromPanel {
  if (Get-TrackerProcess) {
    Update-ServerStatus
    return
  }

  $occupied = Get-NetTCPConnection -LocalPort $script:ServerPort -State Listen -ErrorAction SilentlyContinue
  if ($occupied) {
    [System.Windows.Forms.MessageBox]::Show(
      "El puerto $script:ServerPort está ocupado por otro programa.",
      "No se pudo iniciar",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    ) | Out-Null
    return
  }

  New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null
  $node = (Get-Command node -ErrorAction Stop).Source
  $process = Start-Process -FilePath $node `
    -ArgumentList "src/server.js" `
    -WorkingDirectory $script:ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $script:DataDir "server.log") `
    -RedirectStandardError (Join-Path $script:DataDir "server-error.log") `
    -PassThru

  Save-TrackerPid -ProcessId $process.Id
  $statusPanel.BackColor = [System.Drawing.Color]::FromArgb(250, 204, 21)
  $statusLabel.Text = "INICIANDO..."
  $detailLabel.Text = "Esperando a que responda el puerto $script:ServerPort."
  $startButton.Enabled = $false
}

function Stop-TrackerFromPanel {
  $running = Get-TrackerProcess
  if ($running) {
    Stop-Process -Id $running.ProcessId -Force
  }
  Clear-TrackerPid
  Update-ServerStatus
}

$startButton.Add_Click({
  try {
    Start-TrackerFromPanel
  } catch {
    [System.Windows.Forms.MessageBox]::Show(
      $_.Exception.Message,
      "Error al iniciar",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    Update-ServerStatus
  }
})

$stopButton.Add_Click({
  try {
    Stop-TrackerFromPanel
  } catch {
    [System.Windows.Forms.MessageBox]::Show(
      $_.Exception.Message,
      "Error al apagar",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  }
})

$openButton.Add_Click({
  Start-Process "http://localhost:$script:ServerPort"
})

$refreshButton.Add_Click({ Update-ServerStatus })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1500
$timer.Add_Tick({ Update-ServerStatus })
$timer.Start()

$form.Add_FormClosed({
  $timer.Stop()
  $panelMutex.ReleaseMutex()
  $panelMutex.Dispose()
})
Update-ServerStatus
[void] $form.ShowDialog()
