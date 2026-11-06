'use strict';
/* ---------- 欢迎文档 ---------- */
var WELCOME = [
'# 欢迎使用 轻墨 QingMo ✨',
'',
'这是一个**免费、离线可用**的 Markdown 编辑器，写作方式与 Typora 一样：',
'**输入即渲染**，不需要左右分栏预览。',
'',
'> 用顶部菜单「打开」加载 `.md` 文件，`Ctrl+S` 直接保存回原文件。',
'> 支持多标签页：可同时打开多个文件，`Ctrl+W` 关闭当前标签。',
'> 未保存的修改会自动存入草稿，意外关闭也能恢复。',
'',
'## 常用语法速览',
'',
'- 无序列表项',
'1. 有序列表项',
'- [x] 任务清单（已完成）',
'- [ ] 任务清单（未完成）',
'',
'**加粗**、*斜体*、~~删除线~~、`行内代码`、[链接](https://github.com)',
'',
'### 表格',
'',
'右键点击表格可插入/删除行和列。',
'',
'| 功能 | 快捷键 |',
'| --- | --- |',
'| 保存 | Ctrl + S |',
'| 打开 | Ctrl + O |',
'',
'### 代码块',
'',
'```python',
'def hello(name: str) -> str:',
'    return f"你好, {name}!"',
'```',
'',
'### 数学公式',
'',
'$$',
'E = mc^2, \\quad e^{i\\pi} + 1 = 0',
'$$',
'',
'### 图表（Mermaid）',
'',
'```mermaid',
'graph LR;',
'  A[写作] --> B{满意?};',
'  B -- 是 --> C[发布];',
'  B -- 否 --> A;',
'```',
'',
'*开始写作吧！右上角 🌙 可切换暗色主题。*',
''
].join('\n');


/* ---------- 标签页操作 ---------- */
function cacheActive() {
  var cur = activeTab();
  if (!cur || !ready) return;
  pushTabCursor(cur);
  cur.content = activeText();
  // 代码模式：把当前 state 挂回该标签（撤销栈/选区/折叠随标签走，不被下一次切页冲掉）
  if (cur.kind === 'code' && cmView) cur.cmState = cmView.state;
  if (cur.dirty) writeDraft(cur, cur.content);
  var sc = cur.kind === 'code' ? document.querySelector('#cmhost .cm-scroller') : mdScroller();
  if (sc) cur.scroll = sc.scrollTop;
}
async function activateTab(t) {
  activeId = t.id;
  // 代码模式：applyEditorKind 内部会 setState 到该标签自己的 EditorState，
  // 不再做“整篇替换文档”那一步（那会把切页写进撤销栈，Ctrl+Z 能把另一个文件的内容倒进来）
  applyEditorKind(t);
  if (t.kind !== 'code') {
    await vditor.setValue(t.content || '');
    vdResetUndo();     // 基线撤销点 = 本标签当前内容（防止撤销跨标签）
    scheduleCodeBlockHl();
  }
  var sc = t.kind === 'code' ? document.querySelector('#cmhost .cm-scroller') : mdScroller();
  if (sc) sc.scrollTop = t.scroll || 0;
  setDirty(t.dirty);
  renderTabs();
  applyZoom();
  applyOutline(); refreshOutline();
  if (findState.open) setTimeout(function () { runSearch(true); }, 250);
}
async function switchTab(id) {
  if (id === activeId || !tabById(id)) return;
  cacheActive();
  await activateTab(tabById(id));
}
async function openIntoTab(opts) {
  cacheActive();
  var t = newTabObj(opts.name, opts.content, opts.path, opts.fh);
  if (opts.kind) { t.kind = opts.kind.kind; t.lang = opts.kind.lang; }
  tabs.push(t);
  await activateTab(t);
  return t;
}
function closeTabs(ids) {
  var dirtyCount = ids.filter(function (id) { var t = tabById(id); return t && t.dirty; }).length;
  function doClose() {
    ids.forEach(function (id) { var t = tabById(id); if (t) { clearDraft(t.id); tabs.splice(tabs.indexOf(t), 1); } });
    if (!tabById(activeId)) {
      var next = tabs[0];
      if (next) activateTab(next); else openIntoTab({ name: '未命名', content: '' });
    } else { setDirty(activeTab().dirty); renderTabs(); }
  }
  if (!dirtyCount) return doClose();
  if (window.desktop) {
    window.desktop.confirm({ message: '有 ' + dirtyCount + ' 个未保存的标签', detail: '未保存内容有草稿可恢复，确定全部关闭？' }).then(function (ok) { if (ok) doClose(); });
  } else if (window.confirm('有未保存修改，确定全部关闭？')) doClose();
}
function closeOthers(keepId) {
  closeTabs(tabs.filter(function (t) { return t.id !== keepId; }).map(function (t) { return t.id; }));
}
function closeAll() {
  closeTabs(tabs.map(function (t) { return t.id; }));
}
async function closeTab(id) {
  var t = tabById(id);
  if (!t) return;
  if (t.dirty) {
    var ok;
    if (window.desktop) {
      ok = await window.desktop.confirm({
        message: '「' + t.name + '」有未保存的修改',
        detail: '关闭将丢失未保存的内容。'
      });
    } else {
      ok = window.confirm('「' + t.name + '」有未保存的修改，确定关闭吗？');
    }
    if (!ok) return;
  }
  clearDraft(t.id);
  var idx = tabs.indexOf(t);
  tabs.splice(idx, 1);
  if (activeId === id) {
    var next = tabs[idx] || tabs[idx - 1];
    if (next) await activateTab(next);
    else await openIntoTab({ name: '未命名', content: '' });
  } else renderTabs();
}


/* ---------- 会话恢复 ---------- */
async function restoreSession() {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('mde:tabs') || 'null'); } catch (e) {}
  if (saved && saved.list && saved.list.length) {
    for (var i = 0; i < saved.list.length; i++) {
      var s = saved.list[i];
      var content = '';
      var fromDisk = false;
      var stFromDisk = null;
      if (s.path && window.desktop) {
        var r = await window.desktop.readPath(s.path);
        if (!r.error) { content = r.content; fromDisk = true; stFromDisk = r.st || null; }
      }
      var d = await readDraft(s.id);
      var dirty = false;
      if (d && d.t && d.t !== content) { content = d.t; dirty = true; }
      else if (d && d.t && !fromDisk) { content = d.t; dirty = s.dirty ? true : false; }
      else if (d && d.t && d.t === content && fromDisk) { clearDraft(s.id); }
      var t = newTabObj(s.name, content, s.path, null);
      t.id = s.id;
      if (stFromDisk) t.st = stFromDisk;
      var n = parseInt(s.id.slice(1), 10);
      if (!isNaN(n) && n >= tabSeq) tabSeq = n + 1;
      tabs.push(t);
      if (dirty) t.dirty = true;
    }
    var act = tabById(saved.active) || tabs[tabs.length - 1];
    await activateTab(act);
    return;
  }
  await openIntoTab({ name: '未命名', content: WELCOME });
  setDirty(false);
}

