using System;
using System.Collections.Generic;
using System.Drawing;

// Public WinForms boundary types for executing the unchanged PowerShell panel
// without opening a native window or loading the real WinForms assembly.
namespace System.Windows.Forms {
    public enum MessageBoxButtons { OK }
    public enum MessageBoxIcon { Information, Warning, Error }
    public static class Cursors { public static object Hand = new object(); }
    public static class MessageBox {
        public static readonly List<string> Messages = new List<string>();
        public static void Show(string message, string title, MessageBoxButtons buttons, MessageBoxIcon icon) { Messages.Add(title + ": " + message); }
    }
    public static class Application { public static void EnableVisualStyles() { } }
    public class Appearance { public Color BorderColor { get; set; } }
    public class Control {
        public string Text { get; set; }
        public bool Enabled { get; set; }
        public bool AutoSize { get; set; }
        public bool AutoEllipsis { get; set; }
        public Font Font { get; set; }
        public Point Location { get; set; }
        public Size Size { get; set; }
        public Color ForeColor { get; set; }
        public Color BackColor { get; set; }
        public object Cursor { get; set; }
        public readonly List<Control> Controls = new List<Control>();
        public event EventHandler Click;
        public void PerformClick() { if (Click != null) Click(this, EventArgs.Empty); }
    }
    public class Label : Control { }
    public class Panel : Control { }
    public class Button : Control {
        public string FlatStyle { get; set; }
        public readonly Appearance FlatAppearance = new Appearance();
    }
    public class ClosingArgs : EventArgs { public bool Cancel { get; set; } }
    public delegate void ClosingHandler(object sender, ClosingArgs args);
    public class Form : Control {
        public string StartPosition { get; set; }
        public string FormBorderStyle { get; set; }
        public Size ClientSize { get; set; }
        public bool MaximizeBox { get; set; }
        public Icon Icon { get; set; }
        public event ClosingHandler FormClosing;
        public event EventHandler FormClosed;
        public int ShowDialog() { return 0; }
        public bool TryClose() {
            var args = new ClosingArgs();
            if (FormClosing != null) FormClosing(this, args);
            if (args.Cancel) return false;
            if (FormClosed != null) FormClosed(this, EventArgs.Empty);
            return true;
        }
    }
    public class Timer {
        public int Interval { get; set; }
        public bool Running { get; set; }
        public event EventHandler Tick;
        public void Start() { Running = true; }
        public void Stop() { Running = false; }
        public void Fire() { if (Tick != null) Tick(this, EventArgs.Empty); }
    }
}

namespace PowerShellBoundaries {
    public class MutexDouble {
        public bool Released, Disposed;
        public void ReleaseMutex() { Released = true; }
        public void Dispose() { Disposed = true; }
    }
    public class WaitDouble {
        public bool Ready;
        public bool Closed;
        public bool WaitOne(int timeout) { return Ready; }
        public void Close() { Closed = true; }
    }
    public class ConnectionDouble { public WaitDouble AsyncWaitHandle = new WaitDouble(); }
    public class TcpClientDouble {
        public bool Connected, Wait = true, BeginThrows, EndThrows, Closed;
        public ConnectionDouble BeginConnect(string host, int port, object callback, object state) {
            if (BeginThrows) throw new InvalidOperationException("synthetic connect failure");
            return new ConnectionDouble { AsyncWaitHandle = new WaitDouble { Ready = Wait } };
        }
        public void EndConnect(ConnectionDouble connection) { if (EndThrows) throw new InvalidOperationException("synthetic connection finalization failure"); }
        public void Close() { Closed = true; }
    }
}
