import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { ErreurStockagePlein, estErreurQuota, ouvrirDepot } from '../src/rangement/depot';
import { pageFactice } from './aides/jpeg';
import { lectureFactice } from './aides/lecture';

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

  it('importe sans dupliquer un document déjà présent, dossiers compris', async () => {
    const source = await depotNeuf();
    const dossier = await source.creerDossier('Reçus');
    const doc = await source.creerDocument('Fiche', dossier.id);
    await source.ajouterPage(doc.id, pageFactice());
    const { documents, pages, dossiers } = await source.toutLire();
    const cible = await depotNeuf();
    expect(await cible.importer(documents, pages, dossiers)).toEqual({ ajoutes: 1, ignores: 0 });
    expect(await cible.importer(documents, pages, dossiers)).toEqual({ ajoutes: 0, ignores: 1 });
    expect(await cible.toutLire()).toEqual({ documents, pages, dossiers, lectures: [] });
  });

  it('fusionne plusieurs documents dans le premier coché, dans l\'ordre où ils ont été cochés', async () => {
    const d = await depotNeuf();
    const a = await d.creerDocument('A');
    const pa = await d.ajouterPage(a.id, pageFactice(10));
    const b = await d.creerDocument('B');
    const pb1 = await d.ajouterPage(b.id, pageFactice(20));
    const pb2 = await d.ajouterPage(b.id, pageFactice(30));
    const c = await d.creerDocument('C');
    const pc = await d.ajouterPage(c.id, pageFactice(40));
    const id = await d.fusionner([b.id, a.id, c.id]);
    expect(id).toBe(b.id);
    expect((await d.lirePages(b.id)).map((p) => p.id)).toEqual([pb1.id, pb2.id, pa.id, pc.id]);
    expect((await d.lirePages(b.id)).every((p) => p.documentId === b.id)).toBe(true);
    expect(await d.lireDocument(a.id)).toBeUndefined();
    expect(await d.lireDocument(c.id)).toBeUndefined();
    expect((await d.listerDocuments()).map((x) => x.nom)).toEqual(['B']);
  });

  it('refuse de fusionner moins de deux documents', async () => {
    const d = await depotNeuf();
    const a = await d.creerDocument('A');
    await expect(d.fusionner([a.id])).rejects.toThrow('au moins deux');
  });

  it('crée, renomme et liste les dossiers (par nom)', async () => {
    const d = await depotNeuf();
    const b = await d.creerDossier('SCOOPAB');
    await d.creerDossier('Banque');
    await d.renommerDossier(b.id, 'SCOOPAB 2026');
    expect((await d.listerDossiers()).map((x) => x.nom)).toEqual(['Banque', 'SCOOPAB 2026']);
  });

  it('crée un document directement dans un dossier, et déplace des documents', async () => {
    const d = await depotNeuf();
    const dossier = await d.creerDossier('Reçus');
    const a = await d.creerDocument('A', dossier.id);
    const b = await d.creerDocument('B');
    expect((await d.lireDocument(a.id))!.dossierId).toBe(dossier.id);
    expect((await d.lireDocument(b.id))!.dossierId ?? null).toBeNull();
    await d.deplacer([b.id], dossier.id);
    expect((await d.lireDocument(b.id))!.dossierId).toBe(dossier.id);
    await d.deplacer([a.id], null);
    expect((await d.lireDocument(a.id))!.dossierId).toBeNull();
  });

  it('supprimer un dossier ramène ses documents à l\'accueil, sans rien perdre', async () => {
    const d = await depotNeuf();
    const dossier = await d.creerDossier('Reçus');
    const a = await d.creerDocument('A', dossier.id);
    await d.ajouterPage(a.id, pageFactice());
    await d.supprimerDossier(dossier.id);
    expect(await d.listerDossiers()).toEqual([]);
    const relu = await d.lireDocument(a.id);
    expect(relu!.dossierId).toBeNull();
    expect(relu!.pages).toHaveLength(1);
  });

  it('une mémoire de l\'ancienne version (sans dossiers) s\'ouvre sans perte', async () => {
    const nom = `ancien-${crypto.randomUUID()}`;
    const ancien = await openDB(nom, 1, {
      upgrade(base) {
        base.createObjectStore('documents', { keyPath: 'id' });
        base.createObjectStore('pages', { keyPath: 'id' }).createIndex('parDocument', 'documentId');
      },
    });
    await ancien.put('documents', { id: 'x', nom: 'Vieux scan', cree: 1, modifie: 1, pages: [] });
    ancien.close();
    const d = await ouvrirDepot(nom);
    expect((await d.listerDocuments()).map((x) => x.nom)).toEqual(['Vieux scan']);
    expect(await d.listerDossiers()).toEqual([]);
  });

  it('lectures : relues par document, remplacées, effacées avec leur page ou leur document', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Reçus');
    const p1 = await d.ajouterPage(doc.id, pageFactice());
    const p2 = await d.ajouterPage(doc.id, pageFactice());
    await d.enregistrerLecture(lectureFactice(p1.id, doc.id, 'un'));
    await d.enregistrerLecture(lectureFactice(p2.id, doc.id, 'deux'));
    await d.enregistrerLecture(lectureFactice(p2.id, doc.id, 'deux corrigé'));
    const lues = await d.lireLectures(doc.id);
    expect(lues.map((l) => l.lignes[0].texte).sort()).toEqual(['deux corrigé', 'un']);
    await d.supprimerPage(p1.id);
    expect((await d.lireLectures(doc.id)).map((l) => l.pageId)).toEqual([p2.id]);
    await d.supprimerDocument(doc.id);
    expect(await d.lireLectures(doc.id)).toEqual([]);
  });

  it('fusionner emporte les lectures des pages déplacées', async () => {
    const d = await depotNeuf();
    const a = await d.creerDocument('A');
    const b = await d.creerDocument('B');
    const pb = await d.ajouterPage(b.id, pageFactice());
    await d.enregistrerLecture(lectureFactice(pb.id, b.id));
    await d.fusionner([a.id, b.id]);
    expect((await d.lireLectures(a.id)).map((l) => l.pageId)).toEqual([pb.id]);
  });

  it('une mémoire de la version 2 (sans lectures) s\'ouvre sans perte', async () => {
    const nom = `v2-${crypto.randomUUID()}`;
    const ancien = await openDB(nom, 2, {
      upgrade(base) {
        base.createObjectStore('documents', { keyPath: 'id' });
        base.createObjectStore('pages', { keyPath: 'id' }).createIndex('parDocument', 'documentId');
        base.createObjectStore('dossiers', { keyPath: 'id' });
      },
    });
    await ancien.put('documents', { id: 'x', nom: 'Scan v2', cree: 1, modifie: 1, pages: [] });
    ancien.close();
    const d = await ouvrirDepot(nom);
    expect((await d.listerDocuments()).map((x) => x.nom)).toEqual(['Scan v2']);
    expect(await d.lireLectures('x')).toEqual([]);
  });

  it('reconnaît une erreur de mémoire pleine', () => {
    expect(estErreurQuota(new DOMException('plein', 'QuotaExceededError'))).toBe(true);
    expect(estErreurQuota(new Error('autre'))).toBe(false);
    expect(new ErreurStockagePlein().message).toContain('pleine');
  });
});
