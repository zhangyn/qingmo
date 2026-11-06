/* cm6.js 的源码入口 —— 由 `npm run build:cm6` 打包成仓库根目录的 cm6.js。
 *
 * 以后要调整代码模式的编辑器能力（加/换扩展、加导出），改这里后重新打包，
 * 不要再手改 cm6.js（那是 minify 后的产物）。
 *
 * 导出清单就是渲染层可用的 `CM6.*` API：js/ 下只允许调用这里列出的名字，
 * 需要新能力就加到这个对象里 + 重新打包。
 */
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor,
  highlightWhitespace, highlightTrailingWhitespace
} from '@codemirror/view';
import { EditorState, EditorSelection, Compartment } from '@codemirror/state';
import {
  defaultKeymap, historyKeymap, history, indentWithTab, indentMore, indentLess,
  moveLineUp, moveLineDown, copyLineUp, copyLineDown, deleteLine, selectLine,
  toggleComment, undo, redo
} from '@codemirror/commands';
import {
  bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle, HighlightStyle
} from '@codemirror/language';
import {
  search, SearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll,
  highlightSelectionMatches
} from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';

import { java } from '@codemirror/lang-java';
import { sql } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';

/* 暗色语法配色（GitHub Dark 近色），代码模式切暗色主题时用 */
const darkHl = HighlightStyle.define([
  { tag: tags.comment, color: '#7d8590', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.operatorKeyword, tags.moduleKeyword, tags.definitionKeyword, tags.controlKeyword], color: '#ff7b72' },
  { tag: [tags.name, tags.propertyName, tags.variableName, tags.labelName], color: '#d2a8ff' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#d2a8ff' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#ffa657' },
  { tag: [tags.number, tags.bool, tags.atom, tags.self, tags.null], color: '#79c0ff' },
  { tag: [tags.string, tags.special(tags.string), tags.character, tags.regexp], color: '#a5d6ff' },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: '#c9d1d9' },
  { tag: [tags.meta, tags.annotation], color: '#8b949e' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.invalid, color: '#f85149' }
]);

/* 按文件后缀取语言包：js/01-state.js 的 kindOf() 里 lang 字段的取值必须在这里有对应项 */
const langs = { java, sql, json, xml, html, css, javascript, python, cpp };

window.CM6 = {
  /* 核心 */
  EditorView, EditorState, EditorSelection, Compartment,
  /* 搜索 */
  search, SearchQuery, setSearchQuery, findNext, findPrevious, replaceNext, replaceAll,
  highlightSelectionMatches,
  /* 键位与命令 */
  keymap, defaultKeymap, historyKeymap, history, indentWithTab, indentMore, indentLess,
  undo, redo,
  moveLineUp, moveLineDown, copyLineUp, copyLineDown, deleteLine, selectLine, toggleComment,
  /* 视图装饰 */
  lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection,
  dropCursor, rectangularSelection, crosshairCursor,
  highlightWhitespace, highlightTrailingWhitespace,
  bracketMatching, foldGutter, foldKeymap,
  /* 语法高亮 */
  syntaxHighlighting, defaultHighlightStyle, darkHl,
  /* 括号补全 */
  closeBrackets, closeBracketsKeymap,
  /* 语言包 */
  langs
};
