// Gera os PNGs a partir de public/icons/icon.svg.
// Uso: npm i -D sharp && npm run icons
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg');
// versão "maskable": fundo cheio (sem cantos arredondados) e desenho com margem de segurança
const maskable = Buffer.from(
  svg
    .toString()
    .replace('rx="112"', 'rx="0"')
    .replace('<g fill="#FFFFFF">', '<g fill="#FFFFFF" transform="translate(256 256) scale(0.75) translate(-256 -256)">'),
);

const out = [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['icon-maskable-512.png', maskable, 512],
  ['apple-touch-icon-180.png', maskable, 180],
];
for (const [name, src, size] of out) {
  await sharp(src).resize(size, size).png().toFile(`public/icons/${name}`);
  console.log('ok', name);
}
