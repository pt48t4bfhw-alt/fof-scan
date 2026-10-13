import { describe, expect, it } from 'vitest';
import { aimanterCoin, aimanterCote, type Masque } from '../src/traitement/aimant';
import type { Coins } from '../src/traitement/types';

/** Masque des bords : le contour d'une feuille (40,30)–(160,120), traits de 3 px, à l'échelle donnée. */
function masqueFeuille(echelle = 1): Masque {
  const largeur = Math.round(200 * echelle), hauteur = Math.round(150 * echelle);
  const data = new Uint8Array(largeur * hauteur);
  const allumer = (x: number, y: number) => {
    const mx = Math.round(x * echelle), my = Math.round(y * echelle);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = mx + dx, Y = my + dy;
      if (X >= 0 && Y >= 0 && X < largeur && Y < hauteur) data[Y * largeur + X] = 255;
    }
  };
  for (let x = 40; x <= 160; x += 0.5) { allumer(x, 30); allumer(x, 120); }
  for (let y = 30; y <= 120; y += 0.5) { allumer(40, y); allumer(160, y); }
  return { data, largeur, hauteur, echelle };
}

const vraie: Coins = [{ x: 40, y: 30 }, { x: 160, y: 30 }, { x: 160, y: 120 }, { x: 40, y: 120 }];
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('aimantation d\'un coin', () => {
  it('un coin lâché près du vrai coin de la feuille vient s\'y coller', () => {
    const lache: Coins = [{ x: 46, y: 37 }, vraie[1], vraie[2], vraie[3]];
    const r = aimanterCoin(lache, 0, masqueFeuille(), 10);
    expect(distance(r[0], vraie[0])).toBeLessThan(2.5);
    expect(r.slice(1)).toEqual(vraie.slice(1));
  });

  it('marche aussi avec un masque à demi-résolution', () => {
    const lache: Coins = [vraie[0], vraie[1], { x: 154, y: 114 }, vraie[3]];
    const r = aimanterCoin(lache, 2, masqueFeuille(0.5), 10);
    expect(distance(r[2], vraie[2])).toBeLessThan(3);
  });

  it('entre deux bords d\'égale qualité (couverture du carnet et reçu), il prend le plus proche du doigt', () => {
    const m = masqueFeuille();
    // un second bord vertical complet, 15 px plus à gauche (la couverture du carnet), relié au bord du haut
    for (let y = 0; y < 150; y++) for (let x = 24; x <= 26; x++) m.data[y * m.largeur + x] = 255;
    for (let x = 24; x <= 40; x++) for (let y = 29; y <= 31; y++) m.data[y * m.largeur + x] = 255;
    // le coin bas-gauche est posé entre les deux bords : les deux coins candidats se valent
    const bas = { x: 32, y: 120 };
    const lache: Coins = [{ x: 44, y: 35 }, vraie[1], vraie[2], bas];
    const r = aimanterCoin(lache, 0, m, 25);
    expect(distance(r[0], vraie[0])).toBeLessThan(3);
    // lâché plus près de la couverture, il va sur la couverture
    const r2 = aimanterCoin([{ x: 21, y: 35 }, vraie[1], vraie[2], bas], 0, m, 25);
    expect(distance(r2[0], { x: 25, y: 30 })).toBeLessThan(3);
  });

  it('loin de tout bord, le coin ne bouge pas (on respecte le geste)', () => {
    const lache: Coins = [{ x: 90, y: 75 }, vraie[1], vraie[2], vraie[3]];
    expect(aimanterCoin(lache, 0, masqueFeuille(), 10)).toEqual(lache);
  });

  it('sans aucun bord, rien ne bouge', () => {
    const vide: Masque = { data: new Uint8Array(200 * 150), largeur: 200, hauteur: 150, echelle: 1 };
    const lache: Coins = [{ x: 46, y: 37 }, vraie[1], vraie[2], vraie[3]];
    expect(aimanterCoin(lache, 0, vide, 10)).toEqual(lache);
  });
});

describe('aimantation d\'un côté', () => {
  it('le côté du haut lâché un peu trop bas remonte sur le bord de la feuille', () => {
    const lache: Coins = [{ x: 40, y: 38 }, { x: 160, y: 38 }, vraie[2], vraie[3]];
    const r = aimanterCote(lache, 0, masqueFeuille(), 10);
    expect(Math.abs(r[0].y - 30)).toBeLessThan(2);
    expect(Math.abs(r[1].y - 30)).toBeLessThan(2);
    expect(r[2]).toEqual(vraie[2]);
  });

  it('un côté lâché loin de tout bord ne bouge pas', () => {
    const lache: Coins = [{ x: 40, y: 70 }, { x: 160, y: 70 }, vraie[2], vraie[3]];
    expect(aimanterCote(lache, 0, masqueFeuille(), 10)).toEqual(lache);
  });
});
