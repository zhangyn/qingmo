const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  open: () => ipcRenderer.invoke('file:open'),
  readPath: (p) => ipcRenderer.invoke('file:readPath', p),
  write: (p, content, enc) => ipcRenderer.invoke('file:write', p, content, enc),
  saveAs: (content, suggested, enc) => ipcRenderer.invoke('file:saveAs', content, suggested, enc),
  exportHtml: (html, suggested) => ipcRenderer.invoke('file:exportHtml', html, suggested),
  exportPdf: (html, suggested) => ipcRenderer.invoke('file:exportPdf', html, suggested),
  confirm: (opts) => ipcRenderer.invoke('app:confirm', opts),
  print: () => ipcRenderer.send('win:print'),
  editCmd: (cmd) => ipcRenderer.send('edit:cmd', cmd),
  openHelp: () => ipcRenderer.send('app:help'),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
  openInFolder: (p) => ipcRenderer.send('app:openInFolder', p),
  setTitle: (t) => ipcRenderer.send('title:set', t),
  setDirty: (v) => ipcRenderer.send('dirty:set', v),
  onMenu: (fn) => ipcRenderer.on('menu', (e, action) => fn(action))
});
