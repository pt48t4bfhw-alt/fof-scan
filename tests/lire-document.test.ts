import { describe, expect, it } from 'vitest';
import { etatPage, lirePages } from '../src/ecrans/lireDocument';
import { empreinte } from '../src/lecture/modele';
import type { PageScan } from '../src/rangement/modele';
import { lectureFactice } from './aides/lecture';
import { jpegFactice, pageFactice } from './aides/jpeg';

const page = (id: string, gris = 200): PageScan => ({ ...pageFactice(gris), id, documentId: 'd' });

describe('état d\'une page', () => {
  it('non lue, lue, ou à relire si l\'image a changé depuis la lecture', () => {
    const p = page('a');
    expect(etatPage(p, undefined)).toBe('non-lue');
    expect(etatPage(p, { ...lectureFactice('a', 'd'), empreinte: empreinte(p.traitee) })).toBe('lue');
    expect(etatPage({ ...p, traitee: jpegFactice(8, 8, 30) }, { ...lectureFactice('a', 'd'), empreinte: empreinte(p.traitee) })).toBe('a-relire');
  });
});

describe('lirePages', () => {
  const pages = [page('a'), page('b'), page('c')];

  it('lit et enregistre chaque page, avec la progression', async () => {
    const enregistrees: string[] = [];
    const progres: string[] = [];
    const r = await lirePages(pages, async (p) => lectureFactice(p.id, 'd'), async (l) => { enregistrees.push(l.pageId); },
      (fait, total) => progres.push(`${fait}/${total}`), () => false);
    expect(enregistrees).toEqual(['a', 'b', 'c']);
    expect(progres).toEqual(['0/3', '1/3', '2/3', '3/3']);
    expect(r.echecs).toEqual([]);
  });

  it('une page en échec n\'arrête pas les autres', async () => {
    const r = await lirePages(pages, async (p) => { if (p.id === 'b') throw new Error('mémoire'); return lectureFactice(p.id, 'd'); },
      async () => undefined, () => undefined, () => false);
    expect(r.lues.map((l) => l.pageId)).toEqual(['a', 'c']);
    expect(r.echecs).toEqual(['b']);
  });

  it('« Annuler » arrête après la page en cours', async () => {
    let annule = false;
    const r = await lirePages(pages, async (p) => { annule = true; return lectureFactice(p.id, 'd'); }, async () => undefined, () => undefined, () => annule);
    expect(r.lues.map((l) => l.pageId)).toEqual(['a']);
  });
});
