import { empreinte, type LecturePage } from '../lecture/modele';
import type { PageScan } from '../rangement/modele';

export type EtatPage = 'non-lue' | 'a-relire' | 'lue';

/** Une page modifiée depuis sa lecture (recadrage, filtre, rotation) est « à relire ». */
export function etatPage(page: PageScan, l: LecturePage | undefined): EtatPage {
  if (!l) return 'non-lue';
  return l.empreinte === empreinte(page.traitee) ? 'lue' : 'a-relire';
}

/** Lit les pages une par une ; une page en échec n'arrête pas les autres ; « Annuler » arrête après la page en cours. */
export async function lirePages(
  pages: PageScan[],
  lire: (p: PageScan) => Promise<LecturePage>,
  enregistrer: (l: LecturePage) => Promise<void>,
  progres: (fait: number, total: number) => void,
  annule: () => boolean,
): Promise<{ lues: LecturePage[]; echecs: string[] }> {
  const lues: LecturePage[] = [];
  const echecs: string[] = [];
  progres(0, pages.length);
  for (const [k, p] of pages.entries()) {
    if (annule()) break;
    try {
      const l = await lire(p);
      await enregistrer(l);
      lues.push(l);
    } catch {
      echecs.push(p.id);
    }
    progres(k + 1, pages.length);
  }
  return { lues, echecs };
}
