import { ordonnerCoins } from './geometrie';
import type { CV } from './opencv';
import type { Coins, Img, Point } from './types';

/** Une feuille doit couvrir au moins 15 % de l'image. */
const AIRE_MIN = 0.15;

export function detecterCoins(cv: CV, img: Img): Coins | null {
  const src = cv.matFromImageData(img);
  const gris = new cv.Mat();
  const bords = new cv.Mat();
  const noyau = cv.Mat.ones(5, 5, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchie = new cv.Mat();
  try {
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gris, gris, new cv.Size(5, 5), 0);
    cv.Canny(gris, bords, 50, 150);
    cv.dilate(bords, bords, noyau);
    cv.findContours(bords, contours, hierarchie, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const aireImage = img.width * img.height;
    let meilleur: Coins | null = null;
    let meilleureAire = 0;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      try {
        const aire = cv.contourArea(contour);
        if (aire < AIRE_MIN * aireImage || aire <= meilleureAire) continue;
        cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
        if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
        const points: Point[] = [];
        for (let k = 0; k < 4; k++) points.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
        meilleur = ordonnerCoins(points);
        meilleureAire = aire;
      } finally {
        contour.delete();
        approx.delete();
      }
    }
    return meilleur;
  } finally {
    src.delete(); gris.delete(); bords.delete(); noyau.delete(); contours.delete(); hierarchie.delete();
  }
}
