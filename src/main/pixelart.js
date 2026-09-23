'use strict';

// Maneki-neko en pixel art (24x24) pour l'icône de l'app, de la barre des tâches et de l'extension.
// Aucune dépendance : on encode nous-mêmes le PNG.
const zlib = require('zlib');

// . transparent  # contour  w blanc  o roux  k noir  p rose  r rouge  g or  y jaune  b joue  e oeil
const GRID = [
  '........................',
  '....##..........##......',
  '....#w#........#w#..##..',
  '....#pw#......#wp#.#ww#.',
  '....#ppw#....#wpp#.#ww#.',
  '...#wwww######wwww##ww#.',
  '..#wwwwwwwwwwwwwwww#ww#.',
  '..#wwwowwwwwwwwwwwwwww#.',
  '.#wwwoowwkwwwwwwkwwww#..',
  '.#wwwowwkwkwwwwkwkwww#..',
  '.#wwwwwwwwwwwwwwwwwww#..',
  '.#wwbbwwwwwppwwwwwbbw#..',
  '.#wwbbwwwwkwwkwwwwbbw#..',
  '..#wwwwwwwwwwwwwwwww#...',
  '..##rrrrrrrrrrrrrrr##...',
  '.#wwrrrrrrggrrrrrrrww#..',
  '.#wwwwwwwgyygwwwwwwww#..',
  '.#wwwwwwwwggwwwwwwkkw#..',
  '.#wwwwwwwwwwwwwwwkkkw#..',
  '.#wwwwwwwwwwwwwwwwkkw#..',
  '.#wwwwwwwwwwwwwwwwwww#..',
  '..#wwww#wwwwwww#wwww#...',
  '...#####.......#####....',
  '........................',
];
const SIZE = GRID.length;

const PALETTE = {
  '#': '#3b2a2a', w: '#fffaf3', o: '#f3a24f', k: '#2b2626', p: '#ffb0bb',
  r: '#e0473c', g: '#f2c035', y: '#ffe89a', b: '#ffb6b6',
};

// Pelages de la barre des tâches : on teinte les taches et le collier
const COATS = {
  orange: { o: '#f3a24f' },
  gris: { o: '#9aa3ad', w: '#f4f4f2' },
  noir: { o: '#3a3640', w: '#f4f1ee' },
  blanc: { o: '#fffaf3' },
  siamois: { o: '#7a5644', w: '#f1e3cc' },
};

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
}

function rgba(size, coat = 'orange') {
  const pal = { ...PALETTE, ...(COATS[coat] || COATS.orange) };
  const scale = Math.max(1, Math.floor(size / SIZE));
  const off = Math.floor((size - scale * SIZE) / 2);
  const buf = Buffer.alloc(size * size * 4);
  for (let gy = 0; gy < SIZE; gy++) {
    for (let gx = 0; gx < SIZE; gx++) {
      const ch = GRID[gy][gx];
      if (ch === '.') continue;
      const col = hex(pal[ch]);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((off + gy * scale + dy) * size + off + gx * scale + dx) * 4;
          buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = col[3];
        }
      }
    }
  }
  return buf;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, coat) {
  const pixels = rgba(size, coat);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { png, GRID };
