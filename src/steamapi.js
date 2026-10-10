'use strict';

/**
 * steamapi.js —— Steam Web API 封装（用于绑定账号、获取"拥有的全部游戏"）
 *
 * 需要：Steam Web API Key（https://steamcommunity.com/dev/apikey）+ SteamID64 / 自定义网址。
 * 前提：账号资料的「游戏详情」需设为公开，否则 GetOwnedGames 返回空。
 *
 * 只做只读查询（ResolveVanityURL / GetPlayerSummaries / GetOwnedGames），
 * 不涉及登录、不涉及任何可能触发封号的操作。
 */

const https = require('https');

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'GameArtLibrary/0.4', Accept: 'application/json' }, timeout: 20000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        if (res.statusCode === 403) return reject(new Error('Steam 拒绝了请求（Key 无效或权限不足）'));
        if (res.statusCode < 200 || res.statusCode >= 300 && res.statusCode !== 400) {
          /* continue try parse */
        }
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(new Error('无法解析 Steam 响应'));
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求 Steam 超时'));
    });
    req.on('error', (e) => reject(new Error('网络错误：' + e.message)));
  });
}

/** 从各种输入里解析出 SteamID64 或 vanity：支持纯 SteamID64、profile 链接、id 链接、自定义名 */
function extractSteamId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^\d{17}$/.test(s)) return { steamid64: s };
  let m = s.match(/profiles\/(\d{17})/);
  if (m) return { steamid64: m[1] };
  m = s.match(/id\/([^/?#]+)/);
  if (m) return { vanity: m[1] };
  if (/^[A-Za-z0-9_-]+$/.test(s)) return { vanity: s };
  return null;
}

async function resolveVanity(vanity, key) {
  const url =
    'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=' +
    encodeURIComponent(key) +
    '&vanityurl=' +
    encodeURIComponent(vanity);
  const j = await httpsGetJson(url);
  if (j && j.response && j.response.success === 1 && j.response.steamid) return j.response.steamid;
  throw new Error('无法解析该 Steam 自定义网址（vanity），请直接填 SteamID64 或主页链接');
}

async function getPlayerSummary(steamid64, key) {
  try {
    const url =
      'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=' +
      encodeURIComponent(key) +
      '&steamids=' +
      encodeURIComponent(steamid64);
    const j = await httpsGetJson(url);
    const p = j && j.response && j.response.players && j.response.players[0];
    if (p) return { persona: p.personaname, avatar: p.avatarfull, profileurl: p.profileurl };
  } catch (e) {
    /* ignore */
  }
  return {};
}

/** 获取账号拥有的全部游戏 -> [{appid, name, playtime}] */
async function getOwnedGames(steamid64, key) {
  const url =
    'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=' +
    encodeURIComponent(key) +
    '&steamid=' +
    encodeURIComponent(steamid64) +
    '&include_appinfo=1&include_played_free_games=1&format=json';
  const j = await httpsGetJson(url);
  const r = j && j.response;
  if (!r) throw new Error('Steam 返回异常');
  if (!r.games) return []; // 多为资料不可见
  return r.games.map((g) => ({
    appid: String(g.appid),
    name: g.name || '',
    playtime: g.playtime_forever || 0,
  }));
}

module.exports = { extractSteamId, resolveVanity, getPlayerSummary, getOwnedGames };
