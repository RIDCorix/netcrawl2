const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('netcrawl', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => process.platform,
  getWorkspacePath: () => ipcRenderer.invoke('workspace:path'),
  openWorkspaceFolder: () => ipcRenderer.invoke('workspace:open'),
});
