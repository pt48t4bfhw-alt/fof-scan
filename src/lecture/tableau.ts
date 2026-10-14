import type { CV } from '../traitement/opencv';
import type { Img } from '../traitement/types';
import type { CaseTableau, LigneLue, ModeLecture, Rect, Tableau } from './modele';
import { enRangees } from './ordre';

/** Au-delà, ce sont des carreaux de cahier, pas un tableau. */
const MAX_CASES = 200;
/** Un vrai tableau a au moins 30 % de cases remplies. */
const PART_PLEINE_MIN = 0.3;
const CASES_MIN = 4;
/** Le tableau couvre au moins 3 % de la page. */
const AIRE_MIN = 0.03;
const COTE_CASE_MIN = 12;
const MARGE = 4;
/** Deux bords plus proches que ça sont le même trait (un trait traité fait ~7 px d'épaisseur). */
const tolerance = (largeurPage: number) => Math.max(12, 0.01 * largeurPage);

/** Cases d'un tableau à traits (texte vide), ou null s'il n'y en a pas. */
export function trouverTableau(cv: CV, img: Img): Tableau | null {
  const W = img.width, H = img.height;
  const mats: CV[] = [];
  const garder = <T>(m: T): T => { mats.push(m); return m; };
  try {
    const src = garder(cv.matFromImageData(img));
    const gris = garder(new cv.Mat());
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);
    const encre = garder(new cv.Mat());
    cv.adaptiveThreshold(gris, encre, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 15, 10);
    const horizontaux = longsTraits(cv, encre, Math.max(20, Math.round(W / 40)), 1, garder);
    const verticaux = longsTraits(cv, encre, 1, Math.max(20, Math.round(H / 40)), garder);
    const grille = garder(new cv.Mat());
    cv.bitwise_or(horizontaux, verticaux, grille);
    const k3 = garder(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    cv.dilate(grille, grille, k3);
    // cadre autour de la page : une case coupée par le bord de la photo reste fermée
    cv.rectangle(grille, new cv.Point(0, 0), new cv.Point(W - 1, H - 1), new cv.Scalar(255), 3);
    const vide = garder(new cv.Mat());
    cv.bitwise_not(grille, vide);
    const etiquettes = garder(new cv.Mat()), stats = garder(new cv.Mat()), centres = garder(new cv.Mat());
    const n = cv.connectedComponentsWithStats(vide, etiquettes, stats, centres, 4, cv.CV_32S);
    const rects: Rect[] = [];
    for (let k = 1; k < n; k++) {
      const x = stats.intAt(k, 0), y = stats.intAt(k, 1), l = stats.intAt(k, 2), h = stats.intAt(k, 3), aire = stats.intAt(k, 4);
      if (l < COTE_CASE_MIN || h < COTE_CASE_MIN) continue;
      if (l > 0.9 * W && h > 0.9 * H) continue; // le fond de la page
      if (aire < 0.85 * l * h) continue; // pas un rectangle : le fond autour du tableau
      rects.push({ x, y, largeur: l, hauteur: h });
    }
    return tableauDepuisCases(plusGrandGroupe(rects, tolerance(W)), W, H);
  } finally {
    mats.forEach((m) => m.delete());
  }
}

/** Seuls les longs segments (l × h) de l'encre, épaissie d'un pixel pour une photo un peu de travers. */
function longsTraits(cv: CV, encre: CV, l: number, h: number, garder: <T>(m: T) => T): CV {
  const epais = garder(new cv.Mat());
  const sortie = garder(new cv.Mat());
  const k1 = garder(cv.getStructuringElement(cv.MORPH_RECT, l > 1 ? new cv.Size(1, 3) : new cv.Size(3, 1)));
  const k2 = garder(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(l, h)));
  cv.dilate(encre, epais, k1);
  cv.morphologyEx(epais, sortie, cv.MORPH_OPEN, k2);
  return sortie;
}

/** Le plus grand groupe (en surface) de cases qui se touchent, à `tol` pixels près. */
export function plusGrandGroupe(rects: Rect[], tol: number): Rect[] {
  const parent = rects.map((_, i) => i);
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
  const touche = (a: Rect, b: Rect) => a.x - tol <= b.x + b.largeur && b.x - tol <= a.x + a.largeur
    && a.y - tol <= b.y + b.hauteur && b.y - tol <= a.y + a.hauteur;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    if (touche(rects[i], rects[j])) parent[racine(i)] = racine(j);
  }
  const groupes = new Map<number, Rect[]>();
  rects.forEach((r, i) => { const g = racine(i); groupes.set(g, [...(groupes.get(g) ?? []), r]); });
  let meilleur: Rect[] = [];
  let surface = -1;
  for (const g of groupes.values()) {
    const s = g.reduce((t, r) => t + r.largeur * r.hauteur, 0);
    if (s > surface) { surface = s; meilleur = g; }
  }
  return meilleur;
}

/** Valeurs regroupées : des bords à moins de `tol` pixels n'en font qu'un (leur moyenne). */
function bords(valeurs: number[], tol: number): number[] {
  const groupes: number[][] = [];
  for (const v of [...valeurs].sort((a, b) => a - b)) {
    const g = groupes[groupes.length - 1];
    if (g && v - g[g.length - 1] <= tol) g.push(v); else groupes.push([v]);
  }
  return groupes.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
}

const plusProche = (liste: number[], v: number) =>
  liste.reduce((m, x, i) => (Math.abs(x - v) < Math.abs(liste[m] - v) ? i : m), 0);

/** Rangées et colonnes déduites des bords des cases ; une case peut en couvrir plusieurs. */
export function tableauDepuisCases(rects: Rect[], largeurPage: number, hauteurPage: number): Tableau | null {
  if (rects.length < CASES_MIN) return null;
  const tol = tolerance(largeurPage);
  const xs = bords(rects.flatMap((r) => [r.x, r.x + r.largeur]), tol);
  const ys = bords(rects.flatMap((r) => [r.y, r.y + r.hauteur]), tol);
  const cols = xs.length - 1, rangs = ys.length - 1;
  if (cols < 2 || rangs < 2) return null;
  const rect = { x: xs[0], y: ys[0], largeur: xs[cols] - xs[0], hauteur: ys[rangs] - ys[0] };
  if (rect.largeur * rect.hauteur < AIRE_MIN * largeurPage * hauteurPage) return null;
  const cases: CaseTableau[] = rects.map((r) => {
    const col = plusProche(xs, r.x);
    const fin = Math.max(col + 1, plusProche(xs, r.x + r.largeur));
    const rang = plusProche(ys, r.y);
    const bas = Math.max(rang + 1, plusProche(ys, r.y + r.hauteur));
    return { rang, col, rangs: bas - rang, cols: fin - col, rect: r, texte: '', confiance: 1, corrige: false };
  });
  cases.sort((a, b) => a.rang - b.rang || a.col - b.col);
  return { rect, rangs, cols, cases };
}

const centre = (l: LigneLue) => ({ x: l.rect.x + l.rect.largeur / 2, y: l.rect.y + l.rect.hauteur / 2 });
const contient = (r: Rect, p: { x: number; y: number }) =>
  p.x >= r.x - MARGE && p.x <= r.x + r.largeur + MARGE && p.y >= r.y - MARGE && p.y <= r.y + r.hauteur + MARGE;

/** La ligne est-elle dans le cadre du tableau ? */
export function dansLeTableau(t: Tableau, l: LigneLue): boolean {
  return contient(t.rect, centre(l));
}

/** Range chaque ligne dans la case qui contient son centre (plusieurs lignes : une par rangée). */
export function rangerDansTableau(t: Tableau, lignes: LigneLue[]): Tableau {
  const parCase = t.cases.map(() => [] as LigneLue[]);
  for (const l of lignes) {
    const k = t.cases.findIndex((c) => contient(c.rect, centre(l)));
    if (k >= 0) parCase[k].push(l);
  }
  return {
    ...t,
    cases: t.cases.map((c, k) => {
      const ls = parCase[k];
      const texte = enRangees(ls, (l) => l.rect).map((r) => r.map((l) => l.texte).join(' ')).join('\n');
      return { ...c, texte, confiance: ls.length ? Math.min(...ls.map((l) => l.confiance)) : 1 };
    }),
  };
}

/** Tableau si assez de cases sont remplies ; sinon (carreaux de cahier, pas de traits) : texte. */
export function choisirMode(t: Tableau | null): ModeLecture {
  if (!t || t.cases.length > MAX_CASES) return 'texte';
  const pleines = t.cases.filter((c) => c.texte.trim()).length;
  return pleines >= PART_PLEINE_MIN * t.cases.length ? 'tableau' : 'texte';
}
