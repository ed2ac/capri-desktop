'use strict';

// Her settings window's only ways in and out: her menu's items (to draw), a click on one.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  onTree: (fn) => ipcRenderer.on('settings:tree', (_e, t) => fn(t)),
  click: (id) => ipcRenderer.send('settings:click', String(id)),
});
