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
const { execFile } = require('child_process');
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

/** **异步** 版注册表操作（`reg`）：
 *  ⚠️ 以前用 `execFileSync`，它会在**Electron 主进程**里同步阻塞 100~300ms/次；
 *  设置页每次打开都要查 2 次 → 窗口卡顿。凡是"外部进程"一律异步（见 §10 #79/#82）。 */
function regAsync(args, timeout) {
  return new Promise((resolve) => {
    try {
      execFile('reg', args, { encoding: 'utf8', windowsHide: true, timeout: timeout || 8000 }, (err, stdout) => {
        resolve(err ? null : String(stdout || ''));
      });
    } catch (e) {
      resolve(null);
    }
  });
}
async function regAdd(key, value, type) {
  return regAsync(['add', key, '/ve', '/t', type || 'REG_SZ', '/d', value, '/f']);
}
async function regQueryDefault(key) {
  const out = await regAsync(['query', key, '/ve']);
  if (!out) return null;
  const m = out.match(/REG_SZ\s+(.+)/i);
  return m ? m[1].trim() : null;
}
async function regDelete(key) {
  return regAsync(['delete', key, '/f']);
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

async function windowsStatus() {
  const ext = await regQueryDefault('HKCU\\Software\\Classes\\' + EXT);
  const cmd = await regQueryDefault('HKCU\\Software\\Classes\\' + PROGID + '\\shell\\open\\command');
  return { supported: true, registered: ext === PROGID && !!cmd, ext, command: cmd, want: computeCommand(), icon: iconPath() };
}

async function registerWindows() {
  await regAdd('HKCU\\Software\\Classes\\' + EXT, PROGID);
  await regAdd('HKCU\\Software\\Classes\\' + PROGID, '游戏艺术库 · GameArt Library 库文件');
  await regAdd('HKCU\\Software\\Classes\\' + PROGID + '\\DefaultIcon', '"' + iconPath() + '"');
  await regAdd('HKCU\\Software\\Classes\\' + PROGID + '\\shell\\open\\command', computeCommand());
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
    await runAsync('ie4uinit.exe', ['-show'], 10000); // 通知刷新（异步，别阻塞主进程；见 §10 #79/#82）
  } catch (e) {
    /* ignore */
  }
  return windowsStatus();
}

async function unregisterWindows() {
  await regDelete('HKCU\\Software\\Classes\\' + PROGID);
  if ((await regQueryDefault('HKCU\\Software\\Classes\\' + EXT)) === PROGID) {
    await regDelete('HKCU\\Software\\Classes\\' + EXT);
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

/** 把 `<srcDir>/icon_<N>.png` 全部装进 `hicolor/<N>x<N>/<context>/<baseName>.png`；返回安装数量 */
function installIconSet(srcDir, context, baseName) {
  let n = 0;
  try {
    for (const f of fs.readdirSync(srcDir)) {
      const m = /^icon_(\d+)\.png$/i.exec(f);
      if (!m) continue;
      const s = m[1];
      const dest = path.join(xdgDataHome(), 'icons', 'hicolor', s + 'x' + s, context, baseName + '.png');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(srcDir, f), dest);
      n++;
    }
  } catch (e) {
    /* ignore */
  }
  return n;
}

/** 把 PNG 装进 hicolor 图标主题：应用图标（apps/）+ `.gameart` 文件类型图标（mimetypes/） */
function installLinuxIcons(P) {
  // 应用图标：优先多尺寸 public/appicon/icon_<N>.png，否则退回 public/icon.png（256）
  const appIconSrc = path.join(ROOT, 'public', 'icon.png');
  if (!installIconSet(path.join(ROOT, 'public', 'appicon'), 'apps', APP_ID) && fs.existsSync(appIconSrc)) {
    try {
      fs.mkdirSync(path.dirname(P.appIcon), { recursive: true });
      fs.copyFileSync(appIconSrc, P.appIcon);
    } catch (e) {
      /* ignore */
    }
  }
  // 文件类型图标：优先多尺寸 public/fileicon/icon_<N>.png，否则退回 public/icon.png
  if (!installIconSet(path.join(ROOT, 'public', 'fileicon'), 'mimetypes', MIME_ICON) && fs.existsSync(appIconSrc)) {
    try {
      fs.mkdirSync(path.dirname(P.mimeIcon), { recursive: true });
      fs.copyFileSync(appIconSrc, P.mimeIcon);
    } catch (e) {
      /* ignore */
    }
  }
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
  // 清掉装过的图标（文件类型图标 + 应用图标，各尺寸）
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) {
    for (const ctx of ['mimetypes', 'apps']) {
      const name = ctx === 'apps' ? APP_ID + '.png' : MIME_ICON + '.png';
      try {
        fs.rmSync(path.join(xdgDataHome(), 'icons', 'hicolor', s + 'x' + s, ctx, name), { force: true });
      } catch (e) {
        /* ignore */
      }
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

/** 桌面目录（优先读 XDG user-dirs 配置；兼容中文/日文的桌面文件夹名） */
function desktopDir() {
  try {
    const t = readText(path.join(xdgConfigHome(), 'user-dirs.dirs'));
    const m = /XDG_DESKTOP_DIR="([^"]*)"/.exec(t);
    if (m) return m[1].replace(/^\$HOME/, os.homedir());
  } catch (e) {
    /* ignore */
  }
  for (const c of ['Desktop', '桌面', 'デスクトップ']) {
    const p = path.join(os.homedir(), c);
    try {
      if (fs.statSync(p).isDirectory()) return p;
    } catch (e) {
      /* ignore */
    }
  }
  return path.join(os.homedir(), 'Desktop');
}

/**
 * Linux：在桌面创建一个「游戏艺术库」快捷方式（复制已安装的 .desktop）。
 * 会先确保关联/图标已就绪。
 */
async function createDesktopShortcut() {
  if (!platform.IS_LINUX) throw new Error('创建桌面快捷方式仅支持 Linux');
  let st = linuxStatus();
  if (!st.registered || st.filesMatch === false || st.iconsInstalled === false) {
    await registerLinux();
    st = linuxStatus();
  }
  if (!fs.existsSync(st.desktopFile)) throw new Error('桌面项尚未生成');
  const dir = desktopDir();
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, '游戏艺术库.desktop');
  fs.copyFileSync(st.desktopFile, dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch (e) {
    /* ignore */
  }
  return { ok: true, path: dest };
}

/* ================= 对外 ================= */

/** **异步**（Windows 分支要查注册表）：调用方请 `await`。见 §10 #79/#82 */
async function getStatus() {
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
    const s = await getStatus();
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

module.exports = { getStatus, register, unregister, autoRegister, createDesktopShortcut, computeCommand, iconPath, PROGID, EXT, MIME, DESKTOP_ID, linuxPaths };
