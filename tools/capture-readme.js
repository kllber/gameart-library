'use strict';

/**
 * tools/capture-readme.js —— 为 README 批量截取界面图（中文 + 英文各一套）
 *
 * 用法： dev.cmd node tools\capture-readme.js http://127.0.0.1:<端口>
 * 前置： 先启动原生窗口，并**最大化窗口**（脚本不负责最大化）。
 *        通过开发自检桥 /api/dev/shot 截图（捕获的是窗口内容，不含系统标题栏）。
 *
 * 产出： docs/zh/<scene>.png 与 docs/en/<scene>.png
 */

const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:5178';
const OUT = path.resolve(__dirname, '..', 'docs');

async function ev(code) {
  const r = await fetch(BASE + '/api/dev/eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const j = await r.json();
  if (!j || !j.ok) throw new Error('eval 失败: ' + ((j && j.error) || r.status));
  return j.value;
}
async function shot(file) {
  const r = await fetch(BASE + '/api/dev/shot?format=jpeg&q=82&maxw=1600');
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return buf.length;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 每个场景：setup(JS) + 等待毫秒（让网络/图片加载完）
const SCENES = [
  {
    name: 'home',
    wait: 900,
    setup: `document.querySelectorAll('.modal').forEach(m=>m.hidden=true);
            state.search=''; document.getElementById('search').value='';
            state.sortMode='added'; render(); syncSortUi();
            document.querySelector('.main').scrollTop=0; 'x'`,
  },
  {
    name: 'add',
    wait: 4000,
    setup: `document.querySelectorAll('.modal').forEach(m=>m.hidden=true); openSync(); 'x'`,
  },
  {
    name: 'picker',
    wait: 6500,
    setup: `document.querySelectorAll('.modal').forEach(m=>m.hidden=true);
            openArtPicker({sgdbGameId:35001,name:'Apex Legends',appid:'1172470',type:'portrait',mode:'pick'}); 'x'`,
  },
  {
    name: 'detail',
    wait: 3000,
    setup: `document.querySelectorAll('.modal').forEach(m=>m.hidden=true); openDetail('2358720'); 'x'`,
  },
  {
    name: 'sort',
    wait: 1200,
    setup: `document.querySelectorAll('.modal').forEach(m=>m.hidden=true);
            const s=document.getElementById('search'); s.value=''; state.search='';
            state.sortMode='custom'; render(); syncSortUi();
            const cs=[...document.querySelectorAll('#grid .card')];
            if (cs[1]) cs[1].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,ctrlKey:true,clientX:cs[1].getBoundingClientRect().left+20,clientY:cs[1].getBoundingClientRect().top+20}));
            if (cs[2]) cs[2].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,button:0,ctrlKey:true,clientX:cs[2].getBoundingClientRect().left+20,clientY:cs[2].getBoundingClientRect().top+20}));
            document.querySelector('.main').scrollTop=0; 'x'`,
  },
  {
    name: 'apply',
    wait: 1800,
    setup: `document.querySelectorAll('.modal').forEach(m=>m.hidden=true); requestApply(null); 'x'`,
  },
  {
    name: 'categories',
    wait: 2200,
    setup: `document.querySelectorAll('.modal').forEach(m=>m.hidden=true);
            const id=(state.categories[0]||{}).id; if(id) openCatManage(id); 'x'`,
  },
  {
    name: 'settings',
    wait: 2200,
    // 注意：openSettings() 会从库里读回 ui 并套用（会把我们临时切成的浅色主题盖掉），
    // 所以要在它完成后再补一次"浅色 + 竖版"，保证整套截图风格一致（见 §16）
    setup: `document.querySelectorAll('.modal').forEach(m=>m.hidden=true);
            Promise.resolve(openSettings('appearance')).then(()=>{ applyUi(Object.assign({}, state.ui, {theme:'light', showType:'portrait'})); }); 'x'`,
  },
];

(async () => {
  // 记录用户原始偏好：截图期间临时切"浅色主题 + 竖版显示"（与旧图一致），**截完原样恢复**
  const orig = JSON.parse(await ev('JSON.stringify(state.ui)'));
  const origLang = (await ev("localStorage.getItem('gal.lang') || 'zh'")) || 'zh';
  for (const lang of ['zh', 'en']) {
    // 切换界面语言（全局偏好）+ 浅色主题 + 竖版卡片（只改内存状态，不落库）
    await ev(
      `localStorage.setItem('gal.lang','${lang}');` +
        `applyUi(Object.assign({}, state.ui, {lang:'${lang}', theme:'light', showType:'portrait'})); render(); 'x'`
    );
    await sleep(1200);
    for (const sc of SCENES) {
      try {
        await ev('(()=>{' + sc.setup + '})()'); // 包 IIFE，避免多次 evaluate 时 const 重复声明
      } catch (e) {
        console.log('  setup 失败(' + sc.name + '): ' + e.message);
      }
      await sleep(sc.wait);
      const file = path.join(OUT, lang, sc.name + '.jpg');
      const bytes = await shot(file);
      console.log(`  ${lang}/${sc.name}.jpg  ${(bytes / 1024).toFixed(0)} KB`);
    }
  }
  // 恢复用户的主题 / 显示类型 / 语言 / 排序（内存 + localStorage）
  await ev(
    `document.querySelectorAll('.modal').forEach(m=>m.hidden=true); afterModalClose();` +
      `localStorage.setItem('gal.lang','${origLang}'); applyUi(${JSON.stringify(orig)}); render(); 'x'`
  );
  console.log('done → ' + OUT);
})();
