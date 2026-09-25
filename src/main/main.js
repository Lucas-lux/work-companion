'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, powerMonitor, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('./store');
const Focus = require('./focus');
const Bridge = require('./bridge');
const msg = require('./messages');
const { createPlatform } = require('./platform');
const { classify, isBrowser, browserFamily, splitList, normPattern, normProc } = require('./rules');
const { png } = require('./pixelart');
const { loadSprites } = require('./sprites');

const TICK_MS = 1500;
const COMPANION_HEIGHT = 240;
const REMINDER_EVERY = 50 * 60;
const RENDERER = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload');
// Argument ajouté à la commande de démarrage automatique : permet de savoir qu'on a été lancé à l'ouverture de session
const LOGIN_ARGS = ['--autostart'];

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

let store, platform, bridge, focus, tray;
let sprites = null; // feuilles de sprites pixel art (null = chat SVG)
let companionWin = null;
let dashboardWin = null;
let current = null; // ce que l'utilisateur fait en ce moment
let pending = null; // fermeture en cours (le chat est en route)
let snoozeUntil = 0;
let snoozeTimer = null;
let idle = false;
let idleSince = 0;
let workStreak = 0;
let nextReminder = REMINDER_EVERY;
let dndActive = false;
let busy = false;
let lastTick = Date.now();
let launchedAtLogin = process.argv.includes(LOGIN_ARGS[0]);
let greeted = false; // le chat ne dit bonjour qu'une fois par lancement

app.on('second-instance', () => openDashboard());
app.on('window-all-closed', () => { /* on reste dans la barre des tâches */ });

app.whenReady().then(init);

async function init() {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  if (process.platform === 'win32') app.setAppUserModelId('app.workcompanion');
  if (process.platform === 'darwin') {
    try { launchedAtLogin = launchedAtLogin || !!app.getLoginItemSettings().wasOpenedAtLogin; } catch { /* non disponible */ }
  }

  store = new Store(app.getPath('userData'));
  platform = createPlatform(app.getPath('userData'), () => store.settings);
  await platform.start().catch((e) => console.error('[platform]', e));

  bridge = new Bridge();
  bridge.on('change', pushState);
  bridge.start(store.settings.bridgePort);

  focus = new Focus();
  focus.on('start', onFocusStart);
  focus.on('end', onFocusEnd);

  sprites = loadSprites(spriteDirs(), spriteCacheDir());
  createTray();
  if (store.settings.companionVisible) createCompanion();
  applyLoginItem();

  setInterval(tick, TICK_MS);
  setInterval(() => store.save(), 30000);
  setInterval(refreshTray, 20000);
  screen.on('display-metrics-changed', positionCompanion);
  screen.on('display-added', positionCompanion);
  screen.on('display-removed', positionCompanion);

  if (store.firstRun) openDashboard();
}

app.on('before-quit', () => {
  if (dndActive) platform.setDnd(false);
  if (focus && focus.isFocus()) store.addFocus((Date.now() - focus.state.startedAt) / 1000, false);
  store.save(true);
  platform.stop();
  bridge.stop();
});

// ---------------------------------------------------------------- boucle de surveillance

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const dt = Math.min((now - lastTick) / 1000, 5);
    lastTick = now;

    const idleNow = powerMonitor.getSystemIdleTime() >= store.settings.idleSeconds;
    if (idleNow !== idle) {
      idle = idleNow;
      if (idle) {
        idleSince = now;
        workStreak = 0;
        nextReminder = REMINDER_EVERY;
      }
      sendCompanion('idle', { idle });
      if (!idle && now - idleSince > 10 * 60 * 1000) sendCompanion('say', { text: msg.welcomeBack(), mood: 'happy' });
    }
    if (idle) {
      current = { category: 'idle', label: 'Absent' };
      pushState();
      return;
    }

    const win = await getActiveWindow();
    if (!win) { pushState(); return; }
    if (win.self) { current = { category: 'self', label: 'Work Companion' }; pushState(); return; }

    const res = classify(win, store.settings, store.rules, focus.isFocus());
    current = { category: res.category, label: res.label, key: res.key, app: win.app, url: win.url || '', blocking: !!res.block };
    store.track(res.key, res.label, res.category, dt);

    if (res.category === 'work' && !focus.active) {
      workStreak += dt;
      if (store.settings.breakReminders && workStreak >= nextReminder) {
        sendCompanion('say', { text: msg.breakReminder(Math.round(workStreak / 60)), mood: 'happy', ms: 6000 });
        nextReminder += REMINDER_EVERY;
      }
    }

    if (res.block && store.settings.blockingEnabled && now >= snoozeUntil && !pending) startBlock(win, res);
    pushState();
  } catch (e) {
    console.error('[tick]', e);
  } finally {
    busy = false;
  }
}

async function getActiveWindow() {
  const win = await platform.getActive();
  if (!win) return null;
  const ownPids = new Set(app.getAppMetrics().map((m) => m.pid));
  if (ownPids.has(win.pid)) return { ...win, self: true };
  if (isBrowser(win) && !win.url) {
    // 1. l'extension (si installée) donne l'onglet exact ; 2. sinon on lit la barre d'adresse via l'accessibilité
    const tab = bridge.focusedTab(browserFamily(win));
    if (tab) Object.assign(win, { url: tab.url, tabTitle: tab.title, tabId: tab.tabId, client: tab.client });
    else if (platform.getUrl) win.url = await platform.getUrl(win).catch(() => '');
  }
  return win;
}

// ---------------------------------------------------------------- fermeture des distractions

function startBlock(win, res) {
  const id = Date.now();
  const grace = Math.max(1, Number(store.settings.graceSeconds) || 4);
  pending = { id, win, res };
  sendCompanion('alert', { id, targetX: targetXFor(win), message: msg.alert(res.label), seconds: grace });
  setTimeout(() => executeBlock(id), grace * 1000);
}

async function executeBlock(id) {
  if (!pending || pending.id !== id) return;
  const { res } = pending;
  try {
    const still = await getActiveWindow();
    const res2 = still && !still.self ? classify(still, store.settings, store.rules, focus.isFocus()) : null;
    const same = res2 && res2.block && res2.rule.id === res.rule.id;
    if (!same || Date.now() < snoozeUntil) {
      sendCompanion('relief', { id, message: msg.relief() });
      return;
    }
    sendCompanion('swipe', { id });
    await wait(700);
    if (res2.rule.type === 'site') {
      const viaExtension = still.client != null && still.tabId != null && bridge.closeTab(still.client, still.tabId);
      if (!viaExtension) await platform.closeTab(still);
    } else {
      await platform.closeApp(still);
    }
    store.addBlock();
    setTimeout(() => sendCompanion('say', { text: msg.closed(), mood: 'proud' }), 900);
  } catch (e) {
    console.error('[block]', e);
  } finally {
    if (pending && pending.id === id) pending = null;
    pushState();
  }
}

function targetXFor(win) {
  if (!win.bounds || !companionWin) return null;
  const cb = companionWin.getBounds();
  const x = win.bounds.x + win.bounds.width / 2 - cb.x;
  return Math.max(0, Math.min(cb.width, x));
}

function snooze(minutes) {
  clearTimeout(snoozeTimer);
  if (!minutes) {
    snoozeUntil = 0;
    sendCompanion('say', { text: msg.snoozeEnd(), mood: 'happy' });
  } else {
    snoozeUntil = Date.now() + minutes * 60000;
    if (pending) { sendCompanion('relief', { id: pending.id, message: msg.snooze(minutes) }); pending = null; }
    else sendCompanion('say', { text: msg.snooze(minutes) });
    snoozeTimer = setTimeout(() => { snoozeUntil = 0; sendCompanion('say', { text: msg.snoozeEnd() }); refreshTray(); pushState(); }, minutes * 60000);
  }
  refreshTray();
  pushState();
}

// ---------------------------------------------------------------- focus

function onFocusStart(s) {
  const st = store.settings;
  if (s.kind === 'focus') {
    if (st.dndOnFocus) { platform.setDnd(true); dndActive = true; }
    const apps = splitList(st.quitAppsOnFocus);
    if (apps.length) platform.quitApps(apps);
    sendCompanion('say', { text: msg.focusStart(s.minutes), mood: 'happy' });
  } else {
    sendCompanion('say', { text: msg.breakStart(s.minutes), mood: 'happy' });
  }
  sendCompanion('focus', focus.snapshot());
  refreshTray();
  pushState();
}

function onFocusEnd(e) {
  const st = store.settings;
  if (dndActive) { platform.setDnd(false); dndActive = false; }
  if (e.kind === 'focus') {
    store.addFocus(e.elapsed / 1000, e.completed);
    if (e.completed) {
      notify('Session terminée 🎉', `${e.minutes} minutes de focus. ${st.catName} est fier·e de toi !`);
      sendCompanion('celebrate', { text: msg.focusDone() });
      if (st.autoBreak) setTimeout(() => { if (!focus.active) focus.start(st.breakMinutes, 'break'); }, 2500);
    } else {
      sendCompanion('say', { text: msg.focusStopped() });
    }
  } else if (e.completed) {
    notify('Pause terminée', 'On y retourne ? 🐾');
    sendCompanion('say', { text: msg.breakDone(), mood: 'happy' });
  }
  sendCompanion('focus', focus.snapshot());
  refreshTray();
  pushState();
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
}

// ---------------------------------------------------------------- fenêtres

function createCompanion() {
  if (companionWin) return;
  companionWin = new BrowserWindow({
    ...companionBounds(),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(PRELOAD, 'companion.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  companionWin.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'screen-saver');
  if (process.platform === 'darwin') companionWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  companionWin.setIgnoreMouseEvents(true, { forward: true });
  companionWin.loadFile(path.join(RENDERER, 'companion', 'index.html'));
  companionWin.once('ready-to-show', () => companionWin && companionWin.showInactive());
  companionWin.on('closed', () => { companionWin = null; });
}

function companionBounds() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x, y: wa.y + wa.height - COMPANION_HEIGHT, width: wa.width, height: COMPANION_HEIGHT };
}

function positionCompanion() {
  if (companionWin) companionWin.setBounds(companionBounds());
}

function setCompanionVisible(visible) {
  store.setSettings({ companionVisible: visible });
  if (visible) createCompanion();
  else if (companionWin) companionWin.close();
  refreshTray();
  pushState();
}

function openDashboard() {
  if (dashboardWin) {
    if (dashboardWin.isMinimized()) dashboardWin.restore();
    dashboardWin.show();
    dashboardWin.focus();
    return;
  }
  dashboardWin = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    title: 'Work Companion',
    autoHideMenuBar: true,
    backgroundColor: '#fbf7f2',
    icon: windowIcon(),
    show: false,
    webPreferences: {
      preload: path.join(PRELOAD, 'dashboard.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  dashboardWin.loadFile(path.join(RENDERER, 'dashboard', 'index.html'));
  dashboardWin.once('ready-to-show', () => dashboardWin.show());
  dashboardWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  dashboardWin.on('closed', () => { dashboardWin = null; });
}

function sendCompanion(channel, data) {
  if (!companionWin || companionWin.isDestroyed()) return;
  try { companionWin.webContents.send('c:' + channel, data); } catch { /* fenêtre en cours de rechargement */ }
}

function pushState() {
  if (!store) return;
  const t = store.summary();
  sendCompanion('stats', { work: t.work, distraction: t.distraction, blocks: t.blocks });
  if (dashboardWin && !dashboardWin.isDestroyed()) dashboardWin.webContents.send('d:state', liveState(t));
}

function liveState(today = store.summary()) {
  return {
    today,
    current,
    focus: focus.snapshot(),
    snoozeUntil,
    idle,
    bridge: bridge.status(),
    companionVisible: !!companionWin,
    sprites: sprites ? { dir: sprites.dir, names: sprites.names, frames: Object.fromEntries(sprites.names.map((n) => [n, sprites.animations[n].frames])) } : null,
  };
}

// ---------------------------------------------------------------- sprites

// Les sprites de l'utilisateur (dossier de données) ont priorité sur ceux livrés avec l'app
function spriteDirs() {
  return [userSpriteDir(), path.join(__dirname, '..', '..', 'assets', 'sprites')];
}

function userSpriteDir() {
  return path.join(app.getPath('userData'), 'sprites');
}

// Les planches traitées (détourées, découpées, réduites) sont mises en cache : le traitement prend quelques secondes
function spriteCacheDir() {
  return path.join(app.getPath('userData'), 'sprites-cache');
}

function reloadSprites() {
  sprites = loadSprites(spriteDirs(), spriteCacheDir());
  if (companionWin && !companionWin.isDestroyed()) companionWin.webContents.reload();
  pushState();
  return liveState().sprites;
}

// ---------------------------------------------------------------- barre des tâches

const ICON_DIR = path.join(__dirname, '..', '..', 'assets', 'icon');

// Logo de l'utilisateur (assets/icon, généré par scripts/make-icons.js) ; sinon le maneki-neko pixel art
function trayImage() {
  const tray = path.join(ICON_DIR, 'tray.png');
  if (fs.existsSync(tray)) return nativeImage.createFromPath(tray);
  return nativeImage.createFromBuffer(png(32, store.settings.coat), { scaleFactor: 2 });
}

function windowIcon() {
  const file = path.join(ICON_DIR, 'icon-256.png');
  if (fs.existsSync(file)) return nativeImage.createFromPath(file);
  return nativeImage.createFromBuffer(png(256, store.settings.coat));
}

function createTray() {
  tray = new Tray(trayImage());
  tray.on('click', () => { if (process.platform !== 'darwin') openDashboard(); });
  refreshTray();
}

function fmt(s) {
  const m = Math.round((s || 0) / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

function hhmm(ts) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function buildMenu() {
  const t = store.summary();
  const f = focus.snapshot();
  const snoozed = Date.now() < snoozeUntil;
  return Menu.buildFromTemplate([
    { label: `${store.settings.catName} · Travail ${fmt(t.work)} · Distraction ${fmt(t.distraction)}`, enabled: false },
    { type: 'separator' },
    f.kind
      ? { label: f.kind === 'focus' ? `Arrêter le focus (${Math.ceil(f.remaining / 60000)} min restantes)` : 'Arrêter la pause', click: () => focus.stop() }
      : { label: 'Lancer un focus', submenu: [15, 25, 50, 90].map((m) => ({ label: `${m} minutes`, click: () => focus.start(m, 'focus') })) },
    snoozed
      ? { label: `Réactiver les blocages (en pause jusqu'à ${hhmm(snoozeUntil)})`, click: () => snooze(0) }
      : { label: 'Mettre les blocages en pause', submenu: [5, 15, 30, 60].map((m) => ({ label: `${m} minutes`, click: () => snooze(m) })) },
    { type: 'separator' },
    { label: 'Tableau de bord', click: openDashboard },
    { label: companionWin ? `Cacher ${store.settings.catName}` : `Afficher ${store.settings.catName}`, click: () => setCompanionVisible(!companionWin) },
    {
      label: app.isPackaged ? 'Lancer au démarrage' : 'Lancer au démarrage (version installée uniquement)',
      type: 'checkbox',
      checked: !!store.settings.launchAtLogin,
      enabled: app.isPackaged,
      click: (item) => saveSettings({ launchAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ]);
}

function refreshTray() {
  if (!tray) return;
  const t = store.summary();
  tray.setToolTip(`${store.settings.catName} — Travail ${fmt(t.work)} · Distraction ${fmt(t.distraction)}`);
  tray.setContextMenu(buildMenu());
}

// ---------------------------------------------------------------- démarrage automatique

function loginItemOptions() {
  // Windows : entrée "Run" du registre avec le chemin de l'exe et --autostart ; macOS : élément d'ouverture
  return process.platform === 'win32' ? { path: process.execPath, args: LOGIN_ARGS } : {};
}

// Version de la commande enregistrée : à incrémenter si LOGIN_ARGS change, pour réenregistrer une fois
const LOGIN_ITEM_REV = 2;

// Entrée de démarrage de cette app, ou null. Sous Windows, Electron relit mal les arguments
// de la commande (openAtLogin reste faux), donc on repère l'entrée par le chemin de l'exe.
function currentLoginItem() {
  const s = app.getLoginItemSettings(loginItemOptions());
  if (process.platform !== 'win32') return s.openAtLogin ? { enabled: s.status !== 'requires-approval', status: s.status } : null;
  const exe = process.execPath.toLowerCase();
  return (s.launchItems || []).find((i) => String(i.path).toLowerCase() === exe) || null;
}

// force = true quand l'utilisateur vient de changer le réglage : on écrase alors aussi un blocage
// fait dans le Gestionnaire des tâches. Au lancement, on n'écrit que si l'entrée manque ou date
// d'une ancienne version, et on garde l'état activé/désactivé choisi dans Windows.
function applyLoginItem(force = false) {
  if (!app.isPackaged) return; // en développement, l'exécutable est electron.exe : on n'enregistre rien
  const want = !!store.settings.launchAtLogin;
  try {
    const item = currentLoginItem();
    const upToDate = !!item && store.settings.loginItemRev === LOGIN_ITEM_REV;
    if (!force && (want ? upToDate : !item)) return;
    const enabled = want && (force || !item || item.enabled !== false);
    app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: want, enabled });
    store.setSettings({ loginItemRev: want ? LOGIN_ITEM_REV : 0 });
  } catch (e) {
    console.warn('[login-item]', e.message);
  }
}

// État réel du démarrage automatique, pour l'afficher dans les réglages
function loginItemStatus() {
  const platform = process.platform;
  if (!app.isPackaged) return { state: 'dev', platform };
  if (!store.settings.launchAtLogin) return { state: 'off', platform };
  try {
    const item = currentLoginItem();
    if (!item) return { state: 'missing', platform };
    // Windows : désactivée dans le Gestionnaire des tâches ; macOS 13+ : en attente d'autorisation
    if (item.enabled === false) return { state: 'blocked', platform };
    return { state: 'on', platform };
  } catch {
    return { state: 'unknown', platform };
  }
}

function openStartupSettings() {
  const url = process.platform === 'darwin'
    ? 'x-apple.systempreferences:com.apple.LoginItems-Settings.extension'
    : 'ms-settings:startupapps';
  return shell.openExternal(url);
}

// ---------------------------------------------------------------- IPC

ipcMain.handle('companion:init', () => {
  // Salut une seule fois par lancement (pas à chaque rechargement des sprites)
  const greeting = greeted ? null : (launchedAtLogin ? 'login' : 'start');
  greeted = true;
  return {
    settings: store.settings,
    focus: focus.snapshot(),
    idle,
    stats: store.summary(),
    sprites,
    greeting,
  };
});
ipcMain.on('companion:ignore', (_e, ignore) => {
  if (companionWin) companionWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});
ipcMain.on('companion:pet', () => store.addPet());
ipcMain.on('companion:menu', () => { if (companionWin) buildMenu().popup({ window: companionWin }); });
ipcMain.on('companion:dashboard', () => openDashboard());

ipcMain.handle('dash:get', () => ({
  ...liveState(),
  settings: store.settings,
  rules: store.rules,
  platform: process.platform,
  version: app.getVersion(),
  portrait: sprites ? sprites.portrait : null,
  userSpriteDir: userSpriteDir(),
}));
ipcMain.handle('dash:history', (_e, n) => store.history(Math.max(1, Math.min(90, Number(n) || 7))));
ipcMain.handle('dash:saveSettings', (_e, patch) => saveSettings(patch));
ipcMain.handle('dash:saveRules', (_e, rules) => {
  if (!Array.isArray(rules)) return store.rules;
  store.setRules(rules.map(sanitizeRule).filter(Boolean));
  store.save();
  return store.rules;
});
ipcMain.handle('dash:reclassify', (_e, key, cat) => reclassify(key, cat));
ipcMain.handle('dash:focusStart', (_e, minutes) => focus.start(minutes, 'focus'));
ipcMain.handle('dash:focusStop', () => focus.stop());
ipcMain.handle('dash:snooze', (_e, minutes) => snooze(Number(minutes) || 0));
ipcMain.handle('dash:openExtension', () => {
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'extension') : path.join(__dirname, '..', '..', 'extension');
  return shell.openPath(dir);
});
ipcMain.handle('dash:openNotifSettings', () => platform.openNotificationSettings());
ipcMain.handle('dash:loginItem', () => loginItemStatus());
ipcMain.handle('dash:fixLoginItem', () => { applyLoginItem(true); return loginItemStatus(); });
ipcMain.handle('dash:openStartupSettings', () => openStartupSettings());
ipcMain.handle('dash:openSprites', () => {
  const dir = userSpriteDir();
  fs.mkdirSync(dir, { recursive: true });
  // On y dépose le mode d'emploi pour que l'utilisateur sache quoi mettre
  const guide = path.join(__dirname, '..', '..', 'assets', 'sprites', 'LISEZMOI.md');
  try { fs.copyFileSync(guide, path.join(dir, 'LISEZMOI.md')); } catch { /* guide absent */ }
  return shell.openPath(dir);
});
ipcMain.handle('dash:reloadSprites', () => { const s = reloadSprites(); return { sprites: s, portrait: sprites ? sprites.portrait : null }; });
ipcMain.handle('dash:toggleCompanion', (_e, visible) => setCompanionVisible(!!visible));

const SETTING_TYPES = {
  catName: 'string', coat: 'string', companionVisible: 'bool', wander: 'bool', blockingEnabled: 'bool',
  graceSeconds: 'number', idleSeconds: 'number', dailyGoalMinutes: 'number', focusMinutes: 'number',
  breakMinutes: 'number', autoBreak: 'bool', breakReminders: 'bool', dndOnFocus: 'bool', quitAppsOnFocus: 'list',
  macFocusOn: 'string', macFocusOff: 'string', launchAtLogin: 'bool', bridgePort: 'number',
  productiveApps: 'list', productiveSites: 'list',
};

function saveSettings(patch) {
  const clean = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const type = SETTING_TYPES[k];
    if (type === 'bool') clean[k] = !!v;
    else if (type === 'number' && Number.isFinite(Number(v))) clean[k] = Number(v);
    else if (type === 'string') clean[k] = String(v).slice(0, 80);
    else if (type === 'list') clean[k] = splitList(v);
  }
  const before = { ...store.settings };
  const s = store.setSettings(clean);
  store.save();
  if ('companionVisible' in clean && clean.companionVisible !== !!companionWin) setCompanionVisible(clean.companionVisible);
  if ('launchAtLogin' in clean) applyLoginItem(true);
  if ('bridgePort' in clean && clean.bridgePort !== before.bridgePort) bridge.start(clean.bridgePort);
  if ('coat' in clean && tray) tray.setImage(trayImage());
  sendCompanion('settings', s);
  // le réglage peut aussi changer depuis le menu de l'icône : on tient le tableau de bord à jour
  if (dashboardWin && !dashboardWin.isDestroyed()) dashboardWin.webContents.send('d:settings', { settings: s, loginItem: loginItemStatus() });
  refreshTray();
  return s;
}

function sanitizeRule(r) {
  if (!r || !r.pattern) return null;
  return {
    id: String(r.id || 'r' + Date.now() + Math.random().toString(36).slice(2, 6)),
    type: r.type === 'app' ? 'app' : 'site',
    label: String(r.label || r.pattern).slice(0, 60),
    pattern: String(r.pattern).slice(0, 300),
    keywords: splitList(r.keywords),
    mode: ['block', 'focus', 'track'].includes(r.mode) ? r.mode : 'block',
    enabled: r.enabled !== false,
  };
}

// Reclasser une activité depuis le tableau de bord (travail / distraction / neutre)
function reclassify(key, cat) {
  const [kind, ...rest] = String(key).split(':');
  const target = rest.join(':');
  if (!target || (kind !== 'site' && kind !== 'app')) return null;
  const s = store.settings;
  const listKey = kind === 'site' ? 'productiveSites' : 'productiveApps';
  const norm = kind === 'site' ? normPattern : normProc;
  const same = (p) => norm(p) === norm(target);

  let productive = s[listKey].filter((p) => !same(p));
  let rules = store.rules.filter((r) => !(r.mode === 'track' && r.type === kind && splitList(r.pattern).some(same)));
  if (cat === 'work') productive = [...productive, target];
  if (cat === 'distraction' && !rules.some((r) => r.type === kind && splitList(r.pattern).some(same))) {
    const item = store.today().items[key];
    rules = [...rules, sanitizeRule({ type: kind, label: item ? item.label : target, pattern: target, mode: 'track' })];
  }
  store.setSettings({ [listKey]: productive });
  store.setRules(rules);
  store.reclassifyToday(key, cat === 'work' || cat === 'distraction' ? cat : 'other');
  store.save();
  pushState();
  return { settings: store.settings, rules: store.rules, today: store.summary() };
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
