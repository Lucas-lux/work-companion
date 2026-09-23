// Pont entre le navigateur et l'app Work Companion (WebSocket local).
// L'extension envoie l'onglet actif ; l'app répond "close" quand le chat ferme une distraction.
const PORT = 17345;
let ws = null;

function browserFamily() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'opera';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (navigator.brave) return 'brave';
  return 'chrome';
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  } catch {
    ws = null;
    return;
  }
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'hello', browser: browserFamily(), version: chrome.runtime.getManifest().version }));
    report();
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'close' && typeof m.tabId === 'number') chrome.tabs.remove(m.tabId).catch(() => {});
  };
  ws.onclose = () => { ws = null; };
  ws.onerror = () => {};
}

async function report() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    const win = await chrome.windows.getLastFocused();
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    ws.send(JSON.stringify({
      type: 'tab',
      browser: browserFamily(),
      focused: !!win.focused,
      tabId: tab ? tab.id : null,
      url: tab ? tab.url || tab.pendingUrl || '' : '',
      title: tab ? tab.title || '' : '',
    }));
  } catch { /* pas de fenêtre */ }
}

chrome.tabs.onActivated.addListener(report);
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.title || change.status) report(); });
chrome.windows.onFocusChanged.addListener(report);

// Maintient le service worker éveillé et reconnecte si l'app a été relancée
chrome.alarms.create('wc-keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => { connect(); report(); });
setInterval(() => { connect(); report(); }, 15000);

connect();
