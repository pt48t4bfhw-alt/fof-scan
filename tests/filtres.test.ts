import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { appliquerFiltre } from '../src/traitement/filtres';
import { REGLAGES_NEUTRES, type Img } from '../src/traitement/types';
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

  it('un trait épais (titre, stylo appuyé) reste plein et foncé, il ne devient pas creux', () => {
    // feuille 1200 x 800 : bande noire de 40 px, comme un gros titre sur une photo de 3 000 px
    const img = imageDegrade(1200, 800, 150, 225);
    remplirPolygone(img, [{ x: 300, y: 380 }, { x: 900, y: 380 }, { x: 900, y: 420 }, { x: 300, y: 420 }], 20);
    for (const filtre of ['ameliore', 'nb'] as const) {
      const sortie = appliquerFiltre(cv, img, filtre);
      expect(lireGris(sortie, 600, 400), `${filtre} : centre du trait`).toBeLessThan(60);
      expect(lireGris(sortie, 600, 200), `${filtre} : papier`).toBeGreaterThan(230);
    }
  });

  it('noir & blanc : un texte gris clair (imprimé pâle, reflet) reste visible à côté d\'un texte noir', () => {
    const img = imageUnie(600, 400, 220);
    for (const x of [100, 130, 160]) remplirPolygone(img, [{ x, y: 80 }, { x: x + 6, y: 80 }, { x: x + 6, y: 140 }, { x, y: 140 }], 30);
    for (const x of [100, 130, 160]) remplirPolygone(img, [{ x, y: 240 }, { x: x + 6, y: 240 }, { x: x + 6, y: 300 }, { x, y: 300 }], 165);
    const sortie = appliquerFiltre(cv, img, 'nb');
    expect(lireGris(sortie, 103, 110), 'texte noir').toBe(0);
    expect(lireGris(sortie, 103, 270), 'texte gris clair').toBe(0);
    expect(lireGris(sortie, 400, 200), 'papier').toBe(255);
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

/** Papier rose (comme l'affichette) avec une ombre à gauche et du texte noir. */
function papierRose(): Img {
  const img = imageUnie(300, 200, 0);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 300; x++) {
    const ombre = 0.7 + (0.3 * x) / 299;
    const i = (y * 300 + x) * 4;
    img.data[i] = 235 * ombre; img.data[i + 1] = 160 * ombre; img.data[i + 2] = 200 * ombre;
  }
  remplirPolygone(img, [{ x: 140, y: 80 }, { x: 146, y: 80 }, { x: 146, y: 130 }, { x: 140, y: 130 }], 20);
  return img;
}
const moyenne = (img: Img) => { let s = 0; for (let i = 0; i < img.data.length; i += 4) s += img.data[i]; return s / (img.data.length / 4); };
const ecartType = (img: Img) => {
  const m = moyenne(img); let s = 0;
  for (let i = 0; i < img.data.length; i += 4) s += (img.data[i] - m) ** 2;
  return Math.sqrt(s / (img.data.length / 4));
};
/** Somme des écarts entre pixels voisins : grandit quand l'image est plus nette. */
const energie = (img: Img) => { let s = 0; for (let i = 4; i < img.data.length; i += 4) s += Math.abs(img.data[i] - img.data[i - 4]); return s; };
const rougeMoinsVert = (img: Img, x: number, y: number) => { const i = (y * img.width + x) * 4; return img.data[i] - img.data[i + 1]; };

describe('modes CamScanner et curseurs', () => {
  it('Éclaircir éclaircit la page en gardant sa couleur (le papier rose reste rose)', () => {
    const src = papierRose();
    const eclairci = appliquerFiltre(cv, src, 'eclaircir');
    expect(moyenne(eclairci)).toBeGreaterThan(moyenne(src) + 10);
    expect(rougeMoinsVert(eclairci, 250, 30)).toBeGreaterThan(30);
    // à l'inverse, Couleur magique blanchit le papier
    expect(rougeMoinsVert(appliquerFiltre(cv, src, 'ameliore'), 250, 30)).toBeLessThan(25);
    // et le texte reste foncé
    expect(lireGris(eclairci, 143, 105)).toBeLessThan(90);
  });

  it('sans réglage, Original rend la même image', () => {
    const img = imageUnie(10, 10, 100);
    expect(appliquerFiltre(cv, img, 'original', REGLAGES_NEUTRES)).toBe(img);
  });

  it('Luminosité éclaircit (+) ou assombrit (−)', () => {
    const src = papierOmbre();
    const base = moyenne(appliquerFiltre(cv, src, 'gris'));
    expect(moyenne(appliquerFiltre(cv, src, 'gris', { ...REGLAGES_NEUTRES, luminosite: 40 }))).toBeGreaterThan(base + 20);
    expect(moyenne(appliquerFiltre(cv, src, 'gris', { ...REGLAGES_NEUTRES, luminosite: -40 }))).toBeLessThan(base - 20);
  });

  it('Contraste écarte les clairs et les foncés', () => {
    const src = imageDegrade(300, 200, 90, 170);
    expect(ecartType(appliquerFiltre(cv, src, 'original', { ...REGLAGES_NEUTRES, contraste: 40 })))
      .toBeGreaterThan(ecartType(src) * 1.25);
  });

  it('Détail rend l\'image plus nette', () => {
    const src = papierOmbre();
    const base = appliquerFiltre(cv, src, 'gris');
    expect(energie(appliquerFiltre(cv, src, 'gris', { ...REGLAGES_NEUTRES, detail: 100 }))).toBeGreaterThan(energie(base) * 1.2);
  });

  it('N&B reste en pur noir et blanc même avec des réglages', () => {
    const sortie = appliquerFiltre(cv, papierOmbre(), 'nb', { luminosite: 20, contraste: 20, detail: 50 });
    for (let i = 0; i < sortie.data.length; i += 4) expect([0, 255]).toContain(sortie.data[i]);
  });
});
