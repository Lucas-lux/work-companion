'use strict';

const { execFile } = require('child_process');

const CHROMIUM_IDS = [
  'com.google.Chrome', 'com.google.Chrome.beta', 'com.google.Chrome.canary', 'org.chromium.Chromium',
  'com.microsoft.edgemac', 'com.brave.Browser', 'com.vivaldi.Vivaldi', 'com.operasoftware.Opera',
  'company.thebrowser.Browser',
];
const SAFARI_IDS = ['com.apple.Safari', 'com.apple.SafariTechnologyPreview'];

// JXA : app au premier plan + titre de fenêtre + URL de l'onglet actif (Chrome/Safari & co)
const JXA_ACTIVE = `(() => {
  const se = Application('System Events');
  const procs = se.applicationProcesses.whose({ frontmost: true });
  if (!procs.length) return '{}';
  const p = procs[0];
  const out = { app: p.name(), pid: p.unixId(), bundleId: '', title: '', url: '' };
  try { out.bundleId = p.bundleIdentifier(); } catch (e) {}
  try {
    const w = p.windows[0];
    out.title = w.name() || '';
    const pos = w.position(), size = w.size();
    out.bounds = { x: pos[0], y: pos[1], width: size[0], height: size[1] };
  } catch (e) {}
  const chromium = ${JSON.stringify(CHROMIUM_IDS)};
  const safari = ${JSON.stringify(SAFARI_IDS)};
  try {
    if (chromium.indexOf(out.bundleId) >= 0) {
      const t = Application(out.bundleId).windows[0].activeTab;
      out.url = t.url(); out.tabTitle = t.title();
    } else if (safari.indexOf(out.bundleId) >= 0) {
      const t = Application(out.bundleId).windows[0].currentTab;
      out.url = t.url(); out.tabTitle = t.name();
    }
  } catch (e) {}
  return JSON.stringify(out);
})()`;

function osa(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 5000 }, (err, stdout) => {
      resolve(err ? null : String(stdout).trim());
    });
  });
}

class MacPlatform {
  constructor(dataDir, getSettings) {
    this.getSettings = getSettings;
  }

  async start() {}

  async getActive() {
    const out = await osa(JXA_ACTIVE);
    if (!out) return null;
    try {
      const r = JSON.parse(out);
      if (!r.app) return null;
      return { pid: r.pid, process: r.app, app: r.app, bundleId: r.bundleId, title: r.title || '', url: r.url || '', tabTitle: r.tabTitle || '', bounds: r.bounds || null };
    } catch {
      return null;
    }
  }

  closeTab(win) {
    const id = JSON.stringify(win.bundleId || '');
    if (CHROMIUM_IDS.includes(win.bundleId)) return osa(`Application(${id}).windows[0].activeTab.close()`);
    if (SAFARI_IDS.includes(win.bundleId)) return osa(`Application(${id}).windows[0].currentTab.close()`);
    // Autres navigateurs (Firefox…) : Cmd+W si l'app est toujours au premier plan
    return osa(`(() => {
      const se = Application('System Events');
      const p = se.applicationProcesses.whose({ frontmost: true })[0];
      if (p && p.unixId() === ${Number(win.pid) || 0}) se.keystroke('w', { using: 'command down' });
    })()`);
  }

  closeApp(win) {
    const target = JSON.stringify(win.bundleId || win.app);
    return osa(`Application(${target}).quit()`).then((r) => {
      if (r === null && win.pid) execFile('kill', [String(win.pid)], () => {});
    });
  }

  quitApps(names) {
    // On ne quitte que les apps déjà ouvertes (sinon macOS demanderait "Où est Discord ?")
    const wanted = JSON.stringify(names.map((n) => String(n).toLowerCase()));
    return osa(`(() => {
      const wanted = ${wanted};
      const se = Application('System Events');
      se.applicationProcesses().forEach((p) => {
        const name = p.name();
        if (wanted.indexOf(name.toLowerCase()) >= 0) { try { Application(name).quit(); } catch (e) {} }
      });
    })()`);
  }

  // macOS n'expose pas "Ne pas déranger" : on lance les Raccourcis choisis par l'utilisateur
  setDnd(on) {
    const s = this.getSettings();
    const name = on ? s.macFocusOn : s.macFocusOff;
    if (name) execFile('shortcuts', ['run', name], () => {});
  }

  openNotificationSettings() {
    require('electron').shell.openExternal('x-apple.systempreferences:com.apple.Focus-Settings.extension');
  }

  stop() {}
}

module.exports = MacPlatform;
