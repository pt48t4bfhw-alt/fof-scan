import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import jpeg from 'jpeg-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { coinsDepuisCartes, DetecteurIA, preparerEntree, TAILLE_ENTREE } from '../src/traitement/docaligner';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { imageUnie } from './aides/images';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

/** Cartes de chaleur factices 4×h×w : une tache gaussienne par coin, de hauteur `pic`. */
function cartes(h: number, w: number, centres: ([number, number] | null)[], pic = 0.9): Float32Array {
  const d = new Float32Array(4 * h * w);
  centres.forEach((c, k) => {
    if (!c) return;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      d[k * h * w + y * w + x] = pic * Math.exp(-((x - c[0]) ** 2 + (y - c[1]) ** 2) / 8);
    }
  });
  return d;
}

describe('préparation de l\'entrée', () => {
  it('complète une photo en hauteur en carré, sans la déformer', () => {
    const { donnees, carre } = preparerEntree(cv, imageUnie(600, 1000, 200));
    expect(carre).toEqual({ x: 200, y: 0, cote: 1000 });
    expect(donnees.length).toBe(3 * TAILLE_ENTREE * TAILLE_ENTREE);
    expect(donnees[5]).toBeCloseTo(127 / 255, 2); // marge grise à gauche
    expect(donnees[128 * TAILLE_ENTREE + 128]).toBeCloseTo(200 / 255, 2); // centre : la photo
  });
});

describe('cartes → coins', () => {
  const carre = { x: 200, y: 0, cote: 1000 };

  it('ramène chaque tache dans la photo d\'origine (marges retirées), dans l\'ordre des coins', () => {
    // cartes 128×128 ; 1 case = 1000/128 px de carré
    const r = coinsDepuisCartes(cv, cartes(128, 128, [[32, 16], [96, 16], [96, 112], [32, 112]]), 128, 128, carre, 600, 1000);
    expect(r).not.toBeNull();
    const attendu = [[50, 125], [550, 125], [550, 875], [50, 875]];
    r!.coins.forEach((p, i) => {
      expect(p.x).toBeCloseTo(attendu[i][0], -1);
      expect(p.y).toBeCloseTo(attendu[i][1], -1);
    });
    expect(r!.confiance).toBeCloseTo(0.9, 1);
  });

  it('ramène sur le bord un coin tombé dans la marge', () => {
    const r = coinsDepuisCartes(cv, cartes(128, 128, [[10, 16], [96, 16], [96, 112], [32, 112]]), 128, 128, carre, 600, 1000);
    expect(r!.coins[0].x).toBe(0);
  });

  it('renonce si un coin manque', () => {
    expect(coinsDepuisCartes(cv, cartes(128, 128, [[32, 16], [96, 16], [96, 112], null]), 128, 128, carre, 600, 1000)).toBeNull();
  });

  it('renonce si le modèle n\'est pas assez sûr de lui', () => {
    expect(coinsDepuisCartes(cv, cartes(128, 128, [[32, 16], [96, 16], [96, 112], [32, 112]], 0.35), 128, 128, carre, 600, 1000)).toBeNull();
  });
});

const MODELE = 'public/modeles/docaligner-lc100.onnx';
const lireJpeg = (chemin: string) => {
  const b = jpeg.decode(readFileSync(chemin), { useTArray: true, maxMemoryUsageInMB: 2048 });
  return { data: new Uint8ClampedArray(b.data.buffer), width: b.width, height: b.height };
};

describe.skipIf(!existsSync(MODELE))('modèle DocAligner réel', () => {
  let ia: DetecteurIA;
  beforeAll(async () => {
    const ort = createRequire(import.meta.url)('onnxruntime-web');
    ort.env.wasm.numThreads = 1;
    ia = await DetecteurIA.creer(ort, new Uint8Array(readFileSync(MODELE)));
  });

  it('renonce sur une fausse feuille qu\'il ne reconnaît pas (la méthode classique prendra le relais)', async () => {
    expect(await ia.detecter(cv, lireJpeg('tests/aides/feuille-synthetique.jpg'))).toBeNull();
  });

  const RECU = 'tests/photos/sauvegarde/Scan 12-10-2026 17h45 - p6 - original.jpg';
  it.skipIf(!existsSync(RECU))('trouve les 4 coins du reçu photographié (photo locale, non publiée)', async () => {
    const coins = await ia.detecter(cv, lireJpeg(RECU));
    const vus = [[73, 1011], [1342, 1029], [1371, 2309], [198, 2456]]; // relevés lors de l'essai, contrôlés à l'œil
    expect(coins).not.toBeNull();
    coins!.forEach((p, i) => expect(Math.hypot(p.x - vus[i][0], p.y - vus[i][1])).toBeLessThan(30));
  });
});
