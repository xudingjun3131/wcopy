const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  launchAtLogin: false,
  maxItems: 200,
  theme: 'light',
  clearRetainsFavorites: true,
  popupPosition: 'right',
  popupShortcut: 'CommandOrControl+Shift+V'
};

class SettingsStore {
  constructor(userDataPath) {
    this.path = path.join(userDataPath, 'settings.json');
    this.data = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.path)) {
        const raw = JSON.parse(fs.readFileSync(this.path, 'utf8'));
        this.data = { ...DEFAULTS, ...raw };
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
      this.data = { ...DEFAULTS };
    }
  }

  save() {
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }

  get() {
    return { ...this.data };
  }

  set(patch) {
    this.data = { ...this.data, ...patch };
    this.save();
    return this.get();
  }
}

module.exports = { SettingsStore };
