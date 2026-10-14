import type { LecturePage } from '../../src/lecture/modele';

export function lectureFactice(pageId: string, documentId: string, texte = 'Bonjour'): LecturePage {
  return {
    pageId, documentId, empreinte: 'e', sens: 0, largeur: 100, hauteur: 100, mode: 'texte', lu: 1, tableau: null,
    lignes: [{ rect: { x: 0, y: 0, largeur: 50, hauteur: 10 }, texte, confiance: 0.9, corrige: false }],
  };
}
