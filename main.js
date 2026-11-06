const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createGuard } = require('./lib/path-guard');

const FILE_FILTERS = [
  { name: '所有支持的文件', extensions: ['md', 'markdown', 'txt', 'java', 'sql', 'json', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx', 'mjs', 'py', 'c', 'cpp', 'cc', 'h', 'hpp', 'log', 'ini', 'cfg', 'conf', 'bat', 'sh', 'yml', 'yaml', 'toml', 'properties', 'csv'] },
  { name: 'Markdown 文档', extensions: ['md', 'markdown'] },
  { name: '所有文件', extensions: ['*'] }
];
let win = null;
let isDirty = false;
let forceClose = false;
let closePrompting = false;

// 调试开关：默认关闭（生产环境不写日志、不转发渲染层 console）
// 启动方式：QingMo.exe --qingmo-debug，或设环境变量 QINGMO_DEBUG=1
// 注意不能叫 --debug：Electron 会把它当 Node 选项，直接报 DEP0062 并拒绝启动
const DEBUG = process.argv.indexOf('--qingmo-debug') >= 0 || process.env.QINGMO_DEBUG === '1';

/* ---------- 受信任路径范围 ----------
   渲染层通过 IPC 传来的路径一律先过这道闸：只允许用户显式打开过的目录（含子目录）
   与 userData（草稿/历史版本）。白名单持久化到 userData/trusted-roots.json，
   否则重启后会话恢复读不到上次打开的文件。 */
const guard = createGuard(process.platform);
const rootsFile = () => path.join(app.getPath('userData'), 'trusted-roots.json');
function loadTrustedRoots() {
  guard.add(app.getPath('userData'));       // 草稿、历史版本、窗口状态都在这里
  try { guard.load(JSON.parse(fs.readFileSync(rootsFile(), 'utf8'))); } catch (e) { /* 首次运行为空 */ }
}
function rememberRoot(fileOrDir) {
  if (!fileOrDir) return;
  let dir = fileOrDir;
  try { if (!fs.statSync(fileOrDir).isDirectory()) dir = path.dirname(fileOrDir); } catch (e) { return; }
  if (!guard.add(dir)) return;
  // 立即落盘（文件很小、事件也很稀疏）：延迟写会丢“刚打开就退出”的目录，
  // 下次启动的会话恢复就读不到那个文件了
  try { fs.writeFileSync(rootsFile(), JSON.stringify(guard.list())); } catch (e) { /* ignore */ }
}
const DENIED = Object.freeze({ error: '拒绝访问：该路径不在受信任的打开目录内' });

let iconv = null;   // 懒加载：仅写回非 UTF-8 编码时需要
function decodeBuffer(buf) {
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return { content: buf.slice(2).toString('utf16le'), enc: 'utf-16le' };
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return { content: buf.slice(3).toString('utf8'), enc: 'utf-8' };
  try { return { content: new TextDecoder('utf-8', { fatal: true }).decode(buf), enc: 'utf-8' }; }
  catch (e) {
    try {
      if (!iconv) iconv = require('iconv-lite');
      return { content: iconv.decode(buf, 'gbk'), enc: 'gbk' };
    } catch (e2) { return { content: buf.toString('latin1'), enc: 'latin1' }; }
  }
}
function encodeText(text, enc) {
  if (enc === 'gbk') {
    if (!iconv) iconv = require('iconv-lite');
    return iconv.encode(text, 'gbk');
  }
  if (enc === 'utf-16le') return Buffer.from(text, 'utf16le');
  return Buffer.from(text, 'utf8');
}

const fsp = fs.promises;
function statOf(p) { try { const st = fs.statSync(p); return { mtimeMs: st.mtimeMs, size: st.size }; } catch (e) { return null; } }
// 原子写：先写同目录临时文件再改名，避免写一半崩溃/断电损坏原文件
// 必须先 fsync 再 rename：否则改名可能先落盘、数据还在页缓存，断电会留下空/截断文件
async function atomicWrite(p, data) {
  const tmp = p + '.tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  let fh = null;
  try {
    fh = await fsp.open(tmp, 'w');
    await fh.writeFile(data);
    await fh.sync();
    await fh.close(); fh = null;
    await fsp.rename(tmp, p);
  } catch (e) {
    if (fh) { try { await fh.close(); } catch (e3) { /* ignore */ } }
    try { await fsp.unlink(tmp); } catch (e2) { /* ignore */ }
    throw e;
  }
}

// 单实例：重复启动时聚焦已有窗口，并把命令行里的文件转给它打开
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); } else {
  app.on('second-instance', (ev, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const f = (argv || []).find(function (a) {
      try { return fs.existsSync(a) && fs.statSync(a).isFile() && /\.(md|markdown|txt|java|sql|json|xml|html?|css|js|mjs|ts|jsx|tsx|py|c|cpp|cc|h|hpp|log|ini|cfg|conf|bat|sh|yml|yaml|toml|properties|csv)$/i.test(a); } catch (e) { return false; }
    });
    if (f && win) { rememberRoot(f); win.webContents.send('menu', 'openpath:' + f); }   // 用户双击/命令行打开：信任它所在目录
  });
}

function debugLog() { return path.join(app.getPath('temp'), 'mde-debug.log'); }
function logLine(s) {
  try {
    const f = debugLog();
    try { if (fs.statSync(f).size > 2 * 1024 * 1024) fs.renameSync(f, f + '.old'); } catch (e) { /* 不存在则直接写 */ }
    fs.appendFileSync(f, s + '\n');
  } catch (e) { /* ignore */ }
}

function loadWinState() {
  try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8')); } catch (e) { return null; }
}
function createWindow() {
  const st = loadWinState() || {};
  win = new BrowserWindow({
    width: st.width || 1100,
    height: st.height || 760,
    x: (typeof st.x === 'number' && st.x >= -200 && st.x < 4000) ? st.x : undefined,
    y: (typeof st.y === 'number' && st.y >= -200 && st.y < 2200) ? st.y : undefined,
    minWidth: 620,
    minHeight: 440,
    title: '轻墨 QingMo',
    icon: path.join(__dirname, 'app.ico'),
    backgroundColor: '#f8f9fb',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // 暂时必须为 false：Vditor 4.x 用**同步 XHR**（dist/index.min.js 里
      // `new XMLHttpRequest(); open("GET",url,false)`）按需拉取 KaTeX/Mermaid/
      // highlight.js，file:// 下同步 XHR 会被 CORS 拦死，公式与图表将全部失效。
      // 真正的收紧办法是改用自定义协议（protocol.handle('app://…')）托管内核资源，
      // 而不是靠关掉 webSecurity；本版本的补偿措施是 IPC 侧的路径白名单（见 guard）。
      webSecurity: false
    }
  });
  win.once('ready-to-show', () => { if (st.max) win.maximize(); win.show(); });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('close', (e) => {
    try {
      const b = win.getBounds();
      fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify({ width: b.width, height: b.height, x: b.x, y: b.y, max: win.isMaximized() }));
    } catch (err) {}
    if (forceClose || !isDirty) return;
    e.preventDefault();
    if (closePrompting) return;          // 对话框已弹出，别重复弹
    closePrompting = true;
    dialog.showMessageBox(win, {          // 异步：同步版会把主进程（含 IPC）整段阻塞
      type: 'warning',
      buttons: ['放弃修改并退出', '取消'],
      defaultId: 1,
      cancelId: 1,
      message: '有未保存的修改',
      detail: '未保存的内容已自动存入草稿，重新打开后可恢复。'
    }).then(({ response }) => {
      closePrompting = false;
      if (response === 0) { forceClose = true; win.close(); }
    }, () => { closePrompting = false; });
  });
  win.on('closed', () => { win = null; });
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    logLine('did-fail-load: ' + code + ' ' + desc + ' ' + url);
  });
  win.webContents.on('render-process-gone', (e, d) => {
    logLine('render-process-gone: ' + JSON.stringify(d));
  });
  // console 转发开销大（每条一次同步写盘），仅调试模式挂载
  if (DEBUG) {
    win.webContents.on('console-message', (e, level, message, line, sourceId) => {
      logLine('console[' + level + ']: ' + message + ' @' + sourceId + ':' + line);
    });
  }
  // 导航守卫：点击链接不得带走编辑器窗口；新窗口一律拒绝，网页交给系统浏览器
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  // 只有调试模式才把 ?debug 传给渲染层，生产环境保持静默
  // 用 __dirname 拼绝对路径：保证从任意工作目录（包括测试脚本）启动都能找到页面与内核资源
  win.loadFile(path.join(__dirname, 'editor.html'), DEBUG ? { query: { debug: '1' } } : undefined);
}



/* ---------- IPC ---------- */
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: FILE_FILTERS });
  if (r.canceled) return { canceled: true };
  const p = r.filePaths[0];
  try {
    const d = decodeBuffer(await fsp.readFile(p));
    rememberRoot(p);                       // 用户显式选定的目录加入白名单
    return { canceled: false, name: path.basename(p), path: p, content: d.content, enc: d.enc, st: statOf(p) };
  } catch (err) {
    return { canceled: false, error: String(err) };
  }
});

ipcMain.handle('file:readPath', async (e, p) => {
  if (!guard.allows(p)) return DENIED;
  try {
    const d = decodeBuffer(await fsp.readFile(p));
    return { content: d.content, enc: d.enc, st: statOf(p) };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('file:write', async (e, p, content, enc) => {
  if (!guard.allows(p)) return DENIED;
  try {
    await backupHistory(p);
    await atomicWrite(p, encodeText(content, enc || 'utf-8'));
    return { ok: true, st: statOf(p) };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('file:saveAs', async (e, content, suggested, enc) => {
  const r = await dialog.showSaveDialog(win, { filters: FILE_FILTERS, defaultPath: suggested || '未命名.md' });
  if (r.canceled) return { canceled: true };
  try {
    await backupHistory(r.filePath);
    await atomicWrite(r.filePath, encodeText(content, enc || 'utf-8'));
    rememberRoot(r.filePath);
    return { ok: true, name: path.basename(r.filePath), path: r.filePath, st: statOf(r.filePath) };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('file:exportHtml', async (e, html, suggested) => {
  const r = await dialog.showSaveDialog(win, {
    filters: [{ name: 'HTML 文档', extensions: ['html'] }],
    defaultPath: suggested
  });
  if (r.canceled) return { canceled: true };
  try {
    await atomicWrite(r.filePath, html, 'utf8');
    return { ok: true };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('file:exportPdf', async (e, html, suggested) => {
  const tmp = path.join(app.getPath('temp'), 'mde-export.html');
  await fsp.writeFile(tmp, html, 'utf8');
  const w2 = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await w2.loadFile(tmp);
    const data = await w2.webContents.printToPDF({
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font-size:8px;width:100%;padding:0 24px;color:#999;"><span class="title"></span><span style="float:right">' + (suggested || '') + '</span></div>',
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#999;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margins: { top: 0.55, bottom: 0.55, left: 0.45, right: 0.45 }
    });
    w2.destroy();
    const r = await dialog.showSaveDialog(win, {
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
      defaultPath: suggested
    });
    if (r.canceled) return { canceled: true };
    await atomicWrite(r.filePath, data);
    return { ok: true };
  } catch (err) {
    w2.destroy();
    return { error: String(err) };
  }
});

/* ---------- 图片资源化与外部链接 ---------- */
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif' };

// 保存粘贴/拖入的图片到文档同目录 assets/，返回最终文件名（已去冲突、去非法字符）
ipcMain.handle('image:save', async (e, dir, baseName, b64) => {
  try {
    if (!dir || !b64) return { error: '参数不完整' };
    if (!guard.allows(dir)) return DENIED;
    let name = String(baseName || 'image').replace(/[\\/:*?"<>|\s]+/g, '-');
    if (!/\.[a-z0-9]{1,8}$/i.test(name)) name += '.png';
    await fsp.mkdir(dir, { recursive: true });
    const ext = (name.match(/\.[a-z0-9]+$/i) || ['.png'])[0];
    const stem = name.slice(0, -ext.length);
    let full = path.join(dir, name), n = 1;
    while (fs.existsSync(full)) { full = path.join(dir, stem + '-' + n + ext); n++; }
    await fsp.writeFile(full, Buffer.from(String(b64), 'base64'));
    return { ok: true, file: path.basename(full) };
  } catch (err) {
    return { error: String(err) };
  }
});

// 读取本地图片为 base64（导出 HTML/PDF 时内嵌用）
ipcMain.handle('file:readBinary', async (e, p) => {
  if (!guard.allows(p)) return DENIED;
  try {
    const buf = await fsp.readFile(p);
    const ext = ((p.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    return { ok: true, base64: buf.toString('base64'), mime: IMG_MIME[ext] || 'application/octet-stream' };
  } catch (err) {
    return { error: String(err) };
  }
});

// 导出 HTML 用的样式：主进程直读内置内核 CSS（避免渲染层用 fetch 读本地文件）
ipcMain.handle('app:exportCss', async () => {
  try {
    const main = await fsp.readFile(path.join(__dirname, 'dist', 'index.css'), 'utf8');
    const theme = await fsp.readFile(path.join(__dirname, 'dist', 'css', 'content-theme', 'light.css'), 'utf8');
    return { css: main + '\n' + theme };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.on('app:openExternal', (e, url) => {
  if (typeof url === 'string' && /^(https?:\/\/|mailto:)/i.test(url)) shell.openExternal(url);
});

/* ---------- 草稿 / 历史版本 / stat / 询问框 ---------- */
const draftsDir = () => path.join(app.getPath('userData'), 'drafts');
const historyDir = () => path.join(app.getPath('userData'), 'history');
const safeId = (id) => (/^[A-Za-z0-9_-]{1,64}$/.test(String(id)) ? String(id) : null);
function pathHash(p) { return crypto.createHash('sha1').update(String(p).toLowerCase()).digest('hex'); }

// 保存前把磁盘上的旧版本留底到 userData/history/，误覆盖可从页签右键恢复
async function backupHistory(p) {
  try {
    const buf = await fsp.readFile(p);
    if (buf.length > 5 * 1024 * 1024) return;   // 超大文件不留底
    const h = pathHash(p);
    const dir = path.join(historyDir(), h);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(path.join(dir, Date.now() + '.raw'), buf);
    await fsp.writeFile(path.join(historyDir(), h + '.json'), JSON.stringify({ path: String(p) }));
    const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.raw')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 50))) {
      try { await fsp.unlink(path.join(dir, f)); } catch (e2) { /* ignore */ }
    }
  } catch (e) { /* 原文件不存在等情况：忽略 */ }
}

ipcMain.on('draft:write', (e, id, text) => {
  const sid = safeId(id); if (!sid) return;
  try { fs.mkdirSync(draftsDir(), { recursive: true }); fs.writeFileSync(path.join(draftsDir(), sid + '.json'), JSON.stringify({ t: String(text), at: Date.now() })); } catch (err) { /* ignore */ }
});
ipcMain.handle('draft:read', async (e, id) => {
  const sid = safeId(id); if (!sid) return null;
  try { return JSON.parse(await fsp.readFile(path.join(draftsDir(), sid + '.json'), 'utf8')); } catch (err) { return null; }
});
ipcMain.on('draft:clear', (e, id) => {
  const sid = safeId(id); if (!sid) return;
  try { fs.unlinkSync(path.join(draftsDir(), sid + '.json')); } catch (err) { /* ignore */ }
});

ipcMain.handle('file:statPath', async (e, p) => {
  if (!guard.allows(p)) return { error: '拒绝访问' };
  const st = statOf(p);
  return st ? { ok: true, mtimeMs: st.mtimeMs, size: st.size } : { error: '文件不存在' };
});

ipcMain.handle('history:list', async (e, p) => {
  if (!guard.allows(p)) return { ok: true, items: [] };
  try {
    const dir = path.join(historyDir(), pathHash(p));
    const items = (await fsp.readdir(dir)).filter(f => f.endsWith('.raw'))
      .map(f => ({ ms: parseInt(f, 10) || 0, size: 0, file: path.join(dir, f) }))
      .filter(x => x.ms).sort((a, b) => b.ms - a.ms).slice(0, 50);
    for (const it of items) { try { it.size = (await fsp.stat(it.file)).size; } catch (e2) { /* ignore */ } }
    return { ok: true, items };
  } catch (err) { return { ok: true, items: [] }; }
});

// 通用多按钮询问框，返回被点按钮的下标（Esc = 最后一项）
// 用异步版：showMessageBoxSync 会把主进程（含所有 IPC）整段阻塞
ipcMain.handle('app:ask', async (e, opts) => {
  const buttons = (opts && opts.buttons) || ['确定'];
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons,
    defaultId: buttons.length - 1, cancelId: buttons.length - 1,
    message: (opts && opts.message) || '请选择', detail: (opts && opts.detail) || ''
  });
  return response;
});

ipcMain.handle('app:confirm', async (e, opts) => {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['关闭', '取消'],
    defaultId: 1,
    cancelId: 1,
    message: (opts && opts.message) || '确定吗？',
    detail: (opts && opts.detail) || ''
  });
  return response === 0;
});

ipcMain.on('win:print', () => { if (win) win.webContents.print({}); });
ipcMain.on('edit:cmd', (e, cmd) => {
  if (win && ['cut', 'copy', 'paste', 'selectAll'].indexOf(cmd) >= 0) win.webContents[cmd]();
});
ipcMain.on('title:set', (e, t) => { if (win) win.setTitle(t || '轻墨 QingMo'); });
ipcMain.on('dirty:set', (e, v) => { isDirty = !!v; });
ipcMain.on('app:help', () => {
  // 打包版：exe 同目录；否则回退应用目录（resources/app 或开发仓库根）
  const cands = [path.join(path.dirname(process.execPath), '使用说明.txt'), path.join(app.getAppPath(), '使用说明.txt')];
  for (const c of cands) {
    if (fs.existsSync(c)) { shell.openPath(c); return; }
  }
});
ipcMain.on('win:fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
ipcMain.on('app:openInFolder', (e, p) => { if (p) shell.showItemInFolder(p); });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);   // 无原生菜单：所有入口在页面内，快捷键由页面层处理
  loadTrustedRoots();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
