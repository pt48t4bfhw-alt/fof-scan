import { ErreurStockagePlein } from '../rangement/depot';
import type { PageBrouillon, PageScan } from '../rangement/modele';

/** Pages en cours : nouveau scan (documentId null = nouveau document) ou modification d'une page existante. */
export interface Lot { documentId: string | null; brouillons: PageBrouillon[]; pageExistante: PageScan | null }

export type Ecran =
  | { nom: 'accueil' }
  | { nom: 'viseur'; documentId: string | null }
  | { nom: 'recadrage'; lot: Lot }
  | { nom: 'filtres'; lot: Lot }
  | { nom: 'document'; id: string }
  /** Un document (depuis son écran) ou plusieurs (cochés sur l'accueil). */
  | { nom: 'export'; ids: string[] };

export interface Nav { aller(e: Ecran): void; signaler(message: string): void }

export function retour(lot: Lot): Ecran {
  if (lot.pageExistante) return { nom: 'document', id: lot.pageExistante.documentId };
  if (lot.documentId) return { nom: 'document', id: lot.documentId };
  return { nom: 'accueil' };
}

export function messageErreur(e: unknown): string {
  if (e instanceof ErreurStockagePlein) {
    return 'La mémoire est pleine. Faites « Sauvegarder tout » (menu ⋯ de l\'accueil), puis supprimez d\'anciens documents.';
  }
  return e instanceof Error ? e.message : 'Une erreur est survenue.';
}
