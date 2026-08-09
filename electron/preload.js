const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Version and Updater
  checkZapretVersion: () => ipcRenderer.invoke('zapret:check-version'),
  downloadZapret: () => ipcRenderer.invoke('zapret:download'),
  
  // Strategies
  getStrategies: () => ipcRenderer.invoke('zapret:get-strategies'),
  startStrategy: (strategyName) => ipcRenderer.invoke('zapret:start-strategy', strategyName),
  stopStrategy: () => ipcRenderer.invoke('zapret:stop-strategy'),
  getStatus: () => ipcRenderer.invoke('zapret:get-status'),
  testStrategy: (strategyName) => ipcRenderer.invoke('zapret:test-strategy', strategyName),
  
  // Lists
  getListContent: (listName) => ipcRenderer.invoke('zapret:get-list', listName),
  saveListContent: (listName, content) => ipcRenderer.invoke('zapret:save-list', listName, content),
  
  // Autostart & Config
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  checkAdminPrivileges: () => ipcRenderer.invoke('system:check-admin'),
  
  // Logs Listener
  onLog: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('zapret:log', subscription);
    return () => {
      ipcRenderer.removeListener('zapret:log', subscription);
    };
  },
  
  // Settings Update Listener
  onSettingsUpdated: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('settings:updated', subscription);
    return () => {
      ipcRenderer.removeListener('settings:updated', subscription);
    };
  },

  // App Auto-Updater (GitHub Releases)
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  checkAppUpdate: () => ipcRenderer.invoke('app:check-update'),
  downloadAppUpdate: () => ipcRenderer.send('app:download-update'),
  installAppUpdate: () => ipcRenderer.send('app:install-update'),
  onAppUpdateAvailable: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('app-update:available', subscription);
    return () => ipcRenderer.removeListener('app-update:available', subscription);
  },
  onAppUpdateProgress: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('app-update:progress', subscription);
    return () => ipcRenderer.removeListener('app-update:progress', subscription);
  },
  onAppUpdateDownloaded: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('app-update:downloaded', subscription);
    return () => ipcRenderer.removeListener('app-update:downloaded', subscription);
  },
  onAppUpdateError: (callback) => {
    const subscription = (event, value) => callback(value);
    ipcRenderer.on('app-update:error', subscription);
    return () => ipcRenderer.removeListener('app-update:error', subscription);
  }
});
