import { ordonnerCoins } from './geometrie';
import type { CV } from './opencv';
import type { Coins, Img, Point } from './types';

/**
 * Détection de la feuille par le modèle DocAligner (DocsaidLab, Apache-2.0) : il reçoit la photo
 * en 256 × 256 et rend une carte de chaleur par coin (haut-gauche, haut-droite, bas-droite, bas-gauche).
 */
export const TAILLE_ENTREE = 256;
/** Comme DocAligner : une case de carte compte comme « coin » au-dessus de 0,3. */
const SEUIL_CARTE = 0.3;
/** En dessous, le modèle n'est pas assez sûr : on laisse la méthode classique décider. */
const CONFIANCE_MIN = 0.4;
/** Une feuille doit couvrir au moins 10 % de la photo. */
const AIRE_MIN = 0.1;

/** Position de la photo dans le carré complété (marges grises). */
export interface Carre { x: number; y: number; cote: number }

/**
 * Complète la photo en carré avec des marges grises puis la réduit à 256 × 256.
 * Écraser une photo 9:16 en carré déforme la feuille au point que le modèle ne la reconnaît plus.
 */
export function preparerEntree(cv: CV, img: Img): { donnees: Float32Array; carre: Carre } {
  const cote = Math.max(img.width, img.height);
  const carre = { x: Math.floor((cote - img.width) / 2), y: Math.floor((cote - img.height) / 2), cote };
  const src = cv.matFromImageData(img);
  const complete = new cv.Mat();
  const petit = new cv.Mat();
  try {
    cv.copyMakeBorder(src, complete, carre.y, cote - img.height - carre.y, carre.x, cote - img.width - carre.x,
      cv.BORDER_CONSTANT, new cv.Scalar(127, 127, 127, 255));
    cv.resize(complete, petit, new cv.Size(TAILLE_ENTREE, TAILLE_ENTREE), 0, 0, cv.INTER_AREA);
    const n = TAILLE_ENTREE * TAILLE_ENTREE;
    const donnees = new Float32Array(3 * n);
    const d = petit.data as Uint8Array;
    for (let i = 0; i < n; i++) {
      donnees[i] = d[i * 4] / 255;
      donnees[n + i] = d[i * 4 + 1] / 255;
      donnees[2 * n + i] = d[i * 4 + 2] / 255;
    }
    return { donnees, carre };
  } finally {
    src.delete(); complete.delete(); petit.delete();
  }
}

/**
 * Cartes de chaleur (4 × h × w) → 4 coins dans la photo d'origine. Pour chaque carte : seuil,
 * plus grande tache, son centre. Renvoie null si un coin manque, si le modèle hésite ou si la
 * forme obtenue est trop petite.
 */
export function coinsDepuisCartes(
  cv: CV, cartes: Float32Array, h: number, w: number, carre: Carre, largeur: number, hauteur: number,
): { coins: Coins; confiance: number } | null {
  const points: Point[] = [];
  let confiance = 1;
  for (let k = 0; k < 4; k++) {
    const carte = cartes.subarray(k * h * w, (k + 1) * h * w);
    let pic = 0;
    for (let i = 0; i < carte.length; i++) if (carte[i] > pic) pic = carte[i];
    confiance = Math.min(confiance, pic);
    if (pic < CONFIANCE_MIN) return null;
    const centre = centreDeLaPlusGrandeTache(cv, carte, h, w);
    if (!centre) return null;
    points.push({
      x: Math.min(Math.max((centre.x * carre.cote) / w - carre.x, 0), largeur),
      y: Math.min(Math.max((centre.y * carre.cote) / h - carre.y, 0), hauteur),
    });
  }
  const coins = ordonnerCoins(points);
  if (aire(coins) < AIRE_MIN * largeur * hauteur) return null;
  return { coins, confiance };
}

function centreDeLaPlusGrandeTache(cv: CV, carte: Float32Array, h: number, w: number): Point | null {
  const mat = new cv.Mat(h, w, cv.CV_32F);
  const masque = new cv.Mat();
  const masque8 = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchie = new cv.Mat();
  try {
    (mat.data32F as Float32Array).set(carte);
    cv.threshold(mat, masque, SEUIL_CARTE, 255, cv.THRESH_BINARY);
    masque.convertTo(masque8, cv.CV_8U);
    cv.findContours(masque8, contours, hierarchie, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let meilleur: Point | null = null;
    let aireMax = -1;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const m = cv.moments(c);
      const a = cv.contourArea(c);
      if (m.m00 > 0 && a > aireMax) { aireMax = a; meilleur = { x: m.m10 / m.m00, y: m.m01 / m.m00 }; }
      c.delete();
    }
    return meilleur;
  } finally {
    mat.delete(); masque.delete(); masque8.delete(); contours.delete(); hierarchie.delete();
  }
}

function aire(q: Coins): number {
  let s = 0;
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Le moteur onnxruntime (version web dans l'appli, version Node dans les tests). */
type Ort = any;

/** Le modèle chargé, prêt à détecter. Les analyses passent une par une (le moteur n'en fait qu'une à la fois). */
export class DetecteurIA {
  private file: Promise<unknown> = Promise.resolve();

  private constructor(private ort: Ort, private session: any) {}

  static async creer(ort: Ort, modele: Uint8Array): Promise<DetecteurIA> {
    const session = await ort.InferenceSession.create(modele, { executionProviders: ['wasm'] });
    return new DetecteurIA(ort, session);
  }

  detecter(cv: CV, img: Img): Promise<Coins | null> {
    const tache = this.file.then(async () => {
      const { donnees, carre } = preparerEntree(cv, img);
      const entree = new this.ort.Tensor('float32', donnees, [1, 3, TAILLE_ENTREE, TAILLE_ENTREE]);
      const sorties = await this.session.run({ [this.session.inputNames[0]]: entree });
      const cartes = sorties[this.session.outputNames[0]];
      const [, , h, w] = cartes.dims as number[];
      return coinsDepuisCartes(cv, cartes.data as Float32Array, h, w, carre, img.width, img.height)?.coins ?? null;
    });
    this.file = tache.catch(() => undefined);
    return tache;
  }
}
