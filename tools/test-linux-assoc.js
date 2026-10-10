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

  const s0 = fileassoc.getStatus();
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
  check('写 mimeapps 默认关联', has(P.mimeapps, 'application/x-gameart=gameart-library.desktop'));
  check('安装应用图标', fs.existsSync(P.appIcon));
  check('安装文件类型图标', fs.existsSync(P.mimeIcon));

  check('缺命令时优雅降级（返回 warning 而非报错）', r.warning === null || typeof r.warning === 'string');

  const s1 = fileassoc.getStatus();
  check('注册后 registered=true', s1.registered === true, s1);

  await fileassoc.unregister();
  check('取消后 .desktop 已删', !fs.existsSync(P.desktop));
  check('取消后 MIME xml 已删', !fs.existsSync(P.mimeXml));
  check('取消后 mimeapps 里无我们的关联', !has(P.mimeapps, 'application/x-gameart=gameart-library.desktop'));
  check('取消后 registered=false', fileassoc.getStatus().registered === false);

  fs.rmSync(SANDBOX, { recursive: true, force: true });
  console.log(failed === 0 ? '\n全部通过 ✅' : '\n有 ' + failed + ' 项失败 ❌');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
