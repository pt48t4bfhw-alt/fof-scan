import { beforeAll, describe, expect, it } from 'vitest';
import { Lecteur, pageCouchee, rectDe, tournerImg, type SessionOnnx } from '../src/lecture/lecteur';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { imageUnie } from './aides/images';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

class Tensor { constructor(public type: string, public data: Float32Array, public dims: number[]) {} }
const ort = { Tensor };

/** Repérage simulé : une bande de texte horizontale si l'image est en largeur, verticale sinon. */
const reperage: SessionOnnx = {
  inputNames: ['x'], outputNames: ['y'],
  async run(e) {
    const [, , h, w] = (e.x as Tensor).dims;
    const carte = new Float32Array(h * w);
    const paysage = w > h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dedans = paysage
        ? y >= h * 0.4 && y < h * 0.6 && x >= w * 0.1 && x < w * 0.9
        : x >= w * 0.4 && x < w * 0.6 && y >= h * 0.1 && y < h * 0.9;
      if (dedans) carte[y * w + x] = 0.95;
    }
    return { y: { data: carte, dims: [1, 1, h, w] } };
  },
};

/** Lecture simulée : « ab » à 0,9 (dictionnaire a, b, espace → 4 classes). */
function lectureSimulee() {
  const s = {
    inputNames: ['x'], outputNames: ['y'], appels: 0,
    async run() {
      s.appels++;
      const p = new Float32Array(3 * 4);
      p[0 * 4 + 1] = 0.9; p[1 * 4 + 0] = 0.9; p[2 * 4 + 2] = 0.9;
      return { y: { data: p, dims: [1, 3, 4] } };
    },
  };
  return s;
}
const dict = ['a', 'b', ' '];

describe('Lecteur', () => {
  it('page droite : lit la ligne, garde le sens', async () => {
    const l = new Lecteur(ort, reperage, lectureSimulee(), dict);
    const r = await l.lire(cv, imageUnie(256, 128, 255));
    expect(r.sens).toBe(0);
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0]).toMatchObject({ texte: 'ab' });
    expect(r.lignes[0].confiance).toBeCloseTo(0.9);
    expect([r.img.width, r.img.height]).toEqual([256, 128]);
  });

  it('page couchée : essaie les deux quarts de tour et garde le meilleur', async () => {
    const l = new Lecteur(ort, reperage, lectureSimulee(), dict);
    const r = await l.lire(cv, imageUnie(128, 256, 255));
    expect(r.sens).toBe(90);
    expect([r.img.width, r.img.height]).toEqual([256, 128]);
    expect(r.lignes.map((x) => x.texte)).toEqual(['ab']);
  });

  it('deux lectures demandées en même temps passent l\'une après l\'autre', async () => {
    const l = new Lecteur(ort, reperage, lectureSimulee(), dict);
    const [a, b] = await Promise.all([l.lire(cv, imageUnie(256, 128, 255)), l.lire(cv, imageUnie(256, 128, 255))]);
    expect(a.lignes).toHaveLength(1);
    expect(b.lignes).toHaveLength(1);
  });
});

describe('outils du lecteur', () => {
  it('tourne une image d\'un quart de tour vers la droite ou la gauche', () => {
    const img = imageUnie(4, 2, 0);
    img.data.set([255, 0, 0, 255], 0); // pixel rouge en haut à gauche
    const droite = tournerImg(cv, img, 90);
    expect([droite.width, droite.height]).toEqual([2, 4]);
    expect(Array.from(droite.data.slice(4, 8))).toEqual([255, 0, 0, 255]); // en haut à droite
    const gauche = tournerImg(cv, img, 270);
    expect(Array.from(gauche.data.slice((3 * 2) * 4, (3 * 2) * 4 + 4))).toEqual([255, 0, 0, 255]); // en bas à gauche
  });

  it('rectangle englobant et page couchée', () => {
    expect(rectDe([[10, 5], [50, 7], [49, 20], [9, 18]])).toEqual({ x: 9, y: 5, largeur: 41, hauteur: 15 });
    const haute = { quad: [[0, 0], [10, 0], [10, 80], [0, 80]] as const, score: 1 };
    const large = { quad: [[0, 0], [80, 0], [80, 10], [0, 10]] as const, score: 1 };
    expect(pageCouchee([haute, haute, large] as never)).toBe(true);
    expect(pageCouchee([haute, large, large] as never)).toBe(false);
    expect(pageCouchee([])).toBe(false);
  });
});
