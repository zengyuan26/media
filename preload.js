// preload.js — expose safe bridge from Electron main to renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  parseLink: (url) => ipcRenderer.invoke('parse-link', url),
  callZhiling: (key, url) => ipcRenderer.invoke('call-zhiling', { key, url }),
  platform: process.platform,
});
