const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  open: () => ipcRenderer.invoke('file:open'),
  readPath: (p) => ipcRenderer.invoke('file:readPath', p),
  write: (p, content) => ipcRenderer.invoke('file:write', p, content),
  saveAs: (content, suggested) => ipcRenderer.invoke('file:saveAs', content, suggested),
  exportHtml: (html, suggested) => ipcRenderer.invoke('file:exportHtml', html, suggested),
  exportPdf: (html, suggested) => ipcRenderer.invoke('file:exportPdf', html, suggested),
  confirm: (opts) => ipcRenderer.invoke('app:confirm', opts),
  print: () => ipcRenderer.send('win:print'),
  editCmd: (cmd) => ipcRenderer.send('edit:cmd', cmd),
  setTitle: (t) => ipcRenderer.send('title:set', t),
  setDirty: (v) => ipcRenderer.send('dirty:set', v),
  onMenu: (fn) => ipcRenderer.on('menu', (e, action) => fn(action))
});
