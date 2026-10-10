'use strict';

/**
 * sgdb.js —— SteamGridDB API v2 封装（Phase 2）
 *
 * 需要 API Key（Bearer Token）。Key 由用户在设置里填入，存本地库 settings 表。
 * 只做「搜索游戏」「获取某类型艺术资源列表」「下载图片」。
 *
 * 注意合规：仅按需下载，遵守 SteamGridDB 条款与速率限制；不 rehost、不二次分发。
 */

const https = require('https');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const pshttp = require('./pshttp');

const API_HOST = 'www.steamgriddb.com';

/**
 * TLS 兼容：某些公司网络 / 抓包代理会用**自签证书**中间人拦截 HTTPS，
 * 导致 Node 报 `DEPTH_ZERO_SELF_SIGNED_CERT`（`--use-system-ca` 也无效，因为系统根库同样不信任）。
 * 仅当出现**证书类错误**时，回退为"不校验证书"重试一次（可被设置关闭）。
 * 只影响从 SteamGridDB 抓取**公开图片/列表**，不涉及账号密码。
 */
let INSECURE_FALLBACK = true;
function setInsecureFallback(v) {
  INSECURE_FALLBACK = !!v;
}
let _insecureAgent = null;
function insecureAgent() {
  if (!_insecureAgent) _insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });
  return _insecureAgent;
}

/**
 * 支持环境变量代理（HTTP_PROXY / HTTPS_PROXY / ALL_PROXY，含大小写）。
 * Node 默认**不读**这些变量；这里实现一个最小的「HTTPS over HTTP 代理」隧道
 * （net 连到代理 → 发 CONNECT → 在其中做 TLS），零第三方依赖。仅支持 http(s) 代理地址。
 */
function proxyUrl() {
  const e = process.env;
  return e.HTTPS_PROXY || e.https_proxy || e.HTTP_PROXY || e.http_proxy || e.ALL_PROXY || e.all_proxy || null;
}
class HttpProxyAgent extends https.Agent {
  constructor(proxyStr, insecure) {
    super({ keepAlive: false });
    const s = /^https?:\/\//i.test(proxyStr) ? proxyStr : 'http://' + proxyStr;
    this.proxy = new URL(s);
    this.insecure = !!insecure;
  }
  createConnection(options, cb) {
    const proxy = this.proxy;
    const host = options.host;
    const port = Number(options.port) || 443;
    const proxyPort = proxy.port ? Number(proxy.port) : proxy.protocol === 'https:' ? 443 : 80;
    const raw = net.connect(proxyPort, proxy.hostname);
    raw.setTimeout(20000);
    let done = false;
    const fail = (e) => {
      if (done) return;
      done = true;
      try {
        raw.destroy();
      } catch (_) {
        /* ignore */
      }
      cb(e);
    };
    raw.on('error', fail);
    raw.on('timeout', () => fail(new Error('代理连接超时')));
    const startTunnel = (socket) => {
      let head = 'CONNECT ' + host + ':' + port + ' HTTP/1.1\r\nHost: ' + host + ':' + port + '\r\n';
      if (proxy.username || proxy.password) {
        const auth = Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64');
        head += 'Proxy-Authorization: Basic ' + auth + '\r\n';
      }
      head += 'Proxy-Connection: keep-alive\r\n\r\n';
      socket.write(head);
      let buf = '';
      const onData = (chunk) => {
        buf += chunk.toString('latin1');
        const i = buf.indexOf('\r\n\r\n');
        if (i === -1) return;
        socket.removeListener('data', onData);
        const status = buf.slice(0, i).split('\r\n')[0];
        if (!/ 200\b/.test(status)) return fail(new Error('代理 CONNECT 失败：' + status));
        const tlsSocket = tls.connect({ socket, servername: host, rejectUnauthorized: !this.insecure }, () => {
          if (done) return;
          done = true;
          cb(null, tlsSocket);
        });
        tlsSocket.on('error', fail);
      };
      socket.on('data', onData);
    };
    raw.once('connect', () => {
      if (proxy.protocol === 'https:') {
        const ps = tls.connect({ socket: raw, servername: proxy.hostname }, () => startTunnel(ps));
        ps.on('error', fail);
      } else {
        startTunnel(raw);
      }
    });
  }
}
/** 依据"是否回退不校验证书"选择 agent（有代理环境变量就走代理隧道） */
function agentFor(insecure) {
  const p = proxyUrl();
  if (p) return new HttpProxyAgent(p, insecure);
  return insecure ? insecureAgent() : undefined;
}
const CERT_ERR = /(SELF_SIGNED|DEPTH_ZERO|UNABLE_TO_VERIFY|CERT_|self[- ]?signed|UNABLE_TO_GET_ISSUER|ERR_TLS_CERT)/i;
function isCertError(e) {
  return CERT_ERR.test(String((e && (e.code || e.message)) || ''));
}
// 瞬时网络抖动（代理/网络环境常见），可重试
const TRANSIENT_ERR = /(ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|EAI_AGAIN|socket hang up|ESOCKETTIMEDOUT)/i;
function isTransient(e) {
  return TRANSIENT_ERR.test(String((e && (e.code || e.message)) || ''));
}

// 我们的类型 -> SGDB 端点
const TYPE_ENDPOINT = {
  portrait: 'grids',
  grid: 'grids',
  grids: 'grids', // 竖向+横向共用：一次取回全部网格（不按方向过滤），由前端分流
  hero: 'heroes',
  logo: 'logos',
  icon: 'icons',
};

// ---- 节流：SGDB 请求之间至少间隔 1000ms（≈60 次/分钟），避免触发限流/封禁 ----
let _lastReqAt = 0;
const MIN_INTERVAL = 1000;
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, _lastReqAt + MIN_INTERVAL - now);
  _lastReqAt = Date.now() + wait;
  if (wait) await delay(wait);
}

// 若已知"这网络会拦截 Node"（系统栈可用），一段时间内直接走系统栈 → 首屏快、不白等
let _preferPsUntil = 0;
function preferPs() {
  return Date.now() < _preferPsUntil;
}
function markPreferPs() {
  _preferPsUntil = Date.now() + 10 * 60 * 1000; // 10 分钟内优先用系统栈
}

function apiHeaders(key) {
  return { Authorization: 'Bearer ' + key, Accept: 'application/json', 'User-Agent': 'GameArtLibrary/0.3' };
}
function apiUrl(pathname) {
  return 'https://' + API_HOST + '/api/v2' + pathname;
}

async function request(pathname, key) {
  // 已知 Node 会被拦 → 直接用系统 HTTP 栈（快）
  if (pshttp.available() && preferPs()) {
    try {
      return pshttp.getJson(apiUrl(pathname), apiHeaders(key));
    } catch (pe) {
      if (pe && pe.rateLimited) throw pe;
      if (!isTransient(pe) && !isCertError(pe)) throw pe; // 真的 4xx/解析错误 → 直接抛
      /* 否则继续尝试 Node */
    }
  }
  const doGet = (insecure) =>
    new Promise((resolve, reject) => {
      const req = https.get(
        {
          host: API_HOST,
          path: '/api/v2' + pathname,
          headers: {
            Authorization: 'Bearer ' + key,
            'User-Agent': 'GameArtLibrary/0.3',
            Accept: 'application/json',
          },
          timeout: 8000, // 被拦时快速失败（不再白等 20s）
          ...(() => {
            const ag = agentFor(insecure);
            return ag ? { agent: ag } : {};
          })(),
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (res.statusCode === 401) return reject(new Error('API Key 无效或未授权 (401)'));
            if (res.statusCode === 404) return resolve({ success: false, data: [] });
            if (res.statusCode === 429) {
              const e = new Error('请求过于频繁 (429)');
              e.rateLimited = true;
              return reject(e);
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
              const err = new Error('SteamGridDB 返回 ' + res.statusCode);
              if (res.statusCode >= 500) err.transient = true; // 5xx 可重试
              return reject(err);
            }
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('无法解析 SteamGridDB 响应'));
            }
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('请求 SteamGridDB 超时'));
      });
      req.on('error', (e) => {
        const err = new Error('网络错误：' + e.message);
        err.code = e && e.code;
        reject(err);
      });
    });

  // 遇到限流：指数退避重试（5s / 15s / 30s）；仍失败则抛出（调用方不会当作"无结果"缓存）
  let attempt = 0;
  let insecureTried = false;
  let netTries = 3;
  for (;;) {
    await throttle();
    try {
      return await doGet(insecureTried);
    } catch (e) {
      // ① 证书类错误 → 先回退为不校验证书重试一次（快）
      if (!insecureTried && INSECURE_FALLBACK && isCertError(e)) {
        insecureTried = true;
        continue;
      }
      // ② Node 被网络拦截 → **立刻**改用系统 HTTP 栈（不先耗掉一堆重试，保证首屏快）
      if (pshttp.available() && (isCertError(e) || isTransient(e) || e.transient)) {
        try {
          const j = pshttp.getJson(apiUrl(pathname), apiHeaders(key));
          markPreferPs();
          return j;
        } catch (pe) {
          if (pe && pe.rateLimited) throw pe;
        }
      }
      // ③ 限流退避
      if (e && e.rateLimited && attempt < 3) {
        attempt++;
        await delay(5000 * attempt * (attempt === 1 ? 1 : attempt));
        continue;
      }
      // ④ 瞬时抖动再给 Node 少量重试
      if (netTries > 0 && (isTransient(e) || e.transient)) {
        netTries--;
        await delay(700);
        continue;
      }
      throw e;
    }
  }
}

/** 按名字搜索游戏，返回 [{ id, name, release_date }] */
async function searchGames(term, key) {
  if (!key) throw new Error('尚未设置 SteamGridDB API Key');
  const r = await request('/search/autocomplete/' + encodeURIComponent(term), key);
  return (r.data || []).map((g) => ({ id: g.id, name: g.name, release_date: g.release_date || null }));
}

const PAGE_SIZE = 50; // SteamGridDB 每页固定返回 50 条（无法用参数覆盖）

/**
 * 取某游戏某类型的艺术资源列表。
 * @param {string} type   portrait|grid|hero|logo|icon
 * @param {string|number} gameId  SGDB 游戏 id
 * @param {string} key    API Key
 * @param {Object} [opts] { page=1, types='static,animated', nsfw='any'|'', humor='any'|'' }
 * @returns {Promise<{arts:Array, page:number, hasMore:boolean}>}
 */
async function getArt(type, gameId, key, opts) {
  if (!key) throw new Error('尚未设置 SteamGridDB API Key');
  const endpoint = TYPE_ENDPOINT[type];
  if (!endpoint) throw new Error('未知类型: ' + type);
  opts = opts || {};

  const params = new URLSearchParams();
  params.set('page', String(opts.page == null ? 0 : Number(opts.page))); // SGDB 分页从 0 开始！
  if (opts.types) params.set('types', opts.types); // static / animated（逗号分隔）
  if (opts.nsfw) params.set('nsfw', opts.nsfw); // false=排除 / true=只看成人 / any=都要
  if (opts.humor) params.set('humor', opts.humor); // false=排除 / true=只看幽默 / any=都要
  if (opts.epilepsy) params.set('epilepsy', opts.epilepsy);
  if (opts.oneoftag) params.set('oneoftag', opts.oneoftag); // 只看（幽默 或 成人）

  const r = await request(`/${endpoint}/game/${encodeURIComponent(gameId)}?${params.toString()}`, key);
  const raw = r.data || [];
  let list = raw.map((a) => ({
    sgdb_id: a.id,
    url: a.url,
    thumb: a.thumb || a.url,
    width: a.width || null,
    height: a.height || null,
    mime: a.mime || null,
    nsfw: !!a.nsfw,
    humor: !!a.humor,
    epilepsy: !!a.epilepsy,
    author: a.author && a.author.name ? a.author.name : null,
    style: a.style || null,
  }));
  // SGDB 的 grids 接口同时返回竖版(600×900)与横版(920×430 等)，这里按方向过滤，避免"横向里混入竖版"
  if (type === 'portrait') {
    list = list.filter((a) => !a.width || !a.height || a.width < a.height);
  } else if (type === 'grid') {
    list = list.filter((a) => !a.width || !a.height || a.width > a.height);
  }
  return { arts: list, page: opts.page == null ? 0 : Number(opts.page), hasMore: raw.length >= PAGE_SIZE };
}

/** 下载图片到指定路径（证书类错误时回退为不校验证书重试一次，见文件头说明） */
function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    const attempt = (insecure, tries) => {
      const fileStream = fs.createWriteStream(dest);
      const opts = { headers: { 'User-Agent': 'GameArtLibrary/0.3' }, timeout: 30000 };
      const ag = agentFor(insecure);
      if (ag) opts.agent = ag;
      https
        .get(url, opts, (res) => {
          if (res.statusCode === 429 || res.statusCode >= 500) {
            res.resume();
            fileStream.close();
            fs.unlink(dest, () => {});
            if (tries > 0) return setTimeout(() => attempt(insecure, tries - 1), 1200); // 限流/服务端错误 → 重试
            return reject(new Error('下载失败 HTTP ' + res.statusCode));
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            fileStream.close();
            fs.unlink(dest, () => {});
            return reject(new Error('下载失败 HTTP ' + res.statusCode));
          }
          res.pipe(fileStream);
          fileStream.on('finish', () => fileStream.close(() => resolve(dest)));
        })
        .on('error', (e) => {
          fileStream.close();
          fs.unlink(dest, () => {});
          if (!insecure && INSECURE_FALLBACK && isCertError(e)) {
            console.warn('[sgdb] 下载 TLS 证书校验失败，回退为不校验证书重试：' + (e.code || e.message));
            return attempt(true, tries);
          }
          if (tries > 0 && isTransient(e)) {
            return setTimeout(() => attempt(insecure, tries - 1), 800); // 网络抖动重试
          }
          // 最后兜底：系统 HTTP 栈下载
          if (pshttp.available() && (isCertError(e) || isTransient(e))) {
            try {
              pshttp.download(url, dest);
              return resolve(dest);
            } catch (pe) {
              /* ignore */
            }
          }
          reject(e);
        });
    };
    attempt(false, 4);
  });
}

/** 按 Steam AppID 查 SGDB 游戏 -> { id, name } 或 null */
async function getGameBySteamAppid(appid, key) {
  if (!key) throw new Error('尚未设置 SteamGridDB API Key');
  const r = await request('/games/steam/' + encodeURIComponent(appid), key);
  if (r && r.success && r.data) return { id: r.data.id, name: r.data.name };
  return null;
}

/** 取某游戏某类型的**全部**图（自动翻完所有页）。opts 同 getArt（不需要 page）。 */
async function getAllArt(type, gameId, key, opts) {
  opts = opts || {};
  const all = [];
  const MAX_PAGES = 40;
  for (let page = 0; page < MAX_PAGES; page++) { // SGDB 分页从 0 开始
    const r = await getArt(type, gameId, key, Object.assign({}, opts, { page }));
    for (const a of r.arts) all.push(a);
    if (!r.hasMore) break;
  }
  return all;
}

module.exports = { searchGames, getArt, getAllArt, downloadTo, getGameBySteamAppid, setInsecureFallback };
