import { versImg } from '../../src/traitement/mats';
import type { CV } from '../../src/traitement/opencv';
import type { Img } from '../../src/traitement/types';

export type Trait = [number, number, number, number];

/** Page blanche avec des traits noirs de 3 px : [x1, y1, x2, y2]. */
export function pageAvecTraits(cv: CV, largeur: number, hauteur: number, traits: Trait[]): Img {
  const m = new cv.Mat(hauteur, largeur, cv.CV_8UC4, new cv.Scalar(255, 255, 255, 255));
  for (const [x1, y1, x2, y2] of traits) cv.line(m, new cv.Point(x1, y1), new cv.Point(x2, y2), new cv.Scalar(0, 0, 0, 255), 3);
  const img = versImg(cv, m);
  m.delete();
  return img;
}

/** Tableau 3 rangées × 2 colonnes (cadre 100–500 × 100–400) dont la première rangée est une case fusionnée. */
export const TABLEAU: Trait[] = [
  [100, 100, 500, 100], [100, 200, 500, 200], [100, 300, 500, 300], [100, 400, 500, 400],
  [100, 100, 100, 400], [500, 100, 500, 400], [300, 200, 300, 400],
];
