import type { Coins, Filtre, Rotation } from '../traitement/types';

export interface DocumentScan {
  id: string;
  nom: string;
  cree: number;
  modifie: number;
  /** Identifiants des pages, dans l'ordre. */
  pages: string[];
}

export interface ImageJpeg { octets: Uint8Array; largeur: number; hauteur: number }

export interface PageScan {
  id: string;
  documentId: string;
  /** Photo d'origine (≤ 3 000 px) : permet de refaire recadrage et filtre sans perte. */
  original: ImageJpeg;
  coins: Coins;
  rotation: Rotation;
  filtre: Filtre;
  traitee: ImageJpeg;
  miniature: ImageJpeg;
}

export type NouvellePage = Omit<PageScan, 'id' | 'documentId'>;

/** Page en cours de scan, pas encore traitée ni enregistrée. */
export interface PageBrouillon {
  original: ImageJpeg;
  coins: Coins;
  rotation: Rotation;
  filtre: Filtre;
  /** Faux quand la feuille n'a pas été trouvée et que les coins couvrent toute la photo. */
  detecte: boolean;
}
