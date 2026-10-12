import { versImg } from './mats';
import type { CV } from './opencv';
import type { Filtre, Img } from './types';

export function appliquerFiltre(cv: CV, img: Img, filtre: Filtre): Img {
  if (filtre === 'original') return img;
  const mats: CV[] = [];
  const nouvelle = () => { const m = new cv.Mat(); mats.push(m); return m; };
  const src = cv.matFromImageData(img);
  mats.push(src);
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
      const propre = sansOmbre(cv, g, nouvelle);
      const binaire = nouvelle();
      cv.adaptiveThreshold(propre, binaire, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, tailleBloc(img), 10);
      return versImg(cv, binaire);
    }
    // 'ameliore' : on retire l'ombre canal par canal pour garder les couleurs
    const rgb = nouvelle();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const canaux = new cv.MatVector();
    const sortie = new cv.MatVector();
    try {
      cv.split(rgb, canaux);
      for (let i = 0; i < 3; i++) {
        const canal = canaux.get(i);
        mats.push(canal);
        sortie.push_back(sansOmbre(cv, canal, nouvelle));
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

/** Estime le fond (dilatation puis flou médian) et ramène le papier au blanc. */
function sansOmbre(cv: CV, canal: CV, nouvelle: () => CV): CV {
  const fond = nouvelle();
  const diff = nouvelle();
  const noyau = cv.Mat.ones(7, 7, cv.CV_8U);
  try {
    cv.dilate(canal, fond, noyau);
    cv.medianBlur(fond, fond, 21);
    cv.absdiff(canal, fond, diff);
    cv.bitwise_not(diff, diff);
    cv.normalize(diff, diff, 0, 255, cv.NORM_MINMAX);
    return diff;
  } finally {
    noyau.delete();
  }
}

/** Taille de voisinage du seuil adaptatif : impaire, proportionnelle à l'image. */
function tailleBloc(img: Img): number {
  const t = Math.max(15, Math.round(Math.max(img.width, img.height) / 50));
  return t % 2 === 0 ? t + 1 : t;
}
