'use strict';

// Petits outils d'image sur des PNG bruts (pngjs) : lecture tolérante, détourage, découpe, redimensionnement.

const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

// Lit un PNG ou un JPEG (les générateurs livrent souvent des JPEG renommés en .png) en pixels RGBA.
function readImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) {
    const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
    const png = new PNG({ width: j.width, height: j.height });
    png.data = Buffer.from(j.data.buffer, j.data.byteOffset, j.data.length);
    return png;
  }
  // certains outils ajoutent des données après le chunk IEND : on les ignore
  const i = buf.indexOf('IEND');
  if (i > 0 && i + 8 < buf.length) buf = buf.subarray(0, i + 8);
  return PNG.sync.read(buf);
}

function alphaAt(png, x, y) {
  return png.data[(y * png.width + x) * 4 + 3];
}

// Rend transparent le fond uni (magenta, vert, blanc…) en partant des bords : l'intérieur du sujet est préservé.
function keyOutBackground(png, tol = 60) {
  const { width, height, data } = png;
  // Couleur de fond = médiane des pixels du bord (robuste au bruit JPEG et aux figures qui touchent un bord)
  const border = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 1; y < height - 1; y++) border.push(y * width, y * width + width - 1);
  if (border.some((p) => data[p * 4 + 3] < 250)) return false; // fond déjà transparent
  const median = (ch) => { const v = border.map((p) => data[p * 4 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const ref = [median(0), median(1), median(2)];
  const near = (c, t) => Math.abs(c[0] - ref[0]) <= t && Math.abs(c[1] - ref[1]) <= t && Math.abs(c[2] - ref[2]) <= t;
  const uniform = border.filter((p) => near([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]], tol)).length / border.length;
  if (uniform < 0.8) return false; // fond non uniforme : on ne touche pas

  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, x + (height - 1) * width);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!near([data[i], data[i + 1], data[i + 2]], tol)) continue;
    data[i + 3] = 0;
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p + width < width * height) stack.push(p + width);
  }
  // Fond saturé (magenta, vert…) : on retire aussi les poches enfermées (entre les pattes, sous le ventre).
  // On ne le fait pas pour un fond blanc/gris, qui ressemble trop au pelage.
  const saturated = Math.max(...ref) - Math.min(...ref) > 100;
  if (saturated) {
    for (let p = 0; p < width * height; p++) {
      const i = p * 4;
      if (data[i + 3] && near([data[i], data[i + 1], data[i + 2]], tol)) data[i + 3] = 0;
    }
  }
  // Les pixels de bordure anti-aliasés gardent une teinte du fond : on les nettoie en les rendant semi-transparents
  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    if (data[i + 3] === 0 || !near([data[i], data[i + 1], data[i + 2]], tol * 2.2)) continue;
    const x = p % width;
    const y = (p - x) / width;
    const edge = (x > 0 && data[i - 4 + 3] === 0) || (x < width - 1 && data[i + 4 + 3] === 0)
      || (y > 0 && data[i - width * 4 + 3] === 0) || (y < height - 1 && data[i + width * 4 + 3] === 0);
    if (edge) data[i + 3] = 0;
  }
  return true;
}

// Boîte englobante des pixels visibles dans une zone (colonnes x0..x1 incluses)
function bounds(png, x0 = 0, x1 = png.width - 1) {
  let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = x0; x <= x1; x++) {
      if (alphaAt(png, x, y) > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x0: minX, x1: maxX, y0: minY, y1: maxY };
}

// Découpe une bande horizontale en figures : suites de colonnes occupées, séparées par des vides.
// Les petits trous (< minGap) sont ignorés, les petites taches (< minWidth) aussi.
function segments(png, { minGap = Math.max(3, Math.round(png.width * 0.004)), minWidth = Math.round(png.height * 0.15) } = {}) {
  const occupied = new Uint8Array(png.width);
  for (let x = 0; x < png.width; x++) {
    for (let y = 0; y < png.height; y++) {
      if (alphaAt(png, x, y) > 16) { occupied[x] = 1; break; }
    }
  }
  const runs = [];
  let start = -1, gap = 0;
  for (let x = 0; x <= png.width; x++) {
    const on = x < png.width && occupied[x];
    if (on) {
      if (start < 0) start = x;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap >= minGap || x === png.width) {
        runs.push({ x0: start, x1: x - gap });
        start = -1;
        gap = 0;
      }
    }
  }
  return runs.filter((r) => r.x1 - r.x0 + 1 >= minWidth);
}

// Une figure trop large pour être seule (des personnages qui se touchent par la queue, par exemple)
// est coupée aux colonnes les moins remplies entre deux masses.
function splitWide(png, seg, { maxRatio = 1.25, minWidth = Math.round(png.height * 0.15) } = {}) {
  const width = seg.x1 - seg.x0 + 1;
  if (width <= png.height * maxRatio) return [seg];
  const fill = new Float32Array(width);
  for (let x = seg.x0; x <= seg.x1; x++) {
    let n = 0;
    for (let y = 0; y < png.height; y++) if (alphaAt(png, x, y) > 16) n++;
    fill[x - seg.x0] = n;
  }
  // lissage léger pour ignorer les colonnes isolées
  const smooth = fill.map((_, i) => { let s = 0, c = 0; for (let k = -6; k <= 6; k++) { const j = i + k; if (j >= 0 && j < width) { s += fill[j]; c++; } } return s / c; });
  const peak = Math.max(...smooth);
  const low = peak * 0.12;
  const cuts = [];
  let i = 0;
  while (i < width) {
    if (smooth[i] > low) { i++; continue; }
    let j = i;
    while (j < width && smooth[j] <= low) j++;
    // creux entre deux masses (pas au bord) : on coupe au milieu du creux
    if (i > minWidth && width - j > minWidth) cuts.push(Math.round((i + j) / 2));
    i = j;
  }
  if (!cuts.length) return [seg];
  const out = [];
  let start = seg.x0;
  for (const c of cuts) { out.push({ x0: start, x1: seg.x0 + c }); start = seg.x0 + c + 1; }
  out.push({ x0: start, x1: seg.x1 });
  return out.filter((r) => r.x1 - r.x0 + 1 >= minWidth);
}

function crop(png, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    png.data.copy(out.data, y * w * 4, ((y0 + y) * png.width + x0) * 4, ((y0 + y) * png.width + x0 + w) * 4);
  }
  return out;
}

// Assemble des figures en bande régulière : chacune centrée horizontalement et posée sur le bas de sa case
function compose(frames, frameW, frameH) {
  const out = new PNG({ width: frameW * frames.length, height: frameH });
  frames.forEach((f, i) => {
    const ox = i * frameW + Math.floor((frameW - f.width) / 2);
    const oy = frameH - f.height;
    for (let y = 0; y < f.height; y++) {
      f.data.copy(out.data, ((oy + y) * out.width + ox) * 4, y * f.width * 4, (y + 1) * f.width * 4);
    }
  });
  return out;
}

// Réduction par moyenne de zone (pondérée par l'alpha pour éviter les franges sombres)
function resize(png, w, h) {
  if (w === png.width && h === png.height) return png;
  const out = new PNG({ width: w, height: h });
  const sx = png.width / w, sy = png.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * png.width + xx) * 4;
          const al = png.data[i + 3];
          r += png.data[i] * al; g += png.data[i + 1] * al; b += png.data[i + 2] * al; a += al; n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; }
      out.data[o + 3] = a / n;
    }
  }
  return out;
}

// Pose l'image sur un carré transparent (marge autour) : utile pour les icônes
function squareWithMargin(png, size, margin = 0) {
  const inner = size - 2 * margin;
  const k = Math.min(inner / png.width, inner / png.height);
  const w = Math.max(1, Math.round(png.width * k)), h = Math.max(1, Math.round(png.height * k));
  const small = resize(png, w, h);
  const out = new PNG({ width: size, height: size });
  const ox = Math.floor((size - w) / 2), oy = Math.floor((size - h) / 2);
  for (let y = 0; y < h; y++) small.data.copy(out.data, ((oy + y) * size + ox) * 4, y * w * 4, (y + 1) * w * 4);
  return out;
}

const write = (png) => PNG.sync.write(png);

module.exports = { readImage, keyOutBackground, bounds, segments, splitWide, crop, compose, resize, squareWithMargin, write };
