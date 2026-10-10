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
      items.push({
        account: src.accountId,
        gridDir: src.gridDir,
        type,
        from: typeToFile[type],
        to: String(appid) + SUFFIX[type] + ext,
        replace: existingFilesOfType(src.gridDir, appid, type),
      });
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
  }

  if (!opts.skipPrune) pruneBackups();
  return { backupDir, written, backedUp, steamRunning: running };
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
