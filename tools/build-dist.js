'use strict';

/**
 * tools/build-dist.js —— 组装「分发版本」（便携、免安装）
 *
 * 产出目录结构：
 *   分发版本/
 *     游戏艺术库.exe        ← 带图标的启动器（csc 编译，启动时设定便携目录）
 *     runtime/             ← 打包好的 Electron 运行时（无需安装 Node/依赖）
 *     app/                 ← 本软件本体（零依赖：src/ + public/ + desktop/ + package.json）
 *     data/ · tmp/         ← 运行时可写目录（缓存/临时，都在这里，不写 C 盘）
 *     分发说明（先看我）.txt
 *
 * 用法： dev.cmd node tools\build-dist.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, '分发版本');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');

function log(m) {
  console.log('[build-dist] ' + m);
}

function findCsc() {
  const cands = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('找不到 csc.exe（.NET Framework 4 C# 编译器）');
}

if (!fs.existsSync(path.join(ELECTRON_DIST, 'electron.exe'))) {
  throw new Error('未找到 node_modules/electron/dist/electron.exe，请先在项目里安装 Electron');
}

log('清理旧目录…');
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

log('复制 Electron 运行时 → runtime/ …');
fs.cpSync(ELECTRON_DIST, path.join(DIST, 'runtime'), { recursive: true, dereference: true });

log('复制软件本体 → app/ …');
const appDir = path.join(DIST, 'app');
fs.mkdirSync(appDir, { recursive: true });
for (const f of ['package.json', 'icon.ico', 'icon-gameart.ico']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(appDir, f));
}
for (const d of ['src', 'public', 'desktop']) {
  fs.cpSync(path.join(ROOT, d), path.join(appDir, d), { recursive: true });
}

log('编译带图标的启动器…');
const csc = findCsc();
const tmpExe = path.join(DIST, 'GameArtLibrary.exe');
execFileSync(
  csc,
  [
    '/nologo',
    '/target:winexe',
    '/out:' + tmpExe,
    '/win32icon:' + path.join(ROOT, 'icon.ico'),
    '/r:System.dll',
    '/r:System.Windows.Forms.dll',
    '/r:System.Drawing.dll',
    path.join(__dirname, 'launcher.cs'),
  ],
  { stdio: 'inherit' }
);
fs.renameSync(tmpExe, path.join(DIST, '游戏艺术库.exe'));

log('写入说明 + 可写目录 …');
fs.copyFileSync(path.join(__dirname, '分发说明.txt'), path.join(DIST, '分发说明（先看我）.txt'));
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'tmp'), { recursive: true });

log('完成 → ' + DIST);
