$ErrorActionPreference = 'Stop'
function Get-CoverageFileHash([string] $Path) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash([IO.File]::ReadAllBytes($Path))).Replace('-', '') }
  finally { $algorithm.Dispose() }
}
$toolRoot = Join-Path (Split-Path -Parent $PSScriptRoot) 'data/coverage-tools'
New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
$packages = @(
  @{ Name = 'Pester'; Version = '5.7.1'; Url = 'https://www.powershellgallery.com/api/v2/package/Pester/5.7.1'; Hash = '4A27904C6814A5FBE4758F8E49861F6A1994AEE77B71165A5C43C0371BA6C580'; Folder = 'Pester/5.7.1'; Probe = 'Pester.psd1' },
  @{ Name = 'AltCover'; Version = '9.0.145'; Url = 'https://api.nuget.org/v3-flatcontainer/altcover/9.0.145/altcover.9.0.145.nupkg'; Hash = '2BC7C6FABFDCB8B4BC417724DC824A88AF37FD536ECE8326DA3844F1A3210152'; Folder = 'altcover'; Probe = 'tools/net472/AltCover.exe' }
)
foreach ($package in $packages) {
  $destination = Join-Path $toolRoot $package.Folder
  if (Test-Path -LiteralPath (Join-Path $destination $package.Probe)) { continue }
  $archive = Join-Path $toolRoot "$($package.Name)-$($package.Version).zip"
  Invoke-WebRequest -Uri $package.Url -OutFile $archive -UseBasicParsing
  if ((Get-CoverageFileHash $archive) -ne $package.Hash) { throw "Invalid $($package.Name) package hash." }
  Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
}
