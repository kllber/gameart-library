'use strict';

/**
 * pshttp.js —— 「系统 HTTP 栈」兜底传输（**全异步**）
 *
 * 背景（§10 #58）：某些公司代理/安全网关会依据 **TLS 客户端指纹** 拦截非系统栈的请求，
 * 表现为 Node / curl 对某主机一律 `ECONNRESET`/自签证书错误，但 **系统栈能通**。
 * 这里用「系统栈」作为**最后兜底**：仅在 Node 的 https 失败（证书/重置）时调用。
 *   · Windows：PowerShell `Invoke-WebRequest`（.NET / SChannel）
 *   · Linux  ：`curl`（若存在；用纯 `fs` 探测，**不 spawn、不报告**）
 *
 * ⚠️ 必须**异步**：早期版本用 `spawnSync` 会**阻塞 Node 主线程**，
 *    导致选图器后台连续翻页/下载时**整个软件卡死没反应**（见 §10 #59）。**绝不能改回同步。**
 *
 * 平台无可用系统栈（如 macOS / Linux 无 curl）时 `available()` 返回 false，调用方自动跳过。
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

/* ---------------- curl 探测（纯 fs，无 spawn；结果缓存） ---------------- */
let _curl; // undefined=未探测；null=没有；字符串=curl 路径

function findCurl() {
  if (_curl !== undefined) return _curl;
  _curl = null;
  const cands = ['/usr/bin/curl', '/bin/curl', '/usr/local/bin/curl', '/snap/bin/curl', '/opt/homebrew/bin/curl'];
  const pathEnv = process.env.PATH || '';
  for (const d of pathEnv.split(path.delimiter)) if (d) cands.push(path.join(d, 'curl'));
  for (const c of cands) {
    try {
      if (fs.statSync(c).isFile()) {
        _curl = c;
        break;
      }
    } catch (e) {
      /* ignore */
    }
  }
  return _curl;
}

/** 是否有可用的「系统栈」兜底 */
function available() {
  if (IS_WINDOWS) return true;
  if (IS_LINUX) return !!findCurl();
  return false;
}

/* ---------------- 异步 execFile（通用） ---------------- */
function run(cmd, args, timeout) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { encoding: 'utf8', timeout: timeout || 40000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ err: err || null, out: String(stdout || '').replace(/^\uFEFF/, ''), errOut: String(stderr || '') });
      }
    );
  });
}

/* ---------------- Windows：PowerShell ---------------- */

/** 异步执行一段 PowerShell 脚本，返回 { out, err } */
function ps(script, timeout) {
  return new Promise((resolve) => {
    if (!IS_WINDOWS) return resolve({ out: '', err: 'pshttp(PowerShell) 仅支持 Windows' });
    let enc;
    try {
      enc = Buffer.from(script, 'utf16le').toString('base64');
    } catch (e) {
      return resolve({ out: '', err: String(e && e.message) });
    }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc],
      { encoding: 'utf8', timeout: timeout || 40000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ out: String(stdout || '').replace(/^\uFEFF/, ''), err: String(stderr || '') });
      }
    );
  });
}

function parseHeader(out) {
  const nl = out.indexOf('\n');
  const head = (nl >= 0 ? out.slice(0, nl) : out).trim();
  const body = nl >= 0 ? out.slice(nl + 1) : '';
  const m = /^(OK|ERR)\s+(\d+)$/.exec(head);
  if (!m) throw new Error('PowerShell 传输失败：' + (head || 'no output').slice(0, 200));
  return { ok: m[1] === 'OK', status: Number(m[2]), body };
}

function q(s) {
  return String(s).replace(/'/g, "''");
}

/** Windows：用系统栈 GET 一个 JSON 接口，返回解析后的对象（非 2xx 抛错） */
async function psGetJson(url, headers) {
  const hdr = Object.entries(headers || {})
    .map(([k, v]) => `'${q(k)}'='${q(v)}'`)
    .join('; ');
  const script =
    `$ProgressPreference='SilentlyContinue'\n` +
    `[Console]::OutputEncoding=[Text.Encoding]::UTF8\n` +
    `try {\n` +
    `  $h=@{ ${hdr} }\n` +
    `  $r=Invoke-WebRequest -Uri '${q(url)}' -Headers $h -UseBasicParsing -TimeoutSec 25\n` +
    `  [Console]::Out.WriteLine("OK " + [int]$r.StatusCode)\n` +
    `  [Console]::Out.WriteLine($r.Content)\n` +
    `} catch {\n` +
    `  $resp=$_.Exception.Response\n` +
    `  if ($resp) { [Console]::Out.WriteLine("ERR " + [int]$resp.StatusCode) } else { [Console]::Out.WriteLine("ERR 0"); [Console]::Out.WriteLine($_.Exception.Message) }\n` +
    `}\n`;
  const { out, err } = await ps(script, 40000);
  const { ok, status, body } = parseHeader(out);
  if (!ok || status < 200 || status >= 300) {
    const e = new Error('SteamGridDB 返回 ' + status + (status ? '' : '（' + err.trim().slice(0, 120) + '）'));
    e.statusCode = status;
    if (status === 429) e.rateLimited = true;
    if (status >= 500 || status === 0) e.transient = true;
    throw e;
  }
  return JSON.parse(body);
}

/** Windows：用系统栈下载文件到 dest（非 2xx 抛错） */
async function psDownload(url, dest) {
  const script =
    `$ProgressPreference='SilentlyContinue'\n` +
    `[Console]::OutputEncoding=[Text.Encoding]::UTF8\n` +
    `try {\n` +
    `  Invoke-WebRequest -Uri '${q(url)}' -OutFile '${q(dest)}' -UseBasicParsing -TimeoutSec 60\n` +
    `  [Console]::Out.WriteLine("OK 200")\n` +
    `} catch {\n` +
    `  $resp=$_.Exception.Response\n` +
    `  if ($resp) { [Console]::Out.WriteLine("ERR " + [int]$resp.StatusCode) } else { [Console]::Out.WriteLine("ERR 0"); [Console]::Out.WriteLine($_.Exception.Message) }\n` +
    `}\n`;
  const { out, err } = await ps(script, 90000);
  const { ok, status } = parseHeader(out);
  if (!ok || status < 200 || status >= 300) {
    const e = new Error('下载失败 HTTP ' + status + (status ? '' : '（' + err.trim().slice(0, 120) + '）'));
    if (status === 429) e.rateLimited = true;
    if (status >= 500 || status === 0) e.transient = true;
    throw e;
  }
}

/* ---------------- Linux：curl ---------------- */

/** 从 curl 输出（body + "\n" + 状态码）里拆出 body 与状态码 */
function splitCurlOut(out) {
  const nl = out.lastIndexOf('\n');
  if (nl < 0) return { body: '', status: Number(out.trim()) || 0 };
  return { body: out.slice(0, nl), status: Number(out.slice(nl + 1).trim()) || 0 };
}

/** Linux：用系统栈（curl）GET 一个 JSON 接口 */
async function curlGetJson(url, headers) {
  const curl = findCurl();
  if (!curl) throw new Error('系统栈（curl）不可用');
  const args = ['-sS', '-L', '--max-time', '25', '-w', '\n%{http_code}'];
  for (const [k, v] of Object.entries(headers || {})) args.push('-H', k + ': ' + v);
  args.push(url);
  const { err, out, errOut } = await run(curl, args, 40000);
  if (err && !out) {
    const e = new Error('curl 请求失败：' + (errOut || err.message || '').trim().slice(0, 160));
    e.transient = true;
    throw e;
  }
  const { body, status } = splitCurlOut(out);
  if (status < 200 || status >= 300) {
    const e = new Error('SteamGridDB 返回 ' + status);
    e.statusCode = status;
    if (status === 429) e.rateLimited = true;
    if (status >= 500 || status === 0) e.transient = true;
    throw e;
  }
  try {
    return JSON.parse(body);
  } catch (e) {
    throw new Error('无法解析 SteamGridDB 响应');
  }
}

/** Linux：用系统栈（curl）下载文件到 dest */
async function curlDownload(url, dest) {
  const curl = findCurl();
  if (!curl) throw new Error('系统栈（curl）不可用');
  const args = ['-sS', '-L', '--max-time', '60', '-o', dest, '-w', '%{http_code}', url];
  const { err, out, errOut } = await run(curl, args, 90000);
  const status = Number(String(out || '').trim()) || 0;
  if (status < 200 || status >= 300) {
    const e = new Error(
      '下载失败 HTTP ' + status + (status ? '' : '（' + (errOut || (err && err.message) || '').trim().slice(0, 120) + '）')
    );
    if (status === 429) e.rateLimited = true;
    if (status >= 500 || status === 0) e.transient = true;
    throw e;
  }
}

/* ---------------- 对外：按平台分发 ---------------- */

/** 用系统栈 GET 一个 JSON 接口（Windows=PowerShell；Linux=curl） */
async function getJson(url, headers) {
  if (IS_WINDOWS) return psGetJson(url, headers);
  return curlGetJson(url, headers);
}

/** 用系统栈下载文件（Windows=PowerShell；Linux=curl） */
async function download(url, dest) {
  if (IS_WINDOWS) return psDownload(url, dest);
  return curlDownload(url, dest);
}

module.exports = { available, getJson, download };
