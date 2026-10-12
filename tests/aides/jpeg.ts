import jpeg from 'jpeg-js';
import type { ImageJpeg, NouvellePage } from '../../src/rangement/modele';
import { coinsPleineImage } from '../../src/traitement/geometrie';

export function jpegFactice(largeur: number, hauteur: number, gris = 200): ImageJpeg {
  const data = Buffer.alloc(largeur * hauteur * 4, gris);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { octets: new Uint8Array(jpeg.encode({ data, width: largeur, height: hauteur }, 80).data), largeur, hauteur };
}

export function pageFactice(gris = 200): NouvellePage {
  const im = jpegFactice(4, 4, gris);
  return { original: im, coins: coinsPleineImage(4, 4), rotation: 0, filtre: 'ameliore', traitee: im, miniature: im };
}
