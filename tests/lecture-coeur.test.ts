import { beforeAll, describe, expect, it } from 'vitest';
import type { ResultatLecture } from '../src/lecture/modele';
import { Traitement } from '../src/traitement/client';
import { gererLecture, type LecteurDePage } from '../src/traitement/coeur';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import type { PortWorker, Reponse, Requete } from '../src/traitement/protocole';
import { imageUnie } from './aides/images';
import { pageAvecTraits, TABLEAU } from './aides/traits';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

const ligne = (x: number, y: number, texte: string) => ({ rect: { x, y, largeur: 60, hauteur: 20 }, texte, confiance: 0.9 });

describe('gererLecture', () => {
  it('lignes lues + tableau repéré sur l\'image remise d\'aplomb → mode Tableau', async () => {
    const page = pageAvecTraits(cv, 600, 500, TABLEAU);
    const lecteur: LecteurDePage = { lire: async () => ({ sens: 90, img: page, lignes: [ligne(150, 140, 'Reçu'), ligne(150, 240, 'Poids'), ligne(350, 240, '252'), ligne(10, 450, 'Signature')] }) };
    const r = await gererLecture(cv, lecteur, { id: 3, type: 'lire', img: imageUnie(500, 600, 255) });
    expect(r.ok && r.type === 'lire').toBe(true);
    if (!r.ok || r.type !== 'lire') return;
    expect(r.id).toBe(3);
    expect(r.resultat).toMatchObject({ sens: 90, largeur: 600, hauteur: 500, mode: 'tableau' });
    expect(r.resultat.lignes.every((l) => l.corrige === false)).toBe(true);
    expect(r.resultat.tableau!.cases.map((c) => c.texte)).toEqual(['Reçu', 'Poids', '252', '', '']);
  });

  it('page sans traits → mode Texte, pas de tableau', async () => {
    const lecteur: LecteurDePage = { lire: async (_cv, img) => ({ sens: 0, img, lignes: [ligne(10, 10, 'Bonjour')] }) };
    const r = await gererLecture(cv, lecteur, { id: 1, type: 'lire', img: imageUnie(300, 200, 255) });
    expect(r.ok && r.type === 'lire' && r.resultat).toMatchObject({ mode: 'texte', tableau: null });
  });

  it('une erreur du lecteur devient une réponse d\'erreur', async () => {
    const lecteur: LecteurDePage = { lire: async () => { throw new Error('mémoire pleine'); } };
    expect(await gererLecture(cv, lecteur, { id: 2, type: 'lire', img: imageUnie(10, 10, 255) })).toEqual({ id: 2, ok: false, erreur: 'mémoire pleine' });
  });
});

describe('client : lire et libérer', () => {
  function portSimule(repondre: (r: Requete) => Reponse) {
    const envoyes: Requete[] = [];
    const port: PortWorker = {
      onmessage: null,
      postMessage(m) { envoyes.push(m); queueMicrotask(() => port.onmessage?.({ data: repondre(m) } as MessageEvent<Reponse>)); },
    };
    return { port, envoyes };
  }
  const resultat: ResultatLecture = { sens: 0, largeur: 10, hauteur: 10, mode: 'texte', lignes: [], tableau: null };

  it('lire envoie l\'image au worker et rend le résultat ; liberer est relayé', async () => {
    const { port, envoyes } = portSimule((m) => (m.type === 'lire' ? { id: m.id, ok: true, type: 'lire', resultat } : { id: m.id, ok: true, type: 'liberer' }));
    const t = new Traitement(port);
    expect(await t.lire(imageUnie(10, 10, 255))).toEqual(resultat);
    await t.liberer();
    expect(envoyes.map((m) => m.type)).toEqual(['lire', 'liberer']);
  });

  it('une erreur du worker est levée', async () => {
    const { port } = portSimule((m) => ({ id: m.id, ok: false, erreur: "Le lecteur de texte n'est pas encore téléchargé." }));
    await expect(new Traitement(port).lire(imageUnie(10, 10, 255))).rejects.toThrow('pas encore téléchargé');
  });
});
