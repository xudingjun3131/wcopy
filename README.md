# wcopy — Windows 剪贴板历史管理器

对标 macOS 上的 iCopy，为 Windows 平台打造的现代化剪贴板历史工具。

## 功能特性

- **真实剪贴板监听**：每 500ms 轮询，自动记录文本、代码、图片、文件、链接、富文本
- **来源识别**：Windows 下通过 Win32 API 获取前台窗口进程名，映射为常见应用名称和图标
- **搜索筛选**：标题栏同一行内置筛选标签 + 可收起搜索框，快速定位
- **一键回写 / 双击粘贴**：单击卡片复制回剪贴板；双击卡片复制并粘贴回唤起前的原输入窗口
- **快捷键唤起**：默认 `Ctrl + Shift + V`
- **系统托盘**：常驻后台，支持托盘快速呼出
- **深色/浅色主题**：跟随系统或手动切换
- **Windows 风格**：Fluent Design 圆角、亚克力标题栏
- **本地持久化**：历史记录保存到 `AppData/com.itgank.wcopy/history.json`，最多保留 200 条
- **设置面板**：开机自启、最大历史条数、默认主题、清除时保留收藏

## 项目结构

```
wcopy/
├── assets/                       # 图标资源与生成脚本
├── src/                          # 前端
│   ├── index.html                # 渲染页面
│   ├── styles.css                # Windows Fluent 风格样式
│   ├── app.js                    # 界面交互逻辑
│   └── wcopy-api.js              # Tauri IPC 桥接
├── src-tauri/                    # Rust + Tauri 后端
│   ├── src/
│   │   ├── lib.rs                # Tauri 入口、捕获循环、窗口管理
│   │   ├── clipboard.rs          # 剪贴板读写
│   │   ├── store.rs              # JSON 持久化
│   │   ├── settings.rs           # 设置持久化
│   │   └── win.rs                # Windows 专属前台窗口 / Ctrl+V
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── README.md
```

## 开发运行

### 依赖

- Node.js 22+
- Rust / cargo

```bash
cd wcopy
npm install
cd src-tauri
cargo fetch
cd ..
npm run dev          # 启动 Tauri 开发模式
```

在 macOS 上只能做前端 / Rust 编译验证；真机剪贴板相关功能（如进程名识别、Ctrl+V 粘贴）需要在 Windows 下测试。

## 打包 Windows 安装包

目标是产出可在 Windows 上安装的 `wcopy-setup-x.y.z.exe`（NSIS 安装包）和 `wcopy-x.y.z.msi`（MSI 安装包）。

> ⚠️ 在 macOS / Linux 上交叉构建 Windows 目标需要 `wine` 运行 NSIS / WiX，而 Apple Silicon 上 `wine-stable` 的 brew cask 已被官方禁用、其余 wine 变体也极不稳定。**因此请在 Windows 真机或 GitHub Actions（Windows runner）上构建。**

### 方式 A：GitHub Actions 自动出包（推荐，最简单）

仓库已内置 `.github/workflows/build-windows.yml`，在真实的 Windows runner 上原生构建，**无需你本机安装 Wine 或 electron-builder**。

> **构建只在 tag 触发**：CI 的 `on.push` 只监听 `v*` 形式的 tag（版本号，如 `v1.0.1`）。普通 push 到 `main` **不会**出包。tag 即版本号，CI 会把 `package.json` 的 version 同步为 tag，产物名与 GitHub Release 都与 tag 一致。

**一键发布**（自动 +1 版本号、打 tag、推送 tag 触发构建）：

```bash
./scripts/release.sh          # patch +1（1.0.0 → 1.0.1）
./scripts/release.sh minor    # minor +1（1.0.0 → 1.1.0）
./scripts/release.sh major    # major +1（1.0.0 → 2.0.0）
./scripts/release.sh 1.2.3    # 指定版本号
```

脚本等价于：`npm version <版本>`（改 package.json + 打 `v<版本>` tag）→ `git push --follow-tags`。

也可以手动操作：

1. 用 `npm version <patch|minor|major|x.y.z>` 升级版本（会自动打 `vX.Y.Z` tag）
2. `git push --follow-tags` 推送 commit 和 tag
3. 推送 tag 后 **Actions → Build Windows Installer** 自动开始构建
4. 在 **Releases** 页下载本次 tag 的产出：
   - `wcopy-setup-x.y.z.exe`（NSIS 安装包）
   - `wcopy-x.y.z.msi`（MSI 安装包）

### 方式 B：Windows 本机一条命令

```bash
cd wcopy
npm install
npm run build:win
```

产物在 `dist/` 目录：

- `wcopy-setup-x.y.z.exe`：NSIS 安装包（双击安装，可选安装目录、创建桌面 / 开始菜单快捷方式）
- `wcopy-x.y.z.msi`：MSI 安装包

### 方式 C：macOS / Linux 交叉编译（需 Wine，不推荐）

非 Windows 平台构建需自行安装 `wine`：

```bash
brew install --cask wine-stable   # 注意：Apple Silicon 上该 cask 已被禁用
npm install
npm run build:win
```

成功后产物同样在 `dist/`。

## 快捷键

| 快捷键 | 行为 |
|--------|------|
| `Ctrl + Shift + V` | 显示/隐藏主窗口 |
| `Esc` | 隐藏窗口 |
| `Ctrl + K` / `Ctrl + F` | 聚焦搜索框 |
| `↑ / ↓` | 切换选中卡片 |
| `Enter` | 回写当前选中项并隐藏 |
| `Ctrl + D` | 删除当前选中项 |

## 最近更新

### v1.1.8

- **修复：切换贴边方向后满屏展开** — 切换上/下/左/右方向时，上个方向保存的「整屏宽/整屏高」被新方向误当成用户手动调整的尺寸（如从顶部切到左侧，整屏宽被用作左面板宽度）。`WindowBounds` 新增 `dock` 字段记录保存尺寸时的方向：只有方向一致才复用尺寸，且过滤掉接近整屏的值；切换方向后一律回到默认尺寸（460 宽 / 640 高），之后再拖动会重新记住。

### v1.1.7

- **修复：贴边左侧有空隙** — 上/下/左贴边时窗口左侧留有一节约 7px 的缝：这是 Windows 上无边框窗口开启 DWM 阴影（`shadow`）后自带不可见边框导致的。将主窗口 `shadow` 设为 `false`，窗口可完全贴死屏幕边缘（停靠面板场景不需要投影）。

### v1.1.6

- **修复：窗口高度被重置** — `position_window` 现在记住用户手动调整的尺寸：上下贴边保留自定义高度、左右贴边保留自定义宽度（另一维始终占满工作区保证贴边）。默认高度统一为 640，不再出现 760/460 两种互相冲突的默认值。
- **修复：左右贴边时标题栏按钮不可点** — 窄窗口下「N 条记录」计数与网格/列表视图切换会溢出被裁剪；现在左右贴边时隐藏这两项（窄列模式下无意义），筛选 tab 可横向滚动，窗口按钮始终完整可见、可点击。
- **UI：搜索按钮移到「全部」tab 之前**，标题栏顺序为：搜索（默认收起）→ 全部/文本/图片/文件/链接/收藏 → 视图 → 窗口按钮。
- **UI：标题栏移除「wcopy」logo 与文字**，应用品牌（logo + 名称 + 版本）移到设置面板头部「关于」位置展示。

### v1.1.5

- **修复：窗口贴边与定位** — 重写 `position_window`：
  - 始终按 `popupPosition` 计算屏幕工作区边缘坐标，不再使用保存的 `x/y` 位置，避免“第一次打开一个位置、快捷键唤出另一个位置”。
  - `set_settings` 中先释放 settings 锁再调用 `position_window`，消除切换弹窗方向时的死锁/卡死。
  - `toggle_popup` 显示窗口后调用 `set_focus()`，确保窗口获得焦点。
- **修复：托盘图标点击闪烁** — 托盘点击改为总是显示并聚焦（带 300ms 防抖），不再走 toggle，避免连发事件导致窗口一闪而过。
- **精简：移除设置面板里的主题切换** — 主题切换保留在标题栏按钮，设置面板中不再重复。

### v1.1.4

- **诊断：状态栏后端/捕获健康指示** — 底部状态栏新增 `backendBadge`：
  - 若前端未正确接入 Tauri（走了浏览器演示模式），显示 **⚠ 演示模式（未连接本地后端）**，便于一眼确认桥接是否成功。
  - 真机运行时显示 **✓ 已连接 · 最近捕获 X 分钟前 · 共 N 条**，帮助判断到底是“没捕获”还是“捕获了 UI 没刷新”。

### v1.1.3

- **修复 / 健壮性：剪贴板捕获线程** — 后端捕获循环加入 `catch_unwind` 保护，单次异常（如 Windows 剪贴板锁竞争）不会导致线程永久死亡；所有 Mutex 锁改为中毒恢复，避免某处 panic 后整把锁不可用。
- **修复：前端兜底同步** — 即使 `history-updated` 事件偶发丢失，也通过 600ms 轮询 `getHistory` 让 UI 始终与持久化 store 保持一致，仅在数据变化时重渲染。
- **UI 改版：筛选与搜索同处标题栏** — 全部 / 文本 / 图片 / 文件 / 链接 / 收藏 六个筛选 tab 与搜索框放在同一行；搜索框默认收起，点击搜索按钮才展开，Ctrl+K 也会自动展开。
- **开发服务器修复** — 修正 `dev-server.mjs` 的 `node:fs/promises` / `node:path` / `rmSync` 用法，Tauri dev 可正常启动。

## 后续 roadmap

- [x] 接入真实剪贴板监听（文本/图片/文件/链接/富文本）
- [x] 历史条目置顶 / 收藏
- [x] 系统托盘快速粘贴
- [ ] SQLite 持久化存储（当前为 JSON）
- [x] 开机自启 & 设置面板
- [ ] 多显示器边缘对齐
- [x] 文件类型回写完整支持（CF_HDROP）
- [ ] 历史记录加密/隐私模式

## 用户数据 / 升级保留

- 历史记录保存在当前用户的 `AppData`（Electron `userData`）目录下（`history.json` / `settings.json`），**与安装目录（Program Files）分离**。
- 因此覆盖安装、升级版本、甚至重装系统后只要用户配置目录还在，历史剪切板数据都不会丢。
- NSIS 安装包已显式设置 `deleteAppDataOnUninstall: false`，**卸载时也不会删除用户历史数据**（如需彻底清理，请手动删除该目录）。MSI 安装包本身不会删除用户 `AppData`，同样安全。
- 注意：`perMachine` 安装是面向「所有用户」的，每位 Windows 用户有各自独立的历史记录，互不共享。

## 许可证

本项目采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)（署名-非商业性使用 4.0 国际）许可证。

- 允许个人学习、修改、非商业分发。
- **禁止商用**，如需商用请联系作者获得书面授权。
- 完整的许可证文本见仓库根目录 [`LICENSE`](./LICENSE)。

`wcopy` 名称及 Logo（敢客 / itgank.com）为相关权利人商标，未经许可不得擅自使用。
