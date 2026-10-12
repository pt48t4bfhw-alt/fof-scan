import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ErreurStockagePlein, estErreurQuota, ouvrirDepot } from '../src/rangement/depot';
import { pageFactice } from './aides/jpeg';

function depotNeuf() {
  let t = 1000;
  return ouvrirDepot(`test-${crypto.randomUUID()}`, () => t++);
}

describe('Depot', () => {
  it('crée et liste les documents, le plus récent en haut', async () => {
    const d = await depotNeuf();
    const a = await d.creerDocument('A');
    const b = await d.creerDocument('B');
    expect((await d.listerDocuments()).map((x) => x.id)).toEqual([b.id, a.id]);
    await d.renommer(a.id, 'A bis');
    const liste = await d.listerDocuments();
    expect(liste[0].nom).toBe('A bis');
  });

  it('ajoute des pages et les relit dans l\'ordre', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const p1 = await d.ajouterPage(doc.id, pageFactice(10));
    const p2 = await d.ajouterPage(doc.id, pageFactice(20));
    expect((await d.lireDocument(doc.id))!.pages).toEqual([p1.id, p2.id]);
    const pages = await d.lirePages(doc.id);
    expect(pages.map((p) => p.id)).toEqual([p1.id, p2.id]);
    expect(pages[0].original.octets).toEqual(p1.original.octets);
  });

  it('réordonne et refuse un ordre incomplet', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const p1 = await d.ajouterPage(doc.id, pageFactice());
    const p2 = await d.ajouterPage(doc.id, pageFactice());
    await d.reordonner(doc.id, [p2.id, p1.id]);
    expect((await d.lirePages(doc.id)).map((p) => p.id)).toEqual([p2.id, p1.id]);
    await expect(d.reordonner(doc.id, [p1.id])).rejects.toThrow('Ordre de pages invalide');
  });

  it('met à jour une page', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const p = await d.ajouterPage(doc.id, pageFactice());
    await d.mettreAJourPage({ ...p, filtre: 'nb', rotation: 90 });
    const relue = await d.lirePage(p.id);
    expect(relue!.filtre).toBe('nb');
    expect(relue!.rotation).toBe(90);
  });

  it('supprime une page puis un document avec ses pages', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const p1 = await d.ajouterPage(doc.id, pageFactice());
    const p2 = await d.ajouterPage(doc.id, pageFactice());
    await d.supprimerPage(p1.id);
    expect((await d.lireDocument(doc.id))!.pages).toEqual([p2.id]);
    expect(await d.lirePage(p1.id)).toBeUndefined();
    await d.supprimerDocument(doc.id);
    expect(await d.lireDocument(doc.id)).toBeUndefined();
    expect(await d.lirePage(p2.id)).toBeUndefined();
  });

  it('importe sans dupliquer un document déjà présent', async () => {
    const source = await depotNeuf();
    const doc = await source.creerDocument('Fiche');
    await source.ajouterPage(doc.id, pageFactice());
    const { documents, pages } = await source.toutLire();
    const cible = await depotNeuf();
    expect(await cible.importer(documents, pages)).toEqual({ ajoutes: 1, ignores: 0 });
    expect(await cible.importer(documents, pages)).toEqual({ ajoutes: 0, ignores: 1 });
    expect(await cible.toutLire()).toEqual({ documents, pages });
  });

  it('reconnaît une erreur de mémoire pleine', () => {
    expect(estErreurQuota(new DOMException('plein', 'QuotaExceededError'))).toBe(true);
    expect(estErreurQuota(new Error('autre'))).toBe(false);
    expect(new ErreurStockagePlein().message).toContain('pleine');
  });
});
