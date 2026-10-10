'use strict';

/**
 * fileassoc.js —— 把 .gameart 关联到本软件
 *
 * - **Windows**：写 HKCU 注册表（无需管理员）。
 * - **Linux**：写 freedesktop 标准文件（无需 root）：
 *     ~/.local/share/applications/gameart-library.desktop   应用项（含 MimeType）
 *     ~/.local/share/mime/packages/gameart-library.xml      自定义 MIME application/x-gameart
 *     ~/.config/mimeapps.list                               默认关联
 *     ~/.local/share/icons/hicolor/256x256/{apps,mimetypes}/ 图标
 *   并（有则）刷新 `update-mime-database` / `update-desktop-database`；**命令缺失也能用**（只是极少数文件管理器要重新登录才认）。
 *
 * 关联后双击 .gameart 会用本软件打开该库文件（Electron 主进程从命令行参数取路径，见 desktop/main.js）。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, execFile } = require('child_process');
const platform = require('./platform');

const EXT = '.gameart';
const PROGID = 'GameArtLibrary.gameart';
const ROOT = path.resolve(__dirname, '..');

const MIME = 'application/x-gameart';
const MIME_ICON = MIME.replace(/\//g, '-'); // 图标文件名必须把 '/' 换成 '-'：application-x-gameart.png
const DESKTOP_ID = 'gameart-library.desktop';
const APP_ID = 'gameart-library';

/* ================= 通用 ================= */

function readText(p) {
  try {
    let t = fs.readFileSync(p, 'utf8');
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1); // 容错 BOM
    return t;
  } catch (e) {
    return '';
  }
}

/** 纯 fs 在 PATH 里找一个可执行文件（不 spawn，见 §10 #59） */
function findInPath(cmd) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d, cmd);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch (e) {
      /* ignore */
    }
  }
  return null;
}

/** 异步执行（**绝不用同步 spawn**，见 §10 #59） */
function runAsync(cmd, args, timeout) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeout || 15000, windowsHide: true }, (err) => resolve(!err));
    } catch (e) {
      resolve(false);
    }
  });
}

/* ================= Windows ================= */

function reg(args) {
  try {
    return execFileSync('reg', args, { encoding: 'utf8', windowsHide: true });
  } catch (e) {
    return null;
  }
}

function regAdd(key, value, type) {
  return reg(['add', key, '/ve', '/t', type || 'REG_SZ', '/d', value, '/f']);
}
function regQueryDefault(key) {
  const out = reg(['query', key, '/ve']);
  if (!out) return null;
  const m = out.match(/REG_SZ\s+(.+)/i);
  return m ? m[1].trim() : null;
}
function regDelete(key) {
  return reg(['delete', key, '/f']);
}

/** 运行本程序的可执行文件（便携版用 PORTABLE_EXECUTABLE_FILE，指向用户双击的 exe） */
function appExePath() {
  if (process.env.PORTABLE_EXECUTABLE_FILE) return process.env.PORTABLE_EXECUTABLE_FILE;
  return process.execPath;
}

/** 启动本软件的命令行（兼容开发版 / 便携分发版 / 打包后的 exe） */
function computeCommand() {
  // 便携分发版：用带图标的启动器 exe（由启动器把文件路径转发给 electron）
  if (process.env.GAMEART_LAUNCHER) {
    return '"' + process.env.GAMEART_LAUNCHER + '" "%1"';
  }
  // 打包后：exe 自己就是应用，直接接收文件路径
  if (process.versions.electron && !process.defaultApp) {
    return '"' + appExePath() + '" "%1"';
  }
  let exe = process.execPath; // 以 electron 运行时 = electron.exe
  if (!process.versions.electron) {
    const e2 = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
    if (fs.existsSync(e2)) exe = e2;
  }
  return '"' + exe + '" "' + ROOT + '" "%1"';
}

/** 返回用于注册的 .ico 路径；带内容哈希做副本，避免 Windows 图标缓存继续用旧图标 */
function iconPath() {
  const base = process.env.GAMEART_ICON_PATH || path.join(ROOT, 'icon-gameart.ico');
  try {
    const buf = fs.readFileSync(base);
    const h = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
    const target = path.join(path.dirname(base), 'icon-gameart-' + h + '.ico');
    if (!fs.existsSync(target) || fs.statSync(target).size !== buf.length) fs.writeFileSync(target, buf);
    return target;
  } catch (e) {
    return base;
  }
}

function windowsStatus() {
  const ext = regQueryDefault('HKCU\\Software\\Classes\\' + EXT);
  const cmd = regQueryDefault('HKCU\\Software\\Classes\\' + PROGID + '\\shell\\open\\command');
  return { supported: true, registered: ext === PROGID && !!cmd, ext, command: cmd, want: computeCommand(), icon: iconPath() };
}

function registerWindows() {
  regAdd('HKCU\\Software\\Classes\\' + EXT, PROGID);
  regAdd('HKCU\\Software\\Classes\\' + PROGID, '游戏艺术库 · GameArt Library 库文件');
  regAdd('HKCU\\Software\\Classes\\' + PROGID + '\\DefaultIcon', '"' + iconPath() + '"');
  regAdd('HKCU\\Software\\Classes\\' + PROGID + '\\shell\\open\\command', computeCommand());
  // 清理 Windows 图标缓存 + 通知刷新，让新图标尽快生效
  try {
    const local = process.env.LOCALAPPDATA;
    if (local) {
      try {
        fs.rmSync(path.join(local, 'IconCache.db'), { force: true });
      } catch (e) {
        /* ignore */
      }
      const expDir = path.join(local, 'Microsoft', 'Windows', 'Explorer');
      try {
        for (const f of fs.readdirSync(expDir)) {
          if (/^(iconcache|thumbcache)_/i.test(f)) {
            try {
              fs.rmSync(path.join(expDir, f), { force: true });
            } catch (e) {
              /* ignore */
            }
          }
        }
      } catch (e) {
        /* ignore */
      }
    }
    execFileSync('ie4uinit.exe', ['-show'], { windowsHide: true });
  } catch (e) {
    /* ignore */
  }
  return windowsStatus();
}

function unregisterWindows() {
  regDelete('HKCU\\Software\\Classes\\' + PROGID);
  if (regQueryDefault('HKCU\\Software\\Classes\\' + EXT) === PROGID) {
    regDelete('HKCU\\Software\\Classes\\' + EXT);
  }
  return windowsStatus();
}

/* ================= Linux（freedesktop 标准，无需 root） ================= */

function xdgDataHome() {
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
}
function xdgConfigHome() {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}
function xdgCacheHome() {
  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
}

function linuxPaths() {
  const data = xdgDataHome();
  return {
    appsDir: path.join(data, 'applications'),
    desktop: path.join(data, 'applications', DESKTOP_ID),
    mimeDir: path.join(data, 'mime'),
    mimeXml: path.join(data, 'mime', 'packages', APP_ID + '.xml'),
    appIcon: path.join(data, 'icons', 'hicolor', '256x256', 'apps', APP_ID + '.png'),
    mimeIcon: path.join(data, 'icons', 'hicolor', '256x256', 'mimetypes', MIME_ICON + '.png'),
    mimeapps: path.join(xdgConfigHome(), 'mimeapps.list'),
  };
}

/** 启动命令：便携/AppImage 用自身路径；开发版用 electron + 应用目录。`%U` = 传入的文件 */
function linuxExec() {
  if (process.env.APPIMAGE) return '"' + process.env.APPIMAGE + '" %U';
  if (process.env.GAMEART_LAUNCHER) return '"' + process.env.GAMEART_LAUNCHER + '" %U';
  let exe = process.execPath;
  if (!process.versions.electron) {
    const e2 = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron');
    if (fs.existsSync(e2)) exe = e2;
  }
  return '"' + exe + '" "' + ROOT + '" %U';
}

function linuxMimeXml() {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">\n' +
    '  <mime-type type="' + MIME + '">\n' +
    '    <comment>GameArt Library</comment>\n' +
    '    <comment xml:lang="zh_CN">游戏艺术库</comment>\n' +
    '    <glob pattern="*' + EXT + '"/>\n' +
    '    <icon name="' + MIME_ICON + '"/>\n' +
    '    <generic-icon name="' + MIME_ICON + '"/>\n' +
    '  </mime-type>\n' +
    '</mime-info>\n'
  );
}

function linuxDesktopFile() {
  return (
    [
      '[Desktop Entry]',
      'Type=Application',
      'Version=1.0',
      'Name=GameArt Library',
      'Name[zh_CN]=游戏艺术库',
      'Comment=Manage and sync custom game artwork to Steam',
      'Comment[zh_CN]=统一管理并配置你喜爱的自定义游戏艺术作品',
      'Exec=' + linuxExec(),
      'Icon=' + APP_ID,
      'Terminal=false',
      'Categories=Utility;Game;',
      'MimeType=' + MIME + ';',
      'StartupNotify=true',
      'StartupWMClass=' + APP_ID,
      '',
    ].join('\n')
  );
}

/** 在 mimeapps.list 的 [Default Applications] 里设置/移除某个 MIME 的默认程序 */
function setMimeappsDefault(file, mime, desktopId, enable) {
  const lines = readText(file).split(/\r?\n/).filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
  const keep = lines.filter((l) => !l.trim().startsWith(mime + '='));
  let out = keep;
  if (enable) {
    const idx = keep.findIndex((l) => l.trim() === '[Default Applications]');
    if (idx >= 0) keep.splice(idx + 1, 0, mime + '=' + desktopId);
    else out = keep.concat(['', '[Default Applications]', mime + '=' + desktopId]);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = out.join('\n').replace(/^\n+/, '').replace(/\n+$/, '') + '\n';
  fs.writeFileSync(file, text, 'utf8');
}

function mimeappsHasDefault(file, mime, desktopId) {
  return readText(file)
    .split(/\r?\n/)
    .some((l) => l.trim().toLowerCase() === (mime + '=' + desktopId).toLowerCase());
}

/** （可选）刷新 MIME / desktop 数据库；返回缺失命令的提示（命令缺失也能用） */
async function refreshLinuxDatabases(P) {
  const missing = [];
  const umd = findInPath('update-mime-database');
  if (umd) await runAsync(umd, [P.mimeDir]);
  else missing.push('update-mime-database');
  const udd = findInPath('update-desktop-database');
  if (udd) await runAsync(udd, [P.appsDir]);
  else missing.push('update-desktop-database');
  // 图标缓存刷新（很多系统本来就没装，缺失**不算** warning）
  const gic = findInPath('gtk-update-icon-cache');
  if (gic) {
    try {
      await runAsync(gic, ['-q', '-t', '-f', path.join(xdgDataHome(), 'icons', 'hicolor')]);
    } catch (e) {
      /* ignore */
    }
  }
  // KDE：必须重建 sycoca + 清图标缓存，否则 Dolphin 仍显示旧的默认图标
  if (/kde/i.test(process.env.XDG_CURRENT_DESKTOP || '')) {
    const kb = findInPath('kbuildsycoca6') || findInPath('kbuildsycoca5') || findInPath('kbuildsycoca');
    if (kb) {
      try {
        await runAsync(kb, ['--noincremental'], 30000);
      } catch (e) {
        /* ignore */
      }
    }
    try {
      fs.rmSync(path.join(xdgCacheHome(), 'icon-cache.kcache'), { force: true });
    } catch (e) {
      /* ignore */
    }
  }
  return missing.length ? '缺少命令：' + missing.join('、') + '（多数桌面仍可用，个别文件管理器需重新登录）' : null;
}

function linuxStatus() {
  const P = linuxPaths();
  const hasDesktop = fs.existsSync(P.desktop);
  const hasXml = fs.existsSync(P.mimeXml);
  const hasIcon = fs.existsSync(P.mimeIcon); // 文件类型图标是否已装（用于自动补装）
  const registered = hasDesktop && hasXml && mimeappsHasDefault(P.mimeapps, MIME, DESKTOP_ID);
  // 生成的文件是否与"当前版本应写的内容"一致（不一致 → 下次启动自动重写，用于自愈）
  let filesMatch = false;
  try {
    filesMatch = hasDesktop && hasXml && readText(P.desktop) === linuxDesktopFile() && readText(P.mimeXml) === linuxMimeXml();
  } catch (e) {
    filesMatch = false;
  }
  return {
    supported: true,
    registered,
    iconsInstalled: hasIcon,
    filesMatch,
    ext: EXT,
    command: linuxExec(),
    want: linuxExec(),
    icon: P.appIcon,
    desktopFile: P.desktop,
  };
}

/** 把 PNG 装进 hicolor 图标主题：应用图标（apps/）+ `.gameart` 文件类型图标（mimetypes/） */
function installLinuxIcons(P) {
  const appSrc = path.join(ROOT, 'public', 'icon.png');
  if (fs.existsSync(appSrc)) {
    try {
      fs.mkdirSync(path.dirname(P.appIcon), { recursive: true });
      fs.copyFileSync(appSrc, P.appIcon);
    } catch (e) {
      /* ignore */
    }
  }
  // 文件类型图标：优先多尺寸 public/fileicon/icon_<size>.png（tools/extract-ico.js 生成），否则退回 public/icon.png
  let installed = 0;
  const dir = path.join(ROOT, 'public', 'fileicon');
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = /^icon_(\d+)\.png$/i.exec(f);
      if (!m) continue;
      const s = m[1];
      const dest = path.join(xdgDataHome(), 'icons', 'hicolor', s + 'x' + s, 'mimetypes', MIME_ICON + '.png');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(dir, f), dest);
      installed++;
    }
  } catch (e) {
    /* ignore */
  }
  if (!installed && fs.existsSync(appSrc)) {
    try {
      fs.mkdirSync(path.dirname(P.mimeIcon), { recursive: true });
      fs.copyFileSync(appSrc, P.mimeIcon);
    } catch (e) {
      /* ignore */
    }
  }
  return installed;
}

async function registerLinux() {
  const P = linuxPaths();
  fs.mkdirSync(P.appsDir, { recursive: true });
  fs.mkdirSync(path.dirname(P.mimeXml), { recursive: true });
  installLinuxIcons(P);
  fs.writeFileSync(P.mimeXml, linuxMimeXml(), 'utf8');
  fs.writeFileSync(P.desktop, linuxDesktopFile(), 'utf8');
  try {
    fs.chmodSync(P.desktop, 0o755);
  } catch (e) {
    /* ignore */
  }
  setMimeappsDefault(P.mimeapps, MIME, DESKTOP_ID, true);
  const warning = await refreshLinuxDatabases(P);
  return { ...linuxStatus(), warning };
}

async function unregisterLinux() {
  const P = linuxPaths();
  try {
    fs.rmSync(P.desktop, { force: true });
  } catch (e) {
    /* ignore */
  }
  try {
    fs.rmSync(P.mimeXml, { force: true });
  } catch (e) {
    /* ignore */
  }
  setMimeappsDefault(P.mimeapps, MIME, DESKTOP_ID, false);
  // 清掉装过的图标（文件类型图标 + 应用图标）
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) {
    try {
      fs.rmSync(path.join(xdgDataHome(), 'icons', 'hicolor', s + 'x' + s, 'mimetypes', MIME_ICON + '.png'), { force: true });
    } catch (e) {
      /* ignore */
    }
  }
  try {
    fs.rmSync(P.appIcon, { force: true });
  } catch (e) {
    /* ignore */
  }
  const warning = await refreshLinuxDatabases(P);
  return { ...linuxStatus(), warning };
}

/* ================= 对外 ================= */

function getStatus() {
  if (platform.IS_WINDOWS) return windowsStatus();
  if (platform.IS_LINUX) return linuxStatus();
  return { supported: false, registered: false };
}

async function register() {
  if (platform.IS_WINDOWS) return registerWindows();
  if (platform.IS_LINUX) return registerLinux();
  throw new Error('文件关联目前仅支持 Windows / Linux');
}

async function unregister() {
  if (platform.IS_WINDOWS) return unregisterWindows();
  if (platform.IS_LINUX) return unregisterLinux();
  throw new Error('文件关联目前仅支持 Windows / Linux');
}

/**
 * **启动时自动关联**（仅桌面版调用）：未关联、或启动命令变了才写；已关联则什么都不做。
 * 这样用户**不需要手动点**「关联到本软件」（Windows 与 Linux 一致）。
 */
async function autoRegister() {
  try {
    const s = getStatus();
    if (!s.supported) return { ok: false, skipped: 'unsupported' };
    // 已关联、图标在、生成文件也与当前版本一致、命令没变 → 什么都不做；
    // 否则重写一遍（自愈：补装图标 / 修正移动后的路径 / 修正生成文件的笔误）
    if (s.registered && s.iconsInstalled !== false && s.filesMatch !== false && (!s.want || s.command === s.want)) {
      return { ok: true, skipped: 'already' };
    }
    const r = await register();
    return { ok: true, registered: !!r.registered, warning: r.warning || null };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

module.exports = { getStatus, register, unregister, autoRegister, computeCommand, iconPath, PROGID, EXT, MIME, DESKTOP_ID, linuxPaths };
