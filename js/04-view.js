'use strict';
/* ---------- 视图开关：显示空白 / 自动换行 ---------- */
function applyWs() {
  localStorage.setItem('mde:ws', uiWs ? '1' : '0');
  if (cmView && cmWsComp) cmView.dispatch({ effects: cmWsComp.reconfigure(uiWs ? [CM6.highlightWhitespace(), CM6.highlightTrailingWhitespace()] : []) });
  syncCodeTools();
}
function applyWrap() {
  localStorage.setItem('mde:wrap', uiWrap ? '1' : '0');
  document.body.classList.toggle('md-nowrap', !uiWrap);
  if (cmView && cmWrapComp) cmView.dispatch({ effects: cmWrapComp.reconfigure(uiWrap ? CM6.EditorView.lineWrapping : []) });
  if (cmView) setTimeout(function () { cmView.requestMeasure(); }, 0);
  syncCodeTools();
}
function applyTabsPos() {
  localStorage.setItem('mde:tabsbottom', tabsBottom ? '1' : '0');
  document.body.classList.toggle('tabs-bottom', tabsBottom);
}
applyTabsPos();


/* ---------- 打字机模式：输入时光标行保持居中 ---------- */
function applyTypewriter() {
  localStorage.setItem('mde:typewriter', typewriter ? '1' : '0');
  document.body.classList.toggle('tw-on', typewriter);
  var b = document.querySelector('[data-act="typewriter"]');
  if (b) b.classList.toggle('on', typewriter);
}
applyTypewriter();
/* md 模式真实滚动层是 pre.vditor-reset（.vditor-ir 不溢出，滚它无效） */
function mdScroller() {
  var r = document.querySelector('.vditor-ir .vditor-reset');
  if (r && r.scrollHeight > r.clientHeight) return r;
  return document.querySelector('.vditor-ir');
}
function twCenterMd() {
  var sc = mdScroller();
  if (!sc) return;
  var sel = window.getSelection();
  var rr = (sel && sel.rangeCount) ? sel.getRangeAt(0).getBoundingClientRect() : null;
  if ((!rr || !rr.height) && sel && sel.anchorNode) {
    var n = sel.anchorNode;
    var el = n.nodeType === 3 ? n.parentElement : n;
    if (!el || !el.closest || !el.closest('.vditor-reset')) return;
    if (el === sc) return;
    var er = el.getBoundingClientRect();
    if (er.height > sc.clientHeight * 0.6) return;   // 拿到的是整个滚动层的 rect，放弃
    rr = er;
  }
  if (!rr || !rr.height) return;
  var sr = sc.getBoundingClientRect();
  var delta = rr.top + rr.height / 2 - (sr.top + sr.height / 2);
  if (delta > 400) delta = 400; else if (delta < -400) delta = -400;
  if (Math.abs(delta) > 2) sc.scrollTop += delta;
}
function typewriterScrollMd() {
  if (!typewriter || isCodeMode() || !ready) return;
  // 两段时机：input 回调后 DOM 已重渲染；rAF 再校正一次浏览器自身的"光标滚入"微调
  setTimeout(function () { twCenterMd(); requestAnimationFrame(twCenterMd); }, 0);
}
function cmTypewriterCenter(u) {
  if (!typewriter || !cmView) return;
  try { cmView.dispatch({ effects: CM6.EditorView.scrollIntoView(u.state.selection.main.head, { y: 'center' }) }); }
  catch (e) { /* 旧内核无此 API 时忽略 */ }
}

