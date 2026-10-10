'use strict';

/**
 * tools/make-banner.js —— 生成 README 横幅 docs/banner.svg（内嵌软件图标，无需外部资源）
 * 用法： dev.cmd node tools\make-banner.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const icon = fs.readFileSync(path.join(ROOT, 'public', 'icon.png')).toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="330" viewBox="0 0 1280 330" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1020"/>
      <stop offset="0.55" stop-color="#141b34"/>
      <stop offset="1" stop-color="#241a3d"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4cc9ff"/>
      <stop offset="1" stop-color="#b06bff"/>
    </linearGradient>
    <radialGradient id="glow1" cx="0.15" cy="0.2" r="0.6">
      <stop offset="0" stop-color="#4cc9ff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#4cc9ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.9" cy="0.9" r="0.7">
      <stop offset="0" stop-color="#b06bff" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#b06bff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="330" fill="url(#bg)"/>
  <rect width="1280" height="330" fill="url(#glow1)"/>
  <rect width="1280" height="330" fill="url(#glow2)"/>
  <image x="86" y="95" width="140" height="140" href="data:image/png;base64,${icon}"/>
  <text x="270" y="158" font-size="66" font-weight="700" fill="#ffffff">游戏艺术库</text>
  <text x="272" y="205" font-size="30" font-weight="600" fill="url(#brand)">GameArt Library</text>
  <text x="272" y="252" font-size="19" fill="#c9d4ea">统一管理 · 一键同步你的游戏自定义艺术作品到 Steam</text>
  <text x="272" y="282" font-size="15" fill="#8fa0c0">本地优先 · BYOK 自备 API Key · 单文件 .gameart 保险箱 · 不注入不修改 Steam</text>
</svg>
`;

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'banner.svg'), svg);
console.log('wrote docs/banner.svg');
