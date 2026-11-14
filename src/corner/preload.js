'use strict';

// Her corner's only ways out: what's in it (her drawings, her diary, her achievements), and a drawing
// shown in its folder.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('corner', {
  data: () => ipcRenderer.invoke('corner:data'),
  reveal: (name) => ipcRenderer.send('corner:reveal', String(name || '')),
  forget: (id) => ipcRenderer.invoke('corner:forget', String(id || '')),
});
