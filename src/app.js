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
const filterTabs = document.getElementById('filterTabs');
const resultCount = document.getElementById('resultCount');
const emptyState = document.getElementById('emptyState');
const statusText = document.getElementById('statusText');
const themeToggle = document.getElementById('themeToggle');
const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');

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
            <path d="M12 2v12M5 12l7 7 7-7"/>
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
    cardGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    resultCount.textContent = `${items.length} 条记录`;
    items.forEach((item, index) => {
      cardGrid.appendChild(createCard(item, index));
    });
  }
}

function selectCard(index) {
  activeIndex = index;
  document.querySelectorAll('.card').forEach((c, i) => {
    c.classList.toggle('active', i === index);
  });
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

async function copyItem(item) {
  if (isElectron && window.wcopyAPI.writeItem) {
    await window.wcopyAPI.writeItem(item.id);
  } else {
    const text = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
    navigator.clipboard.writeText(text);
  }
  const label = typeof item.content === 'string' ? item.content : (item.type === 'image' ? '[图片]' : '[文件]');
  statusText.textContent = `已复制：${label.slice(0, 30)}${label.length > 30 ? '...' : ''}`;
  setTimeout(() => statusText.textContent = '就绪', 2000);
  if (isElectron && window.wcopyAPI.closeWindow) {
    setTimeout(() => window.wcopyAPI.closeWindow(), 200);
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
  setTimeout(() => statusText.textContent = '就绪', 1500);
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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  const items = getFilteredItems();

  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
  }

  if (e.key === 'Escape') {
    if (document.activeElement === searchInput) {
      searchInput.blur();
      searchInput.value = '';
      searchQuery = '';
      render();
    } else if (window.wcopyAPI && window.wcopyAPI.closeWindow) {
      window.wcopyAPI.closeWindow();
    }
  }

  if (items.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % items.length;
    selectCard(activeIndex);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + items.length) % items.length;
    selectCard(activeIndex);
  } else if (e.key === 'Enter' && activeIndex >= 0) {
    e.preventDefault();
    copyItem(items[activeIndex]);
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'd' && activeIndex >= 0) {
    e.preventDefault();
    deleteItem(items[activeIndex].id);
  }
});

// Drag region for frameless window
document.querySelectorAll('.titlebar, .toolbar, .list-header, .statusbar').forEach(el => {
  el.style.webkitAppRegion = 'drag';
});

document.querySelectorAll('.titlebar button, .search-box, .filter-tabs, .view-options, .card, .card-actions, .action-btn').forEach(el => {
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
loadHistory().then(render);
