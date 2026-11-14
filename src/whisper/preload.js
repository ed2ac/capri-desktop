'use strict';

// The offline voice window's only ways in and out: a recording to transcribe, its text back.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ears', {
  onJob: (fn) => ipcRenderer.on('whisper:job', (_e, job) => fn(job)),
  done: (id, result) => ipcRenderer.send('whisper:done', { id: String(id), ...result }),
  ready: (info) => ipcRenderer.send('whisper:ready', info),
});
