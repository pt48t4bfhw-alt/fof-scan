import { nomParDefaut } from '../nommage';
import type { Depot } from '../rangement/depot';
import type { NouvellePage, PageBrouillon } from '../rangement/modele';
import type { Lot } from './navigation';

/** Traite et enregistre les pages une par une (pour ménager la mémoire), et renvoie l'id du document. */
export async function enregistrerLot(
  depot: Depot,
  lot: Lot,
  rendre: (b: PageBrouillon) => Promise<NouvellePage>,
  maintenant: Date,
  progres?: (fait: number, total: number) => void,
): Promise<string> {
  if (lot.pageExistante) {
    const rendu = await rendre(lot.brouillons[0]);
    await depot.mettreAJourPage({ ...lot.pageExistante, ...rendu });
    progres?.(1, 1);
    return lot.pageExistante.documentId;
  }
  const id = lot.documentId ?? (await depot.creerDocument(nomParDefaut(maintenant), lot.dossierId ?? null)).id;
  for (const [k, b] of lot.brouillons.entries()) {
    await depot.ajouterPage(id, await rendre(b));
    progres?.(k + 1, lot.brouillons.length);
  }
  return id;
}
