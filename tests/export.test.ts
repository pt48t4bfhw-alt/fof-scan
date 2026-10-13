import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fabriquerPdf, placement } from '../src/export/pdf';
import { preparerExport, preparerExportPlusieurs, QUALITES } from '../src/export/preparer';
import type { DocumentScan, PageScan } from '../src/rangement/modele';
import { jpegFactice, pageFactice } from './aides/jpeg';

describe('placement', () => {
  it('A4 portrait : image centrée et ajustée', () => {
    const p = placement(300, 600, 'a4');
    expect(p.page).toEqual({ largeur: 595.28, hauteur: 841.89 });
    expect(p.image.hauteur).toBeCloseTo(841.89);
    expect(p.image.x).toBeCloseTo((595.28 - p.image.largeur) / 2);
    expect(p.image.y).toBeCloseTo(0);
  });

  it('A4 paysage pour une image plus large que haute', () => {
    const p = placement(400, 300, 'a4');
    expect(p.page).toEqual({ largeur: 841.89, hauteur: 595.28 });
    expect(p.image.hauteur).toBeCloseTo(595.28);
    expect(p.image.x).toBeCloseTo((841.89 - p.image.largeur) / 2);
  });

  it('taille réelle : la page prend les proportions de l\'image', () => {
    const p = placement(400, 300, 'reel');
    expect(p.page.largeur / p.page.hauteur).toBeCloseTo(4 / 3);
    expect(p.image).toEqual({ x: 0, y: 0, largeur: p.page.largeur, hauteur: p.page.hauteur });
  });
});

describe('fabriquerPdf', () => {
  it('une page par image, au bon format', async () => {
    const octets = await fabriquerPdf([jpegFactice(30, 40), jpegFactice(40, 30)], 'a4', 'Essai');
    const pdf = await PDFDocument.load(octets);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
    expect(pdf.getPage(1).getSize().width).toBeCloseTo(841.89, 1);
    expect(pdf.getTitle()).toBe('Essai');
  });
});

describe('preparerExport', () => {
  const doc: DocumentScan = { id: 'd', nom: 'Fiche / 3', cree: 0, modifie: 0, pages: ['a', 'b'] };
  const pages: PageScan[] = ['a', 'b'].map((id) => ({ ...pageFactice(), id, documentId: 'd' }));
  const identite = async (im: PageScan['traitee']) => im;

  it('PDF : un seul fichier au nom du document, réencodé avec la bonne qualité', async () => {
    const appels: number[][] = [];
    const progres: number[] = [];
    const fichiers = await preparerExport(doc, pages, { type: 'pdf', format: 'a4', qualite: 'legere' },
      async (im, coteMax, qualite) => { appels.push([coteMax, qualite]); return im; },
      (fait) => progres.push(fait));
    expect(fichiers).toHaveLength(1);
    expect(fichiers[0].name).toBe('Fiche - 3.pdf');
    expect(fichiers[0].type).toBe('application/pdf');
    expect(appels).toEqual([[QUALITES.legere.coteMax, QUALITES.legere.qualite], [1654, 0.6]]);
    expect(progres).toEqual([1, 2]);
    const pdf = await PDFDocument.load(new Uint8Array(await fichiers[0].arrayBuffer()));
    expect(pdf.getPageCount()).toBe(2);
  });

  it('JPG : un fichier par page, numérotés', async () => {
    const fichiers = await preparerExport(doc, pages, { type: 'jpg', format: 'a4', qualite: 'normale' }, identite);
    expect(fichiers.map((f) => f.name)).toEqual(['Fiche - 3 - p1.jpg', 'Fiche - 3 - p2.jpg']);
    expect(fichiers[0].type).toBe('image/jpeg');
  });

  it('JPG d\'une seule page : pas de numéro', async () => {
    const fichiers = await preparerExport(doc, pages.slice(0, 1), { type: 'jpg', format: 'a4', qualite: 'normale' }, identite);
    expect(fichiers.map((f) => f.name)).toEqual(['Fiche - 3.jpg']);
  });
});

describe('preparerExportPlusieurs (documents cochés)', () => {
  const docA: DocumentScan = { id: 'a', nom: 'Reçu', cree: 0, modifie: 0, pages: ['a1', 'a2'] };
  const docB: DocumentScan = { id: 'b', nom: 'Reçu', cree: 0, modifie: 0, pages: ['b1'] };
  const pagesDe = (d: DocumentScan): PageScan[] => d.pages.map((id) => ({ ...pageFactice(), id, documentId: d.id }));
  const identite = async (im: PageScan['traitee']) => im;

  it('un PDF par document, noms rendus uniques, progression sur toutes les pages', async () => {
    const progres: string[] = [];
    const fichiers = await preparerExportPlusieurs(
      [{ doc: docA, pages: pagesDe(docA) }, { doc: docB, pages: pagesDe(docB) }],
      { type: 'pdf', format: 'a4', qualite: 'legere' }, identite, (fait, total) => progres.push(`${fait}/${total}`),
    );
    expect(fichiers.map((f) => f.name)).toEqual(['Reçu.pdf', 'Reçu (2).pdf']);
    expect(progres).toEqual(['1/3', '2/3', '3/3']);
    expect((await PDFDocument.load(new Uint8Array(await fichiers[0].arrayBuffer()))).getPageCount()).toBe(2);
  });
});
