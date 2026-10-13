import { describe, expect, it } from 'vitest';
import type { DocumentScan, DossierScan } from '../src/rangement/modele';
import { trierDocuments, trierDossiers } from '../src/ecrans/tri';

const doc = (nom: string, cree: number, modifie: number): DocumentScan => ({ id: nom, nom, cree, modifie, pages: [] });
const docs = [doc('bordereau', 2, 9), doc('Reçu', 3, 5), doc('Avis', 1, 7)];

describe('tri des documents', () => {
  it('par date de modification : le plus récent en haut', () => {
    expect(trierDocuments(docs, 'modifie').map((d) => d.nom)).toEqual(['bordereau', 'Avis', 'Reçu']);
  });
  it('par date de création : le plus récent en haut', () => {
    expect(trierDocuments(docs, 'cree').map((d) => d.nom)).toEqual(['Reçu', 'bordereau', 'Avis']);
  });
  it('par nom, sans tenir compte des majuscules ni des accents', () => {
    expect(trierDocuments(docs, 'nomAZ').map((d) => d.nom)).toEqual(['Avis', 'bordereau', 'Reçu']);
    expect(trierDocuments(docs, 'nomZA').map((d) => d.nom)).toEqual(['Reçu', 'bordereau', 'Avis']);
  });
  it('ne modifie pas la liste reçue', () => {
    const copie = [...docs];
    trierDocuments(docs, 'nomAZ');
    expect(docs).toEqual(copie);
  });
});

describe('tri des dossiers', () => {
  const dossiers: DossierScan[] = [{ id: '1', nom: 'Zongo', cree: 1 }, { id: '2', nom: 'Écoles', cree: 3 }, { id: '3', nom: 'banque', cree: 2 }];
  it('par nom (A → Z ou Z → A), sinon du plus récent au plus ancien', () => {
    expect(trierDossiers(dossiers, 'nomAZ').map((d) => d.nom)).toEqual(['banque', 'Écoles', 'Zongo']);
    expect(trierDossiers(dossiers, 'nomZA').map((d) => d.nom)).toEqual(['Zongo', 'Écoles', 'banque']);
    expect(trierDossiers(dossiers, 'modifie').map((d) => d.nom)).toEqual(['Écoles', 'banque', 'Zongo']);
  });
});
