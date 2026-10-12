// Dessine l'icône (feuille blanche au coin plié sur fond vert) et l'écrit en PNG, sans bibliothèque.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, crc]);
}
function png(taille, pixel) {
  const ligne = taille * 3 + 1;
  const brut = Buffer.alloc(taille * ligne);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const [r, g, b] = pixel(x / taille, y / taille);
      const i = y * ligne + 1 + x * 3;
      brut[i] = r; brut[i + 1] = g; brut[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RVB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloc('IHDR', ihdr), bloc('IDAT', deflateSync(brut)), bloc('IEND', Buffer.alloc(0)),
  ]);
}

const VERT = [15, 81, 50], BLANC = [255, 255, 255], VERT_CLAIR = [120, 190, 150];
function dessin(u, v) {
  const coinPlie = u > 0.6 && v < 0.2 + (u - 0.6);
  if (!(u > 0.28 && u < 0.72 && v > 0.2 && v < 0.8) || coinPlie) return VERT;
  const texte = u > 0.36 && u < 0.64 && [0.4, 0.5, 0.6, 0.7].some((l) => Math.abs(v - l) < 0.015);
  return texte ? VERT_CLAIR : BLANC;
}

mkdirSync('public', { recursive: true });
for (const [nom, taille] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/${nom}`, png(taille, dessin));
  console.log(`public/${nom}`);
}
