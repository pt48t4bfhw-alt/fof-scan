import type { CaseTableau, LecturePage, LigneLue } from './modele';
import { enRangees } from './ordre';
import { dansLeTableau } from './tableau';

export type CaseBloc = Pick<CaseTableau, 'rang' | 'col' | 'rangs' | 'cols' | 'texte'>;
/** Ce que contient une page, dans l'ordre : de quoi fabriquer Word, Excel ou du texte. */
export type Bloc =
  | { type: 'paragraphe'; texte: string }
  | { type: 'tableau'; rangs: number; cols: number; cases: CaseBloc[] };

/** Une rangée visuelle = un paragraphe ; les morceaux d'une même rangée sont séparés par une tabulation. */
export function paragraphes(lignes: LigneLue[]): string[] {
  return enRangees(lignes, (l) => l.rect).map((r) => r.map((l) => l.texte).join('\t')).filter((t) => t.trim());
}

/** Lignes hors du tableau (indices dans `l.lignes`) : au-dessus de son milieu, ou au-dessous. */
export function lignesHorsTableau(l: LecturePage): { avant: number[]; apres: number[] } {
  if (!l.tableau) return { avant: l.lignes.map((_, k) => k), apres: [] };
  const t = l.tableau;
  const milieu = t.rect.y + t.rect.hauteur / 2;
  const hors = l.lignes.map((_, k) => k).filter((k) => !dansLeTableau(t, l.lignes[k]));
  const centreY = (k: number) => l.lignes[k].rect.y + l.lignes[k].rect.hauteur / 2;
  return { avant: hors.filter((k) => centreY(k) < milieu), apres: hors.filter((k) => centreY(k) >= milieu) };
}

export function blocsDePage(l: LecturePage): Bloc[] {
  const enParagraphes = (indices: number[]): Bloc[] =>
    paragraphes(indices.map((k) => l.lignes[k])).map((texte) => ({ type: 'paragraphe', texte }));
  if (l.mode !== 'tableau' || !l.tableau) return enParagraphes(l.lignes.map((_, k) => k));
  const { avant, apres } = lignesHorsTableau(l);
  const t = l.tableau;
  return [
    ...enParagraphes(avant),
    { type: 'tableau', rangs: t.rangs, cols: t.cols, cases: t.cases.map(({ rang, col, rangs, cols, texte }) => ({ rang, col, rangs, cols, texte })) },
    ...enParagraphes(apres),
  ];
}

/** Un tableau en texte : une rangée par ligne, cases séparées par une tabulation. */
function rangeesDuTableau(b: Extract<Bloc, { type: 'tableau' }>): string[] {
  const rangees: string[] = [];
  for (let r = 0; r < b.rangs; r++) {
    const cases = b.cases.filter((c) => c.rang === r).sort((a, c) => a.col - c.col);
    if (cases.length) rangees.push(cases.map((c) => c.texte.replace(/\n/g, ' ')).join('\t'));
  }
  return rangees;
}

export function texteDeBlocs(blocs: Bloc[]): string {
  return blocs.map((b) => (b.type === 'paragraphe' ? b.texte : rangeesDuTableau(b).join('\n'))).join('\n');
}

export function texteDuDocument(pages: Bloc[][]): string {
  return pages.map(texteDeBlocs).filter((t) => t.trim()).join('\n\n');
}
