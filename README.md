# MD 编辑器

一个免费、离线使用的本地 Markdown 编辑器。写作方式与 Typora 相同：**输入即渲染**，
不需要左右分栏预览。基于 [Vditor](https://github.com/Vanessa219/vditor) 4.0.1 内核（已随仓库内置，
全部依赖本地化，不联网、不上传任何内容）。

## 功能

- **即时渲染**：标题、加粗、行内代码等输入即生效，与 Typora 一致
- **多标签页**：同时打开多个文件；标签标题取正文第一行（`#` 标题自动去井号）
- **会话恢复**：重启后自动恢复上次打开的所有标签，含未保存的草稿内容
- **查找替换**：高亮定位、逐个/全部替换、大小写开关（基于 CSS Highlight API，不污染正文）
- **表格右键菜单**：插入/删除行、列，删除表格，操作即时同步回 Markdown
- **导出**：一键导出 PDF（printToPDF）、导出 HTML、打印
- **其他**：代码高亮、数学公式（KaTeX）、Mermaid 图表、图片粘贴内嵌、明暗主题、字数统计

## 快捷键

| 功能 | 快捷键 |
| --- | --- |
| 新建标签页 | `Ctrl+N` |
| 打开文件 | `Ctrl+O` |
| 保存 / 另存为 | `Ctrl+S` / `Ctrl+Shift+S` |
| 关闭标签页 | `Ctrl+W` |
| 查找 / 查找替换 | `Ctrl+F` / `Ctrl+H` |
| 下一个 / 上一个匹配 | `Enter` / `Shift+Enter`（或 `F3` / `Shift+F3`） |
| 打印 | `Ctrl+P` |
| 全屏 | `F11` |
| 明暗主题 | 右上角 🌙/☀️ |

## 目录结构

```
md-editor/
├── editor.html      渲染层页面（桌面版与网页版共用）：标签页、查找替换、
│                    右键菜单、草稿/会话恢复、主题等全部界面逻辑
├── main.js          Electron 主进程：窗口、原生菜单、文件对话框、
│                    PDF 导出、关闭确认
├── preload.js       渲染层 ↔ 主进程的安全桥接（contextBridge）
├── package.json     应用清单（main 入口）
├── dist/            Vditor 4.0.1 运行时（vendored，含 KaTeX/Mermaid/
│                    代码高亮等全部依赖，离线可用）
└── web/             备用的浏览器模式启动器（serve.py + bat）
```

## 组装桌面版

1. 下载 Electron 运行时（win32-x64），例如从
   [npmmirror 镜像](https://registry.npmmirror.com/-/binary/electron/)获取 `electron-v33.x.x-win32-x64.zip` 并解压；
   已装 Node.js 也可直接 `npm i` 安装 electron 后 `npx electron .`
2. 删除解压目录里的 `resources/default_app.asar`
3. 将本仓库的 `editor.html`、`main.js`、`preload.js`、`package.json`、`dist/`
   放入 `resources/app/`
4. 把 `electron.exe` 改名（如 `MD编辑器.exe`），双击即可运行；
   可为它创建桌面快捷方式

### 备用：浏览器模式

不打包桌面版时，进入 `web/` 双击 `启动编辑器.bat`（需要 Python），
它会在本机起一个静态服务并以应用窗口模式打开浏览器。
直接双击 `editor.html` 无法工作——浏览器安全策略会拦截编辑器内核的本地资源加载。

## 技术说明

- **渲染模式**：Vditor IR（即时渲染）。内核通过 `VditorIRDOM2Md` 把编辑区的 DOM
  变更同步回 Markdown 源码；表格操作、图片粘贴、单处替换都走
  "改 DOM → 派发 input 事件" 这一条同步通道，因此天然支持 `Ctrl+Z`
- **查找高亮**：使用 CSS Custom Highlight API，纯视觉标记、不修改 DOM；
  匹配按块级元素分段，不会出现跨段落匹配
- **滚动**：实际滚动层是内核生成的 `.vditor-reset`（而非 `.vditor-ir`），
  查找跳转会向上查找最近的可滚动祖先，不依赖具体层级
- **草稿与会话**：未保存内容每 10 秒写入 `localStorage`（按标签 ID 隔离），
  标签列表与激活状态持久化，启动时恢复并合并磁盘内容

## 已知取舍

- 撤销历史不跨标签页保留（切回标签后撤销栈重建）
- "全部替换"作用于 Markdown 源文本（与 Typora 相同），也会命中代码块与链接里的文字
- 桌面版未签名，首次运行可能被杀毒软件拦截，选择允许即可
- 打开超大文档（百 KB 级）时即时渲染会有可感知的延迟

## 许可

仅供个人学习与使用。内置的 Vditor 遵循 MIT 许可，版权归其作者所有。
