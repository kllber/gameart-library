'use strict';

/**
 * defaultart.js —— 获取游戏"自带的默认艺术图"（没改过封面的游戏用来兜底显示）
 *
 * 策略（优先离线）：
 *   1. Steam 本地缓存 appcache/librarycache/<appid>/ 里的对应文件；
 *   2. 本地没有 → 从 Steam 官方 CDN 下载并缓存到 data/cache/defaultart/（下次秒开、可离线）。
 *
 * CDN（公开、无需 Key）：
 *   竖向封面  https://cdn.cloudflare.steamstatic.com/steam/apps/<id>/library_600x900.jpg
 *   横向封面  .../header.jpg
 *   大背景    .../library_hero.jpg
 *   徽标      .../logo.png
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const sgdb = require('./sgdb');
const { DATA_DIR } = require('./paths');

const CACHE_DIR = path.join(DATA_DIR, 'cache', 'defaultart');

const HOSTS = [
  'https://cdn.cloudflare.steamstatic.com/steam/apps',
  'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps',
];
const FILES = {
  portrait: ['library_600x900.jpg', 'library_600x900_2x.jpg'],
  grid: ['header.jpg', 'capsule_616x353.jpg', 'capsule_231x87.jpg'],
  hero: ['library_hero.jpg'],
  logo: ['logo.png'],
  icon: [], // Steam CDN 没有"图标"资产，图标只走 SGDB，绝不回退到 logo
};
const EXT = { portrait: 'jpg', grid: 'jpg', hero: 'jpg', logo: 'png', icon: 'png' };

function candidateUrls(id, type) {
  const out = [];
  for (const h of HOSTS) for (const f of FILES[type] || FILES.grid) out.push(`${h}/${id}/${f}`);
  return out;
}

/* ---- 商店 appdetails 兜底（新游戏资源在带哈希的子目录里，旧路径会 404） ---- */

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(new Error('bad json'));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

let appdetailsCache = null;
function appdetailsCacheFile() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, '_appdetails.json');
}
function loadAppdetailsCache() {
  if (appdetailsCache) return appdetailsCache;
  try {
    appdetailsCache = JSON.parse(fs.readFileSync(appdetailsCacheFile(), 'utf8'));
  } catch (e) {
    appdetailsCache = {};
  }
  return appdetailsCache;
}
function saveAppdetailsCache() {
  try {
    fs.writeFileSync(appdetailsCacheFile(), JSON.stringify(appdetailsCache));
  } catch (e) {
    /* ignore */
  }
}

async function getStoreAssets(appid) {
  const cache = loadAppdetailsCache();
  if (cache[appid]) return cache[appid];
  let out = { header: null, background: null, capsule: null };
  try {
    const j = await httpsGetJson(`https://store.steampowered.com/api/appdetails?appids=${appid}`);
    const d = j && j[appid] && j[appid].data;
    if (d) {
      out = {
        header: d.header_image || null,
        background: d.background_raw || d.background || null,
        capsule: d.capsule_image || null,
      };
    }
  } catch (e) {
    /* ignore */
  }
  cache[appid] = out;
  saveAppdetailsCache();
  return out;
}

// 本地 librarycache 里的文件名匹配规则（不同游戏命名不一，按优先级尝试）
const LOCAL_PATTERNS = {
  portrait: [/^library_600x900(_[a-z]+)?(_2x)?\.(jpe?g|png)$/i, /^library_600x900.*\.(jpe?g|png)$/i],
  grid: [/^library_header(_[a-z]+)?\.(jpe?g|png)$/i, /^header(_[a-z]+)?\.(jpe?g|png)$/i, /^capsule.*\.(jpe?g|png)$/i],
  hero: [/^library_hero\.(jpe?g|png)$/i, /^library_hero.*\.(jpe?g|png)$/i],
  logo: [/^logo\.(png|jpe?g)$/i],
  icon: [], // 本地缓存也不把 logo 当作图标
};

function findLocal(steamPaths, appid, type) {
  const pats = LOCAL_PATTERNS[type] || [];
  for (const sp of steamPaths || []) {
    const dir = path.join(sp, 'appcache', 'librarycache', String(appid));
    let files = [];
    try {
      files = fs.readdirSync(dir);
    } catch (e) {
      continue;
    }
    for (const pat of pats) {
      const hit = files.find((f) => pat.test(f));
      if (hit) {
        const full = path.join(dir, hit);
        try {
          if (fs.statSync(full).size > 0) return full;
        } catch (e) {
          /* ignore */
        }
      }
    }
  }
  return null;
}

function cachePath(appid, type) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, `${appid}_${type}.${EXT[type] || 'jpg'}`);
}

function fetchTo(url, dest, depth) {
  if ((depth || 0) > 3) return Promise.reject(new Error('too many redirects'));
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'GameArtLibrary/0.8' }, timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchTo(res.headers.location, dest, (depth || 0) + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const ws = fs.createWriteStream(dest);
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => resolve(dest)));
      ws.on('error', reject);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

/** 返回 { path, source } 或 null */
async function resolveDefault(steamPaths, appid, type) {
  const local = findLocal(steamPaths, appid, type);
  if (local) return { path: local, source: 'local' };

  const cached = cachePath(appid, type);
  try {
    if (fs.statSync(cached).size > 0) return { path: cached, source: readSource(appid, type) || 'cache' };
  } catch (e) {
    /* not cached */
  }

  for (const url of candidateUrls(appid, type)) {
    try {
      await fetchTo(url, cached, 0);
      writeSource(appid, type, 'cdn');
      return { path: cached, source: 'cdn' };
    } catch (e) {
      /* 换下一个候选 URL */
    }
  }

  // 兜底：新游戏的资源在带哈希的子目录里，旧路径 404 —— 用商店接口取
  if (type === 'grid' || type === 'hero') {
    const assets = await getStoreAssets(appid);
    const url = type === 'grid' ? assets.header : assets.background || assets.header;
    if (url) {
      try {
        await fetchTo(url, cached, 0);
        writeSource(appid, type, 'store');
        return { path: cached, source: 'store' };
      } catch (e) {
        /* ignore */
      }
    }
  }

  try {
    fs.unlinkSync(cached);
  } catch (_) {
    /* ignore */
  }
  return null;
}

module.exports = { resolveDefault, resolveFromSgdb, resolveFor, getStoreNameZh };

/**
 * 从 Steam 商店取简体中文游戏名。
 * 返回值语义（重要，调用方据此决定"要不要记住"）：
 *   · 字符串 = 取到了中文名；
 *   · `null` = **商店确认这个游戏没有中文名**（可以安全地"记住、不再重复请求"）；
 *   · **抛错** = 网络/接口失败（**不要**记住，下次还要重试）。
 */
async function getStoreNameZh(appid) {
  let j;
  try {
    j = await httpsGetJson('https://store.steampowered.com/api/appdetails?appids=' + appid + '&l=schinese&filters=basic');
  } catch (e) {
    const err = new Error('商店请求失败：' + ((e && e.message) || e));
    err.transient = true;
    throw err;
  }
  const d = j && j[appid] && j[appid].data;
  return d && d.name ? d.name : null;
}

/** 统一入口：本地/缓存 → CDN → 商店 → SteamGridDB 兜底。返回 { path, source } 或 null */
async function resolveFor(steamPaths, appid, type, key) {
  let r = await resolveDefault(steamPaths, appid, type);
  if (!r && key) r = await resolveFromSgdb(appid, type, key);
  return r;
}

/* ---- SteamGridDB 兜底（Steam 公开资源没有的类型，如新游戏的竖版/Logo） ---- */

function noneMarker(appid, type) {
  return path.join(CACHE_DIR, `${appid}_${type}.none`);
}
function hasNone(appid, type) {
  try {
    return fs.statSync(noneMarker(appid, type)).isFile();
  } catch (e) {
    return false;
  }
}
function markNone(appid, type) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(noneMarker(appid, type), '1');
  } catch (e) {
    /* ignore */
  }
}

// 记录每张缓存图的"真实来源"（local/cdn/store/sgdb），供界面正确标注
function sourceMarker(appid, type) {
  return path.join(CACHE_DIR, `${appid}_${type}.src`);
}
function readSource(appid, type) {
  try {
    return fs.readFileSync(sourceMarker(appid, type), 'utf8').trim() || null;
  } catch (e) {
    return null;
  }
}
function writeSource(appid, type, src) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(sourceMarker(appid, type), src);
  } catch (e) {
    /* ignore */
  }
}

let sgdbGameCache = null;
function sgdbGameCacheFile() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, '_sgdbgames.json');
}
function loadSgdbGames() {
  if (sgdbGameCache) return sgdbGameCache;
  try {
    sgdbGameCache = JSON.parse(fs.readFileSync(sgdbGameCacheFile(), 'utf8'));
  } catch (e) {
    sgdbGameCache = {};
  }
  return sgdbGameCache;
}
function saveSgdbGames() {
  try {
    fs.writeFileSync(sgdbGameCacheFile(), JSON.stringify(sgdbGameCache));
  } catch (e) {
    /* ignore */
  }
}

/** 用 SteamGridDB 取某类型图并缓存；找不到返回 null */
async function resolveFromSgdb(appid, type, key) {
  if (!key) return null;
  const cached = cachePath(appid, type);
  try {
    if (fs.statSync(cached).size > 0) return { path: cached, source: readSource(appid, type) || 'sgdb' };
  } catch (e) {
    /* not cached */
  }
  if (hasNone(appid, type)) return null;

  const games = loadSgdbGames();
  let sgdbId = games[appid];
  if (sgdbId === undefined) {
    try {
      const g = await sgdb.getGameBySteamAppid(appid, key);
      sgdbId = g ? g.id : null;
    } catch (e) {
      return null;
    }
    games[appid] = sgdbId;
    saveSgdbGames();
  }
  if (!sgdbId) {
    markNone(appid, type);
    return null;
  }

  let arts = [];
  try {
    const res = await sgdb.getArt(type, sgdbId, key);
    arts = res.arts;
  } catch (e) {
    return null;
  }
  if (!arts.length) {
    markNone(appid, type);
    return null;
  }
  // 优先官方(official)，否则取第一张
  const pick = arts.find((a) => a.style === 'official') || arts[0];
  try {
    await sgdb.downloadTo(pick.url, cached);
    writeSource(appid, type, 'sgdb');
    return { path: cached, source: 'sgdb' };
  } catch (e) {
    return null;
  }
}
