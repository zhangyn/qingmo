/* 生成 eslint.globals.mjs：js/*.js 之间通过 <script> 顺序共享的顶层声明。
 * 这些名字跨文件互相引用，不列出来的话 no-undef 会满屏报错。
 * 新增顶层 var/function 后重跑：npm run lint:globals
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'js');
const names = new Set();

for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
  const src = readFileSync(join(dir, f), 'utf8');
  // 本项目约定：顶层声明一律顶格写（缩进的都在函数内部）
  for (const m of src.matchAll(/^(?:async\s+)?(var|let|const|function)\s+([^\n]*)/gm)) {
    if (m[1] === 'function') { names.add(m[2].match(/^([A-Za-z_$][\w$]*)/)[1]); continue; }
    // var a = 1, b = 2;  → 逐个取出声明名（按括号深度切开，别被对象字面量里的逗号骗到）
    let depth = 0, cur = '';
    const parts = [];
    for (const ch of m[2]) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    for (const part of parts) {
      const name = part.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:=|;|$)/);
      if (name) names.add(name[1]);
    }
  }
}

const sorted = [...names].sort();
const out = `/* 自动生成，请勿手改：npm run lint:globals
 * 来源：js/*.js 的顶层声明（渲染层靠 <script> 顺序共享这些全局名）
 */
export default {
${sorted.map((n) => `  ${n}: 'writable',`).join('\n')}
};
`;
writeFileSync(join(root, 'eslint.globals.mjs'), out);
console.log(`eslint.globals.mjs 已生成：${sorted.length} 个全局名`);
