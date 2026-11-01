'use strict';
/* ---------- 主题 ---------- */
function applyTheme() {
  document.body.classList.toggle('dark', dark);
  localStorage.setItem('mde:dark', dark ? '1' : '0');
  var btn = document.querySelector('[data-act="theme"]');
  if (btn) btn.textContent = dark ? '☀️ 亮色' : '🌙 暗色';
  if (vditor) {
    try {
      vditor.setTheme(dark ? 'dark' : 'classic', dark ? 'dark' : 'light', dark ? 'vs2015' : 'github');
    } catch (e) { location.reload(); }
  }
  applyZoom();
}


/* ---------- 菜单事件 ---------- */
var ACTIONS = {
  new: newFile, open: openFile, save: save, saveas: saveAs,
  outline: toggleOutline,
  closetab: function () { closeTab(activeId); },
  'toggle-ws': function () {
    if (!isCodeMode()) { toast('显示空白仅代码模式（非 .md 文件）支持'); return; }
    uiWs = !uiWs; applyWs();
  },
  'toggle-wrap': function () { uiWrap = !uiWrap; applyWrap(); },
  'line-s': function () { lineTool('s'); },
  'line-d': function () { lineTool('d'); },
  'line-n': function () { lineTool('n'); },
  'line-split': function () { lineTool('split'); },
  newcode: function () { newFile({ kind: 'code', lang: null }); },
  exporthtml: exportHtml, pdf: exportPdf,
  print: function () { if (window.desktop) { window.desktop.print(); } else { printPdf(); } },
  theme: function () { dark = !dark; applyTheme(); },
  typewriter: function () {
    typewriter = !typewriter; applyTypewriter();
    if (typewriter) {   // 开启时立即居中一次，给出可见反馈
      setTimeout(function () { typewriterScrollMd(); if (isCodeMode() && cmView) cmTypewriterCenter({ state: cmView.state }); }, 80);
    }
    toast(typewriter ? '打字机模式：开（光标保持居中）' : '打字机模式：关');
  },
  help: function () {
    if (window.desktop) window.desktop.openHelp();
    else toast('使用说明在程序目录：使用说明.txt');
  }
};
document.getElementById('menubar').addEventListener('click', function (e) {
  var btn = e.target.closest('button[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'openrecent') {
    e.stopPropagation();
    var list = getRecent();
    if (!list.length) { toast('暂无最近打开的文件'); return; }
    var rr = btn.getBoundingClientRect();
    showCtx(rr.left, rr.bottom + 4, list.map(function (p) { return { label: p.split(/[\/]/).pop() + ' (' + p + ')', fn: function () { openRecent(p); } }; }));
    return;
  }
  if (btn.dataset.act === 'new') {
    e.stopPropagation();
    var rn = btn.getBoundingClientRect();
    showCtx(rn.left, rn.bottom + 4, [
      { label: '新建 Markdown 笔记', fn: function () { newFile(); } },
      { label: '新建 代码/纯文本', fn: function () { newFile({ kind: 'code', lang: null }); } }
    ]);
    return;
  }
  if (ACTIONS[btn.dataset.act]) ACTIONS[btn.dataset.act]();
});
$('fallback-open').addEventListener('change', function () {
  var f = this.files[0]; this.value = '';
  if (f) f.text().then(function (t) { return openIntoTab({ name: f.name, content: t }); });
});


/* ---------- 初始化 ---------- */
if (window.desktop) {
  window.desktop.onMenu(function (act) {
    if (act.indexOf('openpath:') === 0) {
      var fp = act.slice(9);
      window.desktop.readPath(fp).then(function (r) {
        if (r.error) return toast('打开失败：' + r.error);
        var exist = tabs.filter(function (t) { return t.path === fp; })[0];
        if (exist) return switchTab(exist.id);
        var NM = String.fromCharCode(92);
        openIntoTab({ name: fp.split(new RegExp('[' + NM + '/]')).pop(), content: r.content, path: fp, enc: r.enc })
          .then(function (nt) { if (nt && r.st) nt.st = r.st; });
        addRecent(fp);
      });
      return;
    }
    if (ACTIONS[act]) ACTIONS[act]();
  });
}
if (location.protocol === 'file:' && !window.desktop) {
  document.getElementById('editor').innerHTML =
    '<div style="max-width:560px;margin:120px auto;text-align:center;font-size:15px;line-height:2">' +
    '<h2 style="margin-bottom:8px">请使用桌面程序打开</h2>' +
    '浏览器安全策略不允许直接双击打开本页（编辑器内核无法加载）。</div>';
} else {
applyTheme();
vditor = new Vditor('editor', {
  cdn: '.',
  lang: 'zh_CN',
  mode: 'ir',                     // 即时渲染（Typora 式）
  icon: 'ant',
  theme: dark ? 'dark' : 'classic',
  value: WELCOME,
  cache: { enable: false },       // 草稿与标签由本页自管
  counter: { enable: true },
  preview: {
    theme: { current: dark ? 'dark' : 'light', path: './dist/css/content-theme' },
    hljs: { style: dark ? 'vs2015' : 'github', lineNumber: false }
  },
  toolbar: [
    'headings', 'bold', 'italic', 'strike', '|',
    'list', 'ordered-list', 'check', 'outdent', 'indent', '|',
    'quote', 'code', 'inline-code', 'table', 'link', '|',
    'undo', 'redo', '|', 'fullscreen'
  ],
  upload: {
    handler: function (files) { insertImages(files); return ''; }
  },
  input: function () { if (ready) { lastEditAt = Date.now(); setDirty(true); scheduleLabelRefresh(); scheduleFindRefresh(); scheduleOutlineRefresh(); typewriterScrollMd(); } },
  after: function () {
    ready = true;
    migrateDrafts().then(function () { restoreSession(); });
    applyWs(); applyWrap(); applyOutline();
  }
});
}

