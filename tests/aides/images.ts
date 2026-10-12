import type { Img, Point } from '../../src/traitement/types';

export function imageUnie(largeur: number, hauteur: number, gris: number): Img {
  const data = new Uint8ClampedArray(largeur * hauteur * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = gris; data[i + 3] = 255; }
  return { data, width: largeur, height: hauteur };
}

/** Fond qui passe de `gauche` à `droite` : simule une ombre. */
export function imageDegrade(largeur: number, hauteur: number, gauche: number, droite: number): Img {
  const img = imageUnie(largeur, hauteur, 0);
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) {
    const v = Math.round(gauche + ((droite - gauche) * x) / (largeur - 1));
    const i = (y * largeur + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  return img;
}

function dansPolygone(x: number, y: number, poly: Point[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

export function remplirPolygone(img: Img, poly: Point[], gris: number): void {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!dansPolygone(x + 0.5, y + 0.5, poly)) continue;
    const i = (y * img.width + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = gris;
  }
}

/** Bruit reproductible (même graine = même bruit). */
export function ajouterBruit(img: Img, amplitude: number, graine: number): void {
  let etat = graine;
  for (let i = 0; i < img.data.length; i += 4) {
    etat = (etat * 1103515245 + 12345) & 0x7fffffff;
    const d = ((etat / 0x7fffffff) * 2 - 1) * amplitude;
    for (let k = 0; k < 3; k++) img.data[i + k] = img.data[i + k] + d;
  }
}

export function lireGris(img: Img, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4];
}

export function moyenneZone(img: Img, x0: number, y0: number, x1: number, y1: number): number {
  let s = 0, n = 0;
  for (let y = Math.floor(y0); y < Math.floor(y1); y++) for (let x = Math.floor(x0); x < Math.floor(x1); x++) {
    s += lireGris(img, x, y); n++;
  }
  return s / n;
}
