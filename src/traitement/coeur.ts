import type { PageBrute } from '../lecture/lecteur';
import { choisirMode, rangerDansTableau, trouverTableau } from '../lecture/tableau';
import { detecterCoins, masqueDesBords } from './detection';
import { appliquerFiltre } from './filtres';
import type { CV } from './opencv';
import type { Reponse, Requete } from './protocole';
import { redresser } from './redressement';
import type { Coins, Img } from './types';

/** Les requêtes traitées tout de suite, sans le lecteur de texte. */
export type RequeteSimple = Extract<Requete, { type: 'preparer' | 'detecter' | 'bords' | 'traiter' }>;

export function gererRequete(cv: CV, r: RequeteSimple): Reponse {
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

/** Ce qu'il faut savoir du lecteur de texte : il lit une page et la rend remise d'aplomb. */
export interface LecteurDePage { lire(cv: CV, img: Img): Promise<PageBrute> }

/** Lecture d'une page : lignes lues, tableau repéré sur la même image, choix Texte / Tableau. */
export async function gererLecture(cv: CV, lecteur: LecteurDePage, r: Extract<Requete, { type: 'lire' }>): Promise<Reponse> {
  try {
    const lu = await lecteur.lire(cv, r.img);
    const lignes = lu.lignes.map((l) => ({ ...l, corrige: false }));
    const cadre = trouverTableau(cv, lu.img);
    const tableau = cadre ? rangerDansTableau(cadre, lignes) : null;
    return {
      id: r.id, ok: true, type: 'lire',
      resultat: { sens: lu.sens, largeur: lu.img.width, hauteur: lu.img.height, mode: choisirMode(tableau), lignes, tableau },
    };
  } catch (e) {
    return { id: r.id, ok: false, erreur: e instanceof Error ? e.message : `Erreur de lecture (${String(e)})` };
  }
}
