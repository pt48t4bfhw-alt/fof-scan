import { describe, expect, it } from 'vitest';
import { blocsDePage, lignesHorsTableau, paragraphes, texteDeBlocs, texteDuDocument } from '../src/lecture/contenu';
import type { LecturePage, LigneLue, Tableau } from '../src/lecture/modele';

const ligne = (x: number, y: number, texte: string): LigneLue =>
  ({ rect: { x, y, largeur: 80, hauteur: 20 }, texte, confiance: 0.95, corrige: false });

const tableau: Tableau = {
  rect: { x: 100, y: 100, largeur: 400, hauteur: 200 }, rangs: 2, cols: 2,
  cases: [
    { rang: 0, col: 0, rangs: 1, cols: 2, rect: { x: 100, y: 100, largeur: 400, hauteur: 100 }, texte: 'Reçu', confiance: 1, corrige: false },
    { rang: 1, col: 0, rangs: 1, cols: 1, rect: { x: 100, y: 200, largeur: 200, hauteur: 100 }, texte: 'Poids', confiance: 1, corrige: false },
    { rang: 1, col: 1, rangs: 1, cols: 1, rect: { x: 300, y: 200, largeur: 200, hauteur: 100 }, texte: '252\nkg', confiance: 1, corrige: true },
  ],
};

function lecture(mode: LecturePage['mode']): LecturePage {
  return {
    pageId: 'p', documentId: 'd', empreinte: 'e', sens: 0, largeur: 600, hauteur: 500, mode, lu: 0, tableau,
    lignes: [ligne(10, 20, 'SCOOPAB'), ligne(300, 22, 'N° 1813'), ligne(150, 140, 'Reçu'), ligne(150, 240, 'Poids'), ligne(10, 400, 'Signature')],
  };
}

describe('contenu d\'une page', () => {
  it('paragraphes : une rangée par paragraphe, éléments séparés par une tabulation', () => {
    expect(paragraphes([ligne(300, 22, 'N° 1813'), ligne(10, 20, 'SCOOPAB'), ligne(10, 80, 'Bouda')])).toEqual(['SCOOPAB\tN° 1813', 'Bouda']);
  });

  it('mode Texte : toutes les lignes en paragraphes', () => {
    expect(blocsDePage(lecture('texte')).map((b) => b.type === 'paragraphe' && b.texte))
      .toEqual(['SCOOPAB\tN° 1813', 'Reçu', 'Poids', 'Signature']);
  });

  it('mode Tableau : le texte au-dessus, le tableau (cases corrigées), le texte au-dessous', () => {
    const blocs = blocsDePage(lecture('tableau'));
    expect(blocs.map((b) => b.type)).toEqual(['paragraphe', 'tableau', 'paragraphe']);
    expect(blocs[1]).toMatchObject({ rangs: 2, cols: 2 });
    expect(lignesHorsTableau(lecture('tableau'))).toEqual({ avant: [0, 1], apres: [4] });
    expect(texteDeBlocs(blocs)).toBe('SCOOPAB\tN° 1813\nReçu\nPoids\t252 kg\nSignature');
  });

  it('texte du document : pages séparées par une ligne vide, pages vides ignorées', () => {
    expect(texteDuDocument([[{ type: 'paragraphe', texte: 'A' }], [], [{ type: 'paragraphe', texte: 'B' }]])).toBe('A\n\nB');
  });
});
