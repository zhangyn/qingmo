'use strict';
/* ---------- 页签右键菜单 ---------- */
document.getElementById('tabbar').addEventListener('contextmenu', function (e) {
  var tabEl = e.target.closest ? e.target.closest('.tab') : null;
  if (!tabEl) return;
  e.preventDefault();
  var id = tabEl.dataset.tab;
  var items = [
    { label: (tabsBottom ? '✓ ' : '') + '页签置于底部', fn: function () { tabsBottom = !tabsBottom; applyTabsPos(); } },
    { sep: true },
    { label: '关闭标签', danger: true, fn: function () { closeTab(id); } },
    { label: '关闭其他标签', danger: true, fn: function () { closeOthers(id); } },
    { label: '关闭全部标签', danger: true, fn: function () { closeAll(); } }
  ];
  var t = tabById(id);
  if (t && t.path && window.desktop) {
    items.push({ sep: true });
    items.push({ label: '历史版本…', fn: function () { showHistoryMenu(t, e.clientX, e.clientY); } });
    items.push({ label: '在资源管理器中显示', fn: function () { window.desktop.openInFolder(t.path); } });
  }
  showCtx(e.clientX, e.clientY, items);
});


/* ---------- 历史版本（每次保存前自动留底，页签右键恢复） ---------- */
async function showHistoryMenu(t, x, y) {
  var r = await window.desktop.historyList(t.path);
  if (!r.ok || !r.items.length) { toast('暂无历史版本（每次保存前自动留底，上限 50 份）'); return; }
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var items = r.items.slice(0, 20).map(function (it) {
    var d = new Date(it.ms);
    var label = pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '  ' + Math.max(1, Math.round(it.size / 1024)) + ' KB';
    return { label: label, fn: function () { restoreHistory(t, it.file); } };
  });
  showCtx(x, y, items);
}
async function restoreHistory(t, snapFile) {
  var r = await window.desktop.readPath(snapFile);
  if (r.error) return toast('读取历史版本失败：' + r.error);
  if (t.id !== activeId) await switchTab(t.id);
  await setEditorText(r.content);
  t.content = r.content; t.dirty = true;
  renderTabs(); setDirty(true);
  toast('已载入历史版本，确认无误后保存');
}


/* ---------- 页签拖拽排序 ---------- */
var dragTab = null, lastDragEnd = 0;
document.getElementById('tabbar').addEventListener('mousedown', function (e) {
  var tabEl = e.target.closest ? e.target.closest('.tab') : null;
  if (!tabEl || e.button !== 0 || e.target.classList.contains('x')) return;
  dragTab = { el: tabEl, id: tabEl.dataset.tab, startX: e.clientX, moved: false };
});
window.addEventListener('mousemove', function (e) {
  if (!dragTab) return;
  var dx = e.clientX - dragTab.startX;
  if (!dragTab.moved && Math.abs(dx) > 6) dragTab.moved = true;
  if (!dragTab.moved) return;
  dragTab.el.style.transform = 'translateX(' + dx + 'px)';
  dragTab.el.style.zIndex = 5;
  dragTab.el.style.position = 'relative';
  var sib = dx > 0 ? dragTab.el.nextElementSibling : dragTab.el.previousElementSibling;
  if (sib && sib.classList.contains('tab')) {
    var sr = sib.getBoundingClientRect();
    var rr = dragTab.el.getBoundingClientRect();
    if ((dx > 0 && rr.right > sr.left + sr.width / 2) || (dx < 0 && rr.left < sr.left + sr.width / 2)) {
      var ia = tabs.findIndex(function (t) { return t.id === dragTab.id; });
      var ib = tabs.findIndex(function (t) { return t.id === sib.dataset.tab; });
      var tmp = tabs[ia]; tabs[ia] = tabs[ib]; tabs[ib] = tmp;
      dragTab.startX += (dx > 0 ? sr.width : -sr.width);
      if (dx > 0) sib.parentNode.insertBefore(sib, dragTab.el);
      else sib.parentNode.insertBefore(dragTab.el, sib);
      persistTabs();
    }
  }
  e.preventDefault();
});
window.addEventListener('mouseup', function () {
  if (dragTab) {
    dragTab.el.style.transform = '';
    dragTab.el.style.zIndex = '';
    dragTab.el.style.position = '';
    if (dragTab.moved) lastDragEnd = Date.now();
    dragTab = null;
  }
});


/* ---------- 拖拽打开 .md → 新标签 ---------- */
window.addEventListener('dragover', function (e) { e.preventDefault(); }, false);
window.addEventListener('drop', function (e) {
  e.preventDefault(); e.stopPropagation();
  var files = e.dataTransfer && e.dataTransfer.files;
  if (!files || !files.length) return;
  var f = files[0];
  if (/\.(md|markdown|txt)$/i.test(f.name)) {
    f.text().then(function (t) { return openIntoTab({ name: f.name, content: t }); }).then(function () { toast('已打开 ' + f.name); });
  } else { insertImages(files); }
}, true);


/* ---------- 粘贴图片 → assets/ 引用或 base64 ---------- */
window.addEventListener('paste', function (e) {
  var cd = e.clipboardData;
  if (!cd || !cd.files || !cd.files.length) return;
  if (isCodeMode()) return;
  var imgs = [];
  for (var i = 0; i < cd.files.length; i++) {
    if (cd.files[i].type && cd.files[i].type.indexOf('image/') === 0) imgs.push(cd.files[i]);
  }
  if (!imgs.length) return;
  e.preventDefault(); e.stopImmediatePropagation();
  insertImages(imgs);
}, true);


/* ---------- 正文链接：交给系统浏览器，防止编辑器窗口被导航 ---------- */
document.addEventListener('click', function (e) {
  var el = e.target;
  var a = el && el.closest ? el.closest('.vditor-reset a[href]') : null;
  if (!a) return;
  var href = a.getAttribute('href') || '';
  if (!href || href.charAt(0) === '#') return;   // 文内锚点放行
  e.preventDefault(); e.stopImmediatePropagation();
  if (/^(https?:\/\/|mailto:)/i.test(href)) {
    if (window.desktop) window.desktop.openExternal(href); else window.open(href, '_blank');
  } else {
    toast('该链接不是网页地址，暂不支持在编辑器内打开');
  }
}, true);


/* ---------- 快捷键 ---------- */
window.addEventListener('keydown', function (e) {
  if (e.key === 'F11') { e.preventDefault(); e.stopPropagation(); if (window.desktop) window.desktop.toggleFullscreen(); else document.body.requestFullscreen(); return; }
  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === 'p') { e.preventDefault(); e.stopPropagation(); ACTIONS.print(); return; }
  if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomFactor = Math.min(3, zoomFactor * 1.1); applyZoom(); return; }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoomFactor = Math.max(0.5, zoomFactor / 1.1); applyZoom(); return; }
  if (e.ctrlKey && e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); cursorBack(); return; }
  if (e.ctrlKey && e.altKey && e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); cursorFwd(); return; }
  if (e.key === 'F3' && findState.open) { e.preventDefault(); e.stopPropagation(); e.shiftKey ? findPrev() : findNext(); return; }
  if (e.key === 'Escape' && findState.open) { closeFind(); return; }
  var mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  var k = e.key.toLowerCase();
  if (k === 's' && e.shiftKey) { e.preventDefault(); e.stopPropagation(); saveAs(); }
  else if (k === 's') { e.preventDefault(); e.stopPropagation(); save(); }
  else if (k === 'o') { e.preventDefault(); e.stopPropagation(); openFile(); }
  else if (k === 'n' && e.altKey) { e.preventDefault(); e.stopPropagation(); newFile({ kind: 'code', lang: null }); }
  else if (k === 'n') { e.preventDefault(); e.stopPropagation(); newFile(); }
  else if (k === 'w') { e.preventDefault(); e.stopPropagation(); closeTab(activeId); }
  else if (k === 'f') { e.preventDefault(); e.stopPropagation(); openFind(false); }
  else if (k === 'h') { e.preventDefault(); e.stopPropagation(); openFind(true); }
}, true);
window.addEventListener('beforeunload', function (e) {
  if (window.desktop) return;   // 桌面版由主进程统一弹确认框
  var anyDirty = tabs.some(function (t) { return t.dirty; });
  if (anyDirty) { e.preventDefault(); e.returnValue = ''; }
});

