import { brouillonDepuisFichier } from '../navigateur/pipeline';
import type { PageBrouillon } from '../rangement/modele';
import type { Lot } from './navigation';

/** Photos importées : ajoutées au document `documentId`, ou à un nouveau document rangé dans `dossierId`. */
export async function importerFichiers(fichiers: File[], documentId: string | null, dossierId: string | null = null): Promise<Lot> {
  const brouillons: PageBrouillon[] = [];
  for (const f of fichiers) brouillons.push(await brouillonDepuisFichier(f));
  return { documentId, dossierId, brouillons, pageExistante: null };
}
