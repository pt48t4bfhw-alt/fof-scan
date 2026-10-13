import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fabriquerPdf, placement, type MiseEnPage } from '../src/export/pdf';
import { preparerExport, preparerExportPlusieurs, QUALITES } from '../src/export/preparer';
import type { DocumentScan, PageScan } from '../src/rangement/modele';
import { jpegFactice, pageFactice } from './aides/jpeg';

const mise = (format: MiseEnPage['format'], orientation: MiseEnPage['orientation'] = 'auto', marge: MiseEnPage['marge'] = 'aucune'): MiseEnPage =>
  ({ format, orientation, marge });

/** L'image est entière dans la page, à l'intérieur des marges, et centrée. */
function verifierCentreeDansMarges(p: ReturnType<typeof placement>, m: number) {
  expect(p.image.x).toBeGreaterThanOrEqual(m - 0.01);
  expect(p.image.y).toBeGreaterThanOrEqual(m - 0.01);
  expect(p.image.x + p.image.largeur).toBeLessThanOrEqual(p.page.largeur - m + 0.01);
  expect(p.image.y + p.image.hauteur).toBeLessThanOrEqual(p.page.hauteur - m + 0.01);
  expect(p.image.x).toBeCloseTo(p.page.largeur - p.image.x - p.image.largeur);
  expect(p.image.y).toBeCloseTo(p.page.hauteur - p.image.y - p.image.hauteur);
}

describe('placement', () => {
  it('A4 portrait : image centrée et ajustée', () => {
    const p = placement(300, 600, mise('a4'));
    expect(p.page).toEqual({ largeur: 595.28, hauteur: 841.89 });
    expect(p.image.hauteur).toBeCloseTo(841.89);
    verifierCentreeDansMarges(p, 0);
  });

  it('orientation automatique : A4 paysage pour une image plus large que haute', () => {
    const p = placement(400, 300, mise('a4'));
    expect(p.page).toEqual({ largeur: 841.89, hauteur: 595.28 });
    expect(p.image.hauteur).toBeCloseTo(595.28);
    verifierCentreeDansMarges(p, 0);
  });

  it('A5, Lettre et Légal ont leurs dimensions (en points)', () => {
    expect(placement(300, 600, mise('a5')).page).toEqual({ largeur: 419.53, hauteur: 595.28 });
    expect(placement(300, 600, mise('lettre')).page).toEqual({ largeur: 612, hauteur: 792 });
    expect(placement(300, 600, mise('legal')).page).toEqual({ largeur: 612, hauteur: 1008 });
  });

  it('orientation imposée : paysage même pour une image en hauteur, portrait même pour une image en largeur', () => {
    const p = placement(300, 600, mise('a4', 'paysage'));
    expect(p.page).toEqual({ largeur: 841.89, hauteur: 595.28 });
    expect(p.image.hauteur).toBeCloseTo(595.28);
    verifierCentreeDansMarges(p, 0);
    expect(placement(400, 300, mise('a4', 'portrait')).page).toEqual({ largeur: 595.28, hauteur: 841.89 });
  });

  it('marges : l\'image reste entière, centrée, à au moins 1 cm (petite) ou 2 cm (grande) du bord', () => {
    verifierCentreeDansMarges(placement(300, 600, mise('a4', 'auto', 'petite')), 28.35);
    verifierCentreeDansMarges(placement(400, 300, mise('lettre', 'auto', 'grande')), 56.69);
  });

  it('taille réelle : la page prend les proportions de l\'image, marges ajoutées autour', () => {
    const p = placement(400, 300, mise('reel'));
    expect(p.page.largeur / p.page.hauteur).toBeCloseTo(4 / 3);
    expect(p.image).toEqual({ x: 0, y: 0, largeur: p.page.largeur, hauteur: p.page.hauteur });
    const pm = placement(400, 300, mise('reel', 'auto', 'petite'));
    expect(pm.page.largeur).toBeCloseTo(p.page.largeur + 2 * 28.35);
    verifierCentreeDansMarges(pm, 28.35);
  });
});

describe('fabriquerPdf', () => {
  it('une page par image, au bon format', async () => {
    const octets = await fabriquerPdf([jpegFactice(30, 40), jpegFactice(40, 30)], mise('a4'), 'Essai');
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
    const fichiers = await preparerExport(doc, pages, { type: 'pdf', format: 'a4', orientation: 'auto', marge: 'aucune', qualite: 'legere' },
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

  it('PDF au format Lettre, en paysage, avec grandes marges', async () => {
    const fichiers = await preparerExport(doc, pages, { type: 'pdf', format: 'lettre', orientation: 'paysage', marge: 'grande', qualite: 'normale' }, identite);
    const pdf = await PDFDocument.load(new Uint8Array(await fichiers[0].arrayBuffer()));
    expect(pdf.getPage(0).getSize()).toEqual({ width: 792, height: 612 });
  });

  it('JPG : un fichier par page, numérotés', async () => {
    const fichiers = await preparerExport(doc, pages, { type: 'jpg', format: 'a4', orientation: 'auto', marge: 'aucune', qualite: 'normale' }, identite);
    expect(fichiers.map((f) => f.name)).toEqual(['Fiche - 3 - p1.jpg', 'Fiche - 3 - p2.jpg']);
    expect(fichiers[0].type).toBe('image/jpeg');
  });

  it('JPG d\'une seule page : pas de numéro', async () => {
    const fichiers = await preparerExport(doc, pages.slice(0, 1), { type: 'jpg', format: 'a4', orientation: 'auto', marge: 'aucune', qualite: 'normale' }, identite);
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
      { type: 'pdf', format: 'a4', orientation: 'auto', marge: 'aucune', qualite: 'legere' }, identite, (fait, total) => progres.push(`${fait}/${total}`),
    );
    expect(fichiers.map((f) => f.name)).toEqual(['Reçu.pdf', 'Reçu (2).pdf']);
    expect(progres).toEqual(['1/3', '2/3', '3/3']);
    expect((await PDFDocument.load(new Uint8Array(await fichiers[0].arrayBuffer()))).getPageCount()).toBe(2);
  });
});
