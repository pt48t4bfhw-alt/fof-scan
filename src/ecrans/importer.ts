import { brouillonDepuisFichier } from '../navigateur/pipeline';
import type { PageBrouillon } from '../rangement/modele';
import type { Lot } from './navigation';

export async function importerFichiers(fichiers: File[], documentId: string | null): Promise<Lot> {
  const brouillons: PageBrouillon[] = [];
  for (const f of fichiers) brouillons.push(await brouillonDepuisFichier(f));
  return { documentId, brouillons, pageExistante: null };
}
