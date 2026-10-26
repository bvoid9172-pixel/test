const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  designer: (on) => ipcRenderer.send('designer', on),
  resize: (h, w) => ipcRenderer.send('resize', h, w),
  pin: (on) => ipcRenderer.send('pin', on),
  close: () => ipcRenderer.send('close'),
  setMode: (m) => ipcRenderer.send('mode', m),
  status: (o) => ipcRenderer.send('status', o),
  onStyle: (cb) => ipcRenderer.on('set-style', (_e, m) => cb(m)),
  sync: (url) => ipcRenderer.send('sync', url),
  onSync: (cb) => ipcRenderer.on('sync-status', (_e, r) => cb(r)),
  exportWidget: (json, poke) => ipcRenderer.invoke('widget-export', json, poke),
  notify: (n) => ipcRenderer.send('notify', n),
  openPortal: () => ipcRenderer.send('open-portal'),
  onImport: (cb) => ipcRenderer.on('import-entries', (_e, entries) => cb(entries)),
});
