import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { DocumentScan, DossierScan, PageScan } from './modele';

const VERSION = 1;
const APPLICATION = 'FOF Scan';
const SORTES = ['original', 'traitee', 'miniature'] as const;
const PAS_UNE_SAUVEGARDE = "Ce fichier n'est pas une sauvegarde FOF Scan.";

const chemin = (pageId: string, sorte: string) => `images/${pageId}-${sorte}.jpg`;

export function nomSauvegarde(d: Date): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `FOF-Scan-sauvegarde-${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}.zip`;
}

/** Un zip : `manifeste.json` (dossiers, documents et pages sans les images) + toutes les images JPEG. */
export function creerSauvegarde(documents: DocumentScan[], pages: PageScan[], dossiers: DossierScan[] = []): Uint8Array {
  const fichiers: Record<string, Uint8Array> = {};
  const pagesManifeste = pages.map((p) => {
    const copie: Record<string, unknown> = { ...p };
    for (const s of SORTES) {
      fichiers[chemin(p.id, s)] = p[s].octets;
      copie[s] = { largeur: p[s].largeur, hauteur: p[s].hauteur };
    }
    return copie;
  });
  fichiers['manifeste.json'] = strToU8(JSON.stringify({ application: APPLICATION, version: VERSION, dossiers, documents, pages: pagesManifeste }));
  // Les JPEG ne se compressent plus : on range sans compresser, c'est plus rapide.
  return zipSync(fichiers, { level: 0 });
}

export function lireSauvegarde(zip: Uint8Array): { documents: DocumentScan[]; pages: PageScan[]; dossiers: DossierScan[] } {
  let fichiers: Record<string, Uint8Array>;
  try {
    fichiers = unzipSync(zip);
  } catch {
    throw new Error(PAS_UNE_SAUVEGARDE);
  }
  const brut = fichiers['manifeste.json'];
  if (!brut) throw new Error(PAS_UNE_SAUVEGARDE);
  const manifeste = JSON.parse(strFromU8(brut));
  if (manifeste.application !== APPLICATION || manifeste.version !== VERSION) throw new Error(PAS_UNE_SAUVEGARDE);

  const pages: PageScan[] = manifeste.pages.map((p: Record<string, unknown> & { id: string }) => {
    const page: Record<string, unknown> = { ...p };
    for (const s of SORTES) {
      const octets = fichiers[chemin(p.id, s)];
      if (!octets) throw new Error(`Sauvegarde incomplète : une image manque (${p.id}).`);
      page[s] = { ...(p[s] as object), octets };
    }
    return page as unknown as PageScan;
  });
  // les sauvegardes faites avant les dossiers n'en ont pas
  return { documents: manifeste.documents, pages, dossiers: manifeste.dossiers ?? [] };
}
