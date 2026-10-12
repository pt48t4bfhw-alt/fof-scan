import { nomFichier } from '../nommage';
import type { DocumentScan, ImageJpeg, PageScan } from '../rangement/modele';
import { fabriquerPdf, type FormatPdf } from './pdf';

export interface OptionsExport { type: 'pdf' | 'jpg'; format: FormatPdf; qualite: 'normale' | 'legere' }

export const QUALITES = {
  normale: { coteMax: 2480, qualite: 0.85 },
  legere: { coteMax: 1654, qualite: 0.6 },
} as const;

export type Reencodeur = (im: ImageJpeg, coteMax: number, qualite: number) => Promise<ImageJpeg>;

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
    const pdf = await fabriquerPdf(images, options.format, doc.nom);
    return [new File([pdf], nomFichier(doc.nom, 'pdf'), { type: 'application/pdf' })];
  }
  return images.map((im, k) => new File(
    [im.octets],
    images.length === 1 ? nomFichier(doc.nom, 'jpg') : nomFichier(`${doc.nom} - p${k + 1}`, 'jpg'),
    { type: 'image/jpeg' },
  ));
}
