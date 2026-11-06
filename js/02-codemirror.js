'use strict';
/* ---------- 调试输出 ----------
   仅在带 ?debug 打开时生效（主进程用 --qingmo-debug 启动才会传这个参数），
   生产环境完全静默：避免拖拽路径上每个事件都走一次 console → 主进程同步写盘 */
var MDE_DEBUG = location.search.indexOf('debug') >= 0;
function dbg() {
  if (!MDE_DEBUG) return;
  try { console.log.apply(console, arguments); } catch (e) { /* ignore */ }
}

/* ---------- 代码模式（CodeMirror 6） ----------
   每个标签页各持一个 EditorState（切页时 setState，见 js/06-session.js）：
   撤销栈、选区、折叠状态都不再在标签之间串味，切页也不需要整篇替换文档。
   内存：只缓存最近 CM_STATE_MAX 个 state，超出的按最久未用淘汰
   （被淘汰的标签丢掉的是撤销历史，正文仍保存在 t.content 里）。 */
var CM_STATE_MAX = 12;
var cmStateOrder = [];                  // 最近使用的 tab.id，末尾最新
var langExtCache = Object.create(null);

function langExtOf(lang) {
  if (!lang || !CM6.langs || !CM6.langs[lang]) return [];
  if (!langExtCache[lang]) langExtCache[lang] = CM6.langs[lang]();   // LanguageSupport 可跨 state 共享
  return langExtCache[lang];
}
function cmInitCompartments() {
  if (cmLangComp) return;
  cmLangComp = new CM6.Compartment();
  cmWsComp = new CM6.Compartment();
  cmWrapComp = new CM6.Compartment();
}
function cmSharedExts() {
  return [
    CM6.lineNumbers(),
    CM6.highlightActiveLineGutter(),
    CM6.highlightActiveLine(),
    CM6.drawSelection(),
    CM6.dropCursor(),
    CM6.bracketMatching(),
    CM6.foldGutter(),
    CM6.history({ minDepth: 400, newGroupDelay: 100 }),   // 默认 newGroupDelay=500 会把 500ms 内的输入合成一步
    CM6.closeBrackets(),
    CM6.keymap.of(CM6.closeBracketsKeymap),
    CM6.keymap.of(LINE_KEYMAP),
    CM6.keymap.of([CM6.defaultKeymap, CM6.historyKeymap, CM6.foldKeymap, CM6.indentWithTab]),
    CM6.search(),
    CM6.highlightSelectionMatches(),
    CM6.syntaxHighlighting(CM6.defaultHighlightStyle, { fallback: true }),
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
        if (!colDrag && Date.now() - __kbSelfAt > 500) kbBlockCancel();   // 拖拽中的选区同步不算外部变更
      }
    })
  ];
}
/* 该标签自己的 state（首次访问时按 t.content 创建） */
function cmStateFor(t) {
  cmInitCompartments();
  if (t.cmState) { cmTouchState(t.id); return t.cmState; }
  t.cmState = CM6.EditorState.create({
    doc: t.content || '',
    extensions: cmSharedExts().concat([
      cmWsComp.of(uiWs ? [CM6.highlightWhitespace(), CM6.highlightTrailingWhitespace()] : []),
      cmWrapComp.of(uiWrap ? CM6.EditorView.lineWrapping : []),
      cmLangComp.of(langExtOf(t.lang))
    ])
  });
  cmTouchState(t.id);
  return t.cmState;
}
function cmTouchState(id) {
  var i = cmStateOrder.indexOf(id);
  if (i >= 0) cmStateOrder.splice(i, 1);
  cmStateOrder.push(id);
  while (cmStateOrder.length > CM_STATE_MAX) {
    var old = cmStateOrder[0];
    if (old === activeId) { cmStateOrder.push(cmStateOrder.shift()); break; }   // 不动当前标签
    cmStateOrder.shift();
    var ot = tabById(old);
    if (ot) ot.cmState = null;
  }
}
function cmEnsure(t) {
  if (cmView) return cmView;
  cmInitCompartments();
  cmView = new CM6.EditorView({
    state: cmStateFor(t),
    parent: $('cmhost')
  });
  return cmView;
}
/* setState 后把当前 UI 开关（lang / 空白 / 换行）重新应用到这份 state 上，
   否则新建 state 时烘焙进去的配置会落后于用户后来拨过的开关 */
function cmSyncConfig(t) {
  if (!cmView || !cmLangComp) return;
  cmView.dispatch({ effects: [
    cmLangComp.reconfigure(langExtOf(t && t.lang)),
    cmWsComp.reconfigure(uiWs ? [CM6.highlightWhitespace(), CM6.highlightTrailingWhitespace()] : []),
    cmWrapComp.reconfigure(uiWrap ? CM6.EditorView.lineWrapping : [])
  ] });
}
function applyEditorKind(t) {
  t = t || activeTab();
  var kind = (t && t.kind) || 'md';
  editorKind = kind;
  document.body.classList.toggle('code-mode', kind === 'code');
  applyOutline();
  if (kind === 'code') {
    var st = cmStateFor(t);
    cmEnsure(t);
    if (cmView.state !== st) cmView.setState(st);
    cmSyncConfig(t);
    setTimeout(function () { if (cmView) cmView.requestMeasure(); }, 0);
  }
}
function isCodeMode() { return editorKind === 'code'; }
function activeText() {
  return isCodeMode() ? cmView.state.doc.toString() : vditor.getValue();
}
function setEditorText(text) {
  if (isCodeMode()) {
    cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: text } });
  } else {
    vditor.setValue(text);
    focusEditor();          // 先把光标/选区落定，压栈内容与延迟回调才一致
    // Vditor 的 setValue 要等 undoDelay 后才把这一改压进撤销栈，
    // 用户“改完立刻 Ctrl+Z”正好落在这个空窗口里 → 表现为没反应。这里立刻补一条，
    // 并取消内核排的那次压栈，否则会多加一条假记录（一次撤销只回退一半）。
    vdFlushUndo();
    scheduleOutlineRefresh();   // 取消延迟回调后，它原本负责的刷新要自己补上
    scheduleFindRefresh();
  }
  // 批量改写的入口都是查换栏/页签菜单上的按钮，焦点不在正文上，
  // 不还回去的话 Ctrl+Z 根本到不了编辑器
  focusEditor();
}
/* 把焦点还给正文编辑器（代码模式给 CM6，md 模式给 IR 编辑区） */
function focusEditor() {
  try {
    if (isCodeMode()) { if (cmView) cmView.focus(); return; }
    var v = vditor && vditor.vditor;
    if (v && v.ir && v.ir.element) v.ir.element.focus();
  } catch (e) { /* ignore */ }
}

/* ---------- 撤销/重做的统一入口 ----------
   焦点在正文里时交给内核自己处理（不拦截，避免双重撤销）；
   焦点跑到工具栏按钮/页签上时（比如刚点完「行首」「替换」），把 Ctrl+Z 转发给编辑器。
   焦点在输入框里则放行——那里应该是撤销输入框里的文字。 */
function editorHasFocus() {
  try {
    if (isCodeMode()) return !!(cmView && cmView.hasFocus);
    var v = vditor && vditor.vditor;
    var ae = document.activeElement;
    return !!(v && v.ir && v.ir.element && ae && (ae === v.ir.element || v.ir.element.contains(ae)));
  } catch (e) { return false; }
}
function focusInTextInput() {
  var el = document.activeElement;
  if (!el) return false;
  var tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return !!el.isContentEditable && !editorHasFocus();
}
function appUndo(redo) {
  try {
    if (isCodeMode()) {
      if (!cmView) return false;
      var bind = redo ? CM6.historyKeymap[1] : CM6.historyKeymap[0];   // Mod-z / Mod-y
      if (!bind || typeof bind.run !== 'function') return false;
      return bind.run(cmView) !== false;
    }
    var v = vditor && vditor.vditor;
    if (!v || !v.undo) return false;
    if (redo) v.undo.redo(v); else v.undo.undo(v);
    return true;
  } catch (e) { return false; }
}
/* 取消内核排队的“延迟压栈”（setValue 之后 undoDelay 时才会执行的那次） */
function vdCancelPendingUndo() {
  try {
    var v = vditor && vditor.vditor;
    if (v && v.ir) clearTimeout(v.ir.processTimeoutId);
  } catch (e) { /* ignore */ }
}
/* 立即把当前内容压入 Vditor 的撤销栈，并取消排队的延迟压栈 */
function vdFlushUndo() {
  vdCancelPendingUndo();
  try {
    var v = vditor && vditor.vditor;
    if (v && v.undo && typeof v.undo.addToUndoStack === 'function') v.undo.addToUndoStack(v);
  } catch (e) { /* 内核差异时忽略 */ }
}
/* 切标签：撤销栈只保留本标签当前内容，否则 Ctrl+Z 能把上一个文件的内容倒回来 */
function vdResetUndo() {
  vdCancelPendingUndo();     // 先掐掉 setValue 排的那次压栈，否则基线后面会多一条
  try { if (vditor && typeof vditor.clearStack === 'function') vditor.clearStack(); } catch (e) { /* ignore */ }
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
  // Tab / Shift-Tab 不自己绑定：已装入的 indentWithTab（Tab → indentMore）与 defaultKeymap
  // 里的 indentLess 已经覆盖。自己绑 replaceSelection('\t') 会把整段多行选区换成一个 \t。
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
  if (MDE_DEBUG) dbg('[列块] 取消: ' + (new Error().stack.split(String.fromCharCode(10))[2] || '').trim().slice(0, 70));
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
  dbg('[列块] 绘制覆盖层: 行' + kbBlock.sLine + '-' + kbBlock.hLine + ' 列' + kbBlock.sCol + '-' + kbBlock.hCol);
  layer.innerHTML = '';
  var doc = cmView.state.doc;
  var c = blockCorners(doc);
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
  if (/^(Alt|Shift|Control|Meta)$/.test(k)) return false;       // 按住修饰键（含连发）不取消块
  if (e.altKey && /^Arrow/.test(k)) return false;              // 列块移动，交给上面的绑定
  if (k === 'Escape') { kbBlockCancel(); return true; }
  if (e.ctrlKey || e.metaKey) {
    var low = k.toLowerCase();
    if (low === 'c') { var CT = colBlockText(); dbg('[列块] Ctrl+C 复制: ' + JSON.stringify(CT)); copyColToClipboard(CT); return true; }
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
  dbg('[列块] mousedown 进入: alt=' + e.altKey + ' meta=' + e.metaKey + ' btn=' + e.button + ' code=' + isCodeMode() + ' 目标=' + (e.target.className || e.target.tagName || '').toString().slice(0, 20));
  kbBlockCancel();
  if (e.button !== 0 || !(e.metaKey || e.altKey) || !isCodeMode()) { dbg('[列块] 前置检查未通过'); return; }
  var pos = colPosAt(e);
  dbg('[列块] pos=' + pos);
  if (pos == null) return;
  e.preventDefault();
  e.stopPropagation();         // 捕获阶段阻断 CM6 自带拖选
  if (!cmView.hasFocus) cmView.focus();
  var doc = cmView.state.doc, L = doc.lineAt(pos);
  kbBlock = { sLine: L.number, sCol: pos - L.from, hLine: L.number, hCol: pos - L.from };
  colDrag = true;
  renderColBlock();
}, true);
/* 拖拽：每帧最多重算一次（posAtCoords + 逐行 coordsAtPos 都会触发强制布局，
   直接跟着 mousemove 跑是拖拽卡顿的主因） */
var colMoveRaf = 0, colMoveEv = null;
window.addEventListener('mousemove', function (e) {
  if (!colDrag || !cmView) return;
  e.preventDefault();
  colMoveEv = { clientX: e.clientX, clientY: e.clientY };
  if (colMoveRaf) return;
  colMoveRaf = requestAnimationFrame(function () {
    colMoveRaf = 0;
    var ev = colMoveEv; colMoveEv = null;
    if (!ev || !colDrag || !kbBlock || !cmView) return;
    var pos = colPosAt(ev);
    if (pos == null) return;
    var doc = cmView.state.doc, L = doc.lineAt(pos);
    kbBlock.hLine = L.number; kbBlock.hCol = pos - L.from;
    renderColBlock();
    dbg('[列块] move: 行' + kbBlock.hLine + ' 列' + kbBlock.hCol);
  });
});
window.addEventListener('mouseup', function () {
  dbg('[列块] mouseup: 块=' + JSON.stringify(kbBlock));
  colDrag = null;
});
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
