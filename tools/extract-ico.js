'use strict';

/**
 * tools/extract-ico.js —— 从多尺寸 .ico 中**取出内嵌的 PNG**（用于生成 Linux 需要的 PNG 图标）
 *
 * 现代 .ico 通常把 256/128/64/… 各尺寸以 PNG 形式内嵌，直接抽出来就能给 Linux 用。
 * 用法： node tools/extract-ico.js <file.ico> <outDir>
 */

const fs = require('fs');
const path = require('path');

const ico = process.argv[2];
const outDir = process.argv[3];
if (!ico || !outDir) {
  console.error('用法: node tools/extract-ico.js <file.ico> <outDir>');
  process.exit(1);
}

const buf = fs.readFileSync(ico);
if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
  console.error('不是有效的 .ico 文件');
  process.exit(1);
}

const count = buf.readUInt16LE(4);
fs.mkdirSync(outDir, { recursive: true });

let got = 0;
for (let i = 0; i < count; i++) {
  const off = 6 + i * 16;
  const w = buf.readUInt8(off) || 256;
  const h = buf.readUInt8(off + 1) || 256;
  const size = buf.readUInt32LE(off + 8);
  const dataOff = buf.readUInt32LE(off + 12);
  const data = buf.subarray(dataOff, dataOff + size);
  // PNG 签名 89 50 4E 47
  const isPng = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
  if (!isPng) {
    console.log(`  跳过 ${w}x${h}（不是内嵌 PNG）`);
    continue;
  }
  const out = path.join(outDir, 'icon_' + w + '.png');
  fs.writeFileSync(out, data);
  console.log(`  ${w}x${h} → ${path.relative(process.cwd(), out)}  (${size} bytes)`);
  got++;
}

console.log(`完成：提取 ${got} 张 PNG 到 ${outDir}`);
process.exit(got ? 0 : 1);
