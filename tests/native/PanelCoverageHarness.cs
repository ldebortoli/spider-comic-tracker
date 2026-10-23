using System;
using System.IO;
using System.Linq;
using System.Reflection;
using SpiderTracker;
using System.Windows.Forms;

internal static class PanelCoverageHarness
{
    private static string pidFile;
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    private static object Invoke(ServerControlForm form, string name)
    {
        return typeof(ServerControlForm).GetMethod(name, BindingFlags.NonPublic | BindingFlags.Instance).Invoke(form, null);
    }
    private static void Clean()
    {
        if (File.Exists(pidFile)) { File.SetAttributes(pidFile, FileAttributes.Normal); File.Delete(pidFile); }
        PanelBoundary.Reset();
    }
    private static System.Diagnostics.Process SetProcess(string name, bool exited)
    {
        var process = new System.Diagnostics.Process { Id = 500, ProcessName = name, HasExited = exited };
        PanelBoundary.Processes[500] = process;
        File.WriteAllText(pidFile, "500");
        return process;
    }
    private static string Status(ServerControlForm form) { return form.Controls.OfType<Label>().First(l => l.Text != null && (l.Text.StartsWith("SERVIDOR") || l.Text.StartsWith("INICIANDO"))).Text; }
    [STAThread]
    private static int Main()
    {
        PanelBoundary.Root = Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar)).FullName;
        Directory.CreateDirectory(Path.Combine(PanelBoundary.Root, "data"));
        pidFile = Path.Combine(PanelBoundary.Root, "data", "server.pid");
        Clean();
        using (var form = new ServerControlForm())
        {
            Check(Status(form) == "SERVIDOR APAGADO", "initial off state");
            File.WriteAllText(pidFile, "invalid"); Invoke(form, "UpdateStatus");
            Check(!File.Exists(pidFile), "invalid PID cleared");
            File.WriteAllText(pidFile, "999"); Invoke(form, "UpdateStatus");
            SetProcess("unrelated", false); Invoke(form, "UpdateStatus"); Check(Status(form) == "SERVIDOR APAGADO", "foreign PID ignored");
            SetProcess("node", true); Invoke(form, "UpdateStatus"); Check(Status(form) == "SERVIDOR APAGADO", "exited process off");
            SetProcess("node", false); Invoke(form, "UpdateStatus"); Check(Status(form) == "INICIANDO...", "not ready state");
            PanelBoundary.Ready = true; Invoke(form, "UpdateStatus"); Check(Status(form) == "SERVIDOR ENCENDIDO", "ready state");
            Invoke(form, "StartServer"); Check(PanelBoundary.Opens == 1, "existing ready process opens browser");
            Invoke(form, "StartServer"); Check(PanelBoundary.Opens == 2, "repeated user start opens once");
            PanelBoundary.Ready = false; Invoke(form, "StartServer"); Check(PanelBoundary.Opens == 2, "pending startup doesn't open prematurely");
            PanelBoundary.Ready = true; Timer.Last.Fire(); Check(PanelBoundary.Opens == 3, "ready timer opens once");
            foreach (var button in form.Controls.OfType<Button>().Where(b => b.Text == "Abrir aplicación" || b.Text == "Actualizar estado")) button.PerformClick();
            Check(PanelBoundary.Opens == 4, "open button");
            PanelBoundary.ConnectWait = false; Invoke(form, "UpdateStatus"); Check(Status(form) == "INICIANDO...", "connection timeout");
            PanelBoundary.ConnectWait = true; PanelBoundary.BeginThrows = true; Invoke(form, "UpdateStatus");
            PanelBoundary.BeginThrows = false; PanelBoundary.EndThrows = true; Invoke(form, "UpdateStatus");
            PanelBoundary.EndThrows = false;
            PanelBoundary.KillThrows = true; Check(!(bool)Invoke(form, "StopServer"), "failed stop returns false");
            Check(!form.Close(), "failed shutdown cancels close");
            PanelBoundary.KillThrows = false;
            Check((bool)Invoke(form, "StopServer"), "successful shutdown");
            Check(!File.Exists(pidFile), "successful stop clears pid");
            Check(PanelBoundary.Starts.Any(s => s.Arguments == "/PID 500 /T /F" && s.CreateNoWindow && !s.UseShellExecute), "hidden full tree stop");
            Check(form.Close(), "close succeeds"); Check(!Timer.Last.Running, "timer stopped on close");
        }
        Clean(); PanelBoundary.Icon = false;
        using (var form = new ServerControlForm())
        {
            Check(form.Icon == null, "absent icon safe");
            PanelBoundary.Occupied = true; Invoke(form, "StartServer"); Check(PanelBoundary.Messages.Last().Contains("ocupado"), "foreign listener rejected");
            PanelBoundary.Occupied = false;
            string common = Path.Combine(PanelBoundary.Root, "ProgramFiles", "nodejs", "node.exe");
            Directory.CreateDirectory(Path.GetDirectoryName(common)); File.WriteAllText(common, "synthetic");
            form.Controls.OfType<Button>().First(b => b.Text == "Encender").PerformClick();
            Check(File.ReadAllText(pidFile) == "901", "started process persisted");
            Check(PanelBoundary.Starts.Last().WorkingDirectory == PanelBoundary.Root && PanelBoundary.Starts.Last().CreateNoWindow, "hidden start in project");
            form.Controls.OfType<Button>().First(b => b.Text == "Apagar").PerformClick();
            File.Delete(common);
            string folder = Path.Combine(PanelBoundary.Root, "node-on-path"); Directory.CreateDirectory(folder); File.WriteAllText(Path.Combine(folder, "node.exe"), "synthetic");
            PanelBoundary.SearchPath = " ;" + PanelBoundary.Root + "; " + folder + " "; Invoke(form, "StartServer");
            Check(PanelBoundary.Starts.Last().FileName == Path.Combine(folder, "node.exe"), "PATH fallback trims blanks");
            Invoke(form, "StopServer");
            PanelBoundary.StartThrows = true; Invoke(form, "StartServer"); Check(PanelBoundary.Messages.Last().StartsWith("Error al iniciar"), "start error reported");
            PanelBoundary.StartThrows = false; PanelBoundary.SearchPath = null; Invoke(form, "StartServer");
            Check(PanelBoundary.Messages.Last().Contains("No se encontró node.exe"), "missing runtime reported");
            File.WriteAllText(pidFile, "invalid"); File.SetAttributes(pidFile, FileAttributes.ReadOnly); Invoke(form, "UpdateStatus");
            Check(File.Exists(pidFile), "PID cleanup failure handled"); File.SetAttributes(pidFile, FileAttributes.Normal);
            Check((bool)Invoke(form, "StopServer"), "off stop idempotent");
        }
        Clean();
        var target = new System.Diagnostics.Process { Id = 500, ProcessName = "node" };
        foreach (string failure in new[] { "wait", "exit", "target", "null" })
        {
            PanelBoundary.KillerWait = failure != "wait"; PanelBoundary.KillerExit = failure == "exit" ? 1 : 0;
            PanelBoundary.TargetWait = failure != "target"; PanelBoundary.NullStart = failure == "null";
            bool failed = false; try { ServerControlForm.StopProcessTree(target); } catch { failed = true; }
            Check(failed, "failed tree stop: " + failure);
        }
        PanelBoundary.Reset(); PanelBoundary.KillerExit = 1; target.HasExited = true;
        ServerControlForm.StopProcessTree(target); Check(PanelBoundary.Disposals > 0, "exited target accepted and killer disposed");
        Clean();
        var main = typeof(ServerControlForm).Assembly.GetType("SpiderTracker.Program").GetMethod("Main", BindingFlags.NonPublic | BindingFlags.Static);
        PanelBoundary.Created = false; main.Invoke(null, null); Check(PanelBoundary.Messages.Last().Contains("ya esta abierto"), "duplicate panel rejected");
        PanelBoundary.Created = true; main.Invoke(null, null); Check(PanelBoundary.MainRuns == 1, "main starts application when mutex acquired");
        Console.WriteLine("ok - complete unchanged panel source: PID identity, readiness, buttons, close/error paths and process-tree contract");
        return 0;
    }
}
