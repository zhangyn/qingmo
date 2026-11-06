/* 重新生成 cm6.js（CodeMirror 6 内核 bundle）。
 * 跑法：npm install && npm run build:cm6
 *
 * 产物是 IIFE，直接 <script src="./cm6.js"> 引入，挂到 window.CM6。
 * 打包时会把各依赖的解析后版本写进产物头部注释，便于追溯"这颗 bundle 由哪些版本生成"。
 */
import { build } from 'esbuild';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src', 'cm6-entry.js');
const outfile = join(root, 'cm6.js');

const DEPS = [
  '@codemirror/view', '@codemirror/state', '@codemirror/commands', '@codemirror/language',
  '@codemirror/search', '@codemirror/autocomplete', '@lezer/highlight',
  '@codemirror/lang-java', '@codemirror/lang-sql', '@codemirror/lang-json',
  '@codemirror/lang-xml', '@codemirror/lang-html', '@codemirror/lang-css',
  '@codemirror/lang-javascript', '@codemirror/lang-python', '@codemirror/lang-cpp'
];

function versionOf(pkg) {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8')).version;
  } catch {
    return 'MISSING';
  }
}

const versions = DEPS.map((p) => `${p}@${versionOf(p)}`);
const missing = versions.filter((v) => v.endsWith('@MISSING'));
if (missing.length) {
  console.error('缺少依赖，先跑 npm install：\n  ' + missing.join('\n  '));
  process.exit(1);
}

const banner = `/* 轻墨 QingMo — CodeMirror 6 内核 bundle（请勿手改，源码在 src/cm6-entry.js）
 * 生成命令：npm run build:cm6
 * ${versions.join('\n * ')}
 */`;

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome130'],        // Electron 33 ≈ Chrome 130
  legalComments: 'none',
  banner: { js: banner },
  charset: 'utf8',
  logLevel: 'warning'
});

const kb = (statSync(outfile).size / 1024).toFixed(0);
console.log(`cm6.js 已生成：${outfile}`);
console.log(`体积：${kb} KB`);
console.log(`依赖：${DEPS.length} 个包`);
