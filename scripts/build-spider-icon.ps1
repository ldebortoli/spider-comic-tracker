$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectRoot "assets"
$pngPath = Join-Path $assetsDir "spider-tracker-icon.png"
$iconPath = Join-Path $assetsDir "spider-tracker-icon.ico"
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null

$size = 256
$bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.Clear([System.Drawing.Color]::Transparent)

$badgeRect = New-Object System.Drawing.Rectangle(9, 9, 238, 238)
$badgePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$badgePath.AddEllipse($badgeRect)
$badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $badgeRect,
  [System.Drawing.Color]::FromArgb(255, 255, 63, 94),
  [System.Drawing.Color]::FromArgb(255, 178, 20, 54),
  55
)
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 5, 13, 25), 13)
$graphics.FillPath($badgeBrush, $badgePath)
$graphics.DrawPath($borderPen, $badgePath)

$graphics.SetClip($badgePath)
$webPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 8, 18, 32), 6)
$webPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$webPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$center = New-Object System.Drawing.PointF(128, 126)
foreach ($angle in @(0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330)) {
  $radians = $angle * [Math]::PI / 180
  $edge = New-Object System.Drawing.PointF(
    (128 + 145 * [Math]::Cos($radians)),
    (126 + 145 * [Math]::Sin($radians))
  )
  $graphics.DrawLine($webPen, $center, $edge)
}

foreach ($diameter in @(64, 118, 176, 228)) {
  $offset = (256 - $diameter) / 2
  $graphics.DrawEllipse($webPen, $offset, $offset - 2, $diameter, $diameter)
}

$graphics.ResetClip()

$leftEye = New-Object System.Drawing.Drawing2D.GraphicsPath
$leftEye.StartFigure()
$leftEye.AddBezier(108, 80, 86, 91, 63, 119, 57, 176)
$leftEye.AddBezier(57, 176, 79, 164, 101, 143, 115, 105)
$leftEye.AddBezier(115, 105, 114, 94, 112, 86, 108, 80)
$leftEye.CloseFigure()

$rightEye = New-Object System.Drawing.Drawing2D.GraphicsPath
$rightEye.StartFigure()
$rightEye.AddBezier(148, 80, 170, 91, 193, 119, 199, 176)
$rightEye.AddBezier(199, 176, 177, 164, 155, 143, 141, 105)
$rightEye.AddBezier(141, 105, 142, 94, 144, 86, 148, 80)
$rightEye.CloseFigure()

$eyeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 239, 247, 255))
$eyePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 5, 13, 25), 11)
$eyePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.FillPath($eyeBrush, $leftEye)
$graphics.DrawPath($eyePen, $leftEye)
$graphics.FillPath($eyeBrush, $rightEye)
$graphics.DrawPath($eyePen, $rightEye)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$pngStream = New-Object System.IO.MemoryStream
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()
$fileStream = [System.IO.File]::Create($iconPath)
$writer = New-Object System.IO.BinaryWriter($fileStream)
$writer.Write([UInt16] 0)
$writer.Write([UInt16] 1)
$writer.Write([UInt16] 1)
$writer.Write([Byte] 0)
$writer.Write([Byte] 0)
$writer.Write([Byte] 0)
$writer.Write([Byte] 0)
$writer.Write([UInt16] 1)
$writer.Write([UInt16] 32)
$writer.Write([UInt32] $pngBytes.Length)
$writer.Write([UInt32] 22)
$writer.Write($pngBytes)
$writer.Flush()

$writer.Dispose()
$fileStream.Dispose()
$pngStream.Dispose()
$eyePen.Dispose()
$eyeBrush.Dispose()
$leftEye.Dispose()
$rightEye.Dispose()
$webPen.Dispose()
$borderPen.Dispose()
$badgeBrush.Dispose()
$badgePath.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $iconPath
