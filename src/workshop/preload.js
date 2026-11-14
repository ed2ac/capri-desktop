'use strict';

// Her coding workshop's only ways out: what Claude is doing (read), its questions (answered), a task
// typed here (handed to her), a folder picked or shown, the task cancelled, the plan's use refreshed.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('work', {
  state: () => ipcRenderer.invoke('work:state'),
  onState: (fn) => ipcRenderer.on('work:state', (_e, s) => fn(s)),
  usage: () => ipcRenderer.invoke('work:usage'),
  answer: (id, allow) => ipcRenderer.send('gate:answer', { id: String(id), allow: Boolean(allow), reason: allow ? '' : 'The user denied this step.' }),
  allowAll: () => ipcRenderer.send('work:allowAll'),
  cancel: () => ipcRenderer.send('work:cancel'),
  reveal: (dir) => ipcRenderer.send('work:reveal', String(dir || '')),
  pick: () => ipcRenderer.invoke('work:pick'),
  start: (prompt, folder) => ipcRenderer.send('work:start', { prompt: String(prompt || ''), folder: folder ? String(folder) : null }),
});
