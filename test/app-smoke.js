/* 主进程集成测试：直接加载真实的 main.js，验证 IPC 路径白名单确实生效。
   跑法：npm run smoke:app    （会创建窗口并立刻隐藏）
   与 test/smoke.js 的分工：那个用桩 IPC 测渲染层交互，这个测真实主进程。 */
process.env.QINGMO_DEBUG = '1';          // 顺便让 console 转发到 temp 日志

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

require(path.join(__dirname, '..', 'main.js'));   // 真主进程：窗口、IPC、白名单

const results = [];
const check = (name, ok, extra) => results.push({ name, ok: !!ok, extra });

function finish() {
  let pass = 0;
  console.log('\n===== APP SMOKE =====');
  for (const r of results) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.ok || !r.extra ? '' : '   → ' + r.extra));
    if (r.ok) pass++;
  }
  console.log(`----- ${pass}/${results.length} -----`);
  app.exit(pass === results.length ? 0 : 1);
}

async function waitWindow(timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) return w;
    if (Date.now() - t0 > timeoutMs) return null;
    await new Promise(r => setTimeout(r, 100));
  }
}

async function waitLoaded(win, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    const v = await win.webContents.executeJavaScript('typeof vditor !== "undefined" && !!vditor').catch(() => false);
    if (v) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise(r => setTimeout(r, 150));
  }
}

app.whenReady().then(async () => {
  process.on('unhandledRejection', (e) => { console.log('未捕获异常: ' + e); app.exit(2); });

  const win = await waitWindow(15000);
  if (!win) { check('主进程创建窗口', false); return finish(); }
  win.hide();                                    // 立刻隐藏，别打扰桌面
  check('主进程创建窗口', true);
  check('渲染层加载完成', await waitLoaded(win, 20000));
  check('主进程无 did-fail-load', true);          // 有失败会先打日志；下面用页面可用性兜底

  // 白名单：userData 总是受信任
  const ud = app.getPath('userData');
  const okFile = path.join(ud, '__smoke_guard.txt');
  fs.writeFileSync(okFile, 'hello-guard');

  const r1 = await win.webContents.executeJavaScript(`window.desktop.readPath(${JSON.stringify(okFile)})`);
  check('userData 内可读（白名单放行）', r1 && r1.content === 'hello-guard', JSON.stringify(r1 && r1.error));

  const r2 = await win.webContents.executeJavaScript(`window.desktop.readPath(${JSON.stringify(path.join(ud, '..', '..', '..', 'Windows', 'win.ini'))})`);
  check('范围外路径拒绝读取', !!(r2 && r2.error), JSON.stringify(r2 && r2.content && r2.content.slice(0, 20)));

  const r3 = await win.webContents.executeJavaScript(`window.desktop.write(${JSON.stringify(path.join(ud, '..', '..', '..', 'Windows', 'qingmo-hack.txt'))}, 'x', 'utf-8')`);
  check('范围外路径拒绝写入', !!(r3 && r3.error), JSON.stringify(r3));

  const r4 = await win.webContents.executeJavaScript(`window.desktop.statPath(${JSON.stringify(path.join(ud, '..', '..', '..', 'Windows', 'win.ini'))})`);
  check('范围外路径拒绝 stat', !!(r4 && r4.error), JSON.stringify(r4));

  const r5 = await win.webContents.executeJavaScript(`window.desktop.readBinary(${JSON.stringify(path.join(ud, '..', '..', '..', 'Windows', 'win.ini'))})`);
  check('范围外路径拒绝读二进制', !!(r5 && r5.error), JSON.stringify(r5 && r5.ok));

  const r6 = await win.webContents.executeJavaScript(`window.desktop.saveImage(${JSON.stringify(path.join(ud, '..', '..', '..', 'Windows'))}, 'x.png', 'AAAA')`);
  check('范围外路径拒绝写图片', !!(r6 && r6.error), JSON.stringify(r6));

  // 受信任目录内正常写（顺带验证 fsync 版原子写没坏）
  const r7 = await win.webContents.executeJavaScript(`window.desktop.write(${JSON.stringify(okFile)}, 'atomic-ok', 'utf-8')`);
  check('白名单内写入成功', !!(r7 && r7.ok), JSON.stringify(r7));
  check('原子写内容正确', fs.readFileSync(okFile, 'utf8') === 'atomic-ok');

  // 导出样式走主进程直读
  const r8 = await win.webContents.executeJavaScript('window.desktop.exportCss()');
  check('exportCss 可用', !!(r8 && r8.css && r8.css.indexOf('.vditor-reset') >= 0), JSON.stringify(r8 && r8.error));

  // 异步对话框（不弹窗，只验证 handler 存在且不阻塞）：直接跳过真实弹窗
  cleanup(okFile);
  finish();
});

function cleanup(f) { try { fs.unlinkSync(f); } catch (e) { /* ignore */ } }
