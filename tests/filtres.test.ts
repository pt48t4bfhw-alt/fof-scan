import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { appliquerFiltre } from '../src/traitement/filtres';
import { imageDegrade, imageUnie, lireGris, remplirPolygone } from './aides/images';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

/** Papier avec une ombre (120 à gauche, 220 à droite) et trois traits d'écriture noirs de 6 px. */
function papierOmbre() {
  const img = imageDegrade(300, 200, 120, 220);
  for (const x of [50, 150, 250]) remplirPolygone(img, [{ x, y: 70 }, { x: x + 6, y: 70 }, { x: x + 6, y: 130 }, { x, y: 130 }], 0);
  return img;
}

describe('appliquerFiltre', () => {
  it('original : rend la même image', () => {
    const img = imageUnie(10, 10, 100);
    expect(appliquerFiltre(cv, img, 'original')).toBe(img);
  });

  it('gris : rouge = vert = bleu partout', () => {
    const img = imageUnie(50, 50, 0);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 200; img.data[i + 1] = 80; img.data[i + 2] = (i / 4) % 50; }
    const sortie = appliquerFiltre(cv, img, 'gris');
    for (let i = 0; i < sortie.data.length; i += 4) {
      expect(sortie.data[i]).toBe(sortie.data[i + 1]);
      expect(sortie.data[i + 1]).toBe(sortie.data[i + 2]);
    }
  });

  it('noir & blanc : fond blanc malgré l\'ombre, écriture noire', () => {
    const sortie = appliquerFiltre(cv, papierOmbre(), 'nb');
    expect(lireGris(sortie, 53, 100)).toBe(0);
    expect(lireGris(sortie, 253, 100)).toBe(0);
    expect(lireGris(sortie, 100, 100)).toBe(255);
    expect(lireGris(sortie, 20, 30)).toBe(255);
    expect(lireGris(sortie, 200, 30)).toBe(255);
  });

  it('amélioré : l\'ombre disparaît, l\'écriture reste sombre', () => {
    const sortie = appliquerFiltre(cv, papierOmbre(), 'ameliore');
    expect(lireGris(sortie, 20, 30)).toBeGreaterThan(230);
    expect(lireGris(sortie, 280, 30)).toBeGreaterThan(230);
    // le trait clair dans l'ombre reste nettement plus sombre que le papier
    expect(lireGris(sortie, 53, 100)).toBeLessThan(120);
    expect(lireGris(sortie, 253, 100)).toBeLessThan(40);
  });
});
