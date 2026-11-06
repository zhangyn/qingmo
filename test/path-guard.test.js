'use strict';
/* 受信任路径范围的单元测试：node test/path-guard.test.js */
const assert = require('assert');
const { createGuard } = require('../lib/path-guard');

let pass = 0;
function t(name, fn) {
  try { fn(); console.log('PASS  ' + name); pass++; }
  catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

/* ---------- Windows 语义 ---------- */
const w = createGuard('win32');
w.add('C:\\docs');

t('win: 根目录下的文件允许', () => assert.ok(w.allows('C:\\docs\\a.md')));
t('win: 子目录允许（assets 依赖）', () => assert.ok(w.allows('C:\\docs\\assets\\x.png')));
t('win: 前缀相同但不是同一目录 → 拒绝', () => assert.ok(!w.allows('C:\\docs2\\a.md')));
t('win: .. 逃逸 → 拒绝', () => assert.ok(!w.allows('C:\\docs\\..\\x.md')));
t('win: 大小写不敏感', () => assert.ok(w.allows('c:\\DOCS\\A.MD')));
t('win: 别的盘符 → 拒绝', () => assert.ok(!w.allows('D:\\docs\\a.md')));
t('win: 根目录本身允许', () => assert.ok(w.allows('C:\\docs')));
t('win: 目录名是根的前缀字符串 → 拒绝', () => assert.ok(!w.allows('C:\\docs-old\\a.md')));
t('win: 反斜杠/斜杠混写', () => assert.ok(w.allows('C:/docs/sub/a.md')));
t('win: 空/非字符串 → 拒绝', () => {
  assert.ok(!w.allows(''));
  assert.ok(!w.allows(null));
  assert.ok(!w.allows(undefined));
  assert.ok(!w.allows(123));
});
t('win: 重复 add 返回 false', () => {
  assert.strictEqual(w.add('C:\\docs'), false);
  assert.strictEqual(w.add('C:\\other'), true);
});
t('win: list 内容是解析后的绝对路径', () => {
  const l = w.list();
  assert.ok(l.indexOf('c:\\docs') >= 0);
});

/* ---------- POSIX 语义 ---------- */
const u = createGuard('linux');
u.add('/home/u/docs');

t('posix: 子目录允许', () => assert.ok(u.allows('/home/u/docs/assets/a.png')));
t('posix: ../ 逃逸 → 拒绝', () => assert.ok(!u.allows('/home/u/docs/../../etc/passwd')));
t('posix: 归档式前缀 → 拒绝', () => assert.ok(!u.allows('/home/u/docs2/a.md')));
t('posix: 大小写敏感', () => assert.ok(!u.allows('/home/u/DOCS/a.md')));
t('posix: 相对路径按 cwd 解析后判定', () => assert.ok(!u.allows('a.md')));

/* ---------- 持久化往返 ---------- */
t('load(list()) 往返一致', () => {
  const g = createGuard('win32');
  g.load(w.list());
  assert.deepStrictEqual(g.list().sort(), w.list().sort());
});
t('load 传非数组不炸', () => {
  const g = createGuard('win32');
  g.load(null); g.load('x'); g.load({});
  assert.deepStrictEqual(g.list(), []);
});

console.log('\n----- path-guard: ' + pass + ' 通过 -----');
