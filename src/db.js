'use strict';

/**
 * db.js —— 本地库（.gameart，SQLite，用 Node 内置 node:sqlite，零依赖）
 *
 * 库文件： data/library.gameart
 * 资源目录： data/assets/<appid>/...
 *
 * 表：
 *   games(appid, name, is_non_steam, added_at)
 *   art(id, appid, type, source, sgdb_id, url, author, file, selected, added_at)
 *   settings(k, v)
 *
 * art.source 取值： 'steam'（来自 Steam 现有封面）/ 'sgdb'（来自 SteamGridDB）/ 'local'（本地文件）
 * art.url / sgdb_id 即“配方”，即使图片丢失也能重新下载。
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { ROOT, DATA_DIR } = require('./paths');

const ASSET_DIR = path.join(DATA_DIR, 'assets');
const DB_FILE = path.join(DATA_DIR, 'library.gameart');

let db = null;
let _dbPath = null;

/** 打开指定的 .gameart 文件（切换工作库） */
function openDatabase(file) {
  if (db) {
    try {
      db.close();
    } catch (e) {
      /* ignore */
    }
    db = null;
  }
  _dbPath = file;
  return getDb();
}

function currentDbPath() {
  return _dbPath;
}

function closeDatabase() {
  if (db) {
    try {
      db.close();
    } catch (e) {
      /* ignore */
    }
    db = null;
  }
  _dbPath = null;
}

function getDb() {
  if (db) return db;
  if (!_dbPath) throw new Error('NO_DB_OPEN');
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  db = new DatabaseSync(_dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      appid TEXT PRIMARY KEY,
      name TEXT,
      name_zh TEXT,
      is_non_steam INTEGER DEFAULT 0,
      sgdb_id TEXT,
      added_at INTEGER,
      deleted INTEGER DEFAULT 0,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS art (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appid TEXT,
      type TEXT,
      source TEXT,
      sgdb_id TEXT,
      url TEXT,
      author TEXT,
      file TEXT,
      mime TEXT,
      data BLOB,
      selected INTEGER DEFAULT 0,
      sort INTEGER DEFAULT 0,
      added_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      k TEXT PRIMARY KEY,
      v TEXT
    );
    CREATE TABLE IF NOT EXISTS owned_games (
      appid TEXT PRIMARY KEY,
      name TEXT,
      playtime INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS steam_accounts (
      steam_id64 TEXT PRIMARY KEY,
      persona TEXT,
      avatar TEXT,
      api_key TEXT,
      added_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      sort INTEGER DEFAULT 0,
      added_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS game_categories (
      category_id INTEGER,
      appid TEXT,
      PRIMARY KEY (category_id, appid)
    );
  `);
  // 迁移：旧的 owned_games 无 steam_id64 列 -> 重建为多账号结构
  try {
    const cols = db.prepare('PRAGMA table_info(owned_games)').all();
    if (cols.length && !cols.some((c) => c.name === 'steam_id64')) {
      db.exec('DROP TABLE IF EXISTS owned_games');
    }
  } catch (e) {
    /* ignore */
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS owned_games (
      steam_id64 TEXT,
      appid TEXT,
      name TEXT,
      playtime INTEGER DEFAULT 0,
      PRIMARY KEY (steam_id64, appid)
    );
  `);
  // 迁移：art 表补列（sort 排序 / mime / data 内嵌图片）
  try {
    const acols = db.prepare('PRAGMA table_info(art)').all();
    if (acols.length && !acols.some((c) => c.name === 'sort')) {
      db.exec('ALTER TABLE art ADD COLUMN sort INTEGER DEFAULT 0');
    }
    if (acols.length && !acols.some((c) => c.name === 'mime')) {
      db.exec('ALTER TABLE art ADD COLUMN mime TEXT');
    }
    if (acols.length && !acols.some((c) => c.name === 'data')) {
      db.exec('ALTER TABLE art ADD COLUMN data BLOB');
    }
    // 迁移：art 加 preview / preview_mime（动图的 .webm 预览，供主页"一直播"，见 §6.13）
    if (acols.length && !acols.some((c) => c.name === 'preview')) {
      db.exec('ALTER TABLE art ADD COLUMN preview BLOB');
    }
    if (acols.length && !acols.some((c) => c.name === 'preview_mime')) {
      db.exec('ALTER TABLE art ADD COLUMN preview_mime TEXT');
    }
  } catch (e) {
    /* ignore */
  }
  // 迁移：games 加 name_zh（中文名）
  try {
    const gcols = db.prepare('PRAGMA table_info(games)').all();
    if (gcols.length && !gcols.some((c) => c.name === 'name_zh')) {
      db.exec('ALTER TABLE games ADD COLUMN name_zh TEXT');
    }
    // 迁移：games 加 回收站列 deleted / deleted_at
    if (gcols.length && !gcols.some((c) => c.name === 'deleted')) {
      db.exec('ALTER TABLE games ADD COLUMN deleted INTEGER DEFAULT 0');
    }
    if (gcols.length && !gcols.some((c) => c.name === 'deleted_at')) {
      db.exec('ALTER TABLE games ADD COLUMN deleted_at INTEGER');
    }
  } catch (e) {
    /* ignore */
  }
  // 索引：按 (appid, file) 查单张图（/asset、/preview 每张图都会查一次）。
  // 没有索引时是"整表扫描 + 逐行比 appid/file"，图多时明显拖慢图片接口。
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_art_appid_file ON art(appid, file)');
  } catch (e) {
    /* ignore */
  }
  // 迁移：旧的"外置图片文件"读进数据库 BLOB（一次性，幂等）
  try {
    migrateFilesToBlob();
  } catch (e) {
    /* ignore */
  }
  // 启用自动增量回收（首次会重建一次库）
  ensureAutoVacuum();
  return db;
}

/** 启用 auto_vacuum=incremental；若当前不是该模式，则重建一次（VACUUM）使其生效 */
function ensureAutoVacuum() {
  try {
    const row = db.prepare('PRAGMA auto_vacuum').get();
    const mode = row ? (row.auto_vacuum !== undefined ? row.auto_vacuum : Object.values(row)[0]) : 0;
    if (Number(mode) !== 2) {
      db.exec('PRAGMA auto_vacuum = incremental');
      db.exec('VACUUM');
    }
  } catch (e) {
    /* ignore */
  }
}

/** 回收空闲页（删除后调用）。传 pages 则小步回收；不传则**回收全部空闲页**（文件会真正变小）。 */
function incrementalVacuum(pages) {
  try {
    const sql = pages ? 'PRAGMA incremental_vacuum(' + Number(pages) + ')' : 'PRAGMA incremental_vacuum';
    getDb().exec(sql);
  } catch (e) {
    /* ignore */
  }
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

/** 把 data/assets 里旧的图片文件读进 art.data（仅处理 data 为空的旧记录） */
function migrateFilesToBlob() {
  const rows = db
    .prepare('SELECT id, appid, file FROM art WHERE data IS NULL AND file IS NOT NULL')
    .all();
  if (!rows.length) return;
  const upd = db.prepare('UPDATE art SET data = ?, mime = ? WHERE id = ?');
  for (const r of rows) {
    const p = path.join(ASSET_DIR, String(r.appid), path.basename(r.file));
    try {
      const buf = fs.readFileSync(p);
      upd.run(buf, MIME_BY_EXT[path.extname(r.file).toLowerCase()] || 'application/octet-stream', r.id);
    } catch (e) {
      /* 文件不在也没关系 */
    }
  }
}

const now = () => Date.now();

/* ---------------- settings ---------------- */

function getSetting(k) {
  const row = getDb().prepare('SELECT v FROM settings WHERE k = ?').get(k);
  return row ? row.v : null;
}

function setSetting(k, v) {
  getDb()
    .prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .run(k, String(v));
}

/* ---------------- games ---------------- */

// 注意：列表查询绝不含 `data` / `preview` 两个 BLOB；只带一个"是否有预览"的布尔。
const ART_COLS =
  'id, appid, type, source, sgdb_id, url, author, file, mime, selected, sort, added_at, CASE WHEN preview IS NULL THEN 0 ELSE 1 END AS has_preview';

function listGames() {
  const games = getDb().prepare('SELECT * FROM games WHERE COALESCE(deleted,0)=0 ORDER BY added_at ASC').all();
  const artRows = getDb().prepare(`SELECT ${ART_COLS} FROM art ORDER BY sort ASC, id ASC`).all();
  const catRows = getDb().prepare('SELECT category_id, appid FROM game_categories').all();

  const artBy = new Map();
  for (const r of artRows) {
    if (!artBy.has(r.appid)) artBy.set(r.appid, []);
    artBy.get(r.appid).push(r);
  }
  const catBy = new Map();
  for (const r of catRows) {
    if (!catBy.has(r.appid)) catBy.set(r.appid, []);
    catBy.get(r.appid).push(r.category_id);
  }

  for (const g of games) {
    const rows = artBy.get(g.appid) || [];
    g.art = {};
    for (const r of rows) {
      (g.art[r.type] = g.art[r.type] || []).push(r);
    }
    g.artCount = rows.length;
    g.hasSelected = {};
    for (const r of rows) if (r.selected) g.hasSelected[r.type] = r.id;
    g.categories = catBy.get(g.appid) || [];
  }
  return games;
}

function getGame(appid) {
  return getDb().prepare('SELECT * FROM games WHERE appid = ?').get(appid) || null;
}

function addGame(appid, name, isNonSteam, sgdbId) {
  const a = String(appid);
  const existing = getDb().prepare('SELECT appid, deleted FROM games WHERE appid = ?').get(a);
  if (existing) {
    const d = getDb();
    // 若在回收站里 → 复原（避免主键冲突，也让"重新添加"把游戏拿回来）
    if (existing.deleted) d.prepare('UPDATE games SET deleted = 0, deleted_at = NULL WHERE appid = ?').run(a);
    if (name) d.prepare('UPDATE games SET name = ? WHERE appid = ?').run(name, a);
    if (sgdbId != null) d.prepare('UPDATE games SET sgdb_id = ? WHERE appid = ?').run(String(sgdbId), a);
    return;
  }
  getDb()
    .prepare('INSERT INTO games (appid, name, is_non_steam, sgdb_id, added_at) VALUES (?, ?, ?, ?, ?)')
    .run(a, name || null, isNonSteam ? 1 : 0, sgdbId != null ? String(sgdbId) : null, now());
}

/** 仅取"未删除（不在回收站）"的游戏 */
function getActiveGame(appid) {
  return getDb().prepare('SELECT * FROM games WHERE appid = ? AND COALESCE(deleted,0)=0').get(String(appid)) || null;
}

function setGameSgdbId(appid, sgdbId) {
  getDb().prepare('UPDATE games SET sgdb_id = ? WHERE appid = ?').run(sgdbId != null ? String(sgdbId) : null, String(appid));
}

function updateGameName(appid, name) {
  getDb().prepare('UPDATE games SET name = ? WHERE appid = ?').run(name, String(appid));
}

function setGameNameZh(appid, name) {
  getDb().prepare('UPDATE games SET name_zh = ? WHERE appid = ?').run(name || null, String(appid));
}

/** 修改游戏的 Steam AppID（同时迁移 art / game_categories；清除旧中文名以便重取） */
function changeAppId(oldId, newId) {
  const d = getDb();
  // 若回收站里有同 AppID 的游戏，先彻底删掉，避免主键冲突
  const dup = d.prepare('SELECT deleted FROM games WHERE appid = ?').get(String(newId));
  if (dup && dup.deleted) purgeGame(newId);
  d.prepare('UPDATE games SET appid = ?, is_non_steam = 0, name_zh = NULL WHERE appid = ?').run(String(newId), String(oldId));
  d.prepare('UPDATE art SET appid = ? WHERE appid = ?').run(String(newId), String(oldId));
  d.prepare('UPDATE game_categories SET appid = ? WHERE appid = ?').run(String(newId), String(oldId));
}

/** 还没拉过中文名的数字 AppID 游戏（不含回收站） */
function gamesMissingNameZh() {
  return getDb()
    .prepare("SELECT appid, name FROM games WHERE (name_zh IS NULL OR name_zh = '') AND is_non_steam = 0 AND COALESCE(deleted,0)=0")
    .all();
}

/** 移入回收站（软删除） */
function softDeleteGame(appid) {
  getDb().prepare('UPDATE games SET deleted = 1, deleted_at = ? WHERE appid = ?').run(now(), String(appid));
}

/** 从回收站恢复 */
function restoreGame(appid) {
  getDb().prepare('UPDATE games SET deleted = 0, deleted_at = NULL WHERE appid = ?').run(String(appid));
}

/** 回收站列表（含图片数） */
function listDeletedGames() {
  const rows = getDb()
    .prepare('SELECT appid, name, name_zh, is_non_steam, deleted_at FROM games WHERE COALESCE(deleted,0)=1 ORDER BY deleted_at DESC')
    .all();
  for (const g of rows) {
    g.artCount = getDb().prepare('SELECT COUNT(*) AS c FROM art WHERE appid = ?').get(String(g.appid)).c;
  }
  return rows;
}

/** 彻底删除（不可恢复）：清图片、分类关联、游戏本体与外置目录；并**全量回收**空间让 .gameart 变小 */
function purgeGame(appid) {
  const a = String(appid);
  getDb().prepare('DELETE FROM art WHERE appid = ?').run(a);
  getDb().prepare('DELETE FROM game_categories WHERE appid = ?').run(a);
  getDb().prepare('DELETE FROM games WHERE appid = ?').run(a);
  try {
    fs.rmSync(path.join(ASSET_DIR, a), { recursive: true, force: true });
  } catch (e) {
    /* ignore */
  }
  incrementalVacuum();
}

/* ---------------- art ---------------- */

/** 列表查询一律用 ART_COLS（不含 data） */
function listArt(appid) {
  return getDb().prepare(`SELECT ${ART_COLS} FROM art WHERE appid = ? ORDER BY sort ASC, id ASC`).all(String(appid));
}

/** 取一行 art 的完整数据（含 BLOB），用于 /asset 提供图片 */
function getArtByFile(appid, file) {
  return getDb().prepare('SELECT * FROM art WHERE appid = ? AND file = ? LIMIT 1').get(String(appid), String(file)) || null;
}

/** 是否已存在相同（类型 + 来源标识）的图，避免重复导入 */
function artExists(appid, type, dedupeKey) {
  const rows = getDb().prepare('SELECT * FROM art WHERE appid = ? AND type = ?').all(String(appid), type);
  return rows.some((r) => (r.url || r.file || r.sgdb_id) === dedupeKey);
}

/**
 * 新增一张艺术图。若该 (appid,type) 目前没有任何选中项，则自动选中它。
 * art: { type, source, sgdb_id, url, author, file }
 * 返回新增行的 id（或已存在行的 id）
 */
function addArt(appid, art) {
  const a = String(appid);
  const existing = getDb()
    .prepare('SELECT id FROM art WHERE appid = ? AND type = ? AND COALESCE(url,file,sgdb_id) = ?')
    .get(a, art.type, art.url || art.file || art.sgdb_id || '');
  if (existing) return existing.id;

  const hasSelected = getDb()
    .prepare('SELECT COUNT(*) AS c FROM art WHERE appid = ? AND type = ? AND selected = 1')
    .get(a, art.type).c;

  const nextSort = getDb()
    .prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM art WHERE appid = ? AND type = ?')
    .get(a, art.type).n;

  const info = getDb()
    .prepare(
      'INSERT INTO art (appid, type, source, sgdb_id, url, author, file, mime, data, preview, preview_mime, selected, sort, added_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )
    .run(
      a,
      art.type,
      art.source || 'local',
      art.sgdb_id != null ? String(art.sgdb_id) : null,
      art.url || null,
      art.author || null,
      art.file || null,
      art.mime || null,
      art.data ? Buffer.from(art.data) : null,
      art.preview ? Buffer.from(art.preview) : null,
      art.preview_mime || null,
      hasSelected ? 0 : 1,
      nextSort,
      now()
    );
  return Number(info.lastInsertRowid);
}

/** 写入某张图的动图预览（.webm）；用于 add-art 与"补全动图预览"任务 */
function setArtPreview(appid, file, buf, mime) {
  getDb()
    .prepare('UPDATE art SET preview = ?, preview_mime = ? WHERE appid = ? AND file = ?')
    .run(buf ? Buffer.from(buf) : null, mime || 'video/webm', String(appid), String(file));
}

/** 需要补全预览的动图：webp + 有 sgdb_id + 尚无 preview 的活动游戏 */
function listArtsNeedingPreview() {
  return getDb()
    .prepare(
      "SELECT a.id, a.appid, a.type, a.sgdb_id, a.file, g.sgdb_id AS game_sgdb_id FROM art a JOIN games g ON g.appid = a.appid WHERE a.mime = 'image/webp' AND a.preview IS NULL AND a.sgdb_id IS NOT NULL AND g.sgdb_id IS NOT NULL AND COALESCE(g.deleted,0) = 0"
    )
    .all();
}

/** 按给定 id 顺序重排某游戏某类型的画廊 */
function reorderArt(appid, type, ids) {
  const stmt = getDb().prepare('UPDATE art SET sort = ? WHERE id = ? AND appid = ? AND type = ?');
  let i = 1;
  for (const id of ids) {
    stmt.run(i++, Number(id), String(appid), type);
  }
}

function selectArt(appid, type, id) {
  const a = String(appid);
  getDb().prepare('UPDATE art SET selected = 0 WHERE appid = ? AND type = ?').run(a, type);
  getDb().prepare('UPDATE art SET selected = 1 WHERE appid = ? AND type = ? AND id = ?').run(a, type, id);
}

function removeArt(appid, id) {
  getDb().prepare('DELETE FROM art WHERE appid = ? AND id = ?').run(String(appid), id);
  incrementalVacuum(256);
}

/** 当前 .gameart 文件大小（字节）——必须用「当前打开的库」路径，而非默认 DB_FILE */
function dbSizeBytes() {
  try {
    if (!_dbPath) return 0;
    return fs.statSync(_dbPath).size;
  } catch (e) {
    return 0;
  }
}

/** 取某游戏每种类型当前「选中」的图（用于写入 Steam） */
function getSelectedArt(appid) {
  const rows = getDb().prepare('SELECT * FROM art WHERE appid = ? AND selected = 1').all(String(appid));
  const out = {};
  for (const r of rows) out[r.type] = r;
  return out;
}

/* ---------------- Steam 账号 & 拥有的游戏 ---------------- */

function listSteamAccounts() {
  const accs = getDb().prepare('SELECT * FROM steam_accounts ORDER BY added_at ASC').all();
  for (const a of accs) {
    a.ownedCount = getDb().prepare('SELECT COUNT(*) AS c FROM owned_games WHERE steam_id64 = ?').get(a.steam_id64).c;
  }
  return accs;
}

function upsertSteamAccount(acc) {
  getDb()
    .prepare(
      'INSERT INTO steam_accounts (steam_id64, persona, avatar, api_key, added_at) VALUES (?,?,?,?,?) ' +
        'ON CONFLICT(steam_id64) DO UPDATE SET persona=excluded.persona, avatar=excluded.avatar, api_key=excluded.api_key'
    )
    .run(String(acc.steamId64), acc.persona || null, acc.avatar || null, acc.apiKey || null, now());
}

function removeSteamAccount(steamId64) {
  getDb().prepare('DELETE FROM owned_games WHERE steam_id64 = ?').run(String(steamId64));
  getDb().prepare('DELETE FROM steam_accounts WHERE steam_id64 = ?').run(String(steamId64));
}

/** 用某个账号拉到的游戏，覆盖该账号的已有记录 */
function replaceOwnedGamesFor(steamId64, list) {
  const d = getDb();
  d.prepare('DELETE FROM owned_games WHERE steam_id64 = ?').run(String(steamId64));
  const stmt = d.prepare('INSERT OR REPLACE INTO owned_games (steam_id64, appid, name, playtime) VALUES (?,?,?,?)');
  for (const g of list) stmt.run(String(steamId64), String(g.appid), g.name || null, g.playtime || 0);
}

/** 所有账号拥有的游戏（按 appid 归并，标注哪些账号拥有） */
function listOwnedGames() {
  const rows = getDb().prepare('SELECT * FROM owned_games').all();
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.appid)) map.set(r.appid, { appid: r.appid, name: r.name, playtime: r.playtime, accounts: [], accountNames: [] });
    const e = map.get(r.appid);
    e.accounts.push(r.steam_id64);
    if (!e.name && r.name) e.name = r.name;
  }
  return Array.from(map.values());
}

function ownedCount() {
  return getDb().prepare('SELECT COUNT(DISTINCT appid) AS c FROM owned_games').get().c;
}

function clearOwnedGames() {
  getDb().exec('DELETE FROM owned_games');
}

/* ---------------- assets ---------------- */

function assetDir(appid) {
  const d = path.join(ASSET_DIR, String(appid));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function assetPath(appid, file) {
  const dir = path.join(ASSET_DIR, String(appid));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, path.basename(file));
}

/* ---------------- 分类（文件夹） ---------------- */

/** 设置分类顺序（按传入的 id 顺序写 categories.sort） */
function setCategoryOrder(ids) {
  const d = getDb();
  const stmt = d.prepare('UPDATE categories SET sort = ? WHERE id = ?');
  (ids || []).forEach((id, i) => stmt.run(i, Number(id)));
}

/** 批量把若干游戏**加入**若干分类（只加不删；用于"多选右键 → 更改分组"） */
function addGameCategories(appids, categoryIds) {
  const d = getDb();
  const stmt = d.prepare('INSERT OR IGNORE INTO game_categories (category_id, appid) VALUES (?, ?)');
  let n = 0;
  for (const a of appids || []) {
    for (const c of categoryIds || []) {
      stmt.run(Number(c), String(a));
      n++;
    }
  }
  return n;
}

/** 生成"显示用缩略图"时要遍历的图（只取元数据，**绝不带 BLOB**；见 §10 #88） */
function listArtForThumbs() {
  return getDb().prepare('SELECT DISTINCT appid, file, type, mime, LENGTH(data) AS bytes FROM art WHERE file IS NOT NULL').all();
}

/** 修正某张图的真实类型（按文件头识别出来的）——用于自愈"从 Steam grid 导入的动图被当成 png"（见 §10 #90） */
function setArtMime(appid, file, mime) {
  try {
    getDb().prepare('UPDATE art SET mime = ? WHERE appid = ? AND file = ?').run(String(mime), String(appid), String(file));
  } catch (e) {
    /* ignore */
  }
}

/** 艺术图占用明细（按类型）——用于 设置→库文件 说明"库为什么这么大" *
 * ⚠️ 性能坑（v1.2.1）：**绝不要**写成 `SELECT type, SUM(LENGTH(data)) FROM art GROUP BY type`！
 * 实测（1425 行 / 471MB BLOB）：整表 GROUP BY **约 2.6 秒**（SQLite 为分组要物化 BLOB），
 * 而**按类型分开查（WHERE type=?）只要 4~6ms**（它只要记录头里的长度，不必读 BLOB 内容）。
 * 这个查询原本挂在 `/api/storage` 上 → 每次打开设置/清理缓存都把后端主进程（= Electron 主进程）
 * 阻塞 3 秒以上，用户看到的是"整个软件卡死"。见 §10 #79。 */
const ART_TYPE_ORDER = ['portrait', 'grid', 'hero', 'logo', 'icon'];
function artTypeStats() {
  const d = getDb();
  const stmt = d.prepare(
    'SELECT COUNT(*) AS n, SUM(LENGTH(data)) AS bytes, SUM(COALESCE(LENGTH(preview),0)) AS preview FROM art WHERE type = ?'
  );
  const out = [];
  let known = new Set(ART_TYPE_ORDER);
  for (const t of ART_TYPE_ORDER) {
    const r = stmt.get(t);
    if (r && r.n) out.push({ type: t, n: r.n, bytes: Number(r.bytes || 0), preview: Number(r.preview || 0) });
  }
  // 兜底：库里若存在非标准类型（历史数据/异常），也用同样的"按类型查"补上
  try {
    for (const row of d.prepare('SELECT DISTINCT type FROM art').all()) {
      const t = row && row.type;
      if (!t || known.has(t)) continue;
      const r = stmt.get(t);
      if (r && r.n) out.push({ type: t, n: r.n, bytes: Number(r.bytes || 0), preview: Number(r.preview || 0) });
    }
  } catch (e) {
    /* ignore */
  }
  return out;
}

function listCategories() {
  const rows = getDb().prepare('SELECT * FROM categories ORDER BY sort ASC, id ASC').all();
  for (const c of rows) {
    c.count = getDb()
      .prepare('SELECT COUNT(*) c FROM game_categories gc JOIN games g ON g.appid = gc.appid AND COALESCE(g.deleted,0)=0 WHERE gc.category_id = ?')
      .get(c.id).c;
  }
  return rows;
}

function addCategory(name) {
  const info = getDb()
    .prepare('INSERT INTO categories (name, sort, added_at) VALUES (?, (SELECT COALESCE(MAX(sort),0)+1 FROM categories), ?)')
    .run(String(name), now());
  return Number(info.lastInsertRowid);
}

function renameCategory(id, name) {
  getDb().prepare('UPDATE categories SET name = ? WHERE id = ?').run(String(name), Number(id));
}

/** 删除分类只会解绑游戏，不删游戏本身 */
function removeCategory(id) {
  getDb().prepare('DELETE FROM game_categories WHERE category_id = ?').run(Number(id));
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(Number(id));
}

/** 用给定 appid 列表覆盖某分类的成员 */
function setCategoryGames(categoryId, appids) {
  const d = getDb();
  d.prepare('DELETE FROM game_categories WHERE category_id = ?').run(Number(categoryId));
  const stmt = d.prepare('INSERT OR IGNORE INTO game_categories (category_id, appid) VALUES (?, ?)');
  for (const a of appids) stmt.run(Number(categoryId), String(a));
}

/** 每个分类的"成员加入顺序"（按 game_categories 的 rowid = 插入顺序） */
function listCategoryMemberOrder() {
  let rows = [];
  try {
    rows = getDb().prepare('SELECT category_id, appid FROM game_categories ORDER BY rowid ASC').all();
  } catch (e) {
    return {};
  }
  const map = {};
  for (const r of rows) {
    const k = String(r.category_id);
    (map[k] = map[k] || []).push(String(r.appid));
  }
  return map;
}

/** 覆盖某个游戏所属的分类 */
function setGameCategories(appid, ids) {
  const d = getDb();
  d.prepare('DELETE FROM game_categories WHERE appid = ?').run(String(appid));
  const stmt = d.prepare('INSERT OR IGNORE INTO game_categories (category_id, appid) VALUES (?, ?)');
  for (const id of ids) stmt.run(Number(id), String(appid));
}

module.exports = {
  DB_FILE,
  ASSET_DIR,
  getDb,
  openDatabase,
  currentDbPath,
  closeDatabase,
  getSetting,
  setSetting,
  listGames,
  getGame,
  getActiveGame,
  addGame,
  setGameSgdbId,
  updateGameName,
  setGameNameZh,
  gamesMissingNameZh,
  changeAppId,
  purgeGame,
  softDeleteGame,
  restoreGame,
  listDeletedGames,
  listArt,
  getArtByFile,
  addArt,
  setArtPreview,
  listArtsNeedingPreview,
  selectArt,
  removeArt,
  reorderArt,
  dbSizeBytes,
  incrementalVacuum,
  getSelectedArt,
  assetDir,
  assetPath,
  listSteamAccounts,
  upsertSteamAccount,
  removeSteamAccount,
  replaceOwnedGamesFor,
  listOwnedGames,
  ownedCount,
  clearOwnedGames,
  listCategories,
  addCategory,
  renameCategory,
  removeCategory,
  setCategoryGames,
  setGameCategories,
  listCategoryMemberOrder,
  setCategoryOrder,
  addGameCategories,
  artTypeStats,
  listArtForThumbs,
  setArtMime,
};
