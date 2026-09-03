# wcopy — Windows 剪贴板历史管理器

对标 macOS 上的 iCopy，为 Windows 平台打造的现代化剪贴板历史工具。

## 功能特性

- **真实剪贴板监听**：每 500ms 轮询，自动记录文本、代码、图片、文件、链接、富文本
- **来源识别**：Windows 下通过 PowerShell 获取前台窗口进程名，映射为常见应用名称和图标
- **搜索筛选**：顶部搜索框 + 分类标签快速定位
- **一键回写**：点击卡片即可写回剪贴板
- **快捷键唤起**：默认 `Ctrl + Shift + V`
- **系统托盘**：常驻后台，支持快速粘贴最近 5 条
- **深色/浅色主题**：跟随系统或手动切换
- **Windows 风格**：Fluent Design 圆角、亚克力标题栏
- **本地持久化**：历史记录保存到 `userData/history.json`，最多保留 200 条
- **设置面板**：开机自启、最大历史条数、默认主题、清除时保留收藏

## 项目结构

```
wcopy/
├── assets/          # 图标资源
├── docs/
│   └── design.md    # 产品/UI 设计文档
├── src/
│   ├── main.js      # Electron 主进程
│   ├── preload.js   # 安全预加载脚本
│   ├── index.html   # 渲染页面
│   ├── styles.css   # Windows 风格样式
│   └── app.js       # 界面交互逻辑
├── package.json
└── README.md
```

## 开发运行

在 Windows 上安装依赖：

```bash
cd wcopy
npm install
npm start
```

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

## 后续 roadmap

- [x] 接入真实剪贴板监听（文本/图片/文件/链接/富文本）
- [x] 历史条目置顶 / 收藏
- [x] 系统托盘快速粘贴
- [ ] SQLite 持久化存储（当前为 JSON）
- [x] 开机自启 & 设置面板
- [ ] 多显示器边缘对齐
- [x] 文件类型回写完整支持（CF_HDROP）
- [ ] 历史记录加密/隐私模式
