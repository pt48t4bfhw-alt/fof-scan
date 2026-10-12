import { detecterCoins } from './detection';
import { appliquerFiltre } from './filtres';
import type { CV } from './opencv';
import type { Reponse, Requete } from './protocole';
import { redresser } from './redressement';

export function gererRequete(cv: CV, r: Requete): Reponse {
  try {
    switch (r.type) {
      case 'preparer':
        return { id: r.id, ok: true, type: 'preparer' };
      case 'detecter':
        return { id: r.id, ok: true, type: 'detecter', coins: detecterCoins(cv, r.img) };
      case 'traiter': {
        const droit = redresser(cv, r.img, r.coins, r.rotation);
        return { id: r.id, ok: true, type: 'traiter', img: appliquerFiltre(cv, droit, r.filtre) };
      }
    }
  } catch (e) {
    return { id: r.id, ok: false, erreur: e instanceof Error ? e.message : `Erreur de traitement (${String(e)})` };
  }
}
