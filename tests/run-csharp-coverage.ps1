$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'install-coverage-tools.ps1')
$runRoot = Join-Path $projectRoot ('data/coverage/csharp-' + [guid]::NewGuid().ToString('N'))
$inputRoot = Join-Path $runRoot 'input'
$instrumented = Join-Path $runRoot 'instrumented'
New-Item -ItemType Directory -Path $inputRoot -Force | Out-Null
$productionSources = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src') -Filter '*.cs' -Recurse)
if (-not $productionSources.Count) { throw 'Missing C# source inventory.' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$sources = @($productionSources.FullName) + @(
  (Join-Path $PSScriptRoot 'native/PanelFrameworkDoubles.cs'),
  (Join-Path $PSScriptRoot 'native/PanelCoverageHarness.cs')
)
$executable = Join-Path $inputRoot 'PanelHarness.exe'
& $compiler /nologo /debug:full /optimize- /nowarn:0436,1685 /target:exe /main:PanelCoverageHarness /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll "/out:$executable" @sources
if ($LASTEXITCODE -ne 0) { throw 'C# coverage harness compilation failed.' }
$altcover = Join-Path $projectRoot 'data/coverage-tools/altcover/tools/net472/AltCover.exe'
$reportPath = Join-Path $runRoot 'coverage.xml'
# Exclude only the two test sources, including all application namespaces.
& $altcover "--inputDirectory=$inputRoot" "--outputDirectory=$instrumented" "--report=$reportPath" '--fileFilter=PanelFrameworkDoubles.cs|PanelCoverageHarness.cs' --localSource
if ($LASTEXITCODE -ne 0) { throw 'Native instrumentation failed.' }
& $altcover Runner "--recorderDirectory=$instrumented" "--executable=$(Join-Path $instrumented 'PanelHarness.exe')"
if ($LASTEXITCODE -ne 0) { throw 'Native coverage tests failed.' }
[xml]$report = Get-Content -LiteralPath $reportPath
$sourceIds = @()
foreach ($source in $productionSources) {
  $entry = @($report.SelectNodes('//Files/File') | Where-Object { $_.fullPath -eq $source.FullName })
  if ($entry.Count -ne 1) { throw "C# source missing from instrumentation: $($source.Name)" }
  $sourceIds += $entry[0].uid
}
$methods = @($report.SelectNodes('//Methods/Method') | Where-Object { $_.FileRef -and $sourceIds -contains $_.FileRef.uid })
$statements = @($methods | ForEach-Object { $_.SelectNodes('SequencePoints/SequencePoint') })
$branches = @($methods | ForEach-Object { $_.SelectNodes('BranchPoints/BranchPoint') })
if (-not $statements.Count -or -not $branches.Count -or -not $methods.Count) { throw 'Incomplete native instrumentation.' }
# AltCover's summary adds a phantom branch to branchless methods. Gate actual
# OpenCover BranchPoint records, not those synthetic summary denominators.
$missedStatements = @($statements | Where-Object { [int]$_.vc -le 0 })
$missedBranches = @($branches | Where-Object { [int]$_.vc -le 0 })
$missedMethods = @($methods | Where-Object { $_.visited -ne 'true' })
if ($missedStatements.Count -or $missedBranches.Count -or $missedMethods.Count) {
  throw "Native coverage below 100%: $($missedStatements.Count) statements, $($missedBranches.Count) branches, $($missedMethods.Count) methods missed."
}
$lineNumbers = @($statements | ForEach-Object { [int]$_.sl..[int]$_.el } | Sort-Object -Unique)
$summary = @{
  file = 'src/ServerControl.cs'
  lines = @{ covered = $lineNumbers.Count; total = $lineNumbers.Count }
  statements = @{ covered = $statements.Count; total = $statements.Count }
  branches = @{ covered = $branches.Count; total = $branches.Count }
  functions = @{ covered = $methods.Count; total = $methods.Count }
  engine = 'AltCover 9.0.145 explicit OpenCover points'
}
$summaryPath = Join-Path $projectRoot 'data/coverage/csharp-summary.json'
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
Write-Output "C# 100%: $($lineNumbers.Count) lines, $($statements.Count) statements, $($branches.Count) explicit branches, $($methods.Count) methods."
