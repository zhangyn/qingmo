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
          if (activeTab() && activeTab().kind === 'code' && cursorHist.length) {
            var top = cursorHist[cursorIdx];
            if (top && top.tabId === activeId && top.from != null) { var sel2 = u.state.selection.main; top.from = sel2.from; top.to = sel2.to; top.line = u.state.doc.lineAt(sel2.head).number; }
          }
        } else if (u.selectionSet) {
          recordCodeJump();
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
  { key: 'Alt-ArrowUp', run: function (v) { CM6.moveLineUp(v); return true; } },
  { key: 'Alt-ArrowDown', run: function (v) { CM6.moveLineDown(v); return true; } },
  { key: 'Ctrl-c', run: function (v) { if (!v.state.selection.main.empty) return false; return cmdCopyLine(v); } },
  { key: 'Ctrl-x', run: function (v) { if (!v.state.selection.main.empty) return false; return cmdCutLine(v); } }
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

