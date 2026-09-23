'use strict';

const EventEmitter = require('events');
const { WebSocketServer } = require('ws');

// Seules les extensions de navigateur (ou les process locaux sans Origin) peuvent se connecter
const ALLOWED_ORIGIN = /^(chrome-extension|moz-extension|safari-web-extension|extension):\/\//i;

// Serveur WebSocket local qui parle avec l'extension navigateur :
// l'extension envoie l'URL de l'onglet actif, l'app lui demande de fermer un onglet.
class Bridge extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map();
    this.seq = 0;
    this.error = null;
  }

  start(port) {
    this.stop();
    this.port = port;
    this.error = null;
    this.wss = new WebSocketServer({
      host: '127.0.0.1',
      port,
      verifyClient: ({ origin }) => !origin || ALLOWED_ORIGIN.test(origin),
    });
    this.wss.on('error', (e) => {
      this.error = e.code === 'EADDRINUSE' ? `Port ${port} déjà utilisé` : e.message;
      console.warn('[bridge]', this.error);
      this.emit('change');
    });
    this.wss.on('connection', (ws) => {
      const c = { id: ++this.seq, ws, browser: '?', tab: null, at: 0 };
      this.clients.set(c.id, c);
      this.emit('change');
      ws.on('message', (raw) => {
        let m;
        try { m = JSON.parse(raw); } catch { return; }
        if (m.browser) c.browser = String(m.browser).slice(0, 20);
        if (m.type === 'tab') {
          c.tab = { tabId: m.tabId, url: String(m.url || ''), title: String(m.title || ''), focused: !!m.focused };
          c.at = Date.now();
        }
      });
      ws.on('close', () => { this.clients.delete(c.id); this.emit('change'); });
      ws.on('error', () => {});
    });
  }

  // Onglet actif du navigateur qui a le focus (même famille que la fenêtre active si possible)
  focusedTab(family) {
    const focused = [...this.clients.values()].filter((c) => c.tab && c.tab.focused);
    let pick = focused.filter((c) => c.browser === family).sort((a, b) => b.at - a.at)[0];
    if (!pick && focused.length === 1) pick = focused[0];
    return pick ? { ...pick.tab, client: pick.id } : null;
  }

  closeTab(clientId, tabId) {
    const c = this.clients.get(clientId);
    if (!c || c.ws.readyState !== 1) return false;
    c.ws.send(JSON.stringify({ type: 'close', tabId }));
    return true;
  }

  status() {
    return {
      port: this.port,
      error: this.error,
      clients: [...this.clients.values()].map((c) => ({ browser: c.browser })),
    };
  }

  stop() {
    for (const c of this.clients.values()) { try { c.ws.terminate(); } catch { /* ignore */ } }
    this.clients.clear();
    if (this.wss) { try { this.wss.close(); } catch { /* ignore */ } }
    this.wss = null;
  }
}

module.exports = Bridge;
