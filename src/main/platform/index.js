'use strict';

class NullPlatform {
  async start() {}
  async getActive() { return null; }
  async closeTab() {}
  async closeApp() {}
  quitApps() {}
  setDnd() {}
  openNotificationSettings() {}
  stop() {}
}

function createPlatform(dataDir, getSettings) {
  if (process.platform === 'win32') return new (require('./win'))(dataDir, getSettings);
  if (process.platform === 'darwin') return new (require('./mac'))(dataDir, getSettings);
  return new NullPlatform();
}

module.exports = { createPlatform };
