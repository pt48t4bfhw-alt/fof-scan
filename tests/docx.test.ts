import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { fabriquerDocx } from '../src/export/docx';
import { xml } from '../src/export/ooxml';
import type { Bloc } from '../src/lecture/contenu';

const lire = (octets: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(octets)).map(([k, v]) => [k, strFromU8(v)]));

describe('xml', () => {
  it('échappe les caractères spéciaux et retire les caractères de contrôle', () => {
    expect(xml('A & B < C > "D"\u0007')).toBe('A &amp; B &lt; C &gt; &quot;D&quot;');
  });
});

describe('Word', () => {
  const pages: Bloc[][] = [
    [{ type: 'paragraphe', texte: 'Reçu & facture' }, { type: 'paragraphe', texte: 'Date\t21-07-2026' }],
    [
      { type: 'tableau', rangs: 3, cols: 2, cases: [
        { rang: 0, col: 0, rangs: 1, cols: 2, texte: 'RUBRIQUE' },
        { rang: 1, col: 0, rangs: 2, cols: 1, texte: 'Poids\nnet' },
        { rang: 1, col: 1, rangs: 1, cols: 1, texte: '252' },
      ] },
    ],
  ];
  const f = lire(fabriquerDocx(pages, 'Reçu Bouda'));
  const doc = f['word/document.xml'];

  it('contient les parties d\'un document Word', () => {
    for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml']) {
      expect(f[p], p).toBeDefined();
      expect(f[p].startsWith('<?xml')).toBe(true);
    }
    expect(f['docProps/core.xml']).toContain('<dc:title>Reçu Bouda</dc:title>');
  });

  it('paragraphes : texte échappé, tabulations et saut de page entre les pages', () => {
    expect(doc).toContain('<w:t xml:space="preserve">Reçu &amp; facture</w:t>');
    expect(doc).toContain('<w:t xml:space="preserve">Date</w:t><w:tab/><w:t xml:space="preserve">21-07-2026</w:t>');
    expect(doc.match(/<w:br w:type="page"\/>/g)).toHaveLength(1);
  });

  it('tableau : cases fusionnées en largeur et en hauteur, case vide comblée', () => {
    expect(doc).toContain('<w:gridSpan w:val="2"/>');
    expect(doc).toContain('<w:vMerge w:val="restart"/>');
    expect(doc).toContain('<w:tcPr><w:vMerge/></w:tcPr>');
    expect(doc).toContain('<w:tc><w:tcPr/><w:p/></w:tc>'); // rangée 3, colonne 2 : aucune case
    expect(doc.match(/<w:tr>/g)).toHaveLength(3);
    expect(doc).toContain('<w:t xml:space="preserve">Poids</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">net</w:t>');
  });

  it('un document sans page reste un Word valide', () => {
    expect(lire(fabriquerDocx([], 'Vide'))['word/document.xml']).toContain('<w:sectPr>');
  });
});
