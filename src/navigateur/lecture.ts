import { empreinte, type LecturePage } from '../lecture/modele';
import type { PageScan } from '../rangement/modele';
import { traitement } from '../traitement/client';
import { chargerImage, lireImg, versCanvas } from './images';

/** Pages lues en 2 400 px au plus : assez fin pour l'écriture, raisonnable pour la mémoire de Safari. */
export const COTE_LECTURE = 2400;

export async function lirePageScan(page: PageScan, maintenant: () => number = Date.now): Promise<LecturePage> {
  const img = await chargerImage(page.traitee.octets);
  const c = versCanvas(img, img.naturalWidth, img.naturalHeight, COTE_LECTURE);
  const r = await traitement().lire(lireImg(c));
  return { ...r, pageId: page.id, documentId: page.documentId, empreinte: empreinte(page.traitee), lu: maintenant() };
}

/** La page telle qu'elle a été lue (même taille, même sens), pour découper les morceaux de photo. */
export async function canvasDePageLue(page: PageScan, l: LecturePage): Promise<HTMLCanvasElement> {
  const img = await chargerImage(page.traitee.octets);
  const c = document.createElement('canvas');
  c.width = l.largeur;
  c.height = l.hauteur;
  const ctx = c.getContext('2d')!;
  // taille avant le quart de tour ; 90 = vers la droite, comme ROTATE_90_CLOCKWISE du lecteur
  const [lw, lh] = l.sens === 0 ? [l.largeur, l.hauteur] : [l.hauteur, l.largeur];
  ctx.translate(l.largeur / 2, l.hauteur / 2);
  ctx.rotate((l.sens * Math.PI) / 180);
  ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh);
  return c;
}
