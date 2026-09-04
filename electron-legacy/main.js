const { app, BrowserWindow, clipboard, globalShortcut, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile, execFileSync, spawn } = require('child_process');
const { ClipboardStore } = require('./store');
const { SettingsStore } = require('./settings');

let mainWindow = null;
let tray = null;
let store = null;
let settings = null;
let watcherId = null;
let lastHash = '';
let popupAccel = 'CommandOrControl+Shift+V';
let opening = false; // 防止快捷键连发重复唤起
let targetHwnd = null; // 唤起弹窗时记录的前台窗口句柄（粘贴时用于把焦点还给原应用）

// 同步获取当前前台窗口句柄（仅 Windows）。必须在快捷键回调里、弹窗显示之前调用，
// 此时用户原应用（如记事本）仍是前台，句柄才准确。点击弹窗后 wcopy 会成为前台，
// 那时再取就变成 wcopy 自己了，所以这里提前记录。
function captureTargetHwnd() {
  if (process.platform !== 'win32') { targetHwnd = null; return; }
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Add-Type @\"using System;using System.Runtime.InteropServices;public class GW{[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();}\"@; [GW]::GetForegroundWindow().ToString()'
    ], { timeout: 1000, windowsHide: true });
    const s = out.toString().trim();
    targetHwnd = /^\d+$/.test(s) ? s : null;
  } catch (e) {
    targetHwnd = null;
  }
}

let psWarmed = false;
// 预热 PowerShell：它冷启动通常要 1 秒以上，等它起来时焦点早已变化，粘贴就失败了。
// 弹窗首次显示后先跑一次空命令把映像缓存起来，后续调用会快很多。
function warmupPowershell() {
  if (psWarmed || process.platform !== 'win32') return;
  psWarmed = true;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', 'exit'], () => {});
}

// 粘贴诊断日志：写到 userData/paste-debug.log，便于定位“弹窗关了但没粘贴上”的真实原因
function pasteLog(msg) {
  try {
    const file = path.join(app.getPath('userData'), 'paste-debug.log');
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    let tooBig = false;
    try { tooBig = fs.statSync(file).size > 300000; } catch (e) { /* 文件还不存在 */ }
    if (tooBig) fs.writeFileSync(file, line);
    else fs.appendFileSync(file, line);
  } catch (e) { /* 日志失败不影响主流程 */ }
}

const isDev = process.env.NODE_ENV === 'development';

const APP_MAP = {
  chrome: { name: 'Google Chrome', icon: '🌐' },
  msedge: { name: 'Microsoft Edge', icon: '🌐' },
  firefox: { name: 'Firefox', icon: '🦊' },
  explorer: { name: '文件资源管理器', icon: '📁' },
  code: { name: 'VS Code', icon: '💻' },
  slack: { name: 'Slack', icon: '💬' },
  wechat: { name: '微信', icon: '💬' },
  qq: { name: 'QQ', icon: '🐧' },
  dingtalk: { name: '钉钉', icon: '🔔' },
  notion: { name: 'Notion', icon: '📝' },
  idea64: { name: 'IntelliJ IDEA', icon: '☕' },
  webstorm64: { name: 'WebStorm', icon: '🌪️' },
  datagrip64: { name: 'DataGrip', icon: '🐘' },
  rider64: { name: 'Rider', icon: '🔷' },
  clion64: { name: 'CLion', icon: '💜' },
  goland64: { name: 'GoLand', icon: '🐹' },
  phpstorm64: { name: 'PhpStorm', icon: '⛈️' },
  rubymine: { name: 'RubyMine', icon: '💎' },
  powershell: { name: 'PowerShell', icon: '💻' },
  cmd: { name: '命令提示符', icon: '💻' },
  'windows terminal': { name: 'Windows Terminal', icon: '💻' },
  iterm: { name: 'iTerm', icon: '💻' },
  terminal: { name: '终端', icon: '💻' },
  'terminal (mac)': { name: '终端', icon: '💻' },
  preview: { name: '预览', icon: '👁️' },
  finder: { name: '访达', icon: '📁' },
  'system preferences': { name: '系统偏好设置', icon: '⚙️' },
  'system settings': { name: '系统设置', icon: '⚙️' },
  unknown: { name: '未知应用', icon: '📋' }
};

function resolveApp(rawName, title = '') {
  const key = (rawName || '').toLowerCase().trim();
  const appInfo = APP_MAP[key] || { name: title || (rawName || '未知应用'), icon: '📋' };
  return appInfo;
}

function getActiveApp() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const script = `
Add-Type -TypeDefinition @"
using System; using System.Diagnostics; using System.Runtime.InteropServices; using System.Text;
public class ActiveWindow {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", SetLastError=true)] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  public static string GetProcessName() {
    IntPtr hWnd = GetForegroundWindow();
    uint pid;
    GetWindowThreadProcessId(hWnd, out pid);
    try { return Process.GetProcessById((int)pid).ProcessName; }
    catch { return ""; }
  }
  public static string GetWindowTitle() {
    IntPtr hWnd = GetForegroundWindow();
    StringBuilder sb = new StringBuilder(256);
    GetWindowText(hWnd, sb, 256);
    return sb.ToString();
  }
}
"@
$proc = [ActiveWindow]::GetProcessName()
$title = [ActiveWindow]::GetWindowTitle()
Write-Output "$proc|$title"
`;
      const psPath = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
      exec(`"${psPath}" -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, { timeout: 2000 }, (err, stdout) => {
        if (err) return resolve(resolveApp(''));
        const [procName, ...titleParts] = stdout.trim().split('|');
        resolve(resolveApp(procName, titleParts.join('|')));
      });
    } else if (process.platform === 'darwin') {
      exec('osascript -e "tell application \\"System Events\\" to get name of first application process whose frontmost is true"', { timeout: 2000 }, (err, stdout) => {
        if (err) return resolve(resolveApp(''));
        resolve(resolveApp(stdout.trim()));
      });
    } else {
      resolve(resolveApp(''));
    }
  });
}

function isImageClipboard() {
  try {
    const img = clipboard.readImage();
    return img && !img.isEmpty();
  } catch {
    return false;
  }
}

function parseFileList(buffer) {
  if (!buffer || buffer.length === 0) return [];
  try {
    // FileNameW: double-null-terminated UTF-16LE list
    const text = buffer.toString('utf16le');
    return text.split('\0').filter(s => s.trim().length > 0);
  } catch {
    return [];
  }
}

function readFilePaths() {
  try {
    if (process.platform === 'win32') {
      const buf = clipboard.readBuffer('FileNameW');
      if (buf && buf.length > 0) {
        const files = parseFileList(buf);
        if (files.length > 0) return files;
      }
    }
    const uri = clipboard.read('text/uri-list');
    if (uri) return uri.split('\n').map(l => l.trim()).filter(l => l.startsWith('file://')).map(l => decodeURI(l.replace(/^file:\/\//, '')));
  } catch (err) {
    console.error('readFilePaths error:', err);
  }
  return [];
}

function detectCode(text) {
  if (!text || !text.includes('\n')) return false;
  const codePattern = /[{};=\[\]<>/\\|`~]/;
  return codePattern.test(text);
}

function isLink(text) {
  return /^https?:\/\/\S+/i.test(text.trim());
}

function resizeImage(nativeImage, maxSize = 512) {
  const size = nativeImage.getSize();
  if (size.width <= maxSize && size.height <= maxSize) {
    return nativeImage.toPNG();
  }
  const ratio = Math.min(maxSize / size.width, maxSize / size.height);
  const newWidth = Math.round(size.width * ratio);
  const newHeight = Math.round(size.height * ratio);
  return nativeImage.resize({ width: newWidth, height: newHeight }).toPNG();
}

async function captureClipboard() {
  try {
    const files = readFilePaths();
    if (files.length > 0) {
      const app = await getActiveApp();
      const hash = store.hash(files.join('|'));
      if (hash === lastHash) return;
      lastHash = hash;
      const item = {
        id: `${Date.now()}-${hash}`,
        type: 'file',
        content: files,
        source: app.name,
        appIcon: app.icon,
        time: Date.now(),
        chars: 0,
        favorite: false,
        pinned: false,
        hash
      };
      store.add(item);
      notifyHistoryUpdated();
      return;
    }

    const image = clipboard.readImage();
    if (image && !image.isEmpty()) {
      const size = image.getSize();
      const pngBuffer = resizeImage(image);
      const base64 = pngBuffer.toString('base64');
      const hash = store.hash(base64.slice(0, 64));
      if (hash === lastHash) return;
      lastHash = hash;
      const app = await getActiveApp();
      const item = {
        id: `${Date.now()}-${hash}`,
        type: 'image',
        content: {
          base64,
          width: size.width,
          height: size.height,
          size: pngBuffer.length
        },
        source: app.name,
        appIcon: app.icon,
        time: Date.now(),
        chars: 0,
        favorite: false,
        pinned: false,
        hash
      };
      store.add(item);
      notifyHistoryUpdated();
      return;
    }

    const html = clipboard.readHTML();
    const rtf = clipboard.readRTF();
    const text = clipboard.readText();

    if (!text && !html) return;

    const hash = store.hash(text || html);
    if (hash === lastHash) return;
    lastHash = hash;

    let type = 'text';
    if (isLink(text)) type = 'link';
    else if (detectCode(text)) type = 'code';
    else if (html && html !== text && html.length > 0) type = 'rich';

    const app = await getActiveApp();
    const item = {
      id: `${Date.now()}-${hash}`,
      type,
      content: text,
      html: html || undefined,
      rtf: rtf || undefined,
      source: app.name,
      appIcon: app.icon,
      time: Date.now(),
      chars: text.length,
      favorite: false,
      pinned: false,
      hash
    };
    store.add(item);
    notifyHistoryUpdated();
  } catch (err) {
    console.error('captureClipboard error:', err);
  }
}

function notifyHistoryUpdated() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('history-updated', store.getAll());
  }
  updateTrayMenu();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 320,
    minHeight: 200,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#F3F3F3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '..', 'assets', 'icon-taskbar.png')
  });

  // 弹窗始终置顶，确保以非激活方式显示时也能盖在记事本等原应用之上
  mainWindow.setAlwaysOnTop(true);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 注意：不再在 blur 时自动隐藏窗口。弹窗仅在「粘贴完成后」或「点击 X / 再次按快捷键 / Esc」时关闭，
  // 这样用户点击弹窗区域外不会被关掉，也保证双击粘贴能把内容送回唤起前正在使用的应用。

  mainWindow.once('ready-to-show', () => {
    positionWindow();
    mainWindow.showInactive();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon);
  tray.setToolTip('wcopy - 剪贴板历史');
  updateTrayMenu();
  tray.on('click', () => toggleWindow());
}

function updateTrayMenu() {
  if (!tray) return;
  const recent = store.getAll().slice(0, 5);
  const recentItems = recent.map((item, index) => ({
    label: `${index + 1}. ${formatTrayLabel(item)}`,
    click: () => writeItemToClipboard(item.id)
  }));

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 wcopy', click: () => toggleWindow() },
    { type: 'separator' },
    ...recentItems,
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
}

function formatTrayLabel(item) {
  const max = 30;
  let label = '';
  if (item.type === 'image') label = `[图片] ${item.content.width}×${item.content.height}`;
  else if (item.type === 'file') label = `[文件] ${Array.isArray(item.content) ? item.content.length : 1} 个`;
  else label = String(item.content).replace(/\n/g, ' ');
  if (label.length > max) label = label.slice(0, max) + '...';
  return label || '(空)';
}

// 贴边弹窗尺寸：左右为竖向整条（满高窄列），上下为横向整条（满宽矮行）
const DOCK_COLUMN_WIDTH = 380;
const DOCK_ROW_HEIGHT = 380;

function positionWindow() {
  if (!mainWindow) return;
  const pos = (settings && settings.get().popupPosition) || 'right';
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  let nx, ny, nw, nh;
  switch (pos) {
    case 'left':
      nw = DOCK_COLUMN_WIDTH;
      nh = area.height;
      nx = area.x;
      ny = area.y;
      break;
    case 'right':
      nw = DOCK_COLUMN_WIDTH;
      nh = area.height;
      nx = area.x + area.width - nw;
      ny = area.y;
      break;
    case 'top':
      nw = area.width;
      nh = DOCK_ROW_HEIGHT;
      nx = area.x;
      ny = area.y;
      break;
    case 'bottom':
      nw = area.width;
      nh = DOCK_ROW_HEIGHT;
      nx = area.x;
      ny = area.y + area.height - nh;
      break;
    default:
      nw = DOCK_COLUMN_WIDTH;
      nh = area.height;
      nx = area.x + area.width - nw;
      ny = area.y;
  }
  // 夹在可用工作区内，避免越界
  nw = Math.max(320, Math.min(nw, area.width));
  nh = Math.max(200, Math.min(nh, area.height));
  nx = Math.max(area.x, Math.min(nx, area.x + area.width - nw));
  ny = Math.max(area.y, Math.min(ny, area.y + area.height - nh));
  mainWindow.setBounds({ x: nx, y: ny, width: nw, height: nh });
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }
  if (opening) return;
  opening = true;
  positionWindow();
  // 以「非激活」方式显示，避免抢走原应用（如记事本）的键盘焦点与光标；
  // 鼠标事件仍能被弹窗接收，双击/Enter 粘贴时隐藏弹窗，焦点自然回退到原应用
  mainWindow.showInactive();
  opening = false;
  warmupPowershell();
}

function registerShortcuts() {
  if (popupAccel) {
    globalShortcut.register(popupAccel, () => { captureTargetHwnd(); toggleWindow(); });
  }
}

// 重新注册弹窗快捷键（设置变更时调用）。返回是否注册成功。
function applyPopupShortcut(accel) {
  if (popupAccel) {
    try { globalShortcut.unregister(popupAccel); } catch (e) { /* ignore */ }
  }
  popupAccel = accel;
  if (!accel) return true;
  return globalShortcut.register(accel, () => { captureTargetHwnd(); toggleWindow(); });
}

function applyLoginItem() {
  if (!app.setLoginItemSettings) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: !!settings.get().launchAtLogin,
      path: process.execPath,
      args: []
    });
  } catch (err) {
    console.error('applyLoginItem error:', err);
  }
}

async function writeItemToClipboard(id) {
  const item = store.getAll().find(i => i.id === id);
  if (!item) return false;

  try {
    if (item.type === 'image') {
      const img = nativeImage.createFromBuffer(Buffer.from(item.content.base64, 'base64'));
      clipboard.writeImage(img);
    } else if (item.type === 'file') {
      // 暂时以路径文本回写；真实文件(CF_HDROP)的保留需额外工作
      clipboard.writeText(Array.isArray(item.content) ? item.content.join('\n') : item.content);
    } else {
      // 文本类（text/link/code/rich）：只要捕获时存了 html 或 rtf，就原样带格式写回，
      // 避免从 IDE 复制的高亮代码、富文本链接等降级为纯文本
      if (item.html || item.rtf) {
        const payload = { text: item.content };
        if (item.html) payload.html = item.html;
        if (item.rtf) payload.rtf = item.rtf;
        clipboard.write(payload);
      } else {
        clipboard.writeText(item.content);
      }
    }
    return true;
  } catch (err) {
    console.error('writeItemToClipboard error:', err);
    return false;
  }
}

// IPC handlers
ipcMain.handle('get-history', () => store.getAll());
ipcMain.handle('delete-item', (event, id) => { store.delete(id); notifyHistoryUpdated(); });
ipcMain.handle('toggle-favorite', (event, id) => { store.toggleFavorite(id); notifyHistoryUpdated(); });
ipcMain.handle('toggle-pin', (event, id) => { store.togglePin(id); notifyHistoryUpdated(); });
ipcMain.handle('clear-history', () => { store.clear(); notifyHistoryUpdated(); });
ipcMain.handle('write-item', (event, id) => writeItemToClipboard(id));

// 复制并粘贴：写入剪贴板 ->（Windows）把焦点强制还给唤起前记录的原应用再发 Ctrl+V -> 关闭弹窗
// 关键：用户点击弹窗后 wcopy 会成为前台，原应用（记事本）失去焦点。所以粘贴时必须显式把焦点
// 还给原应用，否则 Ctrl+V 会发到 wcopy 自己。Windows 的 SetForegroundWindow 有“前台锁”限制，
// 后台进程直接调用会被拒绝；用 AttachThreadInput 把 PowerShell 线程附着到当前前台线程（拥有前台
// 权限）后，SetForegroundWindow 才能可靠把焦点还给原应用，再发 Ctrl+V。
// 粘贴按键部分：用 keybd_event 直接发 Ctrl+V，比 SendKeys.SendWait 更底层、更可控。
// VK_CONTROL=0x11, 'V'=0x56, KEYEVENTF_KEYUP=0x0002
const PASTE_PS_TEMPLATE = `
$hwnd = [IntPtr]::Parse("__HWND__")
Write-Output "target=$hwnd"
if ([W32]::IsIconic($hwnd)) { [W32]::ShowWindow($hwnd, 9) }   # SW_RESTORE
$fore = [W32]::GetForegroundWindow()
Write-Output "fore_before=$fore"
# 注意：out uint 参数必须传精确类型的变量，否则 P/Invoke 会抛异常导致后面全部不执行
[uint32]$procId = 0
$ft = [W32]::GetWindowThreadProcessId($fore, [ref]$procId)
$self = [W32]::GetCurrentThreadId()
# 附着到当前前台线程以获取前台权限，否则 SetForegroundWindow 会被前台锁拒绝
[W32]::AttachThreadInput($ft, $self, $true)
$ok = [W32]::SetForegroundWindow($hwnd)
[W32]::AttachThreadInput($ft, $self, $false)
Write-Output "setfg=$ok"
Start-Sleep -Milliseconds 150
$fore2 = [W32]::GetForegroundWindow()
Write-Output "fore_after=$fore2 match=$($fore2 -eq $hwnd)"
# Ctrl+V：keybd_event(VK_CONTROL=0x11, 'V'=0x56, KEYEVENTF_KEYUP=2)
[W32]::keybd_event([byte]0x11, [byte]0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[W32]::keybd_event([byte]0x56, [byte]0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[W32]::keybd_event([byte]0x56, [byte]0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[W32]::keybd_event([byte]0x11, [byte]0, 2, [UIntPtr]::Zero)
Write-Output "sent=1"
`;

// 未记录到原应用句柄时的兜底：只发 Ctrl+V 给当前前台窗口
const PASTE_FALLBACK_PS = `
Start-Sleep -Milliseconds 120
$fore = [W32]::GetForegroundWindow()
Write-Output "fallback_fore=$fore"
[W32]::keybd_event([byte]0x11, [byte]0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[W32]::keybd_event([byte]0x56, [byte]0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[W32]::keybd_event([byte]0x56, [byte]0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
[W32]::keybd_event([byte]0x11, [byte]0, 2, [UIntPtr]::Zero)
Write-Output "fallback_sent=1"
`;

// 判断记录的句柄是否是 wcopy 自己的窗口（避免把焦点还给 wcopy 本身）
// ============ 粘贴提速：预编译 DLL + 常驻 PowerShell ============
// 原实现每次粘贴都要新起 PowerShell 并现场 Add-Type 编译 C#（约 1~3 秒），等它执行时焦点早已变化，
// 这就是“很难粘贴”的主因。改为：① 首次运行把 P/Invoke 代码编译成 DLL 永久复用；
// ② 启动后常驻一个 PowerShell 预加载该 DLL，粘贴时只写一行命令，执行降到几十毫秒。
const W32_CS = `
using System;
using System.Runtime.InteropServices;
public class W32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
`;

let w32DllPath = null;
let pasteSession = null;
let pasteSessionReady = false;
let pasteSessionStarting = false;

function w32DllFilePath() {
  return path.join(app.getPath('userData'), 'wcopy-w32.dll');
}

// 首次把 C# P/Invoke 编译成 DLL；已存在则直接复用
function ensureW32Dll(cb) {
  if (process.platform !== 'win32') return cb(null);
  try {
    const dll = w32DllFilePath();
    if (fs.existsSync(dll)) { w32DllPath = dll; return cb(dll); }
    const cmd = `Add-Type -TypeDefinition '${W32_CS}' -OutputAssembly '${dll}' -OutputType Library -Language CSharp`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', cmd],
      { windowsHide: true, timeout: 60000 }, (err) => {
        if (err) { pasteLog(`dll build failed: ${err.message}`); return cb(null); }
        if (fs.existsSync(dll)) { w32DllPath = dll; pasteLog('dll ready'); return cb(dll); }
        pasteLog('dll not produced');
        cb(null);
      });
  } catch (e) {
    pasteLog(`dll error: ${e.message}`);
    cb(null);
  }
}

// 常驻 PowerShell 的宿主脚本：预加载 DLL 并定义粘贴函数，然后从 stdin 逐行接收命令
function pasteHostScript(dll) {
  return `
Add-Type -Path '${dll}'
function Invoke-WcPaste([string]$hwndStr) {
  $hwnd = [IntPtr]::Parse($hwndStr)
  if ([W32]::IsIconic($hwnd)) { [W32]::ShowWindow($hwnd, 9) }
  $fore = [W32]::GetForegroundWindow()
  [uint32]$procId = 0
  $ft = [W32]::GetWindowThreadProcessId($fore, [ref]$procId)
  $self = [W32]::GetCurrentThreadId()
  [W32]::AttachThreadInput($ft, $self, $true)
  $ok = [W32]::SetForegroundWindow($hwnd)
  [W32]::AttachThreadInput($ft, $self, $false)
  # 轮询等待前台窗口真正切到目标（多数情况 10~30ms），最多 150ms，命中即发键
  $waited = 0
  while (($waited -lt 15) -and ([W32]::GetForegroundWindow() -ne $hwnd)) {
    Start-Sleep -Milliseconds 10
    $waited++
  }
  [W32]::keybd_event([byte]0x11, [byte]0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 20
  [W32]::keybd_event([byte]0x56, [byte]0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 20
  [W32]::keybd_event([byte]0x56, [byte]0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 20
  [W32]::keybd_event([byte]0x11, [byte]0, 2, [UIntPtr]::Zero)
  Write-Output "pasted setfg=$ok"
}
function Invoke-WcCtlV {
  [W32]::keybd_event([byte]0x11, [byte]0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 20
  [W32]::keybd_event([byte]0x56, [byte]0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 20
  [W32]::keybd_event([byte]0x56, [byte]0, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 20
  [W32]::keybd_event([byte]0x11, [byte]0, 2, [UIntPtr]::Zero)
  Write-Output "ctlv sent"
}
Write-Output "READY"
while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  try { Invoke-Expression $line } catch { Write-Output "ERR: $($_.Exception.Message)" }
}
`;
}

// 启动常驻 PowerShell（仅一次）；失败不影响功能，粘贴会自动走 execFile 回退
function startPasteSession() {
  if (process.platform !== 'win32' || pasteSession || pasteSessionStarting) return;
  pasteSessionStarting = true;
  ensureW32Dll((dll) => {
    if (!dll) { pasteSessionStarting = false; pasteLog('paste session skipped (no dll)'); return; }
    let hostPath = null;
    try {
      hostPath = path.join(app.getPath('userData'), 'wcopy-paste-host.ps1');
      fs.writeFileSync(hostPath, pasteHostScript(dll), 'utf8');
    } catch (e) {
      pasteSessionStarting = false;
      pasteLog(`write host failed: ${e.message}`);
      return;
    }
    try {
      pasteSession = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', hostPath],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      pasteSession.stdout.on('data', (d) => {
        const s = String(d);
        if (s.indexOf('READY') >= 0) pasteSessionReady = true;
        const t = s.trim().replace(/\s+/g, ' ');
        if (t && t.indexOf('READY') < 0) pasteLog(`ps: ${t.slice(0, 200)}`);
      });
      pasteSession.stderr.on('data', (d) => pasteLog(`ps-err: ${String(d).trim().slice(0, 300)}`));
      pasteSession.on('exit', (code) => { pasteLog(`ps exit ${code}`); pasteSession = null; pasteSessionReady = false; });
      pasteSession.on('error', (e) => { pasteLog(`ps error: ${e.message}`); pasteSession = null; pasteSessionReady = false; });
      pasteLog('paste session starting');
    } catch (e) {
      pasteLog(`spawn failed: ${e.message}`);
      pasteSession = null;
    }
    pasteSessionStarting = false;
  });
}

// 优先走常驻进程（毫秒级）；返回 false 表示需要回退
function sendPasteViaSession(cmdLine) {
  if (!pasteSession || !pasteSessionReady) return false;
  try {
    pasteSession.stdin.write(cmdLine + '\n');
    return true;
  } catch (e) {
    pasteLog(`session write failed: ${e.message}`);
    return false;
  }
}

// 回退：单次启动 PowerShell 执行（DLL 已就绪时只加载，不再现场编译）
function sendPasteViaExec(psBody) {
  const dll = w32DllPath && fs.existsSync(w32DllPath) ? w32DllPath : null;
  const loader = dll ? `Add-Type -Path '${dll}'` : `Add-Type -TypeDefinition '${W32_CS}'`;
  const ps = `${loader}\n${psBody}`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps],
    { windowsHide: true, timeout: 10000 }, (err, stdout, stderr) => {
      if (stdout) pasteLog(`out: ${String(stdout).trim().replace(/\s+/g, ' ').slice(0, 300)}`);
      if (stderr) pasteLog(`stderr: ${String(stderr).trim().slice(0, 400)}`);
      if (err) pasteLog(`fail: ${err.message}`);
    });
}

function isSelfHwnd(hwnd) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const h = mainWindow.getNativeWindowHandle();
    if (!h) return false;
    return h.readBigUInt64LE().toString() === String(hwnd);
  } catch (e) {
    return false;
  }
}

// 复制并粘贴：写入剪贴板 ->（Windows）先隐藏弹窗让焦点自然回退 -> 强制把焦点还给原应用 -> 发 Ctrl+V
ipcMain.handle('paste-item', async (event, id) => {
  const ok = await writeItemToClipboard(id);
  if (!ok) return false;
  if (process.platform === 'win32') {
    // 先隐藏弹窗：焦点自然回退到原应用，避免 wcopy 抢焦点导致 Ctrl+V 发给自己
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    const hwnd = (targetHwnd && targetHwnd !== '0' && !isSelfHwnd(targetHwnd)) ? targetHwnd : null;
    if (hwnd) {
      // 优先复用常驻 PowerShell（几十毫秒）；未就绪才单次启动
      pasteLog(`paste hwnd=${hwnd} via=${pasteSessionReady ? 'session' : 'exec'}`);
      if (!sendPasteViaSession(`Invoke-WcPaste -hwndStr '${hwnd}'`)) {
        sendPasteViaExec(PASTE_PS_TEMPLATE.replace('__HWND__', hwnd));
      }
    } else {
      // 没记录到原应用句柄：只把 Ctrl+V 发给当前前台
      pasteLog('paste no-hwnd: ctrl+v to foreground');
      if (!sendPasteViaSession('Invoke-WcCtlV')) {
        sendPasteViaExec(PASTE_FALLBACK_PS);
      }
    }
  } else {
    // 非 Windows：写入剪贴板后仅复制，然后关闭弹窗
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  }
  return true;
});
ipcMain.handle('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.handle('window-close', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.handle('get-settings', () => settings ? settings.get() : {});
ipcMain.handle('set-settings', (event, patch) => {
  const updated = settings.set(patch || {});
  if (patch && typeof patch.launchAtLogin === 'boolean') applyLoginItem();
  if (patch && patch.maxItems) {
    store.maxItems = patch.maxItems;
    store.enforceMaxItems();
  }
  if (patch && patch.popupPosition && mainWindow && mainWindow.isVisible()) {
    positionWindow();
  }
  if (patch && patch.popupShortcut) {
    const ok = applyPopupShortcut(patch.popupShortcut);
    if (!ok) {
      // 注册失败（快捷键无效或已被占用），回退到原值
      settings.set({ popupShortcut: popupAccel });
      updated.popupShortcut = popupAccel;
    }
  }
  return updated;
});
// 录制弹窗快捷键时临时停用全局快捷键，避免冲突触发
ipcMain.handle('popup-shortcut-capture', (event, active) => {
  if (active) {
    if (popupAccel) { try { globalShortcut.unregister(popupAccel); } catch (e) {} }
  } else {
    if (popupAccel) globalShortcut.register(popupAccel, () => toggleWindow());
  }
});
ipcMain.handle('get-app-version', () => app.getVersion());

app.whenReady().then(() => {
  settings = new SettingsStore(app.getPath('userData'));
  const initialMaxItems = settings.get().maxItems || 200;
  store = new ClipboardStore(app.getPath('userData'), { maxItems: initialMaxItems });
  popupAccel = settings.get().popupShortcut || 'CommandOrControl+Shift+V';
  applyLoginItem();
  createWindow();
  createTray();
  registerShortcuts();

  // 启动常驻 PowerShell（预编译 DLL + 预加载），让后续粘贴在几十毫秒内完成
  startPasteSession();

  // Start clipboard watcher
  watcherId = setInterval(captureClipboard, 500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Windows keeps running in tray
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (watcherId) clearInterval(watcherId);
  // 结束常驻 PowerShell，避免残留进程
  if (pasteSession) {
    try { pasteSession.kill(); } catch (e) { /* ignore */ }
    pasteSession = null;
    pasteSessionReady = false;
  }
});

app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
});
