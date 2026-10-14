import { beforeAll, describe, expect, it } from 'vitest';
import type { LigneLue } from '../src/lecture/modele';
import { choisirMode, dansLeTableau, plusGrandGroupe, rangerDansTableau, tableauDepuisCases, trouverTableau } from '../src/lecture/tableau';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { pageAvecTraits, TABLEAU, type Trait } from './aides/traits';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });
const page = (largeur: number, hauteur: number, traits: Trait[]) => pageAvecTraits(cv, largeur, hauteur, traits);

const ligne = (x: number, y: number, texte: string, confiance = 0.95): LigneLue =>
  ({ rect: { x, y, largeur: 60, hauteur: 20 }, texte, confiance, corrige: false });

describe('trouverTableau', () => {
  it('retrouve les rangées, les colonnes et la case fusionnée', () => {
    const t = trouverTableau(cv, page(600, 500, TABLEAU))!;
    expect(t).not.toBeNull();
    expect([t.rangs, t.cols, t.cases.length]).toEqual([3, 2, 5]);
    expect(t.cases[0]).toMatchObject({ rang: 0, col: 0, rangs: 1, cols: 2 });
    expect(t.cases.slice(1).map((c) => [c.rang, c.col])).toEqual([[1, 0], [1, 1], [2, 0], [2, 1]]);
    expect(t.rect.x).toBeGreaterThan(95);
    expect(t.rect.x + t.rect.largeur).toBeLessThan(505);
  });

  it('écarte une case à cocher isolée', () => {
    const t = trouverTableau(cv, page(600, 500, [...TABLEAU, [540, 20, 570, 20], [540, 50, 570, 50], [540, 20, 540, 50], [570, 20, 570, 50]]))!;
    expect(t.cases).toHaveLength(5);
  });

  it('un tableau coupé par le bord de la photo garde sa première colonne', () => {
    const t = trouverTableau(cv, page(600, 500, [
      [0, 100, 500, 100], [0, 200, 500, 200], [0, 300, 500, 300], [250, 100, 250, 300], [500, 100, 500, 300],
    ]))!;
    expect([t.rangs, t.cols]).toEqual([2, 2]);
  });

  it('une page sans traits n\'a pas de tableau', () => {
    expect(trouverTableau(cv, page(600, 500, []))).toBeNull();
  });
});

describe('rangement et choix du mode', () => {
  it('range chaque ligne dans la case qui contient son centre', () => {
    const t = trouverTableau(cv, page(600, 500, TABLEAU))!;
    const lignes = [ligne(150, 140, 'Titre'), ligne(150, 240, 'Poids'), ligne(350, 240, '252', 0.7), ligne(350, 265, 'kg'), ligne(150, 450, 'Signature')];
    const r = rangerDansTableau(t, lignes);
    expect(r.cases.map((c) => c.texte)).toEqual(['Titre', 'Poids', '252\nkg', '', '']);
    expect(r.cases[2].confiance).toBeCloseTo(0.7);
    expect(r.cases[3].confiance).toBe(1);
    expect(dansLeTableau(r, lignes[4])).toBe(false);
    expect(choisirMode(r)).toBe('tableau');
  });

  it('des carreaux de cahier presque vides restent du texte', () => {
    const carreaux: Trait[] = [];
    for (let x = 25; x <= 575; x += 25) carreaux.push([x, 25, x, 775]);
    for (let y = 25; y <= 775; y += 25) carreaux.push([25, y, 575, y]);
    const t = trouverTableau(cv, page(600, 800, carreaux));
    expect(t).not.toBeNull();
    expect(choisirMode(rangerDansTableau(t!, [ligne(30, 30, 'Audit')]))).toBe('texte');
    expect(choisirMode(null)).toBe('texte');
  });

  it('une case écartée (écriture qui déborde sur les traits) est recréée d\'après la grille', () => {
    const r = (x: number, y: number) => ({ x, y, largeur: 190, hauteur: 90 });
    const t = tableauDepuisCases([r(105, 105), r(305, 105), r(105, 205), r(105, 305), r(305, 305)], 600, 500)!;
    expect([t.rangs, t.cols, t.cases.length]).toEqual([3, 2, 6]);
    const recree = t.cases.find((c) => c.rang === 1 && c.col === 1)!;
    // bords de la case recréée : sur les traits voisins (moyenne des bords des cases autour)
    expect(recree.rect.x).toBeGreaterThanOrEqual(295);
    expect(recree.rect.x).toBeLessThanOrEqual(305);
    expect(recree.rect.y).toBeGreaterThanOrEqual(195);
    expect(recree.rect.y).toBeLessThanOrEqual(205);
  });

  it('une ligne du tableau hors de toute case va dans la case la plus proche', () => {
    const vide = { texte: '', confiance: 1, corrige: false, rang: 0, rangs: 1, cols: 1 };
    const t = {
      rect: { x: 0, y: 0, largeur: 400, hauteur: 100 }, rangs: 1, cols: 2,
      cases: [{ ...vide, col: 0, rect: { x: 0, y: 0, largeur: 150, hauteur: 100 } }, { ...vide, col: 1, rect: { x: 250, y: 0, largeur: 150, hauteur: 100 } }],
    };
    const r = rangerDansTableau(t, [ligne(160, 40, '1200')]); // centre (190, 50) : entre les deux cases
    expect(r.cases.map((c) => c.texte)).toEqual(['1200', '']);
  });

  it('plus grand groupe : les cases qui se touchent', () => {
    const r = (x: number, y: number) => ({ x, y, largeur: 50, hauteur: 30 });
    expect(plusGrandGroupe([r(0, 0), r(52, 0), r(0, 32), r(300, 300)], 6)).toEqual([r(0, 0), r(52, 0), r(0, 32)]);
    expect(plusGrandGroupe([], 6)).toEqual([]);
  });
});
