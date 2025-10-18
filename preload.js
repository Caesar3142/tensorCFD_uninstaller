// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Installer (unchanged, but supports opts if you already added it)
contextBridge.exposeInMainWorld('installer', {
  start: (opts) => ipcRenderer.invoke('start-install', opts),
  onLog: (cb) => ipcRenderer.on('log', (_e, line) => cb(line)),
  onStep: (cb) => ipcRenderer.on('step', (_e, payload) => cb(payload)),
});

// Uninstaller: ✅ forward options so selections reach main.js
contextBridge.exposeInMainWorld('uninstaller', {
  /**
   * Preferred usage:
   *   window.uninstaller.start({ confirm: false, selections: { wsl:false, paraview:true, ... } })
   * Back-compat:
   *   window.uninstaller.start(false) // still works, but ignores selections
   */
  start: (opts) => ipcRenderer.invoke('start-uninstall', opts),

  onLog: (cb) => ipcRenderer.on('log', (_e, line) => cb(line)),
  onStep: (cb) => ipcRenderer.on('step', (_e, payload) => cb(payload)),
});
