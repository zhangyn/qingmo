'use strict';
/* ---------- 草稿（桌面版存 userData/drafts/，浏览器版回退 localStorage） ---------- */
function readDraft(id) {
  if (window.desktop) return window.desktop.readDraft(id).catch(function () { return null; });
  try { var raw = localStorage.getItem('mde:draft:' + id); return Promise.resolve(raw ? JSON.parse(raw) : null); }
  catch (e) { return Promise.resolve(null); }
}
function writeDraft(t, content) {
  if (window.desktop) { window.desktop.writeDraft(t.id, content); return; }
  try { localStorage.setItem('mde:draft:' + t.id, JSON.stringify({ t: content, at: Date.now() })); } catch (e) {}
}
function clearDraft(id) {
  if (window.desktop) { window.desktop.clearDraft(id); return; }
  try { localStorage.removeItem('mde:draft:' + id); } catch (e) {}
}
/* 旧版本草稿存在 localStorage，启动时一次性迁移到桌面版目录 */
async function migrateDrafts() {
  if (!window.desktop) return;
  var keys = [];
  try {
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('mde:draft:') === 0) keys.push(k); }
  } catch (e) { return; }
  for (var j = 0; j < keys.length; j++) {
    try {
      var raw = localStorage.getItem(keys[j]);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o.t === 'string') window.desktop.writeDraft(keys[j].slice(10), o.t); }
      localStorage.removeItem(keys[j]);
    } catch (e) { /* ignore */ }
  }
}
/* 大文件优化：草稿改为"停止输入 2.5 秒后"落盘，避免长文档周期性整篇序列化 */
setInterval(function () {
  var t = activeTab();
  if (ready && t && t.dirty && Date.now() - lastEditAt > 2500) writeDraft(t, activeText());
}, 5000);


/* ---------- 外部变更检测：3 秒轮询 mtime/size，防止静默覆盖 ---------- */
var staleScanBusy = false;
async function reloadTabFromDisk(t) {
  var r = await window.desktop.readPath(t.path);
  if (r.error) { toast('重载失败：' + r.error); return; }
  if (r.st) t.st = r.st;
  t.content = r.content; t.enc = r.enc || t.enc;
  clearDraft(t.id);
  t.dirty = false;
  if (t.id === activeId && ready) {
    await setEditorText(r.content);
    scheduleOutlineRefresh();
  }
  renderTabs();
  if (ready) setDirty(activeTab().dirty);
}
async function handleExternalChange(t) {
  if (!t.dirty) { await reloadTabFromDisk(t); toast('「' + t.name + '」已被外部修改，已自动重载'); return; }
  var idx = await window.desktop.ask({
    message: '「' + t.name + '」已被其他程序修改',
    detail: '磁盘上的内容已变化。载入磁盘版本将放弃当前未保存的修改（已有草稿可恢复）。',
    buttons: ['载入磁盘版本', '保留我的修改']
  });
  if (idx === 0) { await reloadTabFromDisk(t); toast('已载入磁盘版本'); }
  else toast('已保留你的修改；再次保存将覆盖磁盘版本');
}
setInterval(function () {
  if (!ready || !window.desktop || staleScanBusy || document.hidden) return;
  var targets = tabs.filter(function (t) { return t.path; });
  if (!targets.length) return;
  staleScanBusy = true;
  (async function () {
    try {
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        var r = await window.desktop.statPath(t.path);
        if (r.error) {
          if (!t.gone) { t.gone = true; toast('文件已从磁盘移除：' + t.name); }
          continue;
        }
        t.gone = false;
        if (!t.st) { t.st = { mtimeMs: r.mtimeMs, size: r.size }; continue; }
        if (r.mtimeMs === t.st.mtimeMs && r.size === t.st.size) continue;
        t.st = { mtimeMs: r.mtimeMs, size: r.size };
        await handleExternalChange(t);
      }
    } finally { staleScanBusy = false; }
  })();
}, 3000);

