import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { describe, it } from 'vitest';
import { MODES } from '../src/ecrans/modes';
import { appliquerFiltre } from '../src/traitement/filtres';
import { versImg } from '../src/traitement/mats';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';

/** Pages déjà recadrées (extraites des PDF de l'iPhone), dans le dossier local non publié. */
const DOSSIER = 'tests/photos/pdf-iphone';
const pages = existsSync(DOSSIER) ? readdirSync(DOSSIER).filter((f) => /\.jpe?g$/i.test(f)) : [];

describe.skipIf(pages.length === 0)('planche des 5 modes (dossier local, non publié)', () => {
  it('écrit une planche par page, à contrôler à l\'œil', async () => {
    const { cv } = await chargerOpenCV();
    // la planche part de la page exportée en « Original » (variable PAGE, sinon la dernière du dossier)
    for (const nom of [process.env.PAGE ?? pages[pages.length - 1]]) {
      const b = jpeg.decode(readFileSync(`${DOSSIER}/${nom}`), { useTArray: true, maxMemoryUsageInMB: 2048 });
      const img = { data: new Uint8ClampedArray(b.data.buffer), width: b.width, height: b.height };
      const cases: CV[] = MODES.map(({ filtre, nom: titre }) => {
        const rendu = appliquerFiltre(cv, img, filtre);
        const m = cv.matFromImageData(rendu);
        const petit = new cv.Mat();
        cv.resize(m, petit, new cv.Size(440, Math.round((m.rows * 440) / m.cols)), 0, 0, cv.INTER_AREA);
        const bandeau = new cv.Mat(50, 440, cv.CV_8UC4, new cv.Scalar(20, 60, 40, 255));
        cv.putText(bandeau, titre.replace('É', 'E'), new cv.Point(12, 35), cv.FONT_HERSHEY_SIMPLEX, 0.95, new cv.Scalar(255, 255, 255, 255), 2);
        const v = new cv.MatVector(); v.push_back(bandeau); v.push_back(petit);
        const c = new cv.Mat(); cv.vconcat(v, c);
        m.delete(); petit.delete(); bandeau.delete(); v.delete();
        return c;
      });
      const ligne = new cv.MatVector(); cases.forEach((c) => ligne.push_back(c));
      const planche = new cv.Mat(); cv.hconcat(ligne, planche);
      const sortie = versImg(cv, planche);
      writeFileSync('tests/photos/resultats/planche-modes.jpg', jpeg.encode({ data: Buffer.from(sortie.data.buffer), width: sortie.width, height: sortie.height }, 85).data);
      [...cases, planche].forEach((m) => m.delete()); ligne.delete();
    }
  });
});
