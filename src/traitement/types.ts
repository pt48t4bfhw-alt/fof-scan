export interface Img { data: Uint8ClampedArray; width: number; height: number }
export interface Point { x: number; y: number }
/** Coins dans l'ordre : haut-gauche, haut-droite, bas-droite, bas-gauche. */
export type Coins = [Point, Point, Point, Point];
/** Modes de CamScanner. « ameliore » est la Couleur magique (nom gardé pour les pages déjà enregistrées). */
export type Filtre = 'original' | 'eclaircir' | 'ameliore' | 'gris' | 'nb';
export type Rotation = 0 | 90 | 180 | 270;

/** Curseurs manuels : luminosité et contraste de −50 à +50, détail (netteté) de 0 à 100. */
export interface Reglages { luminosite: number; contraste: number; detail: number }
export const REGLAGES_NEUTRES: Reglages = { luminosite: 0, contraste: 0, detail: 0 };

export const estNeutre = (r: Reglages) => r.luminosite === 0 && r.contraste === 0 && r.detail === 0;
