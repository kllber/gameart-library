'use strict';

/**
 * steam.js —— Steam 本地数据探测与扫描（只读）
 *
 * v0.2 改动：不再绑定单个账号，改为以「游戏」为中心。
 * v0.6 改动：Steam 安装探测**不再遍历所有盘**，只用注册表 + 默认安装路径兜底。
 *   - 汇总该安装下所有账号的 config\grid
 *   - 按 AppID 合并，同一游戏只出现一次
 *
 * 安全声明：本模块只做「打开目录 + 读取文件」，绝不写入、绝不调用 Steam 进程、
 * 绝不注入/hook。读取 Steam 自有文件不涉及任何可能触发封号的操作。
 */

const fs = require('fs');
const path = require('path');
const platform = require('./platform');
const { parseAppInfoNames } = require('./appinfo');
const { parseShortcuts } = require('./shortcuts');

const ART_TYPES = ['portrait', 'grid', 'hero', 'logo', 'icon'];

const TYPE_LABELS = {
  portrait: '竖向封面',
  grid: '横向封面',
  hero: '大背景 Hero',
  logo: 'Logo',
  icon: '图标',
};

function normalizeSlash(p) {
  return path.resolve(p).replace(/[\\/]+$/, '');
}

/** 判断一个目录是否像 Steam「安装根目录」。仅认安装标志（steam.exe / steam.sh / userdata / appcache），
 *  以免把纯游戏库目录（只有 steamapps）当成安装。实现见 platform.js。 */

/**
 * 探测 Steam 安装目录（路径大小写不敏感，按小写去重）。
 * 候选来源由 platform.steamInstallCandidates() 提供（Windows：注册表+默认路径；Linux：常见安装位置）。
 */
function detectSteamPaths() {
  const seen = new Map(); // lower-case -> 原始大小写

  const add = (p) => {
    if (!p) return;
    try {
      const norm = normalizeSlash(p);
      if (!platform.looksLikeSteamRoot(norm)) return;
      const key = norm.toLowerCase();
      if (!seen.has(key)) seen.set(key, norm);
    } catch (e) {
      /* ignore */
    }
  };

  for (const c of platform.steamInstallCandidates()) add(c);

  return Array.from(seen.values());
}

/** 列出某个 Steam 安装下的所有账号目录（userdata 下的纯数字目录） */
function listAccounts(steamPath) {
  if (!steamPath) return [];
  const userdata = path.join(steamPath, 'userdata');
  let entries = [];
  try {
    entries = fs.readdirSync(userdata, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const accounts = [];
  for (const e of entries) {
    if (!e.isDirectory() || !/^\d+$/.test(e.name)) continue;
    const gridDir = path.join(userdata, e.name, 'config', 'grid');
    let gridExists = false;
    try {
      gridExists = fs.statSync(gridDir).isDirectory();
    } catch (e) {
      /* ignore */
    }
    accounts.push({ id: e.name, gridDir, gridExists });
  }
  return accounts;
}

/**
 * 构建「来源」列表：每个「有 grid 的账号」是一个来源，分配一个整数 id 用于取图。
 * 返回 [{ id, steamPath, accountId, gridDir }]
 */
function buildSources(steamPaths) {
  const sources = [];
  let id = 0;
  for (const sp of steamPaths) {
    for (const a of listAccounts(sp)) {
      if (!a.gridExists) continue;
      sources.push({ id: id++, steamPath: sp, accountId: a.id, gridDir: a.gridDir });
    }
  }
  return sources;
}

/**
 * 解析 grid 文件名，返回 { kind, appid, type, file, ext }
 *   <appid>p.png   -> portrait     <appid>.png   -> grid
 *   <appid>_hero   -> hero         <appid>_logo  -> logo      <appid>_icon -> icon
 *   <appid>.json   -> meta
 */
function parseGridFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const base = fileName.slice(0, fileName.length - ext.length);

  if (ext === '.json') {
    if (/^\d+$/.test(base)) return { kind: 'meta', appid: base, file: fileName };
    return null;
  }

  let appid = null;
  let type = null;
  if (base.endsWith('_hero')) {
    appid = base.slice(0, -5);
    type = 'hero';
  } else if (base.endsWith('_logo')) {
    appid = base.slice(0, -5);
    type = 'logo';
  } else if (base.endsWith('_icon')) {
    appid = base.slice(0, -5);
    type = 'icon';
  } else if (/^\d+p$/.test(base)) {
    appid = base.slice(0, -1);
    type = 'portrait';
  } else if (/^\d+$/.test(base)) {
    appid = base;
    type = 'grid';
  } else {
    return null;
  }

  if (!/^\d+$/.test(appid)) return null;
  return { kind: 'art', appid, type, file: fileName, ext };
}

function safeSize(full) {
  try {
    return fs.statSync(full).size;
  } catch (e) {
    return 0;
  }
}

/** 扫描单个 grid 目录，按 appid 聚合 */
function scanGrid(gridDir) {
  const games = new Map();
  let names = [];
  try {
    names = fs.readdirSync(gridDir);
  } catch (e) {
    return [];
  }
  for (const f of names) {
    const info = parseGridFileName(f);
    if (!info) continue;
    if (!games.has(info.appid)) {
      const artwork = {};
      for (const t of ART_TYPES) artwork[t] = [];
      games.set(info.appid, { appid: info.appid, artwork, metaFile: null, meta: null });
    }
    const g = games.get(info.appid);
    if (info.kind === 'meta') {
      g.metaFile = f;
      try {
        g.meta = JSON.parse(fs.readFileSync(path.join(gridDir, f), 'utf8'));
      } catch (e) {
        /* ignore */
      }
    } else {
      g.artwork[info.type].push({ file: f, ext: info.ext, size: safeSize(path.join(gridDir, f)) });
    }
  }
  return Array.from(games.values());
}

/**
 * 汇总所有来源的 grid，按 appid 合并成一个游戏列表。
 * 每个艺术条目带 { src, file, size, account, steamPath }。
 */
function scanAllGrids(sources) {
  const games = new Map();

  for (const src of sources) {
    for (const g of scanGrid(src.gridDir)) {
      if (!games.has(g.appid)) {
        const artwork = {};
        for (const t of ART_TYPES) artwork[t] = [];
        games.set(g.appid, { appid: g.appid, artwork, meta: null, accounts: new Set(), accountList: [] });
      }
      const G = games.get(g.appid);
      if (!G.accounts.has(src.accountId)) {
        G.accounts.add(src.accountId);
        G.accountList.push(src.accountId);
      }
      for (const t of ART_TYPES) {
        for (const it of g.artwork[t]) {
          G.artwork[t].push({
            src: src.id,
            file: it.file,
            size: it.size,
            account: src.accountId,
            steamPath: src.steamPath,
          });
        }
      }
      if (g.meta && !G.meta) G.meta = g.meta;
    }
  }

  return Array.from(games.values()).map((G) => ({
    appid: G.appid,
    artwork: G.artwork,
    meta: G.meta,
    accounts: G.accountList,
  }));
}

function unescapeVdf(s) {
  return s.replace(/\\\\/g, '\\');
}

/** 收集 appid -> 游戏名。来源：各安装的 appinfo.vdf + 各库 appmanifest + 各账号 shortcuts.vdf
 *  同时返回 library：真实"游戏库"里的 appid（已安装 + 非 Steam 快捷方式），用于同步列表。 */
function collectGameNames(steamPaths) {
  const names = {};
  const nonSteam = new Set();
  const library = new Set();

  // 1) appinfo.vdf（每个安装各一份）
  for (const sp of steamPaths) {
    try {
      Object.assign(names, parseAppInfoNames(path.join(sp, 'appcache', 'appinfo.vdf')));
    } catch (e) {
      /* ignore */
    }
  }

  // 2) appmanifest_*.acf（已安装）
  const libs = new Set();
  const vdfPaths = [];
  for (const sp of steamPaths) {
    libs.add(path.join(sp, 'steamapps'));
    vdfPaths.push(path.join(sp, 'steamapps', 'libraryfolders.vdf'));
    vdfPaths.push(path.join(sp, 'config', 'libraryfolders.vdf'));
  }
  for (const v of vdfPaths) {
    try {
      const txt = fs.readFileSync(v, 'utf8');
      const re = /"path"\s+"([^"]+)"/g;
      let m;
      while ((m = re.exec(txt))) libs.add(path.join(unescapeVdf(m[1]), 'steamapps'));
    } catch (e) {
      /* ignore */
    }
  }
  for (const lib of libs) {
    let files = [];
    try {
      files = fs.readdirSync(lib);
    } catch (e) {
      continue;
    }
    for (const f of files) {
      const idm = f.match(/^appmanifest_(\d+)\.acf$/i);
      if (!idm) continue;
      try {
        const txt = fs.readFileSync(path.join(lib, f), 'utf8');
        const nm = txt.match(/"name"\s+"([^"]*)"/);
        if (nm) names[idm[1]] = nm[1];
        library.add(idm[1]);
      } catch (e) {
        /* ignore */
      }
    }
  }

  // 3) shortcuts.vdf（非 Steam，遍历所有安装的所有账号）
  for (const sp of steamPaths) {
    const userdata = path.join(sp, 'userdata');
    let dirs = [];
    try {
      dirs = fs.readdirSync(userdata);
    } catch (e) {
      dirs = [];
    }
    for (const d of dirs) {
      if (!/^\d+$/.test(d)) continue;
      const sc = path.join(userdata, d, 'config', 'shortcuts.vdf');
      if (!fs.existsSync(sc)) continue;
      try {
        const m = parseShortcuts(sc);
        for (const k of Object.keys(m)) {
          names[k] = m[k];
          nonSteam.add(k);
          library.add(k);
        }
      } catch (e) {
        /* ignore */
      }
    }
  }

  return { names, nonSteam, library };
}

/** 读取 config/loginusers.vdf，返回本机登录过的账号（按时间倒序）：[{steamId64, persona, timestamp}] */
function detectLoginUsers(steamPaths) {
  const users = [];
  for (const sp of steamPaths || []) {
    const f = path.join(sp, 'config', 'loginusers.vdf');
    let txt;
    try {
      txt = fs.readFileSync(f, 'utf8');
    } catch (e) {
      continue;
    }
    const re = /"(\d{17})"\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(txt))) {
      const id = m[1];
      const body = m[2];
      const persona = (body.match(/"PersonaName"\s+"([^"]*)"/) || [])[1] || null;
      const timestamp = parseInt((body.match(/"timestamp"\s+"(\d+)"/) || [])[1] || '0', 10);
      const accountName = (body.match(/"AccountName"\s+"([^"]*)"/) || [])[1] || null;
      users.push({ steamId64: id, persona, accountName, timestamp, steamPath: sp });
    }
  }
  users.sort((a, b) => b.timestamp - a.timestamp);
  return users;
}

module.exports = {
  ART_TYPES,
  TYPE_LABELS,
  detectSteamPaths,
  listAccounts,
  buildSources,
  parseGridFileName,
  scanGrid,
  scanAllGrids,
  collectGameNames,
  detectLoginUsers,
};
