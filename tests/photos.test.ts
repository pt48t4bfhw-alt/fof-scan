import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { describe, it } from 'vitest';
import { detecterCoins } from '../src/traitement/detection';
import { appliquerFiltre } from '../src/traitement/filtres';
import { versImg } from '../src/traitement/mats';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { redresser } from '../src/traitement/redressement';
import type { Img } from '../src/traitement/types';

const DOSSIER = 'tests/photos';
const SORTIE = `${DOSSIER}/resultats`;

/** Photos JPEG du dossier local (sous-dossiers compris), sauf les résultats et les pages déjà traitées. */
function trouverPhotos(dossier: string): string[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = `${dossier}/${nom}`;
    if (statSync(chemin).isDirectory()) return nom === 'resultats' ? [] : trouverPhotos(chemin);
    return /\.jpe?g$/i.test(nom) && !/traitee/i.test(nom) ? [chemin] : [];
  });
}
const photos = trouverPhotos(DOSSIER);

const ecrire = (chemin: string, img: Img) =>
  writeFileSync(chemin, jpeg.encode({ data: Buffer.from(img.data.buffer), width: img.width, height: img.height }, 85).data);

function reduire(cv: CV, src: CV, cote: number): CV {
  const f = Math.min(1, cote / Math.max(src.cols, src.rows));
  const petit = new cv.Mat();
  cv.resize(src, petit, new cv.Size(Math.round(src.cols * f), Math.round(src.rows * f)), 0, 0, cv.INTER_AREA);
  return petit;
}

describe.skipIf(photos.length === 0)('photos réelles (dossier local, non publié)', () => {
  it('détecte la feuille et écrit des aperçus à contrôler à l\'œil', async () => {
    const { cv } = await chargerOpenCV();
    mkdirSync(SORTIE, { recursive: true });
    const vignettes: CV[] = [];
    for (const chemin of photos) {
      const nom = chemin.split('/').pop()!.replace(/\.jpe?g$/i, '');
      const brut = jpeg.decode(readFileSync(chemin), { useTArray: true, maxMemoryUsageInMB: 2048 });
      const src = cv.matFromImageData({ data: brut.data, width: brut.width, height: brut.height });
      const lignes: string[] = [];
      for (const cote of [1000, 480]) {
        const petit = reduire(cv, src, cote);
        const img = versImg(cv, petit);
        const t0 = Date.now();
        const coins = detecterCoins(cv, img);
        lignes.push(`${cote} px : ${coins ? 'trouvée' : 'NON'} en ${Date.now() - t0} ms`);
        if (cote === 1000) {
          if (coins) {
            for (let k = 0; k < 4; k++) {
              const a = coins[k], b = coins[(k + 1) % 4];
              cv.line(petit, new cv.Point(a.x, a.y), new cv.Point(b.x, b.y), new cv.Scalar(0, 220, 0, 255), 5);
            }
            ecrire(`${SORTIE}/${nom}-ameliore.jpg`, appliquerFiltre(cv, redresser(cv, img, coins, 0), 'ameliore'));
          }
          const v = new cv.Mat();
          cv.resize(petit, v, new cv.Size(Math.round((petit.cols * 400) / petit.rows), 400), 0, 0, cv.INTER_AREA);
          vignettes.push(v);
        }
        petit.delete();
      }
      src.delete();
      console.log(`${nom} : ${lignes.join(' | ')}`);
    }
    const ligne = new cv.MatVector();
    vignettes.forEach((v) => ligne.push_back(v));
    const planche = new cv.Mat();
    cv.hconcat(ligne, planche);
    ecrire(`${SORTIE}/planche-detection.jpg`, versImg(cv, planche));
    [...vignettes, planche].forEach((m) => m.delete());
    ligne.delete();
  });
});
