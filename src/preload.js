const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wcopyAPI', {
  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),
  toggleFavorite: (id) => ipcRenderer.invoke('toggle-favorite', id),
  togglePin: (id) => ipcRenderer.invoke('toggle-pin', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  writeItem: (id) => ipcRenderer.invoke('write-item', id),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('set-settings', patch),
  capturePopupShortcut: (active) => ipcRenderer.invoke('popup-shortcut-capture', active),

  // Window
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // Events
  onHistoryUpdated: (callback) => {
    const listener = (event, history) => callback(history);
    ipcRenderer.on('history-updated', listener);
    return () => ipcRenderer.removeListener('history-updated', listener);
  },
  platform: process.platform
});
