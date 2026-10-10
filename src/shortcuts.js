'use strict';

/**
 * shortcuts.vdf —— Steam 非 Steam 游戏的清单（只读）
 *
 * 标准二进制 KeyValues（键/值均为内联 \0 字符串）：
 *   0x00 对象  0x01 字符串  0x02 int32  0x03 float  0x07 uint64  0x08 结束
 * 结构： "shortcuts" { "0" { appid (int32), AppName, Exe, ... } "1" {...} }
 *
 * grid 目录里非 Steam 游戏的文件名使用 appid 的「无符号 32 位」表示，
 * 因此这里把 int32 用 >>> 0 转成无符号后再做映射。
 */

const fs = require('fs');

function parseShortcuts(file) {
  const map = {};
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    return map;
  }

  function readStr(p) {
    const e = buf.indexOf(0, p);
    const end = e < 0 ? buf.length : e;
    return { s: buf.toString('utf8', p, end), next: end + 1 };
  }

  function parseObj(p, end) {
    const obj = {};
    while (p < end) {
      const type = buf.readUInt8(p);
      p += 1;
      if (type === 0x08) return { obj, next: p };
      const r = readStr(p);
      const key = r.s;
      p = r.next;
      if (type === 0x00) {
        const res = parseObj(p, end);
        obj[key] = res.obj;
        p = res.next;
      } else if (type === 0x01) {
        const rs = readStr(p);
        obj[key] = rs.s;
        p = rs.next;
      } else if (type === 0x02) {
        obj[key] = buf.readInt32LE(p);
        p += 4;
      } else if (type === 0x03) {
        obj[key] = buf.readFloatLE(p);
        p += 4;
      } else if (type === 0x07) {
        obj[key] = Number(buf.readBigUInt64LE(p));
        p += 8;
      } else {
        return { obj, next: end };
      }
    }
    return { obj, next: p };
  }

  try {
    const root = parseObj(0, buf.length).obj;
    const shortcuts = root.shortcuts || root.Shortcuts || {};
    for (const k of Object.keys(shortcuts)) {
      const s = shortcuts[k];
      if (!s || typeof s !== 'object') continue;
      const appidRaw = s.appid !== undefined ? s.appid : s.AppId;
      const name = s.AppName || s.appname;
      if (appidRaw === undefined || !name) continue;
      map[String(appidRaw >>> 0)] = name;
    }
  } catch (e) {
    /* ignore */
  }
  return map;
}

module.exports = { parseShortcuts };
