import { beforeAll, describe, expect, it } from 'vitest';
import { decouperLigne, HAUTEUR_LIGNE, preparerLigne } from '../src/lecture/ligne';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { imageUnie } from './aides/images';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

describe('découpe d\'une ligne', () => {
  it('une boîte droite donne une découpe de sa taille', () => {
    const src = cv.matFromImageData(imageUnie(200, 100, 255));
    const m = decouperLigne(cv, src, [[20, 30], [120, 30], [120, 50], [20, 50]]);
    expect([m.cols, m.rows]).toEqual([100, 20]);
    m.delete(); src.delete();
  });
  it('une découpe bien plus haute que large est couchée', () => {
    const src = cv.matFromImageData(imageUnie(200, 100, 255));
    const m = decouperLigne(cv, src, [[10, 10], [30, 10], [30, 90], [10, 90]]);
    expect([m.cols, m.rows]).toEqual([80, 20]);
    m.delete(); src.delete();
  });
});

describe('entrée de la lecture', () => {
  it('hauteur 48, largeur au moins 320, blanc → 1, complément à 0', () => {
    const ligne = cv.matFromImageData(imageUnie(100, 20, 255));
    const { donnees, largeur } = preparerLigne(cv, ligne);
    expect(largeur).toBe(320);
    expect(donnees).toHaveLength(3 * HAUTEUR_LIGNE * 320);
    expect(donnees[0]).toBeCloseTo(1);
    expect(donnees[239]).toBeCloseTo(1); // 48 × 100 / 20 = 240 colonnes utiles
    expect(donnees[240]).toBe(0);
    ligne.delete();
  });
  it('une longue ligne garde ses proportions', () => {
    const ligne = cv.matFromImageData(imageUnie(1000, 20, 0));
    const { largeur, donnees } = preparerLigne(cv, ligne);
    expect(largeur).toBe(2400);
    expect(donnees[0]).toBeCloseTo(-1);
    ligne.delete();
  });
});
