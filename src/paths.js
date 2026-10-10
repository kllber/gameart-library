'use strict';

/**
 * paths.js —— 统一路径（支持打包后用环境变量把可写目录指到用户数据目录）
 *
 * 开发时：  ROOT = 工程根目录；DATA = <ROOT>/data；TMP = <ROOT>/.tmp
 * 打包后：  main.js 会设置 GAMEART_DATA_DIR / GAMEART_TMP_DIR 指向可写目录（app.getPath('userData')），
 *           因为打包后的程序目录是只读的 asar。
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.GAMEART_DATA_DIR || path.join(ROOT, 'data');
const TMP_DIR = process.env.GAMEART_TMP_DIR || path.join(ROOT, '.tmp');

module.exports = { ROOT, DATA_DIR, TMP_DIR };
