/**
 * Calculs de la visionneuse : zoom à deux doigts, double toucher, déplacement d'une image agrandie
 * et passage à la page voisine. Les positions sont mesurées depuis le centre de l'écran.
 */
export interface Taille { largeur: number; hauteur: number }
export interface Vue { echelle: number; x: number; y: number }

export const VUE_INITIALE: Vue = { echelle: 1, x: 0, y: 0 };
export const ECHELLE_MAX = 5;
export const ECHELLE_DOUBLE = 2.5;
/** Part de la largeur de l'écran à glisser pour changer de page. */
const SEUIL_GLISSER = 0.2;

/** Taille de l'image affichée entière dans l'écran, sans déformation. */
export function tailleContenue(image: Taille, cadre: Taille): Taille {
  const f = Math.min(cadre.largeur / image.largeur, cadre.hauteur / image.hauteur);
  return { largeur: image.largeur * f, hauteur: image.hauteur * f };
}

/** Empêche l'image agrandie de laisser du vide : elle ne glisse que de ce qui dépasse de l'écran. */
export function borner(v: Vue, contenue: Taille, cadre: Taille): Vue {
  const mx = Math.max(0, (contenue.largeur * v.echelle - cadre.largeur) / 2);
  const my = Math.max(0, (contenue.hauteur * v.echelle - cadre.hauteur) / 2);
  return { echelle: v.echelle, x: Math.min(mx, Math.max(-mx, v.x)) + 0, y: Math.min(my, Math.max(-my, v.y)) + 0 };
}

/** Change l'échelle d'un facteur en gardant sous le doigt le point `p` de l'image. */
export function zoomerAutour(v: Vue, facteur: number, p: { x: number; y: number }, contenue: Taille, cadre: Taille): Vue {
  const echelle = Math.min(ECHELLE_MAX, Math.max(1, v.echelle * facteur));
  const r = echelle / v.echelle;
  return borner({ echelle, x: p.x - (p.x - v.x) * r, y: p.y - (p.y - v.y) * r }, contenue, cadre);
}

/** Double toucher : agrandit autour du doigt, ou revient à la taille normale si l'image est déjà agrandie. */
export function doubleToucher(v: Vue, p: { x: number; y: number }, contenue: Taille, cadre: Taille): Vue {
  return v.echelle > 1 ? VUE_INITIALE : zoomerAutour(v, ECHELLE_DOUBLE / v.echelle, p, contenue, cadre);
}

/** Page à afficher après un glissement horizontal de `dx` pixels (négatif = vers la gauche = page suivante). */
export function pageApresGlisser(index: number, total: number, dx: number, largeur: number): number {
  if (dx < -SEUIL_GLISSER * largeur) return Math.min(total - 1, index + 1);
  if (dx > SEUIL_GLISSER * largeur) return Math.max(0, index - 1);
  return index;
}
