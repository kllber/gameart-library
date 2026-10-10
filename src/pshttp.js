'use strict';

/**
 * pshttp.js —— 「系统 HTTP 栈」兜底传输（Windows）
 *
 * 背景（§10 #58）：某些公司代理/安全网关会依据 **TLS 客户端指纹** 拦截非系统栈的请求，
 * 表现为 Node / curl 对某主机一律 `ECONNRESET`/自签证书错误，但 **PowerShell(.NET/SChannel) 能通**。
 * 这里用 PowerShell 的 `Invoke-WebRequest` 作为**最后兜底**：仅在 Node 的 https 失败（证书/重置）时调用。
 *
 * 仅 Windows 可用；其它平台 `available()` 返回 false（调用方自动跳过）。
 */

const { spawnSync } = require('child_process');

function available() {
  return process.platform === 'win32';
}

function ps(script, timeout) {
  if (!available()) throw new Error('pshttp 仅支持 Windows');
  const enc = Buffer.from(script, 'utf16le').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], {
    encoding: 'utf8',
    timeout: timeout || 40000,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = String(r.stdout || '').replace(/^\uFEFF/, '');
  return { out, err: String(r.stderr || '') };
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

/** 用系统栈 GET 一个 JSON 接口，返回解析后的对象（非 2xx 抛错） */
function getJson(url, headers) {
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
  const { out, err } = ps(script, 40000);
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

/** 用系统栈下载文件到 dest（非 2xx 抛错） */
function download(url, dest) {
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
  const { out, err } = ps(script, 90000);
  const { ok, status } = parseHeader(out);
  if (!ok || status < 200 || status >= 300) {
    const e = new Error('下载失败 HTTP ' + status + (status ? '' : '（' + err.trim().slice(0, 120) + '）'));
    if (status === 429) e.rateLimited = true;
    if (status >= 500 || status === 0) e.transient = true;
    throw e;
  }
}

module.exports = { available, getJson, download };
