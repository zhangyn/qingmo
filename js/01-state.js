'use strict';
/* ---------- 全局状态 ---------- */
var vditor = null;
var ready = false;
var dark = localStorage.getItem('mde:dark') === '1';
var cmView = null;          // 代码模式编辑器（CodeMirror 6）
var cmLangComp = null;
var cmWsComp = null;        // 显示空白
var cmWrapComp = null;      // 自动换行
var editorKind = 'md';      // 'md' | 'code'
var zoomFactor = parseFloat(localStorage.getItem('mde:zoom')) || 1;
var lastEditAt = 0;
var uiWs = localStorage.getItem('mde:ws') === '1';
var uiWrap = localStorage.getItem('mde:wrap') !== '0';   // 默认开
var tabsBottom = localStorage.getItem('mde:tabsbottom') === '1';   // 页签置底（默认顶部）
var typewriter = localStorage.getItem('mde:typewriter') === '1';   // 打字机模式：光标居中滚动
var cursorHist = [];    // 光标位置历史 { tabId, from, to, line }
var cursorIdx = -1;
var navLock = false;


/* ---------- 多标签页模型 ---------- */
var tabs = [];            // { id, name, path(桌面版), fh(网页版句柄), content, dirty, scroll }
var activeId = null;
var tabSeq = 1;

function $ (id) { return document.getElementById(id); }
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._tm); toast._tm = setTimeout(function () { t.classList.remove('show'); }, 2200);
}
function activeTab() {
  for (var i = 0; i < tabs.length; i++) if (tabs[i].id === activeId) return tabs[i];
  return tabs[tabs.length - 1] || null;
}
function tabById(id) {
  for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) return tabs[i];
  return null;
}
/* 按文件名决定编辑器模式：.md 走所见即所得，其余走代码模式（CodeMirror 6） */
function kindOf(name) {
  name = name || '';
  if (/\.(md|markdown)$/i.test(name)) return { kind: 'md', lang: null };
  var m = name.match(/\.([a-z0-9]+)$/i);
  var ext = m ? m[1].toLowerCase() : '';
  var map = { java: 'java', sql: 'sql', json: 'json', xml: 'xml', html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', ts: 'javascript', tsx: 'javascript', jsx: 'javascript', py: 'python', c: 'cpp', cpp: 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp' };
  if (map[ext]) return { kind: 'code', lang: map[ext] };
  if (!ext) return { kind: /^未命名/.test(name) ? 'md' : 'code', lang: null };
  return { kind: 'code', lang: null };
}
function newTabObj(name, content, path, fh) {
  var t = { id: 't' + (tabSeq++), name: name || '未命名', path: path || null, fh: fh || null, content: content || '', dirty: false, scroll: 0 };
  var k = kindOf(name);
  t.kind = k.kind; t.lang = k.lang;
  if (t.kind === 'md' && t.content.length > 1000000) {   // 超大 md 降级为代码模式
    t.kind = 'code'; t.lang = null;
    setTimeout(function () { toast('文件较大（' + Math.round(t.content.length / 1024) + ' KB），已用代码模式打开'); }, 900);
  }
  return t;
}
function renderTabs() {
  var bar = $('tabbar');
  bar.innerHTML = '';
  tabs.forEach(function (t) {
    var d = document.createElement('div');
    d.className = 'tab' + (t.id === activeId ? ' active' : '');
    d.dataset.tab = t.id;
    d.title = t.path || t.name;
    var dot = document.createElement('span');
    dot.className = 'dot'; dot.textContent = t.dirty ? '●' : '';
    var nm = document.createElement('span');
    nm.className = 'name'; nm.textContent = docTitleOf(t);
    var x = document.createElement('span');
    x.className = 'x'; x.textContent = '×';
    x.title = '关闭 (Ctrl+W)';
    x.addEventListener('click', function (ev) { ev.stopPropagation(); closeTab(t.id); });
    d.appendChild(dot); d.appendChild(nm); d.appendChild(x);
    d.addEventListener('click', function () { if (Date.now() - lastDragEnd < 250) return; switchTab(t.id); });
    bar.appendChild(d);
  });
  persistTabs();
}
/* 标签标题：取正文第一个非空行（# 标题自动去掉井号），空文档回退到文件名 */
function docTitleOf(t, liveText) {
  if (t.kind === 'code') return t.name;   // 代码/文本文件：页签显示文件名
  var text = liveText != null ? liveText : (t.id === activeId && ready ? activeText() : t.content || '');
  var lines = text.split('\n');
  for (var i = 0; i < lines.length && i < 10; i++) {
    var L = lines[i].trim();
    if (!L) continue;
    var m = L.match(/^#{1,6}\s+(.+)$/);
    var s = (m ? m[1] : L).trim();
    return (s || t.name).slice(0, 30);
  }
  return t.name;
}
var labelTimer = null;
function scheduleLabelRefresh() {
  if (labelTimer) return;
  labelTimer = setTimeout(function () {
    labelTimer = null;
    var t = activeTab();
    if (!t || !ready) return;
    var d = docTitleOf(t, vditor.getValue());
    var el = document.querySelector('.tab.active .name');
    if (el && el.textContent !== d) el.textContent = d;
  }, 400);
}
function persistTabs() {
  try {
    localStorage.setItem('mde:tabs', JSON.stringify({
      active: activeId,
      list: tabs.map(function (t) { return { id: t.id, name: t.name, path: t.path, dirty: t.dirty }; })
    }));
  } catch (e) { /* 存储满忽略 */ }
}
function setDirty(v) {
  var t = activeTab(); if (!t) return;
  if (t.dirty !== v) { t.dirty = v; renderTabs(); }
  $('savestate').textContent = tabs.some(function (x) { return x.dirty; }) ? '● 未保存' : '';
  document.title = (v ? '● ' : '') + t.name + ' - 轻墨 QingMo';
  if (window.desktop) window.desktop.setDirty(tabs.some(function (x) { return x.dirty; }));
}

