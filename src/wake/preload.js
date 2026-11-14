'use strict';

// The wake-word window's only way out: "ready", "heard", "error".
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wake', {
  send: (what, data) => ipcRenderer.send('wake:event', { what: String(what), data: data == null ? null : String(data).slice(0, 300) }),
});
