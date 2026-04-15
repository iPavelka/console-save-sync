const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data: any) => ipcRenderer.invoke('save-settings', data),
  scanDeltas: (profileId: string) => ipcRenderer.invoke('scan-deltas', profileId),
  performSync: (action: string, profileId: string, folderName: string) => ipcRenderer.invoke('perform-sync', action, profileId, folderName),
  getPS3Profiles: () => ipcRenderer.invoke('get-ps3-profiles'),
  getPS2Inventory: () => ipcRenderer.invoke('get-ps2-inventory'),
  performVMCSync: (action: string, fileName: string) => ipcRenderer.invoke('perform-vmc-sync', action, fileName),
  decomposeVMCtoPSV: (vmcFileName: string, gameSerial: string, folderName: string) => ipcRenderer.invoke('decompose-vmc-to-psv', vmcFileName, gameSerial, folderName),
  decomposeVMCtoPSU: (vmcFileName: string, gameSerial: string, folderName: string) => ipcRenderer.invoke('decompose-vmc-to-psu', vmcFileName, gameSerial, folderName),
  pingConsole: (ip: string) => ipcRenderer.invoke('ping-console', ip),
});
