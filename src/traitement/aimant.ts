import type { Coins, Point } from './types';

/**
 * Carte des bords nets de la photo (0 = rien, autre = bord), éventuellement réduite :
 * `echelle` = pixels du masque par pixel de la photo.
 */
export interface Masque { data: Uint8Array; largeur: number; hauteur: number; echelle: number }

/** Un bord est accepté s'il couvre au moins 60 % du ou des côtés concernés… */
const SOUTIEN_MIN = 0.6;
/** …et s'il fait nettement mieux que la position lâchée (sinon on respecte le geste). */
const GAIN_MIN = 0.1;
/** Les positions presque aussi bonnes que la meilleure : on prend leur centre (le milieu du trait). */
const TOLERANCE = 0.03;
/** Largeur d'un trait de bord dans le masque (élargi de 2 px de chaque côté), en pixels du masque. */
const LARGEUR_TRAIT = 5;

/** Part d'un segment (en coordonnées de la photo) qui tombe sur un bord du masque. */
export function soutienSegment(m: Masque, a: Point, b: Point): number {
  const ax = a.x * m.echelle, ay = a.y * m.echelle, bx = b.x * m.echelle, by = b.y * m.echelle;
  const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
  let sur = 0;
  for (let t = 0; t <= n; t++) {
    const x = Math.round(ax + ((bx - ax) * t) / n), y = Math.round(ay + ((by - ay) * t) / n);
    if (x >= 0 && y >= 0 && x < m.largeur && y < m.hauteur && m.data[y * m.largeur + x]) sur++;
  }
  return sur / (n + 1);
}

/**
 * Coin lâché : cherche, dans un rayon (en pixels de la photo), la position où ses deux côtés
 * suivent le mieux un bord. Ne bouge rien si aucun bord net n'est assez proche.
 */
export function aimanterCoin(coins: Coins, k: number, m: Masque, rayon: number): Coins {
  const avant = coins[(k + 3) % 4], apres = coins[(k + 1) % 4], p = coins[k];
  const score = (q: Point) => (soutienSegment(m, avant, q) + soutienSegment(m, q, apres)) / 2;
  const pas = 1 / m.echelle;
  const candidats: { q: Point; s: number }[] = [];
  for (let dy = -rayon; dy <= rayon; dy += pas) for (let dx = -rayon; dx <= rayon; dx += pas) {
    if (dx * dx + dy * dy > rayon * rayon) continue;
    const q = { x: p.x + dx, y: p.y + dy };
    candidats.push({ q, s: score(q) });
  }
  const choisi = choisir(candidats, score(p), p, LARGEUR_TRAIT / m.echelle);
  if (!choisi) return coins;
  return coins.map((c, i) => (i === k ? choisi : c)) as Coins;
}

/**
 * Côté lâché (poignée du milieu) : le déplace perpendiculairement, dans un rayon, jusqu'à la
 * position où il suit le mieux un bord. Ne bouge rien si aucun bord net n'est assez proche.
 */
export function aimanterCote(coins: Coins, cote: number, m: Masque, rayon: number): Coins {
  const a = coins[cote], b = coins[(cote + 1) % 4];
  const longueur = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normale = { x: -(b.y - a.y) / longueur, y: (b.x - a.x) / longueur };
  const decaler = (p: Point, d: number) => ({ x: p.x + normale.x * d, y: p.y + normale.y * d });
  const pas = 1 / m.echelle;
  const candidats: { q: Point; s: number }[] = [];
  for (let d = -rayon; d <= rayon; d += pas) {
    candidats.push({ q: { x: d, y: 0 }, s: soutienSegment(m, decaler(a, d), decaler(b, d)) });
  }
  const choisi = choisir(candidats, soutienSegment(m, a, b), { x: 0, y: 0 }, LARGEUR_TRAIT / m.echelle);
  if (!choisi) return coins;
  const d = choisi.x;
  return coins.map((c, i) => (i === cote || i === (cote + 1) % 4 ? decaler(c, d) : c)) as Coins;
}

/**
 * Choix de la position, si un bord assez net fait nettement mieux que la position lâchée :
 * parmi les bonnes positions (au moins 85 % de la meilleure), la plus proche du doigt, puis le
 * centre de son trait. Deux bords proches et d'égale qualité (couverture d'un carnet et reçu)
 * ne se mélangent donc pas : on garde celui que l'utilisateur visait.
 */
function choisir(candidats: { q: Point; s: number }[], actuel: number, depart: Point, bande: number): Point | null {
  const meilleur = Math.max(...candidats.map((c) => c.s));
  if (meilleur < SOUTIEN_MIN || meilleur < actuel + GAIN_MIN) return null;
  const bons = candidats.filter((c) => c.s >= Math.max(SOUTIEN_MIN, 0.85 * meilleur));
  const distance = (c: { q: Point }) => Math.hypot(c.q.x - depart.x, c.q.y - depart.y);
  const plusProche = bons.reduce((p, c) => (distance(c) < distance(p) ? c : p));
  const trait = bons.filter((c) => Math.hypot(c.q.x - plusProche.q.x, c.q.y - plusProche.q.y) <= bande);
  const sommet = Math.max(...trait.map((c) => c.s));
  const centre = trait.filter((c) => c.s >= sommet - TOLERANCE);
  return {
    x: centre.reduce((s, c) => s + c.q.x, 0) / centre.length,
    y: centre.reduce((s, c) => s + c.q.y, 0) / centre.length,
  };
}
