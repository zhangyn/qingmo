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

/* ---------- 菜单栏显隐 ----------
   开关是页签栏右端的 ☰：菜单栏被隐藏后它仍可见，不会“藏起来找不回来”。
   另两个入口：页签右键菜单、Ctrl+Shift+M。 */
function applyMenubar(save) {
  document.body.classList.toggle('nomenu', !menuVisible);
  var tb = $('tabmenu-toggle');
  if (tb) {
    tb.classList.toggle('on', menuVisible);
    tb.title = (menuVisible ? '隐藏' : '显示') + '菜单栏 (Ctrl+Shift+M)';
  }
  if (save) localStorage.setItem('mde:menubar', menuVisible ? '1' : '0');
}
function toggleMenubar() {
  menuVisible = !menuVisible;
  applyMenubar(true);
  toast(menuVisible ? '已显示菜单栏' : '菜单栏已隐藏：点页签栏右端 ☰ 或 Ctrl+Shift+M 恢复');
}
function menuToggleBtn() {
  var b = $('tabmenu-toggle');
  if (b && !b._bound) {
    b._bound = true;
    b.addEventListener('click', function (ev) { ev.stopPropagation(); toggleMenubar(); });
  }
  return b;
}
// 静态节点，脚本加载时就把点击事件挂上（页签重渲染不影响它）
menuToggleBtn();


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



/* ---------- 代码块「编辑中也有语法高亮」 ----------
   Vditor 的 IR 模式把代码块分成两层：可编辑源码（.vditor-ir__marker--pre > code）和
   渲染预览（.vditor-ir__preview）。光标进入代码块（--expand）时预览层被 editor.html 隐藏，
   于是编辑中只剩纯文本、没有配色。

   注意：不能直接改写可编辑层的 innerHTML 去加 <span>——那样会把 Lute 的
   VditorIRDOM2Md 读坏（实测代码块正文被截断）。所以这里用「覆盖层」：
     · 可编辑层文字设为透明（caret-color 单独保留，光标照常可见）
     · 在 .vditor-ir 里放一个绝对定位的 <pre> 覆盖层，内容和配色由 highlight.js 生成
     · 覆盖层 pointer-events:none，不挡点击/选区；字体、内边距、行高照抄可编辑层，
       同一份文本、同样宽度 → 文字逐像素对齐
   .vditor-ir 里多出来的元素不会进 Markdown（Lute 只读节点内部），所以正文不受影响。 */
var CB_HL_MAX = 20000;        // 超长代码块不做覆盖层（避免每次输入都跑一遍高亮）
var cbHlText = null;          // 上一次高亮的文本
var cbHlLang = null;

function cbEditCodeEl() {
  var nodes = document.querySelectorAll('.vditor-ir__node--expand[data-type="code-block"]');
  if (!nodes.length) return null;                 // 内核同时只会展开一个
  var code = nodes[0].querySelector('.vditor-ir__marker--pre > code');
  return code || null;
}
function cbMirrorRemove() {
  var m = document.getElementById('mde-codehl');
  if (m && m.parentNode) m.parentNode.removeChild(m);
  document.body.classList.remove('mde-cbhl');
  cbHlText = null; cbHlLang = null;
}
function cbMirrorEnsure() {
  var m = document.getElementById('mde-codehl');
  if (m) return m;
  var ir = document.querySelector('.vditor-ir');
  if (!ir) return null;
  m = document.createElement('pre');
  m.id = 'mde-codehl';
  m.setAttribute('aria-hidden', 'true');
  m.appendChild(document.createElement('code'));
  ir.appendChild(m);
  cbHlText = null; cbHlLang = null;   // 新元素内容为空，必须重画（否则透明文字就看不见了）
  return m;
}
/* 把可编辑层的排版参数照抄到覆盖层，保证文字位置逐像素一致 */
function cbCopyLayout(fromEl, toEl) {
  var cs = window.getComputedStyle(fromEl);
  var props = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariantLigatures',
    'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'textAlign', 'textIndent',
    'whiteSpace', 'wordBreak', 'overflowWrap', 'direction', 'padding', 'boxSizing'];
  for (var i = 0; i < props.length; i++) {
    var v = cs[props[i]];
    if (v) toEl.style[props[i]] = v;
  }
}
function hlCodeBlockSync() {
  cbObserveNodes();
  if (!ready || isCodeMode() || !window.hljs || !window.hljs.getLanguage) { cbMirrorRemove(); return; }
  var code = cbEditCodeEl();
  if (!code) { cbMirrorRemove(); return; }
  var lang = (code.className.match(/language-([\w+#.-]+)/) || [])[1] || '';
  var text = code.textContent;
  if (!text || text.length > CB_HL_MAX || !window.hljs.getLanguage(lang)) { cbMirrorRemove(); return; }
  var m = cbMirrorEnsure();
  if (!m) { cbMirrorRemove(); return; }
  var mc = m.firstChild;

  if (cbHlText !== text || cbHlLang !== lang) {
    var html;
    try { html = window.hljs.highlight(text, { language: lang, ignoreIllegals: true }).value; }
    catch (e) { cbMirrorRemove(); return; }
    mc.className = 'hljs language-' + lang;
    mc.innerHTML = html;
    cbHlText = text; cbHlLang = lang;
  }

  // 宽度可能因滚动条出现/消失、换行开关而变化：用 ResizeObserver 盯住可编辑层
  if (cbResizeObs && cbObserved !== code) {
    if (cbObserved) cbResizeObs.unobserve(cbObserved);
    cbResizeObs.observe(code);
    cbObserved = code;
  }

  // 排版对齐 + 定位（.vditor-ir 是滚动容器，覆盖层随内容一起滚动）
  cbCopyLayout(code, mc);
  var ir = m.parentNode;
  var irRect = ir.getBoundingClientRect();
  var cRect = code.getBoundingClientRect();
  m.style.left = (cRect.left - irRect.left + ir.scrollLeft - ir.clientLeft) + 'px';
  m.style.top = (cRect.top - irRect.top + ir.scrollTop - ir.clientTop) + 'px';
  m.style.width = cRect.width + 'px';
  m.style.height = cRect.height + 'px';
  document.body.classList.add('mde-cbhl');

  // 布局可能在本轮之后才变（滚动条出现/消失、换行宽度变化），
  // 下一个 macrotask 再量一次宽度校正一遍。用 setTimeout 而不是 rAF：
  // 窗口被遮挡时 rAF 与 ResizeObserver 都不会跑。
  if (!cbFixPending) {
    cbFixPending = true;
    setTimeout(function () {
      cbFixPending = false;
      if (!ready || isCodeMode()) return;
      var m2 = document.getElementById('mde-codehl');
      var c2 = cbEditCodeEl();
      if (!m2 || !c2) return;
      if (Math.abs(parseFloat(m2.style.width) - c2.getBoundingClientRect().width) > 0.5) hlCodeBlockSync();
    }, 0);
  }
}
/* 输入时立即同步（否则新打的字在覆盖层跟上之前是透明的，
   代码块普遍不长，highlight.js 一次几毫秒，可以接受） */
function hlCodeBlockNow() {
  if (!ready || isCodeMode()) return;
  hlCodeBlockSync();
}
var cbObserved = null;
var cbFixPending = false;
var cbResizeObs = (typeof window.ResizeObserver === 'function')
  ? new window.ResizeObserver(function () { cbOnScroll(); })   // 尺寸变了就重排一次
  : null;
var cbHlTimer = null;
function scheduleCodeBlockHl() {
  if (cbHlTimer) return;
  cbHlTimer = setTimeout(function () {
    cbHlTimer = null;
    if (!ready || isCodeMode()) return;
    hlCodeBlockSync();
  }, 80);
}
/* 窗口尺寸/缩放变化后重新对齐 */
window.addEventListener('resize', scheduleCodeBlockHl);
/* 滚动跟随：md 模式真正溢出的滚动层是 pre.vditor-reset（不是 .vditor-ir），
   滚动事件不冒泡，所以用捕获阶段监听并按帧重算位置 */
var cbScrollTimer = null;
function cbOnScroll() {
  if (cbScrollTimer) return;
  // 用 setTimeout 而不是 requestAnimationFrame：窗口隐藏/被遮挡时 rAF 不执行
  cbScrollTimer = setTimeout(function () {
    cbScrollTimer = null;
    if (ready && !isCodeMode()) hlCodeBlockSync();   // 文本没变时只重算位置，开销很小
  }, 16);
}
document.addEventListener('scroll', cbOnScroll, true);
/* 进入代码块时内核给节点加 / 去掉 --expand 类，时机不定（点击、方向键、都可能在
   setTimeout 里），所以直接盯 class 变化：这是最可靠的触发点。
   覆盖层自己的 class 变化会被过滤掉，不会自触发循环。 */
var cbClassObserver = (typeof window.MutationObserver === 'function')
  ? new window.MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        if (t && t.closest && t.closest('#mde-codehl')) continue;   // 忽略自己的改动
        scheduleCodeBlockHl();
        return;
      }
    })
  : null;
function cbObserveNodes() {
  if (!cbClassObserver) return;
  var ir = document.querySelector('.vditor-ir');
  if (!ir || ir === cbObserveNodes._el) return;
  cbClassObserver.disconnect();
  cbClassObserver.observe(ir, { attributes: true, attributeFilter: ['class'], subtree: true });
  cbObserveNodes._el = ir;
}
/* 点/按键也补一刀（覆盖 observer 尚未挂上的最初时刻） */
document.addEventListener('click', function () { cbObserveNodes(); scheduleCodeBlockHl(); }, true);
document.addEventListener('keyup', function (e) {
  if (e.key && e.key.indexOf('Arrow') === 0) scheduleCodeBlockHl();
}, true);
