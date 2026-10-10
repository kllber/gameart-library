const fs = require('fs');
const path = require('path');
// 用法: node makeico.js <输入目录> <输出ico>
const dir = path.resolve(process.argv[2]);
const out = path.resolve(process.argv[3]);
const sizes = [256, 128, 64, 48, 32, 16];
const pngs = sizes.map((s) => ({ s, buf: fs.readFileSync(path.join(dir, 'icon_' + s + '.png')) }));
const count = pngs.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(count, 4);
let offset = 6 + count * 16;
const entries = [];
for (const { s, buf } of pngs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(buf.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += buf.length;
}
fs.writeFileSync(out, Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]));
console.log('ICO written:', out, fs.statSync(out).size, 'bytes');
