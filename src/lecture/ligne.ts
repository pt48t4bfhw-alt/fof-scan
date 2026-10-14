import type { CV } from '../traitement/opencv';
import type { Quad } from './modele';

export const HAUTEUR_LIGNE = 48;
const LARGEUR_MIN = 320;
const LARGEUR_MAX = 3200;

const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Découpe redressée d'une ligne dans l'image (RGBA). Une découpe bien plus haute que large est couchée : on la tourne. */
export function decouperLigne(cv: CV, src: CV, q: Quad): CV {
  const l = Math.max(1, Math.floor(Math.max(distance(q[0], q[1]), distance(q[3], q[2]))));
  const h = Math.max(1, Math.floor(Math.max(distance(q[0], q[3]), distance(q[1], q[2]))));
  const de = cv.matFromArray(4, 1, cv.CV_32FC2, q.flat());
  const vers = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, l, 0, l, h, 0, h]);
  const M = cv.getPerspectiveTransform(de, vers);
  const sortie = new cv.Mat();
  try {
    cv.warpPerspective(src, sortie, M, new cv.Size(l, h), cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
  } finally {
    de.delete();
    vers.delete();
    M.delete();
  }
  if (sortie.rows / sortie.cols < 1.5) return sortie;
  const couchee = new cv.Mat();
  cv.rotate(sortie, couchee, cv.ROTATE_90_COUNTERCLOCKWISE);
  sortie.delete();
  return couchee;
}

/**
 * Entrée du lecteur : hauteur 48, largeur proportionnelle (au moins 320, complétée de zéros comme
 * dans PaddleOCR), ordre BGR ramené de [0, 255] à [−1, 1].
 */
export function preparerLigne(cv: CV, ligne: CV): { donnees: Float32Array; largeur: number } {
  const voulue = Math.ceil((HAUTEUR_LIGNE * ligne.cols) / Math.max(1, ligne.rows));
  const largeur = Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, voulue));
  const utile = Math.max(1, Math.min(largeur, voulue));
  const r = new cv.Mat();
  try {
    cv.resize(ligne, r, new cv.Size(utile, HAUTEUR_LIGNE), 0, 0, cv.INTER_LINEAR);
    const d = r.data as Uint8Array;
    const plan = HAUTEUR_LIGNE * largeur;
    const donnees = new Float32Array(3 * plan);
    for (let y = 0; y < HAUTEUR_LIGNE; y++) {
      for (let x = 0; x < utile; x++) {
        const i = (y * utile + x) * 4;
        const j = y * largeur + x;
        donnees[j] = d[i + 2] / 127.5 - 1;
        donnees[plan + j] = d[i + 1] / 127.5 - 1;
        donnees[2 * plan + j] = d[i] / 127.5 - 1;
      }
    }
    return { donnees, largeur };
  } finally {
    r.delete();
  }
}
