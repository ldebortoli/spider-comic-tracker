param([string] $PesterPath = (Join-Path $PSScriptRoot '..\data\coverage-tools\Pester\5.7.1\Pester.psd1'))
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'install-coverage-tools.ps1')
Import-Module $PesterPath -Force
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceScripts = @(Get-ChildItem (Join-Path $projectRoot 'scripts\*.ps1') -File | Sort-Object Name)
if ($sourceScripts.Count -eq 0) { throw 'The production PowerShell inventory is empty.' }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('spider-powershell-coverage-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path (Join-Path $testRoot 'scripts') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $testRoot 'src') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $testRoot 'assets') -Force | Out-Null
foreach ($source in $sourceScripts) {
  Copy-Item -LiteralPath $source.FullName -Destination (Join-Path $testRoot ('scripts\' + $source.Name))
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'src\ServerControl.cs') -Destination (Join-Path $testRoot 'src\ServerControl.cs')
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets\spider-tracker-icon.ico') -Destination (Join-Path $testRoot 'assets\spider-tracker-icon.ico')
$reportDir = Join-Path $projectRoot 'data\coverage\powershell'
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
try {
  $configuration = New-PesterConfiguration
  $configuration.Run.Container = New-PesterContainer -Path (Join-Path $PSScriptRoot 'native\PowerShell.Tests.ps1') -Data @{ TestRoot = $testRoot; ProjectRoot = $projectRoot }
  $configuration.Run.PassThru = $true
  $configuration.Output.Verbosity = 'Detailed'
  $configuration.CodeCoverage.Enabled = $true
  $configuration.CodeCoverage.Path = @($sourceScripts | ForEach-Object { Join-Path $testRoot ('scripts\' + $_.Name) })
  $configuration.CodeCoverage.OutputPath = Join-Path $reportDir 'coverage.xml'
  $configuration.CodeCoverage.CoveragePercentTarget = 100
  $result = Invoke-Pester -Configuration $configuration
  $result | Export-Clixml (Join-Path $reportDir 'result.xml') -Depth 6
  $coverage = $result.CodeCoverage
  if ($coverage.FilesAnalyzedCount -ne $sourceScripts.Count -or $coverage.CommandsAnalyzedCount -le 0) {
    throw 'PowerShell coverage did not analyze the complete production script inventory.'
  }
  foreach ($source in $sourceScripts) {
    $copy = Join-Path $testRoot ('scripts\' + $source.Name)
    if ((Get-CoverageFileHash $source.FullName) -ne (Get-CoverageFileHash $copy) -or $coverage.FilesAnalyzed -notcontains $copy) {
      throw "PowerShell coverage source integrity mismatch: $($source.Name)"
    }
  }
  if ($result.FailedCount -gt 0 -or $result.Result -ne 'Passed' -or $coverage.CommandsMissedCount -ne 0 -or $coverage.CoveragePercent -ne 100) {
    throw 'PowerShell tests or the 100% command coverage gate failed.'
  }
  [pscustomobject]@{
    Files = $sourceScripts.Name
    Commands = $coverage.CommandsAnalyzedCount
    CoveredCommands = $coverage.CommandsExecutedCount
    CommandCoverage = $coverage.CoveragePercent
    Threshold = 100
    TestCount = $result.TotalCount
    FailedTests = $result.FailedCount
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $reportDir 'summary.json') -Encoding UTF8
  $coverage | Format-List FilesAnalyzedCount,CommandsAnalyzedCount,CommandsExecutedCount,CommandsMissedCount,CoveragePercent | Out-String | Write-Output
} finally {
  $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
  $temporaryBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not $resolvedTestRoot.StartsWith($temporaryBase, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedTestRoot) -notlike 'spider-powershell-coverage-*') {
    throw 'Refusing to remove a path outside the synthetic coverage directory.'
  }
  Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
}
