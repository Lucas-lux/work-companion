'use strict';

// Noms de processus (Windows) et noms d'app (macOS) des navigateurs, en minuscules
const BROWSER_FAMILY = {
  chrome: 'chrome', 'google chrome': 'chrome', chromium: 'chrome', thorium: 'chrome',
  msedge: 'edge', 'microsoft edge': 'edge',
  firefox: 'firefox', librewolf: 'firefox', waterfox: 'firefox', floorp: 'firefox', zen: 'firefox', 'zen browser': 'firefox',
  brave: 'brave', 'brave browser': 'brave',
  opera: 'opera', opera_gx: 'opera',
  vivaldi: 'vivaldi',
  arc: 'arc',
  comet: 'chrome', dia: 'chrome', sidekick: 'chrome', yandex: 'chrome', duckduckgo: 'chrome', orion: 'safari',
  safari: 'safari', 'safari technology preview': 'safari',
};

const TITLE_SUFFIX = /\s[-—–]\s(?:[^-—–]*\s[-—–]\s)?(?:google chrome|mozilla firefox|firefox|microsoft\S*\sedge|brave|opera|vivaldi|arc|comet|chromium|zen browser|safari|duckduckgo)\s*$/i;
const GENERIC_HOST_WORDS = new Set(['docs', 'drive', 'sheets', 'slides', 'learn', 'developer', 'localhost', 'www', 'app']);

function normProc(name) {
  return String(name || '').toLowerCase().replace(/\.(exe|app)$/, '').trim();
}

function browserFamily(win) {
  return BROWSER_FAMILY[normProc(win.process)] || BROWSER_FAMILY[normProc(win.app)] || null;
}

function isBrowser(win) {
  return !!browserFamily(win);
}

function cleanTitle(title) {
  return String(title || '').replace(/​/g, '').replace(TITLE_SUFFIX, '').trim();
}

function splitList(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  return String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// "https://www.youtube.com/shorts/abc?x=1" -> "youtube.com/shorts/abc"
function hostPath(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return '';
    return (u.hostname.replace(/^(www|m|mobile)\./, '') + u.pathname).toLowerCase();
  } catch {
    return '';
  }
}

function normPattern(p) {
  return String(p).toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

// Renvoie la longueur du motif le plus spécifique qui correspond (0 si aucun)
function siteMatchLen(patterns, hp) {
  if (!hp) return 0;
  const slash = hp.indexOf('/');
  const host = slash < 0 ? hp : hp.slice(0, slash);
  const pathname = slash < 0 ? '/' : hp.slice(slash);
  let best = 0;
  for (const raw of splitList(patterns)) {
    const p = normPattern(raw);
    if (!p) continue;
    const i = p.indexOf('/');
    const pHost = i < 0 ? p : p.slice(0, i);
    const pPath = i < 0 ? '' : p.slice(i);
    const hostOk = host === pHost || host.endsWith('.' + pHost);
    if (hostOk && (!pPath || pathname.startsWith(pPath))) best = Math.max(best, p.length);
  }
  return best;
}

function titleMatchLen(keywords, titleLower) {
  let best = 0;
  for (const k of splitList(keywords)) {
    const kl = k.toLowerCase();
    if (kl && titleLower.includes(kl)) best = Math.max(best, kl.length);
  }
  return best;
}

function appMatches(patterns, proc, appName) {
  const name = appName.toLowerCase();
  return splitList(patterns).some((raw) => {
    const p = normProc(raw);
    return p && (proc === p || name === p || (p.length >= 4 && (proc.includes(p) || name.includes(p))));
  });
}

function siteKeyword(site) {
  const host = normPattern(site).split('/')[0];
  const first = host.split('.')[0];
  return host.includes('.') && first.length >= 5 && !GENERIC_HOST_WORDS.has(first) ? first : null;
}

function ruleResult(rule, key, label, focusActive) {
  const block = rule.mode === 'block' || (rule.mode === 'focus' && focusActive);
  return { category: 'distraction', key, label, rule, block };
}

function firstPattern(rule) {
  return normPattern(splitList(rule.pattern)[0] || rule.label);
}

/**
 * Classe la fenêtre active : travail, distraction ou autre.
 * win = { process, app, title, url? }
 */
function classify(win, settings, rules, focusActive) {
  const enabled = rules.filter((r) => r.enabled !== false);

  if (isBrowser(win)) {
    const hp = win.url ? hostPath(win.url) : '';
    const host = hp.split('/')[0];
    const title = cleanTitle(win.tabTitle || win.title);
    const titleLower = title.toLowerCase();

    let best = null;
    let bestLen = 0;
    for (const r of enabled.filter((r) => r.type === 'site')) {
      // Avec l'URL on est précis ; sans URL on se rabat sur les mots-clés du titre
      const len = hp ? siteMatchLen(r.pattern, hp) : titleMatchLen(r.keywords, titleLower);
      if (len > bestLen) { best = r; bestLen = len; }
    }
    if (best) return ruleResult(best, 'site:' + firstPattern(best), best.label, focusActive);

    const key = host ? 'site:' + host : 'web:' + normProc(win.process || win.app);
    const label = host || (win.app || 'Navigateur');
    const sites = splitList(settings.productiveSites);
    if (hp && sites.some((s) => siteMatchLen(s, hp))) return { category: 'work', key, label };
    if (!hp && sites.some((s) => { const k = siteKeyword(s); return k && titleLower.includes(k); })) {
      return { category: 'work', key, label };
    }
    return { category: 'other', key, label };
  }

  const proc = normProc(win.process || win.app);
  const appName = String(win.app || proc);
  const key = 'app:' + proc;
  for (const r of enabled.filter((r) => r.type === 'app')) {
    if (appMatches(r.pattern, proc, appName)) return ruleResult(r, key, appName, focusActive);
  }
  if (appMatches(settings.productiveApps, proc, appName)) return { category: 'work', key, label: appName };
  return { category: 'other', key, label: appName };
}

module.exports = { classify, isBrowser, browserFamily, hostPath, splitList, normPattern, normProc, cleanTitle };
