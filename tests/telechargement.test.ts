import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  adresseFichier, CACHE_LECTEUR, FICHIERS_LECTEUR, installerLecteur, lecteurInstalle, lireFichiersLecteur,
  NON_INSTALLE, PAS_DE_RESEAU, TAILLE_LECTEUR,
} from '../src/lecture/telechargement';

/** Cache Storage simulé (Node n'en a pas). */
function fauxCaches() {
  const magasins = new Map<string, Map<string, Response>>();
  return {
    magasins,
    async open(nom: string) {
      if (!magasins.has(nom)) magasins.set(nom, new Map());
      const m = magasins.get(nom)!;
      return {
        async match(u: RequestInfo | URL) { return m.get(String(u))?.clone(); },
        async put(u: RequestInfo | URL, r: Response) { m.set(String(u), r); },
      } as unknown as Cache;
    },
  };
}
const BASE = '/fof-scan/';
const contenu = (url: string) => (url.endsWith('.txt') ? 'a\nb\n' : `modèle ${url}`);

describe('téléchargement du lecteur', () => {
  it('les tailles annoncées sont celles des fichiers de l\'appli (≈ 23 Mo)', () => {
    for (const f of Object.values(FICHIERS_LECTEUR)) expect(statSync(`public/modeles/ocr/${f.nom}`).size, f.nom).toBe(f.taille);
    expect(TAILLE_LECTEUR).toBeGreaterThan(22e6);
    expect(adresseFichier(BASE, 'x.onnx')).toBe('/fof-scan/modeles/ocr/x.onnx');
  });

  it('installe les trois fichiers avec la progression, puis les relit sans réseau', async () => {
    const caches = fauxCaches();
    expect(await lecteurInstalle(caches, BASE)).toBe(false);
    const appels: string[] = [];
    const progres: number[] = [];
    await installerLecteur(caches, BASE, async (u) => { appels.push(u); return new Response(contenu(u)); },
      (fait, total) => { progres.push(fait); expect(total).toBe(TAILLE_LECTEUR); });
    expect(appels).toEqual(Object.values(FICHIERS_LECTEUR).map((f) => adresseFichier(BASE, f.nom)));
    expect(progres[progres.length - 1]).toBe(TAILLE_LECTEUR);
    expect(await lecteurInstalle(caches, BASE)).toBe(true);
    expect(caches.magasins.has(CACHE_LECTEUR)).toBe(true);
    const f = await lireFichiersLecteur(caches, BASE);
    expect(f.dictionnaire).toBe('a\nb\n');
    expect(new TextDecoder().decode(f.reperage)).toContain('reperage-ppocrv6-tiny.onnx');
    expect(new TextDecoder().decode(f.lecture)).toContain('lecture-ppocrv6-small.onnx');
  });

  it('sans internet : message clair ; ensuite, seul ce qui manque est téléchargé', async () => {
    const caches = fauxCaches();
    let n = 0;
    await expect(installerLecteur(caches, BASE, async (u) => {
      if (++n === 2) throw new TypeError('Failed to fetch');
      return new Response(contenu(u));
    })).rejects.toThrow(PAS_DE_RESEAU);
    expect(await lecteurInstalle(caches, BASE)).toBe(false);
    const appels: string[] = [];
    await installerLecteur(caches, BASE, async (u) => { appels.push(u); return new Response(contenu(u)); });
    expect(appels).toHaveLength(2);
    await expect(installerLecteur(fauxCaches(), BASE, async () => new Response('', { status: 404 }))).rejects.toThrow(PAS_DE_RESEAU);
  });

  it('lire sans installation : erreur explicite', async () => {
    await expect(lireFichiersLecteur(fauxCaches(), BASE)).rejects.toThrow(NON_INSTALLE);
  });
});
