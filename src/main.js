const { app, BrowserWindow, clipboard, globalShortcut, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { ClipboardStore } = require('./store');
const { SettingsStore } = require('./settings');

let mainWindow = null;
let tray = null;
let store = null;
let settings = null;
let watcherId = null;
let lastHash = '';
let popupAccel = 'CommandOrControl+Shift+V';

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
    minWidth: 720,
    minHeight: 480,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#F3F3F3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('blur', () => {
    if (!isDev) {
      mainWindow.hide();
    }
  });

  mainWindow.once('ready-to-show', () => {
    positionWindow();
    mainWindow.show();
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

function positionWindow() {
  if (!mainWindow) return;
  const pos = (settings && settings.get().popupPosition) || 'right';
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const b = mainWindow.getBounds();
  const centerX = area.x + Math.round((area.width - b.width) / 2);
  const centerY = area.y + Math.round((area.height - b.height) / 2);
  let nx = b.x;
  let ny = b.y;
  switch (pos) {
    case 'left':
      nx = area.x;
      ny = centerY;
      break;
    case 'top':
      nx = centerX;
      ny = area.y;
      break;
    case 'bottom':
      nx = centerX;
      ny = area.y + area.height - b.height;
      break;
    case 'right':
    default:
      nx = area.x + area.width - b.width;
      ny = centerY;
      break;
  }
  // 防止窗口大于可用区域时越界，回退到区域内左上角
  nx = Math.max(area.x, Math.min(nx, area.x + Math.max(0, area.width - b.width)));
  ny = Math.max(area.y, Math.min(ny, area.y + Math.max(0, area.height - b.height)));
  mainWindow.setBounds({ x: nx, y: ny, width: b.width, height: b.height });
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    positionWindow();
    mainWindow.show();
    mainWindow.focus();
  }
}

function registerShortcuts() {
  if (popupAccel) {
    globalShortcut.register(popupAccel, () => toggleWindow());
  }
}

// 重新注册弹窗快捷键（设置变更时调用）。返回是否注册成功。
function applyPopupShortcut(accel) {
  if (popupAccel) {
    try { globalShortcut.unregister(popupAccel); } catch (e) { /* ignore */ }
  }
  popupAccel = accel;
  if (!accel) return true;
  return globalShortcut.register(accel, () => toggleWindow());
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
    if (item.type === 'text' || item.type === 'code' || item.type === 'link') {
      clipboard.writeText(item.content);
    } else if (item.type === 'rich') {
      clipboard.write({
        text: item.content,
        html: item.html || '',
        rtf: item.rtf || ''
      });
    } else if (item.type === 'image') {
      const img = nativeImage.createFromBuffer(Buffer.from(item.content.base64, 'base64'));
      clipboard.writeImage(img);
    } else if (item.type === 'file') {
      // Fallback to text list for files; full CF_HDROP support needs extra work
      clipboard.writeText(Array.isArray(item.content) ? item.content.join('\n') : item.content);
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
});

app.on('before-quit', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
});
