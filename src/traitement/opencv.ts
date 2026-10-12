import cvModule from '@techstark/opencv-js';

/** Les types livrés avec @techstark/opencv-js sont incomplets : on travaille en `any`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CV = any;

let chargement: Promise<{ cv: CV }> | null = null;

/**
 * Attend qu'OpenCV soit prêt. Le résultat est enveloppé dans un objet : l'objet OpenCV
 * possède parfois une méthode `then`, et le renvoyer tel quel ferait boucler la promesse.
 */
export function chargerOpenCV(): Promise<{ cv: CV }> {
  if (!chargement) {
    chargement = new Promise((resolve) => {
      const m: CV = cvModule;
      if (m instanceof Promise) { m.then((cv: CV) => resolve({ cv })); return; }
      if (m.Mat) { resolve({ cv: m }); return; }
      m.onRuntimeInitialized = () => resolve({ cv: m });
    });
  }
  return chargement;
}
