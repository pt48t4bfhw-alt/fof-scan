import { ordonnerCoins } from './geometrie';
import type { CV } from './opencv';
import type { Coins, Img, Point } from './types';

/** Une feuille doit couvrir au moins 12 % de l'image. */
const AIRE_MIN = 0.12;
/** Nombre de grandes droites gardées : assez pour trouver la feuille, assez peu pour rester rapide. */
const LIGNES_MAX = 16;

/**
 * Trouve la feuille. Méthode principale : les bords d'une feuille sont de grandes droites ;
 * on garde le quadrilatère dont les côtés suivent le mieux de vrais bords. Repli : le plus
 * grand contour à 4 côtés (cas simple d'une feuille claire sur un fond uni).
 */
export function detecterCoins(cv: CV, img: Img): Coins | null {
  return detecterParLignes(cv, img) ?? detecterParContour(cv, img);
}

interface Droite { r: number; t: number; long: number; cadre?: boolean }

function detecterParLignes(cv: CV, img: Img): Coins | null {
  const W = img.width, H = img.height, aireImg = W * H;
  const bords = carteBords(cv, img);
  const large = new cv.Mat();
  const n5 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const segments = new cv.Mat();
  try {
    cv.dilate(bords, large, n5);
    cv.HoughLinesP(bords, segments, 1, Math.PI / 180, 50, Math.min(W, H) * 0.15, 20);
    const droites = fusionnerSegments(segments).slice(0, LIGNES_MAX);
    // les bords de la photo servent quand la feuille dépasse du cadre
    const cadre: Droite[] = [
      { r: 0, t: 0, long: 0, cadre: true }, { r: W - 1, t: 0, long: 0, cadre: true },
      { r: 0, t: Math.PI / 2, long: 0, cadre: true }, { r: H - 1, t: Math.PI / 2, long: 0, cadre: true },
    ];
    const toutes = [...droites, ...cadre];
    let meilleur: { q: Coins; score: number } | null = null;
    for (let i = 0; i < toutes.length; i++) for (let j = i + 1; j < toutes.length; j++) {
      const a1 = toutes[i], a2 = toutes[j];
      if (ecartAngle(a1, a2) > 0.35) continue; // une paire presque parallèle…
      for (let k = 0; k < toutes.length; k++) for (let m = k + 1; m < toutes.length; m++) {
        const b1 = toutes[k], b2 = toutes[m];
        if (ecartAngle(b1, b2) > 0.35 || ecartAngle(a1, b1) < 0.9) continue; // …et l'autre, à peu près perpendiculaire
        if ([a1, a2, b1, b2].filter((d) => d.cadre).length > 3) continue;
        const sommets = [intersection(a1, b1), intersection(a1, b2), intersection(a2, b2), intersection(a2, b1)];
        if (sommets.some((p) => !p || p.x < -0.03 * W || p.x > 1.03 * W || p.y < -0.03 * H || p.y > 1.03 * H)) continue;
        const q = ordonnerCoins((sommets as Point[]).map((p) => ({ x: borner(p.x, 0, W - 1), y: borner(p.y, 0, H - 1) })));
        const aq = aire(q);
        if (aq < AIRE_MIN * aireImg || !anglesRaisonnables(q)) continue;
        // chaque côté réel doit suivre un bord ; un côté posé sur le cadre n'a pas de bord à suivre
        const reels = [0, 1, 2, 3].map((c) => [q[c], q[(c + 1) % 4]] as const).filter(([a, b]) => !surCadre(a, b, W, H));
        if (!reels.length) continue;
        const soutiens = reels.map(([a, b]) => soutienCote(large, a, b, W, H));
        const min = Math.min(...soutiens);
        const moy = soutiens.reduce((s, x) => s + x, 0) / soutiens.length;
        if (min < 0.4 || moy < 0.6) continue;
        const score = moy * moy * Math.sqrt(aq / aireImg) * (1 - 0.25 * (4 - reels.length));
        if (!meilleur || score > meilleur.score) meilleur = { q, score };
      }
    }
    return meilleur?.q ?? null;
  } finally {
    bords.delete(); large.delete(); n5.delete(); segments.delete();
  }
}

/**
 * Carte des bords nets pour l'aimantation du recadrage : celle de la détection, élargie de 2 px
 * de chaque côté (un contour posé à la main ou par l'IA tombe souvent 1 à 3 px à côté du trait ;
 * l'aimant prend ensuite le milieu de la bande, la précision est gardée).
 */
export function masqueDesBords(cv: CV, img: Img): { data: Uint8Array; largeur: number; hauteur: number } {
  const bords = carteBords(cv, img, 160);
  const noyau = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  try {
    cv.dilate(bords, bords, noyau);
    return { data: new Uint8Array(bords.data), largeur: img.width, hauteur: img.height };
  } finally {
    bords.delete(); noyau.delete();
  }
}

/**
 * Bords de l'image : texte effacé par une fermeture, puis Canny sur chaque canal (papier coloré compris).
 * La fermeture efface aussi toute bande sombre plus étroite qu'elle : `finesse` la règle (1/60 de la
 * photo pour la détection ; plus fine pour l'aimant, qui doit voir le bord d'un reçu collé à une couverture).
 */
function carteBords(cv: CV, img: Img, finesse = 60): CV {
  const W = img.width, H = img.height;
  const src = cv.matFromImageData(img);
  const rgb = new cv.Mat();
  const ferme = new cv.Mat();
  const k = Math.max(5, Math.round(Math.max(W, H) / finesse)) | 1;
  const noyau = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k));
  const canaux = new cv.MatVector();
  const bords = cv.Mat.zeros(H, W, cv.CV_8U);
  try {
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.morphologyEx(rgb, ferme, cv.MORPH_CLOSE, noyau);
    cv.GaussianBlur(ferme, ferme, new cv.Size(5, 5), 0);
    cv.split(ferme, canaux);
    for (let i = 0; i < 3; i++) {
      const canal = canaux.get(i);
      const e = new cv.Mat();
      cv.Canny(canal, e, 20, 60);
      cv.bitwise_or(bords, e, bords);
      canal.delete(); e.delete();
    }
    return bords;
  } finally {
    src.delete(); rgb.delete(); ferme.delete(); noyau.delete(); canaux.delete();
  }
}

/** Segments de Hough → droites (forme x·cos t + y·sin t = r), doublons fusionnés, les plus longues d'abord. */
function fusionnerSegments(segments: CV): Droite[] {
  const droites: Droite[] = [];
  for (let i = 0; i < segments.rows; i++) {
    const [x1, y1, x2, y2] = segments.data32S.slice(i * 4, i * 4 + 4);
    let t = Math.atan2(x2 - x1, -(y2 - y1));
    let r = x1 * Math.cos(t) + y1 * Math.sin(t);
    if (r < 0) { r = -r; t += Math.PI; }
    t = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const long = Math.hypot(x2 - x1, y2 - y1);
    const proche = droites.find((d) => Math.abs(d.r - r) < 12 && Math.min(Math.abs(d.t - t), 2 * Math.PI - Math.abs(d.t - t)) < 0.06);
    if (proche) proche.long += long; else droites.push({ r, t, long });
  }
  return droites.sort((a, b) => b.long - a.long);
}

const direction = (d: Droite) => ((d.t % Math.PI) + Math.PI) % Math.PI;
function ecartAngle(a: Droite, b: Droite): number {
  const e = Math.abs(direction(a) - direction(b));
  return Math.min(e, Math.PI - e);
}

function intersection(a: Droite, b: Droite): Point | null {
  const d = Math.cos(a.t) * Math.sin(b.t) - Math.sin(a.t) * Math.cos(b.t);
  if (Math.abs(d) < 1e-6) return null;
  return {
    x: (a.r * Math.sin(b.t) - b.r * Math.sin(a.t)) / d,
    y: (b.r * Math.cos(a.t) - a.r * Math.cos(b.t)) / d,
  };
}

const borner = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function aire(q: Coins): number {
  let s = 0;
  for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

/** Une feuille vue en perspective garde des angles entre 50° et 130°. */
function anglesRaisonnables(q: Coins): boolean {
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
    const deg = (Math.acos(borner(cos, -1, 1)) * 180) / Math.PI;
    if (deg < 50 || deg > 130) return false;
  }
  return true;
}

const surCadre = (a: Point, b: Point, W: number, H: number) =>
  (Math.abs(a.x - b.x) < 2 && (a.x < 2 || a.x > W - 3)) || (Math.abs(a.y - b.y) < 2 && (a.y < 2 || a.y > H - 3));

/** Part d'un côté qui tombe sur un bord réel (carte des bords élargie pour tolérer 2 px d'écart). */
function soutienCote(large: CV, a: Point, b: Point, W: number, H: number): number {
  const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 3));
  let sur = 0;
  for (let t = 0; t <= n; t++) {
    const x = Math.round(a.x + ((b.x - a.x) * t) / n), y = Math.round(a.y + ((b.y - a.y) * t) / n);
    if (x >= 0 && y >= 0 && x < W && y < H && large.ucharPtr(y, x)[0]) sur++;
  }
  return sur / (n + 1);
}

/** Repli : le plus grand contour qui s'approche par 4 points. */
function detecterParContour(cv: CV, img: Img): Coins | null {
  const src = cv.matFromImageData(img);
  const gris = new cv.Mat();
  const bords = new cv.Mat();
  const noyau = cv.Mat.ones(5, 5, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchie = new cv.Mat();
  try {
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gris, gris, new cv.Size(5, 5), 0);
    cv.Canny(gris, bords, 50, 150);
    cv.dilate(bords, bords, noyau);
    cv.findContours(bords, contours, hierarchie, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const aireImage = img.width * img.height;
    let meilleur: Coins | null = null;
    let meilleureAire = 0;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      try {
        const a = cv.contourArea(contour);
        if (a < 0.15 * aireImage || a <= meilleureAire) continue;
        cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
        if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
        const points: Point[] = [];
        for (let k = 0; k < 4; k++) points.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
        meilleur = ordonnerCoins(points);
        meilleureAire = a;
      } finally {
        contour.delete();
        approx.delete();
      }
    }
    return meilleur;
  } finally {
    src.delete(); gris.delete(); bords.delete(); noyau.delete(); contours.delete(); hierarchie.delete();
  }
}
