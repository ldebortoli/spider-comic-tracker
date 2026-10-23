// Headless boundary doubles: compile the unchanged panel source with these types.
// The real WinForms/compiler/process-tree integration is tested separately.
using System;
using System.Collections.Generic;
using System.Drawing;

internal static class PanelBoundary
{
    internal static string Root;
    internal static bool Created = true, Icon = true, Occupied, BeginThrows, EndThrows, Ready, ConnectWait = true;
    internal static bool StartThrows, KillThrows, KillerWait = true, TargetWait = true, NullStart;
    internal static int KillerExit, Opens, Disposals, MainRuns;
    internal static string SearchPath;
    internal static readonly List<string> Messages = new List<string>();
    internal static readonly List<System.Diagnostics.ProcessStartInfo> Starts = new List<System.Diagnostics.ProcessStartInfo>();
    internal static readonly Dictionary<int, System.Diagnostics.Process> Processes = new Dictionary<int, System.Diagnostics.Process>();
    internal static void Reset()
    {
        Created = Icon = ConnectWait = KillerWait = TargetWait = true;
        Occupied = BeginThrows = EndThrows = Ready = StartThrows = KillThrows = NullStart = false;
        KillerExit = Opens = Disposals = 0;
        SearchPath = null;
        Messages.Clear(); Starts.Clear(); Processes.Clear();
    }
}

namespace System
{
    internal static class Environment
    {
        internal enum SpecialFolder { ProgramFiles, System }
        internal static string GetFolderPath(SpecialFolder folder) { return IO.Path.Combine(PanelBoundary.Root, folder.ToString()); }
        internal static string GetEnvironmentVariable(string name) { return PanelBoundary.SearchPath; }
    }
}
namespace System.Threading
{
    internal sealed class Mutex : IDisposable
    {
        internal Mutex(bool owned, string name, out bool created) { created = PanelBoundary.Created; }
        public void Dispose() { PanelBoundary.Disposals++; }
    }
}
namespace System.Drawing
{
    internal sealed class Icon
    {
        internal static Icon ExtractAssociatedIcon(string file) { return PanelBoundary.Icon ? new Icon() : null; }
    }
}
namespace System.Diagnostics
{
    internal enum ProcessWindowStyle { Hidden }
    internal sealed class ProcessStartInfo
    {
        internal string FileName, Arguments, WorkingDirectory;
        internal bool UseShellExecute, CreateNoWindow;
        internal ProcessWindowStyle WindowStyle;
    }
    internal sealed class Process : IDisposable
    {
        internal int Id, ExitCode;
        internal string ProcessName;
        internal bool HasExited, Killer;
        internal static Process GetProcessById(int id)
        {
            if (!PanelBoundary.Processes.ContainsKey(id)) throw new ArgumentException("missing synthetic process");
            return PanelBoundary.Processes[id];
        }
        internal static Process Start(ProcessStartInfo info)
        {
            PanelBoundary.Starts.Add(info);
            if (info.FileName.StartsWith("http")) { PanelBoundary.Opens++; return null; }
            bool killer = info.FileName.EndsWith("taskkill.exe");
            if (PanelBoundary.StartThrows || (killer && PanelBoundary.KillThrows)) throw new InvalidOperationException("synthetic process boundary failure");
            if (PanelBoundary.NullStart) return null;
            var result = new Process { Id = 901, ProcessName = "node", Killer = killer, ExitCode = PanelBoundary.KillerExit };
            if (!killer) PanelBoundary.Processes[result.Id] = result;
            return result;
        }
        internal bool WaitForExit(int timeout) { return Killer ? PanelBoundary.KillerWait : PanelBoundary.TargetWait; }
        public void Dispose() { PanelBoundary.Disposals++; }
    }
}
namespace System.Net.NetworkInformation
{
    internal sealed class IPGlobalProperties
    {
        internal static IPGlobalProperties GetIPGlobalProperties() { return new IPGlobalProperties(); }
        internal Net.IPEndPoint[] GetActiveTcpListeners()
        {
            return new[] { new Net.IPEndPoint(Net.IPAddress.Loopback, PanelBoundary.Occupied ? 8787 : 1234) };
        }
    }
}
namespace System.Net.Sockets
{
    internal sealed class TcpClient : IDisposable
    {
        internal bool Connected { get { return PanelBoundary.Ready; } }
        internal IAsyncResult BeginConnect(string host, int port, AsyncCallback callback, object state)
        {
            if (PanelBoundary.BeginThrows) throw new InvalidOperationException("synthetic begin failure");
            return new Connection();
        }
        internal void EndConnect(IAsyncResult result) { if (PanelBoundary.EndThrows) throw new InvalidOperationException("synthetic end failure"); }
        public void Dispose() { PanelBoundary.Disposals++; }
        private sealed class Connection : IAsyncResult
        {
            public object AsyncState { get { return null; } }
            public Threading.WaitHandle AsyncWaitHandle { get { return new ConnectionWait(); } }
            public bool CompletedSynchronously { get { return true; } }
            public bool IsCompleted { get { return true; } }
        }
        private sealed class ConnectionWait : Threading.WaitHandle
        {
            public override bool WaitOne(int timeout) { return PanelBoundary.ConnectWait; }
            public override void Close() { PanelBoundary.Disposals++; }
        }
    }
}
namespace System.Windows.Forms
{
    internal enum FormStartPosition { CenterScreen }
    internal enum FormBorderStyle { FixedDialog }
    internal enum FlatStyle { Flat }
    internal enum MessageBoxButtons { OK }
    internal enum MessageBoxIcon { Information, Warning, Error }
    internal static class Cursors { internal static object Hand = new object(); }
    internal class Control
    {
        internal string Text;
        internal bool AutoSize, AutoEllipsis, Enabled = true;
        internal Font Font;
        internal Point Location;
        internal Size Size;
        internal Color ForeColor, BackColor;
        internal object Cursor;
        internal readonly List<Control> Controls = new List<Control>();
        internal event EventHandler Click;
        internal void PerformClick() { if (Click != null) Click(this, EventArgs.Empty); }
    }
    internal sealed class Button : Control
    {
        internal FlatStyle FlatStyle;
        internal readonly Appearance FlatAppearance = new Appearance();
    }
    internal sealed class Appearance { internal Color BorderColor; }
    internal sealed class Panel : Control { }
    internal sealed class Label : Control { }
    internal sealed class FormClosingEventArgs : EventArgs { internal bool Cancel; }
    internal delegate void FormClosingEventHandler(object sender, FormClosingEventArgs args);
    internal class Form : Control, IDisposable
    {
        internal FormStartPosition StartPosition;
        internal FormBorderStyle FormBorderStyle;
        internal Size ClientSize;
        internal bool MaximizeBox, Closed;
        internal Icon Icon;
        internal event FormClosingEventHandler FormClosing;
        internal event EventHandler FormClosed;
        internal bool Close()
        {
            var args = new FormClosingEventArgs();
            if (FormClosing != null) FormClosing(this, args);
            if (!args.Cancel) { Closed = true; if (FormClosed != null) FormClosed(this, EventArgs.Empty); }
            return Closed;
        }
        public void Dispose() { }
    }
    internal sealed class Timer
    {
        internal static Timer Last;
        internal int Interval;
        internal bool Running;
        internal event EventHandler Tick;
        internal Timer() { Last = this; }
        internal void Start() { Running = true; }
        internal void Stop() { Running = false; }
        internal void Fire() { if (Tick != null) Tick(this, EventArgs.Empty); }
    }
    internal static class MessageBox
    {
        internal static void Show(string message, string title, MessageBoxButtons buttons, MessageBoxIcon icon) { PanelBoundary.Messages.Add(title + ": " + message); }
    }
    internal static class Application
    {
        internal static string ExecutablePath = "synthetic.exe";
        internal static void EnableVisualStyles() { }
        internal static void SetCompatibleTextRenderingDefault(bool value) { }
        internal static void Run(Form form) { PanelBoundary.MainRuns++; form.Close(); }
    }
}
