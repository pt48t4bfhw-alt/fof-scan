// Fabrique tests/aides/feuille-synthetique.jpg : une feuille ombrée, de travers, sur une table sombre.
import jpeg from 'jpeg-js';
import { writeFileSync } from 'node:fs';

const L = 1200, H = 900;
const feuille = [[180, 120], [1010, 160], [1060, 820], [140, 780]];
const data = Buffer.alloc(L * H * 4);

function dedans(x, y) {
  let d = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, yi] = feuille[i], [xj, yj] = feuille[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
  let v = 70 + ((x * 7 + y * 13) % 17); // table sombre, un peu texturée
  if (dedans(x, y)) {
    v = 225 - Math.round((60 * x) / L); // papier avec une ombre
    if (y % 60 < 4 && x > 260 && x < 960 && y > 200 && y < 760) v = 30; // lignes de texte
  }
  const i = (y * L + x) * 4;
  data[i] = v; data[i + 1] = v; data[i + 2] = Math.min(255, v + 5); data[i + 3] = 255;
}

writeFileSync('tests/aides/feuille-synthetique.jpg', jpeg.encode({ data, width: L, height: H }, 90).data);
console.log('tests/aides/feuille-synthetique.jpg écrit');
