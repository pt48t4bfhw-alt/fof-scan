import { versImg } from './mats';
import type { CV } from './opencv';
import type { Filtre, Img } from './types';

export function appliquerFiltre(cv: CV, img: Img, filtre: Filtre): Img {
  if (filtre === 'original') return img;
  const mats: CV[] = [];
  const garder = <T extends CV>(m: T): T => { mats.push(m); return m; };
  const nouvelle = () => garder(new cv.Mat());
  const src = garder(cv.matFromImageData(img));
  try {
    if (filtre === 'gris') {
      const g = nouvelle();
      cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY);
      cv.normalize(g, g, 0, 255, cv.NORM_MINMAX);
      return versImg(cv, g);
    }
    if (filtre === 'nb') {
      const g = nouvelle();
      cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY);
      const propre = garder(sansOmbre(cv, g));
      cv.GaussianBlur(propre, propre, new cv.Size(3, 3), 0);
      const binaire = nouvelle();
      // le fond étant aplani, un seuil unique (Otsu) sépare proprement l'encre du papier
      cv.threshold(propre, binaire, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      return versImg(cv, binaire);
    }
    // 'ameliore' : on retire l'ombre canal par canal pour garder les couleurs, puis on blanchit le papier
    const rgb = nouvelle();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const canaux = new cv.MatVector();
    const sortie = new cv.MatVector();
    const lut = garder(courbe(cv, 235, 1.8));
    try {
      cv.split(rgb, canaux);
      for (let i = 0; i < 3; i++) {
        const canal = garder(canaux.get(i));
        const propre = garder(sansOmbre(cv, canal));
        cv.LUT(propre, lut, propre);
        sortie.push_back(propre);
      }
      const fusion = nouvelle();
      cv.merge(sortie, fusion);
      return versImg(cv, fusion);
    } finally {
      canaux.delete();
      sortie.delete();
    }
  } finally {
    mats.forEach((m) => m.delete());
  }
}

/**
 * Ramène le papier au blanc en divisant par son fond. Le fond est estimé sur une image
 * réduite 8 fois : même un trait épais (titre, stylo appuyé) y disparaît, alors que l'ombre
 * reste. Diviser (au lieu de soustraire) garde l'encre pleine et proportionnée.
 */
function sansOmbre(cv: CV, canal: CV): CV {
  const petit = new cv.Mat();
  const fond = new cv.Mat();
  const noyau = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
  const resultat = new cv.Mat();
  try {
    cv.resize(canal, petit, new cv.Size(Math.max(1, Math.round(canal.cols / 8)), Math.max(1, Math.round(canal.rows / 8))), 0, 0, cv.INTER_AREA);
    cv.dilate(petit, petit, noyau);
    cv.medianBlur(petit, petit, 7);
    cv.resize(petit, fond, new cv.Size(canal.cols, canal.rows), 0, 0, cv.INTER_LINEAR);
    cv.divide(canal, fond, resultat, 255);
    return resultat;
  } finally {
    petit.delete(); fond.delete(); noyau.delete();
  }
}

/** Table de correspondance : tout ce qui dépasse `blanc` devient blanc, l'encre est foncée (gamma). */
function courbe(cv: CV, blanc: number, gamma: number): CV {
  const valeurs: number[] = [];
  for (let v = 0; v < 256; v++) valeurs.push(Math.round(255 * Math.pow(Math.min(1, v / blanc), gamma)));
  return cv.matFromArray(1, 256, cv.CV_8U, valeurs);
}
