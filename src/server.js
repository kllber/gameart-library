'use strict';

/**
 * server.js —— 游戏艺术库 v0.3（只读 + 库管理 + SGDB + 写入）
 *
 * 新增：
 *   - 本地库（data/library.gameart，SQLite）
 *   - 「同步 Steam 游戏库」：检测全部游戏 → 勾选 → 导入库
 *   - SteamGridDB 搜索 / 取图 / 下载
 *   - 「导入到 Steam」：单个 / 全部，写入前检查 Steam 未运行、自动备份
 *
 * 安全：仅监听 127.0.0.1；写入只针对 config\grid；不注入、不 hook。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const steam = require('./steam');
const db = require('./db');
const sgdb = require('./sgdb');
const steamwrite = require('./steamwrite');
const steamapi = require('./steamapi');
const defaultart = require('./defaultart');
const workspace = require('./workspace');
const fileassoc = require('./fileassoc');
const platform = require('./platform');

/** 是否允许"证书失败时回退为不校验证书"（默认开：公司代理/自签证书环境否则抓不到 SGDB 图）。 */
function allowInsecureTls() {
  try {
    return db.getSetting('allow_insecure_tls') !== '0';
  } catch (e) {
    return true;
  }
}
function syncTlsSetting() {
  try {
    sgdb.setInsecureFallback(allowInsecureTls());
  } catch (e) {
    /* ignore */
  }
}

/** 各视图的自定义顺序：{ all: [...], "<catId>": [...] }（存 settings.custom_order_map；兼容旧的 custom_order） */
function getCustomOrders() {
  let map = {};
  try {
    map = JSON.parse(db.getSetting('custom_order_map') || '{}') || {};
  } catch (e) {
    map = {};
  }
  if (!map.all) {
    try {
      const old = JSON.parse(db.getSetting('custom_order') || '[]');
      if (Array.isArray(old) && old.length) map.all = old.map(String);
    } catch (e) {
      /* ignore */
    }
  }
  return map;
}

const UI_DEFAULTS = { theme: 'dark', accent: 'cyan', lang: 'zh', gameLang: 'zh', gridSize: 'medium', sort: 'added' };
function getUiSettings() {
  try {
    return { ...UI_DEFAULTS, ...JSON.parse(db.getSetting('ui') || '{}') };
  } catch (e) {
    return { ...UI_DEFAULTS };
  }
}

const { ROOT, DATA_DIR, TMP_DIR } = require('./paths');
const PUBLIC_DIR = path.join(ROOT, 'public');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 5178);
/** 版本号单一来源：前端从 /api/status 读取，避免多处硬编码对不上 */
const APP_VERSION = 'v1.3.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendFile(res, full, mime, maxAge) {
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const head = { 'Content-Type': mime || 'application/octet-stream', 'Content-Length': data.length };
    if (maxAge) head['Cache-Control'] = 'private, max-age=' + Number(maxAge);
    res.writeHead(200, head);
    res.end(data);
  });
}

/** 按文件头（magic bytes）识别图片类型，避免扩展名与实际内容不一致 */
function sniffImageMime(buf) {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}

/**
 * 按文件头识别图片类型并返回图片；`maxAge`（秒）会给响应加 `Cache-Control`。
 * 为什么要缓存：主页/详情/选图器里的图片全部走本接口，而**库内图片是"文件名唯一、内容不变"**的
 * （新图 = 新文件名），所以可以放心让浏览器缓存。没有缓存头时，Chromium 每次重渲染/滚动回来
 * 都要重新下载整张图（几百张、单张可达几十 MB）→ 滚动卡顿、切换显示类型卡顿、偶发白屏。见 §10 #81。
 */
function sendImageAuto(res, full, maxAge) {
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    const mime = sniffImageMime(data) || MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    const head = { 'Content-Type': mime, 'Content-Length': data.length };
    if (maxAge) head['Cache-Control'] = 'private, max-age=' + Number(maxAge);
    res.writeHead(200, head);
    res.end(data);
  });
}

/** 下载动图预览（.webm）到内存；失败返回 null。临时文件用 try/finally 保证清理（见 §10 #50/#55）。 */
async function downloadPreview(url) {
  if (!url) return null;
  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const tmp = path.join(TMP_DIR, 'pv_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.webm');
    try {
      await sgdb.downloadTo(url, tmp);
      return fs.readFileSync(tmp);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch (e) {
        /* ignore */
      }
    }
  } catch (e) {
    return null;
  }
}

/** 把某游戏"当前选用"的图落地为 .tmp 临时文件（供写入 Steam），并记录以便清理 */
function selectedFilesFor(appid, created) {
  const sel = db.getSelectedArt(appid);
  const map = {};
  fs.mkdirSync(TMP_DIR, { recursive: true });
  let n = 0;
  for (const [type, art] of Object.entries(sel)) {
    if (!art.data) continue;
    const ext = path.extname(art.file || '.png').toLowerCase() || '.png';
    const tmp = path.join(TMP_DIR, `apply_${appid}_${type}_${Date.now()}_${n++}${ext}`);
    try {
      fs.writeFileSync(tmp, Buffer.isBuffer(art.data) ? art.data : Buffer.from(art.data));
      map[type] = tmp;
      if (created) created.push(tmp);
    } catch (e) {
      /* ignore */
    }
  }
  return map;
}
function cleanupFiles(arr) {
  for (const f of arr || []) {
    try {
      fs.unlinkSync(f);
    } catch (e) {
      /* ignore */
    }
  }
}

/* ---------------- 显示用缩略图（**渲染端生成，服务端只负责缓存**；见 §10 #88） ----------------
 *
 * 为什么这么做：库里可能有单张几十 MB 的大图，卡片只有 150~430px 宽，**首次解码**这种大图
 * 会出现几百毫秒的单帧尖峰（实测大背景模式 536ms）。
 *
 * 设计要点（**刻意排除"同步漏洞"**）：
 *   · **没有持久化队列、没有任务状态** —— 缓存文件在就是"做好了"，不在就是"没做"。重开软件
 *     只会重新问一次"缺哪些"，**永远不会像以前那样"待办丢了/卡在旧状态"**。
 *   · **生成放在渲染进程**（Chromium 的 `createImageBitmap({resizeWidth})` 可以**按缩略尺寸解码**，
 *     比主进程 `nativeImage` 更快，且**完全不阻塞 Electron 主进程**）。
 *   · GET `/asset` **只读缓存**：命中就用缩略图，没命中**立刻返回原图**（绝不等待生成、绝不失败）。
 *   · 服务端只接受"库内真实存在的图"，且**原子写入**（临时文件 + rename）。
 */
const THUMB_DIR = path.join(DATA_DIR, 'cache', 'thumbs');
const THUMB_MIN_W = 320;
const THUMB_MAX_W = 1400;

function thumbsEnabled() {
  try {
    return db.getSetting('thumbs') !== '0';
  } catch (e) {
    return true;
  }
}
/** 可安全用于文件名的字符（防目录穿越） */
function safeName(s) {
  return String(s || '').replace(/[^0-9A-Za-z._-]/g, '_').slice(0, 140);
}
/** 动图 / 矢量不缩（要保动画与矢量） */
function skipThumbMime(mime) {
  return /webp|gif|svg/i.test(String(mime || ''));
}
/** 需要保留透明通道的类型 → PNG；其余 → JPEG */
function thumbExt(type) {
  return String(type) === 'icon' || String(type) === 'logo' ? '.png' : '.jpg';
}
function thumbFile(appid, file, w, ext) {
  return path.join(THUMB_DIR, safeName(appid) + '__' + safeName(file) + '__w' + w + ext);
}
function readThumb(appid, file, w, ext) {
  try {
    const buf = fs.readFileSync(thumbFile(appid, file, w, ext));
    return buf && buf.length ? buf : null;
  } catch (e) {
    return null;
  }
}

/* ---------------- 存储占用 / 清理 ---------------- */
const fsp = require('fs').promises;
const CACHE_DIR = path.join(DATA_DIR, 'cache', 'defaultart');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');

/**
 * 递归统计目录大小（**异步**）。
 * 为什么要异步：这个函数在 Electron 里跑在**主进程**上，同步版（`fs.readdirSync/statSync`）
 * 遇到几万个文件（例如备份里有 30 份 × 多账号 × 上千张图）会把主进程阻塞好几秒 →
 * **整个软件窗口卡死无响应**。异步版把等待交还给事件循环，界面照常响应。见 §10 #80。
 */
async function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      total += await dirSize(p);
    } else if (e.isFile()) {
      try {
        total += (await fsp.stat(p)).size;
      } catch (er) {
        /* 文件可能刚被删 */
      }
    }
  }
  return total;
}

// 占用结果缓存（默认 30 秒）：目录大小变化慢，没必要每次打开设置都重新遍历一遍
let _storageCache = { t: 0, info: null };
const STORAGE_TTL_MS = 30 * 1000;

async function storageInfo(force) {
  if (!force && _storageCache.info && Date.now() - _storageCache.t < STORAGE_TTL_MS) return _storageCache.info;
  const [cacheBytes, backupBytes, tmpBytes, thumbBytes] = await Promise.all([
    dirSize(CACHE_DIR),
    dirSize(BACKUP_DIR),
    dirSize(TMP_DIR),
    dirSize(THUMB_DIR),
  ]);
  _storageCache = { t: Date.now(), info: { dataDir: DATA_DIR, tmpDir: TMP_DIR, cacheBytes, backupBytes, tmpBytes, thumbBytes } };
  return _storageCache.info;
}

/** 清理（**异步**，理由同 dirSize；见 §10 #80） */
async function cleanStorage(target) {
  const rm = async (dir) => {
    let n = 0;
    let entries;
    try {
      entries = await fsp.readdir(dir);
    } catch (e) {
      return 0;
    }
    for (const e of entries) {
      try {
        await fsp.rm(path.join(dir, e), { recursive: true, force: true });
        n++;
      } catch (er) {
        /* ignore */
      }
    }
    return n;
  };
  const removed = {};
  if (target === 'cache' || target === 'all') removed.cache = await rm(CACHE_DIR);
  if (target === 'thumbs' || target === 'cache' || target === 'all') removed.thumbs = await rm(THUMB_DIR);
  if (target === 'backups' || target === 'all') removed.backups = await rm(BACKUP_DIR);
  if (target === 'tmp' || target === 'all') removed.tmp = await rm(TMP_DIR);
  _storageCache = { t: 0, info: null }; // 清理后强制重算
  return removed;
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

/** 读**原始二进制** body（缩略图上传用；见 §10 #88）。超过 maxBytes 直接中断，避免被塞爆内存。 */
function readRawBody(req, maxBytes) {
  const cap = maxBytes || 4 * 1024 * 1024;
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > cap) {
        try {
          req.destroy();
        } catch (e) {
          /* ignore */
        }
        return finish(null);
      }
      chunks.push(c);
    });
    req.on('end', () => finish(Buffer.concat(chunks)));
    req.on('error', () => finish(null));
  });
}

/* ---------------- Steam 检测状态（缓存） ---------------- */

let state = null;
function ensureState() {
  if (state) return state;
  const steamPaths = steam.detectSteamPaths();
  const sources = steam.buildSources(steamPaths);
  const { names, nonSteam, library } = steam.collectGameNames(steamPaths);
  const srcDirs = sources.map((s) => s.gridDir);

  const raw = steam.scanAllGrids(sources); // [{appid, artwork:{type:[{src,file,size,account}]}, meta, accounts}]
  const artByAppid = new Map();
  for (const g of raw) artByAppid.set(g.appid, g);

  // 检测到的全部游戏 = 真实库(已安装/非Steam) ∪ 有自定义封面的
  const detectedIds = new Set([...library, ...artByAppid.keys()]);
  const detected = [];
  for (const appid of detectedIds) {
    const ag = artByAppid.get(appid) || null;
    let artCount = 0;
    if (ag) {
      // 按文件名去重（同一张图可能在多个账号的 grid 里各存一份）
      for (const t of steam.ART_TYPES) {
        const seen = new Set();
        for (const it of ag.artwork[t]) seen.add(it.file);
        artCount += seen.size;
      }
    }
    detected.push({
      appid,
      name: names[appid] || null,
      isNonSteam: nonSteam.has(appid),
      artCount,
      installed: library.has(appid),
    });
  }
  detected.sort((a, b) => (a.name || a.appid).localeCompare(b.name || b.appid, 'zh'));

  // 名字 -> appid（用于「添加游戏」时把 SGDB 搜到的游戏名解析成 Steam AppID）
  const nameToAppid = {};
  for (const [appid, nm] of Object.entries(names)) {
    const k = String(nm || '').toLowerCase().trim();
    if (k && !nameToAppid[k]) nameToAppid[k] = appid;
  }

  state = { steamPaths, sources, srcDirs, names, nonSteam, artByAppid, detected, nameToAppid };
  return state;
}

/* ---------------- API ---------------- */

/* 把解析出的默认图登记为库资产（图片以 BLOB 存入 .gameart） */
function registerDefaultArt(s, appid, type, r) {
  try {
    if (!db.getActiveGame(appid)) db.addGame(appid, s.names[appid] || null, s.nonSteam.has(appid));
    const ext = path.extname(r.path).toLowerCase() || '.png';
    const fileName = 'default_' + type + ext;
    const buf = fs.readFileSync(r.path);
    return db.addArt(appid, {
      type,
      source: r.source === 'sgdb' ? 'sgdb' : 'steam',
      file: fileName,
      mime: MIME[ext] || 'image/png',
      data: buf,
      url: 'defaultart:' + type,
    });
  } catch (e) {
    return null;
  }
}

/* ---- 自动同步：把（拥有/检测到的）游戏全部纳入库，导入已有自定义图，并补全缺失类型的默认图 ---- */
let importJob = { running: false, total: 0, done: 0, added: 0, imported: 0, failed: 0 };

/** 把用户在 Steam 里已自定义的 grid 图导入库（只补该类型还没有的） */
function importExistingGridArt(s, appid, have) {
  const ag = s.artByAppid.get(appid);
  if (!ag) return;
  for (const t of steam.ART_TYPES) {
    if (have[t]) continue;
    const seen = new Set();
    for (const it of ag.artwork[t]) {
      if (seen.has(it.file)) continue;
      seen.add(it.file);
      try {
        const srcFull = path.join(s.srcDirs[it.src], it.file);
        const buf = fs.readFileSync(srcFull);
        const ext = path.extname(it.file).toLowerCase();
        db.addArt(appid, {
          type: t,
          source: 'steam',
          file: it.file,
          mime: MIME[ext] || 'image/png',
          data: buf,
          url: 'steam:' + it.file,
        });
        have[t] = true;
        importJob.imported++;
      } catch (e) {
        /* ignore */
      }
    }
  }
}

/* ---- 默认图补全：持久化队列（存库内，退出/断电后重开可继续） ---- */
function readFillQueue() {
  try {
    const raw = db.getSetting('fill_queue');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (e) {
    return [];
  }
}
function writeFillQueue(list) {
  try {
    const clean = Array.from(new Set((list || []).map(String)));
    db.setSetting('fill_queue', clean.length ? JSON.stringify(clean) : '');
  } catch (e) {
    /* ignore */
  }
}

/**
 * 只对给定游戏补全（"从 Steam 库添加"导入选中后调用 / 手动"全库补全"），后台执行。
 * **会把待办并入库内的持久化队列**：中途关闭软件，下次打开该库时自动继续（见 §6.x / 坑 #69）。
 */
async function runFillFor(appids) {
  // ① 并入队列（已完成的会被逐个剔除，所以重入总是安全的）
  const merged = readFillQueue();
  for (const id of (appids || []).map(String)) if (!merged.includes(id)) merged.push(id);
  writeFillQueue(merged);
  if (importJob.running) return; // 已在跑：队列已并入，跑完自然接着做

  const s = ensureState();
  const key = db.getSetting('sgdb_api_key');
  const remaining0 = readFillQueue().length;
  importJob = { running: true, total: remaining0, done: 0, added: 0, imported: 0, failed: 0 };

  let guard = 0;
  while (true) {
    const queue = readFillQueue();
    if (!queue.length) break;
    if (++guard > 20000) break; // 安全上限
    const appid = String(queue[0]);
    try {
      if (/^\d+$/.test(appid)) {
        const have = {};
        for (const a of db.listArt(appid)) have[a.type] = true;
        importExistingGridArt(s, appid, have);
        for (const t of steam.ART_TYPES) {
          if (have[t]) continue;
          const r = await defaultart.resolveFor(s.steamPaths, appid, t, key);
          if (r) {
            registerDefaultArt(s, appid, t, r);
            importJob.added++;
          }
        }
      }
    } catch (e) {
      importJob.failed++;
    }
    // ② 完成一个就从队列里剔除（这样"边做边存"，不会丢进度）
    writeFillQueue(readFillQueue().filter((x) => x !== appid));
    importJob.done++;
    importJob.total = importJob.done + readFillQueue().length;
  }
  importJob.running = false;
  db.setSetting('bootstrapped', '1');
}

/**
 * 自愈：把库里**名字为空**的 Steam 游戏补上名字。
 * 数据来源只用 **Steam Web API 的拥有列表**（纯数据库查询，**不触发 Steam 扫描**，所以放在"打开库"里也不卡）。
 * 历史 bug：导入时只查了 `s.detected`/`appinfo`，没用 `owned_games.name`（见 §10 #70）。
 * 非 Steam 快捷方式的名字来自 shortcuts.vdf，不在这里猜。
 */
function repairGameNames() {
  try {
    const owned = new Map(db.listOwnedGames().map((o) => [String(o.appid), o.name]));
    if (!owned.size) return 0;
    let fixed = 0;
    for (const g of db.listGames()) {
      if (g.name && String(g.name).trim()) continue;
      if (g.is_non_steam) continue;
      const nm = owned.get(String(g.appid));
      if (nm) {
        db.updateGameName(g.appid, nm);
        fixed++;
      }
    }
    return fixed;
  } catch (e) {
    return 0;
  }
}

/**
 * 打开库后的收尾（**不能阻塞打开请求**）：
 *  1) 自愈补名字（纯 DB，很快）；
 *  2) 若上次的默认图补全没跑完 → **稍后自动继续**（后台任务 + 侧栏进度）。
 */
function afterOpen() {
  try {
    repairGameNames();
    if (readFillQueue().length) setTimeout(() => runFillFor([]).catch(() => {}), 500);
  } catch (e) {
    /* ignore */
  }
}

/* runAutoBootstrap 已移除：绑定账号不再自动导入游戏；补全默认图改用 runFillFor(库内游戏)。 */

/* ---- 拉取简体中文游戏名（后台任务） ---- */
let nameJob = { running: false, total: 0, done: 0, ok: 0, failed: 0, none: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "商店确认没有中文名"的 appid 列表（存库内，避免每次重复请求同一批游戏 —— 见 §10 #71） */
function readNameZhNone() {
  try {
    const a = JSON.parse(db.getSetting('name_zh_none') || '[]');
    return Array.isArray(a) ? a.map(String) : [];
  } catch (e) {
    return [];
  }
}
function writeNameZhNone(list) {
  try {
    db.setSetting('name_zh_none', JSON.stringify(Array.from(new Set((list || []).map(String)))));
  } catch (e) {
    /* ignore */
  }
}

async function runFetchZhNames() {
  if (nameJob.running) return;
  const noneSet = new Set(readNameZhNone());
  const list = db.gamesMissingNameZh().filter((g) => !noneSet.has(String(g.appid)));
  nameJob = { running: true, total: list.length, done: 0, ok: 0, failed: 0, none: 0 };
  for (const g of list) {
    const appid = String(g.appid);
    try {
      const nz = await defaultart.getStoreNameZh(appid);
      if (nz) {
        db.setGameNameZh(appid, nz);
        nameJob.ok++;
      } else {
        // 商店确认没有中文名 → 记住，下次不再重复请求（否则会永远"0/20"）
        noneSet.add(appid);
        nameJob.none++;
      }
    } catch (e) {
      nameJob.failed++; // 网络失败 → 不记，下次重试
    }
    nameJob.done++;
    await sleep(1000); // 节流，避免触发 Steam 商店限流
  }
  writeNameZhNone([...noneSet]);
  nameJob.running = false;
}

/* ---- 补全动图预览（后台任务）：为库内动图找到并下载 SGDB 的 .webm 预览 ---- */
let previewJob = { running: false, total: 0, done: 0, ok: 0, failed: 0 };

async function findPreviewUrl(art, key) {
  const gameId = art.game_sgdb_id || art.sgdb_id;
  if (!gameId || !art.sgdb_id) return null;
  for (let page = 0; page <= 20; page++) {
    let r;
    try {
      r = await sgdb.getArt(art.type, gameId, key, { page, types: 'static,animated', nsfw: 'any', humor: 'any', epilepsy: 'any' });
    } catch (e) {
      return null;
    }
    const hit = (r.arts || []).find((x) => String(x.sgdb_id) === String(art.sgdb_id));
    if (hit) return hit.thumb || null;
    if (!r.hasMore) break;
  }
  return null;
}

async function runFetchPreviews() {
  if (previewJob.running) return;
  const key = db.getSetting('sgdb_api_key');
  const list = db.listArtsNeedingPreview();
  previewJob = { running: true, total: list.length, done: 0, ok: 0, failed: 0 };
  if (!key) {
    previewJob.running = false;
    return;
  }
  for (const a of list) {
    try {
      const url = await findPreviewUrl(a, key);
      if (url && /\.webm(\?|$)/i.test(url)) {
        const buf = await downloadPreview(url);
        if (buf) {
          db.setArtPreview(a.appid, a.file, buf, 'video/webm');
          previewJob.ok++;
        } else previewJob.failed++;
      } else previewJob.failed++;
    } catch (e) {
      previewJob.failed++;
    }
    previewJob.done++;
  }
  previewJob.running = false;
}

/* ---- 批量同步到 Steam（后台任务 + 进度；复用账号探测与单一备份目录，避免大量游戏时卡死/建一堆备份） ---- */
let applyJob = { running: false, total: 0, done: 0, ok: 0, failed: 0, steamRunning: false, error: null };
const wsleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- appid → SteamGridDB 游戏（内存缓存 10 分钟，避免反复等网络；见 §10 #83） ---- */
const sgdbGameCacheMem = new Map();
const SGDB_GAME_TTL_MS = 10 * 60 * 1000;

async function runApplyBatch(appids) {
  if (applyJob.running) return;
  applyJob = { running: true, total: appids.length, done: 0, ok: 0, failed: 0, steamRunning: false, error: null };
  let sources = [];
  try {
    sources = steam.buildSources(steam.detectSteamPaths());
  } catch (e) {
    sources = [];
  }
  const backupDir = path.join(DATA_DIR, 'backup', new Date().toISOString().replace(/[:.]/g, '-'));
  for (const appid of appids) {
    const created = [];
    try {
      if (!/^\d+$/.test(String(appid))) {
        applyJob.failed++;
      } else {
        const files = selectedFilesFor(appid, created);
        if (!Object.keys(files).length) {
          applyJob.failed++;
        } else {
          const r = await steamwrite.apply(appid, files, { sources, backupDir, skipPrune: true });
          applyJob.steamRunning = r.steamRunning;
          applyJob.ok++;
        }
      }
    } catch (e) {
      applyJob.failed++;
    } finally {
      cleanupFiles(created);
    }
    applyJob.done++;
    await wsleep(12); // 轻微节流：别瞬间写上千个文件把 Steam 的目录监控打爆
  }
  try {
    steamwrite.pruneBackups(); // 整批结束后统一清理旧备份
  } catch (e) {
    /* ignore */
  }
  applyJob.running = false;
}

async function handleApi(req, res, pathname, query) {
  // ---- 工作库（.gameart）选择/新建 ----
  if (pathname === '/api/workspace' && req.method === 'GET') {
    return sendJson(res, 200, {
      current: db.currentDbPath(),
      hasCurrent: !!db.currentDbPath(),
      recent: workspace.loadRecent(),
    });
  }
  if (pathname === '/api/workspace/open' && req.method === 'POST') {
    const body = await readBody(req);
    const p = String(body.path || '').trim();
    if (!p || !fs.existsSync(p)) return sendJson(res, 200, { ok: false, error: '文件不存在' });
    try {
      db.openDatabase(p);
      workspace.addRecent(p);
      syncTlsSetting();
      afterOpen(); // 打开库后的收尾：补名字 + 续跑未完成的默认图补全（不阻塞）
      return sendJson(res, 200, { ok: true, current: db.currentDbPath() });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }
  if (pathname === '/api/workspace/pick' && req.method === 'POST') {
    const p = await workspace.pickOpenFile();
    if (!p) return sendJson(res, 200, { ok: false, canceled: true });
    if (!fs.existsSync(p)) return sendJson(res, 200, { ok: false, error: '文件不存在' });
    try {
      db.openDatabase(p);
      workspace.addRecent(p);
      syncTlsSetting();
      afterOpen(); // 打开库后的收尾：补名字 + 续跑未完成的默认图补全（不阻塞）
      return sendJson(res, 200, { ok: true, current: db.currentDbPath() });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }
  if (pathname === '/api/workspace/new' && req.method === 'POST') {
    let p = await workspace.pickSaveFile();
    if (!p) return sendJson(res, 200, { ok: false, canceled: true });
    if (!/\.gameart$/i.test(p)) p += '.gameart';
    try {
      db.openDatabase(p);
      workspace.addRecent(p);
      syncTlsSetting();
      afterOpen(); // 打开库后的收尾：补名字 + 续跑未完成的默认图补全（不阻塞）
      return sendJson(res, 200, { ok: true, current: db.currentDbPath() });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }
  if (pathname === '/api/workspace/close' && req.method === 'POST') {
    db.closeDatabase();
    return sendJson(res, 200, { ok: true });
  }

  // ---- .gameart 文件关联（Windows 注册表 / Linux freedesktop）----
  if (pathname === '/api/assoc/status') {
    return sendJson(res, 200, await fileassoc.getStatus());
  }
  if (pathname === '/api/assoc/register' && req.method === 'POST') {
    try {
      return sendJson(res, 200, { ok: true, ...(await fileassoc.register()) });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }
  if (pathname === '/api/assoc/unregister' && req.method === 'POST') {
    try {
      return sendJson(res, 200, { ok: true, ...(await fileassoc.unregister()) });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }
  if (pathname === '/api/assoc/shortcut' && req.method === 'POST') {
    try {
      return sendJson(res, 200, { ok: true, ...(await fileassoc.createDesktopShortcut()) });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }

  // ---- 开发调试：窗口截图 / 在渲染进程执行 JS（仅本地 Electron，用于自检 UI）----
  if (pathname === '/api/dev/shot' && req.method === 'GET') {
    if (!global.__electronDev) {
      res.writeHead(400);
      res.end('not available');
      return;
    }
    try {
      let buf = Buffer.from(await global.__electronDev.capture(), 'base64');
      // 可选 JPEG 输出（README 截图用，体积小很多）：?format=jpeg&q=82&maxw=1600
      const fmt = String(query.get('format') || 'png').toLowerCase();
      if (fmt === 'jpeg' || fmt === 'jpg') {
        try {
          const { nativeImage } = require('electron');
          let img = nativeImage.createFromBuffer(buf);
          const maxw = Number(query.get('maxw')) || 0;
          const size = img.getSize();
          if (maxw && size.width > maxw) {
            const scale = maxw / size.width;
            img = img.resize({ width: maxw, height: Math.round(size.height * scale) });
          }
          const q = Math.min(100, Math.max(1, Number(query.get('q')) || 82));
          buf = img.toJPEG(q);
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length });
          res.end(buf);
          return;
        } catch (e) {
          /* 回退 PNG */
        }
      }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': buf.length });
      res.end(buf);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
    return;
  }
  if (pathname === '/api/dev/eval' && req.method === 'POST') {
    const body = await readBody(req);
    if (!global.__electronDev) return sendJson(res, 200, { ok: false, error: 'not available' });
    try {
      const v = await global.__electronDev.eval(body.code || '');
      return sendJson(res, 200, { ok: true, value: v });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }

  // 未打开库时，其余接口提示需要选择库
  if (!db.currentDbPath()) return sendJson(res, 409, { needWorkspace: true });

  // Windows：Steam 安装路径以前是**同步**跑 `reg query`（阻塞主进程 → 窗口卡顿）。
  // 现在改为"启动时异步预取 + 这里 await"（非阻塞、且只做一次；见 §10 #82）。
  await platform.prefetchSteamCandidates();
  const s = ensureState();

  if (pathname === '/api/status') {
    const accs = db.listSteamAccounts();
    return sendJson(res, 200, {
      version: APP_VERSION,
      steamPaths: s.steamPaths,
      accountCount: s.sources.length,
      steamRunning: await steamwrite.isSteamRunning(),
      hasApiKey: !!db.getSetting('sgdb_api_key'),
      steamBound: accs.length > 0,
      steamAccounts: accs.length,
      ownedCount: db.ownedCount(),
      dbFile: db.currentDbPath(),
      dbSize: db.dbSizeBytes(),
      // 库文件是否还在原处（用户可能在外部重命名/移动过；用于界面提示，见 §6.10）
      dbFileExists: (() => {
        const p = db.currentDbPath();
        try {
          return !!p && fs.existsSync(p);
        } catch (e) {
          return false;
        }
      })(),
      runtime: { node: process.versions.node, electron: process.versions.electron || null },
    });
  }

  if (pathname === '/api/steam/account' && req.method === 'GET') {
    return sendJson(res, 200, {
      accounts: db.listSteamAccounts(),
      localUsers: steam.detectLoginUsers(s.steamPaths),
      ownedCount: db.ownedCount(),
    });
  }

  if (pathname === '/api/steam/bind' && req.method === 'POST') {
    const body = await readBody(req);
    const key = String(body.apiKey || '').trim();
    const raw = String(body.steamId || '').trim();
    if (!key) return sendJson(res, 200, { ok: false, error: '请填写 Steam Web API Key' });
    const parsed = steamapi.extractSteamId(raw);
    if (!parsed) return sendJson(res, 200, { ok: false, error: '无法识别 SteamID / 主页链接，请填 SteamID64 或主页地址' });
    try {
      let id64 = parsed.steamid64;
      if (!id64) id64 = await steamapi.resolveVanity(parsed.vanity, key);
      const owned = await steamapi.getOwnedGames(id64, key);
      const info = await steamapi.getPlayerSummary(id64, key);
      db.upsertSteamAccount({ steamId64: id64, persona: info.persona, avatar: info.avatar, apiKey: key });
      db.replaceOwnedGamesFor(id64, owned);
      // 绑定只拉取"拥有清单"；不自动导入游戏（由用户去「从 Steam 库添加」手动选择）
      return sendJson(res, 200, {
        ok: true,
        steamId64: id64,
        persona: info.persona || null,
        ownedCount: owned.length,
        totalOwned: db.ownedCount(),
        warning: owned.length === 0 ? '未获取到游戏：请把该账号 Steam 资料的「游戏详情」设为公开后重试' : null,
      });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/steam/unbind' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.steamId64) {
      db.removeSteamAccount(String(body.steamId64));
    } else {
      for (const a of db.listSteamAccounts()) db.removeSteamAccount(a.steam_id64);
    }
    return sendJson(res, 200, { ok: true });
  }

  // 重新拉取"已拥有"列表（买了新游戏后刷新）
  if (pathname === '/api/steam/refresh' && req.method === 'POST') {
    const accs = db.listSteamAccounts();
    if (!accs.length) return sendJson(res, 200, { ok: false, error: '尚未绑定账号' });
    const results = [];
    let total = 0;
    for (const a of accs) {
      if (!a.api_key) {
        results.push({ steamId64: a.steam_id64, error: '无 API Key' });
        continue;
      }
      try {
        const owned = await steamapi.getOwnedGames(a.steam_id64, a.api_key);
        db.replaceOwnedGamesFor(a.steam_id64, owned);
        total += owned.length;
        results.push({ steamId64: a.steam_id64, count: owned.length });
      } catch (e) {
        results.push({ steamId64: a.steam_id64, error: e.message });
      }
    }
    const namesFixed = repairGameNames(); // 拥有列表变了 → 顺手把"没名字"的游戏补上（见 §10 #70）
    return sendJson(res, 200, { ok: true, results, ownedCount: db.ownedCount(), namesFixed });
  }

  // 存储占用 / 清理（异步 + 缓存，避免遍历几万个文件时阻塞主进程 → 窗口卡死；见 §10 #80）
  if (pathname === '/api/storage' && req.method === 'GET') {
    const info = await storageInfo();
    return sendJson(res, 200, { ...info, artStats: db.artTypeStats() });
  }
  if (pathname === '/api/storage/clean' && req.method === 'POST') {
    const body = await readBody(req);
    const removed = await cleanStorage(String(body.target || ''));
    const info = await storageInfo(true);
    return sendJson(res, 200, { ok: true, removed, ...info, artStats: db.artTypeStats() });
  }

  /* ---- 显示用缩略图（渲染端生成 → 这里只负责"问缺哪些"和"存下来"；见 §10 #88） ---- */
  // 问：当前宽度下，哪些图还没有缩略图？（**只读**，拿不到就返回空，前端会跳过）
  if (pathname === '/api/thumbs/missing' && req.method === 'GET') {
    if (!thumbsEnabled()) return sendJson(res, 200, { enabled: false, items: [] });
    const w = Math.min(THUMB_MAX_W, Math.max(THUMB_MIN_W, Math.round(Number(query.get('w')) || 0)));
    const items = [];
    try {
      for (const a of db.listArtForThumbs()) {
        if (!a.file || skipThumbMime(a.mime)) continue;
        // 小于 150KB 的原图本来就不必缩（缩了也不会明显变小）→ 直接不列出来，省掉一次下载+解码
        if (Number(a.bytes || 0) < 150 * 1024) continue;
        const dest = thumbFile(a.appid, a.file, w, thumbExt(a.type));
        let ok = false;
        try {
          ok = fs.statSync(dest).size > 0;
        } catch (e) {
          ok = false;
        }
        if (!ok) {
          // ".skip" = 上次渲染端判定"原图本来就不大，缩了也不变小" → 别再反复试
          let skip = false;
          try {
            skip = fs.statSync(dest + '.skip').isFile();
          } catch (e) {
            skip = false;
          }
          if (!skip) {
            items.push({ appid: String(a.appid), file: a.file, type: a.type, bytes: Number(a.bytes || 0) });
            if (items.length >= 300) break; // 分批，前端循环取
          }
        }
      }
    } catch (e) {
      return sendJson(res, 200, { enabled: true, w, items: [], error: e.message });
    }
    return sendJson(res, 200, { enabled: true, w, items });
  }

  // 存：渲染端把生成好的缩略图交过来 → 原子落盘
  if (pathname === '/api/thumbs/save' && req.method === 'POST') {
    // 支持两种提交：① **原始字节**（推荐：浏览器用 `canvas.convertToBlob()` **异步**编码后直接 POST，
    // 不在渲染主线程上同步编码，避免和 UI 抢时间）② JSON {dataUrl}（兼容旧路径）
    const ctype = String(req.headers['content-type'] || '');
    let appid = '';
    let file = '';
    let w = 0;
    let skip = false;
    let buf = null;
    if (/^image\//i.test(ctype)) {
      appid = String(query.get('appid') || '');
      file = String(query.get('file') || '');
      w = Math.round(Number(query.get('w')) || 0);
      buf = await readRawBody(req);
    } else {
      const body = await readBody(req);
      appid = String(body.appid || '');
      file = String(body.file || '');
      w = Math.round(Number(body.w) || 0);
      skip = !!body.skip;
      const m = String(body.dataUrl || '').match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/i);
      if (m) {
        try {
          buf = Buffer.from(m[2], 'base64');
        } catch (e) {
          buf = null;
        }
      }
    }
    if (!appid || !file || !(w >= THUMB_MIN_W && w <= THUMB_MAX_W)) return sendJson(res, 400, { error: '参数不足' });
    const row = db.getArtByFile(appid, file); // 只接受"库内真实存在的图"
    if (!row) return sendJson(res, 404, { error: 'no such art' });
    if (skipThumbMime(row.mime)) return sendJson(res, 200, { ok: false, skipped: 'animated' });
    const ext = thumbExt(row.type);
    // 渲染端判定"原图本来就不大，缩了也不变小" → 只留一个 .skip 标记，避免以后反复尝试（幂等、可随缓存清掉）
    if (skip) {
      try {
        fs.mkdirSync(THUMB_DIR, { recursive: true });
        fs.writeFileSync(thumbFile(appid, file, w, ext) + '.skip', '1');
      } catch (e) {
        /* ignore */
      }
      return sendJson(res, 200, { ok: false, skipped: 'too-small' });
    }
    if (!buf || !buf.length || buf.length > 3 * 1024 * 1024) return sendJson(res, 400, { error: '图片数据异常' });
    const dest = thumbFile(appid, file, w, ext);
    try {
      fs.mkdirSync(THUMB_DIR, { recursive: true });
      const tmp = dest + '.tmp' + Date.now();
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, dest); // 原子替换：绝不会留下半个文件
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message });
    }
    _storageCache = { t: 0, info: null };
    return sendJson(res, 200, { ok: true, bytes: buf.length });
  }

  if (pathname === '/api/library' && req.method === 'GET') {
    const valid = new Set(Object.keys(s.names)); // appinfo 里的真实 Steam 游戏
    for (const o of db.listOwnedGames()) valid.add(String(o.appid));
    const games = db.listGames();
    for (const g of games) {
      g.syncable = !g.is_non_steam && /^\d+$/.test(String(g.appid)) && valid.has(String(g.appid));
    }
    return sendJson(res, 200, {
      games,
      customOrders: getCustomOrders(),
      catMemberOrder: db.listCategoryMemberOrder(),
    });
  }

  if (pathname === '/api/library/set-order' && req.method === 'POST') {
    const body = await readBody(req);
    if (!Array.isArray(body.appids)) return sendJson(res, 400, { error: '参数不足' });
    const key = body.key == null || body.key === '' ? 'all' : String(body.key);
    const map = getCustomOrders();
    map[key] = body.appids.map((a) => String(a));
    db.setSetting('custom_order_map', JSON.stringify(map));
    if (key === 'all') db.setSetting('custom_order', JSON.stringify(map[key])); // 兼容旧键
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/categories' && req.method === 'GET') {
    return sendJson(res, 200, { categories: db.listCategories() });
  }

  if (pathname === '/api/categories' && req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: '请输入分类名' });
    const id = db.addCategory(name);
    return sendJson(res, 200, { ok: true, id });
  }

  if (pathname === '/api/categories/set-order' && req.method === 'POST') {
    const body = await readBody(req);
    db.setCategoryOrder(Array.isArray(body.ids) ? body.ids.map(String) : []);
    return sendJson(res, 200, { ok: true, categories: db.listCategories() });
  }

  if (pathname === '/api/categories/rename' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.id || !body.name) return sendJson(res, 400, { error: '参数不足' });
    db.renameCategory(body.id, String(body.name).trim());
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/categories/remove' && req.method === 'POST') {
    const body = await readBody(req);
    db.removeCategory(body.id);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/categories/set-games' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.id || !Array.isArray(body.appids)) return sendJson(res, 400, { error: '参数不足' });
    db.setCategoryGames(body.id, body.appids);
    return sendJson(res, 200, { ok: true });
  }

  // 批量把若干游戏**加入**若干分类（只加不删；用于"Ctrl 多选 → 右键 → 更改分组"）
  if (pathname === '/api/library/add-categories' && req.method === 'POST') {
    const body = await readBody(req);
    const appids = Array.isArray(body.appids) ? body.appids.map(String) : [];
    const cats = Array.isArray(body.categories) ? body.categories : [];
    if (!appids.length) return sendJson(res, 400, { error: '没有选择游戏' });
    if (!cats.length) return sendJson(res, 400, { error: '没有选择分类' });
    db.addGameCategories(appids, cats);
    return sendJson(res, 200, { ok: true, games: appids.length, categories: cats.length });
  }

  if (pathname === '/api/library/set-categories' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.appid || !Array.isArray(body.ids)) return sendJson(res, 400, { error: '参数不足' });
    db.setGameCategories(String(body.appid), body.ids);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/library/set-appid' && req.method === 'POST') {
    const body = await readBody(req);
    const oldId = String(body.appid || '');
    const newId = String(body.newAppid || '').trim();
    if (!oldId || !newId) return sendJson(res, 400, { error: '参数不足' });
    if (!/^\d+$/.test(newId)) return sendJson(res, 200, { ok: false, error: 'App ID 必须是数字' });
    if (newId === oldId) return sendJson(res, 200, { ok: true });
    if (db.getActiveGame(newId)) {
      return sendJson(res, 200, { ok: false, duplicate: true, error: '游戏库里已有相同 App ID 的游戏，未修改' });
    }
    try {
      db.changeAppId(oldId, newId);
      return sendJson(res, 200, { ok: true, appid: newId });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/settings' && req.method === 'GET') {
    const k = db.getSetting('sgdb_api_key');
    return sendJson(res, 200, {
      hasApiKey: !!k,
      apiKeyMasked: k ? k.slice(0, 4) + '••••' + k.slice(-4) : null,
      allowInsecureTls: allowInsecureTls(),
      thumbs: thumbsEnabled(),
      ui: getUiSettings(),
    });
  }

  if (pathname === '/api/settings' && req.method === 'POST') {
    const body = await readBody(req);
    if ('apiKey' in body) db.setSetting('sgdb_api_key', String(body.apiKey || '').trim());
    if ('allowInsecureTls' in body) {
      db.setSetting('allow_insecure_tls', body.allowInsecureTls ? '1' : '0');
      syncTlsSetting();
    }
    if ('thumbs' in body) db.setSetting('thumbs', body.thumbs ? '1' : '0');
    if (body.ui && typeof body.ui === 'object') {
      const next = { ...getUiSettings(), ...body.ui };
      db.setSetting('ui', JSON.stringify(next));
    }
    return sendJson(res, 200, { ok: true, ui: getUiSettings(), thumbs: thumbsEnabled() });
  }

  if (pathname === '/api/library/detect') {
    const libGames = db.listGames();
    const libIds = new Set(libGames.map((g) => g.appid));
    const libArt = new Map(libGames.map((g) => [String(g.appid), g.artCount]));
    const localBy = new Map(s.detected.map((d) => [String(d.appid), d]));
    const games = db.listOwnedGames().map((o) => {
      const appid = String(o.appid);
      const l = localBy.get(appid);
      return {
        appid,
        name: o.name,
        isNonSteam: false,
        artCount: libIds.has(appid) ? libArt.get(appid) || 0 : l ? l.artCount : 0,
        installed: l ? !!l.installed : false,
        owned: true,
        inLibrary: libIds.has(appid),
      };
    });
    games.sort((a, b) => (a.name || a.appid).localeCompare(b.name || b.appid, 'zh'));
    return sendJson(res, 200, { games, bound: db.listSteamAccounts().length > 0, ownedCount: db.ownedCount() });
  }

  if (pathname === '/api/library/import' && req.method === 'POST') {
    const body = await readBody(req);
    const appids = Array.isArray(body.appids) ? body.appids.map(String) : [];
    // 名字优先级：本地扫描到的（非 Steam 快捷方式的名字来自 shortcuts.vdf）
    //            → **Steam Web API 拥有列表的名字（owned_games.name）** → appinfo.vdf
    // ⚠️ 少了中间那一项，新库里"没有本地封面、又不在 appinfo"的游戏就会没名字、只显示 AppID（见 §10 #70）
    const ownedNames = new Map(db.listOwnedGames().map((o) => [String(o.appid), o.name]));
    let imported = 0;
    const failed = [];
    for (const appid of appids) {
      try {
        const d = s.detected.find((x) => x.appid === appid);
        db.addGame(appid, (d && d.name) || ownedNames.get(appid) || s.names[appid] || null, d ? d.isNonSteam : false);
        // 复制该游戏现有封面到库
        const ag = s.artByAppid.get(appid);
        if (ag) {
          for (const type of steam.ART_TYPES) {
            const seen = new Set();
            for (const it of ag.artwork[type]) {
              if (seen.has(it.file)) continue;
              seen.add(it.file);
              const srcFull = path.join(s.srcDirs[it.src], it.file);
              try {
                const buf = fs.readFileSync(srcFull);
                const ext = path.extname(it.file).toLowerCase();
                db.addArt(appid, {
                  type,
                  source: 'steam',
                  file: it.file,
                  mime: MIME[ext] || 'image/png',
                  data: buf,
                  url: 'steam:' + it.file,
                });
              } catch (e) {
                /* ignore */
              }
            }
          }
        }
        imported++;
      } catch (e) {
        failed.push({ appid, error: e.message });
      }
    }
    runFillFor(appids); // 只补全刚导入的这批（后台，带进度）
    return sendJson(res, 200, { ok: true, imported, failed });
  }

  if (pathname === '/api/library/add' && req.method === 'POST') {
    const body = await readBody(req);
    let appid = body.appid ? String(body.appid) : null;
    if (!appid && body.name) {
      const hit = s.nameToAppid[String(body.name).toLowerCase().trim()];
      if (hit) appid = hit;
    }
    if (!appid && body.sgdbGameId) appid = 'sgdb-' + body.sgdbGameId;
    if (!appid) return sendJson(res, 400, { error: '无法确定 appid：请提供 Steam AppID 或游戏名' });
    db.addGame(appid, body.name || null, !!body.isNonSteam, body.sgdbGameId || null);
    return sendJson(res, 200, { ok: true, appid });
  }

  if (pathname === '/api/library/add-image' && req.method === 'POST') {
    const body = await readBody(req);
    const appid = String(body.appid || '');
    const type = body.type;
    const dataUrl = body.dataUrl;
    if (!appid || !type || typeof dataUrl !== 'string') return sendJson(res, 400, { error: '参数不足' });
    const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif|bmp);base64,(.+)$/i);
    if (!m) return sendJson(res, 400, { error: '不支持的图片格式' });
    let ext = '.' + m[1].toLowerCase();
    if (ext === '.jpeg') ext = '.jpg';
    try {
      const buf = Buffer.from(m[2], 'base64');
      if (!db.getActiveGame(appid)) db.addGame(appid, body.name || null, false, null);
      const fileName = `local_${type}_${Date.now()}${ext}`;
      const id = db.addArt(appid, {
        type,
        source: 'local',
        file: fileName,
        mime: MIME[ext] || 'image/png',
        data: buf,
        url: 'local:' + fileName,
      });
      return sendJson(res, 200, { ok: true, id });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/library/manual-add' && req.method === 'POST') {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    if (!name) return sendJson(res, 400, { error: '请输入游戏名' });
    let appid = String(body.appid || '').trim();
    if (appid) {
      const ex = db.getActiveGame(appid);
      if (ex) {
        return sendJson(res, 200, {
          ok: false,
          duplicate: true,
          error: '已存在相同 App ID 的游戏：' + (ex.name || appid) + '，未创建',
        });
      }
    } else {
      appid = 'manual-' + Date.now();
    }
    db.addGame(appid, name, false, null);
    const images = body.images || {};
    let added = 0;
    for (const [type, dataUrl] of Object.entries(images)) {
      if (!steam.ART_TYPES.includes(type) || typeof dataUrl !== 'string') continue;
      const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif|bmp);base64,(.+)$/i);
      if (!m) continue;
      let ext = '.' + m[1].toLowerCase();
      if (ext === '.jpeg') ext = '.jpg';
      try {
        const buf = Buffer.from(m[2], 'base64');
        const fileName = 'local_' + type + ext;
        db.addArt(appid, {
          type,
          source: 'local',
          file: fileName,
          mime: MIME[ext] || 'image/png',
          data: buf,
          url: 'local:' + fileName,
        });
        added++;
      } catch (e) {
        /* ignore */
      }
    }
    return sendJson(res, 200, { ok: true, appid, added });
  }

  if (pathname === '/api/library/import-all-defaults' && req.method === 'POST') {
    if (importJob.running) return sendJson(res, 200, { ok: true, running: true, ...importJob });
    // 只对"已在库中"的游戏补全缺失类型（不导入新游戏）
    const ids = db.listGames().map((g) => String(g.appid));
    runFillFor(ids);
    return sendJson(res, 200, { ok: true, started: true, ...importJob });
  }

  if (pathname === '/api/library/import-progress') {
    // pending = 还没补完的队列长度（这样即使"自动续跑"还没启动，界面也能提示"待续 N"）
    return sendJson(res, 200, { ...importJob, pending: readFillQueue().length });
  }

  if (pathname === '/api/library/fetch-names' && req.method === 'POST') {
    if (nameJob.running) return sendJson(res, 200, { ok: true, running: true, ...nameJob });
    runFetchZhNames();
    return sendJson(res, 200, { ok: true, started: true, ...nameJob });
  }

  if (pathname === '/api/library/name-progress') {
    return sendJson(res, 200, { ...nameJob });
  }

  if (pathname === '/api/library/fetch-previews' && req.method === 'POST') {
    if (previewJob.running) return sendJson(res, 200, { ok: true, running: true, ...previewJob });
    runFetchPreviews();
    return sendJson(res, 200, { ok: true, started: true, ...previewJob });
  }

  if (pathname === '/api/library/preview-progress') {
    return sendJson(res, 200, { ...previewJob });
  }

  if (pathname === '/api/library/remove' && req.method === 'POST') {
    const body = await readBody(req);
    db.softDeleteGame(String(body.appid)); // 移入回收站
    return sendJson(res, 200, { ok: true });
  }

  // ---- 回收站 ----
  if (pathname === '/api/trash' && req.method === 'GET') {
    return sendJson(res, 200, { games: db.listDeletedGames() });
  }
  if (pathname === '/api/trash/restore' && req.method === 'POST') {
    const body = await readBody(req);
    const appid = String(body.appid || '');
    const g = db.getGame(appid);
    if (!g) return sendJson(res, 200, { ok: false, error: '回收站里没有这个游戏' });
    // 冲突检查：库中（未删除）已有相同 AppID 或相同游戏名
    const conflicts = [];
    const actives = db.listGames();
    for (const a of actives) {
      if (String(a.appid) === appid) conflicts.push({ type: 'appid', appid: a.appid, name: a.name });
      const n1 = (a.name || '').trim().toLowerCase();
      const n2 = (g.name || '').trim().toLowerCase();
      if (n1 && n2 && n1 === n2) conflicts.push({ type: 'name', appid: a.appid, name: a.name });
    }
    if (conflicts.length) {
      return sendJson(res, 200, { ok: false, conflict: true, conflicts, error: '库中已存在相同 AppID 或相同名称的游戏，请先删除库中重复的再恢复' });
    }
    db.restoreGame(appid);
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === '/api/trash/purge' && req.method === 'POST') {
    const body = await readBody(req);
    db.purgeGame(String(body.appid || ''));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/library/rename' && req.method === 'POST') {
    const body = await readBody(req);
    db.updateGameName(String(body.appid), body.name);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/sgdb/game') {
    const appid = query.get('appid');
    const key = db.getSetting('sgdb_api_key');
    if (!appid || !key) return sendJson(res, 200, { game: null });
    // 内存缓存（10 分钟）：同一次会话里反复点「从 SteamGridDB 添加」不必每次等网络（见 §10 #83）
    const ck = String(appid);
    const hit = sgdbGameCacheMem.get(ck);
    if (hit && Date.now() - hit.t < SGDB_GAME_TTL_MS) return sendJson(res, 200, { game: hit.game, cached: true });
    try {
      const g = await sgdb.getGameBySteamAppid(appid, key);
      sgdbGameCacheMem.set(ck, { t: Date.now(), game: g });
      return sendJson(res, 200, { game: g });
    } catch (e) {
      return sendJson(res, 200, { game: null, error: e.message });
    }
  }

  if (pathname === '/api/sgdb/search') {
    const key = db.getSetting('sgdb_api_key');
    try {
      const games = await sgdb.searchGames(query.get('q') || '', key);
      return sendJson(res, 200, { games, hasApiKey: !!key });
    } catch (e) {
      return sendJson(res, 200, { games: [], error: e.message, hasApiKey: !!key });
    }
  }

  if (pathname === '/api/sgdb/art-all') {
    const key = db.getSetting('sgdb_api_key');
    const type = query.get('type');
    const gameId = query.get('gameId');
    if (!type || !gameId) return sendJson(res, 400, { error: '参数不足' });
    // 不缓存：每次实时拉取该游戏该类型的全部封面
    try {
      const arts = await sgdb.getAllArt(type, gameId, key, { types: 'static,animated', nsfw: 'any', humor: 'any', epilepsy: 'any' });
      return sendJson(res, 200, { arts, error: null });
    } catch (e) {
      return sendJson(res, 200, { arts: [], error: e.message });
    }
  }

  if (pathname === '/api/sgdb/art') {
    const key = db.getSetting('sgdb_api_key');
    const pgRaw = query.get('page');
    try {
      const r = await sgdb.getArt(query.get('type'), query.get('gameId'), key, {
        page: pgRaw == null || pgRaw === '' ? 0 : Number(pgRaw), // SGDB 分页 0 起
        types: query.get('types') || '',
        nsfw: query.get('nsfw') || '',
        humor: query.get('humor') || '',
        epilepsy: query.get('epilepsy') || '',
        oneoftag: query.get('oneoftag') || '',
      });
      return sendJson(res, 200, { arts: r.arts, hasMore: r.hasMore, page: r.page, error: null });
    } catch (e) {
      return sendJson(res, 200, { arts: [], hasMore: false, error: e.message });
    }
  }

  if (pathname === '/api/library/import-default' && req.method === 'POST') {
    const body = await readBody(req);
    const appid = String(body.appid || '');
    const type = body.type;
    if (!appid || !type) return sendJson(res, 400, { error: '参数不足' });
    try {
      const r = await defaultart.resolveFor(s.steamPaths, appid, type, db.getSetting('sgdb_api_key'));
      if (!r) return sendJson(res, 200, { ok: false, error: '没有可用的默认图' });
      const id = registerDefaultArt(s, appid, type, r);
      return sendJson(res, 200, { ok: true, id, source: r.source });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/library/add-art' && req.method === 'POST') {
    const body = await readBody(req);
    const appid = String(body.appid);
    const type = body.type;
    const art = body.art || {};
    if (!appid || !type || !art.url) return sendJson(res, 400, { error: '参数不足' });
    try {
      if (!db.getActiveGame(appid)) db.addGame(appid, body.name || null, false, body.sgdbGameId || null);
      let ext = path.extname(new URL(art.url).pathname).toLowerCase();
      if (!ext || ext.length > 5) ext = '.png';
      const fileName = `sgdb_${art.sgdb_id || Date.now()}_${type}${ext}`;
      fs.mkdirSync(TMP_DIR, { recursive: true });
      const tmp = path.join(TMP_DIR, 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2) + ext);
      let buf;
      try {
        await sgdb.downloadTo(art.url, tmp);
        buf = fs.readFileSync(tmp);
      } finally {
        try {
          fs.unlinkSync(tmp); // 成功/失败都清理临时文件，避免 .tmp 泄漏
        } catch (e) {
          /* ignore */
        }
      }
      const id = db.addArt(appid, {
        type,
        source: 'sgdb',
        sgdb_id: art.sgdb_id,
        url: art.url,
        author: art.author,
        file: fileName,
        mime: MIME[ext] || 'image/png',
        data: buf,
      });
      // 动图（webp）：顺便把它的 .webm 预览也存进库，供主页/详情"一直播且不卡"（见 §6.13）
      if (art.mime === 'image/webp' && /\.webm(\?|$)/i.test(String(art.thumb || ''))) {
        const pbuf = await downloadPreview(art.thumb);
        if (pbuf) db.setArtPreview(appid, fileName, pbuf, 'video/webm');
      }
      return sendJson(res, 200, { ok: true, id });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/defaultart') {
    const appid = query.get('appid');
    const type = query.get('type') || 'portrait';
    if (!appid || !/^\d+$/.test(appid)) {
      res.writeHead(400);
      res.end();
      return;
    }
    let r = await defaultart.resolveFor(s.steamPaths, appid, type, db.getSetting('sgdb_api_key'));
    if (!r) {
      res.writeHead(404);
      res.end();
      return;
    }
    // 统一存入 .gameart：默认图也作为你的资产登记
    registerDefaultArt(s, appid, type, r);
    return sendImageAuto(res, r.path, 3600);
  }

  if (pathname === '/api/defaultart/sources') {
    const appid = query.get('appid');
    if (!appid || !/^\d+$/.test(appid)) {
      res.writeHead(400);
      res.end();
      return;
    }
    const key = db.getSetting('sgdb_api_key');
    const requested = (query.get('types') || '').split(',').filter(Boolean);
    const types = requested.length ? requested.filter((t) => steam.ART_TYPES.includes(t)) : steam.ART_TYPES;
    const sources = {};
    for (const t of types) {
      try {
        const r = await defaultart.resolveFor(s.steamPaths, appid, t, key);
        if (r) registerDefaultArt(s, appid, t, r);
        sources[t] = r ? r.source : null;
      } catch (e) {
        sources[t] = null;
      }
    }
    return sendJson(res, 200, { appid, sources });
  }

  if (pathname === '/api/library/select-art' && req.method === 'POST') {
    const body = await readBody(req);
    db.selectArt(String(body.appid), body.type, Number(body.id));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/library/remove-art' && req.method === 'POST') {
    const body = await readBody(req);
    db.removeArt(String(body.appid), Number(body.id));
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/library/reorder-art' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.appid || !body.type || !Array.isArray(body.ids)) {
      return sendJson(res, 400, { error: '参数不足' });
    }
    db.reorderArt(String(body.appid), body.type, body.ids);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/steam/plan' && req.method === 'POST') {
    const body = await readBody(req);
    const ids = body.appid ? [String(body.appid)] : db.listGames().map((g) => g.appid);
    const plans = [];
    let fileCount = 0;
    const created = [];
    for (const id of ids) {
      const files = selectedFilesFor(id, created);
      if (!Object.keys(files).length) continue;
      const g = db.getGame(id);
      const p = steamwrite.plan(id, files);
      p.name = g ? g.name : null;
      plans.push(p);
      fileCount += p.items.length;
    }
    cleanupFiles(created);
    return sendJson(res, 200, {
      steamRunning: await steamwrite.isSteamRunning(),
      plans,
      appCount: plans.length,
      fileCount,
    });
  }

  if (pathname === '/api/steam/apply' && req.method === 'POST') {
    const body = await readBody(req);
    const appid = String(body.appid);
    const created = [];
    try {
      const files = selectedFilesFor(appid, created);
      if (!Object.keys(files).length) return sendJson(res, 200, { ok: false, error: '该游戏没有可同步的本地图片' });
      const r = await steamwrite.apply(appid, files, {});
      return sendJson(res, 200, { ok: true, backupDir: r.backupDir, written: r.written, backedUp: r.backedUp, steamRunning: r.steamRunning });
    } catch (e) {
      return sendJson(res, 200, { ok: false, error: e.message });
    } finally {
      cleanupFiles(created);
    }
  }

  if (pathname === '/api/steam/apply-batch' && req.method === 'POST') {
    const body = await readBody(req);
    const appids = Array.isArray(body.appids) ? body.appids.map(String) : [];
    if (applyJob.running) return sendJson(res, 200, { ok: true, running: true, ...applyJob });
    runApplyBatch(appids);
    return sendJson(res, 200, { ok: true, started: true, ...applyJob });
  }

  if (pathname === '/api/steam/apply-progress') {
    return sendJson(res, 200, { ...applyJob });
  }

  if (pathname === '/api/steam/apply-all' && req.method === 'POST') {
    const games = db.listGames();
    let okCount = 0;
    let steamRunning = false;
    const results = [];
    for (const g of games) {
      const created = [];
      try {
        const files = selectedFilesFor(g.appid, created);
        if (!Object.keys(files).length) continue;
        const r = await steamwrite.apply(g.appid, files, {});
        steamRunning = r.steamRunning;
        okCount++;
        results.push({ appid: g.appid, name: g.name, files: r.written.length, backupDir: r.backupDir });
      } catch (e) {
        results.push({ appid: g.appid, name: g.name, error: e.message });
      } finally {
        cleanupFiles(created);
      }
    }
    return sendJson(res, 200, { ok: true, okCount, total: games.length, steamRunning, results });
  }

  /* 图片：库资源（从 .gameart 的 BLOB 读取） */
  if (pathname === '/asset') {
    const appid = query.get('appid');
    const file = query.get('file');
    if (!appid || !file) {
      res.writeHead(400);
      res.end();
      return;
    }
    const row = db.getArtByFile(appid, file);
    if (row && row.data) {
      // ① 有"显示用缩略图"就直接用它（卡片只有 150~430px 宽，用几十 MB 的原图会解码卡顿；见 §10 #88）
      const wantW = Math.min(THUMB_MAX_W, Math.max(0, Math.round(Number(query.get('w')) || 0)));
      if (wantW >= THUMB_MIN_W && thumbsEnabled() && !skipThumbMime(row.mime)) {
        const ext = thumbExt(row.type);
        const thumb = readThumb(appid, file, wantW, ext);
        if (thumb) {
          res.writeHead(200, {
            'Content-Type': ext === '.png' ? 'image/png' : 'image/jpeg',
            'Content-Length': thumb.length,
            'Cache-Control': 'private, max-age=86400',
            'X-Thumb': '1',
          });
          res.end(thumb);
          return;
        }
      }
      // ② 没有缩略图（或不需要）→ **立刻**返回原图，绝不等待生成
      const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
      let maxAge = 86400;
      if (wantW >= THUMB_MIN_W && thumbsEnabled() && !skipThumbMime(row.mime)) {
        // 这个 URL 以后可能会变成"缩略图"版本 → 只给 30 秒短缓存，让浏览器稍后自动取到缩略图；
        // 若已判定"不需要缩略图"（.skip 标记），则内容不会再变 → 可以长缓存。（见 §10 #88）
        let skipped = false;
        try {
          skipped = fs.statSync(thumbFile(appid, file, wantW, thumbExt(row.type)) + '.skip').isFile();
        } catch (e) {
          skipped = false;
        }
        if (!skipped) maxAge = 30;
      }
      res.writeHead(200, {
        'Content-Type': row.mime || sniffImageMime(buf) || 'image/png',
        'Content-Length': buf.length,
        // 文件名唯一（新图=新文件名）→ 可长缓存；避免滚动/切换显示类型时反复重新下载；见 §10 #81
        'Cache-Control': 'private, max-age=' + maxAge,
      });
      res.end(buf);
      return;
    }
    // 兜底：旧的外置文件
    return sendImageAuto(res, db.assetPath(appid, file), 3600);
  }

  if (pathname === '/preview') {
    // 动图的 .webm 预览（供主页/详情"一直播"，见 §6.13）
    const appid = query.get('appid');
    const file = query.get('file');
    if (!appid || !file) {
      res.writeHead(400);
      res.end();
      return;
    }
    const row = db.getArtByFile(appid, file);
    if (row && row.preview) {
      const buf = Buffer.isBuffer(row.preview) ? row.preview : Buffer.from(row.preview);
      res.writeHead(200, {
        'Content-Type': row.preview_mime || 'video/webm',
        'Content-Length': buf.length,
        'Accept-Ranges': 'none',
        'Cache-Control': 'private, max-age=86400', // 预览文件名唯一、内容不变 → 可长缓存（见 §10 #81）
      });
      res.end(buf);
      return;
    }
    res.writeHead(404);
    res.end();
    return;
  }

  if (pathname === '/img') {    const src = query.get('src');
    const file = query.get('file');
    if (!src || !/^\d+$/.test(src) || !file) {
      res.writeHead(400);
      res.end();
      return;
    }
    const gridDir = s.srcDirs[Number(src)];
    if (!gridDir) {
      res.writeHead(404);
      res.end();
      return;
    }
    const full = path.join(gridDir, path.basename(file));
    return sendFile(res, full, MIME[path.extname(full).toLowerCase()], 3600);
  }

  res.writeHead(404);
  res.end('Not found');
}

const server = http.createServer((req, res) => {
  (async () => {
    try {
      const parsed = new URL(req.url, `http://${HOST}:${PORT}`);
      const pathname = decodeURIComponent(parsed.pathname);

      if (pathname.startsWith('/api/') || pathname === '/asset' || pathname === '/preview' || pathname === '/img') {
        return await handleApi(req, res, pathname, parsed.searchParams);
      }

      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const full = path.join(PUBLIC_DIR, rel);
      if (!full.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), MIME['.html']);
      }
      return sendFile(res, full, MIME[path.extname(full).toLowerCase()]);
    } catch (e) {
      res.writeHead(500);
      res.end('Server error: ' + e.message);
    }
  })();
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.log('端口 ' + PORT + ' 已被占用：程序可能已经在运行，将直接打开浏览器。');
    console.log('地址： http://' + HOST + ':' + PORT);
    if (!process.env.NO_OPEN) exec(`start "" "http://${HOST}:${PORT}"`, { windowsHide: true }, () => {});
    setTimeout(() => process.exit(0), 600);
  } else {
    console.error('服务器启动失败：', err);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  // 后台预热：解析 appinfo.vdf / 扫描 grid 是一次性的重活（主进程内同步执行）。
  // 放在**启动时**做，别等用户第一次点开设置或库时才卡（见 §10 #82）。
  platform.prefetchSteamCandidates().catch(() => {});
  setTimeout(() => {
    try {
      ensureState();
    } catch (e) {
      /* ignore */
    }
  }, 200);
  let paths = '';
  try {
    paths = ensureState().steamPaths.join(' | ') || '(未检测到)';
  } catch (e) {
    /* ignore */
  }
  console.log('========================================');
  console.log(' 游戏艺术库 · GameArt Library  ' + APP_VERSION);
  console.log(' Steam  :', paths);
  console.log(' 工作库 :', db.currentDbPath() || '(未打开，请在界面中选择/新建 .gameart)');
  console.log(' 访问   :', `http://${HOST}:${PORT}`);
  console.log(' 按 Ctrl+C 停止');
  if (!process.env.NO_OPEN) exec(`start "" "http://${HOST}:${PORT}"`, { windowsHide: true }, () => {});
});
