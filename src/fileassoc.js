'use strict';

/**
 * fileassoc.js —— 把 .gameart 关联到本软件（仅 Windows；写 HKCU，无需管理员）
 *
 * 关联后双击 .gameart 会用本软件打开该库文件。
 * 命令形如：  "<electron.exe 或 打包exe>" "<应用目录>" "%1"
 * （Electron 主进程会从命令行参数里取 .gameart 路径并打开，见 desktop/main.js）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const platform = require('./platform');

const EXT = '.gameart';
const PROGID = 'GameArtLibrary.gameart';
const ROOT = path.resolve(__dirname, '..');

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

function getStatus() {
  if (!platform.IS_WINDOWS) return { supported: false, registered: false };
  const ext = regQueryDefault('HKCU\\Software\\Classes\\' + EXT);
  const cmd = regQueryDefault('HKCU\\Software\\Classes\\' + PROGID + '\\shell\\open\\command');
  return { supported: true, registered: ext === PROGID && !!cmd, ext, command: cmd, want: computeCommand(), icon: iconPath() };
}

function register() {
  if (!platform.IS_WINDOWS) throw new Error('文件关联目前仅支持 Windows');
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
  return getStatus();
}

function unregister() {
  if (!platform.IS_WINDOWS) throw new Error('文件关联目前仅支持 Windows');
  regDelete('HKCU\\Software\\Classes\\' + PROGID);
  if (regQueryDefault('HKCU\\Software\\Classes\\' + EXT) === PROGID) {
    regDelete('HKCU\\Software\\Classes\\' + EXT);
  }
  return getStatus();
}

module.exports = { getStatus, register, unregister, computeCommand, iconPath, PROGID, EXT };
