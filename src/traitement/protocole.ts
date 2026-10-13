import type { Coins, Filtre, Img, Reglages, Rotation } from './types';

export type Requete =
  | { id: number; type: 'preparer' }
  | { id: number; type: 'detecter'; img: Img }
  | { id: number; type: 'traiter'; img: Img; coins: Coins; rotation: Rotation; filtre: Filtre; reglages: Reglages };

export type Reponse =
  | { id: number; ok: true; type: 'preparer' }
  | { id: number; ok: true; type: 'detecter'; coins: Coins | null }
  | { id: number; ok: true; type: 'traiter'; img: Img }
  | { id: number; ok: false; erreur: string };

export interface PortWorker {
  onmessage: ((e: MessageEvent<Reponse>) => void) | null;
  postMessage(message: Requete, transfert?: Transferable[]): void;
}
