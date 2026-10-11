'use strict';

/**
 * app.js —— 前端逻辑 v0.3
 * 流程：首次进空库 → 从 Steam 库添加 / 手动添加 → 库管理 → 同步到 Steam 库
 */

const $ = (id) => document.getElementById(id);

const TYPE_LABELS = {
  portrait: '竖向封面',
  grid: '横向封面',
  hero: '大背景',
  logo: 'Logo',
  icon: '图标',
};
const TYPE_ORDER = ['portrait', 'grid', 'hero', 'logo', 'icon'];

// 「关于」里的信息（可直接修改）
const ABOUT_AUTHOR = 'kllber';
const ABOUT_LICENSE = 'Apache-2.0';
const ABOUT_URL = 'https://github.com/kllber/gameart-library'; // 项目主页（关于页可点击跳转）

/* ---------------- 多语言（中/英）---------------- */
const I18N_EN = {
  // 欢迎页
  '游戏艺术库': 'GameArt Library',
  'GameArt Library · 选择或新建一个 .gameart 库文件': 'GameArt Library · Open or create a .gameart library file',
  '打开 .gameart 文件': 'Open .gameart file',
  '新建 .gameart 文件': 'New .gameart file',
  '最近打开': 'Recent',
  // 侧栏
  '添加游戏': 'Add games',
  '⟳ 从 Steam 库添加': '⟳ Add from Steam library',
  '＋ 手动添加': '＋ Add manually',
  '＋ 搜索添加': '＋ Search to add',
  '同步到 Steam': 'Sync to Steam',
  '⇩ 同步到 Steam 库': '⇩ Sync to Steam library',
  '分类': 'Categories',
  '回收站': 'Recycle bin',
  '🗑 打开回收站': '🗑 Open recycle bin',
  'Steam 账号': 'Steam accounts',
  '设置 / 绑定账号': 'Settings / Bind account',
  '⚙ 设置 / 绑定账号': '⚙ Settings / Bind account',
  '状态': 'Status',
  '库中游戏': 'Games',
  '艺术文件': 'Art files',
  '默认图同步': 'Default art sync',
  '游戏名同步': 'Name sync',
  '未绑定': 'Not bound',
  // 搜索
  '搜索库中游戏…': 'Search your games…',
  // 空库引导
  '① 先绑定你的 Steam Web API': '① First, bind your Steam Web API',
  '读取你 Steam 账号拥有的游戏，并读取本机 Steam 数据以写入自定义封面。API 可免费在 Steam 内申请，本软件可绑定多个账号的 API。': 'Reads the games your Steam account owns, and reads local Steam data to write custom art. The API key is free to apply within Steam; this app can bind multiple accounts.',
  '点击跳转设置相关页面': 'Go to settings',
  '② 再绑定你的 SteamGridDB API': '② Then bind your SteamGridDB API',
  '搜索并下载游戏封面 / 横向封面 / 大背景 / Logo / 图标等艺术作品。API 可免费在 SteamGridDB 官网申请，如没有其账号请先自行在官网登录。': 'Search and download SteamGridDB artwork (cover / grid / hero / logo / icon). The API key is free on the SteamGridDB website; if you have no account, sign up there first.',
  '③ 最后添加游戏到你的艺术库': '③ Finally, add games to your library',
  '从 Steam 库添加现有封面，或手动添加游戏后从 SteamGridDB 挑选封面。': 'Add games from your Steam library, or add them manually and pick covers from SteamGridDB.',
  // 类型
  '竖向封面': 'Portrait',
  '横向封面': 'Grid',
  '大背景': 'Hero',
  '图标': 'Icon',
  // 设置
  '设置': 'Settings',
  '语言': 'Language',
  '个性化': 'Appearance',
  '绑定与账号': 'Accounts & keys',
  '库文件': 'Library file',
  '关于': 'About',
  '界面语言': 'UI language',
  '语言选择会保存，界面文案将逐步补齐。': 'Your choice is saved.',
  '游戏名语言': 'Game-name language',
  '选「简体中文」会显示游戏的中文名（从 Steam 商店获取并缓存）；没有中文名的仍显示英文。': '“简体中文” shows Chinese game names (fetched from the Steam store and cached); games without one still show English.',
  '拉取中文名（从 Steam 商店）': 'Fetch Chinese names (from Steam store)',
  '仅在需要时手动执行，不会影响启动速度。': 'Run manually when needed; does not slow startup.',
  '主题': 'Theme',
  '深色': 'Dark',
  '浅色': 'Light',
  '英语': 'English',
  '强调色': 'Accent color',
  '游戏卡片大小': 'Card size',
  '小': 'Small',
  '中': 'Medium',
  '大': 'Large',
  'API Key': 'API Key',
  '保存': 'Save',
  '解绑': 'Unbind',
  '↗ 申请 SteamGridDB API Key': '↗ Get a SteamGridDB API Key',
  '登录 SteamGridDB（Steam 账号）→ Preferences → API → 填个域名 → Generate。': 'Sign in to SteamGridDB (via Steam) → Preferences → API → enter a domain → Generate.',
  '已绑定': 'Bound',
  '款': 'games',
  '拥有': 'owns',
  '未绑定 Steam 账号': 'No Steam account bound',
  '（绑定后才能从 Steam 库添加）': '(bind one first to add from the Steam library)',
  '尚未绑定任何账号': 'No account bound yet',
  '添加账号（本机账号可下拉选择）': 'Add account (local accounts in the dropdown)',
  '＋ 绑定并同步': '＋ Bind',
  '全部解绑': 'Unbind all',
  '↗ 申请 Steam Web API Key': '↗ Get a Steam Web API Key',
  '需在各账号 Steam「隐私设置 → 游戏详情」设为公开，否则同步不到游戏。': 'Set each account’s Steam “Privacy → Game details” to public, or its games cannot be read.',
  'Steam 安装路径': 'Steam install path',
  '用于读取本机 Steam 数据、写入自定义封面。': 'Used to read local Steam data and write custom art.',
  '当前库文件': 'Current library file',
  '库文件大小': 'Library size',
  '数据位置': 'Data location',
  '本软件的数据与缓存都放在一个独立的数据目录里，不会散落到系统其它位置。': 'App data and caches are stored in one dedicated folder; nothing is scattered elsewhere.',
  '切换 / 打开其他库文件': 'Switch / open another library file',
  '.gameart 文件关联': '.gameart file association',
  '关联到本软件': 'Associate with this app',
  '取消关联': 'Remove association',
  '双击 .gameart 文件即可用本软件打开该库（默认已自动关联；也可在此取消或重新关联）。': 'Double-click a .gameart file to open it with this app (associated automatically by default; remove or re-add it here).',
  '存储占用与清理': 'Storage & cleanup',
  '清理默认图缓存': 'Clear default-art cache',
  '清理备份': 'Clear backups',
  '清理临时文件': 'Clear temp files',
  '缓存/临时文件都在上面的数据目录内，可用按钮释放空间；清理缓存/备份不影响 .gameart 库里的艺术作品。': 'Cache/temp files live in the data folder above; use the buttons to free space. Clearing cache/backups does not affect artwork inside .gameart.',
  '名称': 'Name',
  '版本': 'Version',
  '作者': 'Author',
  '开源 / 许可': 'License',
  '素材来源': 'Artwork sources',
  '项目主页（GitHub）': 'Project home (GitHub)',
  '下载最新版（Releases）': 'Download latest (Releases)',
  '本软件本身不提供任何艺术作品，游戏的各种艺术素材图片均来自用户自己账号的 SteamGridDB API 与 Steam CDN。': 'This app provides no artwork itself; all art images come from the user’s own SteamGridDB API and the Steam CDN.',
  '运行环境': 'Runtime',
  '数据说明': 'Data notice',
  '仅管理你自己的艺术作品并写入 Steam 本地文件，不上传任何数据。': 'Only manages your own artwork and writes local Steam files; nothing is uploaded.',
  // 从 Steam 库添加
  '从 Steam 库添加': 'Add from Steam library',
  '全选': 'Select all',
  '筛选游戏名 / AppID…': 'Filter by name / AppID…',
  '导入选中': 'Import selected',
  '⟳ 刷新': '⟳ Refresh',
  '没有匹配的游戏': 'No matching games',
  '有封面': 'Has art',
  '无封面': 'No art',
  '张封面': 'covers',
  '已拥有': 'Owned',
  '已安装': 'Installed',
  '已在库中': 'In library',
  // 搜索添加
  '搜索添加': 'Search to add',
  '搜索游戏 → 从 SteamGridDB 挑选封面 → 加入你的库': 'Search a game → pick artwork from SteamGridDB → add to your library',
  '输入游戏名（英文更准），回车搜索…': 'Type a game name (English is more accurate), Enter to search…',
  '搜索': 'Search',
  '没有结果（试试英文名）': 'No results (try the English name)',
  // 详情
  '从库中移除': 'Remove from library',
  '移入回收站': 'Move to recycle bin',
  '同步到 Steam': 'Sync to Steam',
  '添加': 'Add',
  '从 SteamGridDB 添加': 'Add from SteamGridDB',
  '导入图片添加': 'Import an image',
  '当前': 'Current',
  // 手动添加
  '手动添加': 'Add manually',
  '自己新建游戏，并导入本地的艺术图': 'Create a game and import local artwork',
  '游戏名': 'Game name',
  '输入游戏名': 'Game name',
  'App ID（可选）': 'App ID (optional)',
  '注意：不输入 Steam 的 App ID，则无法把该游戏同步到 Steam 库。': 'Note: without a Steam App ID, this game cannot be synced to Steam.',
  '保存到库': 'Save to library',
  '取消': 'Cancel',
  // 裁切 / 方式
  '裁切': 'Crop',
  '缩放': 'Zoom',
  '重置': 'Reset',
  '添加封面': 'Add artwork',
  '从 SteamGridDB 搜索': 'Search SteamGridDB',
  // 同步到 Steam 库
  '同步到 Steam 库': 'Sync to Steam library',
  '确认同步': 'Confirm sync',
  '没有可同步的游戏。': 'No games to sync.',
  // 分类
  '全部游戏': 'All games',
  '新建分类': 'New category',
  '批量添加游戏': 'Add games',
  '重命名': 'Rename',
  '更改分组': 'Change groups',
  '编辑 Steam App ID': 'Edit Steam App ID',
  '删除（移入回收站）': 'Delete (to recycle bin)',
  // 回收站
  '打开回收站': 'Open recycle bin',
  '恢复': 'Restore',
  '彻底删除': 'Delete forever',
  '回收站是空的。': 'Recycle bin is empty.',
  // 动态标题 / 子标题
  '批量添加': 'Add games',
  '目标': 'Target',
  '拖动移动，滑块缩放': 'Drag to move, slider to zoom',
  '你拥有': 'You own',
  '款游戏（勾选后导入你的库）。': ' games (check any to import into your library).',
  '当前：': 'Current: ',
  ' · 点任意一张即可加入你的库': ' · click any to add to your library',
  '勾选要同步的游戏（默认全选）；只同步你「当前选用」的图，覆盖前自动备份。共': 'Check games to sync (all by default); only your “currently used” art is synced, with a backup before overwrite. ',
  '款可同步。': ' syncable.',
  '勾选要放进该分类的游戏（可批量）': 'Check the games to add to this category (batch)',
  '可多选（一个游戏可属于多个分组）': 'Multi-select (a game can belong to several groups)',
  '删除的游戏会先放到这里；可「恢复」或「彻底删除」。': 'Deleted games land here; you can Restore or Delete forever.',
  '搜索中…': 'Searching…',
  '没有结果（试试英文名）': 'No results (try the English name)',
  '选择 →': 'Select →',
  // 图标 + 文案
  '⊞ 更改分组': '⊞ Change groups',
  '✎ 编辑 Steam App ID': '✎ Edit Steam App ID',
  '🗑 删除（移入回收站）': '🗑 Delete (to recycle bin)',
  '✎ 重命名': '✎ Rename',
  '⊞ 批量添加游戏': '⊞ Add games',
  // SGDB 过滤器 / 勾选项
  '静态': 'Static',
  '动图': 'Animated',
  '只看幽默': 'Humor only',
  '只看成人': 'Adult only',
  '只看癫痫': 'Epilepsy only',
  '勾选后只显示「幽默」类': 'Show only “humor” images',
  '勾选后只显示「成人」类': 'Show only “adult” images',
  '勾选后只显示「癫痫」类': 'Show only “epilepsy” images',
  '「只看幽默/只看成人」= 只显示该类图片；有些游戏没有该类，勾选后会为空。动图同理。': '“Humor only / Adult only” = show only that image class; some games have none, so the list may be empty. Same for animated.',
  // 详情 / 艺术格
  '⇩ 同步到 Steam': '⇩ Sync to Steam',
  '本地': 'Local',
  '当前': 'Current',
  '从库中删除': 'Remove from library',
  '非 Steam': 'Non-Steam',
  '张': 'images',
  '检测默认图…': 'Detecting default art…',
  '默认图获取失败（Steam 与 SteamGridDB 均无）': 'Failed to get default art (none on Steam or SteamGridDB)',
  '点图加入库': 'Click to add to library',
  '默认': 'Default',
  'SGDB兜底': 'SGDB fallback',
  '选择图片': 'Choose image',
  // 设置：绑定与账号
  '用途：搜索并下载游戏封面 / 横向封面 / 大背景 / Logo / 图标等艺术作品。需要你自己的 SteamGridDB API Key（免费申请）。': 'Use: search and download SteamGridDB artwork — covers / grids / heroes / logos / icons. Requires your own SteamGridDB API Key (free).',
  '用途：读取你拥有的游戏（用于「从 Steam 库添加」），并读取本机 Steam 数据以写入自定义封面。需要 Steam Web API Key，且账号「游戏详情」设为公开。': 'Use: read the games you own (for “Add from Steam library”) and local Steam data to write custom art. Requires a Steam Web API Key and “Game details” set to public.',
  '粘贴 SteamGridDB API Key': 'Paste your SteamGridDB API Key',
  'Steam 账号（Web API）': 'Steam accounts (Web API)',
  'SteamID64 或 主页链接': 'SteamID64 or profile link',
  'Steam Web API Key（一个 Key 可查多个公开账号）': 'Steam Web API Key (one key reads several public accounts)',
  '↗ 申请 SteamGridDB API Key': '↗ Get a SteamGridDB API Key',
  '↗ 申请 Steam Web API Key': '↗ Get a Steam Web API Key',
  '已保存：': 'Saved: ',
  '（留空则不修改）': ' (leave blank to keep)',
  '证书失败时回退（公司代理 / 自签证书环境）': 'Fallback on certificate failure (corporate proxy / self-signed)',
  '正在下载，请稍等…': 'Downloading, please wait…',
  '正在下载，请稍等…（队列 {0}）': 'Downloading, please wait… (queue {0})',
  '已加入库（{0} 张）': 'Added to library ({0})',
  '已加入': 'Added',
  '这张图正在添加中…': 'This image is already being added…',
  '这张图已加入库': 'This image is already in your library',
  '预览加载失败': 'Failed to load preview',
  '证书校验失败（公司代理/自签证书）。可在 设置→SteamGridDB API 勾选「证书失败时回退」。': 'Certificate verification failed (corporate proxy / self-signed). Enable “Fallback on certificate failure” in Settings → SteamGridDB API.',
  '网络连接失败或超时，请检查网络 / 代理后重试。': 'Network connection failed or timed out. Check your network / proxy and retry.',
  '有些公司网络或抓包代理用自己的证书，会让下载图片报「self signed certificate」。勾选后遇到该情况会回退为不校验证书（仅用于抓取 SteamGridDB 的公开图片，不涉及账号密码）。默认已勾选。': 'Some corporate networks / capture proxies use their own certificate, making image downloads fail with “self signed certificate”. When checked, that case falls back to skipping certificate verification (only for fetching public SteamGridDB artwork; no credentials involved). Checked by default.',
  '个账号': 'accounts',
  '个账号，共': 'accounts, ',
  '款游戏': 'games',
  '检测到本机账号：': 'Local account detected: ',
  '（已自动填入 SteamID），只需粘贴 API Key': ' (SteamID filled automatically) — just paste the API Key',
  '（当前系统不支持）': ' (not supported on this system)',
  '已关联 ✔': 'Associated ✔',
  '未关联': 'Not associated',
  '默认图缓存': 'Default-art cache',
  '备份': 'Backups',
  '临时': 'Temp',
  '（数据目录：': ' (data dir: ',
  // 侧栏 / 分类 / 回收站 / 卡片
  '＋ 新建分类': '＋ New category',
  '编辑': 'Edit',
  '删除': 'Delete',
  '还没有分组，请先在左侧「新建分类」。': 'No groups yet — create one via “New category” on the left.',
  '非 Steam · ': 'Non-Steam · ',
  '非 Steam 游戏，无法同步到 Steam 库': 'Non-Steam game — cannot sync to the Steam library',
  'Steam App ID 无效（Steam 中无此游戏），无法同步到 Steam 库': 'Invalid Steam App ID (not found in Steam) — cannot sync to the Steam library',
  'Steam App ID 无效，无法同步到 Steam 库': 'Invalid Steam App ID — cannot sync to the Steam library',
  // 选图器 / 画廊
  '加载中…': 'Loading…',
  '未知 SGDB 游戏 ID': 'Unknown SteamGridDB game ID',
  '幽默': 'Humor',
  '成人': 'Adult',
  '癫痫': 'Epilepsy',
  '显示': 'Showing',
  '（还在加载…）': ' (still loading…)',
  ' / 共 ': ' / ',
  '当前筛选下没有资源。可更换「类型 / 标签」或换一款游戏（如 Garry\'s Mod／TF2 有幽默、巫师3／赛博朋克2077 有成人）。': 'No artwork under the current filters. Try other type/tags or another game (e.g. Garry’s Mod / TF2 have humor, The Witcher 3 / Cyberpunk 2077 have adult).',
  // 同步 / 进度
  'Steam 正在运行：可以直接同步（与 SGDBoop 相同）。封面若未立即刷新，重启一次 Steam 即可看到；图标（icon）必须重启 Steam 才会生效。': 'Steam is running: you can sync directly (same as SGDBoop). If covers do not refresh immediately, restart Steam once; icons take effect only after a Steam restart.',
  '完成': 'Done',
  '进行中': 'In progress',
  '（已获取': ' (fetched',
  '完成：共': 'Done: ',
  '款，已获取中文名': 'games, Chinese names fetched',
  '未检测到 Steam': 'Steam not detected',
  '拉取中…': 'Fetching…',
  // 通用提示 / 按钮
  '确定': 'OK',
  '取消': 'Cancel',
  '输入': 'Input',
  '请确认': 'Confirm',
  // 危险操作弹窗
  '删除分类': 'Delete category',
  '分类名称': 'Category name',
  '如 RPG / FPS / MOBA': 'e.g. RPG / FPS / MOBA',
  '重命名分类': 'Rename category',
  '新名称': 'New name',
  '彻底删除': 'Delete forever',
  '移入回收站': 'Move to recycle bin',
  '解绑全部账号': 'Unbind all accounts',
  '解绑 SteamGridDB': 'Unbind SteamGridDB',
  '编辑 Steam App ID': 'Edit Steam App ID',
  '例如 2358720': 'e.g. 2358720',
  // 失败 / 状态
  '打开失败': 'Open failed',
  '新建失败': 'Create failed',
  '恢复失败': 'Restore failed',
  '修改失败': 'Update failed',
  '添加失败': 'Add failed',
  '保存失败': 'Save failed',
  '下载失败': 'Download failed',
  '加入失败': 'Failed to add',
  '刷新失败': 'Refresh failed',
  '同步失败': 'Sync failed',
  '绑定失败': 'Bind failed',
  '关联失败': 'Association failed',
  '取消失败': 'Operation failed',
  '创建桌面快捷方式': 'Create desktop shortcut',
  '默认图补全': 'Default art fill',
  '补全默认图（后台）': 'Fill default art (background)',
  '为库里「还没有图」的游戏补上 Steam 默认图；中途关掉软件也没关系，下次打开该库会自动继续。':
    'Fetches Steam default artwork for games that have none. You can quit the app anytime — it resumes automatically next time you open this library.',
  '已开始补全默认图（后台进行，可随时关闭软件）': 'Filling default artwork in the background — you can close the app anytime.',
  '已创建桌面快捷方式：': 'Desktop shortcut created: ',
  '创建失败': 'Failed to create',
  '清理失败': 'Cleanup failed',
  '请输入游戏名': 'Enter a game name',
  '请输入 API Key': 'Enter your API key',
  '请填写 Steam Web API Key': 'Enter your Steam Web API key',
  '请先勾选要导入的游戏': 'Select games to import first',
  '请先勾选要同步的游戏': 'Select games to sync first',
  '请先绑定 Steam 账号，才能读取你拥有的游戏': 'Bind a Steam account first to read the games you own',
  '「静态 / 动图」至少选择一个': 'Select at least one of Static / Animated',
  '未设置 SteamGridDB API Key': 'SteamGridDB API Key not set',
  '，请到「设置」里填写。': ' — add it in Settings.',
  // 成功提示
  '完成：': 'Done: ',
  '款游戏已同步': 'games synced',
  '（若未刷新，请重启 Steam）': ' (restart Steam if it does not refresh)',
  '已刷新拥有列表：共': 'Owned list refreshed:',
  '已导入': 'Imported',
  '款游戏到库': 'games into your library',
  '已添加「': 'Added “',
  '」，导入': '”, imported',
  '张图': 'images',
  '已恢复「': 'Restored “',
  '已彻底删除': 'Deleted forever',
  '已移入回收站': 'Moved to recycle bin',
  '分组已保存': 'Groups saved',
  '已保存分类': 'Category saved',
  '已解绑该账号': 'Account unbound',
  '已全部解绑': 'All accounts unbound',
  '已保存 SteamGridDB Key': 'SteamGridDB key saved',
  '已解绑 SteamGridDB': 'SteamGridDB key removed',
  'App ID 已更新': 'App ID updated',
  '已加入库': 'Added to library',
  '已选用': 'Selected',
  '已把默认图加入库': 'Default art added to library',
  '已关联 .gameart 文件': '.gameart association set',
  '已取消关联': 'Association removed',
  '已清理': 'Cleared',
  '清理默认图缓存': 'Clear default-art cache',
  '清理备份': 'Clear backups',
  '清理临时文件': 'Clear temp files',
  '临时文件': 'temp files',
  // 绑定 / 账号
  '绑定中…': 'Binding…',
  '失败：': 'Failed: ',
  '绑定成功：': 'Bound: ',
  '该账号': 'this account',
  '款，合计': 'games, total',
  '绑定成功（拥有': 'Bound (owns',
  '款）——请到「从 Steam 库添加」手动选择要导入的游戏': 'games) — go to “Add from Steam library” to pick games to import manually',
  '已全部解绑，': 'All accounts unbound. ',
  // 排序 / 分类管理
  '排序': 'Sort',
  '添加时间': 'Date added',
  '名称': 'Name',
  '自定义': 'Custom',
  '按住左键拖动封面排序': 'Drag covers to sort',
  '自定义排序：按住鼠标左键拖动游戏封面即可排序（类似手机相册）。': 'Custom order: hold the left mouse button and drag covers to reorder (like the Photos app).',
  '自定义排序：按住鼠标左键拖动游戏封面即可排序（类似手机相册）。按住 Ctrl 点击可多选，再一起拖动。': 'Custom order: hold the left mouse button and drag covers to reorder (like the Photos app). Ctrl+click to select several, then drag them together.',
  '已选 {0} 个，拖动可一起移动': '{0} selected — drag to move them together',
  '搜索状态下不能拖拽排序（清空搜索即可）': 'Dragging is disabled while searching (clear the search to enable).',
  '搜索状态下不能使用自定义排序，请先清空搜索。': 'Custom sort is unavailable while searching — clear the search first.',
  '未加入任何分类': 'Not in any category',
  // 动图封面
  '动图封面': 'Animated covers',
  '自动播放（更生动）': 'Auto-play (livelier)',
  '悬停才播放（更省性能）': 'Play on hover (lighter)',
  '补全动图预览': 'Fetch animated previews',
  '为库里已有的动图补齐预览文件（需要 SteamGridDB API Key），之后主页即可流畅播放。': 'Add preview files for existing animated art (needs a SteamGridDB API Key); the home page can then play them smoothly.',
  '「自动播放」会让主页的动图封面一直循环播放（只播屏幕内的、并限制同时播放数量）。动画很多仍觉得卡时，可切「悬停才播放」。': '“Auto-play” keeps home-page animated covers looping (only on-screen ones, with a concurrency limit). If it still feels heavy, switch to “Play on hover”.',
  '补全中…': 'Fetching…',
  '没有需要补全的动图。': 'No animated art needs previews.',
  // 模板（{0}{1} 占位）
  '已恢复「{0}」': 'Restored “{0}”',
  '恢复失败：库中已存在重复游戏 {0}。请先在库中删除重复的那个，再回来恢复。': 'Restore failed: the library already has duplicate game {0}. Delete the duplicate first, then retry.',
  '彻底删除「{0}」？此操作不可恢复。': 'Delete “{0}” forever? This cannot be undone.',
  '把「{0}」移入回收站？（可在回收站恢复；不会影响 Steam）': 'Move “{0}” to the recycle bin? (restorable; Steam is not affected)',
  '删除分类「{0}」？不会删除里面的游戏；游戏仍会显示在“全部游戏”里。': 'Delete category “{0}”? Games inside are not deleted; they still appear under “All games”.',
  '当前：{0}（必须为数字；与库中其它游戏重复会被拒绝）': 'Current: {0} (must be a number; duplicates are rejected)',
  '已导入 {0} 款游戏到库': 'Imported {0} games into your library',
  '已添加「{0}」，导入 {1} 张图': 'Added “{0}”, imported {1} images',
  '已刷新拥有列表：共 {0} 款': 'Owned list refreshed: {0} games',
  '完成：{0}/{1} 款游戏已同步{2}': 'Done: {0}/{1} games synced{2}',
  '绑定成功：{0} · 该账号 {1} 款，合计 {2} 款': 'Bound: {0} · this account {1} games, total {2}',
  '绑定成功（拥有 {0} 款）——请到「从 Steam 库添加」手动选择要导入的游戏': 'Bound (owns {0} games) — go to “Add from Steam library” to pick games to import manually',
  '失败：{0}': 'Failed: {0}',
  '解绑全部 Steam 账号？（不影响 Steam 本身）': 'Unbind all Steam accounts? (Steam itself is unaffected)',
  '确定解绑 SteamGridDB API Key？': 'Remove the SteamGridDB API Key?',
  '选择一个游戏，其封面会加到「{0}」的「{1}」里。': 'Pick a game; its artwork will be added to the “{1}” of “{0}”.',
  '进行中 {0}/{1}（已获取 {2}）': 'In progress {0}/{1} (fetched {2})',
  '完成：共 {0} 款，已获取中文名 {1} 个': 'Done: {0} games, {1} Chinese names fetched',
  '已清理 {0}': 'Cleared {0}',
  '补全中 {0}/{1}…': 'Fetching {0}/{1}…',
  '完成：共 {0} 张，成功 {1} 张（其余未能匹配到预览）': 'Done: {0} total, {1} succeeded (the rest could not be matched to a preview)',
  '同步中 {0}/{1}…': 'Syncing {0}/{1}…',
  '正在同步：已完成 {0}/{1}…': 'Syncing: {0}/{1} done…',
};

const I18N_SEL =
  'button, a.link, option, h1, h2, h3, .side-title, .hint, .stat span, .check, .check-label, .btn-label, .snav, .snav-label, .settings-nav-title, .field > label, .form-row > label, .mrow-label, .welcome-recent-title, .notice, .b, .tile-tag, .tile-current, .tile-hint, .art-none, .add-label, .badge, .sort-label, .sort-hint, .welcome-card .sub, .ob-step p, .type-label, .apply-types .tag, .modal-head p, .h3-label';

/** 生成期翻译（用于 JS 里拼出来的文案） */
function T(s) {
  const en = ((state.ui && state.ui.lang) || 'zh') === 'en';
  return en ? I18N_EN[s] || s : s;
}

/** 模板翻译：词典值里用 {0}{1} 占位，便于处理"含动态值"的整句 */
function TP(tpl, ...args) {
  const en = ((state.ui && state.ui.lang) || 'zh') === 'en';
  const s = en ? I18N_EN[tpl] || tpl : tpl;
  return s.replace(/\{(\d+)\}/g, (_, i) => (args[Number(i)] != null ? String(args[Number(i)]) : ''));
}

/** 切换语言后：重渲染"用 T() 生成文案"的动态视图，使语言立即生效 */
function refreshDynamicI18n() {
  applyI18n();
  try {
    syncSortUi(); // 排序下拉的显示文案也要跟着语言变
    render();
  } catch (e) {
    /* ignore */
  }
  const isOpen = (id) => {
    const el = document.getElementById(id);
    return el && !el.hidden;
  };
  try {
    if (isOpen('settingsModal')) openSettings(state.settingsTab || 'general');
    if (isOpen('detailModal') && state.detail) openDetail(state.detail.appid);
    if (isOpen('syncModal')) renderSyncList();
    if (isOpen('applyModal')) renderApplyList();
    if (isOpen('recycleModal')) openRecycle();
    if (isOpen('artModal')) renderArtTabs();
    if (isOpen('manualModal')) buildManualRows();
  } catch (e) {
    /* ignore */
  }
  applyI18n();
}

/** 按当前语言翻译界面（只处理"纯文本"的 UI 元素，避免误伤游戏名等用户数据） */
function applyI18n() {
  const en = ((state.ui && state.ui.lang) || 'zh') === 'en';
  document.documentElement.lang = en ? 'en' : 'zh-CN';
  if (!en) {
    // 中文模式：只还原"曾被翻译过"的元素（避免每次 render 全量扫描，打字不卡）
    document.querySelectorAll('[data-zh]').forEach((el) => {
      const zh = el.dataset.zh;
      // 只有当前文本仍是我们翻译出来的英文时才还原（避免清掉动态内容）
      if (el.textContent === (I18N_EN[zh.trim()] || zh)) el.textContent = zh;
      delete el.dataset.zh;
    });
    document.querySelectorAll('[data-zh-ph]').forEach((el) => {
      el.placeholder = el.dataset.zhPh;
      delete el.dataset.zhPh;
    });
    document.querySelectorAll('[data-zh-title]').forEach((el) => {
      el.title = el.dataset.zhTitle;
      delete el.dataset.zhTitle;
    });
    const wl0 = document.getElementById('wsLang');
    if (wl0) wl0.textContent = 'English';
    return;
  }
  document.querySelectorAll(I18N_SEL).forEach((el) => {
    if (el.children.length) return; // 只翻译叶子元素
    if (el.closest('#grid')) return; // 主页卡片在生成期已翻译（避免上千次写入）
    const key = el.textContent.trim();
    if (I18N_EN[key]) {
      el.dataset.zh = el.textContent;
      el.textContent = I18N_EN[key];
    }
  });
  document.querySelectorAll('[placeholder]').forEach((el) => {
    const key = el.placeholder;
    if (I18N_EN[key]) {
      el.dataset.zhPh = el.placeholder;
      el.placeholder = I18N_EN[key];
    }
  });
  document.querySelectorAll('[title]').forEach((el) => {
    if (el.closest && el.closest('#grid')) return;
    const key = el.title;
    if (I18N_EN[key]) {
      el.dataset.zhTitle = el.title;
      el.title = I18N_EN[key];
    }
  });
  const wl = document.getElementById('wsLang');
  if (wl) wl.textContent = '中文';
}

const state = {
  games: [],
  catFilter: 'all',
  categories: [],
  search: '',
  ui: {},
  sync: { games: [], selected: new Set() },
  art: { appid: null, name: null, sgdbGameId: null, type: 'portrait', mode: 'add', loading: false, cache: {}, filters: { static: true, animated: true, humor: false, nsfw: false, epilepsy: false } },
  addTarget: null,
  addType: null,
  manual: {},
  choice: null,
  crop: null,
  detail: null,
  sortMode: 'added', // added | name | custom
  customOrders: {}, // 各视图的自定义顺序：{ all:[...], "<catId>":[...] }
  catMemberOrder: {}, // 各分类成员的"加入顺序"（默认顺序）
  selectedCards: new Set(), // 自定义排序下 Ctrl 多选的卡片
};

async function api(path, opts) {
  const r = await fetch(path, opts);
  return r.json();
}

function post(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

/* ------------- 应用内弹窗（替代 Electron 不支持的 prompt/confirm） ------------- */

/** 文本输入弹窗 -> Promise<string|null>。opts: { title, label, sub, value, placeholder } */
function uiPrompt(opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal ui-dialog';
    overlay.style.zIndex = '500';
    const card = document.createElement('div');
    card.className = 'modal-card narrow';
    card.innerHTML = `
      <div class="modal-head"><h2></h2><p></p></div>
      <div class="field"><label></label><input type="text" /></div>
      <div class="detail-actions" style="margin-top:16px">
        <button class="btn primary" data-act="ok">${T('确定')}</button>
        <button class="btn ghost" data-act="cancel">${T('取消')}</button>
      </div>`;
    card.querySelector('h2').textContent = opts.title || T('输入');
    const subEl = card.querySelector('.modal-head p');
    if (opts.sub) subEl.textContent = opts.sub;
    else subEl.remove();
    const labelEl = card.querySelector('label');
    if (opts.label) labelEl.textContent = opts.label;
    else labelEl.remove();
    const input = card.querySelector('input');
    input.value = opts.value || '';
    input.placeholder = opts.placeholder || '';
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const done = (val) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        done(input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(null);
      }
    };
    card.querySelector('[data-act="ok"]').addEventListener('click', () => done(input.value));
    card.querySelector('[data-act="cancel"]').addEventListener('click', () => done(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(null);
    });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

/** 确认弹窗 -> Promise<boolean>。opts: string | { title, message, okText, danger } */
function uiConfirm(opts) {
  const o = typeof opts === 'string' ? { message: opts } : opts || {};
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal ui-dialog';
    overlay.style.zIndex = '500';
    const card = document.createElement('div');
    card.className = 'modal-card narrow';
    card.innerHTML = `
      <div class="modal-head"><h2></h2><p></p></div>
      <div class="detail-actions" style="margin-top:16px">
        <button class="btn ${o.danger ? 'danger' : 'primary'}" data-act="ok"></button>
        <button class="btn ghost" data-act="cancel">${T('取消')}</button>
      </div>`;
    card.querySelector('h2').textContent = o.title || T('请确认');
    card.querySelector('p').textContent = o.message || '';
    card.querySelector('[data-act="ok"]').textContent = o.okText || T('确定');
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const done = (v) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        done(true);
      }
    };
    card.querySelector('[data-act="ok"]').addEventListener('click', () => done(true));
    card.querySelector('[data-act="cancel"]').addEventListener('click', () => done(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(false);
    });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => card.querySelector('[data-act="ok"]').focus(), 0);
  });
}

function assetUrl(appid, file) {
  return `/asset?appid=${encodeURIComponent(appid)}&file=${encodeURIComponent(file)}`;
}
function previewUrl(appid, file) {
  return `/preview?appid=${encodeURIComponent(appid)}&file=${encodeURIComponent(file)}`;
}
function defaultUrl(appid, type) {
  return `/api/defaultart?appid=${encodeURIComponent(appid)}&type=${encodeURIComponent(type)}`;
}
function isSteamAppid(appid) {
  return /^\d+$/.test(String(appid));
}
function imgUrl(item) {
  return `/img?src=${encodeURIComponent(item.src)}&file=${encodeURIComponent(item.file)}`;
}

/* ---------------- 库渲染 ---------------- */

function displayName(g) {
  const lang = state.ui && state.ui.gameLang;
  if (lang === 'en') return g.name || 'AppID ' + g.appid;
  return g.name_zh || g.name || 'AppID ' + g.appid;
}
function altName(g) {
  const lang = state.ui && state.ui.gameLang;
  if (lang === 'en') return g.name_zh && g.name_zh !== g.name ? g.name_zh : '';
  return g.name && g.name !== g.name_zh ? g.name : '';
}

function pickArt(g, type) {  const arr = g.art[type];
  if (!arr || !arr.length) return null;
  const sel = g.hasSelected[type];
  return arr.find((r) => r.id === sel) || arr[0];
}

/** 封面候选顺序：自定义竖版 → Steam默认竖版 → 自定义横版 → 自定义大背景 → Steam默认横版 → 自定义Logo */
function coverCandidates(g) {
  const out = [];
  const addCustom = (type, tall) => {
    const row = pickArt(g, type);
    if (row) {
      out.push({
        url: assetUrl(g.appid, row.file),
        tall,
        kind: 'custom',
        animated: row.mime === 'image/webp',
        preview: row.has_preview ? previewUrl(g.appid, row.file) : null,
      });
    }
  };
  const addDefault = (type, tall) => {
    if (isSteamAppid(g.appid)) out.push({ url: defaultUrl(g.appid, type), tall, kind: 'default' });
  };
  addCustom('portrait', true);
  addDefault('portrait', true);
  addCustom('grid', false);
  addCustom('hero', false);
  addDefault('grid', false);
  addCustom('logo', false);
  return out;
}

function coverOf(g) {
  const c = coverCandidates(g);
  return c.length ? c[0] : null;
}

function placeholderThumb(g) {
  const d = document.createElement('div');
  d.className = 'noart placeholder';
  d.textContent = String(g.name || g.appid).trim().slice(0, 1).toUpperCase();
  return d;
}

/**
 * 动图封面降耗：默认只显示"静态首帧"（把首帧画到 canvas 作为 poster），
 * 鼠标悬停才播放原始动图，离开恢复静态帧。避免主页上大量动图同时解码/播放。
 */
function freezeAnimatedCover(img, url) {
  const onLoad = () => {
    if (img.dataset.frozen) return;
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 1;
      c.height = img.naturalHeight || 1;
      c.getContext('2d').drawImage(img, 0, 0);
      const poster = c.toDataURL('image/png');
      img.dataset.frozen = '1';
      img.dataset.poster = poster;
      img.dataset.anim = url;
      img.src = poster; // 换成静态首帧 → 停止播放，省 CPU
      const thumb = img.closest('.thumb');
      if (thumb) {
        const bg = thumb.querySelector('.thumb-bg');
        if (bg) bg.style.backgroundImage = 'url("' + poster + '")';
      }
      img.addEventListener('mouseenter', () => {
        if (img.dataset.anim) img.src = img.dataset.anim;
      });
      img.addEventListener('mouseleave', () => {
        if (img.dataset.poster) img.src = img.dataset.poster;
      });
    } catch (e) {
      /* 跨域/失败：保持原始动图显示 */
    }
  };
  if (img.complete && img.naturalWidth) onLoad();
  else img.addEventListener('load', onLoad, { once: true });
}

/* ---------------- 动图封面播放管理（只播"屏幕内"的，且限制同时播放数量） ---------------- */
const COVER_ANIM = { items: [], max: 6, scheduled: false };
let _coverIO = null;
let detailCoverOrder = 0;
function getCoverIO() {
  if (_coverIO) return _coverIO;
  _coverIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const it = e.target.__coverAnim;
        if (it) it.visible = e.isIntersecting;
      }
      scheduleCoverAnim();
    },
    { rootMargin: '150px' }
  );
  return _coverIO;
}
function scheduleCoverAnim() {
  if (COVER_ANIM.scheduled) return;
  COVER_ANIM.scheduled = true;
  requestAnimationFrame(() => {
    COVER_ANIM.scheduled = false;
    applyCoverAnim();
  });
}
function applyCoverAnim() {
  const live = COVER_ANIM.items.filter((i) => i.node.isConnected);
  COVER_ANIM.items = live;
  live.sort((a, b) => a.order - b.order);
  const hover = ((state.ui && state.ui.animCovers) || 'auto') === 'hover';
  if (hover) {
    live.forEach((it) => it.pause());
    return;
  }
  const vis = live.filter((it) => it.visible);
  const playSet = new Set(vis.slice(0, COVER_ANIM.max)); // 只播最靠前的 N 个可见项
  live.forEach((it) => (playSet.has(it) ? it.play() : it.pause()));
}
function registerCoverAnim(node, order, play, pause) {
  const it = {
    node,
    order,
    visible: false,
    playing: false,
    play() {
      if (!this.playing) {
        this.playing = true;
        play();
      }
    },
    pause() {
      if (this.playing) {
        this.playing = false;
        pause();
      }
    },
  };
  node.__coverAnim = it;
  COVER_ANIM.items.push(it);
  getCoverIO().observe(node);
  return it;
}
function clearCoverAnims() {
  const io = getCoverIO();
  for (const it of COVER_ANIM.items) {
    try {
      io.unobserve(it.node);
    } catch (e) {
      /* ignore */
    }
  }
  COVER_ANIM.items = [];
}

/** 生成"虚化填充背景"的开关函数（竖向不够时用横图铺底） */
function ensureFillFor(thumb) {
  return (wide) => {
    let bg = thumb.querySelector('.thumb-bg');
    if (wide && !bg) {
      bg = document.createElement('div');
      bg.className = 'thumb-bg';
      thumb.insertBefore(bg, thumb.firstChild);
      thumb.classList.add('fill');
    } else if (!wide && bg) {
      bg.remove();
      thumb.classList.remove('fill');
    }
  };
}

/** 主页封面（非视频）：沿用原来的"逐级回退 + 动图静态首帧"逻辑 */
function buildCoverImg(thumb, cands, g) {
  const ensureFill = ensureFillFor(thumb);
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = '';
  let idx = 0;
  const applySrc = (c) => {
    ensureFill(!c.tall);
    img.src = c.url;
    const bg = thumb.querySelector('.thumb-bg');
    if (bg) bg.style.backgroundImage = 'url("' + c.url.replace(/"/g, '\\"') + '")';
  };
  img.onerror = () => {
    idx++;
    if (idx < cands.length) applySrc(cands[idx]);
    else {
      const bg = thumb.querySelector('.thumb-bg');
      if (bg) bg.remove();
      img.replaceWith(placeholderThumb(g));
    }
  };
  applySrc(cands[0]);
  if (cands[0].animated && cands[0].url.startsWith('/')) freezeAnimatedCover(img, cands[0].url);
  thumb.appendChild(img);
}

/**
 * 挂载一个动图封面：有 .webm 预览 → <video>（一直播/悬停播）；否则退回静态首帧的 <img>。
 * 返回生成的节点。
 */
function mountAnimatedCover(thumb, { posterUrl, videoUrl, imgUrl, order }) {
  const hover = ((state.ui && state.ui.animCovers) || 'auto') === 'hover';
  if (videoUrl) {
    const v = document.createElement('video');
    v.className = 'cover-video';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    if (posterUrl) v.poster = posterUrl;
    v.src = videoUrl;
    const play = () => {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    };
    const pause = () => {
      try {
        v.pause();
      } catch (e) {
        /* ignore */
      }
    };
    if (hover) {
      v.addEventListener('mouseenter', play);
      v.addEventListener('mouseleave', pause);
    } else {
      registerCoverAnim(v, order || 0, play, pause);
    }
    return v;
  }
  return null;
}

/** 按当前排序模式排序（返回新数组；不修改原数组） */
function sortGames(list) {
  const mode = state.sortMode || 'added';
  const arr = list.slice();
  if (mode === 'name') {
    // 一律按"英文名"排序（更准确、稳定）；数字开头排在所有字母开头之后
    const key = (g) => String(g.name || g.name_zh || g.appid || '').trim();
    const rank = (s) => {
      const c = s.charAt(0);
      if (/[A-Za-z]/.test(c)) return 0; // 字母开头
      if (/[0-9]/.test(c)) return 1; // 数字开头 → 排最后
      return 2; // 其它符号
    };
    arr.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      const ra = rank(ka);
      const rb = rank(kb);
      if (ra !== rb) return ra - rb;
      return ka.localeCompare(kb, 'en', { numeric: true, sensitivity: 'base' });
    });
  } else if (mode === 'custom') {
    // 每个视图（全部 / 某分类）各有自己的自定义顺序，互不干扰
    const order = effectiveOrderArray();
    const idx = new Map();
    order.forEach((a, i) => idx.set(String(a), i));
    const n = order.length;
    arr.sort((a, b) => {
      const ia = idx.has(String(a.appid)) ? idx.get(String(a.appid)) : n;
      const ib = idx.has(String(b.appid)) ? idx.get(String(b.appid)) : n;
      if (ia !== ib) return ia - ib;
      return (a.added_at || 0) - (b.added_at || 0); // 新加入的排在同为末尾者按添加时间
    });
  }
  // 'added'：state.games 本身已按 added_at 升序，保持原顺序
  return arr;
}

/** 合并：把"当前可见顺序"应用到全局自定义顺序的对应位置（不改变其它游戏的相对位置） */
function mergeCustomOrder(globalOrder, visible) {
  const gset = new Set(globalOrder);
  const G = globalOrder.concat(visible.filter((a) => !gset.has(a)));
  const visSet = new Set(visible);
  const slots = [];
  G.forEach((a, i) => {
    if (visSet.has(a)) slots.push(i);
  });
  const out = G.slice();
  slots.forEach((pos, k) => {
    out[pos] = visible[k];
  });
  return out;
}

/** 当前视图的排序 key：全部='all'，分类=分类 id */
function currentOrderKey() {
  return state.catFilter && state.catFilter !== 'all' ? String(state.catFilter) : 'all';
}
/** 当前视图的"有效顺序"：用户存过的 → 用它；否则分类用"加入顺序"，全部用自然顺序（[]） */
function effectiveOrderArray() {
  const key = currentOrderKey();
  const saved = state.customOrders && state.customOrders[key];
  if (Array.isArray(saved) && saved.length) return saved.map(String);
  if (key !== 'all' && state.catMemberOrder && state.catMemberOrder[key]) return state.catMemberOrder[key].map(String);
  return [];
}

/** 保存当前视图的自定义顺序（合并进该视图的顺序后落库） */
async function saveCustomOrder(visibleOrder) {
  const key = currentOrderKey();
  const merged = mergeCustomOrder(effectiveOrderArray(), visibleOrder);
  state.customOrders[key] = merged;
  await post('/api/library/set-order', { key, appids: merged });
}

/* ---------------- 自定义排序：指针拖拽（空隙可插入 / 滚轮 / Ctrl 多选 / 不闪烁） ---------------- */
const DRAG = {
  pending: null, // { g, card, startX, startY }
  active: false,
  moved: false,
  appids: [],
  nodes: [],
  indicator: null,
  insertIndex: null,
  autoTimer: 0,
};

function setCardSelection() {
  const grid = $('grid');
  if (!grid) return;
  grid.querySelectorAll('.card').forEach((c) => c.classList.toggle('selected', state.selectedCards.has(String(c.dataset.appid))));
  updateSortHint();
}
function isSearchActive() {
  return String(state.search || '').trim() !== '';
}
/** 搜索状态下禁用拖拽排序，避免"筛选后拖拽"把顺序弄乱 */
function canDragSort() {
  return state.sortMode === 'custom' && !isSearchActive();
}
function updateSortHint() {
  const hint = $('sortHint');
  if (!hint) return;
  if (state.sortMode !== 'custom') {
    hint.hidden = true;
    return;
  }
  hint.hidden = false;
  if (isSearchActive()) {
    hint.textContent = T('搜索状态下不能拖拽排序（清空搜索即可）');
    return;
  }
  hint.textContent = state.selectedCards.size > 1 ? TP('已选 {0} 个，拖动可一起移动', state.selectedCards.size) : T('按住左键拖动封面排序');
}
function orderedSelected() {
  // 按当前 DOM 顺序返回选中的 appid
  return [...$('grid').querySelectorAll('.card')]
    .map((c) => String(c.dataset.appid))
    .filter((id) => state.selectedCards.has(id));
}

function onCardPointerDown(e, g, card) {
  if (state.sortMode !== 'custom' || e.button !== 0) return;
  // Ctrl / Cmd + 点击 = 多选切换
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const id = String(g.appid);
    if (state.selectedCards.has(id)) state.selectedCards.delete(id);
    else state.selectedCards.add(id);
    setCardSelection();
    state.suppressClickUntil = Date.now() + 300; // 不要触发"打开详情"
    return;
  }
  DRAG.pending = { g, card, startX: e.clientX, startY: e.clientY };
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragUp);
  document.addEventListener('pointercancel', onDragUp);
}

function onDragMove(e) {
  if (!DRAG.active) {
    if (!DRAG.pending) return;
    if (Math.abs(e.clientX - DRAG.pending.startX) + Math.abs(e.clientY - DRAG.pending.startY) < 6) return;
    beginDrag();
    if (!DRAG.active) return;
  }
  DRAG.moved = true;
  e.preventDefault();
  DRAG.lastX = e.clientX;
  DRAG.lastY = e.clientY;
  updateDragIndicator(e.clientX, e.clientY);
  autoScrollTick(e.clientY);
}

function onDragScroll() {
  if (DRAG.active && DRAG.lastX != null) updateDragIndicator(DRAG.lastX, DRAG.lastY);
}

function beginDrag() {
  const grid = $('grid');
  const p = DRAG.pending;
  if (!grid || !p) return;
  const id = String(p.g.appid);
  let appids;
  if (state.selectedCards.has(id) && state.selectedCards.size > 1) appids = orderedSelected();
  else appids = [id];
  DRAG.active = true;
  DRAG.appids = appids;
  DRAG.nodes = appids.map((a) => grid.querySelector('.card[data-appid="' + a + '"]')).filter(Boolean);
  DRAG.nodes.forEach((n) => n.classList.add('dragging'));
  DRAG.indicator = document.createElement('div');
  DRAG.indicator.className = 'drop-indicator';
  grid.appendChild(DRAG.indicator);
  document.body.classList.add('dragging-active');
  scroller().addEventListener('scroll', onDragScroll, { passive: true });
  state.selectedCards.clear();
  setCardSelection();
  state.suppressClickUntil = Date.now() + 400;
}

function visibleCardsForDrop() {
  return [...$('grid').querySelectorAll('.card')].filter((c) => !c.classList.contains('dragging'));
}

function computeInsertIndex(x, y) {
  const cards = visibleCardsForDrop();
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    if (y < r.bottom && (y < r.top || x < r.left + r.width / 2)) return i;
  }
  return cards.length;
}

function updateDragIndicator(x, y) {
  const grid = $('grid');
  const ind = DRAG.indicator;
  if (!grid || !ind) return;
  const cards = visibleCardsForDrop();
  const idx = computeInsertIndex(x, y);
  DRAG.insertIndex = idx;
  const gr = grid.getBoundingClientRect();
  let left, top, height;
  if (idx < cards.length) {
    const r = cards[idx].getBoundingClientRect();
    left = r.left - gr.left - 4;
    top = r.top - gr.top;
    height = r.height;
  } else if (cards.length) {
    const r = cards[cards.length - 1].getBoundingClientRect();
    left = r.right - gr.left + 1;
    top = r.top - gr.top;
    height = r.height;
  } else {
    return;
  }
  ind.style.left = left + 'px';
  ind.style.top = top + 'px';
  ind.style.height = height + 'px';
}

function scroller() {
  const grid = $('grid');
  return (grid && grid.closest('.main')) || document.scrollingElement || document.documentElement;
}

function autoScrollTick(clientY) {
  const sc = scroller();
  const rect = (sc === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect());
  const edge = 70;
  let dy = 0;
  if (clientY < rect.top + edge) dy = -Math.ceil((rect.top + edge - clientY) / 6);
  else if (clientY > rect.bottom - edge) dy = Math.ceil((clientY - (rect.bottom - edge)) / 6);
  if (dy) sc.scrollTop += dy;
}

function endDragVisual() {
  if (DRAG.indicator) {
    DRAG.indicator.remove();
    DRAG.indicator = null;
  }
  DRAG.nodes.forEach((n) => n.classList.remove('dragging'));
  DRAG.nodes = [];
  document.body.classList.remove('dragging-active');
  DRAG.lastX = null;
  DRAG.lastY = null;
  try {
    scroller().removeEventListener('scroll', onDragScroll);
  } catch (e) {
    /* ignore */
  }
}

function onDragUp() {
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragUp);
  document.removeEventListener('pointercancel', onDragUp);
  const wasActive = DRAG.active;
  const moved = DRAG.moved;
  const idx = DRAG.insertIndex;
  const appids = DRAG.appids.slice();
  endDragVisual();
  DRAG.active = false;
  DRAG.moved = false;
  DRAG.pending = null;
  DRAG.insertIndex = null;
  if (!wasActive) return; // 只是普通点击
  state.suppressClickUntil = Date.now() + 400;
  if (moved && idx != null) applyReorder(appids, idx);
}

/** 就地重排 DOM（不整片重渲染 → 不闪烁），并把新的可见顺序落库 */
function applyReorder(draggedAppids, insertIndex) {
  const grid = $('grid');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('.card')];
  const draggedSet = new Set(draggedAppids);
  const visIds = cards.map((c) => String(c.dataset.appid));
  const remaining = visIds.filter((id) => !draggedSet.has(id));
  const at = Math.max(0, Math.min(insertIndex, remaining.length));
  const newOrder = remaining.slice(0, at).concat(draggedAppids).concat(remaining.slice(at));
  const byId = new Map(cards.map((c) => [String(c.dataset.appid), c]));
  const frag = document.createDocumentFragment();
  for (const id of newOrder) {
    const c = byId.get(id);
    if (c) frag.appendChild(c);
  }
  grid.appendChild(frag); // 只移动节点，不重建 → 无闪烁、图片不重载
  saveCustomOrder(newOrder);
}

function render() {
  const grid = $('grid');
  clearCoverAnims(); // 旧的封面动画节点将被丢弃，先解除观察
  grid.innerHTML = '';
  state.selectedCards.clear(); // 重建后旧的多选项已失效
  const q = state.search.trim().toLowerCase();

  const list = sortGames(
    state.games.filter((g) => {
      if (state.catFilter !== 'all' && !(g.categories || []).includes(Number(state.catFilter))) return false;
      if (!q) return true;
      return (g.name || '').toLowerCase().includes(q) || (g.name_zh || '').toLowerCase().includes(q) || String(g.appid).includes(q);
    })
  );

  let arts = 0;
  for (const g of state.games) arts += g.artCount;
  $('libCount').textContent = state.games.length;
  $('artCount').textContent = arts;

  renderCats();
  $('empty').hidden = state.games.length > 0;

  let order = 0;
  for (const g of list) {
    const cands = coverCandidates(g);
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.appid = String(g.appid);

    const hasCustomPortrait = !!pickArt(g, 'portrait');
    // 直接在生成期翻译（不再依赖 applyI18n 扫描整片网格，省去上千次 DOM 写入）
    const badges =
      TYPE_ORDER.filter((t) => g.art[t] && g.art[t].length)
        .map((t) => `<span class="b b-${t}">${T(TYPE_LABELS[t])}</span>`)
        .join('') + (!hasCustomPortrait && isSteamAppid(g.appid) ? `<span class="b b-default">${T('默认')}</span>` : '');

    // 统一竖版：若没有竖版可用，则用横版/大背景图做虚化填充
    const thumb = document.createElement('div');
    thumb.className = 'thumb tall';
    if (cands.length) {
      const first = cands[0];
      const coverOrder = order++;
      if (first.preview) {
        // 有 .webm 预览 → 视频封面（一直播 / 悬停播，受可见与并发限制）
        const ensureFill = ensureFillFor(thumb);
        ensureFill(!first.tall);
        const bg = thumb.querySelector('.thumb-bg');
        if (bg) bg.style.backgroundImage = 'url("' + first.url.replace(/"/g, '\\"') + '")';
        const v = mountAnimatedCover(thumb, { posterUrl: first.url, videoUrl: first.preview, order: coverOrder });
        if (v) {
          v.addEventListener('error', () => {
            v.remove();
            buildCoverImg(thumb, cands, g); // 预览加载失败 → 退回静态/动图 img
          });
          thumb.appendChild(v);
        } else {
          buildCoverImg(thumb, cands, g);
        }
      } else {
        buildCoverImg(thumb, cands, g);
      }
    } else {
      thumb.appendChild(placeholderThumb(g));
    }

    const info = document.createElement('div');
    info.className = 'card-info';
    const alt = altName(g);
    info.innerHTML = `
      <div class="card-title">${esc(displayName(g))}</div>
      <div class="card-sub">${g.is_non_steam ? T('非 Steam · ') : ''}${alt ? esc(alt) + ' · ' : ''}${esc(g.appid)}</div>
      <div class="badges">${badges}</div>`;

    card.appendChild(thumb);
    card.appendChild(info);
    if (!g.syncable) {
      const un = document.createElement('div');
      un.className = 'card-unsync';
      un.title = g.is_non_steam
        ? T('非 Steam 游戏，无法同步到 Steam 库')
        : T('Steam App ID 无效（Steam 中无此游戏），无法同步到 Steam 库');
      un.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="6.2" y1="17.8" x2="17.8" y2="6.2" stroke="currentColor" stroke-width="2.2"/></svg>';
      thumb.appendChild(un);
    }
    card.addEventListener('click', () => {
      if (Date.now() < (state.suppressClickUntil || 0)) return;
      if (state.selectedCards.size) {
        state.selectedCards.clear();
        setCardSelection();
        return; // 有选中时，"点一下"先取消选中，不打开详情
      }
      openDetail(g.appid);
    });
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCardMenu(g, e.clientX, e.clientY);
    });

    // 自定义排序：指针拖拽排序（空隙也可插入 / 滚轮滚动 / Ctrl 多选）；**搜索状态下禁用**
    if (canDragSort()) {
      card.dataset.draggable = '1';
      card.querySelectorAll('img,video').forEach((im) => (im.draggable = false));
      card.classList.toggle('selected', state.selectedCards.has(String(g.appid)));
      card.addEventListener('pointerdown', (e) => onCardPointerDown(e, g, card));
    }

    grid.appendChild(card);
  }
  applyI18n();
}

async function loadLibrary() {
  const data = await api('/api/library');
  state.games = data.games || [];
  state.customOrders = data.customOrders || {};
  state.catMemberOrder = data.catMemberOrder || {};
  render();
}

/* ---------------- 分类（文件夹） ---------------- */

async function loadCategories() {
  const r = await api('/api/categories');
  state.categories = r.categories || [];
  renderCats();
}

function renderCats() {
  const box = $('catList');
  if (!box) return;
  box.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'chip' + (state.catFilter === 'all' ? ' active' : '');
  all.dataset.cat = 'all';
  all.textContent = T('全部游戏') + ' (' + state.games.length + ')';
  box.appendChild(all);
  for (const c of state.categories) {
    const b = document.createElement('button');
    b.className = 'chip cat-chip' + (String(state.catFilter) === String(c.id) ? ' active' : '');
    b.dataset.cat = String(c.id);
    b.innerHTML = `<span class="cat-name">${esc(c.name)} (${c.count})</span><span class="cat-ops"><i class="cat-ren" title="编辑">✎</i><i class="cat-del" title="删除">🗑</i></span>`;
    box.appendChild(b);
  }
}

/* ---------------- 回收站 ---------------- */

async function updateRecycleCount() {
  try {
    const r = await api('/api/trash');
    const n = (r.games || []).length;
    const el = $('recycleCount');
    if (el) el.textContent = n ? '(' + n + ')' : '';
  } catch (e) {
    /* ignore */
  }
}

async function openRecycle() {
  const notice = $('recycleNotice');
  notice.hidden = true;
  const box = $('recycleList');
  box.innerHTML = `<div class="muted" style="padding:12px">${T('加载中…')}</div>`;
  $('recycleModal').hidden = false;
  const r = await api('/api/trash');
  renderRecycle(r.games || []);
  applyI18n();
}

function renderRecycle(list) {
  const box = $('recycleList');
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = `<div class="muted" style="padding:16px">${T('回收站是空的。')}</div>`;
    return;
  }
  for (const g of list) {
    const row = document.createElement('div');
    row.className = 'pick-row cm-row';
    row.style.gridTemplateColumns = '34px 1fr auto auto';
    row.innerHTML =
      `<span class="cm-thumb"></span><span class="pick-name">${esc(displayName(g))}</span>` +
      `<span class="pick-meta">${g.artCount} ${T('张')}</span>` +
      `<span class="pick-tags"><button class="btn ghost" data-act="restore">恢复</button><button class="btn danger" data-act="purge">彻底删除</button></span>`;
    row.querySelector('[data-act="restore"]').addEventListener('click', () => restoreFromTrash(g));
    row.querySelector('[data-act="purge"]').addEventListener('click', () => purgeFromTrash(g));
    box.appendChild(row);
  }
}

async function restoreFromTrash(g) {
  const r = await post('/api/trash/restore', { appid: g.appid });
  if (r.ok) {
    toast(TP('已恢复「{0}」', g.name || g.appid));
    $('recycleNotice').hidden = true;
    await loadLibrary();
    await loadCategories();
    await openRecycle();
    updateRecycleCount();
  } else if (r.conflict) {
    const names = (r.conflicts || []).map((c) => c.name || c.appid).join(', ');
    const n = $('recycleNotice');
    n.hidden = false;
    n.textContent = TP('恢复失败：库中已存在重复游戏 {0}。请先在库中删除重复的那个，再回来恢复。', names);
  } else {
    toast(r.error || T('恢复失败'), true);
  }
}

async function purgeFromTrash(g) {
  if (!(await uiConfirm({ title: T('彻底删除'), message: TP('彻底删除「{0}」？此操作不可恢复。', g.name || g.appid), danger: true, okText: T('彻底删除') }))) return;
  await post('/api/trash/purge', { appid: g.appid });
  toast(T('已彻底删除'));
  await openRecycle();
  updateRecycleCount();
}

function openCardMenu(g, x, y) {
  state.cardMenuGame = g;
  const m = $('cardMenu');
  m.hidden = false;
  m.style.left = Math.max(8, Math.min(window.innerWidth - 190, x)) + 'px';
  m.style.top = Math.max(8, Math.min(window.innerHeight - 96, y)) + 'px';
}

function openGameGroups(g) {
  state.cardMenuGame = g;
  $('gameGroupsTitle').textContent = T('更改分组') + ' · ' + displayName(g);
  const box = $('gameGroupsList');
  box.innerHTML = '';
  if (!state.categories.length) {
    box.innerHTML = `<div class="muted" style="padding:12px">${T('还没有分组，请先在左侧「新建分类」。')}</div>`;
  }
  for (const c of state.categories) {
    const on = (g.categories || []).includes(c.id);
    const row = document.createElement('label');
    row.className = 'pick-row';
    row.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''} data-cid="${c.id}" /><span class="pick-name">${esc(c.name)}</span>`;
    box.appendChild(row);
  }
  $('gameGroupsModal').hidden = false;
}

async function editAppId(g) {
  const cur = String(g.appid);
  const nv = await uiPrompt({
    title: T('编辑 Steam App ID'),
    sub: TP('当前：{0}（必须为数字；与库中其它游戏重复会被拒绝）', cur),
    label: 'Steam App ID',
    placeholder: T('例如 2358720'),
    value: /^\d+$/.test(cur) ? cur : '',
  });
  if (nv === null) return;
  const n = nv.trim();
  if (!n || n === cur) return;
  const r = await post('/api/library/set-appid', { appid: cur, newAppid: n });
  if (r.ok) {
    toast(T('App ID 已更新'));
    await loadLibrary();
    await loadCategories();
  } else {
    toast(r.error || T('修改失败'), true);
  }
}

function openCatMenu(id, anchor) {
  state.catMenuId = Number(id);
  const menu = $('catMenu');
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(window.innerWidth - 170, r.right + 6)) + 'px';
  menu.style.top = r.bottom + 6 + 'px';
}

function openCatManage(id) {
  const cat = state.categories.find((c) => String(c.id) === String(id));
  if (!cat) return;
  state.catManage = {
    id: Number(id),
    checked: new Set(state.games.filter((g) => (g.categories || []).includes(Number(id))).map((g) => String(g.appid))),
  };
  $('catManageTitle').textContent = T('批量添加') + ' · ' + cat.name;
  $('catManageSearch').value = '';
  $('catManageAll').checked = false;
  renderCatManage();
  applyI18n();
  $('catManageModal').hidden = false;
}

function renderCatManage() {
  const q = $('catManageSearch').value.trim().toLowerCase();
  const box = $('catManageList');
  box.innerHTML = '';
  const list = state.games.filter((g) => !q || (g.name || '').toLowerCase().includes(q) || String(g.appid).includes(q));
  for (const g of list) {
    const row = document.createElement('label');
    row.className = 'pick-row cm-row cat-manage-row';
    const checked = state.catManage.checked.has(String(g.appid));
    const cover = coverOf(g);
    // 该游戏当前已加入的分类（当前正在管理的分类高亮显示），便于辨认
    const cats = (g.categories || [])
      .map((cid) => state.categories.find((c) => c.id === cid))
      .filter(Boolean);
    const catsHtml = cats.length
      ? cats
          .map((c) => `<span class="cm-cat${c.id === state.catManage.id ? ' cur' : ''}">${esc(c.name)}</span>`)
          .join('')
      : `<span class="none">${T('未加入任何分类')}</span>`;
    row.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''} /><span class="cm-thumb">${cover ? `<img loading="lazy" decoding="async" src="${cover.url}" alt="">` : ''}</span><span class="pick-name">${esc(displayName(g))}</span><span class="cm-cats">${catsHtml}</span><span class="pick-meta">${esc(g.appid)}</span>`;
    const cb = row.querySelector('input');
    cb.addEventListener('change', () => {
      if (cb.checked) state.catManage.checked.add(String(g.appid));
      else state.catManage.checked.delete(String(g.appid));
    });
    box.appendChild(row);
  }
}

/* ---------------- 详情 ---------------- */

async function openDetail(appid) {
  const g = state.games.find((x) => String(x.appid) === String(appid));
  if (!g) return;
  state.detail = g;

  // 立即渲染并打开（不再等待网络）
  renderDetail(g, null);
  $('detailModal').hidden = false;

  // 后台再检测"缺失类型的默认图来源"，完成后再刷新一次（只查缺的类型）
  if (isSteamAppid(g.appid)) {
    const missing = TYPE_ORDER.filter((t) => !(g.art[t] && g.art[t].length));
    if (missing.length) {
      api('/api/defaultart/sources?appid=' + encodeURIComponent(g.appid) + '&types=' + missing.join(','))
        .then(async (sr) => {
          if (!(state.detail && String(state.detail.appid) === String(g.appid))) return;
          await loadLibrary();
          const gg = state.games.find((x) => String(x.appid) === String(g.appid)) || g;
          renderDetail(gg, sr.sources || {});
        })
        .catch(() => {});
    }
  }
}

function renderDetail(g, sources) {
  const cover = coverOf(g);
  $('detailCover').innerHTML = cover ? `<img src="${cover.url}" alt="">` : '';
  $('detailTitle').textContent = displayName(g);
  const applyBtn = $('btnApplyOne');
  if (applyBtn) {
    applyBtn.disabled = !g.syncable;
    applyBtn.title = g.syncable
      ? ''
      : g.is_non_steam
      ? T('非 Steam 游戏，无法同步到 Steam 库')
      : T('Steam App ID 无效，无法同步到 Steam 库');
  }
  $('detailSub').textContent = `${g.is_non_steam ? T('非 Steam') + ' · ' : ''}AppID ${g.appid} · ${g.artCount} ${T('张')}`;

  const body = $('detailBody');
  body.innerHTML = '';

  for (const t of TYPE_ORDER) {
    const arr = g.art[t] || [];
    const sec = document.createElement('section');
    sec.className = 'art-sec';
    const h = document.createElement('h3');
    h.innerHTML = `<span class="type-label">${TYPE_LABELS[t]}</span> <span class="muted">(${arr.length})</span>`;
    sec.appendChild(h);

    const strip = document.createElement('div');
    strip.className = 'art-strip';

    // 1) 库中已保留的（可多张，点选用、点✕删除、拖拽排序）
    for (const a of arr) {
      const selected = g.hasSelected[t] === a.id;
      const tile = document.createElement('div');
      tile.className = 'art-tile t-' + t + (selected ? ' selected' : '');
      tile.draggable = true;
      const label = a.source === 'sgdb' ? 'SGDB' : a.source === 'steam' ? 'Steam' : '本地';
      const mediaUrl = assetUrl(g.appid, a.file);
      const pv = a.has_preview ? previewUrl(g.appid, a.file) : null;
      const mediaHtml = pv
        ? `<video class="tile-media" muted loop playsinline preload="metadata" poster="${esc(mediaUrl)}" src="${esc(pv)}"></video>`
        : `<img class="tile-media" loading="lazy" decoding="async" src="${esc(mediaUrl)}" alt="">`;
      tile.innerHTML = `
        ${mediaHtml}
        <button class="tile-del" title="从库中删除">✕</button>
        <span class="tile-tag">${label}</span>${selected ? '<span class="tile-current">当前</span>' : ''}`;
      const media = tile.querySelector('.tile-media');
      if (pv) {
        const hover = ((state.ui && state.ui.animCovers) || 'auto') === 'hover';
        const play = () => {
          const p = media.play();
          if (p && p.catch) p.catch(() => {});
        };
        const pause = () => {
          try {
            media.pause();
          } catch (e) {
            /* ignore */
          }
        };
        if (hover) {
          media.addEventListener('mouseenter', play);
          media.addEventListener('mouseleave', pause);
        } else {
          registerCoverAnim(media, -(++detailCoverOrder), play, pause); // 详情优先占用"播放名额"
        }
      } else if (a.mime === 'image/webp') {
        freezeAnimatedCover(media, mediaUrl);
      }
      media.addEventListener('click', async () => {
        await post('/api/library/select-art', { appid: g.appid, type: t, id: a.id });
        await loadLibrary();
        openDetail(g.appid);
        toast(T('已选用'));
      });
      tile.querySelector('.tile-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        await post('/api/library/remove-art', { appid: g.appid, id: a.id });
        await loadLibrary();
        openDetail(g.appid);
      });
      // 拖拽排序
      tile.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(a.id));
        tile.classList.add('dragging');
      });
      tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
      tile.addEventListener('dragover', (e) => e.preventDefault());
      tile.addEventListener('drop', async (e) => {
        e.preventDefault();
        const dragId = Number(e.dataTransfer.getData('text/plain'));
        if (!dragId || dragId === a.id) return;
        const ids = arr.map((x) => x.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(a.id);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        await post('/api/library/reorder-art', { appid: g.appid, type: t, ids });
        await loadLibrary();
        openDetail(g.appid);
      });
      strip.appendChild(tile);
    }

    // 2) 默认图：仅当该类型"库里还没有"时显示，避免与已保留的 Steam 图重复
    if (isSteamAppid(g.appid) && arr.length === 0) {
      if (sources === null) {
        const wait = document.createElement('div');
        wait.className = 'art-none';
        wait.textContent = T('检测默认图…');
        strip.appendChild(wait);
      } else if (sources[t]) {
        const isSgdb = sources[t] === 'sgdb';
        const tile = document.createElement('div');
        tile.className = 'art-tile t-' + t + ' default-tile';
        tile.innerHTML = `<img loading="lazy" src="${defaultUrl(g.appid, t)}" alt=""><span class="tile-tag ${isSgdb ? 'sgdb' : ''}">${isSgdb ? T('SGDB兜底') : T('默认')}</span><span class="tile-hint">${T('点图加入库')}</span>`;
        tile.querySelector('img').addEventListener('click', async () => {
          await post('/api/library/import-default', { appid: g.appid, type: t });
          await loadLibrary();
          openDetail(g.appid);
          toast(T('已把默认图加入库'));
        });
        strip.appendChild(tile);
      } else {
        const none = document.createElement('div');
        none.className = 'art-none';
        none.textContent = T('默认图获取失败（Steam 与 SteamGridDB 均无）');
        strip.appendChild(none);
      }
    }

    // 3) 添加按钮
    const add = document.createElement('div');
    add.className = 'art-tile t-' + t + ' art-add';
    add.innerHTML = `<div class="plus">＋</div><div class="add-label">添加</div>`;
    add.addEventListener('click', () => startAddForType(g, t));
    strip.appendChild(add);

    sec.appendChild(strip);
    body.appendChild(sec);
  }
  applyI18n();
}

/** 为某游戏的某类型添加封面：先让用户选择方式（SteamGridDB / 导入图片） */
function startAddForType(g, type) {
  state.choice = { appid: g.appid, name: g.name, sgdbId: g.sgdb_id, type };
  $('choiceTitle').textContent = T('添加') + ' · ' + T(TYPE_LABELS[type] || type);
  $('choiceSub').textContent = g.name || g.appid;
  $('addChoiceModal').hidden = false;
}

async function choiceSgdbFlow() {
  const c = state.choice;
  $('addChoiceModal').hidden = true;
  if (!c) return;
  if (c.sgdbId) {
    openArtPicker({ sgdbGameId: c.sgdbId, name: c.name, appid: c.appid, type: c.type, mode: 'detail' });
    return;
  }
  // 用 Steam AppID 直接定位 SGDB 游戏，直接进入选图（无需再搜索）
  if (isSteamAppid(c.appid)) {
    try {
      const r = await api('/api/sgdb/game?appid=' + encodeURIComponent(c.appid));
      if (r.game) {
        post('/api/library/add', { appid: c.appid, name: c.name, sgdbGameId: r.game.id });
        openArtPicker({ sgdbGameId: r.game.id, name: r.game.name || c.name, appid: c.appid, type: c.type, mode: 'detail' });
        return;
      }
    } catch (e) {
      /* ignore */
    }
  }
  // 找不到才回退到"搜索"
  if (state.detail) $('detailModal').hidden = true;
  openAdd(c.name || '', c.appid, c.type);
  $('addNotice').hidden = false;
  $('addNotice').textContent = TP(
    '选择一个游戏，其封面会加到「{0}」的「{1}」里。',
    c.name || c.appid,
    T(TYPE_LABELS[c.type] || c.type)
  );
}

function choiceImportFlow() {
  const c = state.choice;
  $('addChoiceModal').hidden = true;
  if (!c) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/*';
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => openCrop(c.type, reader.result, (t, du) => saveImageToLibrary(t, du, c));
    reader.readAsDataURL(f);
  });
  input.click();
}

/* ---- 按比例裁切 ---- */
const CROP_TARGET = {
  portrait: { w: 600, h: 900 },
  grid: { w: 920, h: 430 },
  hero: { w: 1920, h: 620 },
  icon: { w: 512, h: 512 },
  logo: null, // Logo 无固定比例，不裁切
};

function openCrop(type, dataUrl, onDone) {
  const target = CROP_TARGET[type];
  if (!target) {
    onDone(type, dataUrl); // Logo：不裁切
    return;
  }
  const el = $('cropImg');
  el.onload = () => {
    const stage = $('cropStage');
    stage.style.aspectRatio = target.w + ' / ' + target.h;
    state.crop = { type, target, img: el, onDone, zoom: 1, tx: 0, ty: 0, baseScale: 1, stageW: 0, stageH: 0 };
    $('cropTitle').textContent = T('裁切') + ' · ' + T(TYPE_LABELS[type] || type);
    $('cropSub').textContent = `${T('目标')} ${target.w}×${target.h} · ${T('拖动移动，滑块缩放')}`;
    $('cropZoom').value = 1;
    $('cropModal').hidden = false;
    requestAnimationFrame(() => initCropStage());
  };
  el.src = dataUrl;
}

function initCropStage() {
  const c = state.crop;
  if (!c) return;
  const stage = $('cropStage');
  // 先量出可用宽度（stage 默认 width:100%）
  stage.style.width = '100%';
  stage.style.height = '';
  stage.style.aspectRatio = c.target.w + ' / ' + c.target.h;
  const avail = stage.clientWidth || 460;
  const ratio = c.target.w / c.target.h;
  const maxH = Math.min(window.innerHeight * 0.55, 460);
  let w = avail;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  stage.style.aspectRatio = '';
  stage.style.width = Math.round(w) + 'px';
  stage.style.height = Math.round(h) + 'px';

  c.stageW = stage.clientWidth;
  c.stageH = stage.clientHeight;
  c.baseScale = Math.max(c.stageW / c.img.naturalWidth, c.stageH / c.img.naturalHeight);
  c.tx = (c.stageW - c.img.naturalWidth * c.baseScale) / 2;
  c.ty = (c.stageH - c.img.naturalHeight * c.baseScale) / 2;
  applyCropTransform();
}

function applyCropTransform() {
  const c = state.crop;
  if (!c) return;
  const dispScale = c.baseScale * c.zoom;
  const dw = c.img.naturalWidth * dispScale;
  const dh = c.img.naturalHeight * dispScale;
  c.tx = Math.min(0, Math.max(c.stageW - dw, c.tx));
  c.ty = Math.min(0, Math.max(c.stageH - dh, c.ty));
  const el = $('cropImg');
  el.style.width = dw + 'px';
  el.style.height = dh + 'px';
  el.style.left = c.tx + 'px';
  el.style.top = c.ty + 'px';
}

function onCropZoom(newZoom) {
  const c = state.crop;
  if (!c) return;
  const ratio = newZoom / c.zoom;
  const cx = c.stageW / 2;
  const cy = c.stageH / 2;
  c.tx = cx - (cx - c.tx) * ratio;
  c.ty = cy - (cy - c.ty) * ratio;
  c.zoom = newZoom;
  applyCropTransform();
}

function saveCrop() {
  const c = state.crop;
  if (!c) return;
  const canvas = document.createElement('canvas');
  canvas.width = c.target.w;
  canvas.height = c.target.h;
  const ctx = canvas.getContext('2d');
  const dispScale = c.baseScale * c.zoom;
  const sx = -c.tx / dispScale;
  const sy = -c.ty / dispScale;
  const sW = c.stageW / dispScale;
  const sH = c.stageH / dispScale;
  ctx.drawImage(c.img, sx, sy, sW, sH, 0, 0, c.target.w, c.target.h);
  const dataUrl = canvas.toDataURL('image/png');
  const done = c.onDone;
  $('cropModal').hidden = true;
  if (done) done(c.type, dataUrl);
}

async function saveImageToLibrary(type, dataUrl, choice) {
  if (!choice) return;
  const r = await post('/api/library/add-image', { appid: choice.appid, name: choice.name, type, dataUrl });
  if (r.ok) {
    toast(T('已加入库'));
    $('cropModal').hidden = true;
    await loadLibrary();
    openDetail(choice.appid);
  } else {
    toast(r.error || T('保存失败'), true);
  }
}

/* ---------------- 同步 Steam 库 ---------------- */

async function openSync() {
  const data = await api('/api/library/detect');
  if (!data.bound) {
    toast(T('请先绑定 Steam 账号，才能读取你拥有的游戏'), true);
    openSettings('steam');
    return;
  }
  state.sync.games = data.games || [];
  state.sync.selected = new Set();
  $('syncSub').textContent = `${T('你拥有')} ${state.sync.games.length} ${T('款游戏（勾选后导入你的库）。')}`;
  $('syncSearch').value = '';
  $('syncAll').checked = false;
  renderSyncList();
  applyI18n();
  $('syncModal').hidden = false;
  refreshOwned(true); // 后台刷新：新买的游戏也会出现
}

/** 重新拉取"拥有列表"（买了新游戏后）；silent=不弹提示 */
async function refreshOwned(silent) {
  const btn = $('btnSyncRefresh');
  if (btn) btn.disabled = true;
  const r = await post('/api/steam/refresh', {});
  if (btn) btn.disabled = false;
  if (!r.ok) {
    if (!silent) toast(r.error || T('刷新失败'), true);
    return;
  }
  const data = await api('/api/library/detect');
  state.sync.games = data.games || [];
  const keep = state.sync.selected;
  state.sync.selected = new Set([...keep].filter((id) => (data.games || []).some((g) => String(g.appid) === String(id))));
  $('syncSub').textContent = `${T('你拥有')} ${state.sync.games.length} ${T('款游戏（勾选后导入你的库）。')}`;
  renderSyncList();
  if (!silent) toast(TP('已刷新拥有列表：共 {0} 款', state.sync.games.length));
}

function renderSyncList() {
  const q = $('syncSearch').value.trim().toLowerCase();
  const box = $('syncList');
  box.innerHTML = '';
  const list = state.sync.games.filter((g) => {
    if (!q) return true;
    return (g.name || '').toLowerCase().includes(q) || String(g.appid).includes(q);
  });
  if (!list.length) {
    box.innerHTML = `<div class="muted" style="padding:16px">${T('没有匹配的游戏')}</div>`;
    return;
  }
  for (const g of list) {
    const row = document.createElement('label');
    row.className = 'pick-row' + (g.inLibrary ? ' disabled' : '');
    const tags =
      `<span class="pick-tag ${g.artCount ? 'has' : ''}">${g.artCount ? g.artCount + ' ' + T('张封面') : T('无封面')}</span>` +
      (g.owned ? `<span class="pick-tag owned">${T('已拥有')}</span>` : '') +
      (g.installed ? `<span class="pick-tag">${T('已安装')}</span>` : '') +
      (g.inLibrary ? `<span class="pick-tag in">${T('已在库中')}</span>` : '');
    row.innerHTML = `
      <input type="checkbox" ${state.sync.selected.has(g.appid) ? 'checked' : ''} ${g.inLibrary ? 'disabled' : ''} />
      <span class="pick-name">${esc(g.name || 'AppID ' + g.appid)}</span>
      <span class="pick-meta">${g.isNonSteam ? T('非 Steam · ') : ''}${esc(g.appid)}</span>
      <span class="pick-tags">${tags}</span>`;
    const cb = row.querySelector('input');
    if (!g.inLibrary) {
      cb.addEventListener('change', () => {
        if (cb.checked) state.sync.selected.add(g.appid);
        else state.sync.selected.delete(g.appid);
      });
    }
    box.appendChild(row);
  }
}

async function doSyncImport() {
  const appids = [...state.sync.selected];
  if (!appids.length) return toast(T('请先勾选要导入的游戏'), true);
  $('btnSyncImport').disabled = true;
  const r = await post('/api/library/import', { appids });
  $('btnSyncImport').disabled = false;
  toast(TP('已导入 {0} 款游戏到库', r.imported));
  $('syncModal').hidden = true;
  await loadLibrary();
  pollSync(); // 显示补全进度
}

/* ---------------- 从 Steam 库添加 / 手动添加（SGDB 搜索） ---------------- */

const MANUAL_TYPES = ['portrait', 'grid', 'hero', 'logo', 'icon'];

function openManual() {
  state.manual = {};
  $('manualName').value = '';
  $('manualAppid').value = '';
  buildManualRows();
  $('manualModal').hidden = false;
  applyI18n();
}

function buildManualRows() {
  const box = $('manualTypes');
  box.innerHTML = '';
  for (const type of MANUAL_TYPES) {
    const label = TYPE_LABELS[type] || type;
    const row = document.createElement('div');
    row.className = 'manual-row';
    row.innerHTML = `
      <span class="mrow-label">${label}</span>
      <button class="btn ghost mrow-pick" type="button">选择图片</button>
      <span class="mrow-file muted"></span>
      <img class="mrow-prev" hidden alt="">`;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        openCrop(type, reader.result, (t, du) => {
          state.manual[t] = du;
          row.querySelector('.mrow-file').textContent = f.name;
          const prev = row.querySelector('.mrow-prev');
          prev.src = du;
          prev.hidden = false;
          row.classList.add('has');
        });
      };
      reader.readAsDataURL(f);
    });
    row.querySelector('.mrow-pick').addEventListener('click', () => input.click());
    row.appendChild(input);
    box.appendChild(row);
  }
}

async function saveManual() {
  const name = $('manualName').value.trim();
  if (!name) return toast(T('请输入游戏名'), true);
  const appid = $('manualAppid').value.trim();
  $('btnManualSave').disabled = true;
  const r = await post('/api/library/manual-add', { name, appid, images: state.manual || {} });
  $('btnManualSave').disabled = false;
  if (r.ok) {
    toast(TP('已添加「{0}」，导入 {1} 张图', name, r.added));
    $('manualModal').hidden = true;
    await loadLibrary();
  } else {
    toast(r.error || T('添加失败'), true);
  }
}

function openAdd(prefillName, targetAppid, type) {
  state.addTarget = targetAppid || null;
  state.addType = type || null;
  $('addResults').innerHTML = '';
  $('addSearch').value = prefillName || '';
  $('addNotice').hidden = true;
  $('addModal').hidden = false;
  if (prefillName) doAddSearch();
}

async function doAddSearch() {
  const q = $('addSearch').value.trim();
  if (!q) return;
  const notice = $('addNotice');
  const data = await api('/api/sgdb/search?q=' + encodeURIComponent(q));
  if (data.error) {
    notice.hidden = false;
    notice.textContent = data.hasApiKey ? data.error : T('未设置 SteamGridDB API Key') + T('，请到「设置」里填写。');
  } else {
    notice.hidden = true;
  }
  const box = $('addResults');
  box.innerHTML = '';
  if (!data.games || !data.games.length) {
    box.innerHTML = `<div class="muted" style="padding:16px">${T('没有结果（试试英文名）')}</div>`;
    return;
  }
  for (const g of data.games) {
    const row = document.createElement('div');
    row.className = 'pick-row clickable';
    row.innerHTML = `
      <span class="pick-name">${esc(g.name)}</span>
      <span class="pick-meta">SGDB #${g.id}${g.release_date ? ' · ' + esc(String(g.release_date).slice(0, 4)) : ''}</span>
      <span class="pick-tag choose">${T('选择 →')}</span>`;
    row.addEventListener('click', () => {
      openArtPicker({
        sgdbGameId: g.id,
        name: g.name,
        appid: state.addTarget,
        type: state.addType || 'portrait',
        mode: state.addTarget ? 'detail' : 'add',
      });
    });
    box.appendChild(row);
  }
}

/* ---------------- SGDB 艺术选择器 ---------------- */

/** 从过滤复选框读取当前筛选（类型：静态/动图；附加：幽默/成人） */
function artFiltersFromCheckboxes() {
  return {
    static: $('afStatic').checked,
    animated: $('afAnimated').checked,
    humor: $('afHumor').checked,
    nsfw: $('afNsfw').checked,
    epilepsy: $('afEpilepsy').checked,
  };
}
/** 旧的"服务端按标签筛选"方案已弃用（SGDB 的 humor/nsfw 过滤不可靠）——
 *  现改为 `/api/sgdb/art-all` 全量拉取 + 客户端 `filterArts` 过滤，见 loadArt。 */

/** 客户端过滤：
 *  - 类型：静态=mime 非 image/webp；动图=mime 为 image/webp（SGDB 动图只用 webp）。至少按静态处理。
 *  - 标签：都不勾→只要正经图（nsfw/humor 都为 false）；勾了→只要所选类别（并集）。 */
function filterArts(arts) {
  const f = (state.art && state.art.filters) || {};
  const curType = state.art && state.art.type;
  const dir = curType === 'portrait' ? 'v' : curType === 'grid' ? 'h' : null; // 竖向/横向共用一份数据，此处分流
  const types = [];
  if (f.static) types.push('static');
  if (f.animated) types.push('animated');
  if (!types.length) types.push('static');
  const bothTypes = types.length === 2;
  const TAG_KEYS = ['humor', 'nsfw', 'epilepsy'];
  const selected = TAG_KEYS.filter((k) => f[k]);
  return (arts || []).filter((a) => {
    // 方向：竖向 w<h、横向 w>h（无尺寸的两边都保留）
    if (dir && a.width && a.height) {
      if (dir === 'v' && !(a.width < a.height)) return false;
      if (dir === 'h' && !(a.width > a.height)) return false;
    }
    const animated = a.mime === 'image/webp';
    if (!bothTypes) {
      if (types[0] === 'static' && animated) return false;
      if (types[0] === 'animated' && !animated) return false;
    }
    if (selected.length === 0) {
      // 正经（未标记）：三类标签都不带
      if (a.nsfw || a.humor || a.epilepsy) return false;
    } else if (selected.length < TAG_KEYS.length) {
      // 只看所勾标签（并集）
      const ok = (a.humor && f.humor) || (a.nsfw && f.nsfw) || (a.epilepsy && f.epilepsy);
      if (!ok) return false;
    }
    // 全部标签都勾选 = 全部（含正经）
    return true;
  });
}

function openArtPicker({ sgdbGameId, name, appid, type, mode }) {
  // 类型至少选一个（官网规则）
  if (!$('afStatic').checked && !$('afAnimated').checked) $('afStatic').checked = true;
  state.art = {
    appid: appid || null,
    name: name || null,
    sgdbGameId: sgdbGameId || null,
    type: type || 'portrait',
    mode: mode || 'add',
    loading: false,
    cache: {}, // 每次打开都重新拉取（不做跨次缓存）
    filters: artFiltersFromCheckboxes(),
  };
  $('artSub').textContent = T('当前：') + (name || appid || '') + T(' · 点任意一张即可加入你的库');
  $('artSearch').value = name || '';
  $('artResults').hidden = true;
  $('artTabs').hidden = false;
  $('artFilters').hidden = false;
  $('artGrid').hidden = false;
  $('btnArtMore').hidden = true;
  setArtStatus('');
  $('artModal').hidden = false; // 先显示弹窗，再开始加载（loadArt 会检查"弹窗是否已关闭"）
  renderArtTabs();
  loadArt(true);
}

async function doArtSearch() {
  const q = $('artSearch').value.trim();
  if (!q) return;
  const box = $('artResults');
  box.hidden = false;
  $('artTabs').hidden = true;
  $('artFilters').hidden = true;
  $('artGrid').hidden = true;
  $('btnArtMore').hidden = true;
  box.innerHTML = `<div class="muted" style="padding:12px">${T('搜索中…')}</div>`;
  const r = await api('/api/sgdb/search?q=' + encodeURIComponent(q));
  box.innerHTML = '';
  if (r.error) {
    box.innerHTML = `<div class="muted" style="padding:12px">${esc(r.error)}</div>`;
    return;
  }
  if (!r.games || !r.games.length) {
    box.innerHTML = `<div class="muted" style="padding:12px">${T('没有结果（试试英文名）')}</div>`;
    return;
  }
  for (const g of r.games) {
    const row = document.createElement('div');
    row.className = 'pick-row clickable';
    row.innerHTML = `<span class="pick-name">${esc(g.name)}</span><span class="pick-meta">SGDB #${g.id}</span><span class="pick-tag choose">${T('选择 →')}</span>`;
    row.addEventListener('click', () => {
      state.art.sgdbGameId = g.id;
      state.art.name = g.name;
      $('artSub').textContent = T('当前：') + g.name + T(' · 点任意一张即可加入你的库');
      $('artResults').hidden = true;
      $('artTabs').hidden = false;
      $('artFilters').hidden = false;
      $('artGrid').hidden = false;
      renderArtTabs();
      loadArt(true);
    });
    box.appendChild(row);
  }
}

function renderArtTabs() {
  const tabs = $('artTabs');
  tabs.innerHTML = '';
  for (const t of TYPE_ORDER) {
    const b = document.createElement('button');
    b.className = 'chip' + (state.art.type === t ? ' active' : '');
    b.textContent = TYPE_LABELS[t];
    b.addEventListener('click', () => {
      state.art.type = t;
      renderArtTabs();
      loadArt(true);
    });
    tabs.appendChild(b);
  }
  applyI18n();
}

/** 竖向/横向共用同一份 grids 数据（其它类型各自一份） */
function artGroup(type) {
  return type === 'portrait' || type === 'grid' ? 'grids' : type;
}

let artReqSeq = 0; // 请求序号：只有最新一次请求结果会渲染

/**
 * 渐进式加载：先取第 1 页**立即显示**，再后台把剩余页陆续补齐；
 * 竖向/横向共用同一份 grids（切过去不再联网）。结果只留在本次弹窗内存，不落盘、不跨次复用。
 */
async function loadArt(reset) {
  const moreBtn = $('btnArtMore');
  if (moreBtn) moreBtn.hidden = true;
  const grid = $('artGrid');
  const gid = state.art.sgdbGameId;
  if (!gid) {
    grid.innerHTML = `<div class="muted" style="padding:16px">${T('未知 SGDB 游戏 ID')}</div>`;
    return;
  }
  const group = artGroup(state.art.type);
  const ck = group + ':' + gid;
  state.art.cache = state.art.cache || {};
  let e = state.art.cache[ck];
  if (!e) e = state.art.cache[ck] = { items: [], nextPage: 0, done: false, loading: false, error: null };
  // 内存缓存只保留最近几个 game:type，避免逛很多游戏后无限增长（结果本来就不落盘/不跨次复用）
  const ckeys = Object.keys(state.art.cache);
  if (ckeys.length > 6) {
    for (const k of ckeys) {
      if (k !== ck) delete state.art.cache[k];
    }
  }

  const stillMine = () => artGroup(state.art.type) === group && state.art.sgdbGameId === gid;
  // 选图器已关闭 → 停止后台继续翻页（避免"关了弹窗还在拼命联网/拉起一堆 PowerShell"）
  const pickerGone = () => {
    const m = $('artModal');
    return !!m && m.hidden;
  };
  const PAGE_CAP = 40; // 单类型最多翻 40 页（安全上限）
  renderArtGrid(e.items, { loading: !e.done && !e.error, error: e.error }); // 先渲染已有（空则显示"加载中"）
  if (e.done || e.loading) return;
  if (e.error) e.error = null; // 允许重试

  e.loading = true;
  const myId = ++artReqSeq;
  try {
    while (!e.done) {
      if (pickerGone()) return; // 弹窗已关：停止（e.loading 在 finally 收尾）
      const r = await api(
        '/api/sgdb/art?type=' + encodeURIComponent(group) + '&gameId=' + encodeURIComponent(gid) +
          '&page=' + e.nextPage + '&types=static,animated&nsfw=any&humor=any&epilepsy=any'
      );
      if (myId !== artReqSeq) return; // 已切到别的游戏/类型，放弃本次（保留已取部分，下次可续）
      if (pickerGone()) return;
      if (r.error) {
        e.error = r.error;
        break;
      }
      const arts = r.arts || [];
      if (arts.length) e.items = e.items.concat(arts);
      e.nextPage++;
      if (!r.hasMore || !arts.length || e.nextPage >= PAGE_CAP) e.done = true;
      if (stillMine()) renderArtGrid(e.items, { loading: !e.done, error: null });
    }
  } catch (err) {
    e.error = err.message;
  } finally {
    e.loading = false;
  }
  if (stillMine() && !pickerGone()) renderArtGrid(e.items, { loading: false, error: e.error });
}

/** 单张艺术图单元格：动图用 <video>（默认不播放、悬停才播），其它用 <img> */
function makeArtCell(a) {
  // 动图判定放宽：mime 为 webp，或 url 是 .webp（避免个别条目漏判被放进 <img> 而裂图）
  const anim = a.mime === 'image/webp' || /\.webp(\?|$)/i.test(String(a.url || ''));
  const cell = document.createElement('div');
  cell.className = 'art-cell';
  const badge = [];
  if (anim) badge.push({ t: T('动图'), c: 'anim' });
  if (a.humor) badge.push({ t: T('幽默'), c: 'humor' });
  if (a.nsfw) badge.push({ t: T('成人'), c: 'nsfw' });
  if (a.epilepsy) badge.push({ t: T('癫痫'), c: 'epilepsy' });
  const tagHtml = badge.map((b) => `<span class="art-tag tag-${b.c}">${b.t}</span>`).join('');
  const info = `<div class="art-tags">${tagHtml}</div><div class="art-cell-info">${a.width || '?'}×${a.height || '?'}${a.author ? '<br>' + esc(a.author) : ''}</div>`;

  // 加载失败占位
  const failNote = () => {
    const d = document.createElement('div');
    d.className = 'art-thumb art-thumb-fail muted';
    d.textContent = T('预览加载失败');
    const m = cell.querySelector('.art-thumb');
    if (m && m.parentNode === cell) m.replaceWith(d);
  };
  // 图片：失败先退回 fallback（如 thumb 裂了就用原图 url），再失败才显示占位
  const mountImg = (src, fallbackSrc) => {
    const img = document.createElement('img');
    img.className = 'art-thumb';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    let tried = false;
    img.onerror = () => {
      if (!tried && fallbackSrc && fallbackSrc !== src) {
        tried = true;
        img.src = fallbackSrc;
        return;
      }
      failNote();
    };
    img.src = src;
    return img;
  };

  // SGDB 动图的 thumb 是 .webm：用 <video> 且**默认不播放**（preload=metadata 显示首帧），悬停才播放 → 避免几十个 webp 同时解码
  const thumbIsWebm = anim && /\.webm(\?|$)/i.test(String(a.thumb || ''));
  let media;
  if (thumbIsWebm) {
    const v = document.createElement('video');
    v.className = 'art-thumb';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.addEventListener('loadedmetadata', () => {
      try {
        v.currentTime = 0.01;
      } catch (e) {
        /* ignore */
      }
    });
    v.addEventListener('mouseenter', () => {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    });
    v.addEventListener('mouseleave', () => {
      try {
        v.pause();
        v.currentTime = 0;
      } catch (e) {
        /* ignore */
      }
    });
    v.addEventListener('error', () => {
      const img = mountImg(a.url || a.thumb, null); // webm 失败 → 退回 webp 原图
      if (v.parentNode === cell) v.replaceWith(img);
    });
    v.src = a.thumb;
    media = v;
  } else {
    media = mountImg(a.thumb || a.url, a.url);
  }
  cell.innerHTML = info;
  cell.insertBefore(media, cell.firstChild);
  cell.addEventListener('click', () => enqueueAddArt(a));
  return cell;
}

// 选图器单元格缓存：按 art id 复用 DOM，翻页/筛选时**不重建、不重新解码**已显示的图
let artCellCache = new Map();
let artCellKey = '';

/** 用内存数据 + 当前筛选渲染（不发请求） */
function renderArtGrid(all, opt) {
  opt = opt || {};
  const grid = $('artGrid');
  const items = filterArts(all);
  const ck = artGroup(state.art.type) + ':' + state.art.sgdbGameId;
  if (ck !== artCellKey) {
    grid.innerHTML = '';
    artCellCache = new Map();
    artCellKey = ck;
  }
  const seen = new Set();
  for (const a of items) {
    const key = a.sgdb_id != null ? 'id:' + a.sgdb_id : 'url:' + a.url;
    seen.add(key);
    let cell = artCellCache.get(key);
    if (!cell) {
      cell = makeArtCell(a);
      artCellCache.set(key, cell);
    }
    grid.appendChild(cell); // 已存在则只移动位置，图片不会重新加载
  }
  for (const [key, cell] of Array.from(artCellCache)) {
    if (!seen.has(key)) {
      cell.remove();
      artCellCache.delete(key);
    }
  }
  // 空态/加载态：用一个独立提示节点（不破坏已缓存的单元格）
  let msg = grid.querySelector('.art-grid-msg');
  const setMsg = (html) => {
    if (html == null) {
      if (msg) {
        msg.remove();
        msg = null;
      }
      return;
    }
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'art-grid-msg muted';
      msg.style.padding = '16px';
      msg.style.gridColumn = '1 / -1';
    }
    msg.innerHTML = html;
    grid.appendChild(msg); // 放到最后
  };
  if (!items.length) {
    if (opt.error) setMsg(esc(opt.error));
    else if (opt.loading) setMsg(T('加载中…'));
    else setMsg(T("当前筛选下没有资源。可更换「类型 / 标签」或换一款游戏（如 Garry's Mod／TF2 有幽默、巫师3／赛博朋克2077 有成人）。"));
  } else {
    setMsg(null);
  }
  $('artPickCount').textContent = items.length
    ? T('显示') + ' ' + items.length + ' ' + T('张') + (opt.loading ? T('（还在加载…）') : T(' / 共 ') + all.length + ' ' + T('张'))
    : opt.loading
    ? T('加载中…')
    : '';
  applyAddedMarkers(); // 打开/翻页时都按"实时库状态"标注「已加入」（删除后可重新添加）
}

function setArtStatus(text, cls) {
  const el = $('artStatus');
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'art-status';
    return;
  }
  el.hidden = false;
  el.className = 'art-status' + (cls ? ' ' + cls : '');
  el.textContent = text;
}
/** 把 Node 的网络/证书错误翻译成人话 */
function friendlyNetError(msg) {
  const s = String(msg || '');
  if (/self[- ]?signed|DEPTH_ZERO|CERT_|UNABLE_TO_VERIFY/i.test(s)) {
    return T('证书校验失败（公司代理/自签证书）。可在 设置→SteamGridDB API 勾选「证书失败时回退」。');
  }
  if (/ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|超时|timeout/i.test(s)) {
    return T('网络连接失败或超时，请检查网络 / 代理后重试。');
  }
  return s || T('下载失败');
}

/* ---------------- 添加艺术图：队列化（可连点多张，串行下载，完成后统一刷新一次） ---------------- */
const artAdd = { queue: [], busy: false, okCount: 0, currentKey: null, pendingRender: false, statusToken: 0, pendingAdded: new Set() };

function artKeyOf(a) {
  return a && a.sgdb_id != null ? 'id:' + a.sgdb_id : 'url:' + ((a && a.url) || '');
}

/**
 * 当前选图器上下文（游戏 + 类型）里「库里已存在」的图的 key 集合。
 * ⚠️ 必须**实时查库**，不能用一个"记死的集合"——否则用户把图删掉后仍会被判为"已加入"（§10 #67）。
 */
function libraryAddedKeys() {
  const set = new Set();
  const art = state.art || {};
  const type = art.type;
  if (!type) return set;
  for (const g of state.games || []) {
    if (art.appid) {
      if (String(g.appid) !== String(art.appid)) continue;
    } else if (art.sgdbGameId) {
      if (String(g.sgdb_id || '') !== String(art.sgdbGameId)) continue;
    } else {
      continue;
    }
    for (const it of (g.art && g.art[type]) || []) set.add(artKeyOf(it));
  }
  return set;
}

/** 按"实时库状态"给已缓存的单元格打上/去掉「已加入」标记（不重建单元格） */
function applyAddedMarkers() {
  const added = libraryAddedKeys();
  for (const k of artAdd.pendingAdded) added.add(k); // 刚添加、库还没刷新时先按"已加入"显示
  for (const [key, cell] of artCellCache) {
    const has = added.has(key);
    const tagged = cell.classList.contains('added');
    if (has && !tagged) {
      cell.classList.add('added');
      const tags = cell.querySelector('.art-tags');
      if (tags && !tags.querySelector('.tag-added')) {
        tags.insertAdjacentHTML('beforeend', `<span class="art-tag tag-added">${T('已加入')}</span>`);
      }
    } else if (!has && tagged) {
      cell.classList.remove('added');
      const t = cell.querySelector('.tag-added');
      if (t) t.remove();
    }
  }
}

/** 点图添加：入队（同一张重复点击会被忽略），状态条显示队列 */
function enqueueAddArt(a) {
  const key = artKeyOf(a);
  // 已加入库的判断**实时查库**（删除后即可重新添加）
  if (libraryAddedKeys().has(key)) {
    toast(T('这张图已加入库'));
    return;
  }
  if (artAdd.currentKey === key || artAdd.queue.some((x) => x.key === key)) {
    toast(T('这张图正在添加中…'));
    return;
  }
  // 关键：入队时就固定"加到哪里"的上下文；否则排队期间用户切了类型/游戏会加错地方
  const ctx = { appid: state.art.appid, name: state.art.name, sgdbGameId: state.art.sgdbGameId, type: state.art.type };
  artAdd.queue.push({ a, key, ctx });
  setArtStatus(TP('正在下载，请稍等…（队列 {0}）', artAdd.queue.length), 'busy');
  pumpAddQueue();
}

async function pumpAddQueue() {
  if (artAdd.busy) return;
  artAdd.busy = true;
  try {
    while (artAdd.queue.length) {
      const item = artAdd.queue[0];
      artAdd.currentKey = item.key;
      setArtStatus(TP('正在下载，请稍等…（队列 {0}）', artAdd.queue.length), 'busy');
      const ok = await doAddArt(item.a, item.ctx);
      if (ok) {
        artAdd.pendingAdded.add(item.key); // 立即给反馈；库刷新后以库为准
        applyAddedMarkers();
      }
      artAdd.queue.shift();
      artAdd.currentKey = null;
      if (ok) artAdd.okCount++;
    }
  } finally {
    artAdd.busy = false;
    if (artAdd.okCount > 0) {
      const token = ++artAdd.statusToken;
      setArtStatus(TP('已加入库（{0} 张）', artAdd.okCount), 'ok');
      setTimeout(() => {
        if (artAdd.statusToken === token) setArtStatus('');
      }, 1800);
    }
    artAdd.okCount = 0;
    await refreshAfterAdds();
  }
}

/** 真正执行一次添加（ctx 是入队时固定的上下文）；返回是否成功 */
async function doAddArt(a, ctx) {
  ctx = ctx || { appid: state.art.appid, name: state.art.name, sgdbGameId: state.art.sgdbGameId, type: state.art.type };
  try {
    let appid = ctx.appid;
    if (appid) {
      await post('/api/library/add', { appid, name: ctx.name, sgdbGameId: ctx.sgdbGameId });
    } else {
      const r = await post('/api/library/add', { name: ctx.name, sgdbGameId: ctx.sgdbGameId });
      if (!r.appid) {
        setArtStatus(friendlyNetError(r.error), 'err');
        return false;
      }
      appid = r.appid;
      // 仅当选图器仍停在同一个 SGDB 游戏时，才把新 appid 写回（避免用户已切走）
      if (!state.art.appid && state.art.sgdbGameId === ctx.sgdbGameId) state.art.appid = appid;
    }
    const r = await post('/api/library/add-art', {
      appid,
      name: ctx.name,
      sgdbGameId: ctx.sgdbGameId,
      type: ctx.type,
      art: a,
    });
    if (!r.ok) {
      setArtStatus(friendlyNetError(r.error), 'err');
      return false;
    }
    return true;
  } catch (e) {
    setArtStatus(friendlyNetError(e && e.message), 'err');
    return false;
  }
}

/** 添加完成后刷新库数据；**若选图器还开着就延后渲染**，避免"边下边整页重建"造成卡顿 */
async function refreshAfterAdds() {
  let data;
  try {
    data = await api('/api/library');
  } catch (e) {
    return;
  }
  state.games = data.games || [];
  state.customOrders = data.customOrders || {};
  state.catMemberOrder = data.catMemberOrder || {};
  artAdd.pendingAdded.clear(); // 库已是最新，"待确认"集合清空（此后一切以库为准）
  const pickerOpen = $('artModal') && !$('artModal').hidden;
  if (pickerOpen) {
    applyAddedMarkers(); // 刷新「已加入」标记（新增/删除后都准确）
    artAdd.pendingRender = true; // 关掉选图器再渲染
    return;
  }
  render();
  // 仅当详情弹窗"本来就开着"时才刷新它（修：以前会莫名弹出详情页）
  if (state.detail && $('detailModal') && !$('detailModal').hidden) openDetail(state.detail.appid);
}

/**
 * 关闭弹窗后的收尾：
 *  - 详情弹窗已关闭 → 清空 state.detail；
 *  - 详情弹窗仍开着（例如刚关掉上面的"选图器"）→ **刷新详情页**（新加的图立刻出现），主页渲染继续延后；
 *  - 没有任何弹窗挡着且有挂起渲染 → 补一次主页渲染。
 */
/** 「已加入」标记统一由 applyAddedMarkers()（实时查库）负责，见上方定义。 */

function afterModalClose() {
  const detailOpen = $('detailModal') && !$('detailModal').hidden;
  if (!detailOpen) state.detail = null;
  if (detailOpen && state.detail) {
    openDetail(state.detail.appid); // 详情页立即反映刚添加的图
    return;
  }
  // 还有其它弹窗挡着就先别重建主页（避免在弹窗上"闪一下"）
  const anyModalOpen = !!document.querySelector('.modal:not([hidden])');
  if (artAdd.pendingRender && !anyModalOpen) {
    artAdd.pendingRender = false;
    render();
  }
}

async function syncNow() {
  await post('/api/library/import-all-defaults', {});
  pollSync();
}

function pollSync() {
  api('/api/library/import-progress')
    .then((p) => {
      const el = $('syncStatus');
      if (!el) return;
      if (p.running) {
        el.textContent = `${p.done}/${p.total}`;
        setTimeout(pollSync, 1200);
      } else {
        el.textContent = p.total ? T('完成') : '—';
        loadLibrary();
      }
    })
    .catch(() => {});
}

function pollNames(showHint) {
  api('/api/library/name-progress')
    .then((p) => {
      const el = $('nameStatus');
      if (el) el.textContent = p.running ? `${p.done}/${p.total}` : p.total ? T('完成') : '—';
      const h = $('nameFetchHint');
      if (h && showHint)
        h.textContent = p.running
          ? TP('进行中 {0}/{1}（已获取 {2}）', p.done, p.total, p.ok)
          : TP('完成：共 {0} 款，已获取中文名 {1} 个', p.total, p.ok);
      if (p.running) setTimeout(() => pollNames(showHint), 1500);
      else if (showHint) loadLibrary();
    })
    .catch(() => {});
}

function pollPreviews() {
  api('/api/library/preview-progress')
    .then((p) => {
      const h = $('previewFetchHint');
      if (h)
        h.textContent = p.running
          ? TP('补全中 {0}/{1}…', p.done, p.total)
          : p.total
          ? TP('完成：共 {0} 张，成功 {1} 张（其余未能匹配到预览）', p.total, p.ok)
          : T('没有需要补全的动图。');
      if (p.running) setTimeout(pollPreviews, 1500);
      else loadLibrary();
    })
    .catch(() => {});
}

/* ---------------- 同步到 Steam 库 ---------------- */

function syncTypesOf(g) {
  return TYPE_ORDER.filter((t) => g.hasSelected && g.hasSelected[t]);
}

async function requestApply(appid, titleText) {
  // 立即打开：列表直接来自浏览器已有的库数据，不做服务端预计算
  const status = await api('/api/status').catch(() => ({}));
  const base = appid ? state.games.filter((g) => String(g.appid) === String(appid)) : state.games;
  const list = base.filter((g) => g.syncable && syncTypesOf(g).length);
  state.applyList = { list, checked: new Set(list.map((g) => String(g.appid))) };
  $('applyTitle').textContent = titleText || T('同步到 Steam 库');
  $('applySub').textContent = `${T('勾选要同步的游戏（默认全选）；只同步你「当前选用」的图，覆盖前自动备份。共')}${list.length}${T('款可同步。')}`;
  const warn = $('applyWarn');
  if (status.steamRunning) {
    warn.hidden = false;
    warn.textContent = T('Steam 正在运行：可以直接同步（与 SGDBoop 相同）。封面若未立即刷新，重启一次 Steam 即可看到；图标（icon）必须重启 Steam 才会生效。');
  } else {
    warn.hidden = true;
  }
  $('applySearch').value = '';
  $('applyAll').checked = true;
  renderApplyList();
  applyI18n();
  $('applyModal').hidden = false;
}

function renderApplyList() {
  const q = $('applySearch').value.trim().toLowerCase();
  const box = $('applyBody');
  box.innerHTML = '';
  if (!state.applyList) return;
  const list = state.applyList.list.filter((g) => !q || (g.name || '').toLowerCase().includes(q) || String(g.appid).includes(q));
  if (!list.length) {
    box.innerHTML = `<div class="muted" style="padding:12px">${T('没有可同步的游戏。')}</div>`;
    return;
  }
  for (const g of list) {
    const row = document.createElement('label');
    row.className = 'pick-row cm-row apply-row';
    row.dataset.appid = String(g.appid);
    const checked = state.applyList.checked.has(String(g.appid));
    const cover = coverOf(g);
    const have = new Set(syncTypesOf(g));
    const types = TYPE_ORDER.map((t) => `<span class="tag b-${t}${have.has(t) ? '' : ' missing'}">${TYPE_LABELS[t] || t}</span>`).join('');
    row.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''} /><span class="cm-thumb">${cover ? `<img src="${cover.url}" alt="">` : ''}</span><span class="pick-name">${esc(displayName(g))}</span><span class="apply-types">${types}</span>`;
    const cb = row.querySelector('input');
    cb.addEventListener('change', () => {
      if (cb.checked) state.applyList.checked.add(String(g.appid));
      else state.applyList.checked.delete(String(g.appid));
    });
    box.appendChild(row);
  }
}

async function confirmApply() {
  const appids = Array.from(state.applyList ? state.applyList.checked : []);
  if (!appids.length) return toast(T('请先勾选要同步的游戏'), true);
  const btn = $('btnApplyConfirm');
  if (btn) btn.disabled = true;
  await post('/api/steam/apply-batch', { appids });
  pollApply();
}

/** 批量同步：后台任务进度（游戏多时不再"点一下等到天荒地老"） */
function pollApply() {
  api('/api/steam/apply-progress')
    .then((p) => {
      const btn = $('btnApplyConfirm');
      const warn = $('applyWarn');
      if (p.running) {
        if (btn) {
          btn.disabled = true;
          btn.textContent = TP('同步中 {0}/{1}…', p.done, p.total);
        }
        if (warn) {
          warn.hidden = false;
          warn.textContent = TP('正在同步：已完成 {0}/{1}…', p.done, p.total);
        }
        setTimeout(pollApply, 700);
        return;
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = T('确认同步');
      }
      if (warn) warn.hidden = true;
      if (!p.total) return;
      const tail = p.steamRunning ? T('（若未刷新，请重启 Steam）') : '';
      toast(TP('完成：{0}/{1} 款游戏已同步{2}', p.ok, p.total, tail));
      $('applyModal').hidden = true;
    })
    .catch(() => {
      const btn = $('btnApplyConfirm');
      if (btn) {
        btn.disabled = false;
        btn.textContent = T('确认同步');
      }
    });
}

/* ---------------- 设置 ---------------- */

function applyUi(ui) {
  ui = ui || {};
  document.body.dataset.theme = ui.theme || 'dark';
  document.body.dataset.accent = ui.accent || 'cyan';
  document.body.dataset.grid = ui.gridSize || 'medium';
  state.ui = ui;
  // 语言是全局偏好（localStorage）；主题/强调色/卡片大小按库。
  let lsLang = null;
  try {
    lsLang = localStorage.getItem('gal.lang');
  } catch (e) {
    /* ignore */
  }
  if (!lsLang) {
    lsLang = ui.lang || 'zh';
    try {
      localStorage.setItem('gal.lang', lsLang);
    } catch (e) {
      /* ignore */
    }
  }
  state.ui.lang = lsLang;
  state.sortMode = ui.sort || 'added';
  syncSettingsControls(state.ui);
  syncSortUi();
  applyI18n();
}

/** 同步"排序"控件（下拉 + 自定义提示） */
const SORT_LABELS = { added: '添加时间', name: '名称', custom: '自定义' };
function syncSortUi() {
  const label = $('sortDdLabel');
  if (label) label.textContent = T(SORT_LABELS[state.sortMode] || '添加时间');
  document.querySelectorAll('#sortDdMenu .dd-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.value === state.sortMode);
    if (b.dataset.value === 'custom') b.classList.toggle('disabled', isSearchActive());
  });
  if (state.sortMode !== 'custom' && state.selectedCards && state.selectedCards.size) {
    state.selectedCards.clear();
    setCardSelection();
  }
  updateSortHint();
}

function syncSettingsControls(ui) {
  ui = ui || {};
  const lang = $('setLang');
  const gl = $('setGameLang');
  const gs = $('setGridSize');
  const ac = $('setAnimCovers');
  if (lang) lang.value = ui.lang || 'zh';
  if (gl) gl.value = ui.gameLang || 'zh';
  if (gs) gs.value = ui.gridSize || 'medium';
  if (ac) ac.value = ui.animCovers || 'auto';
  document.querySelectorAll('#setTheme button').forEach((b) => b.classList.toggle('active', b.dataset.value === (ui.theme || 'dark')));
  document.querySelectorAll('#setAccent .swatch').forEach((b) => b.classList.toggle('active', b.dataset.value === (ui.accent || 'cyan')));
}

async function saveUi(patch) {
  const r = await post('/api/settings', { ui: patch });
  applyUi(r.ui);
  render();
  // 仅当详情弹窗本来就开着时，才刷新它（避免切主题时误弹出详情）
  if (state.detail && !$('detailModal').hidden) openDetail(state.detail.appid);
}

function switchSettingsTab(name) {
  state.settingsTab = name;
  document.querySelectorAll('#settingsNav .snav').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.spanel').forEach((p) => (p.hidden = p.dataset.panel !== name));
  // 切到子页时自动展开所属分组（"绑定与账号"）
  const sub = document.querySelector('.snav-sub[data-group="accounts"]');
  const grp = document.querySelector('.snav.group[data-group="accounts"]');
  if (sub && grp && (name === 'sgdb' || name === 'steam')) {
    sub.hidden = false;
    grp.classList.add('open');
  }
}

function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return n.toFixed(i === 0 ? 0 : 1) + ' ' + u[i];
}

async function loadStorage() {
  try {
    const s = await api('/api/storage');
    const el = $('storageInfo');
    if (el)
      el.textContent =
        T('默认图缓存') + ' ' + fmtBytes(s.cacheBytes) + ' · ' + T('备份') + ' ' + fmtBytes(s.backupBytes) + ' · ' + T('临时') + ' ' + fmtBytes(s.tmpBytes) + (s.dataDir ? T('（数据目录：') + s.dataDir + '）' : '');
  } catch (e) {
    /* ignore */
  }
}

async function openSettings(tab) {
  const s = await api('/api/status');
  $('dbFile').textContent = s.dbFile;
  if ($('aboutVersion')) $('aboutVersion').textContent = s.version || '—';
  if ($('aboutRuntime') && s.runtime) $('aboutRuntime').textContent = 'Node ' + s.runtime.node + (s.runtime.electron ? ' · Electron ' + s.runtime.electron : '');
  if ($('aboutAuthor')) {
    $('aboutAuthor').textContent = ABOUT_AUTHOR;
    $('aboutAuthor').href = 'https://github.com/' + ABOUT_AUTHOR;
  }
  if ($('aboutHome')) $('aboutHome').href = ABOUT_URL;
  if ($('aboutReleases')) $('aboutReleases').href = ABOUT_URL + '/releases/latest';
  if ($('aboutLicense')) $('aboutLicense').textContent = ABOUT_LICENSE;
  if ($('setSteamPath')) $('setSteamPath').textContent = (s.steamPaths || []).join('  |  ') || T('未检测到 Steam');
  if ($('dbSize')) $('dbSize').textContent = fmtBytes(s.dbSize);
  if ($('vacuumHint')) $('vacuumHint').textContent = '';
  const st = await api('/api/settings');
  applyUi(st.ui);
  $('apiKey').value = '';
  $('apiKey').placeholder = st.hasApiKey ? T('已保存：') + st.apiKeyMasked + T('（留空则不修改）') : T('粘贴 SteamGridDB API Key');
  $('sgdbState').textContent = st.hasApiKey ? '· ' + T('已绑定') + ' ' + st.apiKeyMasked : '· ' + T('未绑定');
  if ($('allowInsecureTLS')) $('allowInsecureTLS').checked = st.allowInsecureTls !== false;
  const acc = await loadSteamAccount();
  const local = (acc.localUsers || [])[0];
  $('steamId').value = local ? local.steamId64 : '';
  $('steamKey').value = '';
  $('steamAcctCount').textContent = acc.accounts && acc.accounts.length ? '· ' + acc.accounts.length + ' ' + T('个账号') : '';
  $('steamBindStatus').innerHTML =
    (acc.accounts && acc.accounts.length)
      ? `${T('已绑定')} ${acc.accounts.length} ${T('个账号，共')} ${acc.ownedCount} ${T('款游戏')}`
      : local
      ? `${T('检测到本机账号：')}<b>${esc(local.persona || local.steamId64)}</b>${T('（已自动填入 SteamID），只需粘贴 API Key')}`
      : T('未绑定');
  switchSettingsTab(tab || 'general');
  // .gameart 文件关联状态
  try {
    const a = await api('/api/assoc/status');
    const el = $('assocStatus');
    if (el) el.textContent = !a.supported ? T('（当前系统不支持）') : a.registered ? T('已关联 ✔') : T('未关联');
    // 「创建桌面快捷方式」只在 Linux（有 desktopFile 信息）时出现
    if ($('btnMakeShortcut')) $('btnMakeShortcut').hidden = !(a.supported && a.desktopFile);
  } catch (e) {
    /* ignore */
  }
  loadStorage();
  $('settingsModal').hidden = false;
  applyI18n();
}

async function loadSteamAccount() {
  const acc = await api('/api/steam/account');
  const accounts = acc.accounts || [];
  const box = $('steamAccountInfo');
  if (accounts.length) {
    box.innerHTML = accounts.map((a) => `<div class="sub">👤 <b>${esc(a.persona || a.steam_id64)}</b> · ${a.ownedCount} ${T('款')}</div>`).join('');
  } else {
    box.innerHTML = `<div class="sub">${T('未绑定 Steam 账号')}<br>${T('（绑定后才能从 Steam 库添加）')}</div>`;
  }
  renderSteamAccounts(acc);
  return acc;
}

function renderSteamAccounts(acc) {
  const list = $('steamAccounts');
  if (!list) return;
  const accounts = acc.accounts || [];
  if (!accounts.length) {
    list.innerHTML = `<div class="hint">${T('尚未绑定任何账号')}</div>`;
  } else {
    list.innerHTML = accounts
      .map(
        (a) => `<div class="acct-item">
        ${a.avatar ? `<img class="avatar" src="${esc(a.avatar)}" alt="" onerror="this.style.visibility='hidden'">` : ''}
        <div class="grow"><div class="who">${esc(a.persona || a.steam_id64)}</div><div class="sub">${esc(a.steam_id64)} · ${T('拥有')} ${a.ownedCount} ${T('款')}</div></div>
        <button class="btn danger" data-unbind="${esc(a.steam_id64)}">解绑</button>
      </div>`
      )
      .join('');
    list.querySelectorAll('button[data-unbind]').forEach((b) =>
      b.addEventListener('click', async () => {
        await post('/api/steam/unbind', { steamId64: b.dataset.unbind });
        toast(T('已解绑该账号'));
        await loadSteamAccount();
      })
    );
  }
  const dl = $('localUserList');
  if (dl) {
    dl.innerHTML = (acc.localUsers || [])
      .map((u) => `<option value="${esc(u.steamId64)}">${esc(u.persona || '')} (${esc(u.accountName || '')})</option>`)
      .join('');
  }
}

/* ---------------- 事件绑定 ---------------- */

function bind() {
  // 欢迎页（选择/新建 .gameart）
  $('btnWsOpen').addEventListener('click', async () => {
    const r = await post('/api/workspace/pick', {});
    if (r.ok) await enterApp();
    else if (!r.canceled) wsErr(r.error || T('打开失败'));
  });
  $('btnWsNew').addEventListener('click', async () => {
    const r = await post('/api/workspace/new', {});
    if (r.ok) await enterApp();
    else if (!r.canceled) wsErr(r.error || T('新建失败'));
  });
  // 欢迎页：中/英切换
  $('wsLang').addEventListener('click', () => {
    const next = ((state.ui && state.ui.lang) || 'zh') === 'en' ? 'zh' : 'en';
    state.ui = state.ui || {};
    state.ui.lang = next;
    try {
      localStorage.setItem('gal.lang', next);
    } catch (e) {
      /* ignore */
    }
    refreshDynamicI18n();
  });

  $('btnSwitchLib').addEventListener('click', async () => {
    await post('/api/workspace/close', {});
    $('settingsModal').hidden = true;
    const ws = await api('/api/workspace').catch(() => ({ recent: [] }));
    showWelcome(ws.recent || []);
  });

  // .gameart 文件关联
  $('btnAssocReg').addEventListener('click', async () => {
    const r = await post('/api/assoc/register', {});
    if (r.ok) {
      toast(T('已关联 .gameart 文件'));
      if ($('assocStatus')) $('assocStatus').textContent = T('已关联 ✔');
      if (r.warning && $('assocStatus')) $('assocStatus').textContent += ' · ' + r.warning;
    } else toast(r.error || T('关联失败'), true);
  });
  $('btnAssocUnreg').addEventListener('click', async () => {
    const r = await post('/api/assoc/unregister', {});
    if (r.ok) {
      toast(T('已取消关联'));
      if ($('assocStatus')) $('assocStatus').textContent = T('未关联');
      if (r.warning && $('assocStatus')) $('assocStatus').textContent += ' · ' + r.warning;
      if ($('btnMakeShortcut')) $('btnMakeShortcut').hidden = true;
    } else toast(r.error || T('取消失败'), true);
  });
  $('btnMakeShortcut').addEventListener('click', async () => {
    const r = await post('/api/assoc/shortcut', {});
    if (r.ok) toast(T('已创建桌面快捷方式：') + (r.path || ''));
    else toast(r.error || T('创建失败'), true);
  });

  // 补全默认图（后台；中途关掉软件下次打开会自动继续）
  $('btnFillDefaults').addEventListener('click', async () => {
    await syncNow();
    toast(T('已开始补全默认图（后台进行，可随时关闭软件）'));
  });

  // 存储清理
  async function doStorageClean(target, label) {
    const r = await post('/api/storage/clean', { target });
    if (r.ok) {
      toast(TP('已清理 {0}', label));
      loadStorage();
    } else toast(T('清理失败'), true);
  }
  $('btnCleanCache').addEventListener('click', () => doStorageClean('cache', T('默认图缓存')));
  $('btnCleanBackups').addEventListener('click', () => doStorageClean('backups', T('备份')));
  $('btnCleanTmp').addEventListener('click', () => doStorageClean('tmp', T('临时文件')));

  $('btnAdd').addEventListener('click', openManual);
  $('btnSearchAdd').addEventListener('click', () => openAdd());
  $('btnManual2').addEventListener('click', openManual);
  $('obSteam').addEventListener('click', () => openSettings('steam'));
  $('obSgdb').addEventListener('click', () => openSettings('sgdb'));
  $('btnSearchAdd2').addEventListener('click', () => openAdd());
  $('btnManualSave').addEventListener('click', saveManual);
  $('btnSync').addEventListener('click', openSync);
  $('btnSync2').addEventListener('click', openSync);
  $('btnSettings').addEventListener('click', openSettings);
  $('btnRecycle').addEventListener('click', openRecycle);

  $('syncSearch').addEventListener('input', renderSyncList);
  $('syncAll').addEventListener('change', (e) => {
    document.querySelectorAll('#syncList .pick-row input:not([disabled])').forEach((cb) => {
      cb.checked = e.target.checked;
      const name = cb.closest('.pick-row');
      const appid = name.querySelector('.pick-meta').textContent.replace(/^(?:非 Steam · |Non-Steam · )/, '');
      if (e.target.checked) state.sync.selected.add(appid);
      else state.sync.selected.delete(appid);
    });
  });
  $('btnSyncImport').addEventListener('click', doSyncImport);
  $('btnSyncRefresh').addEventListener('click', () => refreshOwned(false));

  $('btnAddSearch').addEventListener('click', doAddSearch);
  $('addSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAddSearch();
  });
  $('btnArtSearch').addEventListener('click', doArtSearch);
  $('artSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doArtSearch();
  });

  // SGDB 选图：类型/附加过滤 + 分页加载
  ['afStatic', 'afAnimated', 'afHumor', 'afNsfw', 'afEpilepsy'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', () => {
      // 静态 / 动图 必须至少选一个（官网规则：类型不能都不选）
      if ((id === 'afStatic' || id === 'afAnimated') && !$('afStatic').checked && !$('afAnimated').checked) {
        el.checked = true;
        toast(T('「静态 / 动图」至少选择一个'), true);
      }
      state.art.filters = artFiltersFromCheckboxes();
      loadArt(true);
    });
  });
  $('btnArtMore').addEventListener('click', () => loadArt(false));
  $('artGrid').addEventListener('scroll', () => {
    const g = $('artGrid');
    if (!state.art.hasMore || state.art.loading) return;
    if (g.scrollTop + g.clientHeight >= g.scrollHeight - 140) loadArt(false);
  });

  $('btnSaveKey').addEventListener('click', async () => {
    const v = $('apiKey').value.trim();
    if (!v) return toast(T('请输入 API Key'), true);
    await post('/api/settings', { apiKey: v });
    const st = await api('/api/settings');
    $('sgdbState').textContent = '· ' + T('已绑定') + ' ' + st.apiKeyMasked;
    $('apiKey').value = '';
    toast(T('已保存 SteamGridDB Key'));
  });

  $('btnClearKey').addEventListener('click', async () => {
    if (!(await uiConfirm({ title: T('解绑 SteamGridDB'), message: T('确定解绑 SteamGridDB API Key？'), danger: true, okText: T('解绑') }))) return;
    await post('/api/settings', { apiKey: '' });
    $('sgdbState').textContent = '· ' + T('未绑定');
    $('apiKey').placeholder = T('粘贴 SteamGridDB API Key');
    toast(T('已解绑 SteamGridDB'));
  });
  $('allowInsecureTLS').addEventListener('change', async () => {
    await post('/api/settings', { allowInsecureTls: $('allowInsecureTLS').checked });
  });

  // 设置页：分类导航 + 个性化控件
  document.querySelectorAll('#settingsNav .snav[data-tab]').forEach((b) =>
    b.addEventListener('click', () => switchSettingsTab(b.dataset.tab))
  );
  document.querySelectorAll('#settingsNav .snav.group').forEach((b) =>
    b.addEventListener('click', () => {
      const sub = document.querySelector('.snav-sub[data-group="' + b.dataset.group + '"]');
      if (sub) {
        sub.hidden = !sub.hidden;
        b.classList.toggle('open', !sub.hidden);
      }
    })
  );
  $('setGridSize').addEventListener('change', () => saveUi({ gridSize: $('setGridSize').value }));
  $('setLang').addEventListener('change', () => {
    const v = $('setLang').value;
    try {
      localStorage.setItem('gal.lang', v);
    } catch (e) {
      /* ignore */
    }
    state.ui = state.ui || {};
    state.ui.lang = v;
    refreshDynamicI18n();
    saveUi({ lang: v });
  });
  $('setGameLang').addEventListener('change', () => saveUi({ gameLang: $('setGameLang').value }));
  $('setAnimCovers').addEventListener('change', () => {
    saveUi({ animCovers: $('setAnimCovers').value });
    scheduleCoverAnim(); // 立即按新策略重算（无需重渲染）
  });
  $('btnFetchNames').addEventListener('click', async () => {
    $('nameFetchHint').textContent = T('拉取中…');
    await post('/api/library/fetch-names', {});
    pollNames(true);
  });
  $('btnFetchPreviews').addEventListener('click', async () => {
    const h = $('previewFetchHint');
    h.textContent = T('补全中…');
    await post('/api/library/fetch-previews', {});
    pollPreviews();
  });
  document.querySelectorAll('#setTheme button').forEach((b) =>
    b.addEventListener('click', () => saveUi({ theme: b.dataset.value }))
  );
  document.querySelectorAll('#setAccent .swatch').forEach((b) =>
    b.addEventListener('click', () => saveUi({ accent: b.dataset.value }))
  );

  $('btnBindSteam').addEventListener('click', async () => {
    const steamId = $('steamId').value.trim();
    const apiKey = $('steamKey').value.trim();
    if (!apiKey) return toast(T('请填写 Steam Web API Key'), true);
    $('steamBindStatus').textContent = T('绑定中…');
    const r = await post('/api/steam/bind', { steamId, apiKey });
    if (r.ok) {
      $('steamBindStatus').innerHTML = TP(
        '绑定成功：{0} · 该账号 {1} 款，合计 {2} 款',
        '<b>' + esc(r.persona || r.steamId64) + '</b>',
        r.ownedCount,
        r.totalOwned
      );
      if (r.warning) toast(r.warning, true);
      else toast(TP('绑定成功（拥有 {0} 款）——请到「从 Steam 库添加」手动选择要导入的游戏', r.ownedCount));
      await loadSteamAccount();
    } else {
      $('steamBindStatus').textContent = TP('失败：{0}', r.error);
      toast(r.error || T('绑定失败'), true);
    }
  });

  $('btnUnbindSteam').addEventListener('click', async () => {
    if (!(await uiConfirm({ title: T('解绑全部账号'), message: T('解绑全部 Steam 账号？（不影响 Steam 本身）'), danger: true, okText: T('全部解绑') }))) return;
    await post('/api/steam/unbind', {});
    $('steamBindStatus').textContent = T('已全部解绑');
    await loadSteamAccount();
    toast(T('已全部解绑'));
  });

  $('btnApplyOne').addEventListener('click', () => {
    const g = state.detail;
    if (!g) return;
    if (!g.syncable) {
      return toast(g.is_non_steam ? T('非 Steam 游戏，无法同步到 Steam 库') : T('Steam App ID 无效，无法同步到 Steam 库'), true);
    }
    requestApply(g.appid, T('同步到 Steam 库') + ' · ' + displayName(g));
  });
  $('btnApplyAll').addEventListener('click', () => requestApply(null, T('同步到 Steam 库')));

  // 添加方式 / 裁切
  $('choiceSgdb').addEventListener('click', choiceSgdbFlow);
  $('choiceImport').addEventListener('click', choiceImportFlow);
  $('btnCropSave').addEventListener('click', saveCrop);
  $('btnCropReset').addEventListener('click', () => {
    if (!state.crop) return;
    state.crop.zoom = 1;
    $('cropZoom').value = 1;
    initCropStage();
  });
  $('cropZoom').addEventListener('input', () => {
    if (!state.crop) return;
    onCropZoom(Number($('cropZoom').value));
  });
  (function () {
    const stage = $('cropStage');
    let dragging = false;
    let sx0 = 0;
    let sy0 = 0;
    let tx0 = 0;
    let ty0 = 0;
    stage.addEventListener('pointerdown', (e) => {
      if (!state.crop) return;
      dragging = true;
      sx0 = e.clientX;
      sy0 = e.clientY;
      tx0 = state.crop.tx;
      ty0 = state.crop.ty;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging || !state.crop) return;
      state.crop.tx = tx0 + (e.clientX - sx0);
      state.crop.ty = ty0 + (e.clientY - sy0);
      applyCropTransform();
    });
    const end = (e) => {
      dragging = false;
      try {
        stage.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', () => {
      dragging = false;
    });
  })();
  $('btnApplyConfirm').addEventListener('click', confirmApply);
  $('applySearch').addEventListener('input', renderApplyList);
  $('applyAll').addEventListener('change', (e) => {
    document.querySelectorAll('#applyBody .pick-row').forEach((row) => {
      const cb = row.querySelector('input');
      if (cb) cb.checked = e.target.checked;
      const appid = row.dataset.appid;
      if (!appid || !state.applyList) return;
      if (e.target.checked) state.applyList.checked.add(appid);
      else state.applyList.checked.delete(appid);
    });
  });
  $('btnRemoveGame').addEventListener('click', async () => {
    const g = state.detail;
    if (!g) return;
    if (!(await uiConfirm({ title: T('移入回收站'), message: TP('把「{0}」移入回收站？（可在回收站恢复；不会影响 Steam）', g.name || g.appid), danger: true, okText: T('移入回收站') }))) return;
    await post('/api/library/remove', { appid: g.appid });
    $('detailModal').hidden = true;
    await loadLibrary();
    updateRecycleCount();
    toast(T('已移入回收站'));
  });

  document.querySelectorAll('[data-close]').forEach((b) => {
    b.addEventListener('click', () => {
      $(b.dataset.close).hidden = true;
      afterModalClose();
    });
  });
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) {
        m.hidden = true;
        afterModalClose();
      }
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal').forEach((m) => (m.hidden = true));
      afterModalClose();
    }
  });

  let searchTimer = 0;
  $('search').addEventListener('input', (e) => {
    state.search = e.target.value;
    syncSortUi(); // 搜索时：禁用"自定义"项 + 提示不能拖拽
    // 防抖：输入时不立刻重建整片网格（游戏多时明显更顺滑）
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 140);
  });
  $('sortDdBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const m = $('sortDdMenu');
    m.hidden = !m.hidden;
  });
  document.querySelectorAll('#sortDdMenu .dd-item').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.value;
      $('sortDdMenu').hidden = true;
      if (v === 'custom' && isSearchActive()) {
        toast(T('搜索状态下不能使用自定义排序，请先清空搜索。'), true);
        return;
      }
      if (v === state.sortMode) return;
      state.sortMode = v;
      syncSortUi();
      render();
      if (v === 'custom') toast(T('自定义排序：按住鼠标左键拖动游戏封面即可排序（类似手机相册）。按住 Ctrl 点击可多选，再一起拖动。'));
      saveUi({ sort: v });
    })
  );
  document.addEventListener('click', (e) => {
    const dd = $('sortDd');
    if (dd && !dd.contains(e.target)) $('sortDdMenu').hidden = true;
  });
  $('grid').addEventListener('click', (e) => {
    if (e.target === $('grid') && state.selectedCards.size) {
      state.selectedCards.clear();
      setCardSelection();
    }
  });
  $('catList').addEventListener('click', async (e) => {
    const del = e.target.closest('.cat-del');
    const ren = e.target.closest('.cat-ren');
    if (del) {
      const id = del.closest('.chip').dataset.cat;
      const cat = state.categories.find((c) => String(c.id) === id);
      if (!(await uiConfirm({ title: T('删除分类'), message: TP('删除分类「{0}」？不会删除里面的游戏；游戏仍会显示在“全部游戏”里。', cat ? cat.name : ''), danger: true, okText: T('删除') }))) return;
      await post('/api/categories/remove', { id: Number(id) });
      if (String(state.catFilter) === id) state.catFilter = 'all';
      await loadCategories();
      render();
      return;
    }
    if (ren) {
      const id = ren.closest('.chip').dataset.cat;
      openCatMenu(Number(id), ren);
      return;
    }
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.catFilter = chip.dataset.cat;
    renderCats();
    render();
  });
  $('btnNewCat').addEventListener('click', async () => {
    const name = await uiPrompt({ title: T('新建分类'), label: T('分类名称'), placeholder: T('如 RPG / FPS / MOBA') });
    if (!name || !name.trim()) return;
    await post('/api/categories', { name: name.trim() });
    await loadCategories();
  });
  $('catMenuRename').addEventListener('click', async () => {
    $('catMenu').hidden = true;
    const id = state.catMenuId;
    const cat = state.categories.find((c) => String(c.id) === String(id));
    const name = await uiPrompt({ title: T('重命名分类'), label: T('新名称'), value: cat ? cat.name : '' });
    if (name && name.trim()) {
      await post('/api/categories/rename', { id: Number(id), name: name.trim() });
      await loadCategories();
    }
  });
  $('catMenuManage').addEventListener('click', () => {
    $('catMenu').hidden = true;
    openCatManage(state.catMenuId);
  });
  $('cardMenuGroups').addEventListener('click', () => {
    $('cardMenu').hidden = true;
    if (state.cardMenuGame) openGameGroups(state.cardMenuGame);
  });
  $('cardMenuAppid').addEventListener('click', () => {
    $('cardMenu').hidden = true;
    if (state.cardMenuGame) editAppId(state.cardMenuGame);
  });
  $('cardMenuDelete').addEventListener('click', async () => {
    $('cardMenu').hidden = true;
    const g = state.cardMenuGame;
    if (!g) return;
    if (!(await uiConfirm({ title: T('移入回收站'), message: TP('把「{0}」移入回收站？（可在回收站恢复；不会影响 Steam）', displayName(g)), danger: true, okText: T('移入回收站') }))) return;
    await post('/api/library/remove', { appid: g.appid });
    await loadLibrary();
    updateRecycleCount();
    toast(T('已移入回收站'));
  });
  $('btnGameGroupsSave').addEventListener('click', async () => {
    const g = state.cardMenuGame;
    if (!g) return;
    const ids = Array.from(document.querySelectorAll('#gameGroupsList input:checked')).map((cb) => Number(cb.dataset.cid));
    await post('/api/library/set-categories', { appid: g.appid, ids });
    $('gameGroupsModal').hidden = true;
    await loadLibrary();
    await loadCategories();
    toast(T('分组已保存'));
  });
  document.addEventListener('click', (e) => {
    const cm = $('cardMenu');
    if (cm && !cm.hidden && !cm.contains(e.target)) cm.hidden = true;
  });
  document.addEventListener('click', (e) => {
    const m = $('catMenu');
    if (!m || m.hidden) return;
    if (m.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.cat-ren')) return;
    m.hidden = true;
  });
  $('catManageSearch').addEventListener('input', renderCatManage);
  $('catManageAll').addEventListener('change', (e) => {
    document.querySelectorAll('#catManageList .pick-row input').forEach((cb) => {
      cb.checked = e.target.checked;
      const appid = cb.closest('.pick-row').querySelector('.pick-meta').textContent;
      if (e.target.checked) state.catManage.checked.add(appid);
      else state.catManage.checked.delete(appid);
    });
  });
  $('btnCatManageSave').addEventListener('click', async () => {
    if (!state.catManage) return;
    await post('/api/categories/set-games', { id: state.catManage.id, appids: Array.from(state.catManage.checked) });
    $('catManageModal').hidden = true;
    await loadLibrary(); // 刷新游戏数据（categories 才会更新）
    await loadCategories();
    toast(T('已保存分类'));
  });
}

/* ---------------- 启动 ---------------- */

async function enterApp() {
  $('welcome').hidden = true;
  $('appRoot').hidden = false;
  const s = await api('/api/status');
  if (s && s.needWorkspace) {
    showWelcome([]);
    return;
  }
  const st = await api('/api/settings');
  applyUi(st.ui);
  await loadSteamAccount();
  await loadLibrary();
  await loadCategories();
  updateRecycleCount();
  pollSync(); // 默认图同步进度
  pollNames(false); // 中文名进度
}

function wsErr(msg) {
  const e = $('wsError');
  e.hidden = false;
  e.textContent = msg;
}

function showWelcome(recent) {
  $('appRoot').hidden = true;
  $('welcome').hidden = false;
  const wrap = $('wsRecentWrap');
  const box = $('wsRecent');
  box.innerHTML = '';
  if (recent && recent.length) {
    wrap.hidden = false;
    for (const p of recent) {
      const row = document.createElement('button');
      row.className = 'ws-recent-row';
      row.textContent = String(p).replace(/^.*[\\/]/, ''); // 只显示文件名
      row.title = p; // 悬停显示完整路径
      row.addEventListener('click', () => wsOpenPath(p));
      box.appendChild(row);
    }
  } else {
    wrap.hidden = true;
  }
  $('wsError').hidden = true;
}

async function wsOpenPath(p) {
  const r = await post('/api/workspace/open', { path: p });
  if (r.ok) await enterApp();
  else wsErr(r.error || T('打开失败'));
}

async function boot() {
  bind();
  applyUi({}); // 先用本地记忆的语言/主题渲染（欢迎页也能中英切换）
  const ws = await api('/api/workspace').catch(() => ({ hasCurrent: false, recent: [] }));
  if (ws.hasCurrent) await enterApp();
  else showWelcome(ws.recent || []);
}

boot().catch((e) => {
  const el = document.getElementById('welcome');
  if (el) el.hidden = false;
  console.error(e);
});
