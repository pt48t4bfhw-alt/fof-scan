import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { gererRequete } from '../src/traitement/coeur';
import { Traitement } from '../src/traitement/client';
import type { PortWorker, Reponse, Requete } from '../src/traitement/protocole';
import type { Coins } from '../src/traitement/types';
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
    const r = gererRequete(cv, { id: 2, type: 'traiter', img: scene(), coins: vrais, rotation: 0, filtre: 'nb' });
    if (!r.ok || r.type !== 'traiter') throw new Error('réponse inattendue');
    expect(r.img.width).toBeGreaterThan(250);
  });

  it('transforme une exception en réponse d\'erreur', () => {
    const casse = { data: new Uint8ClampedArray(10 * 10 * 4 + 100), width: 10, height: 10 };
    const r = gererRequete(cv, { id: 3, type: 'detecter', img: casse });
    expect(r.ok).toBe(false);
    expect(r.id).toBe(3);
  });
});

describe('Traitement (client)', () => {
  it('associe chaque réponse à sa requête', async () => {
    const t = new Traitement(new FauxWorker((r) => gererRequete(cv, r)));
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
