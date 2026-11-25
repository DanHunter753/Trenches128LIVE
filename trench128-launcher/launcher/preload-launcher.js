'use strict';
// The launcher page's only door to the app: a few named calls (no Node, no raw IPC).
const { contextBridge, ipcRenderer } = require('electron');
const on = ch => cb => { const f = (e, d) => cb(d); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };
contextBridge.exposeInMainWorld('launcher', {
  state: () => ipcRenderer.invoke('t128:state'),
  saveSettings: patch => ipcRenderer.invoke('t128:settings', patch),
  servers: () => ipcRenderer.invoke('t128:servers'),
  probe: url => ipcRenderer.invoke('t128:probe', String(url)),
  news: () => ipcRenderer.invoke('t128:news'),
  play: url => ipcRenderer.invoke('t128:play', String(url)),
  favourite: (url, on) => ipcRenderer.invoke('t128:favourite', String(url), !!on),
  checkUpdate: () => ipcRenderer.invoke('t128:update-check'),
  installUpdate: () => ipcRenderer.invoke('t128:update-install'),
  open: url => ipcRenderer.invoke('t128:open', String(url)),
  showLogs: () => ipcRenderer.invoke('t128:logs'),
  onUpdate: on('t128:update'), onGame: on('t128:game'), onError: on('t128:error'),
});
