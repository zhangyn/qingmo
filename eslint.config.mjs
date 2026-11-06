/* ESLint 9 扁平配置
 * 跑法：npm run lint
 *
 * 分工：
 *  - js/**       渲染层，经典 <script>（非模块），跨文件共享全局 → 用生成出来的
 *                eslint.globals.mjs 声明，所以 no-undef 仍能抓出真正的拼写错误
 *  - main/preload/lib/test   CommonJS + Node 环境
 *  - src/scripts   ESM（bundle 入口与构建脚本）
 */
import globals from 'globals';
import appGlobals from './eslint.globals.mjs';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', 'cm6.js', 'web/**', '**/*.min.js']
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...appGlobals,
        CM6: 'readonly',
        Vditor: 'readonly',
        Highlight: 'readonly',   // CSS Custom Highlight API，globals 包里还没收录
        CSS: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      // 顶层函数被别的文件调用是常态，只看函数内部的局部变量
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      // 这些名字本就是 <script> 共享的全局，声明一次不算重复定义
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'no-self-assign': 'warn',
      'no-fallthrough': 'warn',
      'valid-typeof': 'error'
    }
  },
  {
    files: ['main.js', 'preload.js', 'lib/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'warn',
      'valid-typeof': 'error'
    }
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'warn'
    }
  }
];
