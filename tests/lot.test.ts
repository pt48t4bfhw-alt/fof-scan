import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { enregistrerLot } from '../src/ecrans/lot';
import { ouvrirDepot } from '../src/rangement/depot';
import type { NouvellePage, PageBrouillon } from '../src/rangement/modele';
import { coinsPleineImage } from '../src/traitement/geometrie';
import { jpegFactice, pageFactice } from './aides/jpeg';

const brouillon = (gris: number): PageBrouillon => ({
  original: jpegFactice(4, 4, gris), coins: coinsPleineImage(4, 4), rotation: 0, filtre: 'nb', detecte: true,
});
const rendre = async (b: PageBrouillon): Promise<NouvellePage> => ({
  original: b.original, coins: b.coins, rotation: b.rotation, filtre: b.filtre, traitee: b.original, miniature: b.original,
});
const depotNeuf = () => ouvrirDepot(`l-${crypto.randomUUID()}`);

describe('enregistrerLot', () => {
  it('crée un nouveau document nommé avec la date', async () => {
    const d = await depotNeuf();
    const progres: number[] = [];
    const id = await enregistrerLot(d, { documentId: null, brouillons: [brouillon(10), brouillon(20)], pageExistante: null },
      rendre, new Date(2026, 9, 12, 8, 30), (fait) => progres.push(fait));
    const doc = await d.lireDocument(id);
    expect(doc!.nom).toBe('Scan 12-10-2026 08h30');
    expect(doc!.pages).toHaveLength(2);
    expect(progres).toEqual([1, 2]);
  });

  it('ajoute les pages à un document existant', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    await d.ajouterPage(doc.id, pageFactice());
    const id = await enregistrerLot(d, { documentId: doc.id, brouillons: [brouillon(30)], pageExistante: null }, rendre, new Date());
    expect(id).toBe(doc.id);
    expect((await d.lireDocument(doc.id))!.pages).toHaveLength(2);
  });

  it('met à jour une page existante sans en créer', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const page = await d.ajouterPage(doc.id, pageFactice());
    const b = { ...brouillon(40), rotation: 180 as const };
    await enregistrerLot(d, { documentId: doc.id, brouillons: [b], pageExistante: page }, rendre, new Date());
    const pages = await d.lirePages(doc.id);
    expect(pages).toHaveLength(1);
    expect(pages[0].id).toBe(page.id);
    expect(pages[0].rotation).toBe(180);
    expect(pages[0].filtre).toBe('nb');
  });
});
