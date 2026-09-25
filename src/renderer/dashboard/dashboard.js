/* Tableau de bord : stats du jour, focus, blocages, historique, réglages. */
(() => {
  const wc = window.wc;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let S = null; // état complet envoyé par le process principal
  let histDays = 7;
  let selectedMinutes = 25;

  // ------------------------------------------------------------ utilitaires

  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids) if (k != null) e.append(k);
    return e;
  }

  function fmt(s) {
    s = Math.round(s || 0);
    if (s === 0) return '0 min';
    if (s < 60) return '< 1 min';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  }

  const hhmm = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const CAT_LABEL = { work: 'Travail', distraction: 'Distraction', other: 'Neutre' };

  // ------------------------------------------------------------ navigation

  function showPage(name) {
    $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${name}`));
    if (name === 'history') loadHistory();
  }
  $$('nav button').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));

  // ------------------------------------------------------------ barre latérale

  function renderSide() {
    const s = S.settings;
    $('#catName').textContent = s.catName;
    let status = 'veille sur toi';
    if (S.idle) status = 'fait la sieste 😴';
    else if (S.focus.kind === 'focus') status = 'en mode focus 🎧';
    else if (S.focus.kind === 'break') status = 'en pause ☕';
    else if (S.snoozeUntil > Date.now()) status = `blocages en pause jusqu'à ${hhmm(S.snoozeUntil)}`;
    $('#catStatus').textContent = status;

    const c = S.current;
    const dot = $('#now .dot');
    dot.className = 'dot ' + (c ? c.category : '');
    let label = '—';
    if (c) {
      if (c.category === 'idle') label = 'Absent·e';
      else if (c.category === 'self') label = 'Work Companion';
      else label = c.label;
    }
    $('#nowLabel').textContent = label;
    $('#nowLabel').title = c && c.url ? c.url : label;
  }

  // ------------------------------------------------------------ aujourd'hui

  function renderToday() {
    const t = S.today;
    const h = new Date().getHours();
    $('#greet').textContent = `${h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'} 👋`;
    $('#dateLabel').textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    $('#tWork').textContent = fmt(t.work);
    $('#tDist').textContent = fmt(t.distraction);
    $('#tOther').textContent = fmt(t.other);
    $('#tBlocks').textContent = t.blocks;
    $('#tFocus').textContent = t.focusSessions;
    $('#focusHint').textContent = `${fmt(t.focusSeconds)} en focus`;
    $('#blocksHint').textContent = t.pets ? `et ${t.pets} caresse${t.pets > 1 ? 's' : ''} 💕` : 'distractions chassées';

    const goal = S.settings.dailyGoalMinutes * 60;
    const pct = Math.min(100, Math.round((t.work / goal) * 100));
    $('#goalBar').style.width = `${pct}%`;
    $('#goalLabel').textContent = pct >= 100 ? 'objectif atteint ! 🎉' : `${pct} % de l'objectif (${fmt(goal)})`;

    const total = t.work + t.distraction + t.other;
    $('#distHint').textContent = total > 60 ? `${Math.round((t.distraction / total) * 100)} % de ton temps` : ' ';

    const ring = $('#scoreRing');
    if (t.score == null) {
      $('#scoreVal').textContent = '—';
      ring.style.strokeDashoffset = 314.16;
    } else {
      $('#scoreVal').textContent = `${t.score}%`;
      ring.style.strokeDashoffset = 314.16 * (1 - t.score / 100);
      ring.style.stroke = t.score >= 70 ? 'var(--work)' : t.score >= 45 ? 'var(--brand)' : 'var(--distraction)';
    }

    renderTimeline(t.slots);
    if (!$('#items').contains(document.activeElement)) renderItems(t.items);
  }

  function renderTimeline(slots) {
    const keys = Object.keys(slots).map(Number);
    const tl = $('#timeline');
    const axis = $('#axis');
    if (!keys.length) {
      tl.replaceChildren(el('div', { class: 'empty', text: 'Rien pour l\'instant. Ta journée va se dessiner ici.' }));
      axis.replaceChildren();
      return;
    }
    const nowSlot = Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / 5);
    const first = Math.min(8 * 12, Math.floor(Math.min(...keys) / 12) * 12);
    const last = Math.max(19 * 12 - 1, Math.ceil((Math.max(...keys, nowSlot) + 1) / 12) * 12 - 1);
    const cols = [];
    for (let i = first; i <= last; i++) {
      const [w, d, o] = slots[i] || [0, 0, 0];
      const pct = (v) => `${Math.min(100, (v / 300) * 100)}%`;
      const time = `${String(Math.floor(i / 12)).padStart(2, '0')}:${String((i % 12) * 5).padStart(2, '0')}`;
      const title = `${time} · travail ${fmt(w)}, distraction ${fmt(d)}, autre ${fmt(o)}`;
      cols.push(el('div', { class: 'col', title },
        el('i', { class: 'w', style: `height:${pct(w)}` }),
        el('i', { class: 'd', style: `height:${pct(d)}` }),
        el('i', { class: 'o', style: `height:${pct(o)}` })));
    }
    tl.replaceChildren(...cols);
    const span = last - first + 1;
    const labels = [];
    for (let hr = Math.ceil(first / 12); hr * 12 <= last; hr += 2) {
      labels.push(el('span', { text: `${hr}h`, style: `left:${(((hr * 12 - first) + 0.5) / span) * 100}%` }));
    }
    axis.replaceChildren(...labels);
  }

  function renderItems(items) {
    const list = $('#items');
    if (!items.length) {
      list.replaceChildren(el('li', { class: 'empty', text: 'Aucune activité enregistrée aujourd\'hui.' }));
      return;
    }
    const max = items[0].s || 1;
    list.replaceChildren(...items.map((it) => {
      const editable = it.key.startsWith('site:') || it.key.startsWith('app:');
      const select = el('select', { class: `chip ${it.cat}`, disabled: !editable, title: editable ? 'Changer la catégorie' : 'Installe l\'extension pour classer ce site' },
        ...['work', 'distraction', 'other'].map((c) => el('option', { value: c, selected: c === it.cat, text: CAT_LABEL[c] })));
      select.addEventListener('change', async () => {
        const r = await wc.reclassify(it.key, select.value);
        if (r) { S.settings = r.settings; S.rules = r.rules; S.today = r.today; renderToday(); renderRules(); }
      });
      return el('li', { class: it.cat },
        el('span', { class: 'name', text: it.label, title: it.key.replace(/^\w+:/, '') }),
        select,
        el('div', { class: 'bar' }, el('i', { style: `width:${Math.max(2, (it.s / max) * 100)}%` })),
        el('span', { class: 'dur', text: fmt(it.s) }));
    }));
  }

  $('#quickFocus').addEventListener('click', () => { showPage('focus'); startFocus(); });

  // ------------------------------------------------------------ focus

  function renderFocus() {
    const f = S.focus;
    const running = !!f.kind;
    $('#fStart').hidden = running;
    $('#fStop').hidden = !running;
    $('#fStop').textContent = f.kind === 'break' ? 'Terminer la pause' : 'Arrêter';
    $$('#presets button').forEach((b) => {
      b.disabled = running;
      b.classList.toggle('active', !running && Number(b.dataset.min) === selectedMinutes);
    });
    $('.timer').classList.toggle('break', f.kind === 'break');
    $('#fSessions').textContent = S.today.focusSessions;
    $('#fMinutes').textContent = fmt(S.today.focusSeconds);

    const s = S.settings;
    const apps = s.quitAppsOnFocus.length ? s.quitAppsOnFocus.join(', ') : null;
    const focusRules = S.rules.filter((r) => r.enabled !== false && r.mode === 'focus').map((r) => r.label);
    const perks = [
      [true, `${s.catName} reste dans un coin de l'écran et ne se promène presque plus`],
      [focusRules.length > 0, focusRules.length ? `Fermeture de : ${focusRules.join(', ')}` : 'Aucun site « pendant le focus » configuré'],
      [s.dndOnFocus, s.dndOnFocus ? 'Notifications coupées' : 'Notifications laissées actives'],
      [!!apps, apps ? `Fermeture des apps : ${apps}` : 'Aucune app à fermer'],
      [s.autoBreak, s.autoBreak ? `Pause de ${s.breakMinutes} min enchaînée automatiquement` : 'Pas de pause automatique'],
    ];
    $('#perks').replaceChildren(...perks.map(([on, text]) => el('li', { class: on ? '' : 'off', text })));
    tickTimer();
  }

  function tickTimer() {
    if (!S) return;
    const f = S.focus;
    let remaining, total;
    if (f.kind) {
      remaining = Math.max(0, f.endsAt - Date.now());
      total = f.minutes * 60000;
      $('#fKind').textContent = f.kind === 'focus' ? 'Focus en cours' : 'Pause';
    } else {
      remaining = selectedMinutes * 60000;
      total = remaining;
      $('#fKind').textContent = 'Prêt·e ?';
    }
    const sec = Math.ceil(remaining / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = String(sec % 60).padStart(2, '0');
    $('#fTime').textContent = h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
    $('#fRing').style.strokeDashoffset = 603.19 * (1 - remaining / total);
  }
  setInterval(tickTimer, 500);

  $$('#presets button').forEach((b) => b.addEventListener('click', () => {
    selectedMinutes = Number(b.dataset.min);
    wc.saveSettings({ focusMinutes: selectedMinutes }).then((s) => { S.settings = s; });
    renderFocus();
  }));

  async function startFocus() {
    S.focus = await wc.focusStart(selectedMinutes);
    renderFocus();
  }
  $('#fStart').addEventListener('click', startFocus);
  $('#fStop').addEventListener('click', async () => { S.focus = await wc.focusStop(); renderFocus(); });

  // ------------------------------------------------------------ blocages

  function renderRules() {
    $('#blockingEnabled').checked = S.settings.blockingEnabled;
    const modeSelect = (r) => {
      const s = el('select', { class: r.mode },
        el('option', { value: 'block', text: 'Toujours', selected: r.mode === 'block' }),
        el('option', { value: 'focus', text: 'Pendant le focus', selected: r.mode === 'focus' }),
        el('option', { value: 'track', text: 'Compter', selected: r.mode === 'track' }));
      s.addEventListener('change', () => { r.mode = s.value; s.className = s.value; saveRules(); });
      return s;
    };
    $('#rules').replaceChildren(...S.rules.map((r) => {
      const toggle = el('input', { type: 'checkbox', checked: r.enabled !== false, 'aria-label': `Activer ${r.label}` });
      toggle.addEventListener('change', () => { r.enabled = toggle.checked; saveRules(); });
      const kw = r.keywords && r.keywords.length ? ` · titre : ${r.keywords.join(', ')}` : '';
      return el('div', { class: 'rule' + (r.enabled === false ? ' off' : '') },
        el('label', { class: 'switch' }, toggle, el('span', { class: 'track' })),
        el('div', { class: 'r-main' },
          el('div', { class: 'r-label', text: r.label }),
          el('div', { class: 'r-pat', text: r.pattern + kw, title: r.pattern + kw })),
        el('span', { class: 'badge', text: r.type === 'app' ? 'App' : 'Site' }),
        modeSelect(r),
        el('button', {
          class: 'icon-btn', title: 'Supprimer', text: '✕',
          onclick: () => { S.rules = S.rules.filter((x) => x !== r); saveRules(); },
        }));
    }));
  }

  async function saveRules() {
    S.rules = await wc.saveRules(S.rules);
    renderRules();
    renderFocus();
  }

  $('#addRule').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const pattern = String(f.get('pattern')).trim();
    if (!pattern) return;
    S.rules = [...S.rules, {
      type: f.get('type'),
      label: String(f.get('label')).trim() || pattern,
      pattern,
      keywords: String(f.get('keywords')).split(',').map((s) => s.trim()).filter(Boolean),
      mode: f.get('mode'),
      enabled: true,
    }];
    e.target.reset();
    saveRules();
  });

  $('#blockingEnabled').addEventListener('change', async (e) => {
    S.settings = await wc.saveSettings({ blockingEnabled: e.target.checked });
  });

  $$('#snoozeBtns [data-snooze]').forEach((b) => b.addEventListener('click', () => wc.snooze(Number(b.dataset.snooze))));

  function renderSnooze() {
    const on = S.snoozeUntil > Date.now();
    $('#snoozeLabel').textContent = on
      ? `Blocages en pause jusqu'à ${hhmm(S.snoozeUntil)}.`
      : 'Mets les blocages en pause quelques minutes.';
    $('#snoozeOff').hidden = !on;
  }

  function renderExtension() {
    const b = S.bridge;
    const pill = $('#extStatus');
    if (b.error) {
      pill.textContent = b.error;
      pill.className = 'pill err';
    } else if (b.clients.length) {
      const names = [...new Set(b.clients.map((c) => c.browser))].join(', ');
      pill.textContent = `Connectée · ${names}`;
      pill.className = 'pill ok';
    } else {
      pill.textContent = 'Non connectée';
      pill.className = 'pill';
    }
  }

  $('#openExt').addEventListener('click', () => wc.openExtension());

  // ------------------------------------------------------------ historique

  async function loadHistory() {
    const days = await wc.history(histDays);
    const max = Math.max(3600, ...days.map((d) => d.work + d.distraction));
    const today = days[days.length - 1].date;
    $('#chart').replaceChildren(...days.map((d) => {
      const date = new Date(d.date + 'T12:00:00');
      const lbl = histDays <= 7
        ? date.toLocaleDateString('fr-FR', { weekday: 'short' })
        : date.toLocaleDateString('fr-FR', { day: 'numeric' });
      return el('div', { class: 'day' + (d.date === today ? ' today' : ''), title: `${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}\nTravail ${fmt(d.work)} · Distraction ${fmt(d.distraction)} · ${d.blocks} fermeture(s)` },
        el('div', { class: 'bars' },
          el('i', { class: 'w', style: `height:${(d.work / max) * 100}%` }),
          el('i', { class: 'd', style: `height:${(d.distraction / max) * 100}%` })),
        el('span', { class: 'lbl', text: lbl }));
    }));
    const active = days.filter((d) => d.work + d.distraction + d.other > 0);
    const avg = active.length ? active.reduce((a, d) => a + d.work, 0) / active.length : 0;
    const best = days.reduce((a, d) => (d.work > a.work ? d : a), days[0]);
    $('#hAvg').textContent = active.length ? fmt(avg) : '—';
    $('#hBest').textContent = best.work ? fmt(best.work) : '—';
    $('#hBestDay').textContent = best.work ? new Date(best.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : ' ';
    $('#hBlocks').textContent = days.reduce((a, d) => a + d.blocks, 0);
  }

  $$('#histRange button').forEach((b) => b.addEventListener('click', () => {
    histDays = Number(b.dataset.days);
    $$('#histRange button').forEach((x) => x.classList.toggle('active', x === b));
    loadHistory();
  }));

  // ------------------------------------------------------------ réglages

  function renderSettings() {
    const s = S.settings;
    for (const input of $$('[data-key]')) {
      const v = s[input.dataset.key];
      if (input.type === 'checkbox') input.checked = !!v;
      else if (input.dataset.type === 'list') input.value = (v || []).join(', ');
      else input.value = v == null ? '' : v;
    }
    renderAvatar();
  }

  // Avatar : première image du sprite "idle" ; à défaut, le chat vectoriel
  function renderAvatar() {
    const avatar = $('#avatar');
    if (S.portrait) {
      let im = avatar.querySelector('img');
      if (!im) { im = document.createElement('img'); im.alt = ''; avatar.replaceChildren(im); }
      im.src = S.portrait;
    } else if (!avatar.querySelector('.cat')) {
      avatar.innerHTML = window.CAT_SVG;
      window.applyCoat(avatar.querySelector('.cat'), S.settings.coat);
    }
  }

  async function save(patch) {
    S.settings = await wc.saveSettings(patch);
    renderSettings();
    renderSide();
    renderFocus();
    if ('launchAtLogin' in patch) refreshLoginItem();
  }

  // ------------------------------------------------------------ démarrage automatique

  const LOGIN_TEXT = {
    on: () => `Actif : ${S.settings.catName} se lancera à la prochaine ouverture de session.`,
    off: () => `Désactivé : tu devras lancer ${S.settings.catName} toi-même.`,
    dev: () => "Disponible uniquement dans la version installée de l'app (pas avec npm start).",
    blocked: (p) => p === 'darwin'
      ? 'Bloqué par macOS : autorise Work Companion dans Réglages Système → Général → Ouverture.'
      : 'Désactivé dans Windows (Gestionnaire des tâches → Applications de démarrage).',
    missing: () => "Pas encore enregistré auprès du système.",
    unknown: () => "État inconnu : le système n'a pas répondu.",
  };

  function renderLoginItem(status) {
    if (!status) return;
    const el = $('#loginStatus');
    el.textContent = (LOGIN_TEXT[status.state] || LOGIN_TEXT.unknown)(status.platform);
    const problem = status.state === 'blocked' || status.state === 'missing';
    el.className = 'login-status' + (problem ? ' warn' : status.state === 'on' ? ' ok' : '');
    $('#loginActions').hidden = !problem;
    // Sur macOS on ne peut pas débloquer à la place de l'utilisateur : seul le lien vers les réglages est utile
    $('#fixLogin').hidden = status.platform === 'darwin' && status.state === 'blocked';
    $('[data-key="launchAtLogin"]').disabled = status.state === 'dev';
  }

  async function refreshLoginItem() {
    renderLoginItem(await wc.loginItem());
  }

  $('#fixLogin').addEventListener('click', async () => renderLoginItem(await wc.fixLoginItem()));
  $('#openStartup').addEventListener('click', () => wc.openStartupSettings());
  // L'utilisateur a pu changer ça dans les réglages du système entre-temps
  window.addEventListener('focus', () => { if (S) refreshLoginItem(); });

  for (const input of $$('[data-key]')) {
    input.addEventListener('change', () => {
      const key = input.dataset.key;
      let value = input.type === 'checkbox' ? input.checked : input.value;
      if (input.dataset.type === 'number') value = Number(value);
      if (key === 'catName' && !String(value).trim()) value = 'Mochi';
      save({ [key]: value });
    });
  }

  $('#openNotif').addEventListener('click', () => wc.openNotifSettings());
  $('#openSprites').addEventListener('click', () => wc.openSprites());
  $('#reloadSprites').addEventListener('click', async () => {
    const r = await wc.reloadSprites();
    S.sprites = r.sprites;
    S.portrait = r.portrait;
    renderSprites();
    renderAvatar();
  });

  function renderSprites() {
    const sp = S.sprites;
    const source = sp && sp.dir === S.userSpriteDir ? 'ton dossier perso' : "l'app";
    $('#spriteStatus').textContent = sp
      ? `Animations chargées depuis ${source} : ${sp.names.map((n) => `${n} (${sp.frames[n]} images)`).join(', ')}`
      : 'Aucun sprite trouvé : chat vectoriel par défaut.';
  }

  // ------------------------------------------------------------ démarrage

  function renderLive() {
    renderSide();
    renderToday();
    renderFocus();
    renderSnooze();
    renderExtension();
  }

  wc.get().then((state) => {
    S = state;
    document.body.classList.add(state.platform);
    selectedMinutes = state.settings.focusMinutes || 25;
    renderSettings();
    renderRules();
    renderSprites();
    renderLive();
    refreshLoginItem();
  });

  // Réglage modifié ailleurs (menu de l'icône)
  wc.onSettings(({ settings, loginItem }) => {
    if (!S) return;
    S.settings = settings;
    renderSettings();
    renderLoginItem(loginItem);
  });

  wc.onState((live) => {
    if (!S) return;
    Object.assign(S, live);
    renderLive();
  });
})();
