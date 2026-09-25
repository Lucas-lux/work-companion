'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, ...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('wc', {
  get: () => invoke('dash:get'),
  history: (days) => invoke('dash:history', days),
  saveSettings: (patch) => invoke('dash:saveSettings', patch),
  saveRules: (rules) => invoke('dash:saveRules', rules),
  reclassify: (key, cat) => invoke('dash:reclassify', key, cat),
  focusStart: (minutes) => invoke('dash:focusStart', minutes),
  focusStop: () => invoke('dash:focusStop'),
  snooze: (minutes) => invoke('dash:snooze', minutes),
  openExtension: () => invoke('dash:openExtension'),
  openNotifSettings: () => invoke('dash:openNotifSettings'),
  loginItem: () => invoke('dash:loginItem'),
  fixLoginItem: () => invoke('dash:fixLoginItem'),
  openStartupSettings: () => invoke('dash:openStartupSettings'),
  onSettings: (cb) => ipcRenderer.on('d:settings', (_e, data) => cb(data)),
  openSprites: () => invoke('dash:openSprites'),
  reloadSprites: () => invoke('dash:reloadSprites'),
  toggleCompanion: (visible) => invoke('dash:toggleCompanion', visible),
  onState: (cb) => ipcRenderer.on('d:state', (_e, state) => cb(state)),
});
