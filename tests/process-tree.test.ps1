$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $projectRoot "scripts/server-common.ps1")
$candidateDir = Join-Path $projectRoot "data/security-review/windows-candidate"
New-Item -ItemType Directory -Path $candidateDir -Force | Out-Null
$fixture = Join-Path $candidateDir "fake-tree.js"
@'
const fs = require("node:fs");
const { spawn } = require("node:child_process");
fs.appendFileSync(process.argv[2], process.pid + "\n");
const depth = Number(process.argv[3]);
if (depth > 0) spawn(process.execPath, [__filename, process.argv[2], String(depth - 1)], { windowsHide: true, stdio: "ignore" });
setInterval(() => {}, 1000);
'@ | Set-Content -LiteralPath $fixture -Encoding UTF8
$harness = Join-Path $candidateDir "ProcessTreeHarness.cs"
@'
using System;
using System.Diagnostics;
using System.IO;
namespace SpiderTracker {
    internal static class ProcessTreeHarness {
        [STAThread]
        private static int Main(string[] args) {
            if (args.Length > 1 && args[1] == "form") {
                string root = Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar)).FullName;
                Directory.CreateDirectory(Path.Combine(root, "data"));
                File.WriteAllText(Path.Combine(root, "data", "server.pid"), args[0]);
                using (ServerControlForm form = new ServerControlForm()) {
                    IntPtr handle = form.Handle; // Create a hidden native window; never Show().
                    form.Close();
                    if (!form.IsDisposed) throw new Exception("Form did not finish closing");
                }
            } else {
                ServerControlForm.StopProcessTree(Process.GetProcessById(int.Parse(args[0])));
            }
            return 0;
        }
    }
}
'@ | Set-Content -LiteralPath $harness -Encoding UTF8
$compiler = Join-Path $env:WINDIR "Microsoft.NET/Framework64/v4.0.30319/csc.exe"
$source = Join-Path $projectRoot "src/ServerControl.cs"
$panel = Join-Path $candidateDir "SpiderTrackerServerControl.exe"
$runner = Join-Path $candidateDir "ProcessTreeHarness.exe"
& $compiler /nologo /target:winexe /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll "/out:$panel" $source
if ($LASTEXITCODE -ne 0) { throw "Candidate panel compile failed" }
& $compiler /nologo /target:exe /main:SpiderTracker.ProcessTreeHarness /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll "/out:$runner" $source $harness
if ($LASTEXITCODE -ne 0) { throw "Test harness compile failed" }
foreach ($mode in @("powershell", "compiled-panel", "form-close")) {
  $pidList = Join-Path $candidateDir "$mode.pids"
  Set-Content -LiteralPath $pidList -Value "" -Encoding ascii
  $nodePath = (Get-Command node -ErrorAction Stop).Source
  $arguments = '"' + $fixture + '" "' + $pidList + '" 2'
  $rootProcess = Start-Process -FilePath $nodePath -ArgumentList $arguments -WindowStyle Hidden -PassThru
  try {
    $ids = @()
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
      $ids = @(Get-Content -LiteralPath $pidList | Where-Object { $_ -match '^\d+$' })
      if ($ids.Count -eq 3) { break }
      Start-Sleep -Milliseconds 100
    }
    if ($ids.Count -ne 3) { throw "Synthetic tree did not start" }
    if ($mode -eq "powershell") {
      Stop-TrackerProcessTree -ProcessId $rootProcess.Id
    } elseif ($mode -eq "compiled-panel") {
      & $runner $rootProcess.Id
      if ($LASTEXITCODE -ne 0) { throw "Compiled tree shutdown failed" }
    } else {
      & $runner $rootProcess.Id form
      if ($LASTEXITCODE -ne 0) { throw "Native form close failed" }
    }
    foreach ($managedId in $ids) {
      if (Get-Process -Id ([int]$managedId) -ErrorAction SilentlyContinue) { throw "Managed descendant remained alive" }
    }
    Write-Output "ok - $mode stops root, child and grandchild before returning"
  } finally {
    if (-not $rootProcess.HasExited) { Stop-TrackerProcessTree -ProcessId $rootProcess.Id }
  }
}
Write-Output "ok - candidate panel compiled without replacing bin/"
