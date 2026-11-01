'use strict';
/* ---------- 代码模式（CodeMirror 6） ---------- */
function cmEnsure(t) {
  if (cmView) return cmView;
  cmLangComp = new CM6.Compartment();
  cmWsComp = new CM6.Compartment();
  cmWrapComp = new CM6.Compartment();
  cmView = new CM6.EditorView({
    doc: '',
    parent: $('cmhost'),
    extensions: [
      CM6.lineNumbers(),
      CM6.highlightActiveLineGutter(),
      CM6.highlightActiveLine(),
      CM6.drawSelection(),
      CM6.dropCursor(),
      CM6.bracketMatching(),
      CM6.foldGutter(),
      CM6.history(),
      CM6.closeBrackets(),
      CM6.keymap.of(CM6.closeBracketsKeymap),
      CM6.keymap.of(LINE_KEYMAP),
      CM6.keymap.of([CM6.defaultKeymap, CM6.historyKeymap, CM6.foldKeymap, CM6.indentWithTab]),
      CM6.search(),
      CM6.highlightSelectionMatches(),

      CM6.syntaxHighlighting(CM6.defaultHighlightStyle, { fallback: true }),
      cmWsComp.of(uiWs ? [CM6.highlightWhitespace(), CM6.highlightTrailingWhitespace()] : []),
      cmWrapComp.of(uiWrap ? CM6.EditorView.lineWrapping : []),
      cmLangComp.of(t && t.lang && CM6.langs[t.lang] ? CM6.langs[t.lang]() : []),
      CM6.EditorView.updateListener.of(function (u) {
        if (!ready) return;
        if (u.docChanged) {
          lastEditAt = Date.now();
          setDirty(true); scheduleLabelRefresh(); scheduleFindRefresh();
          cmTypewriterCenter(u);
          if (Date.now() - __kbSelfAt > 500) kbBlockCancel();   // 非列块自身发起的文档变更（撤销/外部编辑等）取消块状态
          if (activeTab() && activeTab().kind === 'code' && cursorHist.length) {
            var top = cursorHist[cursorIdx];
            if (top && top.tabId === activeId && top.from != null) { var sel2 = u.state.selection.main; top.from = sel2.from; top.to = sel2.to; top.line = u.state.doc.lineAt(sel2.head).number; }
          }
        } else if (u.selectionSet) {
          recordCodeJump();
          if (Date.now() - __kbSelfAt > 500) kbBlockCancel();   // 非列块自身发起的选区变更（点击/查找跳转等）取消块状态
        }
      })
    ]
  });
  return cmView;
}
function cmSetLang(langName) {
  if (!cmView || !cmLangComp) return;
  var ext = (langName && CM6.langs[langName]) ? CM6.langs[langName]() : [];
  cmView.dispatch({ effects: cmLangComp.reconfigure(ext) });
}
function applyEditorKind(t) {
  var kind = (t && t.kind) || 'md';
  editorKind = kind;
  document.body.classList.toggle('code-mode', kind === 'code');
  applyOutline();
  if (kind === 'code') {
    cmEnsure(t);
    cmSetLang(t.lang);
    setTimeout(function () { if (cmView) cmView.requestMeasure(); }, 0);
  }
}
function isCodeMode() { return editorKind === 'code'; }
function activeText() {
  return isCodeMode() ? cmView.state.doc.toString() : vditor.getValue();
}
function setEditorText(text) {
  if (isCodeMode()) cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: text } });
  else return vditor.setValue(text);
}
function applyZoom() {
  localStorage.setItem('mde:zoom', String(zoomFactor));
  document.documentElement.style.setProperty('--code-zoom', String(zoomFactor));
  var reset = document.querySelector('.vditor-ir .vditor-reset');
  if (reset) reset.style.fontSize = (16 * zoomFactor) + 'px';
  syncCodeTools();
}
window.addEventListener('wheel', function (e) {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomFactor = Math.min(3, Math.max(0.5, zoomFactor * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
  applyZoom();
}, { passive: false });


/* ---------- 代码模式工具栏 ---------- */
function syncCodeTools() {
  var ws = $('ct-ws'), wr = $('ct-wrap'), zm = $('ct-zoom');
  if (!ws) return;
  ws.classList.toggle('on', uiWs);
  wr.classList.toggle('on', uiWrap);
  zm.textContent = Math.round(zoomFactor * 100) + '%';
}
function jsonFormat() {
  if (!isCodeMode()) { toast('JSON 格式化请在代码模式使用'); return; }
  var sel = cmView.state.selection.main;
  var hasSel = sel.from !== sel.to;
  var text = cmView.state.doc.sliceString(hasSel ? sel.from : 0, hasSel ? sel.to : cmView.state.doc.length);
  var parsed;
  try { parsed = tolerantJsonParse(text); } catch (e) { toast('JSON 解析失败：' + e.message); return; }
  var out = JSON.stringify(parsed, null, 2);
  if (hasSel) cmView.dispatch({ changes: { from: sel.from, to: sel.to, insert: out } });
  else setEditorText(out);
  setDirty(true);
  toast('JSON 已格式化');
}
function jsonMin() {
  if (!isCodeMode()) { toast('JSON 压缩请在代码模式使用'); return; }
  var text = activeText();
  var parsed;
  try { parsed = tolerantJsonParse(text); } catch (e) { toast('JSON 解析失败：' + e.message); return; }
  setEditorText(JSON.stringify(parsed));
  setDirty(true);
  toast('JSON 已压缩');
}
$('ct-json').addEventListener('click', function () { jsonFormat(); });
$('ct-jsonmin').addEventListener('click', function () { jsonMin(); });
$('ct-ws').addEventListener('click', function () { ACTIONS['toggle-ws'](); });
$('ct-wrap').addEventListener('click', function () { ACTIONS['toggle-wrap'](); });
$('ct-qs').addEventListener('click', function () { lineTool('s'); });
$('ct-qd').addEventListener('click', function () { lineTool('d'); });
$('ct-qn').addEventListener('click', function () { lineTool('n'); });
$('ct-split').addEventListener('click', function () { lineTool('split'); });
$('ct-find').addEventListener('click', function () { openFind(true); });
$('ct-zoom-in').addEventListener('click', function () { zoomFactor = Math.min(3, zoomFactor * 1.1); applyZoom(); });
$('ct-zoom-out').addEventListener('click', function () { zoomFactor = Math.max(0.5, zoomFactor / 1.1); applyZoom(); });


/* ---------- 行快捷键（EditPlus 式） ---------- */
function cmdCopyLine(view) {
  var line = view.state.doc.lineAt(view.state.selection.main.head);
  view.dispatch({ selection: { anchor: line.from, head: line.to } });
  document.execCommand('copy');
  view.dispatch({ selection: { anchor: view.state.selection.main.head } });
  toast('已复制当前行');
  return true;
}
function cmdCutLine(view) {
  var line = view.state.doc.lineAt(view.state.selection.main.head);
  var to = Math.min(line.to + 1, view.state.doc.length);   // 连同换行一起剪
  view.dispatch({ selection: { anchor: line.from, head: to } });
  document.execCommand('cut');
  return true;
}
var LINE_KEYMAP = [
  { key: 'Tab', run: function (v) { v.dispatch(v.state.replaceSelection('	')); return true; } },
  { key: 'Shift-Tab', run: function (v) { CM6.indentLess(v); return true; } },
  { key: 'Ctrl-y', run: function (v) { CM6.deleteLine(v); return true; } },
  { key: 'Ctrl-d', run: function (v) { CM6.copyLineDown(v); return true; } },
  { key: 'Ctrl-Shift-ArrowUp', run: function (v) { CM6.moveLineUp(v); return true; } },
  { key: 'Ctrl-Shift-ArrowDown', run: function (v) { CM6.moveLineDown(v); return true; } },
  { key: 'Alt-ArrowDown', run: function (v) { return kbBlockArrow(1, 0); } },
  { key: 'Alt-ArrowUp', run: function (v) { return kbBlockArrow(-1, 0); } },
  { key: 'Alt-ArrowRight', run: function (v) { return kbBlockArrow(0, 1); } },
  { key: 'Alt-ArrowLeft', run: function (v) { return kbBlockArrow(0, -1); } },
  { any: function (v, e) { return kbBlockKey(e); } },
  { key: 'Ctrl-c', run: function (v) { if (kbBlock) return false;   // 列块激活时交给 any → kbBlockKey 复制列文本
      if (!v.state.selection.main.empty) return false; return cmdCopyLine(v); } },
  { key: 'Ctrl-x', run: function (v) { if (kbBlock) return false;
      if (!v.state.selection.main.empty) return false; return cmdCutLine(v); } }
];


/* ---------- 行工具：合并/拆分（多行单号 → SQL/接口参数） ---------- */
function lineTool(op) {
  if (!isCodeMode()) { toast('行工具请在代码模式（非 .md 文件）下使用'); return; }
  var sel = cmView.state.selection.main;
  var hasSel = sel.from !== sel.to;
  var l = cmView.state.doc.lineAt(sel.from);
  var r = cmView.state.doc.lineAt(sel.to);
  var from = hasSel ? l.from : 0;                       // 未选中：处理整个文档
  var to = hasSel ? r.to : cmView.state.doc.length;
  var seg = cmView.state.doc.sliceString(from, to);
  var lines = seg.split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x !== ''; });
  var out, tip;
  if (op === 'split') {
    out = lines.join('\n').split(/[,，;；\t]/)
      .map(function (x) { return x.replace(/^['"\s]+|['"\s]+$/g, ''); })
      .filter(function (x) { return x !== ''; }).join('\n');
    tip = '已拆分为多行';
  } else {
    var q = op === 's' ? "'" : (op === 'd' ? '"' : '');
    out = lines.map(function (x) { return q + x + q; }).join(',');
    tip = '已合并为一行（' + (op === 's' ? '单引号' : op === 'd' ? '双引号' : '无引号') + '）';
  }
  cmView.dispatch({ changes: { from: from, to: to, insert: out } });
  setDirty(true);
  toast(tip);
}



/* ---------- 列块选择与编辑（EditPlus 式：Alt+方向键 / Win+拖拽；覆盖层高亮+按键拦截，不依赖多光标） ---------- */
var kbBlock = null;      // { sLine, sCol, hLine, hCol } 起始角与移动角
var colDrag = null;      // Win+拖拽进行中
var __kbSelfAt = 0;      // 列块自身事务的时间戳（延迟二段更新不计为外部变更）
var colBlockLayer = null;
function colBlockLayerEl() {
  if (!colBlockLayer) {
    colBlockLayer = document.createElement('div');
    colBlockLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden';
    document.body.appendChild(colBlockLayer);
  }
  return colBlockLayer;
}
function kbBlockCancel() {
  if (!kbBlock) return;
  kbBlock = null; colDrag = null;
  if (colBlockLayer) colBlockLayer.innerHTML = '';
}
function blockCorners(doc) {
  return {
    fromL: Math.min(kbBlock.sLine, kbBlock.hLine), toL: Math.max(kbBlock.sLine, kbBlock.hLine),
    cL: Math.min(kbBlock.sCol, kbBlock.hCol), cR: Math.max(kbBlock.sCol, kbBlock.hCol)
  };
}
function drawColBlockOverlay() {
  if (!cmView || !kbBlock) { if (colBlockLayer) colBlockLayer.innerHTML = ''; return; }
  var layer = colBlockLayerEl();
  layer.innerHTML = '';
  var doc = cmView.state.doc;
  var c = blockCorners(doc);
  var lh = null;
  for (var ln = c.fromL; ln <= c.toL; ln++) {
    var line = doc.line(ln);
    var f = cmView.coordsAtPos(line.from + Math.min(c.cL, line.length));
    var t = cmView.coordsAtPos(line.from + Math.min(c.cR, line.length));
    if (!f || !t) continue;
    var rect = document.createElement('div');
    var left = Math.min(f.left, t.left), right = Math.max(f.left, t.left);
    rect.style.cssText = 'position:fixed;pointer-events:none;background:rgba(126,160,255,.30);' +
      'left:' + left + 'px;top:' + f.top + 'px;width:' + Math.max(2, right - left) + 'px;height:' + (f.bottom - f.top) + 'px';
    layer.appendChild(rect);
    lh = f.bottom - f.top;
  }
}
function renderColBlock() {
  if (!cmView || !kbBlock) return;
  var doc = cmView.state.doc;
  var hl = doc.line(Math.min(kbBlock.hLine, doc.lines));
  __kbSelfAt = Date.now();
  cmView.dispatch({
    selection: { anchor: hl.from + Math.min(kbBlock.hCol, hl.length) },
    scrollIntoView: true
  });
  drawColBlockOverlay();
}
function kbBlockArrow(dl, dc) {
  if (!cmView || !isCodeMode()) return false;
  var doc = cmView.state.doc;
  if (!kbBlock) {
    var sel = cmView.state.selection.main;
    var aL = doc.lineAt(sel.anchor), hL = doc.lineAt(sel.head);
    kbBlock = { sLine: aL.number, sCol: sel.anchor - aL.from, hLine: hL.number, hCol: sel.head - hL.from };
  }
  kbBlock.hLine = Math.max(1, Math.min(kbBlock.hLine + dl, doc.lines));
  kbBlock.hCol = Math.max(0, kbBlock.hCol + dc);
  if (kbBlock.hLine === kbBlock.sLine && kbBlock.hCol === kbBlock.sCol && !dc) {
    var l0 = doc.line(kbBlock.sLine), at = l0.from + kbBlock.sCol;
    kbBlockCancel();
    cmView.dispatch({ selection: { anchor: at } });
    return true;
  }
  renderColBlock();
  return true;
}
/* 列块内逐行编辑：insert(单字符) / backspace / delete */
function editColBlock(op, ch) {
  var doc = cmView.state.doc;
  var c = blockCorners(doc);
  var changes = [];
  for (var ln = c.fromL; ln <= c.toL; ln++) {
    var line = doc.line(ln);
    var f = line.from + Math.min(c.cL, line.length), t = line.from + Math.min(c.cR, line.length);
    if (op === 'insert') changes.push({ from: f, to: t, insert: ch });
    else if (op === 'backspace') { if (c.cL === c.cR) { if (f === line.from) continue; f = f - 1; } changes.push({ from: f, to: t }); }
    else if (op === 'delete') { if (c.cL === c.cR && t >= line.to) continue; changes.push({ from: f, to: c.cL === c.cR ? Math.min(t + 1, line.to) : t }); }
  }
  if (!changes.length) return;
  if (op === 'insert') { kbBlock.sCol = c.cL + 1; kbBlock.hCol = c.cR + 1; }   // 块跟随键入文本右移：连续键入为插入语义
  if (op === 'backspace' && c.cL === c.cR && c.cL > 0) { kbBlock.sCol = c.cL - 1; kbBlock.hCol = c.cR - 1; }
  if ((op === 'backspace' || op === 'delete') && c.cL < c.cR) { var m = Math.min(kbBlock.sCol, kbBlock.hCol); kbBlock.sCol = m; kbBlock.hCol = m; }
  __kbSelfAt = Date.now();
  var hl = doc.line(Math.min(kbBlock.hLine, doc.lines));
  cmView.dispatch({
    changes: changes,
    selection: { anchor: hl.from + Math.min(kbBlock.hCol, hl.length) }
  });
  drawColBlockOverlay();
}
function colBlockText() {
  var doc = cmView.state.doc;
  var c = blockCorners(doc);
  var ls = [];
  for (var ln = c.fromL; ln <= c.toL; ln++) {
    var line = doc.line(ln);
    ls.push(line.text.slice(Math.min(c.cL, line.length), Math.min(c.cR, line.length)));
  }
  return ls.join('\n');
}
function deleteColBlock() {
  var doc = cmView.state.doc;
  var c = blockCorners(doc);
  var changes = [];
  for (var ln = c.fromL; ln <= c.toL; ln++) {
    var line = doc.line(ln);
    if (c.cL < c.cR || c.cR < line.length) changes.push({ from: line.from + Math.min(c.cL, line.length), to: line.from + Math.min(c.cR, line.length) });
  }
  if (changes.length) { __kbSelfAt = Date.now(); cmView.dispatch({ changes: changes }); }
  kbBlock.hCol = Math.min(kbBlock.sCol, kbBlock.hCol); kbBlock.sCol = kbBlock.hCol;
  drawColBlockOverlay();
}
/* 块激活期间的按键分发（CM6 keymap any 入口） */
function copyColToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function () { fallbackCopyText(text); });
  } else fallbackCopyText(text);
}
function fallbackCopyText(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* ignore */ }
  ta.remove();
}
function kbBlockKey(e) {
  if (!kbBlock || !cmView || !isCodeMode()) return false;
  var k = e.key || '';
  if (e.altKey && /^Arrow/.test(k)) return false;              // 列块移动，交给上面的绑定
  if (k === 'Escape') { kbBlockCancel(); return true; }
  if (e.ctrlKey || e.metaKey) {
    var low = k.toLowerCase();
    if (low === 'c') { copyColToClipboard(colBlockText()); return true; }
    if (low === 'x') { var txt = colBlockText(); copyColToClipboard(txt); deleteColBlock(); return true; }
    kbBlockCancel(); return false;                             // 其余组合键走默认（docChanged 会清理）
  }
  if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight') { kbBlockCancel(); return false; }
  if (k === 'Backspace') { editColBlock('backspace'); return true; }
  if (k === 'Delete') { editColBlock('delete'); return true; }
  if (k === 'Enter' || k === 'Tab') { kbBlockCancel(); return false; }
  if (k.length === 1) { editColBlock('insert', k); return true; }
  kbBlockCancel(); return false;                               // IME 组合键等：退出列块走默认
}
/* 鼠标事件 → 文档位置（列块拖选用） */
function colPosAt(e) {
  if (!cmView) return null;
  try { return cmView.posAtCoords({ x: e.clientX, y: e.clientY }) || null; }
  catch (err) { return null; }
}
/* Win+拖拽建立/调整列块（鼠标路径） */
$('cmhost').addEventListener('mousedown', function (e) {
  kbBlockCancel();
  if (e.button !== 0 || !(e.metaKey || e.altKey) || !isCodeMode()) return;   // Win 或 Alt 均可启动列块拖选
  var pos = colPosAt(e);
  if (pos == null) return;
  e.preventDefault();
  e.stopPropagation();         // 捕获阶段阻断 CM6 自带拖选
  if (!cmView.hasFocus) cmView.focus();
  var doc = cmView.state.doc, L = doc.lineAt(pos);
  kbBlock = { sLine: L.number, sCol: pos - L.from, hLine: L.number, hCol: pos - L.from };
  colDrag = true;
  renderColBlock();
}, true);
window.addEventListener('mousemove', function (e) {
  if (!colDrag || !cmView) return;
  e.preventDefault();
  var pos = colPosAt(e);
  if (pos == null) return;
  var doc = cmView.state.doc, L = doc.lineAt(pos);
  kbBlock.hLine = L.number; kbBlock.hCol = pos - L.from;
  renderColBlock();
});
window.addEventListener('mouseup', function () { colDrag = null; });
/* 滚动/窗口变化 → 覆盖层跟随 */
$('cmhost').addEventListener('scroll', function () { if (kbBlock) drawColBlockOverlay(); }, true);
window.addEventListener('resize', function () { if (kbBlock) drawColBlockOverlay(); });
/* 块激活时拦截粘贴：逐行分发 */
document.querySelector('#cmhost').addEventListener('paste', function (e) {
  if (!kbBlock || !isCodeMode()) return;
  var text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
  if (!text) return;
  e.preventDefault(); e.stopPropagation();
  var doc = cmView.state.doc;
  var c = blockCorners(doc);
  var pl = text.split('\n'), n = c.toL - c.fromL + 1, changes = [];
  for (var ln = c.fromL; ln <= c.toL; ln++) {
    var line = doc.line(ln);
    var ins = pl.length === n ? pl[ln - c.fromL] : pl.join(' ');
    changes.push({ from: line.from + Math.min(c.cL, line.length), to: line.from + Math.min(c.cR, line.length), insert: ins });
  }
  var width = Math.max.apply(null, changes.map(function (c2) { return c2.insert.length; }));
  kbBlock.sCol = c.cL; kbBlock.hCol = c.cL + width;
  __kbSelfAt = Date.now();
  cmView.dispatch({ changes: changes });
  drawColBlockOverlay();
}, true);
