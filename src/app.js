// wcopy renderer entry

const fallbackData = [
  {
    id: 'demo-1',
    type: 'text',
    source: 'Google Chrome',
    appIcon: '🌐',
    time: Date.now() - 7 * 60 * 1000,
    content: '底部菜单点击后，框选的按钮没有覆盖到整个菜单图标和文字上，只覆盖了图标，文字没有包含进去',
    chars: 55,
    favorite: false,
    pinned: false
  },
  {
    id: 'demo-2',
    type: 'code',
    source: '屏幕共享',
    appIcon: '🖥️',
    time: Date.now() - 17 * 60 * 1000,
    content: '{"startDate":"2026-08-08","endDate":"2026-08-08"}',
    chars: 49,
    favorite: false,
    pinned: false
  },
  {
    id: 'demo-3',
    type: 'code',
    source: 'Slack',
    appIcon: '💬',
    time: Date.now() - 17 * 60 * 1000,
    content: '{"startDate":"2026-07-04","endDate":"2026-07-05"}',
    chars: 49,
    favorite: false,
    pinned: false
  },
  {
    id: 'demo-4',
    type: 'code',
    source: 'Google Chrome',
    appIcon: '🌐',
    time: Date.now() - 21 * 60 * 1000,
    content: '{"startDate":"2026-07-04","endDate":"2026-07-05","mode":"all"}',
    chars: 62,
    favorite: false,
    pinned: false
  },
  {
    id: 'demo-5',
    type: 'text',
    source: 'Slack',
    appIcon: '💬',
    time: Date.now() - 22 * 60 * 1000,
    content: 'checkBitcoinBlocks',
    chars: 18,
    favorite: true,
    pinned: false
  },
  {
    id: 'demo-6',
    type: 'code',
    source: 'Slack',
    appIcon: '💬',
    time: Date.now() - 23 * 60 * 1000,
    content: '{"startDate":"2026-07-04","endDate":"2026-07-05","mode":"all"}',
    chars: 62,
    favorite: false,
    pinned: false
  },
  {
    id: 'demo-7',
    type: 'code',
    source: 'Slack',
    appIcon: '💬',
    time: Date.now() - 23 * 60 * 1000,
    content: '{"startDate":"2026-07-04","endDate":"2026-07-05","mode":"all"}',
    chars: 62,
    favorite: false,
    pinned: false
  },
  {
    id: 'demo-8',
    type: 'image',
    source: '截图工具',
    appIcon: '📸',
    time: Date.now() - 35 * 60 * 1000,
    content: { base64: '', width: 1920, height: 1080, size: 0 },
    chars: 0,
    favorite: false,
    pinned: false
  },
  {
    id: 'demo-9',
    type: 'file',
    source: '文件资源管理器',
    appIcon: '📁',
    time: Date.now() - 42 * 60 * 1000,
    content: ['C:\\Users\\xiaoxu\\Desktop\\design.fig', 'C:\\Users\\xiaoxu\\Desktop\\spec.md'],
    chars: 0,
    favorite: false,
    pinned: false
  },
  {
    id: 'demo-10',
    type: 'link',
    source: 'Google Chrome',
    appIcon: '🌐',
    time: Date.now() - 60 * 60 * 1000,
    content: 'https://www.workbuddy.cn/docs/workbuddy/Overview',
    chars: 52,
    favorite: true,
    pinned: false
  }
];

let history = [];
let activeFilter = 'all';
let searchQuery = '';
let activeIndex = -1;
let currentTheme = 'light';
let isElectron = !!(window.wcopyAPI && window.wcopyAPI.getHistory);

const cardGrid = document.getElementById('cardGrid');
const searchInput = document.getElementById('searchInput');
const searchToggle = document.getElementById('searchToggle');
const searchBox = document.getElementById('searchBox');
const filterTabs = document.getElementById('filterTabs');
const resultCount = document.getElementById('resultCount');
const emptyState = document.getElementById('emptyState');
const statusText = document.getElementById('statusText');
const themeToggle = document.getElementById('themeToggle');
const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const setLaunchAtLogin = document.getElementById('setLaunchAtLogin');
const setMaxItems = document.getElementById('setMaxItems');
const setMaxItemsVal = document.getElementById('setMaxItemsVal');
const setTheme = document.getElementById('setTheme');
const setPopupPosition = document.getElementById('setPopupPosition');
const setRetainFav = document.getElementById('setRetainFav');
const clearAllBtn = document.getElementById('clearAllBtn');
const appVersionText = document.getElementById('appVersionText');
const recordShortcutBtn = document.getElementById('recordShortcutBtn');
const popupShortcutText = document.getElementById('popupShortcutText');
const shortcutHint = document.getElementById('shortcutHint');
let isCapturingShortcut = false;
let settings = { launchAtLogin: false, maxItems: 200, theme: 'light', clearRetainsFavorites: true, popupShortcut: 'CommandOrControl+Shift+V' };

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

function getTypeLabel(type) {
  const labels = {
    text: '纯文本',
    rich: '富文本',
    code: '代码',
    image: '图片',
    file: '文件',
    link: '链接'
  };
  return labels[type] || type;
}

function createCard(item, index) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id;
  card.dataset.index = index;
  if (index === activeIndex) card.classList.add('active');

  const isFile = item.type === 'file';
  const isImage = item.type === 'image';
  const isCode = item.type === 'code';

  let previewBody = '';
  if (isFile) {
    const files = Array.isArray(item.content) ? item.content : [item.content];
    previewBody = `
      <div class="card-preview file">
        ${files.map(f => `
          <div class="file-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>${f}</span>
          </div>
        `).join('')}
      </div>
    `;
  } else if (isImage) {
    const meta = item.content || {};
    const src = meta.base64 ? `data:image/png;base64,${meta.base64}` : '';
    previewBody = `
      <div class="card-preview image">
        ${src ? `<img src="${src}" style="max-width:100%;max-height:140px;border-radius:6px;object-fit:contain;" alt="截图">` : `
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>`}
      </div>
    `;
  } else if (isCode) {
    previewBody = `<div class="card-preview code">${escapeHtml(item.content)}</div>`;
  } else {
    previewBody = `<div class="card-preview">${escapeHtml(item.content)}</div>`;
  }

  const sizeText = isFile
    ? `${Array.isArray(item.content) ? item.content.length : 1} 个文件`
    : isImage
    ? `${item.content.width || 0}×${item.content.height || 0}`
    : `${item.chars || item.content?.length || 0} 个字符`;

  card.innerHTML = `
    <div class="card-header">
      <span class="type-tag ${item.type}">${getTypeLabel(item.type)}</span>
      <div class="card-meta">
        <span class="app-icon">${item.appIcon || '📋'}</span>
        <span>${item.source || '未知应用'}</span>
        <span>${formatRelativeTime(item.time)}</span>
      </div>
    </div>
    <div class="card-body">${previewBody}</div>
    <div class="card-footer">
      <span class="card-size">${sizeText}</span>
      <div class="card-actions">
        <button class="action-btn pin ${item.pinned ? 'pinned' : ''}" title="置顶">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22V10M5 10l7-7 7 7"/>
          </svg>
        </button>
        <button class="action-btn favorite ${item.favorite ? 'favorited' : ''}" title="收藏">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
        <button class="action-btn copy" title="复制">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="action-btn delete" title="删除">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.action-btn')) return;
    selectCard(index);
    copyItem(item);
  });

  card.addEventListener('dblclick', (e) => {
    if (e.target.closest('.action-btn')) return;
    e.preventDefault();
    pasteItem(item);
  });

  const copyBtn = card.querySelector('.action-btn.copy');
  const favoriteBtn = card.querySelector('.action-btn.favorite');
  const pinBtn = card.querySelector('.action-btn.pin');
  const deleteBtn = card.querySelector('.action-btn.delete');

  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyItem(item);
  });

  favoriteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(item.id);
  });

  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePin(item.id);
  });

  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteItem(item.id);
  });

  card.style.animationDelay = `${index * 0.03}s`;
  return card;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.time - a.time;
  });
}

function getFilteredItems() {
  let items = [...history];

  if (activeFilter !== 'all') {
    if (activeFilter === 'favorite') {
      items = items.filter(i => i.favorite);
    } else {
      items = items.filter(i => i.type === activeFilter);
    }
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i => {
      const text = typeof i.content === 'string' ? i.content : JSON.stringify(i.content);
      return text.toLowerCase().includes(q) || (i.source || '').toLowerCase().includes(q);
    });
  }

  return sortItems(items);
}

function render() {
  const items = getFilteredItems();
  cardGrid.innerHTML = '';

  if (items.length === 0) {
    cardGrid.style.display = 'none';
    emptyState.style.display = 'flex';
    resultCount.textContent = '0 条记录';
  } else {
    cardGrid.style.display = 'flex';
    emptyState.style.display = 'none';
    resultCount.textContent = `${items.length} 条记录`;
    items.forEach((item, index) => {
      cardGrid.appendChild(createCard(item, index));
    });
  }
}

function selectCard(index) {
  activeIndex = index;
  const cards = document.querySelectorAll('.card');
  cards.forEach((c, i) => {
    c.classList.toggle('active', i === index);
  });
  const active = cards[index];
  if (active) {
    active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

async function loadHistory() {
  if (isElectron && window.wcopyAPI.getHistory) {
    try {
      history = await window.wcopyAPI.getHistory();
      render();
    } catch (err) {
      console.error('Failed to load history:', err);
      statusText.textContent = '加载历史失败';
    }
  } else {
    history = [...fallbackData];
    statusText.textContent = '浏览器预览模式：使用模拟数据';
  }
}

function displayAccel(accel) {
  return (accel || '').replace('CommandOrControl', 'Ctrl');
}

async function loadSettings() {
  if (isElectron && window.wcopyAPI.getSettings) {
    try {
      const s = await window.wcopyAPI.getSettings();
      settings = { ...settings, ...s };
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }
  applySettingsToUI();
}

// 根据贴边位置设置布局方向：左右=竖列，上下=横行
function applyDockLayout() {
  const pos = settings.popupPosition || 'right';
  document.documentElement.dataset.dock = pos;
}

function applySettingsToUI() {
  if (setLaunchAtLogin) setLaunchAtLogin.checked = !!settings.launchAtLogin;
  if (setMaxItems) {
    setMaxItems.value = settings.maxItems || 200;
    setMaxItemsVal.textContent = settings.maxItems || 200;
  }
  if (setTheme) setTheme.value = settings.theme === 'dark' ? 'dark' : 'light';
  if (setPopupPosition) setPopupPosition.value = settings.popupPosition || 'right';
  applyDockLayout();
  if (setRetainFav) setRetainFav.checked = settings.clearRetainsFavorites !== false;
  if (popupShortcutText) popupShortcutText.textContent = displayAccel(settings.popupShortcut || 'CommandOrControl+Shift+V');
  if (shortcutHint) shortcutHint.textContent = `${displayAccel(settings.popupShortcut || 'CommandOrControl+Shift+V')} 唤起 · 双击粘贴`;
  if (appVersionText && isElectron && window.wcopyAPI.getVersion) {
    window.wcopyAPI.getVersion().then(v => { appVersionText.textContent = 'wcopy ' + v; }).catch(() => {});
  }
}

async function saveSettings(patch) {
  if (isElectron && window.wcopyAPI.setSettings) {
    try {
      const updated = await window.wcopyAPI.setSettings(patch);
      settings = { ...settings, ...updated };
      if (patch.popupShortcut && updated.popupShortcut !== patch.popupShortcut) {
        if (popupShortcutText) popupShortcutText.textContent = displayAccel(updated.popupShortcut);
        statusText.textContent = '该快捷键无效或已被占用，已还原';
        setTimeout(() => statusText.textContent = '', 2500);
      }
      return updated;
    } catch (err) {
      console.error('saveSettings error:', err);
    }
  }
  settings = { ...settings, ...patch };
  return settings;
}

function startShortcutCapture() {
  if (isCapturingShortcut) return;
  isCapturingShortcut = true;
  if (recordShortcutBtn) {
    recordShortcutBtn.textContent = '按下快捷键…';
    recordShortcutBtn.classList.add('recording');
  }
  if (isElectron && window.wcopyAPI.capturePopupShortcut) {
    window.wcopyAPI.capturePopupShortcut(true);
  }
  window.addEventListener('keydown', onShortcutCaptureKey, true);
}

function onShortcutCaptureKey(e) {
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    finishShortcutCapture(false);
    return;
  }

  const modifiers = [];
  if (e.ctrlKey) modifiers.push('Ctrl');
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey) modifiers.push('Shift');
  if (e.metaKey) modifiers.push('CommandOrControl');

  let key = '';
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F[0-9]{1,2}$/.test(e.code)) key = e.code;
  else {
    const map = {
      Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
      Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab', Insert: 'Insert',
      Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown'
    };
    if (map[e.code]) key = map[e.code];
    else if (e.key && e.key.length === 1) key = e.key.toUpperCase();
  }

  if (modifiers.length === 0) {
    statusText.textContent = '请同时按住 Ctrl / Alt / Shift';
    setTimeout(() => statusText.textContent = '', 2000);
    finishShortcutCapture(false);
    return;
  }
  if (!key) return; // 仅按下修饰键，继续等待主按键

  finishShortcutCapture(true, modifiers.join('+') + '+' + key);
}

async function finishShortcutCapture(commit, accel) {
  window.removeEventListener('keydown', onShortcutCaptureKey, true);
  isCapturingShortcut = false;
  if (recordShortcutBtn) {
    recordShortcutBtn.textContent = '录制';
    recordShortcutBtn.classList.remove('recording');
  }
  if (isElectron && window.wcopyAPI.capturePopupShortcut) {
    window.wcopyAPI.capturePopupShortcut(false);
  }
  if (commit && accel) {
    const updated = await saveSettings({ popupShortcut: accel });
    const shown = displayAccel(updated.popupShortcut || accel);
    if (popupShortcutText) popupShortcutText.textContent = shown;
    if (shortcutHint) shortcutHint.textContent = `${shown} 唤起 · 双击粘贴`;
    statusText.textContent = `弹窗快捷键已设为 ${shown}`;
    setTimeout(() => statusText.textContent = '', 2000);
  }
}

async function copyItem(item) {
  if (isElectron && window.wcopyAPI.writeItem) {
    await window.wcopyAPI.writeItem(item.id);
  } else {
    const text = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
    navigator.clipboard.writeText(text);
  }
  const label = typeof item.content === 'string' ? item.content : (item.type === 'image' ? '[图片]' : '[文件]');
  const preserved = item.type !== 'image' && item.type !== 'file' && (item.html || item.rtf);
  statusText.textContent = preserved
    ? `已复制（保留格式）：${label.slice(0, 22)}${label.length > 22 ? '...' : ''}`
    : `已复制：${label.slice(0, 30)}${label.length > 30 ? '...' : ''}`;
  setTimeout(() => statusText.textContent = '', 2000);
  // 单复制不关闭弹窗，只有粘贴或手工关闭才关
}

// 复制并粘贴：写入剪贴板后向当前应用发送 Ctrl+V（主进程处理粘贴）
async function pasteItem(item) {
  if (isElectron && window.wcopyAPI.pasteItem) {
    await window.wcopyAPI.pasteItem(item.id);
  } else {
    await copyItem(item);
  }
}

async function toggleFavorite(id) {
  if (isElectron && window.wcopyAPI.toggleFavorite) {
    await window.wcopyAPI.toggleFavorite(id);
    const updated = await window.wcopyAPI.getHistory();
    history = updated;
    render();
  } else {
    const item = history.find(i => i.id === id);
    if (item) { item.favorite = !item.favorite; render(); }
  }
}

async function togglePin(id) {
  if (isElectron && window.wcopyAPI.togglePin) {
    await window.wcopyAPI.togglePin(id);
    const updated = await window.wcopyAPI.getHistory();
    history = updated;
    render();
  } else {
    const item = history.find(i => i.id === id);
    if (item) { item.pinned = !item.pinned; render(); }
  }
}

async function deleteItem(id) {
  if (isElectron && window.wcopyAPI.deleteItem) {
    await window.wcopyAPI.deleteItem(id);
    const updated = await window.wcopyAPI.getHistory();
    history = updated;
  } else {
    history = history.filter(i => i.id !== id);
  }
  activeIndex = -1;
  render();
  statusText.textContent = '已删除';
  setTimeout(() => statusText.textContent = '', 1500);
}

function setFilter(type) {
  activeFilter = type;
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  activeIndex = -1;
  render();
}

function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('wcopy-theme', currentTheme);
}

function initTheme() {
  const saved = localStorage.getItem('wcopy-theme');
  if (saved) {
    currentTheme = saved;
    document.documentElement.setAttribute('data-theme', currentTheme);
  }
}

// Event listeners
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  activeIndex = -1;
  render();
});

// 搜索框默认折叠为按钮，点击或 Ctrl+K 展开
function expandSearch() {
  if (searchBox) searchBox.classList.add('expanded');
}
function collapseSearch() {
  if (searchBox) searchBox.classList.remove('expanded');
}
if (searchToggle && searchBox) {
  searchToggle.addEventListener('click', () => {
    const willExpand = !searchBox.classList.contains('expanded');
    searchBox.classList.toggle('expanded');
    if (willExpand && searchInput) searchInput.focus();
  });
}

filterTabs.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab')) {
    setFilter(e.target.dataset.type);
  }
});

themeToggle.addEventListener('click', toggleTheme);

minimizeBtn.addEventListener('click', () => {
  if (window.wcopyAPI && window.wcopyAPI.minimizeWindow) {
    window.wcopyAPI.minimizeWindow();
  }
});

closeBtn.addEventListener('click', () => {
  if (window.wcopyAPI && window.wcopyAPI.closeWindow) {
    window.wcopyAPI.closeWindow();
  }
});

// Settings panel wiring
if (settingsBtn && settingsOverlay) {
  settingsBtn.addEventListener('click', () => { settingsOverlay.style.display = 'flex'; });
}
if (settingsClose) {
  settingsClose.addEventListener('click', () => { settingsOverlay.style.display = 'none'; });
}
if (settingsOverlay) {
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.style.display = 'none';
  });
}

if (setLaunchAtLogin) {
  setLaunchAtLogin.addEventListener('change', async () => {
    await saveSettings({ launchAtLogin: setLaunchAtLogin.checked });
  });
}

if (setMaxItems) {
  setMaxItems.addEventListener('input', () => {
    setMaxItemsVal.textContent = setMaxItems.value;
  });
  setMaxItems.addEventListener('change', async () => {
    await saveSettings({ maxItems: parseInt(setMaxItems.value, 10) });
  });
}

if (setTheme) {
  setTheme.addEventListener('change', async () => {
    await saveSettings({ theme: setTheme.value });
    currentTheme = setTheme.value === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('wcopy-theme', currentTheme);
  });
}

if (setRetainFav) {
  setRetainFav.addEventListener('change', async () => {
    await saveSettings({ clearRetainsFavorites: setRetainFav.checked });
  });
}

if (setPopupPosition) {
  setPopupPosition.addEventListener('change', async () => {
    await saveSettings({ popupPosition: setPopupPosition.value });
    applyDockLayout();
  });
}

if (clearAllBtn) {
  clearAllBtn.addEventListener('click', async () => {
    if (isElectron && window.wcopyAPI.clearHistory) {
      await window.wcopyAPI.clearHistory();
      history = [];
      render();
      statusText.textContent = '已清除全部历史';
      setTimeout(() => statusText.textContent = '', 1500);
    }
  });
}

if (recordShortcutBtn) {
  recordShortcutBtn.addEventListener('click', startShortcutCapture);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  const items = getFilteredItems();

  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    expandSearch();
    if (searchInput) searchInput.focus();
  }

  if (e.key === 'Escape') {
    if (document.activeElement === searchInput) {
      searchInput.blur();
      searchInput.value = '';
      searchQuery = '';
      render();
      collapseSearch();
    } else if (window.wcopyAPI && window.wcopyAPI.closeWindow) {
      window.wcopyAPI.closeWindow();
    }
  }

  if (items.length === 0) return;

  // 横向贴边（上下）用左右键，竖向贴边（左右）用上下键
  const isRow = document.documentElement.dataset.dock === 'top' || document.documentElement.dataset.dock === 'bottom';

  if ((e.key === 'ArrowDown' && !isRow) || (e.key === 'ArrowRight' && isRow)) {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % items.length;
    selectCard(activeIndex);
  } else if ((e.key === 'ArrowUp' && !isRow) || (e.key === 'ArrowLeft' && isRow)) {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + items.length) % items.length;
    selectCard(activeIndex);
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'd' && activeIndex >= 0) {
    e.preventDefault();
    deleteItem(items[activeIndex].id);
  }
});

// 鼠标滚轮滚动：条目跟随鼠标滚轮沿布局方向卷动
// - 上下贴边（横行胶片条）：普通鼠标竖向滚轮映射为左右滚动，触控板横向 deltaX 也支持
// - 左右贴边（竖列）：沿用原生竖向滚动；按住 Shift 时也可横向滚动
cardGrid.addEventListener('wheel', (e) => {
  const isRow = document.documentElement.dataset.dock === 'top' || document.documentElement.dataset.dock === 'bottom';
  if (isRow) {
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (delta !== 0) {
      e.preventDefault();
      cardGrid.scrollLeft += delta;
    }
  } else if (e.shiftKey && e.deltaY !== 0) {
    e.preventDefault();
    cardGrid.scrollLeft += e.deltaY;
  }
}, { passive: false });

// Drag region for frameless window
document.querySelectorAll('.titlebar, .toolbar, .list-header, .statusbar').forEach(el => {
  el.style.webkitAppRegion = 'drag';
});

document.querySelectorAll('.titlebar button, .search-toggle, .search-box, .filter-tabs, .view-options, .card, .card-actions, .action-btn').forEach(el => {
  el.style.webkitAppRegion = 'no-drag';
});

// Subscribe to real-time updates from main process
if (isElectron && window.wcopyAPI.onHistoryUpdated) {
  window.wcopyAPI.onHistoryUpdated((updated) => {
    history = updated;
    render();
  });
}

// Init
initTheme();
loadSettings();
loadHistory().then(render);
