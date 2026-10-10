'use strict';

/**
 * appinfo.js —— 解析 Steam 的 appcache/appinfo.vdf（只读），提取 appid -> 游戏名
 *
 * 参考格式（magic 0x07564429，Steam 客户端 2024-06 之后）：
 *   文件头 16 字节:
 *     uint32 magic = 0x07564429
 *     uint32 universe
 *     uint64 stringTableOffset
 *   字符串表（位于 stringTableOffset）:
 *     uint32 stringCount
 *     stringCount 个以 \0 结尾的 UTF-8 字符串（键/值以「索引」引用）
 *   app 条目（从偏移 16 开始，直到 appid == 0 或到达字符串表）:
 *     uint32 appid
 *     uint32 size                    // = 60 + VDF 数据长度
 *     byte[60] 头部（InfoState/LastUpdated/AccessToken/两个 SHA1/ChangeNumber）
 *     byte[size-60] VDF 数据
 *     —— 即 VDF 数据从条目偏移 68 开始
 *
 * VDF 数据为二进制 KeyValues：
 *   0x00 对象（键索引 + 嵌套）  0x01 字符串（键索引 + 内联 \0 字符串）
 *   0x02 int32                   0x03 float32   0x07 uint64   0x06 color
 *   0x08 对象结束
 *
 * 我们只提取 appinfo.common.name。任何条目解析失败都跳过，绝不抛异常。
 */

const fs = require('fs');

const MAGIC_41 = 0x07564429; // 新版格式（含字符串表）；旧版 0x07564428 无字符串表，不支持
const APPINFO_HEADER_AFTER_SIZE = 60;
const APPINFO_VDF_DATA_OFFSET = 8 + APPINFO_HEADER_AFTER_SIZE; // 68

function parseAppInfoNames(file) {
  const names = {};
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    return names;
  }
  if (buf.length < 16) return names;
  const magic = buf.readUInt32LE(0);
  if (magic !== MAGIC_41) return names; // 仅支持新版格式（旧版无字符串表）

  const strTableOffset = Number(buf.readBigUInt64LE(8));
  if (strTableOffset <= 16 || strTableOffset > buf.length) return names;

  // ---- 解析字符串表 ----
  let strings = [];
  try {
    let p = strTableOffset;
    const count = buf.readUInt32LE(p);
    p += 4;
    strings = new Array(count);
    for (let i = 0; i < count; i++) {
      let end = buf.indexOf(0, p);
      if (end === -1 || end > buf.length) {
        end = buf.length;
      }
      strings[i] = buf.toString('utf8', p, end);
      p = end + 1;
    }
  } catch (e) {
    return names;
  }
  const str = (idx) => (idx >= 0 && idx < strings.length ? strings[idx] : '#' + idx);

  // ---- 在 [start,end) 内解析一个 VDF 对象 ----
  function parseObject(start, end) {
    let p = start;
    const obj = {};
    while (p < end) {
      const type = buf.readUInt8(p);
      p += 1;
      if (type === 0x08) break;
      const key = str(buf.readUInt32LE(p));
      p += 4;
      switch (type) {
        case 0x00: {
          // 嵌套对象：递归，返回结束位置
          const r = parseObject(p, end);
          obj[key] = r.obj;
          p = r.next;
          break;
        }
        case 0x01: {
          // 内联 \0 结尾字符串
          let e = buf.indexOf(0, p);
          if (e === -1 || e > end) e = end;
          obj[key] = buf.toString('utf8', p, e);
          p = e + 1;
          break;
        }
        case 0x02: {
          obj[key] = buf.readInt32LE(p);
          p += 4;
          break;
        }
        case 0x03: {
          obj[key] = buf.readFloatLE(p);
          p += 4;
          break;
        }
        case 0x06: {
          obj[key] = buf.readUInt32LE(p);
          p += 4;
          break;
        }
        case 0x07: {
          obj[key] = Number(buf.readBigUInt64LE(p));
          p += 8;
          break;
        }
        case 0x05: {
          // wstring：UTF-16LE，两个 \0 结尾
          let e = p;
          while (e + 1 < end && !(buf[e] === 0 && buf[e + 1] === 0)) e += 2;
          obj[key] = buf.toString('utf16le', p, e);
          p = e + 2;
          break;
        }
        default:
          return { obj, next: end }; // 未知类型：放弃当前对象
      }
    }
    return { obj, next: p };
  }

  // ---- 遍历 app 条目 ----
  let pos = 16;
  while (pos + APPINFO_VDF_DATA_OFFSET <= strTableOffset) {
    const appid = buf.readUInt32LE(pos);
    pos += 4;
    if (appid === 0) break;
    const size = buf.readUInt32LE(pos);
    pos += 4;
    const vdfStart = pos + APPINFO_HEADER_AFTER_SIZE; // pos 此时指向 60 字节头
    const vdfSize = size - APPINFO_HEADER_AFTER_SIZE;
    const vdfEnd = vdfStart + vdfSize;
    if (vdfSize < 0 || vdfEnd > strTableOffset) break;
    try {
      const root = parseObject(vdfStart, vdfEnd);
      const info = root.obj && root.obj.appinfo;
      const name = info && info.common && info.common.name;
      if (name) names[String(appid)] = name;
    } catch (e) {
      /* 跳过无法解析的条目 */
    }
    pos = vdfEnd;
  }

  return names;
}

module.exports = { parseAppInfoNames };
