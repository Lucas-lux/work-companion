// Génère toutes les icônes (app, barre des tâches, extension) à partir de build/icon-source.(png|jpg).
// Le fond uni de l'image source (magenta, blanc…) est détouré automatiquement.
// Sans image source, on retombe sur le maneki-neko en pixel art dessiné dans src/main/pixelart.js.
const fs = require('fs');
const path = require('path');
const img = require('../src/main/png');
const { png: pixelIcon } = require('../src/main/pixelart');

const root = path.join(__dirname, '..');
const source = ['icon-source.png', 'icon-source.jpg', 'icon-source.jpeg']
  .map((f) => path.join(root, 'build', f))
  .find((f) => fs.existsSync(f));

let base = null;
if (source) {
  const p = img.readImage(fs.readFileSync(source));
  img.keyOutBackground(p);
  const b = img.bounds(p);
  base = img.crop(p, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
  console.log(`Source : ${path.basename(source)} (${p.width}x${p.height}, sujet ${base.width}x${base.height})`);
} else {
  console.log('Pas de build/icon-source.* : icône pixel art par défaut.');
}

function icon(size, marginRatio = 0.04) {
  return base ? img.write(img.squareWithMargin(base, size, Math.round(size * marginRatio))) : pixelIcon(size);
}

fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'assets', 'icon'), { recursive: true });

fs.writeFileSync(path.join(root, 'build', 'icon.png'), icon(1024));
for (const size of [16, 32, 48, 128]) fs.writeFileSync(path.join(root, 'extension', `icon-${size}.png`), icon(size, 0));
// Barre des tâches : Electron choisit la variante @Nx adaptée à l'échelle de l'écran
for (const [suffix, size] of [['', 16], ['@1.5x', 24], ['@2x', 32], ['@3x', 48]]) {
  fs.writeFileSync(path.join(root, 'assets', 'icon', `tray${suffix}.png`), icon(size, 0));
}
fs.writeFileSync(path.join(root, 'assets', 'icon', 'icon-256.png'), icon(256));
console.log('Icônes générées.');
