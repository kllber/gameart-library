'use strict';

/**
 * desktop/main.js —— Electron 外壳（主进程）
 *
 * 作用：把现有的「本地 Node 服务 + 网页界面」装进一个原生窗口。
 *   - 用随机空闲端口启动内部服务（不写死 5178，避免与其它实例冲突）
 *   - 打开一个原生窗口指向该服务（用户看到的就是一个独立应用窗口）
 *   - 单实例：第二次启动只聚焦已有窗口（不再出现「端口被占用」）
 *   - 去掉默认菜单栏，界面更接近原生
 *
 * 说明：
 *   - 复用现有 src/ 与 public/，不改业务代码。
 *   - 未来打包（electron-builder）时，data/ 这类可写目录需改到 app.getPath('userData')，
 *     因为打包后 app 目录是只读的 asar。见注释 [PACKAGING]。
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');

let mainWindow = null;
let backendPort = 0;

/* ---------------- 可写目录：便携优先（Windows 便携版 / Linux AppImage 都放"程序所在文件夹"） ---------------- */
const PORTABLE = process.env.GAMEART_PORTABLE === '1';

/** 便携版根目录：显式指定 > AppImage 所在目录 > 应用目录的上一级 */
function portableRoot() {
  if (process.env.GAMEART_PORTABLE_ROOT) return process.env.GAMEART_PORTABLE_ROOT;
  if (process.env.APPIMAGE) {
    try {
      return path.dirname(process.env.APPIMAGE);
    } catch (e) {
      /* ignore */
    }
  }
  return path.resolve(__dirname, '..', '..');
}

/** Linux 旧版把数据放在 XDG 目录：首次便携运行时**整体搬过来**（同盘 rename = 瞬间；失败就跳过） */
function migrateXdgDataInto(dataDir) {
  if (process.platform !== 'linux') return;
  try {
    if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length) return; // 已有内容 → 不动
    const xdgBase = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const old = path.join(xdgBase, 'gameart-library');
    if (!fs.existsSync(old) || !fs.readdirSync(old).length) return;
    fs.renameSync(old, dataDir);
  } catch (e) {
    /* 跨盘/权限等原因 → 放弃（不回退，继续用便携目录；旧数据仍在原处，用户可自行删除） */
  }
}

/**
 * 启用"便携模式"：data/ 与 tmp/ 放在**程序所在文件夹**内（移动文件夹即整体搬走）。
 * - Windows 便携版一直如此；
 * - Linux AppImage：v1.1.0 起也如此（用 `$APPIMAGE` 定位自身；移动后自动用新位置）。
 * **可写性自检**：只读位置（如解压到只读目录）会抛错 → 调用方忽略，回退到 XDG。
 */
function enablePortable(root) {
  const dataDir = process.env.GAMEART_DATA_DIR || path.join(root, 'data');
  const tmpDir = process.env.GAMEART_TMP_DIR || path.join(root, 'tmp');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const probe = path.join(dataDir, '.write-test');
  fs.writeFileSync(probe, 'ok'); // 不可写就抛错（调用方回退）
  fs.rmSync(probe, { force: true });
  migrateXdgDataInto(dataDir);
  process.env.GAMEART_DATA_DIR = dataDir;
  process.env.GAMEART_TMP_DIR = tmpDir;
  // Chromium/Electron 的缓存、临时、崩溃转储也放程序目录（默认会去 %APPDATA% / ~/.config）
  app.setPath('userData', path.join(dataDir, 'electron'));
  try {
    app.setPath('sessionData', path.join(dataDir, 'electron'));
  } catch (e) {
    /* ignore */
  }
  try {
    app.setPath('temp', tmpDir);
  } catch (e) {
    /* ignore */
  }
  try {
    app.setPath('crashDumps', path.join(dataDir, 'electron', 'crash'));
  } catch (e) {
    /* ignore */
  }
}

if (PORTABLE || process.env.APPIMAGE) {
  try {
    enablePortable(portableRoot());
  } catch (e) {
    // 只读/不可写 → 什么都不设，走后面的 XDG 分支（打包版默认行为）
  }
}

// Linux：让 Electron 自适应 Wayland / X11，并让窗口的 app_id / WM_CLASS
// 与 .desktop 文件名一致（否则任务栏/停靠栏对不上图标，会显示成默认图标）
if (process.platform === 'linux') {
  try {
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    app.commandLine.appendSwitch('class', 'gameart-library');
  } catch (e) {
    /* ignore */
  }
}

/** 从命令行参数里找 .gameart 路径（双击关联文件时由系统传入） */
function pickGameartArg(argv) {
  if (!Array.isArray(argv)) return null;
  for (const a of argv) {
    if (typeof a === 'string' && /\.gameart$/i.test(a)) {
      try {
        if (fs.existsSync(a)) return a;
      } catch (e) {
        /* ignore */
      }
    }
  }
  return null;
}

/** 向后端 POST JSON（用于"打开某个库"） */
function httpPostJson(port, pathName, obj) {
  return new Promise((resolve) => {
    try {
      const data = Buffer.from(JSON.stringify(obj || {}));
      const req = http.request(
        { host: '127.0.0.1', port, path: pathName, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode === 200));
        }
      );
      req.on('error', () => resolve(false));
      req.write(data);
      req.end();
    } catch (e) {
      resolve(false);
    }
  });
}

/** 在已运行的窗口里打开某个库（第二实例/双击文件时） */
async function openLibraryInWindow(file) {
  if (!backendPort || !mainWindow) return;
  const ok = await httpPostJson(backendPort, '/api/workspace/open', { path: file });
  if (ok && mainWindow) {
    try {
      mainWindow.loadURL('http://127.0.0.1:' + backendPort);
    } catch (e) {
      /* ignore */
    }
  }
}

/* ---------------- 单实例 ---------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const f = pickGameartArg(argv);
    if (f) openLibraryInWindow(f);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/* ---------------- 找一个空闲端口 ---------------- */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

/* ---------------- 等后端就绪 ---------------- */
function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 20000);
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/workspace', timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('本地服务启动超时'));
        else setTimeout(tryOnce, 200);
      });
      req.on('timeout', () => req.destroy());
    };
    tryOnce();
  });
}

/* ---------------- 启动内部后端 ---------------- */
async function startBackend() {
  const port = await findFreePort();
  process.env.NO_OPEN = '1'; // 不要用系统浏览器打开
  process.env.PORT = String(port);
  // 打包后程序目录只读（asar / AppImage 的 squashfs）：把可写目录指到用户可写处
  // ⚠️ 若便携模式（Windows 便携版 / Linux AppImage）已经设过 GAMEART_DATA_DIR，这里**不要覆盖**
  if (app.isPackaged && !process.env.GAMEART_DATA_DIR) {
    let dataBase;
    let tmpBase;
    if (process.platform === 'linux') {
      const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
      const xdgCache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
      dataBase = path.join(xdgData, 'gameart-library');
      tmpBase = path.join(xdgCache, 'gameart-library');
    } else {
      dataBase = path.join(app.getPath('userData'), 'data');
      tmpBase = path.join(app.getPath('userData'), 'tmp');
    }
    try {
      fs.mkdirSync(dataBase, { recursive: true });
      fs.mkdirSync(tmpBase, { recursive: true });
    } catch (e) {
      /* ignore */
    }
    process.env.GAMEART_DATA_DIR = dataBase;
    process.env.GAMEART_TMP_DIR = tmpBase;
    // .gameart 文件图标（仅 Windows 的文件关联需要）
    if (process.platform === 'win32') {
      try {
        const src = path.join(process.resourcesPath, 'icon-gameart.ico');
        const dst = path.join(app.getPath('userData'), 'icon-gameart.ico');
        fs.copyFileSync(src, dst);
        process.env.GAMEART_ICON_PATH = dst;
      } catch (e) {
        /* ignore */
      }
    }
  }
  require('../src/server.js');
  await waitForServer(port);
  return port;
}

/* ---------------- 创建窗口 ---------------- */

/** 窗口图标：Linux 用 PNG（.ico 在 Linux 上无效），其余用 .ico */
function windowIconPath() {
  if (process.platform === 'linux') {
    const png = path.join(__dirname, '..', 'public', 'icon.png');
    if (fs.existsSync(png)) return png;
  }
  const ico = path.join(__dirname, 'icon.ico');
  return fs.existsSync(ico) ? ico : null;
}

function createWindow(port) {
  const iconPath = windowIconPath();
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0a0c12',
    title: '游戏艺术库 · GameArt Library',
    autoHideMenuBar: true,
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.loadURL('http://127.0.0.1:' + port);

  // 外部链接（如申请 API Key）用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 开发调试：F12 打开 DevTools；Ctrl+R 刷新页面
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    } else if (input.control && (input.key === 'r' || input.key === 'R')) {
      win.webContents.reload();
      event.preventDefault();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // 开发调试：把窗口内画面/执行 JS 暴露给本地后端（仅 127.0.0.1，用于自检 UI）
  try {
    global.__electronDev = {
      capture: async () => (await win.webContents.capturePage()).toPNG().toString('base64'),
      eval: (code) => win.webContents.executeJavaScript(String(code), true),
    };
  } catch (e) {
    /* ignore */
  }

  return win;
}

/* ---------------- 首次运行：询问是否创建桌面快捷方式（Linux / AppImage） ---------------- */
async function maybeOfferDesktopShortcut() {
  if (process.platform !== 'linux' || !process.env.APPIMAGE) return; // 只对「解压即用」的 AppImage 分发做
  const dataDir = process.env.GAMEART_DATA_DIR || app.getPath('userData');
  const marker = path.join(dataDir, '.shortcut-asked');
  try {
    if (fs.existsSync(marker)) return;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8');
  } catch (e) {
    return;
  }
  try {
    const r = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'question',
      buttons: ['创建', '暂不'],
      defaultId: 0,
      cancelId: 1,
      title: '游戏艺术库',
      message: '要在桌面创建一个「游戏艺术库」快捷方式吗？',
      detail: '创建后可从桌面直接双击打开。\n也可以随时在开始菜单里找到「游戏艺术库」（右键可固定到任务栏）。',
      noLink: true,
    });
    if (r.response === 0) {
      const fileassoc = require('../src/fileassoc');
      const res = await fileassoc.createDesktopShortcut();
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'info',
        buttons: ['好'],
        title: '游戏艺术库',
        message: '已创建桌面快捷方式',
        detail: res.path,
        noLink: true,
      });
    }
  } catch (e) {
    /* ignore */
  }
}

/* ---------------- 生命周期 ---------------- */
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // 去掉默认菜单栏

  // 原生文件对话框交给 Electron（随包、跨平台、最稳）；platform.js 会**优先**用它
  const parentWin = () => mainWindow || BrowserWindow.getAllWindows()[0] || null;
  global.__gameartDialog = {
    open: async () => {
      const opts = {
        title: '选择 .gameart 库文件',
        filters: [
          { name: 'GameArt 库', extensions: ['gameart'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile'],
      };
      const w = parentWin();
      const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts);
      return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
    },
    save: async (defaultName) => {
      const opts = {
        title: '新建 .gameart 库文件',
        defaultPath: defaultName || '我的游戏艺术库.gameart',
        filters: [{ name: 'GameArt 库', extensions: ['gameart'] }],
      };
      const w = parentWin();
      const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts);
      return r.canceled || !r.filePath ? null : r.filePath;
    },
  };

  try {
    backendPort = await startBackend();
    const f = pickGameartArg(process.argv); // 双击 .gameart 打开
    if (f) await httpPostJson(backendPort, '/api/workspace/open', { path: f });
    createWindow(backendPort);

    // 默认自动关联 .gameart（未关联 / 安装位置变了才写），用户无需手动点「关联到本软件」
    try {
      const fileassoc = require('../src/fileassoc');
      fileassoc
        .autoRegister()
        .then((r) => {
          if (r && r.ok && !r.skipped) console.log('[assoc] 已自动关联 .gameart' + (r.warning ? '（' + r.warning + '）' : ''));
        })
        .catch(() => {});
    } catch (e) {
      /* ignore */
    }

    // 首次运行（仅 Linux 的 AppImage 分发）：问一次要不要创建桌面快捷方式
    setTimeout(() => {
      maybeOfferDesktopShortcut().catch(() => {});
    }, 1500);
  } catch (e) {
    dialog.showErrorBox('启动失败', String((e && e.message) || e));
    app.quit();
    return;
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && backendPort) createWindow(backendPort);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
