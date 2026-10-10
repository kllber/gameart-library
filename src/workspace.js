'use strict';

/**
 * workspace.js —— 工作库（.gameart）选择与"最近打开"
 *
 * - 记住最近打开的 .gameart 路径（data/recent.json，应用级，不属于某个库）
 * - 提供 Windows 原生"打开/保存文件"对话框（PowerShell + WinForms）
 */

const fs = require('fs');
const path = require('path');
const platform = require('./platform');
const { DATA_DIR } = require('./paths');

const RECENT_FILE = path.join(DATA_DIR, 'recent.json');

function loadRecent() {
  try {
    let txt = fs.readFileSync(RECENT_FILE, 'utf8');
    if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1); // 容错：去掉可能的 UTF-8 BOM
    const j = JSON.parse(txt);
    return Array.isArray(j.recent) ? j.recent : [];
  } catch (e) {
    return [];
  }
}

function saveRecent(list) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(RECENT_FILE, JSON.stringify({ recent: list }, null, 2));
  } catch (e) {
    /* ignore */
  }
}

function addRecent(p) {
  const list = loadRecent().filter((x) => x !== p);
  list.unshift(p);
  saveRecent(list.slice(0, 10));
}

/**
 * Windows 原生「打开文件」对话框 -> 路径或 null。
 * 实现已抽到 platform.js（Windows: PowerShell+WinForms 且置顶；Linux: zenity/kdialog）。
 */
function pickOpenFile() {
  return platform.pickOpenFile();
}

/** Windows 原生「保存文件」对话框 -> 路径或 null。实现见 platform.js。 */
function pickSaveFile() {
  return platform.pickSaveFile('我的游戏艺术库.gameart');
}

module.exports = { loadRecent, addRecent, pickOpenFile, pickSaveFile };
