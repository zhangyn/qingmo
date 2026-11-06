/* 冒烟测试：在隐藏窗口里真实加载 editor.html，验证关键交互路径。
   跑法：npm run smoke   （无显示器/无 GUI 的环境不适用） */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ROOT = path.join(__dirname, '..');   // 本脚本在 test/ 下，页面与 preload 都在仓库根

app.disableHardwareAcceleration();

// 渲染层初始化需要的最小 IPC 桩
ipcMain.handle('draft:read', async () => null);
ipcMain.handle('file:readPath', async () => ({ error: 'n/a' }));
ipcMain.handle('file:statPath', async () => ({ error: 'n/a' }));
ipcMain.handle('history:list', async () => ({ ok: true, items: [] }));
ipcMain.handle('app:exportCss', async () => {
  try {
    const m = require('fs').readFileSync(path.join(ROOT, 'dist', 'index.css'), 'utf8');
    const th = require('fs').readFileSync(path.join(ROOT, 'dist', 'css', 'content-theme', 'light.css'), 'utf8');
    return { css: m + '\n' + th };
  } catch (e) { return { error: String(e) }; }
});
ipcMain.handle('app:ask', async () => 1);
ipcMain.handle('app:confirm', async () => false);
ipcMain.on('draft:write', () => {});
ipcMain.on('draft:clear', () => {});
ipcMain.on('title:set', () => {});
ipcMain.on('dirty:set', () => {});
ipcMain.on('win:print', () => {});

const logs = [];

async function waitFor(wc, expr, timeoutMs = 20000) {
  const t0 = Date.now();
  for (;;) {
    const v = await wc.executeJavaScript(expr).catch(() => false);
    if (v) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise(r => setTimeout(r, 150));
  }
}

app.whenReady().then(async () => {
  process.on('unhandledRejection', (e) => { console.log('SMOKE 未捕获异常: ' + e); app.exit(2); });
  const win = new BrowserWindow({
    width: 1100, height: 760, show: false,
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.webContents.on('console-message', (e, level, message) => logs.push(level + ': ' + message));
  // 测试须可重复：先清掉上次运行留下的标签页/设置，否则 restoreSession 会把旧会话恢复进来
  await win.webContents.session.clearStorageData({ storages: ['localstorage', 'sessionstorage', 'cachestorage'] });
  await win.loadFile(path.join(ROOT, 'editor.html'));

  const results = [];
  const check = (name, ok, extra) => results.push({ name, ok: !!ok, extra });

  check('Vditor 就绪', await waitFor(win.webContents, 'typeof ready !== "undefined" && ready === true'));

  // 1. 生产静默：无 ?debug 时 MDE_DEBUG 必须为 false
  check('调试开关默认关闭', await win.webContents.executeJavaScript('MDE_DEBUG === false'));

  // 2. 菜单栏开关按钮存在（由 renderTabs 追加）
  check('☰ 按钮存在', await win.webContents.executeJavaScript('!!document.getElementById("tabmenu-toggle")'));

  // 2b. ☰ 位于页签栏右端（布局回归守卫）
  check('☰ 贴在页签栏右端', await win.webContents.executeJavaScript(`(function(){
    var tb = document.getElementById('tabmenu-toggle').getBoundingClientRect();
    var bar = document.getElementById('tabbar').getBoundingClientRect();
    return tb.width > 0 && tb.right > bar.right - 40 && tb.right <= bar.right + 1;
  })()`));

  // 3. 收起菜单栏
  await win.webContents.executeJavaScript('toggleMenubar(); true');
  check('菜单栏已隐藏', await win.webContents.executeJavaScript(
    'getComputedStyle(document.getElementById("menubar")).display === "none" && document.body.classList.contains("nomenu")'));
  check('隐藏在 localStorage 持久化', await win.webContents.executeJavaScript('localStorage.getItem("mde:menubar") === "0"'));

  // 4. 隐藏后 ☰ 仍可见（可恢复）
  check('隐藏后 ☰ 仍可见', await win.webContents.executeJavaScript(
    'getComputedStyle(document.getElementById("tabmenu-toggle")).display !== "none"'));
  check('隐藏后 ☰ 位置可用', await win.webContents.executeJavaScript(
    'document.getElementById("tabmenu-toggle").getBoundingClientRect().width > 0'));

  // 5. 点 ☰ 恢复
  await win.webContents.executeJavaScript('document.getElementById("tabmenu-toggle").click(); true');
  check('点 ☰ 恢复菜单栏', await win.webContents.executeJavaScript(
    'getComputedStyle(document.getElementById("menubar")).display !== "none" && localStorage.getItem("mde:menubar") === "1"'));

  // 6. renderTabs 重建后 ☰ 仍在
  await win.webContents.executeJavaScript('renderTabs(); true');
  check('重渲染后 ☰ 仍在', await win.webContents.executeJavaScript('!!document.getElementById("tabmenu-toggle")'));

  // 7. 快捷键绑定存在（Ctrl+Shift+M 走 keydown 捕获）
  await win.webContents.executeJavaScript(
    'window.dispatchEvent(new KeyboardEvent("keydown",{key:"M",ctrlKey:true,shiftKey:true,bubbles:true})); true');
  check('Ctrl+Shift+M 可切换', await win.webContents.executeJavaScript('localStorage.getItem("mde:menubar") === "0"'));
  await win.webContents.executeJavaScript('toggleMenubar(); true');

  // 8. 代码模式 + Tab 多行缩进（不再是一个 \t 覆盖选区）
  await win.webContents.executeJavaScript('newFile({kind:"code",lang:null}); true');
  await waitFor(win.webContents, 'typeof cmView !== "undefined" && cmView && typeof cmView.state === "object"');
  const indent = await win.webContents.executeJavaScript(`(function(){
    cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: 'a\\nb\\nc' } });
    cmView.dispatch({ selection: { anchor: 0, head: cmView.state.doc.length } });
    var ran = CM6.indentWithTab.run(cmView);
    return { ran: ran, text: cmView.state.doc.toString() };
  })()`);
  check('多行 Tab 整体缩进', indent.ran === true && indent.text === '  a\n  b\n  c', JSON.stringify(indent.text));

  // 9. Shift-Tab 反缩进（defaultKeymap 的 indentLess）
  const outdent = await win.webContents.executeJavaScript(`(function(){
    cmView.dispatch({ selection: { anchor: 0, head: cmView.state.doc.length } });
    CM6.indentLess(cmView);
    return cmView.state.doc.toString();
  })()`);
  check('Shift-Tab 反缩进', outdent === 'a\nb\nc', JSON.stringify(outdent));

  // 10. 查找计数：走 SearchQuery 游标，且上限生效
  const find = await win.webContents.executeJavaScript(`(function(){
    cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: 'x x x x x' } });
    findState.query = 'x'; findState.regex = false; findState.caseSensitive = false;
    var n = cmMatchCount('x');
    cmView.dispatch({ selection: { anchor: 5, head: 5 } });
    cmSyncPos();
    return { count: n, pos: findState.cmPos, limit: FIND_LIMIT };
  })()`);
  check('查找计数正确', find.count === 5 && find.pos === 3, JSON.stringify(find));

  // 11. 每标签独立 EditorState：切页不串内容，撤销也不会把别的文件内容倒回来
  const perTab = await win.webContents.executeJavaScript(`(async function(){
    cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: 'AAA' } });
    var idA = activeId, stA = cmView.state;
    await newFile({ kind: 'code', lang: null });
    var idB = activeId;
    cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: 'BBB' } });
    var stB = cmView.state;
    await switchTab(idA);
    var backA = cmView.state, textA = backA.doc.toString();
    var undoTexts = [];
    for (var i = 0; i < 4; i++) {
      CM6.historyKeymap[0].run(cmView);
      undoTexts.push(cmView.state.doc.toString());
    }
    await switchTab(idB);
    var backB = cmView.state, textB = backB.doc.toString();
    CM6.historyKeymap[0].run(cmView);            // B 里撤销：只应撤掉 B 自己的输入
    var undoB = cmView.state.doc.toString();
    return {
      distinctStates: stA !== stB,
      docSameObject: backA.doc === stA.doc,      // 文档对象没被整篇重建
      textA: textA,
      undoTexts: undoTexts,
      leaked: undoTexts.some(function (x) { return x.indexOf('BBB') >= 0; }),
      bDocSameObject: backB.doc === stB.doc,
      bText: textB,
      undoB: undoB,
      lruSize: cmStateOrder.length,
      lruCap: CM_STATE_MAX
    };
  })()`);
  check('两标签是不同的 EditorState', perTab.distinctStates);
  check('切回后文档对象未重建', perTab.docSameObject);
  check('切页内容正确', perTab.textA === 'AAA', JSON.stringify(perTab.textA));
  check('撤销不串标签（不出现另一文件内容）', perTab.leaked === false, JSON.stringify(perTab.undoTexts));
  check('切回另一标签仍是自己的文档', perTab.bDocSameObject && perTab.bText === 'BBB', JSON.stringify([perTab.bDocSameObject, perTab.bText]));
  check('每标签撤销栈独立生效', perTab.undoB !== 'BBB' && perTab.undoB.indexOf('AAA') < 0, JSON.stringify(perTab.undoB));
  check('state 缓存有上限', perTab.lruSize <= perTab.lruCap, String(perTab.lruSize));

  // 12. md 标签与代码标签来回切换（activateTab 改写后的回归）
  const mdTab = await win.webContents.executeJavaScript(`(async function(){
    var codeId = activeId;
    await newFile();
    vditor.setValue('# MD-A 标题');
    await new Promise(function (r) { setTimeout(r, 250); });
    var idMd = activeId;
    await switchTab(codeId);
    var kindWhenCode = editorKind;
    await switchTab(idMd);
    await new Promise(function (r) { setTimeout(r, 150); });
    return { kindWhenCode: kindWhenCode, kindBack: editorKind, tabKind: activeTab().kind, text: vditor.getValue() };
  })()`);
  check('md ↔ 代码切页模式正确', mdTab.kindWhenCode === 'code' && mdTab.kindBack === 'md' && mdTab.tabKind === 'md',
    JSON.stringify([mdTab.kindWhenCode, mdTab.kindBack, mdTab.tabKind]));
  check('md 标签切页内容保留', mdTab.text.indexOf('MD-A 标题') >= 0, JSON.stringify(mdTab.text.slice(0, 40)));

  // 13. 导出 HTML：走主进程直读内核 CSS（不再由渲染层 fetch 本地文件）
  const exportHtml = await win.webContents.executeJavaScript('buildExportHtml()');
  check('导出 HTML 内嵌内核样式', exportHtml.indexOf('<style>') >= 0 && exportHtml.indexOf('.vditor-reset') >= 0,
    'len=' + exportHtml.length);
  check('导出 HTML 含正文', exportHtml.indexOf('MD-A') >= 0);

  // 14. 批量改写（行首/行尾插入、全部替换）不产生多余行，且能撤销
  const bulk = await win.webContents.executeJavaScript(`(async function(){
    var out = {}, w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    await openIntoTab({ name: 'bulk.md', content: 'a\\nb\\nc' });
    await w(400);
    out.opened = activeText();
    out.stackBase = vditor.vditor.undo.ir.undoStack.length;
    var ri = document.getElementById('replace-input');
    ri.value = 'X';
    applyLineEdge('start');
    await w(120);                        // 远小于 vditor 的 undoDelay，验证立即压栈
    out.afterStart = activeText();
    out.stackAfter = vditor.vditor.undo.ir.undoStack.length;
    vditor.vditor.undo.undo(vditor.vditor);
    await w(250);
    out.afterUndoStart = activeText();
    ri.value = 'Y';
    applyLineEdge('end');
    await w(120);
    out.afterEnd = activeText();
    vditor.vditor.undo.undo(vditor.vditor);
    await w(250);
    out.afterUndoEnd = activeText();
    return out;
  })()`);
  check('行首插入不产生多余空行', bulk.afterStart === 'Xa\nXb\nXc\n', JSON.stringify(bulk.afterStart));
  check('行首插入立刻进入撤销栈', bulk.stackBase === 1 && bulk.stackAfter === 2, JSON.stringify([bulk.stackBase, bulk.stackAfter]));
  check('行首插入可撤销', bulk.afterUndoStart === 'a\nb\nc\n', JSON.stringify(bulk.afterUndoStart));
  check('行尾插入可撤销', bulk.afterEnd === 'aY\nbY\ncY\n' && bulk.afterUndoEnd === 'a\nb\nc\n', JSON.stringify([bulk.afterEnd, bulk.afterUndoEnd]));

  // 14b. 焦点不在正文时（例如刚点完查换栏按钮）Ctrl+Z 仍应撤销文档
  const focusUndo = await win.webContents.executeJavaScript(`(async function(){
    var out = {}, w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    document.getElementById('replace-input').value = 'Q';
    applyLineEdge('start');
    await w(150);
    out.after = activeText();
    document.getElementById('repl-one').focus();       // 模拟焦点停在按钮上
    out.focusBefore = document.activeElement.id;
    return out;
  })()`);
  const ctrlZ = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'z', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'z', modifiers: ['control'] });
    await new Promise(r => setTimeout(r, 400));
  };
  await ctrlZ();
  const afterFocusUndo = await win.webContents.executeJavaScript('activeText()');
  check('按钮有焦点时 Ctrl+Z 仍撤销文档', focusUndo.after !== afterFocusUndo && afterFocusUndo.indexOf('Q') !== 0,
    JSON.stringify([focusUndo.after, afterFocusUndo]));

  // 14c. 焦点在输入框里时不劫持（把撤销留给输入框自己）
  const beforeInputUndo = await win.webContents.executeJavaScript(`(function(){
    openFind(true); document.getElementById('find-input').focus(); return activeText();
  })()`);
  await ctrlZ();
  const afterInputUndo = await win.webContents.executeJavaScript('activeText()');
  check('输入框有焦点时不劫持 Ctrl+Z', beforeInputUndo === afterInputUndo, JSON.stringify(afterInputUndo.slice(0, 30)));

  // 15. md 模式切标签后撤销不串文件（基线重置）
  const mdUndo = await win.webContents.executeJavaScript(`(async function(){
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    await openIntoTab({ name: 'second.md', content: 'SECOND-TAB' });
    await w(400);
    var idSecond = activeId;
    var first = tabs[0].id;
    await switchTab(first);
    await w(300);
    var stackAfterSwitch = vditor.vditor.undo.ir.undoStack.length;
    for (var i = 0; i < 3; i++) { vditor.vditor.undo.undo(vditor.vditor); await w(120); }
    return { text: vditor.getValue(), leaked: vditor.getValue().indexOf('SECOND-TAB') >= 0, stackAfterSwitch: stackAfterSwitch, idSecond: idSecond };
  })()`);
  check('md 切标签后撤销不串文件', mdUndo.leaked === false, JSON.stringify(mdUndo.text.slice(0, 40)));
  check('md 切标签后撤销栈重置为基线', mdUndo.stackAfterSwitch === 1, String(mdUndo.stackAfterSwitch));

  // 16. 代码模式的行首插入同样可撤销（用 undo 命令核实历史，键盘路径依赖窗口焦点）
  const cmBulk = await win.webContents.executeJavaScript(`(async function(){
    var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    await openIntoTab({ name: 'Bulk.java', content: 'int a;\\nint b;' });
    await w(500);
    document.getElementById('replace-input').value = '/*c*/ ';
    applyLineEdge('start');
    await w(150);
    var after = activeText();
    CM6.historyKeymap[0].run(cmView);
    await w(250);
    return { after: after, undone: activeText() };
  })()`);
  check('代码模式行首插入可撤销', cmBulk.after === '/*c*/ int a;\n/*c*/ int b;' && cmBulk.undone === 'int a;\nint b;',
    JSON.stringify([cmBulk.after, cmBulk.undone]));

  // 17. 连续输入要能一步步撤销（内核默认 undoDelay=800 会把整段输入合并成一步）
  let granular = { error: 'not run' };
  try {
    granular = await win.webContents.executeJavaScript(`(async function(){
      var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      var out = {};
      await openIntoTab({ name: 'gran.md', content: '' });   // 切到干净的 md 标签
      await w(400);
      var v = vditor.vditor;
      out.delay = v.options.undoDelay;
      out.size = v.undo.stackSize;
      vditor.focus();
      vditor.clearStack();
      await w(150);
      for (var i = 0; i < 4; i++) { document.execCommand('insertText', false, 'abcd'[i]); await w(200); }
      await w(400);
      out.typed = vditor.getValue().replace(/\\n/g, '');
      out.steps = [];
      var guard = 0;
      while (guard++ < 12) {
        if (v.undo.ir.undoStack.length < 2) break;
        v.undo.undo(v);
        await w(150);
        out.steps.push(vditor.getValue().replace(/\\n/g, ''));
      }
      return out;
    })()`);
  } catch (e) {
    granular = { error: String(e) };
  }
  if (granular.error) console.log('  [诊断] 连续输入测例失败: ' + granular.error + ' | console: ' + JSON.stringify(logs.slice(-3)));
  check('撤销粒度配置生效', !granular.error && granular.delay === 100 && granular.size === 400, JSON.stringify([granular.delay, granular.size, granular.error]));
  check('连续输入可逐步撤销', !granular.error && granular.typed === 'abcd' && granular.steps.length >= 3 && granular.steps[0] === 'abc',
    JSON.stringify([granular.typed, granular.steps]));

  // 18. 代码模式同样是逐步撤销（CM6 的 history() 默认 newGroupDelay=500 会合并连续输入）
  let cmGranular = { error: 'not run' };
  try {
    cmGranular = await win.webContents.executeJavaScript(`(async function(){
      var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      await openIntoTab({ name: 'gran.sql', content: '' });
      await w(500);
      for (var i = 0; i < 4; i++) {
        var pos = cmView.state.selection.main.head;
        cmView.dispatch({ changes: { from: pos, insert: 'abcd'[i] }, selection: { anchor: pos + 1 } });
        await w(200);                       // 200ms < 默认分组窗口 500ms
      }
      await w(300);
      var typed = cmView.state.doc.toString();
      var steps = [], guard = 0;
      while (guard++ < 12) {
        if (!CM6.historyKeymap[0].run(cmView)) break;
        await w(120);
        steps.push(cmView.state.doc.toString());
      }
      return { typed: typed, steps: steps };
    })()`);
  } catch (e) { cmGranular = { error: String(e) }; }
  check('代码模式连续输入可逐步撤销', !cmGranular.error && cmGranular.typed === 'abcd' && cmGranular.steps.length >= 3 && cmGranular.steps[0] === 'abc',
    JSON.stringify([cmGranular.typed, cmGranular.steps, cmGranular.error]));

  // 19. 代码块编辑态保留语法高亮（覆盖层方案：可编辑层的 DOM 一个字都不能改）
  let cbHl = { error: 'not run' };
  try {
    cbHl = await win.webContents.executeJavaScript(`(async function(){
      var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      var BT = String.fromCharCode(96, 96, 96);
      await openIntoTab({ name: 'hl.md', content: '# t\\n\\n' + BT + 'js\\nconst a = 1; // c\\n' + BT + '\\n\\n尾段\\n' });
      await w(700);
      var mdBefore = vditor.getValue();
      document.querySelector('.vditor-ir__node[data-type="code-block"] .vditor-ir__preview').click();   // 展开 = 进入编辑
      await w(800);
      var code = document.querySelector('.vditor-ir__node--expand[data-type="code-block"] .vditor-ir__marker--pre > code');
      var m = document.getElementById('mde-codehl');
      var out = {
        mirror: !!m,
        spans: m ? m.querySelectorAll('span').length : 0,
        kw: m && m.querySelector('.hljs-keyword') ? true : false,
        editStillPlain: code ? code.querySelectorAll('span').length : -1,     // 可编辑层必须仍是纯文本
        editTransparent: code ? getComputedStyle(code).color.indexOf('rgba(0, 0, 0, 0)') === 0 : null,
        align: (function () {
          if (!m || !code) return null;
          var a = m.getBoundingClientRect(), b = code.getBoundingClientRect();
          return [Math.round(a.left - b.left), Math.round(a.top - b.top), Math.round(a.width - b.width)];
        })(),
        mdSame: vditor.getValue() === mdBefore,
        mdHead: vditor.getValue().slice(0, 20).replace(/\\n/g, ' ')
      };
      // 编辑态不该看到围栏标记，语言名改为右上角角标
      var node = document.querySelector('.vditor-ir__node--expand[data-type="code-block"]');
      var info = node.querySelector('.vditor-ir__marker--info');
      out.fenceBefore = getComputedStyle(node, '::before').content;
      out.fenceAfter = getComputedStyle(node, '::after').content;
      out.infoPos = info ? getComputedStyle(info).position : null;

      // 折叠（内核的做法就是去掉 --expand 类）：覆盖层应被移除、文字恢复可见
      if (node) node.classList.remove('vditor-ir__node--expand');
      document.dispatchEvent(new Event('selectionchange'));
      await w(600);
      out.mirrorAfterCollapse = !!document.getElementById('mde-codehl');
      out.editOpaqueAfterCollapse = code ? getComputedStyle(code).color.indexOf('rgba(0, 0, 0, 0)') !== 0 : null;
      return out;
    })()`);
  } catch (e) { cbHl = { error: String(e) }; }
  check('代码块编辑态有高亮', !cbHl.error && cbHl.mirror && cbHl.spans > 0 && cbHl.kw, JSON.stringify([cbHl.mirror, cbHl.spans, cbHl.error]));
  check('高亮覆盖层不改可编辑层 DOM', cbHl.editStillPlain === 0, String(cbHl.editStillPlain));
  check('覆盖层与正文逐像素对齐', !cbHl.error && cbHl.align && cbHl.align[0] === 0 && cbHl.align[1] === 0 && cbHl.align[2] === 0, JSON.stringify(cbHl.align));
  check('高亮不影响 Markdown 内容', cbHl.mdSame === true, JSON.stringify([cbHl.mdSame, cbHl.mdHead]));
  check('折叠后移除覆盖层并恢复文字', cbHl.mirrorAfterCollapse === false && cbHl.editOpaqueAfterCollapse === true, JSON.stringify([cbHl.mirrorAfterCollapse, cbHl.editOpaqueAfterCollapse]));
  check('编辑态不显示 ``` 围栏', !cbHl.error && cbHl.fenceBefore === 'none' && cbHl.fenceAfter === 'none', JSON.stringify([cbHl.fenceBefore, cbHl.fenceAfter]));
  check('语言名改为角标', !cbHl.error && cbHl.infoPos === 'absolute', String(cbHl.infoPos));

  // 20. 折叠↔展开不该让文档内容跳动（两层盒模型必须等高）
  let noJump = { error: 'not run' };
  try {
    noJump = await win.webContents.executeJavaScript(`(async function(){
      var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      var BT = String.fromCharCode(96, 96, 96);
      await openIntoTab({ name: 'jump.md', content: '# t\\n\\n' + BT + 'java\\npublic class A {\\n    int n = 42;\\n}\\n' + BT + '\\n\\n后一段\\n' });
      await w(900);
      var probe = function () {
        var node = document.querySelector('.vditor-ir__node[data-type="code-block"]');
        var next = node.nextElementSibling;
        return { h: Math.round(node.getBoundingClientRect().height), nextTop: next ? Math.round(next.getBoundingClientRect().top) : null };
      };
      var before = probe();
      document.querySelector('.vditor-ir__preview').click();
      await w(900);
      var after = probe();
      return { before: before, after: after, deltaH: after.h - before.h, deltaNext: after.nextTop - before.nextTop };
    })()`);
  } catch (e) { noJump = { error: String(e) }; }
  check('折叠/展开不改变代码块高度', !noJump.error && noJump.deltaH === 0, JSON.stringify([noJump.deltaH, noJump.error]));
  check('折叠/展开不推动下方内容', !noJump.error && noJump.deltaNext === 0, JSON.stringify([noJump.deltaNext, noJump.before, noJump.after]));

  // 12. 渲染层无 error 级日志（除已知的 IPC 桩噪音）
  const errs = logs.filter(l => /^3:/.test(l) && !/n\/a/.test(l));
  check('无渲染层报错', errs.length === 0, JSON.stringify(errs.slice(0, 5)));

  console.log('\n===== SMOKE RESULT =====');
  let pass = 0;
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.ok || !r.extra ? '' : '   → ' + r.extra));
    if (r.ok) pass++;
  }
  console.log(`----- ${pass}/${results.length} -----`);
  console.log('console 日志条数: ' + logs.length + '（生产模式下应为 0，IPC 桩提示除外）');
  logs.slice(0, 8).forEach(l => console.log('  log: ' + l));
  app.exit(pass === results.length ? 0 : 1);
});
