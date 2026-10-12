import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { redresser } from '../src/traitement/redressement';
import { tailleRedressee } from '../src/traitement/geometrie';
import type { Coins } from '../src/traitement/types';
import { imageUnie, moyenneZone, remplirPolygone } from './aides/images';

const vrais: Coins = [{ x: 60, y: 40 }, { x: 330, y: 55 }, { x: 350, y: 270 }, { x: 45, y: 250 }];
let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

/** Feuille blanche avec un carré noir près de son coin haut-gauche. */
function scene() {
  const img = imageUnie(400, 300, 40);
  remplirPolygone(img, vrais, 230);
  remplirPolygone(img, [{ x: 70, y: 55 }, { x: 110, y: 55 }, { x: 110, y: 95 }, { x: 70, y: 95 }], 0);
  return img;
}

describe('redresser', () => {
  it('produit un rectangle de la taille de la feuille, marque en haut à gauche', () => {
    const sortie = redresser(cv, scene(), vrais, 0);
    const { largeur, hauteur } = tailleRedressee(vrais);
    expect(sortie.width).toBe(largeur);
    expect(sortie.height).toBe(hauteur);
    const w = sortie.width, h = sortie.height;
    expect(moyenneZone(sortie, 0, 0, w * 0.25, h * 0.25)).toBeLessThan(150);
    expect(moyenneZone(sortie, w * 0.4, h * 0.4, w * 0.6, h * 0.6)).toBeGreaterThan(200);
  });

  it('tourne d\'un quart de tour : la marque passe en haut à droite', () => {
    const sortie = redresser(cv, scene(), vrais, 90);
    const { largeur, hauteur } = tailleRedressee(vrais);
    expect(sortie.width).toBe(hauteur);
    expect(sortie.height).toBe(largeur);
    const w = sortie.width, h = sortie.height;
    expect(moyenneZone(sortie, w * 0.75, 0, w, h * 0.25)).toBeLessThan(150);
    expect(moyenneZone(sortie, 0, 0, w * 0.25, h * 0.25)).toBeGreaterThan(200);
  });

  it('respecte le côté maximum', () => {
    const sortie = redresser(cv, scene(), vrais, 0, 100);
    expect(Math.max(sortie.width, sortie.height)).toBe(100);
  });
});
