const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data: any) => ipcRenderer.invoke('save-settings', data),
  scanDeltas: (profileId: string) => ipcRenderer.invoke('scan-deltas', profileId),
  performSync: (action: string, profileId: string, folderName: string) => ipcRenderer.invoke('perform-sync', action, profileId, folderName),
});
