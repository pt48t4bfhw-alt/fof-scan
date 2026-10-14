import type { Rect } from './modele';

/**
 * Regroupe des éléments en rangées visuelles : deux éléments dont les centres sont à moins d'une
 * demi-hauteur sont sur la même rangée. Rangées de haut en bas, chacune de gauche à droite.
 */
export function enRangees<T>(items: T[], rect: (t: T) => Rect): T[][] {
  const centre = (t: T) => rect(t).y + rect(t).hauteur / 2;
  const rangees: T[][] = [];
  for (const t of [...items].sort((a, b) => centre(a) - centre(b))) {
    const r = rangees[rangees.length - 1];
    const tete = r?.[0];
    if (tete && Math.abs(centre(tete) - centre(t)) < 0.5 * Math.max(rect(tete).hauteur, rect(t).hauteur)) r.push(t);
    else rangees.push([t]);
  }
  return rangees.map((r) => r.sort((a, b) => rect(a).x - rect(b).x));
}
