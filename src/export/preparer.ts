import { nomFichier, nomsUniques } from '../nommage';
import type { DocumentScan, ImageJpeg, PageScan } from '../rangement/modele';
import { fabriquerPdf, type MiseEnPage } from './pdf';

export interface OptionsExport extends MiseEnPage { type: 'pdf' | 'jpg'; qualite: 'normale' | 'legere' }

export const OPTIONS_PAR_DEFAUT: OptionsExport = { type: 'pdf', format: 'a4', orientation: 'auto', marge: 'aucune', qualite: 'normale' };

export const QUALITES = {
  normale: { coteMax: 2480, qualite: 0.85 },
  legere: { coteMax: 1654, qualite: 0.6 },
} as const;

export type Reencodeur = (im: ImageJpeg, coteMax: number, qualite: number) => Promise<ImageJpeg>;

/**
 * Plusieurs documents cochés : un ou des fichiers par document (comme pour un seul), noms rendus
 * uniques, progression comptée sur l'ensemble des pages.
 */
export async function preparerExportPlusieurs(
  lots: { doc: DocumentScan; pages: PageScan[] }[],
  options: OptionsExport,
  reencoder: Reencodeur,
  progres?: (fait: number, total: number) => void,
): Promise<File[]> {
  const total = lots.reduce((s, l) => s + l.pages.length, 0);
  let dejaFait = 0;
  const fichiers: File[] = [];
  for (const { doc, pages } of lots) {
    const avant = dejaFait;
    fichiers.push(...await preparerExport(doc, pages, options, reencoder, (fait) => progres?.(avant + fait, total)));
    dejaFait += pages.length;
  }
  const noms = nomsUniques(fichiers.map((f) => f.name));
  return fichiers.map((f, k) => (noms[k] === f.name ? f : new File([f], noms[k], { type: f.type })));
}

/** Réencode les pages une par une (pour ménager la mémoire de Safari), puis fabrique les fichiers. */
export async function preparerExport(
  doc: DocumentScan,
  pages: PageScan[],
  options: OptionsExport,
  reencoder: Reencodeur,
  progres?: (fait: number, total: number) => void,
): Promise<File[]> {
  const { coteMax, qualite } = QUALITES[options.qualite];
  const images: ImageJpeg[] = [];
  for (const [k, p] of pages.entries()) {
    images.push(await reencoder(p.traitee, coteMax, qualite));
    progres?.(k + 1, pages.length);
  }
  if (options.type === 'pdf') {
    const pdf = await fabriquerPdf(images, options, doc.nom);
    return [new File([pdf], nomFichier(doc.nom, 'pdf'), { type: 'application/pdf' })];
  }
  return images.map((im, k) => new File(
    [im.octets],
    images.length === 1 ? nomFichier(doc.nom, 'jpg') : nomFichier(`${doc.nom} - p${k + 1}`, 'jpg'),
    { type: 'image/jpeg' },
  ));
}
