const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ClipboardStore {
  constructor(userDataPath, options = {}) {
    this.dataDir = userDataPath;
    this.historyPath = path.join(this.dataDir, 'history.json');
    this.maxItems = options.maxItems || 200;
    this.history = [];
    this.ensureDir();
    this.load();
  }

  ensureDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(this.historyPath)) {
        const raw = fs.readFileSync(this.historyPath, 'utf8');
        this.history = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      this.history = [];
    }
  }

  save() {
    try {
      this.ensureDir();
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2));
    } catch (err) {
      console.error('Failed to save history:', err);
    }
  }

  hash(content) {
    return crypto.createHash('sha256').update(String(content)).digest('hex').slice(0, 16);
  }

  add(item) {
    // 去重：如果最后一条内容相同，更新时间而不是新增
    const last = this.history[0];
    if (last && last.hash === item.hash) {
      last.time = item.time;
      this.save();
      return last;
    }

    // 限制数量，保留收藏/置顶
    if (this.history.length >= this.maxItems) {
      const removable = this.history.filter(i => !i.favorite && !i.pinned);
      if (removable.length > 0) {
        const oldest = removable[removable.length - 1];
        this.history = this.history.filter(i => i.id !== oldest.id);
      }
    }

    this.history.unshift(item);
    this.save();
    return item;
  }

  getAll() {
    return [...this.history];
  }

  delete(id) {
    this.history = this.history.filter(i => i.id !== id);
    this.save();
  }

  toggleFavorite(id) {
    const item = this.history.find(i => i.id === id);
    if (item) {
      item.favorite = !item.favorite;
      this.save();
    }
    return item;
  }

  togglePin(id) {
    const item = this.history.find(i => i.id === id);
    if (item) {
      item.pinned = !item.pinned;
      this.save();
    }
    return item;
  }

  clear() {
    this.history = this.history.filter(i => i.favorite || i.pinned);
    this.save();
  }

  enforceMaxItems() {
    // 设置保留条数后，立即裁剪超出部分（仅删除未收藏且未置顶的最旧记录）
    while (this.history.length > this.maxItems) {
      const removable = this.history.filter(i => !i.favorite && !i.pinned);
      if (removable.length === 0) break; // 剩余全是收藏/置顶，无法再删
      const oldest = removable[removable.length - 1];
      this.history = this.history.filter(i => i.id !== oldest.id);
    }
    this.save();
  }
}

module.exports = { ClipboardStore };
