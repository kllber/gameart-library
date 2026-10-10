'use strict';

/**
 * platform.js —— 平台差异集中层（Windows / Linux）
 *
 * 目的：让上层模块（steam.js / steamwrite.js / workspace.js）**不再直接出现**
 *       「注册表 / tasklist / PowerShell / zenity」这类系统专属代码。
 *       将来接入 Electron、或新增 Linux 支持时，只改这一处。
 *
 * 导出：
 *   IS_WINDOWS / IS_LINUX / IS_MAC
 *   steamInstallCandidates()  -> 可能的 Steam 安装根目录（未做存在性校验）
 *   looksLikeSteamRoot(p)     -> 该目录是否像 Steam 安装根
 *   isSteamRunning()          -> Steam 客户端是否在运行（5s 缓存）
 *   pickOpenFile()            -> 原生「打开文件」对话框（.gameart）→ 路径或 null
 *   pickSaveFile(defaultName) -> 原生「保存文件」对话框 → 路径或 null
 *
 * 备注：接入 Electron 后，pickOpenFile/pickSaveFile 可优先改用 Electron 的
 *       dialog（跨平台、体验更好），届时只替换本文件里的实现即可。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const IS_MAC = process.platform === 'darwin';

/* ---------------- Steam 安装根目录探测 ---------------- */

function windowsRegistryValue(key, value) {
  try {
    const out = execFileSync('reg', ['query', key, '/v', value], { encoding: 'utf8', windowsHide: true });
    const m = out.match(new RegExp(value + '\\s+REG_SZ\\s+(.+)', 'i'));
    if (m) return m[1].trim();
  } catch (e) {
    /* ignore */
  }
  return null;
}

/**
 * 可能的 Steam 安装根目录（未做存在性校验，交给 looksLikeSteamRoot 判断）。
 * Windows：注册表 + 默认安装路径兜底（不再遍历所有盘）。
 * Linux  ：原生 Steam / Flatpak Steam / Snap Steam 的常见位置（Bazzite、SteamOS 等）。
 */
function steamInstallCandidates() {
  const out = [];
  if (IS_WINDOWS) {
    out.push(
      windowsRegistryValue('HKCU\\Software\\Valve\\Steam', 'SteamPath'),
      windowsRegistryValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'),
      windowsRegistryValue('HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'),
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam'
    );
  } else {
    const home = os.homedir();
    out.push(
      // 原生 Steam（~/.steam/steam 通常是指向 ~/.local/share/Steam 的软链接）
      path.join(home, '.steam', 'steam'),
      path.join(home, '.steam', 'root'),
      path.join(home, '.local', 'share', 'Steam'),
      // Flatpak Steam（Bazzite / SteamOS 常见）
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
      // Snap Steam
      path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam')
    );
  }
  return out.filter(Boolean);
}

/**
 * 是否像 Steam「安装根目录」。
 * 只认**安装标志**（steam.exe / steam.sh / userdata / appcache / config/loginusers.vdf），
 * 避免把「纯游戏库目录（只有 steamapps）」误判为安装。
 */
const STEAM_ROOT_MARKERS = ['steam.exe', 'steam.sh', 'userdata', 'appcache', path.join('config', 'loginusers.vdf')];
function looksLikeSteamRoot(p) {
  try {
    if (!fs.statSync(p).isDirectory()) return false;
  } catch (e) {
    return false;
  }
  for (const marker of STEAM_ROOT_MARKERS) {
    try {
      if (fs.existsSync(path.join(p, marker))) return true;
    } catch (e) {
      /* ignore */
    }
  }
  return false;
}

/* ---------------- Steam 是否运行（带 5s 缓存） ---------------- */

let _steamRunCache = { t: 0, v: false };

/** 无 pgrep 时的兜底：扫描 /proc 找进程名 */
function scanProcFor(name) {
  try {
    const pids = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n));
    for (const pid of pids) {
      try {
        const comm = fs.readFileSync(path.join('/proc', pid, 'comm'), 'utf8').trim();
        if (comm === name) return true;
      } catch (e) {
        /* 进程可能已退出 */
      }
    }
  } catch (e) {
    /* /proc 不可用 */
  }
  return false;
}

function isSteamRunning() {
  const now = Date.now();
  if (now - _steamRunCache.t < 5000) return _steamRunCache.v;
  let v = false;
  try {
    if (IS_WINDOWS) {
      const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      v = /steam\.exe/i.test(out);
    } else if (IS_LINUX) {
      try {
        execFileSync('pgrep', ['-x', 'steam'], { stdio: 'ignore' });
        v = true;
      } catch (e) {
        v = scanProcFor('steam');
      }
    }
  } catch (e) {
    v = false;
  }
  _steamRunCache = { t: now, v };
  return v;
}

/* ---------------- 原生文件对话框 ---------------- */

function runCaptured(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 180000, windowsHide: true });
    const p = (out || '').trim();
    return p || null;
  } catch (e) {
    return null;
  }
}

function hasCommand(cmd) {
  try {
    execFileSync('sh', ['-c', 'command -v ' + cmd], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/** 打开 .gameart：Windows 用 PowerShell+WinForms（TopMost 隐藏宿主保证置顶）；Linux 用 zenity/kdialog */
function pickOpenFile() {
  if (IS_WINDOWS) {
    const ps =
      "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; " +
      "$o = New-Object System.Windows.Forms.Form; $o.TopMost = $true; $o.ShowInTaskbar = $false; " +
      "$o.FormBorderStyle = 'None'; $o.Width = 1; $o.Height = 1; $o.StartPosition = 'CenterScreen'; $o.Show(); " +
      "$d = New-Object System.Windows.Forms.OpenFileDialog; " +
      "$d.Filter = 'GameArt 库 (*.gameart)|*.gameart|所有文件 (*.*)|*.*'; " +
      "$d.Title = '选择 .gameart 库文件'; " +
      "$r = $d.ShowDialog($o); $o.Close(); " +
      "if ($r -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.FileName) }";
    return runCaptured('powershell', ['-NoProfile', '-STA', '-Command', ps]);
  }
  if (hasCommand('zenity')) {
    return runCaptured('zenity', [
      '--file-selection',
      '--title=选择 .gameart 库文件',
      '--file-filter=GameArt 库 (*.gameart) | *.gameart',
      '--file-filter=所有文件 | *',
    ]);
  }
  if (hasCommand('kdialog')) {
    return runCaptured('kdialog', ['--getopenfilename', os.homedir(), '*.gameart|GameArt 库']);
  }
  return null;
}

/** 新建 .gameart：同上 */
function pickSaveFile(defaultName) {
  const name = defaultName || '我的游戏艺术库.gameart';
  if (IS_WINDOWS) {
    const ps =
      "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; " +
      "$o = New-Object System.Windows.Forms.Form; $o.TopMost = $true; $o.ShowInTaskbar = $false; " +
      "$o.FormBorderStyle = 'None'; $o.Width = 1; $o.Height = 1; $o.StartPosition = 'CenterScreen'; $o.Show(); " +
      "$d = New-Object System.Windows.Forms.SaveFileDialog; " +
      "$d.Filter = 'GameArt 库 (*.gameart)|*.gameart'; $d.DefaultExt = 'gameart'; " +
      "$d.FileName = '" + name + "'; $d.Title = '新建 .gameart 库文件'; " +
      "$r = $d.ShowDialog($o); $o.Close(); " +
      "if ($r -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.FileName) }";
    return runCaptured('powershell', ['-NoProfile', '-STA', '-Command', ps]);
  }
  if (hasCommand('zenity')) {
    return runCaptured('zenity', [
      '--file-selection',
      '--save',
      '--title=新建 .gameart 库文件',
      '--filename=' + path.join(os.homedir(), name),
      '--file-filter=GameArt 库 (*.gameart) | *.gameart',
    ]);
  }
  if (hasCommand('kdialog')) {
    return runCaptured('kdialog', ['--getsavefilename', path.join(os.homedir(), name), '*.gameart|GameArt 库']);
  }
  return null;
}

module.exports = {
  IS_WINDOWS,
  IS_LINUX,
  IS_MAC,
  steamInstallCandidates,
  looksLikeSteamRoot,
  isSteamRunning,
  pickOpenFile,
  pickSaveFile,
};
