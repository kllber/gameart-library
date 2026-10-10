'use strict';

/**
 * tools/test-icon-cache.js —— steamwrite 图标写入的**回归测试**（零风险：用假 Steam 目录）
 *
 * 背景（维护约定 §10 #65）：官方 Steam 游戏的图标不在 `config/grid`，
 * 而在 `<Steam>/appcache/librarycache/<appid>/<40位哈希>.jpg`，
 * 且同目录里还有 `library_*.jpg` 等**其它库资源，绝不能碰**。
 *
 * 运行：dev.cmd node tools\test-icon-cache.js      （或 node tools/test-icon-cache.js）
 * 退出码 0 = 全部通过；非 0 = 有用例失败。
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SANDBOX = path.join(ROOT, '.tmp', 'icon-test');
process.env.GAMEART_DATA_DIR = path.join(SANDBOX, 'data');

const steamwrite = require(path.join(ROOT, 'src', 'steamwrite'));

const APPID = '999999';
const FAKE = path.join(SANDBOX, 'steam');
const GRID = path.join(FAKE, 'userdata', '123456', 'config', 'grid');
const ICON_DIR = path.join(FAKE, 'appcache', 'librarycache', APPID);
const HASH = 'a'.repeat(40);
const HASH_FILE = path.join(ICON_DIR, HASH + '.jpg');
const HERO = path.join(ICON_DIR, 'library_hero.jpg');
const GRID_PNG = path.join(GRID, APPID + '_icon.png');
const SRC = path.join(SANDBOX, 'newicon.jpg');

const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
};

let failed = 0;
function check(name, ok, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (ok || extra === undefined ? '' : '   → ' + JSON.stringify(extra)));
  if (!ok) failed++;
}

(async () => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(GRID, { recursive: true });
  fs.mkdirSync(ICON_DIR, { recursive: true });
  fs.writeFileSync(HASH_FILE, 'OLD-CACHE-ICON');
  fs.writeFileSync(HERO, 'LIBRARY-HERO-MUST-KEEP');
  fs.writeFileSync(GRID_PNG, 'OLD-GRID-ICON');
  fs.writeFileSync(SRC, 'NEW-ICON-DATA');

  const r = await steamwrite.apply(
    APPID,
    { icon: SRC },
    { sources: [{ id: 0, steamPath: FAKE, accountId: '123456', gridDir: GRID }] }
  );

  console.log('steamwrite.apply 结果:');
  console.log('  written  =', JSON.stringify(r.written));
  console.log('  backedUp =', JSON.stringify(r.backedUp));
  console.log('  failed   =', JSON.stringify(r.failed));
  console.log('断言:');

  check('缓存里的哈希图标被替换成新内容', read(HASH_FILE) === 'NEW-ICON-DATA', read(HASH_FILE));
  check('library_hero.jpg 未被改动（关键！）', read(HERO) === 'LIBRARY-HERO-MUST-KEEP', read(HERO));
  check('config/grid 图标也被写入', r.written.some((w) => w.includes(APPID + '_icon')), r.written);
  check('没有写入失败项', r.failed.length === 0, r.failed);
  check('没有残留临时文件', fs.readdirSync(ICON_DIR).every((f) => !f.includes('gameart-tmp')));
  check('备份目录已生成（可回滚）', fs.existsSync(r.backupDir));
  check('备份包含被覆盖的哈希图标', r.backedUp.some((b) => b.includes(path.basename(HASH_FILE))), r.backedUp);

  fs.rmSync(SANDBOX, { recursive: true, force: true });

  console.log(failed === 0 ? '\n全部通过 ✅' : '\n有 ' + failed + ' 项失败 ❌');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
