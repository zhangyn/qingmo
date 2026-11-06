'use strict';
/* 受信任路径范围（纯 Node，无 electron 依赖，便于单测）
 *
 * 渲染层能通过 IPC 传任意字符串路径给主进程。没有边界时，任何注入了渲染层的
 * 内容（比如一份带恶意 HTML 的 Markdown）都能读写整块磁盘。这里维护一份
 * "用户显式打开过的目录"白名单，主进程据此拒绝范围外的读写。
 *
 * 判定规则（含前缀陷阱）：
 *   root = C:\docs
 *   C:\docs\a.md      ✔
 *   C:\docs\assets\x  ✔   （子目录同样允许，图片 assets/ 依赖它）
 *   C:\docs2\a.md     ✘   （字符串前缀相同但不是同一目录）
 *   C:\docs\..\x      ✘   （先 path.resolve，再比较相对路径）
 */
const path = require('path');

function createGuard(platform) {
  const P = platform === 'win32' ? path.win32 : path.posix;
  const fold = (s) => (platform === 'win32' ? s.toLowerCase() : s);   // Windows 路径大小写不敏感
  const roots = new Set();

  function add(dir) {
    if (typeof dir !== 'string' || !dir) return false;
    let abs;
    try { abs = fold(P.resolve(dir)); } catch (e) { return false; }
    if (roots.has(abs)) return false;
    roots.add(abs);
    return true;
  }

  function allows(p) {
    if (typeof p !== 'string' || !p) return false;
    let abs;
    try { abs = fold(P.resolve(p)); } catch (e) { return false; }
    for (const r of roots) {
      const rel = P.relative(r, abs);
      if (rel === '') return true;
      if (!P.isAbsolute(rel) && rel !== '..' && rel.indexOf('..' + P.sep) !== 0) return true;
    }
    return false;
  }

  function load(arr) { if (!Array.isArray(arr)) return; for (const x of arr) add(x); }
  function list() { return Array.from(roots); }
  function clear() { roots.clear(); }

  return { add, allows, list, load, clear };
}

module.exports = { createGuard };
