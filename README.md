# QingMo 轻墨

一个免费、离线使用的本地 Markdown / 代码编辑器。写作方式与 Typora 相同：**输入即渲染**，
不需要左右分栏预览；`.java/.sql/.json` 等代码文件自动切换语法高亮模式。

基于 [Vditor](https://github.com/Vanessa219/vditor) 4.0.1 与 [CodeMirror 6](https://codemirror.net/)，
全部依赖本地化内置，不联网、不上传任何内容。

> 「轻墨」—— 轻量，落墨即成文。

## 功能

- **即时渲染**：标题、加粗、行内代码等输入即生效，与 Typora 一致
- **多标签页**：同时打开多个文件；标签标题取正文第一行（`#` 标题自动去井号）
- **会话恢复**：重启后自动恢复上次打开的所有标签，含未保存的草稿内容
- **查找替换**：高亮定位、逐个/全部替换、大小写开关（基于 CSS Highlight API，不污染正文）
- **表格右键菜单**：插入/删除行、列，删除表格，操作即时同步回 Markdown
- **导出**：一键导出 PDF（printToPDF）、导出 HTML、打印
- **代码/纯文本模式**：`.java/.sql/.json/.xml/.html/.css/.js/.py/.c/.cpp` 等文件自动切换为
  CodeMirror 6 编辑器（语法高亮、行号、代码折叠、括号匹配、虚拟化渲染——大文件流畅）
- **缩放**：`Ctrl+滚轮` 调整字号（两种模式通用，比例记忆）
- **视图开关**：显示空白字符、自动换行（视图菜单，带勾选状态）
- **行工具**：多行合并为一行（单引号/双引号/无引号，逗号分隔）、拆分为多行
  ——多行 ID/单号一键变成 SQL IN 列表或接口参数；右键菜单或代码模式工具栏可达
- **行首/行尾批量插入**：查换栏「行首」「行尾」按钮把替换框内容插到每行开头/结尾，
  Ctrl+Z 可一步撤销
- **代码块编辑中保持高亮**：光标进入代码块（编辑态）时也保留语法配色——
  做法是在上面盖一层 highlight.js 着色层，**不改内核读取的 DOM**，正文与撤销都不受影响
- **行快捷键**：`Ctrl+C`/`Ctrl+X` 无选区时复制/剪切当前行、`Ctrl+Y` 删除当前行、
  `Ctrl+D` 向下复制、`Ctrl+Shift+↑/↓` 移动行
- **列选中**（代码模式）：`Alt + 方向键` 竖向按列块选择（EditPlus 式），或
  `Win`/`Alt + 拖拽`；多光标直接批量编辑。md 模式按住 Win/Alt 会提示仅代码模式支持
- **选中即高亮**（md 模式）：选中 ≥2 字符后，其余相同文本自动高亮（蓝色底纹，
  基于 CSS Highlight API 不改正文；收起选区即清除）
- **查找替换增强**：正则模式（`.*` 开关，替换支持 `$1` 分组引用）、
  行首/行尾批量插入
- **大纲侧栏**：md 模式一键列出所有标题、点击跳转
- **编码**：自动识别 UTF-8/GBK/UTF-16，保存保持原编码（GBK 写入基于 iconv-lite）
- **外部变更检测**：文件被其他程序修改时自动提示（无未保存修改则自动重载），
  防止相互覆盖；文件被移除时也会提示
- **历史版本**：每次保存前自动把磁盘旧版留底到 `userData/history/`（每文件 50 份），
  页签右键「历史版本…」即可载入旧版核对
- **图片粘贴/拖入**：自动保存到文档同目录 `assets/`，以相对路径引用
  （文档未保存时回退为 base64 内嵌；导出 HTML/PDF 时本地图片自动内嵌）
- **其他**：数学公式（KaTeX）、Mermaid 图表、明暗主题、打字机模式（光标居中滚动）、
  字数统计、括号自动补全（代码模式）、单实例锁、窗口状态记忆、页签右键菜单与拖拽排序（可置底）、
  **菜单栏可收起**（点页签栏右端 ☰、页签右键或 `Ctrl+Shift+M`；收起后 ☰ 仍在，随时恢复）

## 快捷键

| 功能 | 快捷键 |
| --- | --- |
| 新建标签页 | `Ctrl+N` |
| 打开文件 | `Ctrl+O` |
| 保存 / 另存为 | `Ctrl+S` / `Ctrl+Shift+S` |
| 关闭标签页 | `Ctrl+W` |
| 查找 / 查找替换 | `Ctrl+F` / `Ctrl+H` |
| 下一个 / 上一个匹配 | `Enter` / `Shift+Enter`（或 `F3` / `Shift+F3`） |
| 竖向按列选中 | `Alt + 方向键` 或 `Win/Alt + 拖拽`（代码模式） |
| 移动行 | `Ctrl+Shift+↑/↓`（代码模式） |
| 打印 | `Ctrl+P` |
| 全屏 | `F11` |
| 显示/隐藏菜单栏 | `Ctrl+Shift+M` |
| 缩放 | `Ctrl+滚轮` 或 `Ctrl+=` / `Ctrl+-` |
| 明暗主题 | 右上角 🌙/☀️ |

> 保存均为原子写入（临时文件 + 改名），写一半断电也不会损坏原文件。

## 目录结构

```
md-editor/
├── editor.html      渲染层页面骨架（桌面版与网页版共用）：菜单栏、页签、
│                    查找栏、编辑区容器等结构与样式
├── js/              界面逻辑模块（自 editor.html 拆分，按序加载）：
│                    状态/标签页、CodeMirror/行工具、大纲/最近打开/光标历史、
│                    视图开关/打字机、草稿/变更检测、欢迎/会话恢复、
│                    文件读写/导出/图片、右键菜单/表格/查找替换、事件、应用入口
├── main.js          Electron 主进程：窗口、文件对话框、PDF 导出、
│                    图片资源化、导航守卫、关闭确认（无原生菜单）
├── preload.js       渲染层 ↔ 主进程的安全桥接（contextBridge）
├── lib/path-guard.js 受信任路径范围：主进程 IPC 的读写白名单（纯 Node，可单测）
├── test/smoke.js     冒烟测试（npm run smoke）：隐藏窗口加载页面，
│                    断言菜单栏显隐、Tab 缩进、每标签撤销栈等关键路径
├── test/path-guard.test.js 路径白名单单测（npm test，不需要 GUI）
├── package.json     应用清单（main 入口）
├── 使用说明.txt      帮助按钮打开的说明文档（随应用打包）
├── src/cm6-entry.js CodeMirror 6 bundle 的源码入口（导出的 CM6.* API 清单）
├── scripts/         build-cm6.mjs（重新打包 cm6.js）、gen-eslint-globals.mjs
├── cm6.js           CodeMirror 6 内核（**自动生成，勿手改**；含 Java/SQL/JSON/XML/
│                    HTML/CSS/JS/Python/C++ 语言包与暗色配色）
├── dist/            Vditor 4.0.1 运行时（vendored，含 KaTeX/Mermaid/
│                    代码高亮等全部依赖，离线可用）
├── eslint.config.mjs / eslint.globals.mjs  lint 配置与渲染层全局名清单
└── web/             备用的浏览器模式启动器（serve.py + bat）
```

## 组装桌面版

一条命令（需能下载 Electron 运行时；离线时用 `--electron-zip-dir` 指向本地
`electron-v33.x.x-win32-x64.zip` 所在目录）：

```bash
npm install && npm run dist     # 产物在 out/qingmo-win32-x64/QingMo.exe
```

或者手动组装（无网 / 无 Node 环境）：

1. 下载 Electron 运行时（win32-x64），例如从
   [npmmirror 镜像](https://registry.npmmirror.com/-/binary/electron/)获取 `electron-v33.x.x-win32-x64.zip` 并解压；
   已装 Node.js 也可直接 `npm i` 安装 electron 后 `npx electron .`
2. 删除解压目录里的 `resources/default_app.asar`
3. 将本仓库的 `editor.html`、`js/`、`lib/`、`main.js`、`preload.js`、`package.json`、`cm6.js`、
   `使用说明.txt`、`dist/`、以及 `node_modules/iconv-lite`（GBK 读写要用）放入 `resources/app/`
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
- **草稿与会话**：未保存内容在停止输入后写入 `userData/drafts/`（浏览器版回退
  `localStorage`，旧版启动时自动迁移），按标签 ID 隔离；标签列表与激活状态持久化，
  启动时恢复并合并磁盘内容
- **调试日志**：默认完全不写日志。需要排查问题时用 `QingMo.exe --qingmo-debug` 启动
  （或设环境变量 `QINGMO_DEBUG=1`），渲染层 console 会转发到
  `%TEMP%\mde-debug.log`（2MB 轮转）。注意开关不能叫 `--debug`：Electron 会把它
  当成 Node 选项而直接报 DEP0062 拒绝启动
- **文件访问边界**：渲染层通过 IPC 传来的路径一律先经过 `lib/path-guard.js` 校验，
  只允许**用户显式打开过的目录**（含子目录）与 `userData`；白名单持久化在
  `userData/trusted-roots.json`，否则重启后会话恢复读不到上次的文件

## 已知取舍

- 每个标签页拥有独立的 EditorState（各自的撤销栈与选区），因此**代码模式的撤销历史不跨标签页丢失**；
  但为控制内存，只缓存最近 12 个标签的 state，更早的标签切回后撤销栈会重建
  （正文不受影响），见 `js/02-codemirror.js` 的 `CM_STATE_MAX`
- md 模式（Vditor 内核）的撤销栈不能跨文档复用：切标签时会把撤销基线重置为本标签内容，
  所以 md 标签的撤销只覆盖本次切页之后的操作（不会把别的文件内容倒回来）
- 行首/行尾插入、全部替换这类批量改写会立即把结果压入撤销栈，Ctrl+Z 可一步撤销
- "全部替换"作用于源文本（与 Typora 相同），也会命中链接地址等位置
- 桌面版未签名，首次运行可能被杀毒软件拦截，选择允许即可
- 超大 Markdown（1MB 级）自动降级为代码模式打开（所见即所得渲染的架构上限）
- GBK 只在桌面版支持（浏览器备用模式仍为 UTF-8）

## 开发

```bash
npm install        # 装开发依赖（electron / esbuild / eslint / @codemirror/*）
npm start          # 直接跑 Electron 开发版
npm run build:cm6  # 改过 src/cm6-entry.js 后重新生成 cm6.js
npm run lint       # ESLint（no-undef 能抓出跨文件拼写错误）
npm run lint:globals  # js/*.js 新增顶层变量后刷新全局名清单
```

> `cm6.js` 是 `src/cm6-entry.js` 的 esbuild 产物，不要再手改它。
> 产物头部注释会记录本次打包用到的各依赖版本。

## 测试

```bash
npm test          # 路径白名单单测（纯 Node，不需要 GUI）
npm run smoke     # 渲染层交互冒烟（真实 Electron + 桩 IPC，隐藏窗口）
npm run smoke:app # 主进程集成测试（加载真 main.js，验证白名单与原子写）
```

三个脚本都以退出码返回结果，可直接接进 CI（需要图形会话）。

## 许可

仅供个人学习与使用。内置的 Vditor 遵循 MIT 许可，版权归其作者所有。
