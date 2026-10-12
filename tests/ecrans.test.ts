import { describe, expect, it } from 'vitest';
import { ErreurStockagePlein } from '../src/rangement/depot';
import type { DocumentScan, PageScan } from '../src/rangement/modele';
import { messageErreur, retour } from '../src/ecrans/navigation';
import { filtrerDocuments } from '../src/ecrans/recherche';

const doc = (nom: string): DocumentScan => ({ id: nom, nom, cree: 0, modifie: 0, pages: [] });

describe('filtrerDocuments', () => {
  const docs = [doc('Bordereau Éléphant'), doc('Fiche SACO'), doc('reçu')];
  it('ignore majuscules et accents', () => {
    expect(filtrerDocuments(docs, 'elephant').map((d) => d.nom)).toEqual(['Bordereau Éléphant']);
    expect(filtrerDocuments(docs, 'RECU').map((d) => d.nom)).toEqual(['reçu']);
  });
  it('rend tout si la recherche est vide', () => {
    expect(filtrerDocuments(docs, '  ')).toHaveLength(3);
  });
});

describe('navigation', () => {
  it('retour : vers le document de la page modifiée, du lot, sinon l\'accueil', () => {
    const page = { documentId: 'p' } as PageScan;
    expect(retour({ documentId: null, brouillons: [], pageExistante: page })).toEqual({ nom: 'document', id: 'p' });
    expect(retour({ documentId: 'd', brouillons: [], pageExistante: null })).toEqual({ nom: 'document', id: 'd' });
    expect(retour({ documentId: null, brouillons: [], pageExistante: null })).toEqual({ nom: 'accueil' });
  });

  it('messageErreur : un message clair pour la mémoire pleine', () => {
    expect(messageErreur(new ErreurStockagePlein())).toContain('Sauvegarder tout');
    expect(messageErreur(new Error('Oups'))).toBe('Oups');
    expect(messageErreur(42)).toBe('Une erreur est survenue.');
  });
});
