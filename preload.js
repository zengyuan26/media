// preload.js — expose safe bridge from Electron main to renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  parseLink: (url) => ipcRenderer.invoke('parse-link', url),
  platform: process.platform,
});
