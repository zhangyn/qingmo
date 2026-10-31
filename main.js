const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const FILE_FILTERS = [
  { name: '所有支持的文件', extensions: ['md', 'markdown', 'txt', 'java', 'sql', 'json', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'jsx', 'tsx', 'mjs', 'py', 'c', 'cpp', 'cc', 'h', 'hpp', 'log', 'ini', 'cfg', 'conf', 'bat', 'sh', 'yml', 'yaml', 'toml', 'properties', 'csv'] },
  { name: 'Markdown 文档', extensions: ['md', 'markdown'] },
  { name: '所有文件', extensions: ['*'] }
];
let win = null;
let isDirty = false;
let forceClose = false;
let uiWs = false;      // 显示空白字符
let uiWrap = true;     // 自动换行

function debugLog() { return path.join(app.getPath('temp'), 'mde-debug.log'); }
function logLine(s) { try { fs.appendFileSync(debugLog(), s + '\n'); } catch (e) { /* ignore */ } }

function sendMenu(action) { if (win) win.webContents.send('menu', action); }

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 620,
    minHeight: 440,
    title: 'MD 编辑器',
    backgroundColor: '#f8f9fb',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // 纯本地应用：允许页面加载同目录下的编辑器内核资源
      webSecurity: false
    }
  });
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('close', (e) => {
    if (forceClose || !isDirty) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['放弃修改并退出', '取消'],
      defaultId: 1,
      cancelId: 1,
      message: '有未保存的修改',
      detail: '未保存的内容已自动存入草稿，重新打开后可恢复。'
    });
    if (r === 0) { forceClose = true; win.close(); }
  });
  win.on('closed', () => { win = null; });
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    logLine('did-fail-load: ' + code + ' ' + desc + ' ' + url);
  });
  win.webContents.on('render-process-gone', (e, d) => {
    logLine('render-process-gone: ' + JSON.stringify(d));
  });
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    logLine('console[' + level + ']: ' + message + ' @' + sourceId + ':' + line);
  });
  win.loadFile('editor.html');
}

function buildMenu() {
  const MENU_TMPL = [
  {
    label: '文件',
    submenu: [
      { label: '新建标签页', accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new') },
      { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open') },
      { type: 'separator' },
      { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
      { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenu('saveas') },
      { label: '关闭标签页', accelerator: 'CmdOrCtrl+W', click: () => sendMenu('closetab') },
      { type: 'separator' },
      { label: '导出 PDF…', click: () => sendMenu('pdf') },
      { label: '导出 HTML…', click: () => sendMenu('exporthtml') },
      { label: '打印…', accelerator: 'CmdOrCtrl+P', click: () => { if (win) win.webContents.print({}); } },
      { type: 'separator' },
      { label: '退出', role: 'quit' }
    ]
  },
  {
    label: '编辑',
    submenu: [
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', role: 'cut' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' },
      { type: 'separator' },
      { label: '行工具', submenu: [
        { label: '合并为一行（单引号）', click: () => sendMenu('line-s') },
        { label: '合并为一行（双引号）', click: () => sendMenu('line-d') },
        { label: '合并为一行（无引号）', click: () => sendMenu('line-n') },
        { label: '拆分为多行', click: () => sendMenu('line-split') }
      ] }
    ]
  },
  {
    label: '视图',
    submenu: [
      { label: '放大', role: 'zoomIn' },
      { label: '缩小', role: 'zoomOut' },
      { label: '重置缩放', role: 'resetZoom' },
      { type: 'separator' },
      { label: '显示空白字符', type: 'checkbox', checked: uiWs, click: () => sendMenu('toggle-ws') },
      { label: '自动换行', type: 'checkbox', checked: uiWrap, click: () => sendMenu('toggle-wrap') },
      { type: 'separator' },
      { label: '全屏', role: 'togglefullscreen' }
    ]
  },
  {
    label: '帮助',
    submenu: [
      {
        label: '使用说明',
        click: () => shell.openPath(path.join(path.dirname(process.execPath), '使用说明.txt'))
      },
      {
        label: '关于',
        click: () => dialog.showMessageBox(win, {
          type: 'info',
          title: '关于',
          message: 'MD 编辑器 1.1',
          detail: '基于 Vditor 内核的本地 Markdown 编辑器\n免费、离线、不联网'
        })
      }
    ]
  }
  ];
  return MENU_TMPL;
}

/* ---------- IPC ---------- */
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: FILE_FILTERS });
  if (r.canceled) return { canceled: true };
  const p = r.filePaths[0];
  try {
    const content = fs.readFileSync(p, 'utf8');
    return { canceled: false, name: path.basename(p), path: p, content };
  } catch (err) {
    return { canceled: false, error: String(err) };
  }
});

ipcMain.handle('file:readPath', async (e, p) => {
  try {
    return { content: fs.readFileSync(p, 'utf8') };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('file:write', async (e, p, content) => {
  try {
    fs.writeFileSync(p, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('file:saveAs', async (e, content, suggested) => {
  const r = await dialog.showSaveDialog(win, { filters: FILE_FILTERS, defaultPath: suggested || '未命名.md' });
  if (r.canceled) return { canceled: true };
  try {
    fs.writeFileSync(r.filePath, content, 'utf8');
    return { ok: true, name: path.basename(r.filePath), path: r.filePath };
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
    fs.writeFileSync(r.filePath, html, 'utf8');
    return { ok: true };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('file:exportPdf', async (e, html, suggested) => {
  const tmp = path.join(app.getPath('temp'), 'mde-export.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const w2 = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await w2.loadFile(tmp);
    const data = await w2.webContents.printToPDF({ printBackground: true });
    w2.destroy();
    const r = await dialog.showSaveDialog(win, {
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }],
      defaultPath: suggested
    });
    if (r.canceled) return { canceled: true };
    fs.writeFileSync(r.filePath, data);
    return { ok: true };
  } catch (err) {
    w2.destroy();
    return { error: String(err) };
  }
});

ipcMain.handle('app:confirm', async (e, opts) => {
  const r = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: ['关闭', '取消'],
    defaultId: 1,
    cancelId: 1,
    message: (opts && opts.message) || '确定吗？',
    detail: (opts && opts.detail) || ''
  });
  return r === 0;
});

ipcMain.on('win:print', () => { if (win) win.webContents.print({}); });
ipcMain.on('edit:cmd', (e, cmd) => {
  if (win && ['cut', 'copy', 'paste', 'selectAll'].indexOf(cmd) >= 0) win.webContents[cmd]();
});
ipcMain.on('title:set', (e, t) => { if (win) win.setTitle(t || 'MD 编辑器'); });
ipcMain.on('dirty:set', (e, v) => { isDirty = !!v; });
ipcMain.on('ui:state', (e, st) => {
  const ws = !!(st && st.ws), wrap = !!(st && st.wrap);
  if (ws !== uiWs || wrap !== uiWrap) { uiWs = ws; uiWrap = wrap; Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenu())); }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenu()));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
