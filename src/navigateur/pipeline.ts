import type { NouvellePage, PageBrouillon } from '../rangement/modele';
import { traitement } from '../traitement/client';
import { coinsPleineImage, mettreAEchelle } from '../traitement/geometrie';
import { REGLAGES_NEUTRES, type Filtre } from '../traitement/types';
import { canvasVersJpeg, chargerImage, imgVersCanvas, lireImg, versCanvas } from './images';
import { lirePreference } from './preferences';

/** Mode appliqué aux nouveaux scans, réglable dans le menu ⋯ de l'accueil (Couleur magique au départ). */
export const filtreParDefaut = (): Filtre => lirePreference<Filtre>('filtreParDefaut', 'ameliore');

const COTE_MAX = 3000;
const COTE_DETECTION = 1000;

/** `c` fait déjà au plus 3 000 px. La détection se fait sur une copie de 1 000 px, plus rapide. */
export async function brouillonDepuisCanvas(c: HTMLCanvasElement): Promise<PageBrouillon> {
  const original = await canvasVersJpeg(c, 0.92);
  const petit = versCanvas(c, c.width, c.height, COTE_DETECTION);
  const coins = await traitement().detecter(lireImg(petit));
  return {
    original,
    coins: coins ? mettreAEchelle(coins, c.width / petit.width) : coinsPleineImage(c.width, c.height),
    rotation: 0,
    filtre: filtreParDefaut(),
    reglages: REGLAGES_NEUTRES,
    detecte: coins !== null,
  };
}

export async function brouillonDepuisFichier(f: Blob): Promise<PageBrouillon> {
  const img = await chargerImage(f);
  return brouillonDepuisCanvas(versCanvas(img, img.naturalWidth, img.naturalHeight, COTE_MAX));
}

/** Redresse et filtre un brouillon ; `coteMax` réduit la taille pour un aperçu rapide. */
export async function traiterBrouillon(b: PageBrouillon, coteMax: number): Promise<HTMLCanvasElement> {
  const img = await chargerImage(b.original.octets);
  const c = versCanvas(img, img.naturalWidth, img.naturalHeight, coteMax);
  const coins = mettreAEchelle(b.coins, c.width / b.original.largeur);
  return imgVersCanvas(await traitement().traiter(lireImg(c), coins, b.rotation, b.filtre, b.reglages));
}

export async function rendrePage(b: PageBrouillon): Promise<NouvellePage> {
  const c = await traiterBrouillon(b, COTE_MAX);
  return {
    original: b.original,
    coins: b.coins,
    rotation: b.rotation,
    filtre: b.filtre,
    reglages: b.reglages,
    traitee: await canvasVersJpeg(c, 0.85),
    miniature: await canvasVersJpeg(versCanvas(c, c.width, c.height, 300), 0.7),
  };
}
