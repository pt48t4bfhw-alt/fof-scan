import type { Bloc } from '../lecture/contenu';
import { archiver, NS_PAQUET, NS_RELATIONS, NS_TYPES, xml } from './ooxml';

export const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/** Lettres de colonne : 0 → A, 25 → Z, 26 → AA. */
export function colonne(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Style 1 : texte qui revient à la ligne, aligné en haut. */
const STYLES = `<styleSheet xmlns="${S}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>`;

/** Une page = un onglet : paragraphes en colonne A, tableau case par case (cases fusionnées gardées). */
function feuille(blocs: Bloc[]): string {
  const cellules = new Map<string, { rang: number; col: number; texte: string }>();
  const poser = (rang: number, col: number, texte: string) => {
    if (!texte) return;
    const cle = `${rang}:${col}`;
    const avant = cellules.get(cle);
    cellules.set(cle, { rang, col, texte: avant ? `${avant.texte}\n${texte}` : texte });
  };
  const fusions: string[] = [];
  let rang = 0;
  let largeur = 1;
  for (const b of blocs) {
    if (b.type === 'paragraphe') { poser(rang, 0, b.texte.replace(/\t/g, '  ')); rang++; continue; }
    for (const c of b.cases) {
      poser(rang + c.rang, c.col, c.texte);
      if (c.rangs > 1 || c.cols > 1) {
        fusions.push(`${colonne(c.col)}${rang + c.rang + 1}:${colonne(c.col + c.cols - 1)}${rang + c.rang + c.rangs}`);
      }
    }
    largeur = Math.max(largeur, b.cols);
    rang += b.rangs;
  }
  const parRang = new Map<number, { col: number; texte: string }[]>();
  for (const c of cellules.values()) parRang.set(c.rang, [...(parRang.get(c.rang) ?? []), c]);
  const lignes = [...parRang.keys()].sort((a, b) => a - b).map((r) => `<row r="${r + 1}">${parRang.get(r)!
    .sort((a, b) => a.col - b.col)
    .map((c) => `<c r="${colonne(c.col)}${r + 1}" t="inlineStr" s="1"><is><t xml:space="preserve">${xml(c.texte)}</t></is></c>`)
    .join('')}</row>`).join('');
  const fus = fusions.length ? `<mergeCells count="${fusions.length}">${fusions.map((f) => `<mergeCell ref="${f}"/>`).join('')}</mergeCells>` : '';
  return `<worksheet xmlns="${S}"><cols><col min="1" max="${largeur}" width="28" customWidth="1"/></cols><sheetData>${lignes}</sheetData>${fus}</worksheet>`;
}

/** Un classeur Excel pour tout le document : un onglet par page. */
export function fabriquerXlsx(pages: Bloc[][]): Uint8Array {
  const feuilles = pages.length ? pages : [[]];
  const n = feuilles.length;
  const fichiers: Record<string, string> = {
    '[Content_Types].xml': `<Types xmlns="${NS_TYPES}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<Relationships xmlns="${NS_PAQUET}"><Relationship Id="rId1" Type="${NS_RELATIONS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${S}" xmlns:r="${NS_RELATIONS}"><sheets>${feuilles.map((_, i) => `<sheet name="Page ${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${NS_PAQUET}">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_RELATIONS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${NS_RELATIONS}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES,
  };
  feuilles.forEach((blocs, i) => { fichiers[`xl/worksheets/sheet${i + 1}.xml`] = feuille(blocs); });
  return archiver(fichiers);
}
