const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bridge', { dismiss: () => ipcRenderer.send('banner-dismiss') });
