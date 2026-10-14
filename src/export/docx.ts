import type { Bloc } from '../lecture/contenu';
import { archiver, NS_PAQUET, NS_RELATIONS, NS_TYPES, xml } from './ooxml';

export const TYPE_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Texte d'un paragraphe : retours à la ligne et tabulations gardés. */
function morceaux(texte: string): string {
  return texte.split('\n').map((ligne, i) => (i ? '<w:br/>' : '')
    + ligne.split('\t').map((m, j) => (j ? '<w:tab/>' : '') + (m ? `<w:t xml:space="preserve">${xml(m)}</w:t>` : '')).join('')).join('');
}

const paragraphe = (texte: string) => `<w:p><w:r>${morceaux(texte)}</w:r></w:p>`;
const SAUT_DE_PAGE = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const BORDURES = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map((c) => `<w:${c} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('');

function tableau(b: Extract<Bloc, { type: 'tableau' }>): string {
  // quelle case couvre chaque emplacement de la grille
  const couverture: (number | undefined)[][] = Array.from({ length: b.rangs }, () => Array<number | undefined>(b.cols).fill(undefined));
  b.cases.forEach((c, k) => {
    for (let r = c.rang; r < Math.min(b.rangs, c.rang + c.rangs); r++) {
      for (let col = c.col; col < Math.min(b.cols, c.col + c.cols); col++) {
        if (couverture[r][col] === undefined) couverture[r][col] = k;
      }
    }
  });
  let rangees = '';
  for (let r = 0; r < b.rangs; r++) {
    let cellules = '';
    for (let col = 0; col < b.cols;) {
      const k = couverture[r][col];
      if (k === undefined) { cellules += '<w:tc><w:tcPr/><w:p/></w:tc>'; col++; continue; }
      const c = b.cases[k];
      const largeur = Math.max(1, Math.min(c.cols - (col - c.col), b.cols - col));
      const span = largeur > 1 ? `<w:gridSpan w:val="${largeur}"/>` : '';
      const fusion = c.rangs > 1 ? (c.rang === r ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '';
      const contenu = c.rang === r ? c.texte.split('\n').map(paragraphe).join('') : '<w:p/>';
      cellules += `<w:tc><w:tcPr>${span}${fusion}</w:tcPr>${contenu}</w:tc>`;
      col += largeur;
    }
    rangees += `<w:tr>${cellules}</w:tr>`;
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${BORDURES}</w:tblBorders></w:tblPr>`
    + `<w:tblGrid>${'<w:gridCol/>'.repeat(b.cols)}</w:tblGrid>${rangees}</w:tbl><w:p/>`;
}

/** Un fichier Word pour tout le document : une page scannée = une page Word. */
export function fabriquerDocx(pages: Bloc[][], titre: string): Uint8Array {
  const corps = pages.map((blocs) => blocs.map((b) => (b.type === 'paragraphe' ? paragraphe(b.texte) : tableau(b))).join('')).join(SAUT_DE_PAGE);
  return archiver({
    '[Content_Types].xml': `<Types xmlns="${NS_TYPES}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `<Relationships xmlns="${NS_PAQUET}"><Relationship Id="rId1" Type="${NS_RELATIONS}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'docProps/core.xml': `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(titre)}</dc:title><dc:creator>FOF Scan</dc:creator></cp:coreProperties>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${NS_PAQUET}"><Relationship Id="rId1" Type="${NS_RELATIONS}/styles" Target="styles.xml"/></Relationships>`,
    'word/styles.xml': `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`,
    'word/document.xml': `<w:document xmlns:w="${W}" xmlns:r="${NS_RELATIONS}"><w:body>${corps}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  });
}
