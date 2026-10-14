import type { ImageJpeg } from '../rangement/modele';

/** Rectangle droit, en pixels de la page lue (après remise d'aplomb). */
export interface Rect { x: number; y: number; largeur: number; hauteur: number }
/** Quadrilatère d'une ligne repérée : haut-gauche, haut-droite, bas-droite, bas-gauche. */
export type Quad = [[number, number], [number, number], [number, number], [number, number]];

export interface LigneLue { rect: Rect; texte: string; confiance: number; corrige: boolean }

export interface CaseTableau {
  rang: number;
  col: number;
  /** Nombre de rangées et de colonnes couvertes (cases fusionnées). */
  rangs: number;
  cols: number;
  rect: Rect;
  texte: string;
  /** Plus faible confiance des lignes rangées dans la case (1 si elle est vide). */
  confiance: number;
  corrige: boolean;
}
export interface Tableau { rect: Rect; rangs: number; cols: number; cases: CaseTableau[] }

/** Quart de tour appliqué à la page avant lecture (90 = vers la droite). */
export type Sens = 0 | 90 | 270;
export type ModeLecture = 'texte' | 'tableau';

export interface LecturePage {
  pageId: string;
  documentId: string;
  /** Empreinte de l'image lue : si la page change ensuite, la lecture est « à relire ». */
  empreinte: string;
  sens: Sens;
  /** Taille de l'image lue (réduite et remise d'aplomb) : les rectangles s'y rapportent. */
  largeur: number;
  hauteur: number;
  mode: ModeLecture;
  lignes: LigneLue[];
  tableau: Tableau | null;
  lu: number;
}

/** Ce que le worker rend pour une page (sans les identifiants). */
export type ResultatLecture = Pick<LecturePage, 'sens' | 'largeur' | 'hauteur' | 'mode' | 'lignes' | 'tableau'>;

/** En dessous, la ligne (ou la case) est signalée en orange. */
export const CONFIANCE_DOUTEUSE = 0.8;

/**
 * Empreinte d'une image JPEG : taille, nombre d'octets et FNV-1a sur tous les octets (quelques
 * millièmes de seconde pour une page ; un échantillon raterait un simple changement de teinte).
 */
export function empreinte(im: ImageJpeg): string {
  let h = 0x811c9dc5;
  const o = im.octets;
  for (let i = 0; i < o.length; i++) {
    h ^= o[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${im.largeur}x${im.hauteur}:${o.length}:${h.toString(16)}`;
}
