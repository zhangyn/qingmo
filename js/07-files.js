'use strict';
/* ---------- 文件读写 ---------- */
var MD_ACCEPT = {
  'text/markdown': ['.md', '.markdown'],
  'text/plain': ['.txt']
};
async function openFile() {
  if (window.desktop) {              // 桌面版：原生对话框 → 新标签
    var r = await window.desktop.open();
    if (r.canceled) return;
    if (r.error) return toast('打开失败：' + r.error);
    var exist = tabs.filter(function (t) { return t.path === r.path; })[0];
    if (exist) { await switchTab(exist.id); toast('已切换到 ' + r.name); return; }
    var nt = await openIntoTab({ name: r.name, content: r.content, path: r.path, enc: r.enc });
    if (nt && r.st) nt.st = r.st;
    addRecent(r.path);
    toast('已打开 ' + r.name);
    return;
  }
  if (window.showOpenFilePicker) {   // 网页版
    try {
      var handles = await window.showOpenFilePicker({ types: [{ description: 'Markdown 文档', accept: MD_ACCEPT }] });
      var f = await handles[0].getFile();
      var exist2 = tabs.filter(function (t) { return t.fh === handles[0]; })[0];
      if (exist2) { await switchTab(exist2.id); return; }
      await openIntoTab({ name: f.name, content: await f.text(), fh: handles[0] });
      toast('已打开 ' + f.name);
    } catch (e) { if (e && e.name !== 'AbortError') toast('打开失败：' + e.message); }
  } else {
    $('fallback-open').click();
  }
}
function fallbackSave(text) {
  var t = activeTab();
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  var nm = t ? t.name : '未命名';
  a.download = /\.md$|\.markdown$|\.txt$/i.test(nm) ? nm : nm + '.md';
  a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  clearDraft(t && t.id); setDirty(false); toast('已下载到浏览器默认下载位置');
}
async function save() {
  var t = activeTab(); if (!t || !ready) return;
  var text = activeText();
  if (window.desktop) {
    if (!t.path) return saveAs();
    var r = await window.desktop.write(t.path, text, t.enc || 'utf-8');
    if (r.error) return toast('保存失败：' + r.error);
    if (r.st) t.st = r.st;
    clearDraft(t.id); setDirty(false); toast('已保存 ' + t.name);
    return;
  }
  if (t.fh) {
    try {
      var perm = await t.fh.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await t.fh.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return saveAs();
      var w = await t.fh.createWritable();
      await w.write(text); await w.close();
      clearDraft(t.id); setDirty(false); toast('已保存 ' + t.name);
    } catch (e) { toast('保存失败：' + e.message); }
  } else saveAs();
}
async function saveAs() {
  var t = activeTab(); if (!t) return;
  var text = activeText();
  if (window.desktop) {
    var defName = t.kind === 'code' && !/\.[a-z0-9]+$/i.test(t.name) ? t.name + '.txt' : (/\.md$|\.txt$/i.test(t.name) ? t.name : t.name + '.md');
    var r = await window.desktop.saveAs(text, defName, t.enc || 'utf-8');
    if (r.canceled) return;
    if (r.error) return toast('保存失败：' + r.error);
    t.path = r.path; t.name = r.name; t.fh = null;
    if (r.st) t.st = r.st;
    if (t.kind !== 'code') { var k2 = kindOf(t.name); if (k2.kind === 'code') { t.kind = 'code'; t.lang = k2.lang; cmSetLang(t.lang); } }
    addRecent(r.path);
    clearDraft(t.id); setDirty(false); renderTabs(); toast('已保存 ' + r.name);
    return;
  }
  if (window.showSaveFilePicker) {
    try {
      var handle = await window.showSaveFilePicker({
        suggestedName: /\.md$|\.txt$/i.test(t.name) ? t.name : t.name + '.md',
        types: [{ description: 'Markdown 文档', accept: { 'text/markdown': ['.md'] } }]
      });
      var w = await handle.createWritable();
      await w.write(text); await w.close();
      t.fh = handle; t.name = handle.name;
      clearDraft(t.id); setDirty(false); renderTabs(); toast('已保存 ' + handle.name);
    } catch (e) { if (e && e.name !== 'AbortError') toast('另存为失败：' + e.message); }
  } else fallbackSave(text);
}
function newFile(kindObj) {
  if (kindObj) return openIntoTab({ name: '未命名', content: '', kind: kindObj });
  openIntoTab({ name: '未命名', content: '' });
}


/* ---------- 导出 ---------- */
var FALLBACK_CSS = 'body{max-width:800px;margin:40px auto;padding:0 20px;font-family:Georgia,"Microsoft YaHei",serif;line-height:1.7;color:#24292f}pre{background:#f6f8fa;padding:14px;border-radius:6px;overflow:auto}code{background:#f6f8fa;padding:2px 5px;border-radius:4px;font-family:Consolas,monospace;font-size:.9em}pre code{background:none;padding:0}table{border-collapse:collapse;margin:1em 0}th,td{border:1px solid #d0d7de;padding:6px 14px}blockquote{border-left:4px solid #d0d7de;margin:0;padding:0 1em;color:#57606a}img{max-width:100%}';
/* 导出前把本地相对路径图片（assets/…）转成 dataURL 内嵌，保证导出文件自包含 */
async function inlineLocalImages(html, t) {
  if (!window.desktop || !t || !t.path || html.indexOf('<img') < 0) return html;
  var dir = t.path.replace(/[\\\/][^\\\/]*$/, '');
  var box = document.createElement('div');
  box.innerHTML = html;
  var imgs = box.querySelectorAll('img[src]');
  for (var i = 0; i < imgs.length; i++) {
    var src = imgs[i].getAttribute('src') || '';
    if (!src || /^(data:|https?:|blob:|file:)/i.test(src) || src.charAt(0) === '#') continue;
    var cands = [src];
    try { var dec = decodeURIComponent(src); if (cands.indexOf(dec) < 0) cands.push(dec); } catch (e) {}
    for (var j = 0; j < cands.length; j++) {
      var r = await window.desktop.readBinary(dir + '/' + cands[j].replace(/^\.\//, ''));
      if (r && r.ok) { imgs[i].setAttribute('src', 'data:' + r.mime + ';base64,' + r.base64); break; }
    }
  }
  return box.innerHTML;
}
async function buildExportHtml() {
  var t = activeTab();
  var css = FALLBACK_CSS;
  var body;
  if (isCodeMode()) {
    var txt = activeText().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    body = '<pre style="font-family:Consolas,monospace;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;margin:0">' + txt + '</pre>';
  } else {
    body = await inlineLocalImages(vditor.getHTML(), t);
    try {
      var main = await fetch('./dist/index.css').then(function (r) { return r.text(); });
      var theme = await fetch('./dist/css/content-theme/light.css').then(function (r) { return r.text(); });
      css = main + '\n' + theme;
    } catch (e) { body = '<div style="' + 'max-width:800px;margin:40px auto' + '">' + body + '</div>'; }
  }
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>' +
    (t ? t.name : '文档').replace(/</g, '&lt;') + '</title><style>' + css + '</style></head><body class="vditor-reset">' +
    body + '</body></html>';
}
function exportBaseName() {
  var t = activeTab();
  var nm = t ? t.name : '未命名';
  return nm.replace(/\.(md|markdown|txt)$/i, '');
}
async function exportHtml() {
  var html = await buildExportHtml();
  if (window.desktop) {
    var r = await window.desktop.exportHtml(html, exportBaseName() + '.html');
    if (r.canceled) return;
    if (r.error) return toast('导出失败：' + r.error);
    return toast('已导出 HTML');
  }
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = exportBaseName() + '.html';
  a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  toast('已导出 HTML');
}
async function printPdf() {
  var html = await buildExportHtml();
  var win = window.open('', '_blank');
  if (!win) { toast('弹窗被浏览器拦截，请允许弹窗后重试'); return; }
  win.document.write(html + '<script>setTimeout(function(){window.print()},400)<\/script>');
  win.document.close();
}
async function exportPdf() {
  var html = await buildExportHtml();
  if (window.desktop) {
    var r = await window.desktop.exportPdf(html, exportBaseName() + '.pdf');
    if (r.canceled) return;
    if (r.error) return toast('导出失败：' + r.error);
    return toast('已导出 PDF');
  }
  return printPdf();
}


/* ---------- 图片粘贴/拖入 → assets/ 相对引用（未保存文档回退 base64） ---------- */
function readAsDataURL(f) {
  return new Promise(function (res) {
    var r = new FileReader();
    r.onload = function () { res(r.result); }; r.readAsDataURL(f);
  });
}
function abToB64(ab) {
  var u = new Uint8Array(ab), s = '', CH = 0x8000;
  for (var i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
  return btoa(s);
}
async function insertImages(files) {
  var t = activeTab();
  if (isCodeMode()) { toast('代码模式不支持插入图片'); return; }
  if (!vditor) return;
  var canAssets = !!(window.desktop && t && t.path);
  if (!canAssets && files.length) toast('未保存的文档：图片将以 base64 内嵌（保存后再粘贴，可存为 assets/ 引用）');
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!(f.type && f.type.indexOf('image/') === 0)) continue;
    if (canAssets) {
      try {
        var ab = await f.arrayBuffer();
        var ext = (f.name && /\.[a-z0-9]{1,8}$/i.test(f.name)) ? f.name.split('.').pop().toLowerCase()
                 : ((f.type.split('/')[1] || 'png').replace('jpeg', 'jpg'));
        var base = (f.name || ('image-' + Date.now())).replace(/\.[a-z0-9]{1,8}$/i, '') || 'image';
        var dir = t.path.replace(/[\\\/][^\\\/]*$/, '');
        var r = await window.desktop.saveImage(dir, base + '.' + ext, abToB64(ab));
        if (r && r.ok) { vditor.insertValue('\n![](assets/' + r.file + ')\n'); continue; }
        if (r && r.error) console.warn('image:save 失败，回退 base64：', r.error);
      } catch (e2) { /* 落回 base64 */ }
    }
    var d = await readAsDataURL(f);
    vditor.insertValue('\n![](' + d + ')\n');
  }
}

