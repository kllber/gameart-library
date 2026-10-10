using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

// GameArt Library portable launcher.
// - Branded exe (icon baked in via csc /win32icon).
// - Sets portable env vars so ALL caches/data go inside the distribution folder (never C:).
// - Forwards a double-clicked .gameart path to the Electron runtime.
class Program
{
    [STAThread]
    static void Main(string[] argv)
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string exe = Path.Combine(baseDir, "runtime", "electron.exe");
        string appDir = Path.Combine(baseDir, "app");
        if (!File.Exists(exe) || !Directory.Exists(appDir))
        {
            MessageBox.Show(
                "Missing runtime\\electron.exe or app folder.\r\nThe distribution folder may be incomplete.",
                "GameArt Library", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        string self = Process.GetCurrentProcess().MainModule.FileName;

        string args = "\"" + appDir + "\"";
        foreach (string a in argv)
        {
            if (a == null) continue;
            string t = a.Trim();
            if (t.Length == 0) continue;
            args += " \"" + t.Replace("\"", "") + "\"";
        }

        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(exe, args);
            psi.UseShellExecute = false;
            psi.WorkingDirectory = baseDir;
            psi.EnvironmentVariables["GAMEART_PORTABLE"] = "1";
            psi.EnvironmentVariables["GAMEART_PORTABLE_ROOT"] = baseDir;
            psi.EnvironmentVariables["GAMEART_DATA_DIR"] = Path.Combine(baseDir, "data");
            psi.EnvironmentVariables["GAMEART_TMP_DIR"] = Path.Combine(baseDir, "tmp");
            psi.EnvironmentVariables["GAMEART_LAUNCHER"] = self;
            psi.EnvironmentVariables["NO_OPEN"] = "1";
            Process p = Process.Start(psi);
            p.WaitForExit();
        }
        catch (Exception e)
        {
            MessageBox.Show("Failed to start: " + e.Message, "GameArt Library",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
