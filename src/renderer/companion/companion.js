/* Le petit chat : déplacements, humeurs et réactions aux événements de l'app.
   Deux rendus possibles : sprites pixel art (assets/sprites) ou, à défaut, le chat SVG. */
(() => {
  const api = window.companion;
  const pet = document.getElementById('pet');
  const flip = document.getElementById('flip');
  const bubble = document.getElementById('bubble');
  const bubbleTxt = bubble.querySelector('.txt');
  const bubbleBar = bubble.querySelector('.bar');
  const fx = document.getElementById('fx');

  const S = {
    x: 0, dir: 1, target: null, speed: 65,
    w: 132, h: 102, // taille du chat à l'écran
    mode: 'idle', focus: null, idle: false,
    dragging: false, alertId: null, settings: {}, stats: null,
    busyUntil: 0,
    sprites: null, anim: null, spriteEl: null, cat: null,
  };
  let W = window.innerWidth;
  let walkResolve = null;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmt = (s) => { const m = Math.round((s || 0) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };

  // ------------------------------------------------------------ rendu : sprites ou SVG

  // Pour chaque humeur, les animations à essayer dans l'ordre
  const ANIM_FOR = {
    idle: ['idle'], walk: ['walk', 'idle'], run: ['run', 'walk', 'idle'], sleep: ['sleep', 'idle'],
    alert: ['alert', 'idle'], swipe: ['click', 'alert', 'idle'], happy: ['happy', 'idle'], dangle: ['dangle', 'idle'],
  };

  function setupRenderer(sprites) {
    if (sprites && sprites.animations && sprites.animations.idle) {
      S.sprites = sprites;
      const anims = Object.values(sprites.animations);
      // chaque animation a sa propre échelle : hauteur voulue à l'écran / hauteur de sa case
      for (const a of anims) a.scale = (a.height || sprites.displayHeight) / a.frameHeight;
      S.w = Math.ceil(Math.max(...anims.map((a) => a.frameWidth * a.scale)));
      S.h = Math.ceil(Math.max(...anims.map((a) => a.frameHeight * a.scale)));
      const el = document.createElement('div');
      el.className = 'sprite';
      flip.replaceChildren(el);
      S.spriteEl = el;
      pet.classList.add('pixel');
    } else {
      flip.innerHTML = window.CAT_SVG;
      S.cat = flip.querySelector('.cat');
      S.w = 132;
      S.h = 102;
    }
    pet.style.width = flip.style.width = `${S.w}px`;
    pet.style.height = flip.style.height = `${S.h}px`;
    bubble.style.bottom = `${S.h + 2}px`;
  }

  function playAnim(mode) {
    if (!S.sprites) return;
    const names = ANIM_FOR[mode] || ['idle'];
    const name = names.find((n) => S.sprites.animations[n]);
    const a = S.sprites.animations[name];
    // "run" sans sprite dédié : la marche, mais plus vite
    const fps = mode === 'run' && name === 'walk' ? a.fps * 1.6 : a.fps;
    if (S.anim && S.anim.name === name && S.anim.fps === fps) return;
    const w = a.frameWidth * a.scale;
    const h = a.frameHeight * a.scale;
    const el = S.spriteEl;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.backgroundImage = `url("${a.data}")`;
    el.style.imageRendering = a.pixelated ? 'pixelated' : 'auto';
    el.style.backgroundSize = `${w * a.frames}px ${h}px`;
    el.style.backgroundPosition = '0 0';
    S.anim = { name, fps, frames: a.frames, loop: a.loop, w, start: performance.now(), frame: -1 };
  }

  function tickAnim(t) {
    const a = S.anim;
    if (!a) return;
    let frame = Math.floor(((t - a.start) / 1000) * a.fps);
    frame = a.loop ? frame % a.frames : Math.min(frame, a.frames - 1);
    if (frame !== a.frame) {
      a.frame = frame;
      S.spriteEl.style.backgroundPosition = `-${frame * a.w}px 0`;
    }
  }

  // ------------------------------------------------------------ état visuel

  function setMode(m) {
    S.mode = m;
    pet.dataset.mode = m;
    playAnim(m);
    if (m === 'sleep') startZzz(); else stopZzz();
  }

  function restMode() { return S.idle ? 'sleep' : 'idle'; }

  function face(dir) {
    S.dir = dir;
    pet.dataset.dir = String(dir);
  }

  function render() {
    pet.style.transform = `translateX(${S.x}px)`;
    if (bubble.classList.contains('show')) placeBubble();
  }

  function placeBubble() {
    const bw = bubble.offsetWidth;
    const lean = S.w * 0.18;
    const want = S.w / 2 + (S.dir === 1 ? lean : -lean) - bw / 2;
    const left = clamp(want, 6 - S.x, W - S.x - bw - 6);
    bubble.style.left = `${left}px`;
    const tail = clamp(S.w / 2 + (S.dir === 1 ? lean : -lean) - left, 16, bw - 16);
    bubble.style.setProperty('--tail', `${tail}px`);
  }

  // ------------------------------------------------------------ déplacements

  function walkTo(x, run = false) {
    x = clamp(x, 4, W - S.w - 4);
    if (walkResolve) walkResolve(false);
    if (Math.abs(x - S.x) < 3) return Promise.resolve(true);
    S.target = x;
    S.speed = run ? 260 : 62;
    face(x > S.x ? 1 : -1);
    setMode(run ? 'run' : 'walk');
    return new Promise((r) => { walkResolve = r; });
  }

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (S.target != null && !S.dragging) {
      const d = S.target - S.x;
      const step = S.speed * dt;
      if (Math.abs(d) <= step) {
        S.x = S.target;
        S.target = null;
        if (S.mode === 'walk' || S.mode === 'run') setMode(S.alertId ? 'alert' : restMode());
        const r = walkResolve;
        walkResolve = null;
        if (r) r(true);
      } else {
        S.x += Math.sign(d) * step;
      }
    }
    tickAnim(t);
    render();
    requestAnimationFrame(frame);
  }

  let wanderTimer = null;
  function scheduleWander() {
    clearTimeout(wanderTimer);
    const base = S.focus === 'focus' ? 45000 : 14000;
    wanderTimer = setTimeout(async () => {
      const free = S.mode === 'idle' && !S.dragging && !S.alertId && Date.now() > S.busyUntil;
      if (S.settings.wander !== false && free) {
        // En focus, le chat reste sagement dans les coins pour ne pas gêner
        const nx = S.focus === 'focus'
          ? (Math.random() < 0.5 ? rand(8, 180) : rand(W - 320, W - S.w - 8))
          : rand(8, W - S.w - 8);
        await walkTo(nx);
      }
      scheduleWander();
    }, base + Math.random() * base);
  }

  // ------------------------------------------------------------ bulle & effets

  let bubbleTimer = null;
  function say(text, ms = 3800, kind = '') {
    bubbleTxt.textContent = text;
    bubble.className = `bubble hit show ${kind}`;
    placeBubble();
    clearTimeout(bubbleTimer);
    if (ms) bubbleTimer = setTimeout(hideBubble, ms);
  }

  function hideBubble() {
    clearTimeout(bubbleTimer);
    bubble.className = 'bubble hit';
  }

  function spawn(cls, text, x, y, extra = {}) {
    const s = document.createElement('span');
    if (cls) s.className = cls;
    if (text) s.textContent = text;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    for (const [k, v] of Object.entries(extra)) s.style.setProperty(k, v);
    fx.appendChild(s);
    setTimeout(() => s.remove(), 2800);
    return s;
  }

  const headX = () => (S.dir === 1 ? S.w * 0.7 : S.w * 0.3);
  const headY = () => Math.max(0, S.h - 98);

  function hearts(n = 3, glyphs = ['💕', '💗', '💖']) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => spawn('', glyphs[i % glyphs.length], headX() - 8 + rand(-14, 14), headY() + 4, { '--dx': `${rand(-10, 10)}px` }), i * 180);
    }
  }

  function bang() { spawn('bang', '!', headX() + (S.dir === 1 ? 14 : -22), headY() - 26); }

  function claws() {
    const s = spawn('claw', '', S.dir === 1 ? S.w - 24 : -12, S.h - 68);
    s.innerHTML = '<i></i><i></i><i></i>';
    if (S.dir === -1) s.style.transform = 'scaleX(-1)';
  }

  let zzzTimer = null;
  function startZzz() {
    if (zzzTimer) return;
    const puff = () => spawn('zzz', 'z', headX() + (S.dir === 1 ? 6 : -14), headY() + 10);
    puff();
    zzzTimer = setInterval(puff, 1300);
  }
  function stopZzz() { clearInterval(zzzTimer); zzzTimer = null; }

  // ------------------------------------------------------------ souris : clic, caresse, glisser

  let ignoring = true;
  function setIgnore(v) {
    if (v !== ignoring) { ignoring = v; api.setIgnore(v); }
  }

  window.addEventListener('mousemove', (e) => {
    if (S.dragging) return setIgnore(false);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    setIgnore(!(el && el.closest('.hit')));
  });
  document.addEventListener('mouseleave', () => { if (!S.dragging) setIgnore(true); });

  let down = null;
  flip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, offset: e.clientX - S.x, moved: false };
    flip.setPointerCapture(e.pointerId);
  });
  flip.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (!down.moved && Math.abs(e.clientX - down.x) > 5) {
      down.moved = true;
      S.dragging = true;
      S.target = null;
      if (walkResolve) { walkResolve(false); walkResolve = null; }
      hideBubble();
      setMode('dangle');
    }
    if (down.moved) S.x = clamp(e.clientX - down.offset, 0, W - S.w);
  });
  flip.addEventListener('pointerup', () => {
    if (!down) return;
    const wasDrag = down.moved;
    down = null;
    S.dragging = false;
    if (wasDrag) {
      setMode(S.alertId ? 'alert' : restMode());
      S.busyUntil = Date.now() + 8000;
    } else {
      onPet();
    }
  });
  flip.addEventListener('dblclick', () => api.openDashboard());
  flip.addEventListener('contextmenu', (e) => { e.preventDefault(); api.menu(); });

  let hoverTimer = null;
  flip.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (bubble.classList.contains('show') || !S.stats || S.dragging) return;
      const name = S.settings.catName || 'Mochi';
      say(`${name} · 💼 ${fmt(S.stats.work)} · 🙈 ${fmt(S.stats.distraction)}`, 2600, 'info');
    }, 700);
  });
  flip.addEventListener('mouseleave', () => clearTimeout(hoverTimer));

  const PURRS = ['Rrrrr… 💕', 'Prrr prrr 😽', 'Encore ! 😻', 'Mrrraou 💗', '*ronronne*'];
  function onPet() {
    api.pet();
    if (S.alertId) return;
    if (S.mode === 'sleep') {
      say('Mmh… encore 5 minutes 😴', 2500);
      return;
    }
    S.busyUntil = Date.now() + 5000;
    setMode('happy');
    hearts();
    say(PURRS[Math.floor(Math.random() * PURRS.length)], 2200);
    setTimeout(() => { if (S.mode === 'happy') setMode(restMode()); }, 1800);
  }

  // ------------------------------------------------------------ événements de l'app

  function applySettings(s) {
    S.settings = s || {};
    if (S.cat) window.applyCoat(S.cat, S.settings.coat);
  }

  function applyFocus(f) {
    S.focus = f && f.kind ? f.kind : null;
    pet.dataset.focus = S.focus || '';
  }

  api.on('settings', applySettings);
  api.on('stats', (s) => { S.stats = s; });
  api.on('focus', applyFocus);

  api.on('idle', ({ idle }) => {
    S.idle = idle;
    if (S.alertId || S.dragging) return;
    if (idle && (S.mode === 'idle' || S.mode === 'walk')) {
      S.target = null;
      setMode('sleep');
    } else if (!idle && S.mode === 'sleep') {
      setMode('idle');
    }
  });

  api.on('say', ({ text, mood, ms }) => {
    if (S.alertId) return;
    if (S.mode === 'sleep') setMode('idle');
    say(text, ms || 4200);
    if (mood === 'happy' || mood === 'proud') {
      setMode('happy');
      if (mood === 'proud') hearts(2, ['✨', '⭐']);
      setTimeout(() => { if (S.mode === 'happy') setMode(restMode()); }, 1600);
    }
  });

  api.on('celebrate', ({ text }) => {
    S.busyUntil = Date.now() + 6000;
    setMode('happy');
    say(text, 5000);
    hearts(6, ['🎉', '✨', '⭐', '💖']);
    setTimeout(() => { if (S.mode === 'happy') setMode(restMode()); }, 2400);
  });

  api.on('alert', async ({ id, targetX, message, seconds }) => {
    S.alertId = id;
    S.busyUntil = Date.now() + 10000;
    if (S.dragging) return;
    setMode('alert');
    bang();
    bubbleBar.style.animationDuration = `${seconds}s`;
    say(message, 0, 'alert');
    // relance l'animation de la barre de compte à rebours
    bubbleBar.style.animation = 'none';
    void bubbleBar.offsetWidth;
    bubbleBar.style.animation = '';
    await sleep(450);
    if (S.alertId !== id) return;
    const tx = targetX == null ? W / 2 : targetX;
    await walkTo(tx - S.w / 2, true);
    if (S.alertId !== id) return;
    setMode('alert');
  });

  api.on('swipe', ({ id }) => {
    if (S.alertId !== id) return;
    hideBubble();
    S.anim = null; // repart du début même si l'animation "click" est déjà chargée
    setMode('swipe');
    claws();
    setTimeout(claws, 260);
    setTimeout(() => {
      if (S.alertId !== id) return;
      S.alertId = null;
      setMode(restMode());
    }, 1100);
  });

  api.on('relief', ({ id, message }) => {
    if (S.alertId !== id) return;
    S.alertId = null;
    setMode('happy');
    say(message, 3000);
    hearts(2, ['✨', '💖']);
    setTimeout(() => { if (S.mode === 'happy') setMode(restMode()); }, 1600);
  });

  window.addEventListener('resize', () => {
    W = window.innerWidth;
    S.x = clamp(S.x, 0, W - S.w);
  });

  // ------------------------------------------------------------ démarrage

  api.init().then(({ settings, focus, idle, stats, sprites }) => {
    setupRenderer(sprites);
    applySettings(settings);
    applyFocus(focus);
    S.stats = stats;
    S.idle = idle;
    S.x = W - S.w - 60;
    face(-1);
    setMode(idle ? 'sleep' : 'idle');
    render();
    requestAnimationFrame(frame);
    scheduleWander();
    setTimeout(() => {
      if (!S.idle) say(`Coucou ! Je suis ${settings.catName || 'Mochi'}, je veille sur ta concentration 🐾`, 5000);
    }, 900);
  });
})();
