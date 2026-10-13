import { describe, expect, it } from 'vitest';
import { dateCourte, nomFichier, nomParDefaut, nomsUniques, tailleLisible } from '../src/nommage';

describe('nommage', () => {
  it('donne un nom par défaut daté', () => {
    expect(nomParDefaut(new Date(2026, 9, 12, 14, 5))).toBe('Scan 12-10-2026 14h05');
  });

  it('nettoie les caractères interdits dans un nom de fichier', () => {
    expect(nomFichier('Fiche n°3 / SCOOPAB', 'pdf')).toBe('Fiche n°3 - SCOOPAB.pdf');
    expect(nomFichier('a:b*c?"d<e>f|g\\h', 'jpg')).toBe('a-b-c--d-e-f-g-h.jpg');
  });

  it('remplace un nom vide par « Scan »', () => {
    expect(nomFichier('   ', 'pdf')).toBe('Scan.pdf');
  });

  it('affiche une date courte', () => {
    expect(dateCourte(new Date(2026, 9, 12, 9, 7).getTime())).toBe('12/10/2026 09h07');
  });

  it('rend les noms de fichiers uniques pour un envoi groupé', () => {
    expect(nomsUniques(['Fiche.pdf', 'Reçu.pdf', 'Fiche.pdf', 'Fiche.pdf'])).toEqual(['Fiche.pdf', 'Reçu.pdf', 'Fiche (2).pdf', 'Fiche (3).pdf']);
  });

  it('affiche une taille lisible', () => {
    expect(tailleLisible(250 * 1024)).toBe('250 Ko');
    expect(tailleLisible(1.5 * 1024 * 1024)).toBe('1,5 Mo');
  });
});
