'use strict';
/* ---------- 冒烟自检（--smoke 或 ?smoke 启动时自动运行） ----------
   覆盖核心路径：md 渲染 / 代码模式 / 查找替换 / 行工具 / JSON 工具 /
   编码往返 / 桥接完整性 / 光标历史 / 快捷键定义。
   结果输出到控制台（SMOKE PASS/FAIL），并弹窗汇总（桌面版）。 */

if (/smoke/.test(location.search)) {
  var SMK = { pass: 0, fail: 0, results: [] };
  function smkCheck(name, ok, detail) {
    if (ok) SMK.pass++; else SMK.fail++;
    SMK.results.push((ok ? '✓ ' : '✗ ') + name + (detail ? ' [' + detail + ']' : ''));
    console.log('SMOKE ' + (ok ? 'PASS' : 'FAIL') + ': ' + name + (detail ? ' [' + detail + ']' : ''));
  }
  function smkWait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function smkDone() {
    console.log('SMOKE RESULT: ' + SMK.pass + '/' + (SMK.pass + SMK.fail));
    if (window.desktop && window.desktop.smokeDone) {
      window.desktop.smokeDone(SMK.pass, SMK.pass + SMK.fail, SMK.results.join(String.fromCharCode(10)));
    }
  }
  window.smkRun = async function () {
    try {
      // 1 启动与内核
      smkCheck('启动完成（vditor+CM6）', ready && typeof vditor !== 'undefined' && typeof CM6 !== 'undefined');

      // 2 md 渲染
      await openIntoTab({ name: 'smoke.md', content: '# 冒烟测试' });
      await smkWait(500);
      smkCheck('md 渲染', !!document.querySelector('.vditor-ir .vditor-reset h1'));

      // 3 代码模式
      await openIntoTab({ name: 'smoke.java', content: 'class S { int x = 1; }' });
      await smkWait(500);
      smkCheck('代码模式', isCodeMode() && document.querySelectorAll('#cmhost .cm-line').length >= 1);

      // 4 查找替换
      document.getElementById('find-input').value = 'int';
      document.getElementById('replace-input').value = 'long';
      runSearch(); replaceAll();
      await smkWait(400);
      smkCheck('查找替换', cmView.state.doc.toString().indexOf('long x') >= 0);

      // 5 行工具合并/拆分
      lineTool('s');
      await smkWait(300);
      var merged = cmView.state.doc.lines === 1 && cmView.state.doc.toString().indexOf("'") >= 0;
      lineTool('split');
      await smkWait(300);
      smkCheck('行工具合并/拆分', merged && cmView.state.doc.lines > 1);

      // 6 JSON 格式化/压缩
      await openIntoTab({ name: 'smoke.json', content: '{"a":1}' });
      await smkWait(400);
      jsonFormat();
      await smkWait(300);
      var pretty = cmView.state.doc.toString().indexOf('\n') >= 0;
      jsonMin();
      await smkWait(300);
      smkCheck('JSON 格式化/压缩', pretty && cmView.state.doc.toString().indexOf('\n') < 0);

      // 7 编码往返（GBK 写读）
      if (window.desktop) {
        var tp = 'C:/Users/hn_zh/AppData/Local/Temp/qingmo-smoke-gbk.txt';
        var w = await window.desktop.write(tp, '中文编码测试', 'gbk');
        var rd = await window.desktop.readPath(tp);
        smkCheck('GBK 读写往返', w.ok && rd.content === '中文编码测试', rd.enc);
      }

      // 8 桥接完整性
      var miss = REQUIRED_BRIDGE.filter(function (m) { return typeof window.desktop[m] !== 'function'; });
      smkCheck('桥接完整性', window.desktop && miss.length === 0, miss.join(','));

      // 9 光标历史
      smkCheck('光标历史', cursorHist.length > 0);

      // 10 快捷键定义
      smkCheck('Tab/行快捷键定义', LINE_KEYMAP.some(function (k) { return k.key === 'Tab'; }) && LINE_KEYMAP.some(function (k) { return k.key === 'Ctrl-y'; }));
    } catch (e) {
      smkCheck('套件异常', false, String(e).slice(0, 90));
    }
    smkDone();
  };
  setTimeout(function () { if (ready) smkRun(); else setTimeout(function () { if (ready) smkRun(); }, 2000); }, 2000);
}
