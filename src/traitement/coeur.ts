import { detecterCoins, masqueDesBords } from './detection';
import { appliquerFiltre } from './filtres';
import type { CV } from './opencv';
import type { Reponse, Requete } from './protocole';
import { redresser } from './redressement';
import type { Coins, Img } from './types';

export function gererRequete(cv: CV, r: Requete): Reponse {
  try {
    switch (r.type) {
      case 'preparer':
        return { id: r.id, ok: true, type: 'preparer' };
      case 'detecter':
        return { id: r.id, ok: true, type: 'detecter', coins: detecterCoins(cv, r.img) };
      case 'bords':
        return { id: r.id, ok: true, type: 'bords', masque: masqueDesBords(cv, r.img) };
      case 'traiter': {
        const droit = redresser(cv, r.img, r.coins, r.rotation);
        return { id: r.id, ok: true, type: 'traiter', img: appliquerFiltre(cv, droit, r.filtre, r.reglages) };
      }
    }
  } catch (e) {
    return { id: r.id, ok: false, erreur: e instanceof Error ? e.message : `Erreur de traitement (${String(e)})` };
  }
}

/** Ce qu'il faut savoir du détecteur IA : il trouve les coins, ou renonce (null). */
export interface DetecteurDeCoins { detecter(cv: CV, img: Img): Promise<Coins | null> }

/**
 * Détection de la feuille : le modèle d'IA d'abord ; s'il renonce, échoue ou n'est pas chargé,
 * la méthode classique (OpenCV) prend le relais.
 */
export async function gererDetection(cv: CV, ia: DetecteurDeCoins | null, r: Extract<Requete, { type: 'detecter' }>): Promise<Reponse> {
  try {
    const coinsIA = ia ? await ia.detecter(cv, r.img).catch(() => null) : null;
    return { id: r.id, ok: true, type: 'detecter', coins: coinsIA ?? detecterCoins(cv, r.img) };
  } catch (e) {
    return { id: r.id, ok: false, erreur: e instanceof Error ? e.message : `Erreur de détection (${String(e)})` };
  }
}
