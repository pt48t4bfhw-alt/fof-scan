import { PDFDocument } from 'pdf-lib';
import type { ImageJpeg } from '../rangement/modele';

export type FormatPdf = 'a4' | 'a5' | 'lettre' | 'legal' | 'reel';
export type OrientationPdf = 'auto' | 'portrait' | 'paysage';
export type MargePdf = 'aucune' | 'petite' | 'grande';
export interface MiseEnPage { format: FormatPdf; orientation: OrientationPdf; marge: MargePdf }

/** Dimensions des pages en points PDF (1 pt = 1/72 de pouce) : [petit côté, grand côté]. */
const FORMATS: Record<Exclude<FormatPdf, 'reel'>, [number, number]> = {
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  lettre: [612, 792],
  legal: [612, 1008],
};
/** Marges en points : 1 cm = 28,35 pt. */
const MARGES: Record<MargePdf, number> = { aucune: 0, petite: 28.35, grande: 56.69 };

/**
 * Place une image dans sa page : entière, centrée, sans déformation, à l'intérieur des marges.
 * En « taille réelle », la page prend les proportions de l'image (marges ajoutées autour) et
 * l'orientation est celle de l'image.
 */
export function placement(largeur: number, hauteur: number, mise: MiseEnPage) {
  const m = MARGES[mise.marge];
  if (mise.format === 'reel') {
    const f = FORMATS.a4[1] / Math.max(largeur, hauteur);
    const l = largeur * f;
    const h = hauteur * f;
    return { page: { largeur: l + 2 * m, hauteur: h + 2 * m }, image: { x: m, y: m, largeur: l, hauteur: h } };
  }
  const [petit, grand] = FORMATS[mise.format];
  const paysage = mise.orientation === 'paysage' || (mise.orientation === 'auto' && largeur > hauteur);
  const page = paysage ? { largeur: grand, hauteur: petit } : { largeur: petit, hauteur: grand };
  const f = Math.min((page.largeur - 2 * m) / largeur, (page.hauteur - 2 * m) / hauteur);
  const l = largeur * f;
  const h = hauteur * f;
  return { page, image: { x: (page.largeur - l) / 2, y: (page.hauteur - h) / 2, largeur: l, hauteur: h } };
}

export async function fabriquerPdf(images: ImageJpeg[], mise: MiseEnPage, titre: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(titre);
  pdf.setCreator('FOF Scan');
  pdf.setProducer('FOF Scan');
  for (const im of images) {
    const jpg = await pdf.embedJpg(im.octets);
    const p = placement(im.largeur, im.hauteur, mise);
    pdf.addPage([p.page.largeur, p.page.hauteur])
      .drawImage(jpg, { x: p.image.x, y: p.image.y, width: p.image.largeur, height: p.image.hauteur });
  }
  return pdf.save();
}
