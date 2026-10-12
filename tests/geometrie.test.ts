import { describe, expect, it } from 'vitest';
import {
  DeclencheurAuto, SuiviStabilite, coinsPleineImage, coinsStables, dimensionsReduites,
  mettreAEchelle, ordonnerCoins, tailleRedressee,
} from '../src/traitement/geometrie';
import type { Coins } from '../src/traitement/types';

const feuille: Coins = [{ x: 60, y: 40 }, { x: 330, y: 55 }, { x: 350, y: 270 }, { x: 45, y: 250 }];

describe('ordonnerCoins', () => {
  it('remet des coins mélangés dans l\'ordre HG, HD, BD, BG', () => {
    expect(ordonnerCoins([feuille[2], feuille[0], feuille[3], feuille[1]])).toEqual(feuille);
  });
  it('fonctionne pour une feuille très tournée', () => {
    const losange = [{ x: 100, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 200 }, { x: 0, y: 100 }];
    const c = ordonnerCoins([losange[3], losange[1], losange[0], losange[2]]);
    expect(new Set(c.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    // sens des aiguilles d'une montre à l'écran
    const aire = c.reduce((s, p, i) => { const q = c[(i + 1) % 4]; return s + p.x * q.y - q.x * p.y; }, 0);
    expect(aire).toBeGreaterThan(0);
  });
  it('refuse autre chose que 4 points', () => {
    expect(() => ordonnerCoins(feuille.slice(0, 3))).toThrow();
  });
});

describe('tailles', () => {
  it('donne les coins de toute l\'image', () => {
    expect(coinsPleineImage(40, 30)).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }]);
  });
  it('met des coins à l\'échelle', () => {
    expect(mettreAEchelle(coinsPleineImage(40, 30), 2)[2]).toEqual({ x: 80, y: 60 });
  });
  it('réduit une image au côté maximum sans l\'agrandir', () => {
    expect(dimensionsReduites(4000, 3000, 3000)).toEqual({ largeur: 3000, hauteur: 2250, facteur: 0.75 });
    expect(dimensionsReduites(800, 600, 3000)).toEqual({ largeur: 800, hauteur: 600, facteur: 1 });
  });
  it('calcule la taille de la feuille redressée', () => {
    const t = tailleRedressee(feuille);
    expect(t.largeur).toBe(Math.round(Math.max(Math.hypot(270, 15), Math.hypot(305, 20))));
    expect(t.hauteur).toBe(Math.round(Math.max(Math.hypot(15, 210), Math.hypot(20, 215))));
    expect(Math.max(...Object.values(tailleRedressee(mettreAEchelle(feuille, 100))))).toBe(3000);
  });
});

describe('stabilité', () => {
  const decale = (c: Coins, d: number) => c.map((p) => ({ x: p.x + d, y: p.y })) as Coins;

  it('compare deux jeux de coins avec un seuil relatif à la diagonale', () => {
    expect(coinsStables(feuille, decale(feuille, 5), 500)).toBe(true);
    expect(coinsStables(feuille, decale(feuille, 20), 500)).toBe(false);
  });

  it('déclare stable après la durée demandée', () => {
    const s = new SuiviStabilite(500, 1000);
    expect(s.ajouter(feuille, 0)).toBe(false);
    expect(s.ajouter(decale(feuille, 3), 600)).toBe(false);
    expect(s.ajouter(decale(feuille, 4), 1000)).toBe(true);
  });

  it('repart de zéro si la feuille bouge ou disparaît', () => {
    const s = new SuiviStabilite(500, 1000);
    s.ajouter(feuille, 0);
    expect(s.ajouter(decale(feuille, 50), 900)).toBe(false);
    expect(s.ajouter(decale(feuille, 50), 1500)).toBe(false);
    expect(s.ajouter(null, 1950)).toBe(false);
    expect(s.ajouter(feuille, 2000)).toBe(false);
  });
});

describe('DeclencheurAuto', () => {
  it('déclenche une fois, puis attend que la page change', () => {
    const d = new DeclencheurAuto(500, 1000);
    d.observer(feuille, 0);
    expect(d.observer(feuille, 1000)).toBe(true);
    expect(d.observer(feuille, 2500)).toBe(false);
    expect(d.observer(feuille, 4000)).toBe(false);
    // la page est retirée puis une nouvelle est posée
    expect(d.observer(null, 4200)).toBe(false);
    d.observer(feuille, 5000);
    expect(d.observer(feuille, 6000)).toBe(true);
  });

  it('après une prise manuelle, ne redéclenche pas sur la même page', () => {
    const d = new DeclencheurAuto(500, 1000);
    d.captureManuelle(feuille);
    d.observer(feuille, 0);
    expect(d.observer(feuille, 2000)).toBe(false);
  });
});
