'use strict';
// Runs in the game window (the server's own page). Gives the game a way back to the launcher; nothing else.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('t128Launcher', {
  back: () => ipcRenderer.send('t128:back'),
  fullscreen: () => ipcRenderer.send('t128:fs'),
});
