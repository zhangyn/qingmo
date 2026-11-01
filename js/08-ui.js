'use strict';
/* ---------- 右键菜单 ---------- */
function closeCtx() { $('ctxmenu').style.display = 'none'; }
function showCtx(x, y, items) {
  var m = $('ctxmenu');
  m.innerHTML = '';
  items.forEach(function (it) {
    if (it.sep) { var d = document.createElement('div'); d.className = 'ctx-sep'; m.appendChild(d); return; }
    var b = document.createElement('div');
    b.className = 'ctx-item' + (it.danger ? ' danger' : '');
    b.textContent = it.label;
    b.addEventListener('click', function (ev) { ev.stopPropagation(); closeCtx(); it.fn(); });
    m.appendChild(b);
  });
  m.style.left = '0px'; m.style.top = '0px'; m.style.display = 'block';
  var r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
}
window.addEventListener('click', closeCtx);
window.addEventListener('scroll', closeCtx, true);
window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCtx(); });
window.addEventListener('blur', closeCtx);


/* ---------- 表格行列操作 ---------- */
function caretTo(el, atEnd) {
  var sel = window.getSelection();
  var rng = document.createRange();
  rng.selectNodeContents(el);
  rng.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(rng);
}
function vdSync(caretEl) {
  var reset = caretEl.closest('.vditor-reset');
  if (!reset) return;
  caretTo(caretEl, false);
  reset.dispatchEvent(new Event('input', { bubbles: true }));
}
function emptyCellOf(refCell) {
  var c = refCell.cloneNode(false);
  c.textContent = '';
  return c;
}
function opTable(cell, action) {
  var table = cell.closest('table');
  if (!table) return;
  var row = cell.closest('tr');
  var rows = Array.prototype.slice.call(table.rows);
  var ri = rows.indexOf(row);
  var ci = Array.prototype.indexOf.call(row.cells, cell);
  var cols = row.cells.length;

  function removeTable() {
    var next = table.nextElementSibling || table.previousElementSibling;
    var caret = next && next.closest && (next.matches('p,h1,h2,h3,h4,h5,h6,li,td,th') ? next : null);
    table.parentNode.removeChild(table);
    vdSync(caret || table.closest('.vditor-reset'));
  }
  switch (action) {
    case 'rowUp':
    case 'rowDown': {
      var nr = document.createElement('tr');
      for (var i = 0; i < cols; i++) nr.appendChild(emptyCellOf(row.cells[i]));
      if (action === 'rowUp') row.parentNode.insertBefore(nr, row);
      else if (rows[ri + 1]) rows[ri + 1].parentNode.insertBefore(nr, rows[ri + 1]);
      else row.parentNode.appendChild(nr);
      vdSync(nr.cells[Math.min(ci, cols - 1)]);
      break;
    }
    case 'rowDel': {
      if (rows.length > 2) {
        var stay = rows[ri + 1] || rows[ri - 1];
        row.parentNode.removeChild(row);
        vdSync(stay.cells[Math.min(ci, stay.cells.length - 1)]);
      } else removeTable();
      break;
    }
    case 'colLeft':
    case 'colRight': {
      rows.forEach(function (r) {
        var ref = r.cells[Math.min(ci, r.cells.length - 1)];
        var nc = emptyCellOf(ref);
        if (action === 'colLeft') ref.parentNode.insertBefore(nc, ref);
        else ref.parentNode.insertBefore(nc, ref.nextSibling);
      });
      vdSync(cell);
      break;
    }
    case 'colDel': {
      if (cols > 1) {
        var target = null;
        rows.forEach(function (r) {
          var idx = Math.min(ci, r.cells.length - 1);
          var ref = r.cells[idx];
          if (r === row) { var stay = r.cells[idx + 1] || r.cells[idx - 1]; target = stay; }
          ref.parentNode.removeChild(ref);
        });
        vdSync(target || cell);
      } else removeTable();
      break;
    }
    case 'tableDel': removeTable(); break;
  }
}
function showTableMenu(x, y, cell) {
  showCtx(x, y, [
    { label: '上方插入行', fn: function () { opTable(cell, 'rowUp'); } },
    { label: '下方插入行', fn: function () { opTable(cell, 'rowDown'); } },
    { sep: true },
    { label: '左侧插入列', fn: function () { opTable(cell, 'colLeft'); } },
    { label: '右侧插入列', fn: function () { opTable(cell, 'colRight'); } },
    { sep: true },
    { label: '删除行', danger: true, fn: function () { opTable(cell, 'rowDel'); } },
    { label: '删除列', danger: true, fn: function () { opTable(cell, 'colDel'); } },
    { label: '删除表格', danger: true, fn: function () { opTable(cell, 'tableDel'); } }
  ]);
}
window.addEventListener('contextmenu', function (e) {
  var inCm = e.target.closest && e.target.closest('#cmhost');
  if (inCm) {
    e.preventDefault();
    showCtx(e.clientX, e.clientY, [
      { label: '剪切', fn: function () { if (window.desktop) window.desktop.editCmd('cut'); } },
      { label: '复制', fn: function () { if (window.desktop) window.desktop.editCmd('copy'); } },
      { label: '粘贴', fn: function () { if (window.desktop) window.desktop.editCmd('paste'); } },
      { sep: true },
      { label: '全选', fn: function () { if (window.desktop) window.desktop.editCmd('selectAll'); } },
      { sep: true },
      { label: '合并一行(单引号)', fn: function () { lineTool('s'); } },
      { label: '合并一行(双引号)', fn: function () { lineTool('d'); } },
      { label: '合并一行(无引号)', fn: function () { lineTool('n'); } },
      { label: '拆分为多行', fn: function () { lineTool('split'); } },
      { sep: true },
      { label: '查找替换', fn: function () { openFind(true); } }
    ]);
    return;
  }
  var inEditor = e.target.closest && e.target.closest('.vditor-reset');
  if (!inEditor) return;
  e.preventDefault();
  var cell = e.target.closest('td,th');
  if (cell) { showTableMenu(e.clientX, e.clientY, cell); return; }
  if (window.desktop) {
    showCtx(e.clientX, e.clientY, [
      { label: '剪切', fn: function () { window.desktop.editCmd('cut'); } },
      { label: '复制', fn: function () { window.desktop.editCmd('copy'); } },
      { label: '粘贴', fn: function () { window.desktop.editCmd('paste'); } },
      { sep: true },
      { label: '全选', fn: function () { window.desktop.editCmd('selectAll'); } }
    ]);
  }
});


/* ---------- 查找与替换 ---------- */
var findState = { query: '', caseSensitive: false, regex: false, lineEdge: '', ranges: [], idx: -1, open: false, replaceVisible: false };
function findBarEl() { return $('findbar'); }
function findRegex() {
  try { return new RegExp(findState.query, 'g' + (findState.caseSensitive ? '' : 'i')); }
  catch (e) { $('find-count').textContent = '正则无效'; return null; }
}
function applyLineEdge(mode) {
  var ins = $('replace-input').value;
  var lines = activeText().split('\n').map(function (L) { return mode === 'start' ? ins + L : L + ins; });
  setEditorText(lines.join('\n'));
  setDirty(true);
  toast(mode === 'start' ? '已插入到每行行首' : '已追加到每行行尾');
}

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function countOccurrences(text, needle, caseSensitive) {
  if (!needle) return 0;
  var hay = caseSensitive ? text : text.toLowerCase();
  var nd = caseSensitive ? needle : needle.toLowerCase();
  var n = 0, pos = 0;
  while ((pos = hay.indexOf(nd, pos)) >= 0) { n++; pos += nd.length; }
  return n;
}
function clearSearchHighlights() {
  if (window.CSS && CSS.highlights) { CSS.highlights.delete('mde-hits'); CSS.highlights.delete('mde-cur'); }
  findState.ranges = []; findState.idx = -1;
  $('find-count').textContent = '0/0';
}
function openFind(withReplace) {
  findState.open = true;
  if (withReplace) findState.replaceVisible = true;
  findBarEl().classList.add('show');
  $('replace-row').style.display = findState.replaceVisible ? 'flex' : 'none';
  var fi = $('find-input');
  fi.focus(); fi.select();
  runSearch(true);
}
function closeFind() {
  findState.open = false;
  findBarEl().classList.remove('show');
  if (isCodeMode() && cmView) cmView.dispatch({ effects: CM6.setSearchQuery.of(new CM6.SearchQuery({ search: '' })) });
  clearSearchHighlights();
}
function syncLineEdgeBtns() {
  $('repl-ls').classList.toggle('on', findState.lineEdge === 'start');
  $('repl-le').classList.toggle('on', findState.lineEdge === 'end');
}
$('find-regex').addEventListener('click', function () {
  findState.regex = !findState.regex;
  this.classList.toggle('on', findState.regex);
  runSearch(true);
});
$('repl-ls').addEventListener('click', function () {
  findState.lineEdge = findState.lineEdge === 'start' ? '' : 'start';
  syncLineEdgeBtns();
});
$('repl-le').addEventListener('click', function () {
  findState.lineEdge = findState.lineEdge === 'end' ? '' : 'end';
  syncLineEdgeBtns();
});
/* 把编辑器文本按块级元素分段（匹配不允许跨块），返回每段的文本与文本节点索引 */
function collectSegments(root) {
  var segs = [];
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  var cur = null, n;
  while ((n = walker.nextNode())) {
    if (!n.nodeValue) continue;
    var p = n.parentElement;
    if (!p) continue;
    if (p.closest('.vditor-ir__node') && (p.offsetParent === null || p.closest('.vditor-ir__marker--info'))) continue; // 跳过隐藏层与语言标记
    var block = p.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,dt,dd,pre,blockquote') || root;
    if (!cur || cur.block !== block) { cur = { block: block, nodes: [], text: '' }; segs.push(cur); }
    cur.nodes.push({ node: n, start: cur.text.length });
    cur.text += n.nodeValue;
  }
  return segs;
}
function offsetToRange(seg, start, end) {
  var r = document.createRange();
  var i = 0;
  while (i < seg.nodes.length && seg.nodes[i].start <= start) i++;
  var sn = seg.nodes[i - 1];
  r.setStart(sn.node, start - sn.start);
  i = 0;
  while (i < seg.nodes.length && seg.nodes[i].start < end) i++;
  var en = seg.nodes[i - 1];
  r.setEnd(en.node, end - en.start);
  return r;
}
function runSearch(keepNearCaret) {
  var q = $('find-input').value;
  findState.query = q;
  if (isCodeMode()) {                 // 代码模式：交给 CM6 搜索（自带高亮与跳转）
    findState.ranges = [];
    findState.idx = -1;
    if (cmView) {
      var query = new CM6.SearchQuery({ search: q, caseSensitive: findState.caseSensitive, regexp: findState.regex, replace: $('replace-input').value });
      cmView.dispatch({ effects: CM6.setSearchQuery.of(query) });
      if (findState.regex && q) {
        var re = findRegex();
        findState.cmCount = re ? (cmView.state.doc.toString().match(re) || []).length : 0;
      } else {
        findState.cmCount = countOccurrences(cmView.state.doc.toString(), q, findState.caseSensitive);
      }
      findState.cmPos = q ? 1 : 0;
    } else { findState.cmCount = 0; findState.cmPos = 0; }
    $('find-count').textContent = q ? findState.cmCount + ' 处' : '0/0';
    return;
  }
  findState.ranges = [];
  var root = document.querySelector('.vditor-ir .vditor-reset');   // 页面有多个 .vditor-reset（含隐藏模板），只取编辑区那个
  if (q && root) {
    var segs = collectSegments(root);
    var re = null;
    if (findState.regex) {
      re = findRegex();
      if (!re) return;
    }
    segs.forEach(function (seg) {
      if (re) {
        re.lastIndex = 0;
        var m;
        while ((m = re.exec(seg.text))) {
          if (!m[0].length) { re.lastIndex++; continue; }
          findState.ranges.push(offsetToRange(seg, m.index, m.index + m[0].length));
        }
      } else {
        var needle = findState.caseSensitive ? q : q.toLowerCase();
        var hay = findState.caseSensitive ? seg.text : seg.text.toLowerCase();
        var pos = 0;
        while ((pos = hay.indexOf(needle, pos)) >= 0) {
          findState.ranges.push(offsetToRange(seg, pos, pos + q.length));
          pos += q.length;
        }
      }
    });
  }
  findState.idx = -1;
  if (findState.ranges.length) {
    var idx = 0;
    var sel = window.getSelection();
    if (sel && sel.rangeCount && keepNearCaret) {
      var cr = sel.getRangeAt(0).cloneRange(); cr.collapse(false);
      for (var i = 0; i < findState.ranges.length; i++) {
        try {
          if (findState.ranges[i].compareBoundaryPoints(Range.START_TO_START, cr) >= 0) { idx = i; break; }
          idx = i;
        } catch (e) { /* 跨文档比较失败忽略 */ }
      }
    }
    findState.idx = idx;
  }
  drawSearch();
}
function drawSearch() {
  if (isCodeMode()) {
    var total = findState.cmCount || 0;
    $('find-count').textContent = (findState.query && total) ? findState.cmPos + '/' + total : (findState.query ? '0/0' : '0/0');
    return;
  }
  var n = findState.ranges.length;
  $('find-count').textContent = n ? (findState.idx + 1) + '/' + n : '0/0';
  if (window.CSS && CSS.highlights) {
    if (!n) { CSS.highlights.delete('mde-hits'); CSS.highlights.delete('mde-cur'); return; }
    var hits = [];
    for (var i = 0; i < n; i++) {
      if (i !== findState.idx && findState.ranges[i].startContainer.isConnected) hits.push(findState.ranges[i]);
    }
    var cur = findState.ranges[findState.idx];
    if (cur && cur.startContainer.isConnected) CSS.highlights.set('mde-cur', new Highlight(cur));
    else CSS.highlights.delete('mde-cur');
    if (hits.length) CSS.highlights.set('mde-hits', new (Function.prototype.bind.apply(Highlight, [null].concat(hits)))());
    else CSS.highlights.delete('mde-hits');
  } else if (n && findState.idx >= 0) {
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(findState.ranges[findState.idx]);
  }
  scrollToCurrent();
}
function scrollToCurrent() {
  var r = findState.ranges[findState.idx];
  if (!r || !r.startContainer.isConnected) return;
  var rect = r.getBoundingClientRect();
  /* 从匹配位置向上找真正可滚动的祖先（内核的实际滚动层是 .vditor-reset） */
  var el = r.startContainer.parentElement;
  while (el && el !== document.body) {
    if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
      var er = el.getBoundingClientRect();
      if (rect.top < er.top + 50 || rect.bottom > er.bottom - 20)
        el.scrollTop += rect.top - er.top - el.clientHeight / 2;
      return;
    }
    el = el.parentElement;
  }
}
function cmSyncPos() {
  /* 用当前选区估算当前是第几处匹配 */
  if (!cmView) { findState.cmPos = 0; return; }
  var q = findState.query; if (!q) { findState.cmPos = 0; return; }
  var text = cmView.state.doc.toString();
  var hay = findState.caseSensitive ? text : text.toLowerCase();
  var nd = findState.caseSensitive ? q : q.toLowerCase();
  var from = cmView.state.selection.main.from;
  var m = 0, pos = 0;
  while ((pos = hay.indexOf(nd, pos)) >= 0) {
    if (pos > from) break;
    m++; pos += Math.max(nd.length, 1);
  }
  findState.cmPos = m;
  findState.cmCount = countOccurrences(text, q, findState.caseSensitive);
}
function findNext() {
  if (isCodeMode() && cmView) {
    if (!findState.query) return;
    CM6.findNext(cmView);
    cmSyncPos(); drawSearch();
    return;
  }
  var n = findState.ranges.length; if (!n) return;
  findState.idx = (findState.idx + 1) % n;
  drawSearch();
}
function findPrev() {
  if (isCodeMode() && cmView) {
    if (!findState.query) return;
    CM6.findPrevious(cmView);
    cmSyncPos(); drawSearch();
    return;
  }
  var n = findState.ranges.length; if (!n) return;
  findState.idx = (findState.idx - 1 + n) % n;
  drawSearch();
}
function vdSyncCaret(el) {
  var reset = el.closest ? el.closest('.vditor-reset') : null;
  if (!reset) return;
  caretTo(el, true);
  reset.dispatchEvent(new Event('input', { bubbles: true }));
}
function replaceCurrent() {
  if (findState.lineEdge) { applyLineEdge(findState.lineEdge); return; }
  if (isCodeMode() && cmView) {
    var query = new CM6.SearchQuery({ search: findState.query, caseSensitive: findState.caseSensitive, regexp: findState.regex, replace: $('replace-input').value });
    cmView.dispatch({ effects: CM6.setSearchQuery.of(query) });
    CM6.findNext(cmView);      // 先让光标落在匹配上，replaceNext 才会生效
    CM6.replaceNext(cmView);
    cmSyncPos(); drawSearch();
    return;
  }
  if (findState.regex) {       // md 模式正则：替换文档中第一处匹配
    var textR = activeText();
    var re1 = new RegExp(findState.query, findState.caseSensitive ? '' : 'i');
    var m1 = re1.exec(textR);
    if (!m1) { toast('没有找到匹配'); return; }
    var rep1 = $('replace-input').value.replace(/\$(\d)/g, function (_, d) { return m1[Number(d)] != null ? m1[Number(d)] : ''; });
    setEditorText(textR.slice(0, m1.index) + rep1 + textR.slice(m1.index + m1[0].length));
    setDirty(true); runSearch(true); toast('已替换 1 处'); return;
  }
  if (!findState.ranges.length || findState.idx < 0) return;
  var rg = findState.ranges[findState.idx];
  if (!rg.startContainer.isConnected) { runSearch(true); if (!findState.ranges.length) return; rg = findState.ranges[findState.idx]; }
  var q = findState.query;
  var cur = rg.toString();
  var same = findState.caseSensitive ? cur === q : cur.toLowerCase() === q.toLowerCase();
  if (!same) { runSearch(true); if (!findState.ranges.length) return; rg = findState.ranges[findState.idx]; cur = rg.toString(); same = findState.caseSensitive ? cur === q : cur.toLowerCase() === q.toLowerCase(); if (!same) return; }
  var newText = $('replace-input').value;
  var host = rg.startContainer.parentElement || document.querySelector('.vditor-reset');
  rg.deleteContents();
  if (newText) rg.insertNode(document.createTextNode(newText));
  vdSyncCaret(host);
  runSearch(true);
  setTimeout(function () { if (findState.open) runSearch(true); }, 300);   // 内核重渲染后校正
}
function replaceAll() {
  var q = $('find-input').value;
  if (findState.lineEdge) { applyLineEdge(findState.lineEdge); return; }
  if (!q) return;
  var md = activeText();
  var re, rep;
  if (findState.regex) {
    try { re = new RegExp(q, 'g' + (findState.caseSensitive ? '' : 'i')); } catch (e) { toast('正则表达式无效'); return; }
    rep = $('replace-input').value;
  } else {
    re = new RegExp(escapeRegExp(q), findState.caseSensitive ? 'g' : 'gi');
    rep = $('replace-input').value.replace(/\$/g, '$$$$');
  }
  var n = (md.match(re) || []).length;
  if (!n) { toast('没有找到「' + q + '」'); return; }
  var newMd = md.replace(re, rep);
  var sc = isCodeMode() ? document.querySelector('#cmhost .cm-scroller') : document.querySelector('.vditor-ir');
  var st = sc ? sc.scrollTop : 0;
  setEditorText(newMd);
  setTimeout(function () {
    if (sc) sc.scrollTop = st;
    runSearch();
  }, 300);
  setDirty(true);
  toast('已替换 ' + n + ' 处（Ctrl+Z 可一步撤销）');
}
var findRefreshT = null;
function scheduleFindRefresh() {
  if (findRefreshT) return;
  findRefreshT = setTimeout(function () { findRefreshT = null; if (findState.open) runSearch(true); }, 400);
}
$('find-input').addEventListener('input', function () {
  clearTimeout(findState._t);
  findState._t = setTimeout(function () { runSearch(false); }, 200);
});
$('find-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? findPrev() : findNext(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('replace-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('find-next').addEventListener('click', findNext);
$('find-prev').addEventListener('click', findPrev);
$('find-close').addEventListener('click', closeFind);
$('find-case').addEventListener('click', function () {
  findState.caseSensitive = !findState.caseSensitive;
  this.classList.toggle('on', findState.caseSensitive);
  runSearch(true);
});
$('repl-one').addEventListener('click', replaceCurrent);
$('repl-all').addEventListener('click', replaceAll);

