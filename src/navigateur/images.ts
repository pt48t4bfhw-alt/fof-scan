import type { ImageJpeg } from '../rangement/modele';
import { dimensionsReduites } from '../traitement/geometrie';
import type { Img } from '../traitement/types';

/**
 * Décode une image (Safari applique l'orientation EXIF des photos de l'iPhone).
 * On attend `onload` et non `img.decode()` : quand la page est cachée, Chrome ne termine
 * jamais `decode()`.
 */
export async function chargerImage(source: Blob | Uint8Array): Promise<HTMLImageElement> {
  const blob = source instanceof Blob ? source : new Blob([source], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((ok, ko) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ko(new Error("Impossible de lire cette image."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function versCanvas(source: CanvasImageSource, largeurSrc: number, hauteurSrc: number, coteMax: number): HTMLCanvasElement {
  const { largeur, hauteur } = dimensionsReduites(largeurSrc, hauteurSrc, coteMax);
  const c = document.createElement('canvas');
  c.width = largeur;
  c.height = hauteur;
  c.getContext('2d')!.drawImage(source, 0, 0, largeur, hauteur);
  return c;
}

export function lireImg(c: HTMLCanvasElement): Img {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height };
}

export function imgVersCanvas(img: Img): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return c;
}

export async function canvasVersJpeg(c: HTMLCanvasElement, qualite: number): Promise<ImageJpeg> {
  const blob = await new Promise<Blob>((ok, ko) =>
    c.toBlob((b) => (b ? ok(b) : ko(new Error('Encodage JPEG impossible'))), 'image/jpeg', qualite));
  return { octets: new Uint8Array(await blob.arrayBuffer()), largeur: c.width, hauteur: c.height };
}

export async function reencoder(im: ImageJpeg, coteMax: number, qualite: number): Promise<ImageJpeg> {
  const img = await chargerImage(im.octets);
  return canvasVersJpeg(versCanvas(img, img.naturalWidth, img.naturalHeight, coteMax), qualite);
}

/** Tourne une photo d'un quart de tour vers la droite : le point (x, y) devient (hauteur − y, x). */
export async function tournerJpeg(im: ImageJpeg): Promise<ImageJpeg> {
  const img = await chargerImage(im.octets);
  const c = document.createElement('canvas');
  c.width = img.naturalHeight;
  c.height = img.naturalWidth;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  return canvasVersJpeg(c, 0.92);
}

/** Adresse temporaire pour afficher une image ; la libérer avec URL.revokeObjectURL. */
export function urlImage(im: ImageJpeg): string {
  return URL.createObjectURL(new Blob([im.octets], { type: 'image/jpeg' }));
}
