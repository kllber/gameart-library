'use strict';

/**
 * tools/make-linux-targz.js —— 把 electron-builder 产出的 AppImage 打包成"解压即用"的 .tar.gz
 *
 * 产出结构（解压后）：
 *   游戏艺术库/
 *     游戏艺术库.desktop      ← 双击这个启动（Dolphin 里显示我们的名字与图标）
 *     游戏艺术库.AppImage     ← 真正的程序（已带执行权限，也能直接双击）
 *     游戏艺术库.png          ← 图标
 *     使用说明（先看我）.txt
 *
 * 启动器用 `%k`（.desktop 自身路径）定位同目录的 AppImage → **整个文件夹可以随便移动**。
 * tar 会保留执行权限 → 用户解压后无需 chmod。
 *
 * 用法：node tools/make-linux-targz.js [distDir]      （默认 dist/）
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const dist = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const FOLDER = '游戏艺术库';
const APP_NAME = '游戏艺术库.AppImage';
const DESKTOP_NAME = '游戏艺术库.desktop';
const VER = require(path.join(ROOT, 'package.json')).version;

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : vars[k]));
}

const DESKTOP = fill(
  [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name={zh}',
    'Name[zh_CN]={zh}',
    'Name[en]=GameArt Library',
    'GenericName=Game artwork manager',
    'Comment={zhComment}',
    'Comment[zh_CN]={zhComment}',
    'Comment[en]={enComment}',
    // 用 $1 接收 %k（.desktop 自身路径）→ 路径含空格也安全；shift 后把 %U 传给程序
    'Exec=sh -c \'cd "$(dirname "$1")" && shift && exec ./{app} "$@"\' sh %k %U',
    'Icon=gameart-library',
    'Terminal=false',
    'Categories=Utility;Game;',
    'StartupNotify=true',
    'StartupWMClass=gameart-library',
    '',
  ].join('\n'),
  {
    zh: '游戏艺术库',
    app: APP_NAME,
    zhComment: '统一管理并配置你喜爱的自定义游戏艺术作品',
    enComment: 'Manage and sync custom game artwork to Steam',
  }
);

const README_TXT = [
  '游戏艺术库 · GameArt Library（Linux 版）v' + VER,
  '',
  '【怎么用】',
  '  1. 双击本文件夹里的「游戏艺术库」启动器即可运行。',
  '  2. 第一次运行后：',
  '     · 开始菜单里会出现「游戏艺术库」（带图标），可在那里右键"固定到任务栏"；',
  '     · 打开某个 .gameart 库文件也会自动用本软件打开。',
  '',
  '【注意】',
  '  · 请保持这个文件夹完整：移动的话请整个文件夹一起移动（启动器会自动找到程序）。',
  '  · 若菜单/桌面图标显示为"默认图标"，注销重登一次即可。',
  '  · 改了 Steam 的"图标"后需要重启一次 Steam 才会显示；封面 / 大背景 / Logo 即时生效。',
  '  · 不需要安装、不需要 root；数据存在 ~/.local/share/gameart-library。',
  '',
  '【卸载】',
  '  删掉这个文件夹即可；如需彻底清理，再删除 ~/.local/share/gameart-library。',
  '',
].join('\n');

/* ---------------- 执行 ---------------- */

if (!fs.existsSync(dist)) {
  console.error('找不到目录：' + dist);
  process.exit(1);
}
const appimages = fs.readdirSync(dist).filter((f) => /\.AppImage$/i.test(f));
if (!appimages.length) {
  console.error('在 ' + dist + ' 里没找到 .AppImage');
  process.exit(1);
}
const appimage = path.join(dist, appimages[0]);

const stage = path.join(dist, '.stage');
const pkgDir = path.join(stage, FOLDER);
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(pkgDir, { recursive: true });

// 1) 程序
const appDest = path.join(pkgDir, APP_NAME);
fs.copyFileSync(appimage, appDest);
fs.chmodSync(appDest, 0o755);

// 2) 启动器
const desktopDest = path.join(pkgDir, DESKTOP_NAME);
fs.writeFileSync(desktopDest, DESKTOP, 'utf8');
fs.chmodSync(desktopDest, 0o755);

// 3) 图标 + 说明
const iconSrc = path.join(ROOT, 'public', 'appicon', 'icon_256.png');
const iconFallback = path.join(ROOT, 'public', 'icon.png');
const iconUse = fs.existsSync(iconSrc) ? iconSrc : iconFallback;
if (fs.existsSync(iconUse)) {
  const pngDest = path.join(pkgDir, '游戏艺术库.png');
  fs.copyFileSync(iconUse, pngDest);
  fs.chmodSync(pngDest, 0o644);
}
fs.writeFileSync(path.join(pkgDir, '使用说明（先看我）.txt'), README_TXT, 'utf8');

// 4) 打 tar.gz（tar 保留执行权限）
const tarName = appimages[0].replace(/\.[^.]*$/, '') + '.tar.gz';
const tarPath = path.join(dist, tarName);
fs.rmSync(tarPath, { force: true });
execFileSync('tar', ['-czf', tarPath, '-C', stage, FOLDER], { stdio: 'inherit' });

// 5) 不保留裸 AppImage / 暂存目录（避免两种形式让人困惑）
fs.rmSync(appimage, { force: true });
fs.rmSync(stage, { recursive: true, force: true });

console.log('已生成：' + path.relative(ROOT, tarPath));
console.log('结构预览（解压后）：');
for (const f of [DESKTOP_NAME, APP_NAME, '游戏艺术库.png', '使用说明（先看我）.txt']) {
  console.log('  ' + FOLDER + '/' + f);
}
