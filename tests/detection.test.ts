import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { detecterCoins } from '../src/traitement/detection';
import { ajouterBruit, imageUnie, remplirPolygone } from './aides/images';

const vrais = [{ x: 60, y: 40 }, { x: 330, y: 55 }, { x: 350, y: 270 }, { x: 45, y: 250 }];
let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

describe('detecterCoins', () => {
  it('trouve les 4 coins d\'une feuille claire sur fond sombre', () => {
    const img = imageUnie(400, 300, 40);
    remplirPolygone(img, vrais, 230);
    const coins = detecterCoins(cv, img);
    expect(coins).not.toBeNull();
    coins!.forEach((p, i) => expect(Math.hypot(p.x - vrais[i].x, p.y - vrais[i].y)).toBeLessThan(8));
  });

  it('résiste à un peu de bruit', () => {
    const img = imageUnie(400, 300, 50);
    remplirPolygone(img, vrais, 220);
    ajouterBruit(img, 15, 42);
    const coins = detecterCoins(cv, img);
    expect(coins).not.toBeNull();
    coins!.forEach((p, i) => expect(Math.hypot(p.x - vrais[i].x, p.y - vrais[i].y)).toBeLessThan(10));
  });

  it('renvoie null sur une image sans feuille', () => {
    expect(detecterCoins(cv, imageUnie(400, 300, 120))).toBeNull();
  });

  it('ignore un objet trop petit', () => {
    const img = imageUnie(400, 300, 40);
    remplirPolygone(img, [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }, { x: 10, y: 60 }], 230);
    expect(detecterCoins(cv, img)).toBeNull();
  });
});
