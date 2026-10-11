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
const { execFile } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const IS_MAC = process.platform === 'darwin';

/* ---------------- Steam 安装根目录探测 ---------------- */

const WIN_FALLBACK = ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'];
let _winCands = null; // 注册表预取结果（null = 还没取到）
let _prefetch = null;

/**
 * 异步读一个注册表值。
 * ⚠️ 以前用 `execFileSync`：每次 `reg query` 会在**主进程**同步阻塞 100~300ms，
 * 而启动时一口气查 3 次 → 用户第一次操作时窗口明显卡顿。现在一律异步（见 §10 #82）。
 */
function windowsRegistryValue(key, value) {
  return new Promise((resolve) => {
    try {
      execFile(
        'reg',
        ['query', key, '/v', value],
        { encoding: 'utf8', windowsHide: true, timeout: 8000 },
        (err, stdout) => {
          if (err) return resolve(null);
          const m = String(stdout || '').match(new RegExp(value + '\\s+REG_SZ\\s+(.+)', 'i'));
          resolve(m ? m[1].trim() : null);
        }
      );
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * **启动时预取** Windows 注册表里的 Steam 安装路径（只跑一次，异步、不阻塞）。
 * `server.js` 与 `desktop/main.js` 在启动阶段调用；请求路径上再 `await` 一次即可（已就绪时立即返回）。
 */
function prefetchSteamCandidates() {
  if (!IS_WINDOWS) return Promise.resolve(null);
  if (_winCands) return Promise.resolve(_winCands);
  if (_prefetch) return _prefetch;
  _prefetch = (async () => {
    const vals = await Promise.all([
      windowsRegistryValue('HKCU\\Software\\Valve\\Steam', 'SteamPath'),
      windowsRegistryValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'),
      windowsRegistryValue('HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'),
    ]);
    _winCands = [...vals.filter(Boolean), ...WIN_FALLBACK];
    return _winCands;
  })();
  return _prefetch;
}

/**
 * 可能的 Steam 安装根目录（未做存在性校验，交给 looksLikeSteamRoot 判断）。
 * Windows：注册表（**预取缓存**）+ 默认安装路径兜底（不再遍历所有盘）。
 * Linux  ：原生 Steam / Flatpak Steam / Snap Steam 的常见位置（Bazzite、SteamOS 等）。
 */
function steamInstallCandidates() {
  const out = [];
  if (IS_WINDOWS) {
    out.push(...(_winCands || WIN_FALLBACK));
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

/* ---------------- 异步执行命令（**只用 execFile，绝不 spawnSync**，见 §10 #59） ---------------- */

/** 异步执行命令并捕获 stdout；失败/无输出返回 null */
function runAsync(cmd, args, timeout) {
  return new Promise((resolve) => {
    try {
      execFile(
        cmd,
        args,
        { encoding: 'utf8', timeout: timeout || 180000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => {
          if (err) return resolve(null);
          const p = String(stdout || '').trim();
          resolve(p || null);
        }
      );
    } catch (e) {
      resolve(null);
    }
  });
}

/* ---------------- Steam 是否运行（**异步** + 5s 缓存） ---------------- */

let _steamRunCache = { t: 0, v: false };
let _steamRunInflight = null;

/** 无 pgrep 时的兜底：扫描 /proc 找进程名（Linux 必有 /proc，不依赖外部命令） */
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

/** Linux：pgrep → flatpak ps → 纯 Node 扫 /proc（无外部依赖兜底） */
async function isSteamRunningLinux() {
  if (await runAsync('pgrep', ['-x', 'steam'], 5000)) return true;
  if (await runAsync('pgrep', ['-x', 'steamwebhelper'], 5000)) return true;
  const fp = await runAsync('flatpak', ['ps'], 5000); // Flatpak 版 Steam
  if (fp && /com\.valvesoftware\.Steam/.test(fp)) return true;
  return scanProcFor('steam') || scanProcFor('steamwebhelper');
}

/** Steam 客户端是否在运行（**异步**；5s 缓存 + 并发合并） */
async function isSteamRunning() {
  const now = Date.now();
  if (now - _steamRunCache.t < 5000) return _steamRunCache.v;
  if (_steamRunInflight) return _steamRunInflight; // 并发调用合并为一次
  _steamRunInflight = (async () => {
    let v = false;
    try {
      if (IS_WINDOWS) {
        const out = await runAsync('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], 8000);
        v = !!(out && /steam\.exe/i.test(out));
      } else if (IS_LINUX) {
        v = await isSteamRunningLinux();
      }
    } catch (e) {
      v = false;
    }
    _steamRunCache = { t: Date.now(), v };
    _steamRunInflight = null;
    return v;
  })();
  return _steamRunInflight;
}

/* ---------------- 原生文件对话框（**异步**；优先 Electron dialog） ---------------- */
// 优先用 Electron 自带 dialog（随包、跨平台、最稳）；浏览器版/无 Electron 时回退：
//   Linux → zenity / kdialog；Windows → PowerShell + WinForms（TopMost 隐藏宿主保证置顶）。
// **全部异步**（见 §10 #59）。

/** Electron 主进程注入的对话框能力（desktop/main.js 设置；浏览器版为 null） */
function electronDialog() {
  return typeof global !== 'undefined' && global.__gameartDialog ? global.__gameartDialog : null;
}

/** 打开 .gameart → 路径或 null */
function pickOpenFile() {
  const d = electronDialog();
  if (d && typeof d.open === 'function') {
    try {
      return Promise.resolve(d.open())
        .then((p) => (p ? String(p) : null))
        .catch(() => null);
    } catch (e) {
      /* 退回系统命令 */
    }
  }
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
    return runAsync('powershell', ['-NoProfile', '-STA', '-Command', ps], 180000);
  }
  return (async () => {
    const z = await runAsync(
      'zenity',
      [
        '--file-selection',
        '--title=选择 .gameart 库文件',
        '--file-filter=GameArt 库 (*.gameart) | *.gameart',
        '--file-filter=所有文件 | *',
      ],
      180000
    );
    if (z) return z;
    return runAsync('kdialog', ['--getopenfilename', os.homedir(), '*.gameart|GameArt 库'], 180000);
  })();
}

/** 新建 .gameart → 路径或 null */
function pickSaveFile(defaultName) {
  const name = defaultName || '我的游戏艺术库.gameart';
  const d = electronDialog();
  if (d && typeof d.save === 'function') {
    try {
      return Promise.resolve(d.save(name))
        .then((p) => (p ? String(p) : null))
        .catch(() => null);
    } catch (e) {
      /* 退回系统命令 */
    }
  }
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
    return runAsync('powershell', ['-NoProfile', '-STA', '-Command', ps], 180000);
  }
  return (async () => {
    const z = await runAsync(
      'zenity',
      [
        '--file-selection',
        '--save',
        '--title=新建 .gameart 库文件',
        '--filename=' + path.join(os.homedir(), name),
        '--file-filter=GameArt 库 (*.gameart) | *.gameart',
      ],
      180000
    );
    if (z) return z;
    return runAsync('kdialog', ['--getsavefilename', path.join(os.homedir(), name), '*.gameart|GameArt 库'], 180000);
  })();
}

module.exports = {
  IS_WINDOWS,
  IS_LINUX,
  IS_MAC,
  steamInstallCandidates,
  prefetchSteamCandidates,
  looksLikeSteamRoot,
  isSteamRunning,
  pickOpenFile,
  pickSaveFile,
};
