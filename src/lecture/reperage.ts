import type { CV } from '../traitement/opencv';
import type { Img } from '../traitement/types';
import type { Quad } from './modele';
import { enRangees } from './ordre';

/** Le repérage travaille sur une image réduite : bien plus rapide, et assez fin pour trouver les lignes. */
export const COTE_REPERAGE = 1600;
const MOYENNE = [0.485, 0.456, 0.406];
const ECART = [0.229, 0.224, 0.225];
/** Réglages de PaddleOCR : une case compte comme texte au-dessus de 0,3 ; une boîte est gardée si sa moyenne dépasse 0,6. */
const SEUIL = 0.3;
const SEUIL_BOITE = 0.6;
/** Le modèle repère le cœur des lettres : la boîte est élargie (« unclip » de PaddleOCR). */
const ELARGISSEMENT = 1.5;
const COTE_MIN = 3;

export interface BoiteReperee { quad: Quad; score: number }

/** Entrée du repérage : image réduite, côtés multiples de 32, ordre BGR normalisé, 1 × 3 × H × W. */
export function preparerReperage(cv: CV, img: Img, coteMax = COTE_REPERAGE): { donnees: Float32Array; largeur: number; hauteur: number } {
  const f = Math.min(1, coteMax / Math.max(img.width, img.height));
  const largeur = Math.max(32, Math.round((img.width * f) / 32) * 32);
  const hauteur = Math.max(32, Math.round((img.height * f) / 32) * 32);
  const src = cv.matFromImageData(img);
  const petit = new cv.Mat();
  try {
    cv.resize(src, petit, new cv.Size(largeur, hauteur), 0, 0, cv.INTER_AREA);
    const n = largeur * hauteur;
    const d = petit.data as Uint8Array;
    const donnees = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      donnees[i] = (d[i * 4 + 2] / 255 - MOYENNE[0]) / ECART[0];
      donnees[n + i] = (d[i * 4 + 1] / 255 - MOYENNE[1]) / ECART[1];
      donnees[2 * n + i] = (d[i * 4] / 255 - MOYENNE[2]) / ECART[2];
    }
    return { donnees, largeur, hauteur };
  } finally {
    src.delete();
    petit.delete();
  }
}

/** Ordre d'un quadrilatère : haut-gauche, haut-droite, bas-droite, bas-gauche. */
export function ordonnerQuad(p: [number, number][]): Quad {
  const s = [...p].sort((a, b) => a[0] - b[0]);
  const [g1, g2] = s[0][1] <= s[1][1] ? [s[0], s[1]] : [s[1], s[0]];
  const [d1, d2] = s[2][1] <= s[3][1] ? [s[2], s[3]] : [s[3], s[2]];
  return [g1, d1, d2, g2];
}

/** Carte de probabilité du modèle (h × w) → boîtes des lignes dans l'image d'origine, dans l'ordre de lecture. */
export function boitesDepuisCarte(cv: CV, carte: Float32Array, h: number, w: number, largeur: number, hauteur: number): BoiteReperee[] {
  const masque = new Uint8Array(h * w);
  for (let i = 0; i < masque.length; i++) masque[i] = carte[i] > SEUIL ? 255 : 0;
  const bm = cv.matFromArray(h, w, cv.CV_8UC1, masque);
  const contours = new cv.MatVector();
  const hierarchie = new cv.Mat();
  const boites: BoiteReperee[] = [];
  const fx = largeur / w;
  const fy = hauteur / h;
  try {
    cv.findContours(bm, contours, hierarchie, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let k = 0; k < contours.size(); k++) {
      const c = contours.get(k);
      const rect = c.rows >= 4 ? cv.minAreaRect(c) : null;
      c.delete();
      if (!rect || Math.min(rect.size.width, rect.size.height) < COTE_MIN) continue;
      const coeur = ordonnerQuad(cv.RotatedRect.points(rect).map((p: { x: number; y: number }) => [p.x, p.y] as [number, number]));
      const score = moyenneDans(cv, carte, h, w, coeur);
      if (score < SEUIL_BOITE) continue;
      const d = (rect.size.width * rect.size.height * ELARGISSEMENT) / (2 * (rect.size.width + rect.size.height));
      const grand = new cv.RotatedRect(rect.center, new cv.Size(rect.size.width + 2 * d, rect.size.height + 2 * d), rect.angle);
      const quad = ordonnerQuad(cv.RotatedRect.points(grand).map((p: { x: number; y: number }) => [
        Math.min(largeur, Math.max(0, p.x * fx)),
        Math.min(hauteur, Math.max(0, p.y * fy)),
      ] as [number, number]));
      boites.push({ quad, score });
    }
  } finally {
    bm.delete();
    contours.delete();
    hierarchie.delete();
  }
  return enRangees(boites, ({ quad }) => {
    const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), largeur: Math.max(...xs) - Math.min(...xs), hauteur: Math.max(...ys) - Math.min(...ys) };
  }).flat();
}

/** Moyenne de la carte à l'intérieur d'un quadrilatère. */
function moyenneDans(cv: CV, carte: Float32Array, h: number, w: number, q: Quad): number {
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  if (x1 < x0 || y1 < y0) return 0;
  const lw = x1 - x0 + 1;
  const m = cv.Mat.zeros(y1 - y0 + 1, lw, cv.CV_8UC1);
  const poly = cv.matFromArray(4, 1, cv.CV_32SC2, q.flatMap((p) => [Math.round(p[0] - x0), Math.round(p[1] - y0)]));
  const polys = new cv.MatVector();
  polys.push_back(poly);
  try {
    cv.fillPoly(m, polys, new cv.Scalar(1));
    const d = m.data as Uint8Array;
    let s = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (d[(y - y0) * lw + (x - x0)]) { s += carte[y * w + x]; n++; }
    }
    return n ? s / n : 0;
  } finally {
    m.delete();
    poly.delete();
    polys.delete();
  }
}
