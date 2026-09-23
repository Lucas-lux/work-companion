'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('companion', {
  init: () => ipcRenderer.invoke('companion:init'),
  on: (channel, cb) => ipcRenderer.on('c:' + channel, (_e, data) => cb(data)),
  setIgnore: (ignore) => ipcRenderer.send('companion:ignore', ignore),
  pet: () => ipcRenderer.send('companion:pet'),
  menu: () => ipcRenderer.send('companion:menu'),
  openDashboard: () => ipcRenderer.send('companion:dashboard'),
});
