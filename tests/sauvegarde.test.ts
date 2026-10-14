import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ouvrirDepot } from '../src/rangement/depot';
import { creerSauvegarde, lireSauvegarde, nomSauvegarde } from '../src/rangement/sauvegarde';
import { pageFactice } from './aides/jpeg';
import { lectureFactice } from './aides/lecture';

describe('sauvegarde', () => {
  it('nomme le fichier avec la date', () => {
    expect(nomSauvegarde(new Date(2026, 9, 5))).toBe('FOF-Scan-sauvegarde-2026-10-05.zip');
  });

  it('sauvegarde puis restaure dans un autre dépôt : tout est identique, dossiers compris', async () => {
    const source = await ouvrirDepot(`s-${crypto.randomUUID()}`);
    const dossier = await source.creerDossier('Bordereaux');
    const doc = await source.creerDocument('Bordereau', dossier.id);
    await source.ajouterPage(doc.id, pageFactice(30));
    await source.ajouterPage(doc.id, pageFactice(90));
    await source.creerDocument('Hors dossier');
    const avant = await source.toutLire();

    const relu = lireSauvegarde(creerSauvegarde(avant.documents, avant.pages, avant.dossiers));
    const cible = await ouvrirDepot(`c-${crypto.randomUUID()}`);
    await cible.importer(relu.documents, relu.pages, relu.dossiers);

    const apres = await cible.toutLire();
    const parId = <T extends { id: string }>(l: T[]) => [...l].sort((a, b) => a.id.localeCompare(b.id));
    expect(parId(apres.documents)).toEqual(parId(avant.documents));
    expect(parId(apres.pages)).toEqual(parId(avant.pages));
    expect(apres.dossiers).toEqual(avant.dossiers);
  });

  it('une sauvegarde de l\'ancienne version (sans dossiers) se relit', () => {
    const ancien = zipSync({
      'manifeste.json': strToU8(JSON.stringify({ application: 'FOF Scan', version: 1, documents: [], pages: [] })),
    });
    expect(lireSauvegarde(ancien)).toEqual({ documents: [], pages: [], dossiers: [], lectures: [] });
  });

  it('emporte les lectures ; sans lectures, la sauvegarde se relit quand même', async () => {
    const source = await ouvrirDepot(`s-${crypto.randomUUID()}`);
    const doc = await source.creerDocument('Reçu');
    const p = await source.ajouterPage(doc.id, pageFactice());
    await source.enregistrerLecture(lectureFactice(p.id, doc.id, '252'));
    const tout = await source.toutLire();
    const relu = lireSauvegarde(creerSauvegarde(tout.documents, tout.pages, tout.dossiers, tout.lectures));
    expect(relu.lectures.map((l) => l.lignes[0].texte)).toEqual(['252']);
    const cible = await ouvrirDepot(`c-${crypto.randomUUID()}`);
    await cible.importer(relu.documents, relu.pages, relu.dossiers, relu.lectures);
    expect((await cible.lireLectures(doc.id))[0].lignes[0].texte).toBe('252');
    expect(lireSauvegarde(creerSauvegarde(tout.documents, tout.pages, tout.dossiers)).lectures).toEqual([]);
  });

  it('refuse un fichier qui n\'est pas une sauvegarde', () => {
    expect(() => lireSauvegarde(new Uint8Array([1, 2, 3]))).toThrow("n'est pas une sauvegarde FOF Scan");
    expect(() => lireSauvegarde(zipSync({ 'autre.txt': new Uint8Array([65]) }))).toThrow("n'est pas une sauvegarde FOF Scan");
  });
});
