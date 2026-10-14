import { describe, expect, it } from 'vitest';
import { borner, doubleToucher, ECHELLE_DOUBLE, ECHELLE_MAX, pageApresGlisser, tailleContenue, VUE_INITIALE, zoomerAutour } from '../src/ecrans/zoom';

const cadre = { largeur: 400, hauteur: 800 };

describe('tailleContenue', () => {
  it('une page A4 tient dans l\'écran sans déformation', () => {
    const t = tailleContenue({ largeur: 2480, hauteur: 3508 }, cadre);
    expect(t.largeur).toBeCloseTo(400);
    expect(t.hauteur).toBeCloseTo(565.8, 0);
  });
  it('une page en largeur est limitée par la largeur', () => {
    expect(tailleContenue({ largeur: 3000, hauteur: 1500 }, cadre)).toEqual({ largeur: 400, hauteur: 200 });
  });
});

describe('zoom', () => {
  const contenue = { largeur: 400, hauteur: 600 };

  it('zoomer autour d\'un point garde ce point sous le doigt', () => {
    const p = { x: 100, y: -50 }; // par rapport au centre de l'écran
    const v = zoomerAutour(VUE_INITIALE, 2, p, contenue, cadre);
    expect(v.echelle).toBe(2);
    // le point de l'image qui était sous le doigt : (p - translation) / échelle reste le même
    expect((p.x - v.x) / v.echelle).toBeCloseTo(p.x);
    expect((p.y - v.y) / v.echelle).toBeCloseTo(p.y);
  });

  it('l\'échelle reste entre 1 et le maximum', () => {
    expect(zoomerAutour(VUE_INITIALE, 0.3, { x: 0, y: 0 }, contenue, cadre)).toEqual(VUE_INITIALE);
    expect(zoomerAutour(VUE_INITIALE, 50, { x: 0, y: 0 }, contenue, cadre).echelle).toBe(ECHELLE_MAX);
  });

  it('borner : l\'image agrandie ne laisse pas de vide sur les côtés', () => {
    // à ×2 : 800 × 1200 dans un cadre 400 × 800 → déplacement max 200 en x, 200 en y
    expect(borner({ echelle: 2, x: 500, y: -900 }, contenue, cadre)).toEqual({ echelle: 2, x: 200, y: -200 });
    // à ×1 la hauteur (600) tient dans le cadre (800) : pas de déplacement vertical possible
    expect(borner({ echelle: 1, x: 30, y: 40 }, contenue, cadre)).toEqual(VUE_INITIALE);
  });

  it('double toucher : agrandit autour du doigt, puis revient à la taille normale', () => {
    const v = doubleToucher(VUE_INITIALE, { x: 50, y: 0 }, contenue, cadre);
    expect(v.echelle).toBe(ECHELLE_DOUBLE);
    expect(v.x).toBeLessThan(0); // l'image glisse pour garder le point touché sous le doigt
    expect(doubleToucher(v, { x: 0, y: 0 }, contenue, cadre)).toEqual(VUE_INITIALE);
  });
});

describe('pageApresGlisser', () => {
  it('change de page au-delà d\'un cinquième de l\'écran, sans sortir du document', () => {
    expect(pageApresGlisser(1, 3, -120, 400)).toBe(2);
    expect(pageApresGlisser(1, 3, 120, 400)).toBe(0);
    expect(pageApresGlisser(1, 3, -50, 400)).toBe(1);
    expect(pageApresGlisser(2, 3, -300, 400)).toBe(2);
    expect(pageApresGlisser(0, 3, 300, 400)).toBe(0);
  });
});
