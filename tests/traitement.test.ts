import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { gererDetection, gererRequete, type RequeteSimple } from '../src/traitement/coeur';
import { Traitement } from '../src/traitement/client';
import type { PortWorker, Reponse, Requete } from '../src/traitement/protocole';
import { REGLAGES_NEUTRES, type Coins } from '../src/traitement/types';
import { imageUnie, remplirPolygone } from './aides/images';

const vrais: Coins = [{ x: 60, y: 40 }, { x: 330, y: 55 }, { x: 350, y: 270 }, { x: 45, y: 250 }];
let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

function scene() {
  const img = imageUnie(400, 300, 40);
  remplirPolygone(img, vrais, 230);
  return img;
}

/** Faux worker : traite la requête dans le même fil, de façon asynchrone. */
class FauxWorker implements PortWorker {
  onmessage: ((e: MessageEvent<Reponse>) => void) | null = null;
  constructor(private repondre: (r: Requete) => Reponse) {}
  postMessage(r: Requete) {
    queueMicrotask(() => this.onmessage?.({ data: this.repondre(r) } as MessageEvent<Reponse>));
  }
}

describe('gererRequete', () => {
  it('détecte', () => {
    const r = gererRequete(cv, { id: 1, type: 'detecter', img: scene() });
    expect(r.ok && r.type === 'detecter' && r.coins).toBeTruthy();
  });

  it('redresse puis filtre', () => {
    const r = gererRequete(cv, { id: 2, type: 'traiter', img: scene(), coins: vrais, rotation: 0, filtre: 'nb', reglages: REGLAGES_NEUTRES });
    if (!r.ok || r.type !== 'traiter') throw new Error('réponse inattendue');
    expect(r.img.width).toBeGreaterThan(250);
  });

  it('fournit la carte des bords nets : allumée sur le bord de la feuille, éteinte au milieu', () => {
    const r = gererRequete(cv, { id: 4, type: 'bords', img: scene() });
    if (!r.ok || r.type !== 'bords') throw new Error('réponse inattendue');
    const { data, largeur, hauteur } = r.masque;
    expect([largeur, hauteur]).toEqual([400, 300]);
    // bord gauche de la feuille, à mi-hauteur : entre (60,40) et (45,250)
    const xBord = Math.round(60 + (45 - 60) * (105 / 210));
    expect(data.slice(145 * largeur + xBord - 3, 145 * largeur + xBord + 4).some((v) => v > 0)).toBe(true);
    expect(data[150 * largeur + 200]).toBe(0);
  });

  it('transforme une exception en réponse d\'erreur', () => {
    const casse = { data: new Uint8ClampedArray(10 * 10 * 4 + 100), width: 10, height: 10 };
    const r = gererRequete(cv, { id: 3, type: 'detecter', img: casse });
    expect(r.ok).toBe(false);
    expect(r.id).toBe(3);
  });
});

describe('gererDetection (IA d\'abord, méthode classique en repli)', () => {
  const coinsIA: Coins = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }, { x: 7, y: 8 }];
  const ia = (reponse: () => Promise<Coins | null>) => ({ detecter: reponse });

  it('prend les coins de l\'IA quand elle en trouve', async () => {
    const r = await gererDetection(cv, ia(async () => coinsIA), { id: 1, type: 'detecter', img: scene() });
    expect(r.ok && r.type === 'detecter' && r.coins).toEqual(coinsIA);
  });

  it('passe à la méthode classique quand l\'IA renonce, échoue ou n\'est pas chargée', async () => {
    for (const detecteur of [ia(async () => null), ia(async () => { throw new Error('moteur'); }), null]) {
      const r = await gererDetection(cv, detecteur, { id: 2, type: 'detecter', img: scene() });
      if (!r.ok || r.type !== 'detecter' || !r.coins) throw new Error('la méthode classique aurait dû trouver la feuille');
      r.coins.forEach((p, i) => expect(Math.hypot(p.x - vrais[i].x, p.y - vrais[i].y)).toBeLessThan(10));
    }
  });
});

describe('Traitement (client)', () => {
  it('associe chaque réponse à sa requête', async () => {
    // ce test n'envoie que des requêtes simples (ni lecture ni libération)
    const t = new Traitement(new FauxWorker((r) => gererRequete(cv, r as RequeteSimple)));
    await t.preparer();
    const [coins, vide] = await Promise.all([t.detecter(scene()), t.detecter(imageUnie(400, 300, 120))]);
    expect(coins).not.toBeNull();
    expect(vide).toBeNull();
    const img = await t.traiter(scene(), vrais, 90, 'gris');
    expect(img.height).toBeGreaterThan(img.width);
  });

  it('rejette avec le message d\'erreur du worker', async () => {
    const t = new Traitement(new FauxWorker((r) => ({ id: r.id, ok: false, erreur: 'boum' })));
    await expect(t.detecter(imageUnie(4, 4, 0))).rejects.toThrow('boum');
  });
});
