'use strict';

/**
 * tools/test-linux-assoc.js —— Linux「.gameart 文件关联」回归测试
 *
 * 在**任何平台**都能跑：伪造 XDG 目录 + 把 platform 的 IS_LINUX 置真，
 * 验证会正确写出 .desktop / MIME xml / mimeapps.list / 图标，且**缺命令时优雅降级**。
 *
 * 运行：dev.cmd node tools\test-linux-assoc.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SANDBOX = path.join(ROOT, '.tmp', 'linux-assoc-test');
process.env.XDG_DATA_HOME = path.join(SANDBOX, 'data');
process.env.XDG_CONFIG_HOME = path.join(SANDBOX, 'config');

const platform = require(path.join(ROOT, 'src', 'platform'));
platform.IS_WINDOWS = false; // 模拟 Linux（fileassoc 在调用时才读这些标志）
platform.IS_LINUX = true;

const fileassoc = require(path.join(ROOT, 'src', 'fileassoc'));
const P = fileassoc.linuxPaths();

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (ok || extra === undefined ? '' : '   → ' + JSON.stringify(extra)));
  if (!ok) failed++;
}
const has = (p, needle) => {
  try {
    return fs.readFileSync(p, 'utf8').includes(needle);
  } catch (e) {
    return false;
  }
};

fs.rmSync(SANDBOX, { recursive: true, force: true });

(async () => {
  console.log('目标文件:');
  console.log('  desktop  =', path.relative(ROOT, P.desktop));
  console.log('  mimeXml  =', path.relative(ROOT, P.mimeXml));
  console.log('  mimeapps =', path.relative(ROOT, P.mimeapps));
  console.log('断言:');

  const s0 = await fileassoc.getStatus();
  check('未关联时 supported=true / registered=false', s0.supported === true && s0.registered === false, s0);

  const r = await fileassoc.register();
  check('注册返回 ok 且有 Exec', !!r.command, r);

  check('写出 .desktop', fs.existsSync(P.desktop));
  check('  .desktop 含 MimeType', has(P.desktop, 'MimeType=application/x-gameart;'));
  check('  .desktop 含 Exec', has(P.desktop, 'Exec='));
  check('  .desktop 含中文名', has(P.desktop, 'Name[zh_CN]=游戏艺术库'));
  check('  .desktop 含 Icon', has(P.desktop, 'Icon=gameart-library'));
  check('写出 MIME xml', fs.existsSync(P.mimeXml));
  check('  MIME xml 含 *.gameart glob', has(P.mimeXml, '<glob pattern="*.gameart"/>'));
  check('  MIME xml 的图标名不含斜杠（application-x-gameart）', has(P.mimeXml, '<icon name="application-x-gameart"/>'), fs.readFileSync(P.mimeXml, 'utf8'));
  check('  MIME xml 含 generic-icon', has(P.mimeXml, '<generic-icon name="application-x-gameart"/>'));
  check('写 mimeapps 默认关联', has(P.mimeapps, 'application/x-gameart=gameart-library.desktop'));
  check('安装应用图标', fs.existsSync(P.appIcon));
  check('安装文件类型图标（256）', fs.existsSync(P.mimeIcon));

  const sizes = [16, 32, 48, 64, 128, 256];
  const installedIcons = sizes.filter((s) =>
    fs.existsSync(path.join(process.env.XDG_DATA_HOME, 'icons', 'hicolor', s + 'x' + s, 'mimetypes', 'application-x-gameart.png'))
  );
  check('安装多尺寸文件类型图标（' + installedIcons.length + '/' + sizes.length + '）', installedIcons.length >= 5, installedIcons);
  const installedAppIcons = sizes.filter((s) =>
    fs.existsSync(path.join(process.env.XDG_DATA_HOME, 'icons', 'hicolor', s + 'x' + s, 'apps', 'gameart-library.png'))
  );
  check('安装多尺寸应用图标（' + installedAppIcons.length + '/' + sizes.length + '）', installedAppIcons.length >= 5, installedAppIcons);
  const srcIcon = path.join(ROOT, 'public', 'fileicon', 'icon_256.png');
  check(
    '文件类型图标内容 = .gameart 图标（不是通用 logo）',
    fs.existsSync(srcIcon) && Buffer.compare(fs.readFileSync(srcIcon), fs.readFileSync(P.mimeIcon)) === 0
  );

  check('缺命令时优雅降级（返回 warning 而非报错）', r.warning === null || typeof r.warning === 'string');

  const s1 = await fileassoc.getStatus();
  check('注册后 registered=true', s1.registered === true, s1);

  const a1 = await fileassoc.autoRegister();
  check('已关联且文件一致时 autoRegister 跳过（already）', a1.ok === true && a1.skipped === 'already', a1);
  const sFiles = await fileassoc.getStatus();
  check('注册后 filesMatch=true', sFiles.filesMatch === true, sFiles);

  // 自愈：把生成的 xml 改坏（模拟旧版本的笔误），autoRegister 应重写它
  fs.writeFileSync(P.mimeXml, fs.readFileSync(P.mimeXml, 'utf8').replace('application-x-gameart', 'application/x-gameart'), 'utf8');
  check('xml 被改坏后 filesMatch=false', (await fileassoc.getStatus()).filesMatch === false);
  const a1c = await fileassoc.autoRegister();
  check('autoRegister 自愈重写', a1c.ok === true && !a1c.skipped, a1c);
  check('自愈后 xml 图标名正确', has(P.mimeXml, '<icon name="application-x-gameart"/>'));

  // 图标被删掉后，autoRegister 应重新注册以补装图标（老版本升级场景）
  fs.rmSync(P.mimeIcon, { force: true });
  const a1b = await fileassoc.autoRegister();
  check('图标缺失时 autoRegister 会补装', a1b.ok === true && !a1b.skipped, a1b);
  check('补装后图标回来了', fs.existsSync(P.mimeIcon));

  await fileassoc.unregister();
  check('取消后 .desktop 已删', !fs.existsSync(P.desktop));
  check('取消后 MIME xml 已删', !fs.existsSync(P.mimeXml));
  check('取消后 mimeapps 里无我们的关联', !has(P.mimeapps, 'application/x-gameart=gameart-library.desktop'));
  check('取消后 registered=false', (await fileassoc.getStatus()).registered === false);

  const a2 = await fileassoc.autoRegister();
  check('未关联时 autoRegister 会自动写入', a2.ok === true && !a2.skipped, a2);
  check('autoRegister 后 registered=true', (await fileassoc.getStatus()).registered === true);

  // 创建桌面快捷方式（把桌面目录指到测试沙箱，别写真实家目录）
  fs.mkdirSync(process.env.XDG_CONFIG_HOME, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.XDG_CONFIG_HOME, 'user-dirs.dirs'),
    'XDG_DESKTOP_DIR="' + SANDBOX.split(path.sep).join('/') + '/desktop"\n',
    'utf8'
  );
  const sc = await fileassoc.createDesktopShortcut();
  check('创建桌面快捷方式返回路径', !!sc.path, sc);
  check('  桌面项文件已生成', fs.existsSync(sc.path));
  check('  桌面项与安装的一致', fs.readFileSync(sc.path, 'utf8') === fs.readFileSync(P.desktop, 'utf8'));

  fs.rmSync(SANDBOX, { recursive: true, force: true });
  console.log(failed === 0 ? '\n全部通过 ✅' : '\n有 ' + failed + ' 项失败 ❌');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
