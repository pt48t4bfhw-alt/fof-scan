import { beforeAll, describe, expect, it } from 'vitest';
import { boitesDepuisCarte, ordonnerQuad, preparerReperage } from '../src/lecture/reperage';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { imageUnie } from './aides/images';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

describe('entrée du repérage', () => {
  it('côtés multiples de 32, BGR normalisé comme PaddleOCR', () => {
    const r = preparerReperage(cv, imageUnie(100, 50, 255));
    expect([r.largeur, r.hauteur]).toEqual([96, 64]);
    expect(r.donnees).toHaveLength(3 * 96 * 64);
    expect(r.donnees[0]).toBeCloseTo((1 - 0.485) / 0.229, 3);
  });
  it('réduit une grande page à 1600 px au plus', () => {
    const r = preparerReperage(cv, imageUnie(3200, 1600, 255));
    expect([r.largeur, r.hauteur]).toEqual([1600, 800]);
  });
});

describe('boîtes depuis la carte', () => {
  const h = 64, w = 128;
  function carte(zones: { x0: number; x1: number; y0: number; y1: number; v: number }[]) {
    const c = new Float32Array(h * w);
    for (const z of zones) for (let y = z.y0; y < z.y1; y++) for (let x = z.x0; x < z.x1; x++) c[y * w + x] = z.v;
    return c;
  }

  it('une bande nette donne une boîte élargie, ramenée à la taille de l\'image ; une bande pâle est écartée', () => {
    const b = boitesDepuisCarte(cv, carte([
      { x0: 10, x1: 60, y0: 30, y1: 40, v: 0.9 },
      { x0: 70, x1: 120, y0: 40, y1: 50, v: 0.5 },
    ]), h, w, 256, 128);
    expect(b).toHaveLength(1);
    expect(b[0].score).toBeGreaterThan(0.8);
    const xs = b[0].quad.map((p) => p[0]), ys = b[0].quad.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThan(20);
    expect(Math.max(...xs)).toBeGreaterThan(118);
    expect(Math.min(...ys)).toBeLessThan(60);
    expect(Math.max(...ys)).toBeGreaterThan(78);
  });

  it('rend les boîtes dans l\'ordre de lecture', () => {
    const b = boitesDepuisCarte(cv, carte([
      { x0: 10, x1: 60, y0: 40, y1: 50, v: 0.9 },
      { x0: 70, x1: 120, y0: 5, y1: 15, v: 0.9 },
      { x0: 10, x1: 50, y0: 6, y1: 14, v: 0.9 },
    ]), h, w, w, h);
    expect(b.map((x) => Math.round(Math.min(...x.quad.map((p) => p[0]))) < 40 ? 'g' : 'd')).toEqual(['g', 'd', 'g']);
    expect(b[2].quad[0][1]).toBeGreaterThan(b[0].quad[0][1]);
  });

  it('ordonne un quadrilatère : haut-gauche, haut-droite, bas-droite, bas-gauche', () => {
    expect(ordonnerQuad([[10, 20], [0, 0], [10, 0], [0, 20]])).toEqual([[0, 0], [10, 0], [10, 20], [0, 20]]);
  });
});
