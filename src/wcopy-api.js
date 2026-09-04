// Tauri bridge: expose the same `window.wcopyAPI` surface the Electron preload provided,
// backed by Tauri's global `invoke` / `event.listen` (withGlobalTauri: true).
// This lets app.js stay unchanged while the backend is Rust/Tauri.
(function () {
  const tauri = window.__TAURI__;
  if (!tauri) {
    console.warn('window.__TAURI__ not found; running in fallback (no backend) mode');
    return;
  }
  const { invoke } = tauri.core;
  const { listen } = tauri.event;

  // history-updated event subscription: forward payload to the latest callback
  let historyCb = null;
  listen('history-updated', (e) => {
    if (historyCb) historyCb(e.payload);
  }).catch((err) => console.error('listen history-updated failed:', err));

  window.wcopyAPI = {
    getHistory: () => invoke('get_history'),
    getSettings: () => invoke('get_settings'),
    getVersion: () => invoke('get_version'),
    setSettings: (patch) => invoke('set_settings', { patch }),
    capturePopupShortcut: (active) => invoke('capture_popup_shortcut', { active }),
    writeItem: (id) => invoke('write_item', { id }),
    pasteItem: (id) => invoke('paste_item', { id }),
    toggleFavorite: (id) => invoke('toggle_favorite', { id }),
    togglePin: (id) => invoke('toggle_pin', { id }),
    deleteItem: (id) => invoke('delete_item', { id }),
    clearHistory: () => invoke('clear_history'),
    minimizeWindow: () => invoke('minimize_window'),
    closeWindow: () => invoke('close_window'),
    onHistoryUpdated: (cb) => {
      historyCb = cb;
    },
  };
})();
