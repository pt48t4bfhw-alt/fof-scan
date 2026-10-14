import type { ResultatLecture } from '../lecture/modele';
import type { PortWorker, Reponse, Requete } from './protocole';
import { REGLAGES_NEUTRES, type Coins, type Filtre, type Img, type Reglages, type Rotation } from './types';

export class Traitement {
  private suivant = 1;
  private attente = new Map<number, (r: Reponse) => void>();

  constructor(private worker: PortWorker) {
    worker.onmessage = (e) => {
      const repondre = this.attente.get(e.data.id);
      this.attente.delete(e.data.id);
      repondre?.(e.data);
    };
  }

  private envoyer(r: Requete, transfert: Transferable[] = []): Promise<Reponse> {
    return new Promise((resolve) => {
      this.attente.set(r.id, resolve);
      this.worker.postMessage(r, transfert);
    });
  }

  async preparer(): Promise<void> {
    const r = await this.envoyer({ id: this.suivant++, type: 'preparer' });
    if (!r.ok) throw new Error(r.erreur);
  }

  async detecter(img: Img): Promise<Coins | null> {
    const r = await this.envoyer({ id: this.suivant++, type: 'detecter', img }, [img.data.buffer]);
    if (!r.ok) throw new Error(r.erreur);
    if (r.type !== 'detecter') throw new Error('Réponse inattendue du traitement');
    return r.coins;
  }

  async bords(img: Img): Promise<{ data: Uint8Array; largeur: number; hauteur: number }> {
    const r = await this.envoyer({ id: this.suivant++, type: 'bords', img }, [img.data.buffer]);
    if (!r.ok) throw new Error(r.erreur);
    if (r.type !== 'bords') throw new Error('Réponse inattendue du traitement');
    return r.masque;
  }

  async traiter(img: Img, coins: Coins, rotation: Rotation, filtre: Filtre, reglages: Reglages = REGLAGES_NEUTRES): Promise<Img> {
    const r = await this.envoyer({ id: this.suivant++, type: 'traiter', img, coins, rotation, filtre, reglages }, [img.data.buffer]);
    if (!r.ok) throw new Error(r.erreur);
    if (r.type !== 'traiter') throw new Error('Réponse inattendue du traitement');
    return r.img;
  }

  async lire(img: Img): Promise<ResultatLecture> {
    const r = await this.envoyer({ id: this.suivant++, type: 'lire', img }, [img.data.buffer]);
    if (!r.ok) throw new Error(r.erreur);
    if (r.type !== 'lire') throw new Error('Réponse inattendue du traitement');
    return r.resultat;
  }

  async liberer(): Promise<void> {
    const r = await this.envoyer({ id: this.suivant++, type: 'liberer' });
    if (!r.ok) throw new Error(r.erreur);
  }
}

let instance: Traitement | null = null;

/** Le traitement de l'appli, lié au vrai Web Worker (créé au premier appel). */
export function traitement(): Traitement {
  if (!instance) {
    const worker = new Worker(new URL('./traitement.worker.ts', import.meta.url), { type: 'module' });
    instance = new Traitement(worker as unknown as PortWorker);
  }
  return instance;
}
