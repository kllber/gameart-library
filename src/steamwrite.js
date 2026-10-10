'use strict';

/**
 * steamwrite.js —— 把库中「选中」的艺术图写入 Steam 的 config\grid（所有账号）
 *
 * 安全机制（务必遵守）：
 *   1. 写入前检查 Steam 是否正在运行；正在运行则拒绝（除非显式 force）。
 *   2. 覆盖前把原图备份到 data/backup/<时间戳>/<账号>/。
 *   3. 只写 config\grid，绝不碰 Steam 其它文件、绝不注入。
 *   4. 不删除 <appid>.json（logo 位置等元数据）——只处理同类型的图片文件。
 *
 * 导出：
 *   - isSteamRunning()
 *   - plan(appid, { type: 绝对文件路径 })   → 只读计划，不写任何东西
 *   - apply(appid, { type: 绝对文件路径 })  → 备份 + 写入
 */

const fs = require('fs');
const path = require('path');
const steam = require('./steam');
const platform = require('./platform');
const { DATA_DIR } = require('./paths');

const SUFFIX = { portrait: 'p', grid: '', hero: '_hero', logo: '_logo', icon: '_icon' };
const BACKUP_ROOT = path.join(DATA_DIR, 'backup');

/** Steam 只按扩展名 .png/.jpg 识别网格图；动图是 .webp（内容）→ 必须命名为 .png 才会显示 */
function gridTargetExt(file) {
  const ext = path.extname(file).toLowerCase() || '.png';
  return ext === '.webp' ? '.png' : ext;
}

/** Steam 是否正在运行（平台差异见 platform.js，带 5s 缓存；**异步**） */
async function isSteamRunning() {
  return platform.isSteamRunning();
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** 某账号 grid 目录里，属于该游戏该类型的所有现存文件 */
function existingFilesOfType(gridDir, appid, type) {
  const out = [];
  try {
    for (const f of fs.readdirSync(gridDir)) {
      const info = steam.parseGridFileName(f);
      if (info && info.kind === 'art' && info.appid === String(appid) && info.type === type) out.push(f);
    }
  } catch (e) {
    /* ignore */
  }
  return out;
}

/**
 * 官方 Steam 游戏的图标**不在** config/grid —— 而在 Steam 的**图标缓存**（见 §10 #65）：
 *   <Steam>/appcache/librarycache/<appid>/<图标哈希>.jpg   （2025+ 新式，主流）
 *   <Steam>/appcache/librarycache/<appid>_icon.jpg         （旧式平铺，少数）
 * 我们无法反推"图标哈希"，所以**就地替换缓存目录里已存在的 .jpg**（Steam 按缓存名读取，内容随便换）。
 */
function iconCacheTargets(steamPath, appid) {
  const base = path.join(steamPath, 'appcache', 'librarycache');
  const dir = path.join(base, String(appid));
  const out = [];
  try {
    if (fs.statSync(dir).isDirectory()) {
      for (const f of fs.readdirSync(dir)) {
        // ⚠️ 只认「40 位十六进制哈希.jpg」= 图标本身；
        //    同目录里还有 library_600x900_schinese.jpg / library_hero.jpg 等**其它库资源**，绝不能碰！
        if (!/^[0-9a-f]{40}\.jpe?g$/i.test(f)) continue;
        const full = path.join(dir, f);
        try {
          if (fs.statSync(full).isFile()) out.push(full);
        } catch (e) {
          /* ignore */
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  if (out.length) return out;
  // 旧式平铺：存在则替换；不存在也写一份（旧 Steam 有效，新 Steam 会忽略，无害）
  return [path.join(base, String(appid) + '_icon.jpg')];
}

/**
 * **原子替换**：先写临时文件再 `rename` 覆盖。
 * Steam 若发现缓存文件被"直接写入"会还原成原图标 —— 所以必须走临时文件 + 改名。
 */
function writeAtomic(dest, srcFile) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.gameart-tmp';
  fs.copyFileSync(srcFile, tmp);
  fs.renameSync(tmp, dest);
}

/** 该 appid 是否官方 Steam 游戏（非 Steam 快捷方式的 appid 高位为 1，数值很大） */
function isSteamAppId(appid) {
  return /^\d+$/.test(String(appid)) && Number(appid) < 2147483648;
}

/**
 * 生成写入计划（只读）。
 * @param {string} appid
 * @param {Object} typeToFile  { type: 本地绝对文件路径 }
 */
function plan(appid, typeToFile) {
  const sources = steam.buildSources(steam.detectSteamPaths());
  const types = Object.keys(typeToFile).filter((t) => typeToFile[t] && fs.existsSync(typeToFile[t]));
  const items = [];
  for (const src of sources) {
    for (const type of types) {
      const ext = gridTargetExt(typeToFile[type]);
      const item = {
        account: src.accountId,
        gridDir: src.gridDir,
        type,
        from: typeToFile[type],
        to: String(appid) + SUFFIX[type] + ext,
        replace: existingFilesOfType(src.gridDir, appid, type),
      };
      if (type === 'icon' && isSteamAppId(appid)) {
        item.iconCacheFiles = iconCacheTargets(src.steamPath, appid).map((p) => path.relative(src.steamPath, p));
      }
      items.push(item);
    }
  }
  return { appid, sourceCount: sources.length, types, items };
}

/**
 * 执行写入（备份 + 覆盖）。
 * 与 SGDBoop 一样：**不强制关闭 Steam**，Steam 运行时也可写入；
 * 但会返回 steamRunning 标记，提示用户可能需重启 Steam 才能看到新封面。
 * @param {string} appid
 * @param {Object} typeToFile
 * @param {Object} [opts] { requireClosed }  传 true 时才要求 Steam 已关闭
 */
async function apply(appid, typeToFile, opts) {
  opts = opts || {};
  const running = await isSteamRunning();
  if (running && opts.requireClosed) {
    throw new Error('Steam 正在运行，请先完全退出 Steam 再替换。');
  }
  // 批量时可传入复用的账号来源与备份目录，避免每个游戏都重新探测/各建一份备份
  const sources = opts.sources || steam.buildSources(steam.detectSteamPaths());
  if (!sources.length) throw new Error('未找到任何 Steam 账号的 grid 目录');

  const backupDir = opts.backupDir || path.join(BACKUP_ROOT, timestamp());
  const written = [];
  const backedUp = [];
  const failed = [];

  for (const src of sources) {
    for (const type of Object.keys(typeToFile)) {
      const file = typeToFile[type];
      if (!file || !fs.existsSync(file)) continue;
      const ext = gridTargetExt(file);
      const to = String(appid) + SUFFIX[type] + ext;

      // 1) 备份并移除该类型的旧图（同类型不同扩展名一起处理）
      for (const f of existingFilesOfType(src.gridDir, appid, type)) {
        const from = path.join(src.gridDir, f);
        const bak = path.join(backupDir, src.accountId, f);
        try {
          fs.mkdirSync(path.dirname(bak), { recursive: true });
          if (!fs.existsSync(bak)) fs.copyFileSync(from, bak);
          fs.unlinkSync(from);
          backedUp.push(src.accountId + '/' + f);
        } catch (e) {
          /* 单个文件失败不影响继续 */
        }
      }

      // 2) 写入新图
      fs.mkdirSync(src.gridDir, { recursive: true });
      fs.copyFileSync(file, path.join(src.gridDir, to));
      written.push(src.accountId + '/' + to);
    }

    // 3) 图标额外写进 Steam 的**图标缓存**（官方 Steam 游戏的图标不读 config/grid，见 §10 #65）
    const iconFile = typeToFile.icon;
    if (iconFile && fs.existsSync(iconFile) && isSteamAppId(appid)) {
      for (const t of iconCacheTargets(src.steamPath, appid)) {
        try {
          if (fs.existsSync(t)) {
            const bak = path.join(backupDir, src.accountId, 'appcache', path.basename(t));
            fs.mkdirSync(path.dirname(bak), { recursive: true });
            if (!fs.existsSync(bak)) fs.copyFileSync(t, bak);
            backedUp.push(src.accountId + '/appcache/' + path.basename(t));
          }
          writeAtomic(t, iconFile);
          written.push(src.accountId + '/appcache/' + path.basename(t));
        } catch (e) {
          // 图标缓存写入失败要**能看见**（Steam 占用/权限）——别悄悄失败
          failed.push({ account: src.accountId, file: 'appcache/' + path.basename(t), error: (e && e.message) || String(e) });
        }
      }
    }
  }

  if (!opts.skipPrune) pruneBackups();
  return { backupDir, written, backedUp, failed, steamRunning: running };
}

/**
 * 自动清理旧备份：只保留最近 KEEP 份（按时间戳命名，字典序=时间序）。
 * 避免 data/backup 无限增长（每次同步都会新建一份）。设置→库文件也有手动"清理备份"。
 */
const BACKUP_KEEP = 30;
function pruneBackups(keep) {
  const k = keep == null ? BACKUP_KEEP : keep;
  try {
    if (!fs.existsSync(BACKUP_ROOT)) return;
    const dirs = fs
      .readdirSync(BACKUP_ROOT)
      .filter((n) => {
        try {
          return fs.statSync(path.join(BACKUP_ROOT, n)).isDirectory();
        } catch (e) {
          return false;
        }
      })
      .sort();
    for (const n of dirs.slice(0, Math.max(0, dirs.length - k))) {
      try {
        fs.rmSync(path.join(BACKUP_ROOT, n), { recursive: true, force: true });
      } catch (e) {
        /* ignore */
      }
    }
  } catch (e) {
    /* ignore */
  }
}

module.exports = { isSteamRunning, plan, apply, SUFFIX, BACKUP_ROOT, pruneBackups };
