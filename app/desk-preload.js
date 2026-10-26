const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('deskApi', {
  onState: (cb) => ipcRenderer.on('desk-state', (_e, s) => cb(s)),
  menu: () => ipcRenderer.send('desk-menu'),
});
