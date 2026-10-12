import { tailleRedressee } from './geometrie';
import { versImg } from './mats';
import type { CV } from './opencv';
import type { Coins, Img, Rotation } from './types';

export function redresser(cv: CV, img: Img, coins: Coins, rotation: Rotation, coteMax = 3000): Img {
  const { largeur, hauteur } = tailleRedressee(coins, coteMax);
  const src = cv.matFromImageData(img);
  const droit = new cv.Mat();
  const tourne = new cv.Mat();
  const de = cv.matFromArray(4, 1, cv.CV_32FC2, coins.flatMap((p) => [p.x, p.y]));
  const vers = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, largeur, 0, largeur, hauteur, 0, hauteur]);
  const matrice = cv.getPerspectiveTransform(de, vers);
  try {
    cv.warpPerspective(src, droit, matrice, new cv.Size(largeur, hauteur), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    if (rotation === 0) return versImg(cv, droit);
    const code = rotation === 90 ? cv.ROTATE_90_CLOCKWISE : rotation === 180 ? cv.ROTATE_180 : cv.ROTATE_90_COUNTERCLOCKWISE;
    cv.rotate(droit, tourne, code);
    return versImg(cv, tourne);
  } finally {
    src.delete(); droit.delete(); tourne.delete(); de.delete(); vers.delete(); matrice.delete();
  }
}
