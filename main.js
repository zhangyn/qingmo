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

function debugLog() { return path.join(app.getPath('temp'), 'mde-debug.log'); }
function logLine(s) { try { fs.appendFileSync(debugLog(), s + '\n'); } catch (e) { /* ignore */ } }

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
ipcMain.on('app:help', () => { shell.openPath(path.join(path.dirname(process.execPath), '使用说明.txt')); });
ipcMain.on('win:fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);   // 无原生菜单：所有入口在页面内，快捷键由页面层处理
  createWindow();
});

app.on('window-all-closed', () => app.quit());
