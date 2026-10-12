import { PDFDocument } from 'pdf-lib';
import type { ImageJpeg } from '../rangement/modele';

export type FormatPdf = 'a4' | 'reel';

/** Dimensions A4 en points PDF. */
const A4 = { petit: 595.28, grand: 841.89 };

export function placement(largeur: number, hauteur: number, format: FormatPdf) {
  if (format === 'reel') {
    const f = A4.grand / Math.max(largeur, hauteur);
    const l = largeur * f;
    const h = hauteur * f;
    return { page: { largeur: l, hauteur: h }, image: { x: 0, y: 0, largeur: l, hauteur: h } };
  }
  const page = largeur > hauteur
    ? { largeur: A4.grand, hauteur: A4.petit }
    : { largeur: A4.petit, hauteur: A4.grand };
  const f = Math.min(page.largeur / largeur, page.hauteur / hauteur);
  const l = largeur * f;
  const h = hauteur * f;
  return { page, image: { x: (page.largeur - l) / 2, y: (page.hauteur - h) / 2, largeur: l, hauteur: h } };
}

export async function fabriquerPdf(images: ImageJpeg[], format: FormatPdf, titre: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(titre);
  pdf.setCreator('FOF Scan');
  pdf.setProducer('FOF Scan');
  for (const im of images) {
    const jpg = await pdf.embedJpg(im.octets);
    const p = placement(im.largeur, im.hauteur, format);
    pdf.addPage([p.page.largeur, p.page.hauteur])
      .drawImage(jpg, { x: p.image.x, y: p.image.y, width: p.image.largeur, height: p.image.hauteur });
  }
  return pdf.save();
}
