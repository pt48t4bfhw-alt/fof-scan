import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { describe, it } from 'vitest';
import { detecterCoins } from '../src/traitement/detection';
import { appliquerFiltre } from '../src/traitement/filtres';
import { versImg } from '../src/traitement/mats';
import { chargerOpenCV } from '../src/traitement/opencv';
import { redresser } from '../src/traitement/redressement';
import type { Img } from '../src/traitement/types';

const DOSSIER = 'tests/photos';
const SORTIE = `${DOSSIER}/resultats`;
const photos = existsSync(DOSSIER) ? readdirSync(DOSSIER).filter((f) => /\.jpe?g$/i.test(f)) : [];

const ecrire = (chemin: string, img: Img) =>
  writeFileSync(chemin, jpeg.encode({ data: Buffer.from(img.data.buffer), width: img.width, height: img.height }, 85).data);

describe.skipIf(photos.length === 0)('photos réelles (dossier local, non publié)', () => {
  it('détecte la feuille et écrit des aperçus à contrôler à l\'œil', async () => {
    const { cv } = await chargerOpenCV();
    mkdirSync(SORTIE, { recursive: true });
    let trouvees = 0;
    for (const f of photos) {
      const brut = jpeg.decode(readFileSync(`${DOSSIER}/${f}`), { useTArray: true, maxMemoryUsageInMB: 2048 });
      const src = cv.matFromImageData({ data: brut.data, width: brut.width, height: brut.height });
      const petit = new cv.Mat();
      const facteur = Math.min(1, 1000 / Math.max(brut.width, brut.height));
      cv.resize(src, petit, new cv.Size(Math.round(brut.width * facteur), Math.round(brut.height * facteur)), 0, 0, cv.INTER_AREA);
      const img = versImg(cv, petit);
      const coins = detecterCoins(cv, img);
      if (coins) {
        trouvees++;
        for (let k = 0; k < 4; k++) {
          const a = coins[k], b = coins[(k + 1) % 4];
          cv.line(petit, new cv.Point(a.x, a.y), new cv.Point(b.x, b.y), new cv.Scalar(0, 255, 0, 255), 4);
        }
        ecrire(`${SORTIE}/${f}-ameliore.jpg`, appliquerFiltre(cv, redresser(cv, img, coins, 0), 'ameliore'));
      }
      ecrire(`${SORTIE}/${f}-contour.jpg`, versImg(cv, petit));
      src.delete(); petit.delete();
      console.log(`${f} : ${coins ? 'feuille trouvée' : 'NON détectée'}`);
    }
    console.log(`Bilan : ${trouvees}/${photos.length} détectées`);
  });
});
