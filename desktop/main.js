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
const net = require('net');
const http = require('http');
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');

let mainWindow = null;
let backendPort = 0;

/* ---------------- 便携版（分发版本）：可写目录一律放程序目录内，绝不写 C 盘 ---------------- */
const PORTABLE = process.env.GAMEART_PORTABLE === '1';
if (PORTABLE && !app.isPackaged) {
  try {
    const distRoot = process.env.GAMEART_PORTABLE_ROOT || path.resolve(__dirname, '..', '..');
    const dataDir = process.env.GAMEART_DATA_DIR || path.join(distRoot, 'data');
    const tmpDir = process.env.GAMEART_TMP_DIR || path.join(distRoot, 'tmp');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    process.env.GAMEART_DATA_DIR = dataDir;
    process.env.GAMEART_TMP_DIR = tmpDir;
    // Chromium/Electron 的缓存、临时、崩溃转储也放程序目录（默认会去 %APPDATA%）
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
  // 打包后程序目录是只读的 asar：把可写的数据/临时目录指到用户数据目录
  if (app.isPackaged) {
    const base = app.getPath('userData');
    process.env.GAMEART_DATA_DIR = path.join(base, 'data');
    process.env.GAMEART_TMP_DIR = path.join(base, 'tmp');
    try {
      const src = path.join(process.resourcesPath, 'icon-gameart.ico');
      const dst = path.join(base, 'icon-gameart.ico');
      fs.copyFileSync(src, dst);
      process.env.GAMEART_ICON_PATH = dst;
    } catch (e) {
      /* ignore */
    }
  }
  require('../src/server.js');
  await waitForServer(port);
  return port;
}

/* ---------------- 创建窗口 ---------------- */
function createWindow(port) {
  const iconPath = path.join(__dirname, 'icon.ico');
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0a0c12',
    title: '游戏艺术库 · GameArt Library',
    autoHideMenuBar: true,
    show: false,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
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

/* ---------------- 生命周期 ---------------- */
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // 去掉默认菜单栏
  try {
    backendPort = await startBackend();
    const f = pickGameartArg(process.argv); // 双击 .gameart 打开
    if (f) await httpPostJson(backendPort, '/api/workspace/open', { path: f });
    createWindow(backendPort);
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
