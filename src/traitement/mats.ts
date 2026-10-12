import type { CV } from './opencv';
import type { Img } from './types';

/** Copie une Mat OpenCV (1, 3 ou 4 canaux) dans une image RGBA indépendante. */
export function versImg(cv: CV, mat: CV): Img {
  const rgba = new cv.Mat();
  try {
    if (mat.channels() === 4) mat.copyTo(rgba);
    else if (mat.channels() === 1) cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
    else cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA);
    return { data: new Uint8ClampedArray(rgba.data), width: rgba.cols, height: rgba.rows };
  } finally {
    rgba.delete();
  }
}
