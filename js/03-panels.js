'use strict';
/* ---------- 大纲侧栏（md 模式） ---------- */
var outlineVisible = localStorage.getItem('mde:outline') === '1';
var outlineT = null;
function toggleOutline() {
  if (isCodeMode()) { toast('大纲仅 Markdown 文件支持'); return; }
  outlineVisible = !outlineVisible;
  localStorage.setItem('mde:outline', outlineVisible ? '1' : '0');
  applyOutline();
}
function applyOutline() {
  var aside = document.getElementById('outline'); if (!aside) return;
  aside.style.display = (outlineVisible && !isCodeMode()) ? 'block' : 'none';
  if (outlineVisible && !isCodeMode()) refreshOutline();
}
function refreshOutline() {
  if (!outlineVisible || isCodeMode() || !ready) return;
  var list = document.getElementById('outline-list'); if (!list) return;
  list.innerHTML = '';
  var HS = '.vditor-ir .vditor-reset > h1, .vditor-ir .vditor-reset > h2, .vditor-ir .vditor-reset > h3, .vditor-ir .vditor-reset > h4, .vditor-ir .vditor-reset > h5, .vditor-ir .vditor-reset > h6';
  var heads = document.querySelectorAll(HS);
  for (var i = 0; i < heads.length; i++) {
    (function (h, i2) {
      var lv = Number(h.tagName.slice(1));
      var d = document.createElement('div');
      d.className = 'ol-item';
      d.style.paddingLeft = (12 + (lv - 1) * 14) + 'px';
      d.textContent = h.textContent.replace(/^#+\s*/, '').trim().slice(0, 50) || '（空标题）';
      d.addEventListener('click', function () {
        var hs = document.querySelectorAll(HS);
        if (hs[i2]) hs[i2].scrollIntoView({ block: 'start' });
      });
      list.appendChild(d);
    })(heads[i], i);
  }
  if (!heads.length) list.innerHTML = '<div style="padding:8px 12px;opacity:.5">文档中没有标题</div>';
}
function scheduleOutlineRefresh() {
  clearTimeout(outlineT);
  outlineT = setTimeout(refreshOutline, 600);
}


/* ---------- 最近打开 ---------- */
function getRecent() { try { return JSON.parse(localStorage.getItem('mde:recent') || '[]'); } catch (e) { return []; } }
function addRecent(p) {
  if (!p) return;
  var list = getRecent().filter(function (x) { return x !== p; });
  list.unshift(p);
  if (list.length > 15) list.length = 15;
  try { localStorage.setItem('mde:recent', JSON.stringify(list)); } catch (e) {}
}
function openRecent(p) {
  if (!window.desktop) { toast('最近打开仅桌面版支持'); return; }
  window.desktop.readPath(p).then(function (r) {
    if (r.error) { removeRecent(p); toast('文件已不存在：' + p); return; }
    var exist = tabs.filter(function (t) { return t.path === p; })[0];
    if (exist) return switchTab(exist.id);
    var NM = String.fromCharCode(92);
    openIntoTab({ name: p.split(new RegExp('[' + NM + '/]')).pop(), content: r.content, path: p, enc: r.enc })
      .then(function (nt) { if (nt && r.st) nt.st = r.st; });
    addRecent(p);
  });
}
function removeRecent(p) {
  try { localStorage.setItem('mde:recent', JSON.stringify(getRecent().filter(function (x) { return x !== p; }))); } catch (e) {}
}


/* ---------- JSON 容错解析（容忍注释） ---------- */
function stripJsonComments(text) {
  var out = '', i = 0, inStr = false, esc = false, NL = String.fromCharCode(10), BS = String.fromCharCode(92);
  while (i < text.length) {
    var c = text.charAt(i);
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === BS) esc = true;
      else if (c === '"') inStr = false;
      i++; continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === '/' && text.charAt(i + 1) === '/') { while (i < text.length && text.charAt(i) !== NL) i++; continue; }
    if (c === '/' && text.charAt(i + 1) === '*') { i += 2; while (i < text.length && !(text.charAt(i) === '*' && text.charAt(i + 1) === '/')) i++; i += 2; out += ' '; continue; }
    out += c; i++;
  }
  return out;
}
function tolerantJsonParse(text) {
  try { return JSON.parse(text); } catch (e1) {
    return JSON.parse(stripJsonComments(text));
  }
}


/* ---------- 光标位置历史（Ctrl+Alt+←/→ 回退/前进） ---------- */
function pushCursorEntry(e) {
  if (navLock || !e) return;
  var top = cursorHist[cursorIdx];
  if (top && top.tabId === e.tabId && top.from === e.from && top.to === e.to) { cursorIdx = cursorHist.length - 1; return; }
  cursorHist.splice(cursorIdx + 1);
  cursorHist.push(e);
  if (cursorHist.length > 300) cursorHist.shift();
  cursorIdx = cursorHist.length - 1;
}
function recordCodeJump() {
  if (navLock || !isCodeMode() || !cmView || !ready) return;
  var sel = cmView.state.selection.main;
  var line = cmView.state.doc.lineAt(sel.head).number;
  var top = cursorHist[cursorIdx];
  if (top && top.tabId === activeId && top.line === line) { top.from = sel.from; top.to = sel.to; return; }
  pushCursorEntry({ tabId: activeId, from: sel.from, to: sel.to, line: line });
}
function pushTabCursor(t) {
  if (navLock || !t || !ready) return;
  var pos = null;
  if (t.kind === 'code' && cmView) { var sel = cmView.state.selection.main; pos = { from: sel.from, to: sel.to, line: cmView.state.doc.lineAt(sel.head).number }; }
  var top = cursorHist[cursorIdx];
  if (top && top.tabId === t.id) { if (pos) { top.from = pos.from; top.to = pos.to; top.line = pos.line; } return; }
  pushCursorEntry({ tabId: t.id, from: pos ? pos.from : null, to: pos ? pos.to : null, line: pos ? pos.line : null });
}
async function navRestore(e) {
  navLock = true;
  try {
    if (e.tabId !== activeId) {
      if (!tabById(e.tabId)) { toast('该位置所属的标签已关闭'); return; }
      await switchTab(e.tabId);
    }
    if (e.from != null && isCodeMode() && cmView) {
      cmView.dispatch({ selection: { anchor: e.from, head: e.to || e.from }, scrollIntoView: true });
    }
  } finally { setTimeout(function () { navLock = false; }, 60); }
}
function cursorBack() {
  if (cursorIdx <= 0) { toast('没有更早的光标位置'); return; }
  var i = cursorIdx;
  while (i > 0) {
    i--;
    var e = cursorHist[i];
    if (e && e.from != null && tabById(e.tabId)) { cursorIdx = i; navRestore(e); return; }
  }
  toast('没有更早的光标位置');
}
function cursorFwd() {
  if (cursorIdx >= cursorHist.length - 1) { toast('已经在最后的位置'); return; }
  var i = cursorIdx;
  while (i < cursorHist.length - 1) {
    i++;
    var e = cursorHist[i];
    if (e && e.from != null && tabById(e.tabId)) { cursorIdx = i; navRestore(e); return; }
  }
  toast('已经在最后的位置');
}

