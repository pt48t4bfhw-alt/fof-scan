import 'fake-indexeddb/auto';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ouvrirDepot } from '../src/rangement/depot';
import { creerSauvegarde, lireSauvegarde, nomSauvegarde } from '../src/rangement/sauvegarde';
import { pageFactice } from './aides/jpeg';

describe('sauvegarde', () => {
  it('nomme le fichier avec la date', () => {
    expect(nomSauvegarde(new Date(2026, 9, 5))).toBe('FOF-Scan-sauvegarde-2026-10-05.zip');
  });

  it('sauvegarde puis restaure dans un autre dépôt : tout est identique', async () => {
    const source = await ouvrirDepot(`s-${crypto.randomUUID()}`);
    const doc = await source.creerDocument('Bordereau');
    await source.ajouterPage(doc.id, pageFactice(30));
    await source.ajouterPage(doc.id, pageFactice(90));
    const avant = await source.toutLire();

    const relu = lireSauvegarde(creerSauvegarde(avant.documents, avant.pages));
    const cible = await ouvrirDepot(`c-${crypto.randomUUID()}`);
    await cible.importer(relu.documents, relu.pages);

    const apres = await cible.toutLire();
    expect(apres.documents).toEqual(avant.documents);
    const parId = (l: typeof apres.pages) => [...l].sort((a, b) => a.id.localeCompare(b.id));
    expect(parId(apres.pages)).toEqual(parId(avant.pages));
  });

  it('refuse un fichier qui n\'est pas une sauvegarde', () => {
    expect(() => lireSauvegarde(new Uint8Array([1, 2, 3]))).toThrow("n'est pas une sauvegarde FOF Scan");
    expect(() => lireSauvegarde(zipSync({ 'autre.txt': new Uint8Array([65]) }))).toThrow("n'est pas une sauvegarde FOF Scan");
  });
});
