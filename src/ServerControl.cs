using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Windows.Forms;
using ThreadingMutex = System.Threading.Mutex;

namespace SpiderTracker
{
    internal static class Program
    {
        private const string PanelMutexName = @"Local\SpiderTrackerServerControl";

        [STAThread]
        private static void Main()
        {
            bool createdNew;
            using (ThreadingMutex panelMutex = new ThreadingMutex(true, PanelMutexName, out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show("El panel de Spider Tracker ya esta abierto.", "Spider Tracker", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new ServerControlForm());
            }
        }
    }

    internal sealed class ServerControlForm : Form
    {
        private const int ServerPort = 8787;
        private readonly string projectRoot;
        private readonly string dataDir;
        private readonly string pidFile;
        private readonly Panel statusDot;
        private readonly Label statusLabel;
        private readonly Label detailLabel;
        private readonly Button startButton;
        private readonly Button stopButton;
        private readonly Button openButton;
        private readonly Timer statusTimer;
        private bool openApplicationWhenReady;

        public ServerControlForm()
        {
            projectRoot = Directory.GetParent(AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar)).FullName;
            dataDir = Path.Combine(projectRoot, "data");
            pidFile = Path.Combine(dataDir, "server.pid");

            Text = "Spider Tracker - Servidor";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(520, 310);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            BackColor = Color.FromArgb(12, 23, 37);
            ForeColor = Color.FromArgb(239, 247, 255);
            Font = new Font("Segoe UI", 10f);

            Icon appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            if (appIcon != null)
            {
                Icon = appIcon;
            }

            Label title = new Label
            {
                Text = "Control del servidor",
                Font = new Font("Segoe UI Semibold", 20f),
                AutoSize = true,
                Location = new Point(28, 24)
            };
            Controls.Add(title);

            Label path = new Label
            {
                Text = projectRoot,
                ForeColor = Color.FromArgb(150, 171, 196),
                AutoEllipsis = true,
                Location = new Point(31, 66),
                Size = new Size(455, 22)
            };
            Controls.Add(path);

            statusDot = new Panel { Location = new Point(32, 105), Size = new Size(14, 14) };
            Controls.Add(statusDot);

            statusLabel = new Label
            {
                Font = new Font("Segoe UI Semibold", 12f),
                AutoSize = true,
                Location = new Point(55, 99)
            };
            Controls.Add(statusLabel);

            detailLabel = new Label
            {
                ForeColor = Color.FromArgb(150, 171, 196),
                Location = new Point(32, 132),
                Size = new Size(455, 23)
            };
            Controls.Add(detailLabel);

            startButton = CreateButton("Encender", 32, 172, 138, Color.FromArgb(20, 116, 91));
            stopButton = CreateButton("Apagar", 181, 172, 138, Color.FromArgb(180, 45, 64));
            openButton = CreateButton("Abrir aplicación", 330, 172, 158, Color.FromArgb(28, 41, 58));
            Button refreshButton = CreateButton("Actualizar estado", 32, 224, 456, Color.FromArgb(28, 41, 58));

            Label note = new Label
            {
                Text = "Cerrar este panel también apaga el servidor.",
                ForeColor = Color.FromArgb(150, 171, 196),
                Location = new Point(32, 280),
                Size = new Size(456, 22)
            };
            Controls.Add(note);

            startButton.Click += delegate { StartServer(); };
            stopButton.Click += delegate { StopServer(); };
            openButton.Click += delegate { OpenApplication(); };
            refreshButton.Click += delegate { UpdateStatus(); };

            statusTimer = new Timer { Interval = 1500 };
            statusTimer.Tick += delegate { UpdateStatus(); };
            statusTimer.Start();
            FormClosing += delegate(object sender, FormClosingEventArgs args)
            {
                if (!StopServer()) args.Cancel = true;
            };
            FormClosed += delegate { statusTimer.Stop(); };

            UpdateStatus();
        }

        private Button CreateButton(string text, int x, int y, int width, Color color)
        {
            Button button = new Button
            {
                Text = text,
                Location = new Point(x, y),
                Size = new Size(width, 42),
                FlatStyle = FlatStyle.Flat,
                BackColor = color,
                ForeColor = Color.FromArgb(239, 247, 255),
                Cursor = Cursors.Hand
            };
            button.FlatAppearance.BorderColor = Color.FromArgb(55, 72, 94);
            Controls.Add(button);
            return button;
        }

        private Process GetServerProcess()
        {
            try
            {
                if (!File.Exists(pidFile)) return null;
                int pid;
                if (!int.TryParse(File.ReadAllText(pidFile).Trim(), out pid)) return null;
                Process process = Process.GetProcessById(pid);
                return string.Equals(process.ProcessName, "node", StringComparison.OrdinalIgnoreCase) ? process : null;
            }
            catch
            {
                return null;
            }
        }

        private void UpdateStatus()
        {
            Process process = GetServerProcess();
            bool running = process != null && !process.HasExited;
            if (running)
            {
                bool ready = IsApplicationReady();
                statusDot.BackColor = ready ? Color.FromArgb(52, 211, 153) : Color.FromArgb(250, 204, 21);
                statusLabel.Text = ready ? "SERVIDOR ENCENDIDO" : "INICIANDO...";
                detailLabel.Text = ready
                    ? "http://localhost:" + ServerPort + "  -  PID " + process.Id
                    : "Esperando a que responda el puerto " + ServerPort + ".";

                if (ready && openApplicationWhenReady)
                {
                    openApplicationWhenReady = false;
                    OpenApplication();
                }
            }
            else
            {
                openApplicationWhenReady = false;
                statusDot.BackColor = Color.FromArgb(244, 63, 94);
                statusLabel.Text = "SERVIDOR APAGADO";
                detailLabel.Text = "La aplicación no está disponible.";
                try { if (File.Exists(pidFile)) File.Delete(pidFile); } catch { }
            }

            startButton.Enabled = !running;
            stopButton.Enabled = running;
            openButton.Enabled = running;
        }

        private void StartServer()
        {
            if (GetServerProcess() != null)
            {
                openApplicationWhenReady = true;
                UpdateStatus();
                return;
            }

            if (IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(endpoint => endpoint.Port == ServerPort))
            {
                MessageBox.Show("El puerto " + ServerPort + " está ocupado por otro programa.", "No se pudo iniciar", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                openApplicationWhenReady = true;
                string nodePath = FindNode();
                Directory.CreateDirectory(dataDir);
                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = nodePath,
                    Arguments = "src/server.js",
                    WorkingDirectory = projectRoot,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process process = Process.Start(startInfo);
                File.WriteAllText(pidFile, process.Id.ToString());
                statusDot.BackColor = Color.FromArgb(250, 204, 21);
                statusLabel.Text = "INICIANDO...";
                detailLabel.Text = "Esperando a que responda el puerto " + ServerPort + ".";
            }
            catch (Exception error)
            {
                openApplicationWhenReady = false;
                MessageBox.Show(error.Message, "Error al iniciar", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static bool IsApplicationReady()
        {
            using (TcpClient client = new TcpClient())
            {
                IAsyncResult connection = null;
                try
                {
                    connection = client.BeginConnect("127.0.0.1", ServerPort, null, null);
                    if (!connection.AsyncWaitHandle.WaitOne(250)) return false;
                    client.EndConnect(connection);
                    return client.Connected;
                }
                catch
                {
                    return false;
                }
                finally
                {
                    if (connection != null) connection.AsyncWaitHandle.Close();
                }
            }
        }

        private bool StopServer()
        {
            try
            {
                Process process = GetServerProcess();
                if (process != null && !process.HasExited)
                {
                    process.Kill();
                    if (!process.WaitForExit(5000))
                    {
                        throw new InvalidOperationException("El servidor no se detuvo dentro del tiempo esperado.");
                    }
                }
                if (File.Exists(pidFile)) File.Delete(pidFile);
            }
            catch (Exception error)
            {
                MessageBox.Show(error.Message, "Error al apagar", MessageBoxButtons.OK, MessageBoxIcon.Error);
                UpdateStatus();
                return false;
            }
            UpdateStatus();
            return true;
        }

        private void OpenApplication()
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "http://localhost:" + ServerPort,
                UseShellExecute = true
            });
        }

        private static string FindNode()
        {
            string commonPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
            if (File.Exists(commonPath)) return commonPath;

            string path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
            foreach (string folder in path.Split(Path.PathSeparator))
            {
                if (string.IsNullOrWhiteSpace(folder)) continue;
                string candidate = Path.Combine(folder.Trim(), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }

            throw new FileNotFoundException("No se encontró node.exe. Instalá Node.js o agregalo al PATH.");
        }
    }
}
