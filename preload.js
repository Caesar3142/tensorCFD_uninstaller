const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('uninstaller', {
  start: (confirm = false) => ipcRenderer.invoke('start-uninstall', { confirm }),
  onLog: (cb) => ipcRenderer.on('log', (_e, line) => cb(line)),
  onStep: (cb) => ipcRenderer.on('step', (_e, payload) => cb(payload))
});
