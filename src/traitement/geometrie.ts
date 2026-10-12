import type { Coins, Point } from './types';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Trie 4 points autour de leur centre (sens horaire à l'écran), en commençant par le haut-gauche. */
export function ordonnerCoins(points: Point[]): Coins {
  if (points.length !== 4) throw new Error('Il faut exactement 4 points');
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const tries = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let debut = 0;
  tries.forEach((p, i) => { if (p.x + p.y < tries[debut].x + tries[debut].y) debut = i; });
  return [0, 1, 2, 3].map((i) => tries[(debut + i) % 4]) as Coins;
}

export function coinsPleineImage(largeur: number, hauteur: number): Coins {
  return [{ x: 0, y: 0 }, { x: largeur, y: 0 }, { x: largeur, y: hauteur }, { x: 0, y: hauteur }];
}

export function mettreAEchelle(coins: Coins, facteur: number): Coins {
  return coins.map((p) => ({ x: p.x * facteur, y: p.y * facteur })) as Coins;
}

export function dimensionsReduites(largeur: number, hauteur: number, coteMax: number) {
  const facteur = Math.min(1, coteMax / Math.max(largeur, hauteur));
  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
    facteur,
  };
}

export function tailleRedressee(coins: Coins, coteMax = 3000): { largeur: number; hauteur: number } {
  const [hg, hd, bd, bg] = coins;
  const { largeur, hauteur } = dimensionsReduites(
    Math.max(dist(hg, hd), dist(bg, bd)),
    Math.max(dist(hg, bg), dist(hd, bd)),
    coteMax,
  );
  return { largeur, hauteur };
}

export function coinsStables(a: Coins, b: Coins, diagonale: number, seuil = 0.02): boolean {
  return a.every((p, i) => dist(p, b[i]) <= seuil * diagonale);
}

/** Dit si la feuille est restée immobile assez longtemps. */
export class SuiviStabilite {
  private reference: Coins | null = null;
  private depuis = 0;

  constructor(private diagonale: number, private dureeMs = 1000, private seuil = 0.02) {}

  ajouter(coins: Coins | null, maintenant: number): boolean {
    if (!coins) { this.reference = null; return false; }
    if (!this.reference || !coinsStables(this.reference, coins, this.diagonale, this.seuil)) {
      this.reference = coins;
      this.depuis = maintenant;
      return false;
    }
    return maintenant - this.depuis >= this.dureeMs;
  }

  reinitialiser(): void { this.reference = null; }
}

/** Prise automatique : déclenche quand la feuille est stable, puis attend qu'une autre page soit posée. */
export class DeclencheurAuto {
  private suivi: SuiviStabilite;
  private derniereCapture: Coins | null = null;

  constructor(private diagonale: number, dureeMs = 1000) {
    this.suivi = new SuiviStabilite(diagonale, dureeMs);
  }

  observer(coins: Coins | null, maintenant: number): boolean {
    if (this.derniereCapture) {
      if (coins && coinsStables(this.derniereCapture, coins, this.diagonale, 0.1)) return false;
      this.derniereCapture = null;
      this.suivi.reinitialiser();
    }
    if (this.suivi.ajouter(coins, maintenant)) {
      this.captureManuelle(coins);
      return true;
    }
    return false;
  }

  captureManuelle(coins: Coins | null): void {
    this.derniereCapture = coins;
    this.suivi.reinitialiser();
  }
}
