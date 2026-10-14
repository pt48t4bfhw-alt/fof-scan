import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { colonne, fabriquerXlsx } from '../src/export/xlsx';
import type { Bloc } from '../src/lecture/contenu';

const lire = (octets: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(octets)).map(([k, v]) => [k, strFromU8(v)]));

describe('Excel', () => {
  it('lettres de colonne', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(colonne)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });

  const pages: Bloc[][] = [
    [
      { type: 'paragraphe', texte: 'SCOOPAB\tN° 1813' },
      { type: 'tableau', rangs: 2, cols: 2, cases: [
        { rang: 0, col: 0, rangs: 1, cols: 2, texte: 'RUBRIQUE & VALEUR' },
        { rang: 1, col: 0, rangs: 1, cols: 1, texte: 'Poids net (Kg)' },
        { rang: 1, col: 1, rangs: 1, cols: 1, texte: '07 48 57 82 12' },
      ] },
      { type: 'paragraphe', texte: 'Signature' },
    ],
    [{ type: 'paragraphe', texte: 'Page deux' }],
  ];
  const f = lire(fabriquerXlsx(pages));

  it('un onglet par page', () => {
    expect(f['xl/workbook.xml']).toContain('<sheet name="Page 1" sheetId="1" r:id="rId1"/>');
    expect(f['xl/workbook.xml']).toContain('<sheet name="Page 2" sheetId="2" r:id="rId2"/>');
    expect(f['xl/worksheets/sheet2.xml']).toContain('>Page deux<');
    expect(f['[Content_Types].xml']).toContain('/xl/worksheets/sheet2.xml');
    expect(f['xl/_rels/workbook.xml.rels']).toContain('Target="styles.xml"');
  });

  it('texte au-dessus, tableau case par case, texte au-dessous ; nombres gardés en texte', () => {
    const s = f['xl/worksheets/sheet1.xml'];
    expect(s).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">SCOOPAB  N° 1813</t></is></c>');
    expect(s).toContain('<c r="A2" t="inlineStr" s="1"><is><t xml:space="preserve">RUBRIQUE &amp; VALEUR</t></is></c>');
    expect(s).toContain('<c r="B3" t="inlineStr" s="1"><is><t xml:space="preserve">07 48 57 82 12</t></is></c>');
    expect(s).toContain('<c r="A4"');
    expect(s).toContain('<mergeCells count="1"><mergeCell ref="A2:B2"/></mergeCells>');
  });

  it('aucune page : un classeur avec un onglet vide', () => {
    const vide = lire(fabriquerXlsx([]));
    expect(vide['xl/worksheets/sheet1.xml']).toContain('<sheetData></sheetData>');
  });
});
