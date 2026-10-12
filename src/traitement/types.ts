export interface Img { data: Uint8ClampedArray; width: number; height: number }
export interface Point { x: number; y: number }
/** Coins dans l'ordre : haut-gauche, haut-droite, bas-droite, bas-gauche. */
export type Coins = [Point, Point, Point, Point];
export type Filtre = 'original' | 'ameliore' | 'nb' | 'gris';
export type Rotation = 0 | 90 | 180 | 270;
