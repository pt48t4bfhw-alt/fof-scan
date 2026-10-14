import type { ResultatLecture } from '../lecture/modele';
import type { Coins, Filtre, Img, Reglages, Rotation } from './types';

export type Requete =
  | { id: number; type: 'preparer' }
  | { id: number; type: 'detecter'; img: Img }
  | { id: number; type: 'bords'; img: Img }
  | { id: number; type: 'traiter'; img: Img; coins: Coins; rotation: Rotation; filtre: Filtre; reglages: Reglages }
  /** Lire le texte d'une page (le lecteur doit être téléchargé). */
  | { id: number; type: 'lire'; img: Img }
  /** Libérer la mémoire du lecteur (en quittant l'écran Texte). */
  | { id: number; type: 'liberer' };

export type Reponse =
  | { id: number; ok: true; type: 'preparer' }
  | { id: number; ok: true; type: 'detecter'; coins: Coins | null }
  | { id: number; ok: true; type: 'bords'; masque: { data: Uint8Array; largeur: number; hauteur: number } }
  | { id: number; ok: true; type: 'traiter'; img: Img }
  | { id: number; ok: true; type: 'lire'; resultat: ResultatLecture }
  | { id: number; ok: true; type: 'liberer' }
  | { id: number; ok: false; erreur: string };

export interface PortWorker {
  onmessage: ((e: MessageEvent<Reponse>) => void) | null;
  postMessage(message: Requete, transfert?: Transferable[]): void;
}
