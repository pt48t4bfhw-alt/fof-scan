import type { Filtre } from '../traitement/types';

/** Les 5 modes de CamScanner, dans son ordre, avec ses noms. */
export const MODES: { filtre: Filtre; nom: string }[] = [
  { filtre: 'original', nom: 'Original' },
  { filtre: 'eclaircir', nom: 'Éclaircir' },
  { filtre: 'ameliore', nom: 'Couleur magique' },
  { filtre: 'gris', nom: 'Gris' },
  { filtre: 'nb', nom: 'N&B' },
];

export const nomDuMode = (f: Filtre) => MODES.find((m) => m.filtre === f)?.nom ?? f;
