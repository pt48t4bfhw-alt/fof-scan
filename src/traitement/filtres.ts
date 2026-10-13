import { versImg } from './mats';
import type { CV } from './opencv';
import { estNeutre, REGLAGES_NEUTRES, type Filtre, type Img, type Reglages } from './types';

/**
 * Applique un mode de CamScanner puis les curseurs (luminosité, contraste, détail).
 * N&B fait exception : luminosité et contraste agissent avant le seuil, pour garder du pur noir et blanc.
 */
export function appliquerFiltre(cv: CV, img: Img, filtre: Filtre, reglages: Reglages = REGLAGES_NEUTRES): Img {
  if (filtre === 'original' && estNeutre(reglages)) return img;
  const mats: CV[] = [];
  const garder = <T extends CV>(m: T): T => { mats.push(m); return m; };
  const nouvelle = () => garder(new cv.Mat());
  const src = garder(cv.matFromImageData(img));
  const cote = Math.max(img.width, img.height);
  try {
    if (filtre === 'nb') return versImg(cv, noirEtBlanc(cv, src, cote, reglages, nouvelle, garder));
    let resultat: CV;
    if (filtre === 'gris') {
      resultat = nouvelle();
      cv.cvtColor(src, resultat, cv.COLOR_RGBA2GRAY);
      cv.normalize(resultat, resultat, 0, 255, cv.NORM_MINMAX);
    } else {
      const rgb = nouvelle();
      cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
      resultat = filtre === 'eclaircir' ? eclaircir(cv, rgb, nouvelle, garder)
        : filtre === 'ameliore' ? couleurMagique(cv, rgb, cote, nouvelle, garder)
        : rgb;
    }
    luminositeContraste(cv, resultat, reglages);
    if (reglages.detail > 0) resultat = nettete(cv, resultat, cote, (reglages.detail / 100) * 1.5, nouvelle);
    return versImg(cv, resultat);
  } finally {
    mats.forEach((m) => m.delete());
  }
}

/** Couleur magique : ombre retirée canal par canal (couleurs gardées), papier blanchi en douceur, texte net. */
function couleurMagique(cv: CV, rgb: CV, cote: number, nouvelle: () => CV, garder: <T>(m: T) => T): CV {
  const canaux = new cv.MatVector();
  const sortie = new cv.MatVector();
  const lut = garder(courbe(cv, 248, 1.3));
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
    return nettete(cv, fusion, cote, 0.8, nouvelle);
  } finally {
    canaux.delete();
    sortie.delete();
  }
}

/**
 * Éclaircir (pages en couleur) : on n'agit que sur la luminosité (canal L de Lab), à moitié
 * débarrassée de l'ombre puis éclaircie ; les couleurs (canaux a et b) ne sont pas touchées.
 */
function eclaircir(cv: CV, rgb: CV, nouvelle: () => CV, garder: <T>(m: T) => T): CV {
  const lab = nouvelle();
  cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
  const canaux = new cv.MatVector();
  const assemblage = new cv.MatVector();
  try {
    cv.split(lab, canaux);
    const L = garder(canaux.get(0));
    const a = garder(canaux.get(1));
    const b = garder(canaux.get(2));
    const sansOmbreL = garder(sansOmbre(cv, L));
    const melange = nouvelle();
    cv.addWeighted(sansOmbreL, 0.6, L, 0.4, 0, melange);
    const lut = garder(cv.matFromArray(1, 256, cv.CV_8U, Array.from({ length: 256 }, (_, v) => Math.round(255 * Math.pow(v / 255, 0.8)))));
    cv.LUT(melange, lut, melange);
    assemblage.push_back(melange); assemblage.push_back(a); assemblage.push_back(b);
    const lab2 = nouvelle();
    cv.merge(assemblage, lab2);
    const sortie = nouvelle();
    cv.cvtColor(lab2, sortie, cv.COLOR_Lab2RGB);
    return sortie;
  } finally {
    canaux.delete();
    assemblage.delete();
  }
}

/** N&B : seuil local sur la page sans ombre ; papier très clair forcé en blanc, zones très foncées pleines. */
function noirEtBlanc(cv: CV, src: CV, cote: number, reglages: Reglages, nouvelle: () => CV, garder: <T>(m: T) => T): CV {
  const g = nouvelle();
  cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY);
  const propre = garder(sansOmbre(cv, g));
  luminositeContraste(cv, propre, reglages);
  cv.GaussianBlur(propre, propre, new cv.Size(3, 3), 0);
  // Seuil local : un texte gris clair (imprimé pâle, reflet) reste noir à côté du papier.
  const binaire = nouvelle();
  const bloc = Math.max(15, Math.round(cote / 40)) | 1;
  cv.adaptiveThreshold(propre, binaire, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, bloc, 16);
  // Le papier très clair reste blanc (pas de grain)…
  const clair = nouvelle();
  cv.threshold(propre, clair, 238, 255, cv.THRESH_BINARY);
  cv.bitwise_or(binaire, clair, binaire);
  // …et les grandes zones foncées (boutons, gros titres) restent pleines.
  const pasSombre = nouvelle();
  cv.threshold(propre, pasSombre, 110, 255, cv.THRESH_BINARY);
  cv.bitwise_and(binaire, pasSombre, binaire);
  cv.medianBlur(binaire, binaire, cote > 2000 ? 5 : 3);
  return binaire;
}

/** Luminosité (décalage) et contraste (pente autour du gris moyen), sur place. */
function luminositeContraste(cv: CV, m: CV, r: Reglages): void {
  if (r.luminosite === 0 && r.contraste === 0) return;
  const pente = 1 + (r.contraste / 100) * 1.5;
  m.convertTo(m, -1, pente, r.luminosite * 1.5 + 128 * (1 - pente));
}

/** Netteté par masque flou ; le flou suit la taille de la page. */
function nettete(cv: CV, m: CV, cote: number, force: number, nouvelle: () => CV): CV {
  const flou = nouvelle();
  cv.GaussianBlur(m, flou, new cv.Size(0, 0), Math.max(1, cote / 740));
  const net = nouvelle();
  cv.addWeighted(m, 1 + force, flou, -force, 0, net);
  return net;
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
