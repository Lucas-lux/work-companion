'use strict';

// Charge les feuilles de sprites pixel art du chat.
// Chaque animation est une bande horizontale (les images à la suite) : idle.png, walk.png, sleep.png, click.png…
// Les planches générées par IA sont rarement régulières : on détecte chaque figure, on la recadre,
// on la centre et on la pose au sol, puis on réduit la bande à la taille d'affichage.
// Un sprites.json optionnel précise le nombre d'images, la vitesse, les figures à garder, etc.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const img = require('./png');

const NAMES = ['idle', 'walk', 'run', 'sleep', 'alert', 'click', 'happy', 'dangle'];
const DEFAULT_FPS = { idle: 5, walk: 10, run: 14, sleep: 3, alert: 8, click: 10, happy: 8, dangle: 6 };
const DEFAULT_LOOP = { click: false };

function loadSprites(dirs, cacheDir) {
  for (const dir of dirs) {
    const r = loadDir(dir, cacheDir);
    if (r) return r;
  }
  return null;
}

function loadDir(dir, cacheDir) {
  if (!dir || !fs.existsSync(dir)) return null;
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'sprites.json'), 'utf8')); } catch { /* optionnel */ }
  const displayHeight = Number(manifest.displayHeight) || 128;
  const configs = manifest.animations || {};
  const animations = {};
  const report = {};
  for (const name of NAMES) {
    const cfg = configs[name] || {};
    const file = path.join(dir, cfg.file || `${name}.png`);
    if (!fs.existsSync(file)) continue;
    // Hauteur à l'écran de cette animation : les planches n'ont pas toutes la même échelle,
    // on la règle par animation pour que le chat garde la même taille de tête partout
    const height = Number(cfg.height) || displayHeight;
    try {
      const sheet = processSheet(file, cfg, height, cacheDir);
      animations[name] = {
        frames: sheet.frames,
        fps: Number(cfg.fps) || DEFAULT_FPS[name] || 6,
        loop: cfg.loop != null ? !!cfg.loop : DEFAULT_LOOP[name] !== false,
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        height,
        // vrai pixel art basse résolution → rendu "pixelisé" ; planche haute résolution → lissage
        pixelated: sheet.frameHeight <= height,
        data: 'data:image/png;base64,' + sheet.png.toString('base64'),
      };
      report[name] = sheet.info;
    } catch (e) {
      console.warn('[sprites]', file, e.message);
      report[name] = { error: e.message };
    }
  }
  if (!animations.idle) return null;
  return { dir, displayHeight, names: Object.keys(animations), animations, report, portrait: portraitOf(animations.idle) };
}

// Première image de l'animation "idle", seule : sert d'avatar dans le tableau de bord
function portraitOf(anim) {
  try {
    const strip = img.readImage(Buffer.from(anim.data.split(',')[1], 'base64'));
    const frame = img.crop(strip, 0, 0, anim.frameWidth, anim.frameHeight);
    return 'data:image/png;base64,' + img.write(frame).toString('base64');
  } catch {
    return null;
  }
}

// Normalise une planche : figures détectées → bande régulière → réduite (cache sur disque)
function processSheet(file, cfg, displayHeight, cacheDir) {
  const stat = fs.statSync(file);
  const key = crypto.createHash('md5').update(JSON.stringify([file, stat.size, stat.mtimeMs, displayHeight, cfg, 3])).digest('hex');
  const cacheBase = cacheDir ? path.join(cacheDir, key) : null;
  if (cacheBase && fs.existsSync(cacheBase + '.json')) {
    try {
      const meta = JSON.parse(fs.readFileSync(cacheBase + '.json', 'utf8'));
      return { ...meta, png: fs.readFileSync(cacheBase + '.png') };
    } catch { /* cache abîmé : on recalcule */ }
  }

  const png = img.readImage(fs.readFileSync(file));
  const keyed = img.keyOutBackground(png);
  const info = { width: png.width, height: png.height, keyed };

  // 1. figures détectées par les vides entre elles (et découpe des groupes qui se touchent)
  let segs = img.segments(png).flatMap((s) => img.splitWide(png, s));
  info.detected = segs.length;
  const wanted = Number(cfg.frames) || 0;
  if (Array.isArray(cfg.pick) && cfg.pick.length) {
    segs = cfg.pick.map((i) => segs[i]).filter(Boolean);
    info.picked = cfg.pick;
  } else if (segs.length < 1 || (wanted && segs.length !== wanted)) {
    // 2. sinon découpe régulière (nombre demandé, ou déduit du ratio largeur/hauteur)
    const n = wanted || Math.max(1, Math.round(png.width / png.height));
    const fw = png.width / n;
    segs = Array.from({ length: n }, (_, i) => ({ x0: Math.round(i * fw), x1: Math.round((i + 1) * fw) - 1 }));
    info.fallbackEqualSplit = n;
  }

  // 3. recadrage serré de chaque figure
  const frames = [];
  for (const s of segs) {
    const b = img.bounds(png, s.x0, s.x1);
    if (!b) continue;
    frames.push(img.crop(png, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1));
  }
  if (!frames.length) throw new Error('aucune figure visible');
  info.frames = frames.length;
  info.frameSizes = frames.map((f) => `${f.width}x${f.height}`);

  // 4. bande régulière : cases de taille commune, figure centrée et posée au sol
  const margin = Math.round(Math.max(...frames.map((f) => f.height)) * 0.04);
  const frameW = Math.max(...frames.map((f) => f.width)) + margin * 2;
  const frameH = Math.max(...frames.map((f) => f.height)) + margin;
  let strip = img.compose(frames, frameW, frameH);

  // 5. réduction à 2× la taille d'affichage (net sur écran HiDPI, léger en mémoire)
  const targetH = Math.min(frameH, displayHeight * 2);
  const k = targetH / frameH;
  const outW = Math.max(1, Math.round(frameW * k));
  strip = img.resize(strip, outW * frames.length, Math.round(frameH * k));

  const meta = { frames: frames.length, frameWidth: outW, frameHeight: strip.height, info };
  const out = img.write(strip);
  if (cacheBase) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheBase + '.png', out);
      fs.writeFileSync(cacheBase + '.json', JSON.stringify(meta));
    } catch { /* cache facultatif */ }
  }
  return { ...meta, png: out };
}

module.exports = { loadSprites, NAMES };
