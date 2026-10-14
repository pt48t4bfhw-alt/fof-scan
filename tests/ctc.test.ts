import { describe, expect, it } from 'vitest';
import { decoderCTC, lireDictionnaire } from '../src/lecture/ctc';
import { empreinte, type Rect } from '../src/lecture/modele';
import { enRangees } from '../src/lecture/ordre';
import { jpegFactice } from './aides/jpeg';

describe('dictionnaire', () => {
  it('un caractère par ligne, l\'espace ajoutée à la fin', () => {
    expect(lireDictionnaire('a\nb\r\né\n')).toEqual(['a', 'b', 'é', ' ']);
  });
  it('garde un caractère blanc particulier (espace idéographique)', () => {
    expect(lireDictionnaire('a\n　\nb\n')).toEqual(['a', '　', 'b', ' ']);
  });
});

describe('décodage CTC', () => {
  // classes : 0 = blanc, 1 = a, 2 = b, 3 = espace
  const dict = ['a', 'b', ' '];
  const pas = (...classes: number[]) => {
    const p = new Float32Array(classes.length * 4);
    classes.forEach((c, t) => { p[t * 4 + c] = 0.9; });
    return p;
  };

  it('saute les blancs et les répétitions, garde les doubles séparées par un blanc', () => {
    const r = decoderCTC(pas(1, 1, 0, 1, 2, 3, 2), 7, 4, dict);
    expect(r.texte).toBe('aab b');
    expect(r.confiance).toBeCloseTo(0.9);
  });

  it('une ligne vide rend un texte vide et une confiance nulle', () => {
    expect(decoderCTC(pas(0, 0, 0), 3, 4, dict)).toEqual({ texte: '', confiance: 0 });
  });
});

describe('empreinte', () => {
  it('change quand l\'image change, pas quand on la relit', () => {
    const a = jpegFactice(20, 20, 200);
    expect(empreinte(a)).toBe(empreinte({ ...a, octets: a.octets.slice() }));
    expect(empreinte(a)).not.toBe(empreinte(jpegFactice(20, 20, 50)));
  });
});

describe('rangées', () => {
  const r = (x: number, y: number, hauteur = 20): Rect => ({ x, y, largeur: 50, hauteur });
  it('regroupe les éléments d\'une même hauteur, de haut en bas puis de gauche à droite', () => {
    const items = [r(200, 104), r(10, 100), r(10, 40), r(300, 46)];
    expect(enRangees(items, (i) => i)).toEqual([[r(10, 40), r(300, 46)], [r(10, 100), r(200, 104)]]);
  });
});
