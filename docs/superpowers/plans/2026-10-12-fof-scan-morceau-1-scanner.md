# FOF Scan — Morceau 1 : le scanner — Plan de travail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** une appli web installable sur iPhone qui scanne des documents (bords, redressement, filtres), les range dans le téléphone et les exporte en PDF ou JPG.

**Architecture :** appli statique Vite + Preact + TypeScript. Le traitement d'image (OpenCV.js) tourne dans un Web Worker ; la logique de traitement est écrite en fonctions pures sur des images `{data, width, height}`, testées dans Node. Les documents sont rangés dans IndexedDB. Un service worker met tout en cache pour le fonctionnement hors ligne. Publication sur GitHub Pages.

**Tech Stack :** Vite 6, Preact 10, TypeScript 5.6, Vitest 3, @techstark/opencv-js 4.10, idb 8, pdf-lib, fflate, sortablejs, vite-plugin-pwa ; tests : fake-indexeddb, jpeg-js.

**Spec :** `docs/superpowers/specs/2026-10-12-fof-scan-morceau-1-scanner-design.md`

## Global Constraints

- Cible : **Safari iPhone**, appli ajoutée à l'écran d'accueil ; aucune appli native.
- Les documents ne quittent **jamais** le téléphone, sauf partage volontaire.
- Photos ramenées à **3 000 px** au plus sur le grand côté.
- Hébergement **GitHub Pages**, dépôt public `fof-scan`, `base` de build = `/fof-scan/`.
- `tests/photos/` (photos réelles de l'utilisateur) est **exclu du dépôt** (`.gitignore`).
- Nom par défaut d'un document : « Scan JJ-MM-AAAA HHhMM ».
- PDF qualité Normale : JPEG 0,85, ≤ 2 480 px ; Légère : JPEG 0,6, ≤ 1 654 px.
- Fichier de sauvegarde : `FOF-Scan-sauvegarde-AAAA-MM-JJ.zip`.
- Tous les textes visibles sont en **français**.
- Chaque commit se termine par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commandes lancées depuis `C:\Users\FOFANA\Desktop\ACTIVITE 2027\fof_scan`.

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `src/nommage.ts` | noms par défaut, noms de fichiers, dates et tailles lisibles |
| `src/traitement/types.ts` | `Img`, `Point`, `Coins`, `Filtre`, `Rotation` |
| `src/traitement/geometrie.ts` | ordre des coins, échelles, tailles, stabilité, déclencheur auto (pur) |
| `src/traitement/opencv.ts` | chargement d'OpenCV |
| `src/traitement/mats.ts` | conversion Mat OpenCV → `Img` |
| `src/traitement/detection.ts` | trouver les 4 coins de la feuille |
| `src/traitement/redressement.ts` | perspective + rotation |
| `src/traitement/filtres.ts` | Amélioré, Noir & blanc, Gris |
| `src/traitement/protocole.ts`, `coeur.ts`, `traitement.worker.ts`, `client.ts` | Web Worker et son client |
| `src/rangement/modele.ts` | types `DocumentScan`, `PageScan`, `PageBrouillon`… |
| `src/rangement/depot.ts` | IndexedDB |
| `src/rangement/sauvegarde.ts` | zip de sauvegarde / restauration |
| `src/export/pdf.ts`, `src/export/preparer.ts` | fabrication PDF / JPG |
| `src/navigateur/*.ts` | code qui exige le navigateur : images (canvas), caméra, partage, stockage, préférences, chaîne de traitement d'une page |
| `src/ecrans/*.tsx`, `src/ecrans/*.ts` | écrans et leur logique (navigation, recherche, lot) |
| `src/app.tsx`, `src/main.tsx`, `src/styles.css`, `index.html` | coquille de l'appli |
| `scripts/*.mjs` | génération des icônes et de l'image de test synthétique |
| `tests/**` | tests Vitest et aides |

---

### Task 1 : Squelette du projet et nommage

**Files :**
- Create : `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/app.tsx`, `src/styles.css`, `.claude/launch.json`, `src/nommage.ts`
- Test : `tests/nommage.test.ts`

**Interfaces :**
- Produces : `nomParDefaut(d: Date): string`, `nomFichier(nom: string, extension: string): string`, `dateCourte(ms: number): string`, `tailleLisible(octets: number): string`

- [ ] **Step 1 : Créer `package.json`**

```json
{
  "name": "fof-scan",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "icones": "node scripts/generer-icones.mjs"
  }
}
```

- [ ] **Step 2 : Installer les dépendances**

```bash
npm install preact@^10.26.0 idb@^8.0.3 pdf-lib@^1.17.1 fflate@^0.8.2 sortablejs@^1.15.6 @techstark/opencv-js@4.10.0-release.1
npm install -D vite@^6.3.0 @preact/preset-vite@^2.10.0 typescript@~5.6.3 vitest@^3.1.0 vite-plugin-pwa@^1.0.0 fake-indexeddb@^6.0.0 jpeg-js@^0.4.4 @types/sortablejs@^1.15.8 @types/node@^22
```

TypeScript est volontairement bloqué en 5.6 : à partir de 5.7, les tableaux typés deviennent génériques et `new ImageData(...)` / `new Blob([...])` réclament des conversions partout.

- [ ] **Step 3 : Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "types": ["vite/client", "vite-plugin-pwa/client", "vite-plugin-pwa/preact", "node"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 4 : Créer `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/fof-scan/' : '/',
  plugins: [preact()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
}));
```

- [ ] **Step 5 : Créer `index.html`, `src/main.tsx`, `src/app.tsx` provisoire, `src/styles.css` vide**

`index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="FOF Scan" />
    <meta name="theme-color" content="#0f5132" />
    <title>FOF Scan</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx` :

```tsx
import { render } from 'preact';
import { App } from './app';
import './styles.css';

render(<App />, document.getElementById('app')!);
```

`src/app.tsx` (remplacé à la Task 11) :

```tsx
export function App() {
  return <main class="ecran"><h1>FOF Scan</h1></main>;
}
```

`src/styles.css` : fichier vide (rempli à la Task 11).

- [ ] **Step 6 : Créer `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "fof-scan", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

- [ ] **Step 7 : Écrire le test qui échoue — `tests/nommage.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { dateCourte, nomFichier, nomParDefaut, tailleLisible } from '../src/nommage';

describe('nommage', () => {
  it('donne un nom par défaut daté', () => {
    expect(nomParDefaut(new Date(2026, 9, 12, 14, 5))).toBe('Scan 12-10-2026 14h05');
  });

  it('nettoie les caractères interdits dans un nom de fichier', () => {
    expect(nomFichier('Fiche n°3 / SCOOPAB', 'pdf')).toBe('Fiche n°3 - SCOOPAB.pdf');
    expect(nomFichier('a:b*c?"d<e>f|g\\h', 'jpg')).toBe('a-b-c--d-e-f-g-h.jpg');
  });

  it('remplace un nom vide par « Scan »', () => {
    expect(nomFichier('   ', 'pdf')).toBe('Scan.pdf');
  });

  it('affiche une date courte', () => {
    expect(dateCourte(new Date(2026, 9, 12, 9, 7).getTime())).toBe('12/10/2026 09h07');
  });

  it('affiche une taille lisible', () => {
    expect(tailleLisible(250 * 1024)).toBe('250 Ko');
    expect(tailleLisible(1.5 * 1024 * 1024)).toBe('1,5 Mo');
  });
});
```

- [ ] **Step 8 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/nommage.test.ts`
Expected : FAIL — `Cannot find module '../src/nommage'`

- [ ] **Step 9 : Écrire `src/nommage.ts`**

```ts
const deux = (n: number) => String(n).padStart(2, '0');

export function nomParDefaut(d: Date): string {
  return `Scan ${deux(d.getDate())}-${deux(d.getMonth() + 1)}-${d.getFullYear()} ${deux(d.getHours())}h${deux(d.getMinutes())}`;
}

export function nomFichier(nom: string, extension: string): string {
  const propre = nom.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'Scan';
  return `${propre}.${extension}`;
}

export function dateCourte(ms: number): string {
  const d = new Date(ms);
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} ${deux(d.getHours())}h${deux(d.getMinutes())}`;
}

export function tailleLisible(octets: number): string {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
```

- [ ] **Step 10 : Lancer le test, il doit passer**

Run : `npx vitest run tests/nommage.test.ts`
Expected : 5 tests PASS

- [ ] **Step 11 : Vérifier que le squelette démarre**

`preview_start` avec le nom `fof-scan`, puis `get_page_text` : la page affiche « FOF Scan ». Lancer aussi `npx tsc --noEmit` : aucune erreur.

- [ ] **Step 12 : Commit**

```bash
git add .
git commit -m "Squelette de FOF Scan et fonctions de nommage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : Géométrie pure (coins, tailles, stabilité, déclencheur auto)

**Files :**
- Create : `src/traitement/types.ts`, `src/traitement/geometrie.ts`
- Test : `tests/geometrie.test.ts`

**Interfaces :**
- Produces :
  - `interface Img { data: Uint8ClampedArray; width: number; height: number }`
  - `interface Point { x: number; y: number }` ; `type Coins = [Point, Point, Point, Point]` (haut-gauche, haut-droite, bas-droite, bas-gauche)
  - `type Filtre = 'original' | 'ameliore' | 'nb' | 'gris'` ; `type Rotation = 0 | 90 | 180 | 270`
  - `ordonnerCoins(points: Point[]): Coins`
  - `coinsPleineImage(largeur: number, hauteur: number): Coins`
  - `mettreAEchelle(coins: Coins, facteur: number): Coins`
  - `dimensionsReduites(largeur, hauteur, coteMax): { largeur; hauteur; facteur }`
  - `tailleRedressee(coins: Coins, coteMax = 3000): { largeur; hauteur }`
  - `coinsStables(a: Coins, b: Coins, diagonale: number, seuil = 0.02): boolean`
  - `class SuiviStabilite { constructor(diagonale, dureeMs = 1000, seuil = 0.02); ajouter(coins: Coins | null, maintenant: number): boolean; reinitialiser(): void }`
  - `class DeclencheurAuto { constructor(diagonale, dureeMs = 1000); observer(coins: Coins | null, maintenant: number): boolean; captureManuelle(coins: Coins | null): void }`

- [ ] **Step 1 : Créer `src/traitement/types.ts`**

```ts
export interface Img { data: Uint8ClampedArray; width: number; height: number }
export interface Point { x: number; y: number }
/** Coins dans l'ordre : haut-gauche, haut-droite, bas-droite, bas-gauche. */
export type Coins = [Point, Point, Point, Point];
export type Filtre = 'original' | 'ameliore' | 'nb' | 'gris';
export type Rotation = 0 | 90 | 180 | 270;
```

- [ ] **Step 2 : Écrire le test qui échoue — `tests/geometrie.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  DeclencheurAuto, SuiviStabilite, coinsPleineImage, coinsStables, dimensionsReduites,
  mettreAEchelle, ordonnerCoins, tailleRedressee,
} from '../src/traitement/geometrie';
import type { Coins } from '../src/traitement/types';

const feuille: Coins = [{ x: 60, y: 40 }, { x: 330, y: 55 }, { x: 350, y: 270 }, { x: 45, y: 250 }];

describe('ordonnerCoins', () => {
  it('remet des coins mélangés dans l\'ordre HG, HD, BD, BG', () => {
    expect(ordonnerCoins([feuille[2], feuille[0], feuille[3], feuille[1]])).toEqual(feuille);
  });
  it('fonctionne pour une feuille très tournée', () => {
    const losange = [{ x: 100, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 200 }, { x: 0, y: 100 }];
    const c = ordonnerCoins([losange[3], losange[1], losange[0], losange[2]]);
    expect(new Set(c.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    // sens des aiguilles d'une montre à l'écran
    const aire = c.reduce((s, p, i) => { const q = c[(i + 1) % 4]; return s + p.x * q.y - q.x * p.y; }, 0);
    expect(aire).toBeGreaterThan(0);
  });
  it('refuse autre chose que 4 points', () => {
    expect(() => ordonnerCoins(feuille.slice(0, 3))).toThrow();
  });
});

describe('tailles', () => {
  it('donne les coins de toute l\'image', () => {
    expect(coinsPleineImage(40, 30)).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }]);
  });
  it('met des coins à l\'échelle', () => {
    expect(mettreAEchelle(coinsPleineImage(40, 30), 2)[2]).toEqual({ x: 80, y: 60 });
  });
  it('réduit une image au côté maximum sans l\'agrandir', () => {
    expect(dimensionsReduites(4000, 3000, 3000)).toEqual({ largeur: 3000, hauteur: 2250, facteur: 0.75 });
    expect(dimensionsReduites(800, 600, 3000)).toEqual({ largeur: 800, hauteur: 600, facteur: 1 });
  });
  it('calcule la taille de la feuille redressée', () => {
    const t = tailleRedressee(feuille);
    expect(t.largeur).toBe(Math.round(Math.max(Math.hypot(270, 15), Math.hypot(305, 20))));
    expect(t.hauteur).toBe(Math.round(Math.max(Math.hypot(15, 210), Math.hypot(20, 215))));
    expect(Math.max(...Object.values(tailleRedressee(mettreAEchelle(feuille, 100))))).toBe(3000);
  });
});

describe('stabilité', () => {
  const decale = (c: Coins, d: number) => c.map((p) => ({ x: p.x + d, y: p.y })) as Coins;

  it('compare deux jeux de coins avec un seuil relatif à la diagonale', () => {
    expect(coinsStables(feuille, decale(feuille, 5), 500)).toBe(true);
    expect(coinsStables(feuille, decale(feuille, 20), 500)).toBe(false);
  });

  it('déclare stable après la durée demandée', () => {
    const s = new SuiviStabilite(500, 1000);
    expect(s.ajouter(feuille, 0)).toBe(false);
    expect(s.ajouter(decale(feuille, 3), 600)).toBe(false);
    expect(s.ajouter(decale(feuille, 4), 1000)).toBe(true);
  });

  it('repart de zéro si la feuille bouge ou disparaît', () => {
    const s = new SuiviStabilite(500, 1000);
    s.ajouter(feuille, 0);
    expect(s.ajouter(decale(feuille, 50), 900)).toBe(false);
    expect(s.ajouter(decale(feuille, 50), 1500)).toBe(false);
    expect(s.ajouter(null, 1950)).toBe(false);
    expect(s.ajouter(feuille, 2000)).toBe(false);
  });
});

describe('DeclencheurAuto', () => {
  it('déclenche une fois, puis attend que la page change', () => {
    const d = new DeclencheurAuto(500, 1000);
    d.observer(feuille, 0);
    expect(d.observer(feuille, 1000)).toBe(true);
    expect(d.observer(feuille, 2500)).toBe(false);
    expect(d.observer(feuille, 4000)).toBe(false);
    // la page est retirée puis une nouvelle est posée
    expect(d.observer(null, 4200)).toBe(false);
    d.observer(feuille, 5000);
    expect(d.observer(feuille, 6000)).toBe(true);
  });

  it('après une prise manuelle, ne redéclenche pas sur la même page', () => {
    const d = new DeclencheurAuto(500, 1000);
    d.captureManuelle(feuille);
    d.observer(feuille, 0);
    expect(d.observer(feuille, 2000)).toBe(false);
  });
});
```

- [ ] **Step 3 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/geometrie.test.ts`
Expected : FAIL — module `geometrie` introuvable

- [ ] **Step 4 : Écrire `src/traitement/geometrie.ts`**

```ts
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
```

- [ ] **Step 5 : Lancer le test, il doit passer**

Run : `npx vitest run tests/geometrie.test.ts`
Expected : tous PASS

- [ ] **Step 6 : Commit**

```bash
git add src/traitement tests/geometrie.test.ts
git commit -m "Géométrie : ordre des coins, tailles, stabilité et prise automatique" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : Chargement d'OpenCV et détection de la feuille

**Files :**
- Create : `src/traitement/opencv.ts`, `src/traitement/mats.ts`, `src/traitement/detection.ts`, `tests/aides/images.ts`
- Test : `tests/detection.test.ts`

**Interfaces :**
- Consumes : `Img`, `Coins`, `Point` (Task 2), `ordonnerCoins` (Task 2)
- Produces :
  - `type CV = any` ; `chargerOpenCV(): Promise<{ cv: CV }>`
  - `versImg(cv: CV, mat: any): Img` (accepte 1, 3 ou 4 canaux)
  - `detecterCoins(cv: CV, img: Img): Coins | null`
  - aides de test : `imageUnie(l, h, gris)`, `remplirPolygone(img, poly, gris)`, `ajouterBruit(img, amplitude, graine)`, `lireGris(img, x, y)`, `moyenneZone(img, x0, y0, x1, y1)`, `imageDegrade(l, h, gauche, droite)`

- [ ] **Step 1 : Créer les aides de test `tests/aides/images.ts`**

```ts
import type { Img, Point } from '../../src/traitement/types';

export function imageUnie(largeur: number, hauteur: number, gris: number): Img {
  const data = new Uint8ClampedArray(largeur * hauteur * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = gris; data[i + 3] = 255; }
  return { data, width: largeur, height: hauteur };
}

/** Fond qui passe de `gauche` à `droite` : simule une ombre. */
export function imageDegrade(largeur: number, hauteur: number, gauche: number, droite: number): Img {
  const img = imageUnie(largeur, hauteur, 0);
  for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) {
    const v = Math.round(gauche + ((droite - gauche) * x) / (largeur - 1));
    const i = (y * largeur + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  return img;
}

function dansPolygone(x: number, y: number, poly: Point[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

export function remplirPolygone(img: Img, poly: Point[], gris: number): void {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!dansPolygone(x + 0.5, y + 0.5, poly)) continue;
    const i = (y * img.width + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = gris;
  }
}

/** Bruit reproductible (même graine = même bruit). */
export function ajouterBruit(img: Img, amplitude: number, graine: number): void {
  let etat = graine;
  for (let i = 0; i < img.data.length; i += 4) {
    etat = (etat * 1103515245 + 12345) & 0x7fffffff;
    const d = ((etat / 0x7fffffff) * 2 - 1) * amplitude;
    for (let k = 0; k < 3; k++) img.data[i + k] = img.data[i + k] + d;
  }
}

export function lireGris(img: Img, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4];
}

export function moyenneZone(img: Img, x0: number, y0: number, x1: number, y1: number): number {
  let s = 0, n = 0;
  for (let y = Math.floor(y0); y < Math.floor(y1); y++) for (let x = Math.floor(x0); x < Math.floor(x1); x++) {
    s += lireGris(img, x, y); n++;
  }
  return s / n;
}
```

- [ ] **Step 2 : Écrire le test qui échoue — `tests/detection.test.ts`**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { detecterCoins } from '../src/traitement/detection';
import { ajouterBruit, imageUnie, remplirPolygone } from './aides/images';

const vrais = [{ x: 60, y: 40 }, { x: 330, y: 55 }, { x: 350, y: 270 }, { x: 45, y: 250 }];
let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

describe('detecterCoins', () => {
  it('trouve les 4 coins d\'une feuille claire sur fond sombre', () => {
    const img = imageUnie(400, 300, 40);
    remplirPolygone(img, vrais, 230);
    const coins = detecterCoins(cv, img);
    expect(coins).not.toBeNull();
    coins!.forEach((p, i) => expect(Math.hypot(p.x - vrais[i].x, p.y - vrais[i].y)).toBeLessThan(8));
  });

  it('résiste à un peu de bruit', () => {
    const img = imageUnie(400, 300, 50);
    remplirPolygone(img, vrais, 220);
    ajouterBruit(img, 15, 42);
    const coins = detecterCoins(cv, img);
    expect(coins).not.toBeNull();
    coins!.forEach((p, i) => expect(Math.hypot(p.x - vrais[i].x, p.y - vrais[i].y)).toBeLessThan(10));
  });

  it('renvoie null sur une image sans feuille', () => {
    expect(detecterCoins(cv, imageUnie(400, 300, 120))).toBeNull();
  });

  it('ignore un objet trop petit', () => {
    const img = imageUnie(400, 300, 40);
    remplirPolygone(img, [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }, { x: 10, y: 60 }], 230);
    expect(detecterCoins(cv, img)).toBeNull();
  });
});
```

- [ ] **Step 3 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/detection.test.ts`
Expected : FAIL — module `opencv` introuvable

- [ ] **Step 4 : Écrire `src/traitement/opencv.ts`**

```ts
import cvModule from '@techstark/opencv-js';

/** Les types livrés avec @techstark/opencv-js sont incomplets : on travaille en `any`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CV = any;

let chargement: Promise<{ cv: CV }> | null = null;

/**
 * Attend qu'OpenCV soit prêt. Le résultat est enveloppé dans un objet : l'objet OpenCV
 * possède parfois une méthode `then`, et le renvoyer tel quel ferait boucler la promesse.
 */
export function chargerOpenCV(): Promise<{ cv: CV }> {
  if (!chargement) {
    chargement = new Promise((resolve) => {
      const m: CV = cvModule;
      if (m instanceof Promise) { m.then((cv: CV) => resolve({ cv })); return; }
      if (m.Mat) { resolve({ cv: m }); return; }
      m.onRuntimeInitialized = () => resolve({ cv: m });
    });
  }
  return chargement;
}
```

Si le chargement ne se termine jamais dans Vitest, lire `node_modules/@techstark/opencv-js/README.md` et n'adapter **que** cette fonction.

- [ ] **Step 5 : Écrire `src/traitement/mats.ts`**

```ts
import type { CV } from './opencv';
import type { Img } from './types';

/** Copie une Mat OpenCV (1, 3 ou 4 canaux) dans une image RGBA indépendante. */
export function versImg(cv: CV, mat: CV): Img {
  const rgba = new cv.Mat();
  try {
    if (mat.channels() === 4) mat.copyTo(rgba);
    else if (mat.channels() === 1) cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
    else cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA);
    return { data: new Uint8ClampedArray(rgba.data), width: rgba.cols, height: rgba.rows };
  } finally {
    rgba.delete();
  }
}
```

- [ ] **Step 6 : Écrire `src/traitement/detection.ts`**

```ts
import { ordonnerCoins } from './geometrie';
import type { CV } from './opencv';
import type { Coins, Img, Point } from './types';

/** Une feuille doit couvrir au moins 15 % de l'image. */
const AIRE_MIN = 0.15;

export function detecterCoins(cv: CV, img: Img): Coins | null {
  const src = cv.matFromImageData(img);
  const gris = new cv.Mat();
  const bords = new cv.Mat();
  const noyau = cv.Mat.ones(5, 5, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchie = new cv.Mat();
  try {
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gris, gris, new cv.Size(5, 5), 0);
    cv.Canny(gris, bords, 50, 150);
    cv.dilate(bords, bords, noyau);
    cv.findContours(bords, contours, hierarchie, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const aireImage = img.width * img.height;
    let meilleur: Coins | null = null;
    let meilleureAire = 0;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const approx = new cv.Mat();
      try {
        const aire = cv.contourArea(contour);
        if (aire < AIRE_MIN * aireImage || aire <= meilleureAire) continue;
        cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
        if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;
        const points: Point[] = [];
        for (let k = 0; k < 4; k++) points.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
        meilleur = ordonnerCoins(points);
        meilleureAire = aire;
      } finally {
        contour.delete();
        approx.delete();
      }
    }
    return meilleur;
  } finally {
    src.delete(); gris.delete(); bords.delete(); noyau.delete(); contours.delete(); hierarchie.delete();
  }
}
```

- [ ] **Step 7 : Lancer le test, il doit passer**

Run : `npx vitest run tests/detection.test.ts`
Expected : 4 tests PASS (le premier chargement d'OpenCV prend quelques secondes)

- [ ] **Step 8 : Commit**

```bash
git add src/traitement tests
git commit -m "Détection des coins de la feuille avec OpenCV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : Redressement et rotation

**Files :**
- Create : `src/traitement/redressement.ts`
- Test : `tests/redressement.test.ts`

**Interfaces :**
- Consumes : `chargerOpenCV`, `versImg` (Task 3) ; `tailleRedressee` (Task 2)
- Produces : `redresser(cv: CV, img: Img, coins: Coins, rotation: Rotation, coteMax = 3000): Img`

- [ ] **Step 1 : Écrire le test qui échoue — `tests/redressement.test.ts`**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { redresser } from '../src/traitement/redressement';
import { tailleRedressee } from '../src/traitement/geometrie';
import type { Coins } from '../src/traitement/types';
import { imageUnie, moyenneZone, remplirPolygone } from './aides/images';

const vrais: Coins = [{ x: 60, y: 40 }, { x: 330, y: 55 }, { x: 350, y: 270 }, { x: 45, y: 250 }];
let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

/** Feuille blanche avec un carré noir près de son coin haut-gauche. */
function scene() {
  const img = imageUnie(400, 300, 40);
  remplirPolygone(img, vrais, 230);
  remplirPolygone(img, [{ x: 70, y: 55 }, { x: 110, y: 55 }, { x: 110, y: 95 }, { x: 70, y: 95 }], 0);
  return img;
}

describe('redresser', () => {
  it('produit un rectangle de la taille de la feuille, marque en haut à gauche', () => {
    const sortie = redresser(cv, scene(), vrais, 0);
    const { largeur, hauteur } = tailleRedressee(vrais);
    expect(sortie.width).toBe(largeur);
    expect(sortie.height).toBe(hauteur);
    const w = sortie.width, h = sortie.height;
    expect(moyenneZone(sortie, 0, 0, w * 0.25, h * 0.25)).toBeLessThan(150);
    expect(moyenneZone(sortie, w * 0.4, h * 0.4, w * 0.6, h * 0.6)).toBeGreaterThan(200);
  });

  it('tourne d\'un quart de tour : la marque passe en haut à droite', () => {
    const sortie = redresser(cv, scene(), vrais, 90);
    const { largeur, hauteur } = tailleRedressee(vrais);
    expect(sortie.width).toBe(hauteur);
    expect(sortie.height).toBe(largeur);
    const w = sortie.width, h = sortie.height;
    expect(moyenneZone(sortie, w * 0.75, 0, w, h * 0.25)).toBeLessThan(150);
    expect(moyenneZone(sortie, 0, 0, w * 0.25, h * 0.25)).toBeGreaterThan(200);
  });

  it('respecte le côté maximum', () => {
    const sortie = redresser(cv, scene(), vrais, 0, 100);
    expect(Math.max(sortie.width, sortie.height)).toBe(100);
  });
});
```

- [ ] **Step 2 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/redressement.test.ts`
Expected : FAIL — module `redressement` introuvable

- [ ] **Step 3 : Écrire `src/traitement/redressement.ts`**

```ts
import { tailleRedressee } from './geometrie';
import { versImg } from './mats';
import type { CV } from './opencv';
import type { Coins, Img, Rotation } from './types';

export function redresser(cv: CV, img: Img, coins: Coins, rotation: Rotation, coteMax = 3000): Img {
  const { largeur, hauteur } = tailleRedressee(coins, coteMax);
  const src = cv.matFromImageData(img);
  const droit = new cv.Mat();
  const tourne = new cv.Mat();
  const de = cv.matFromArray(4, 1, cv.CV_32FC2, coins.flatMap((p) => [p.x, p.y]));
  const vers = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, largeur, 0, largeur, hauteur, 0, hauteur]);
  const matrice = cv.getPerspectiveTransform(de, vers);
  try {
    cv.warpPerspective(src, droit, matrice, new cv.Size(largeur, hauteur), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    if (rotation === 0) return versImg(cv, droit);
    const code = rotation === 90 ? cv.ROTATE_90_CLOCKWISE : rotation === 180 ? cv.ROTATE_180 : cv.ROTATE_90_COUNTERCLOCKWISE;
    cv.rotate(droit, tourne, code);
    return versImg(cv, tourne);
  } finally {
    src.delete(); droit.delete(); tourne.delete(); de.delete(); vers.delete(); matrice.delete();
  }
}
```

- [ ] **Step 4 : Lancer le test, il doit passer**

Run : `npx vitest run tests/redressement.test.ts`
Expected : 3 tests PASS

- [ ] **Step 5 : Commit**

```bash
git add src/traitement/redressement.ts tests/redressement.test.ts
git commit -m "Redressement de la perspective et rotation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Filtres (Amélioré, Noir & blanc, Gris)

**Files :**
- Create : `src/traitement/filtres.ts`
- Test : `tests/filtres.test.ts`

**Interfaces :**
- Consumes : `CV`, `versImg` (Task 3) ; `Filtre`, `Img` (Task 2)
- Produces : `appliquerFiltre(cv: CV, img: Img, filtre: Filtre): Img` (`'original'` renvoie l'image telle quelle)

- [ ] **Step 1 : Écrire le test qui échoue — `tests/filtres.test.ts`**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { appliquerFiltre } from '../src/traitement/filtres';
import { imageDegrade, imageUnie, lireGris, remplirPolygone } from './aides/images';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

/** Papier avec une ombre (120 à gauche, 220 à droite) et trois traits d'écriture noirs de 6 px. */
function papierOmbre() {
  const img = imageDegrade(300, 200, 120, 220);
  for (const x of [50, 150, 250]) remplirPolygone(img, [{ x, y: 70 }, { x: x + 6, y: 70 }, { x: x + 6, y: 130 }, { x, y: 130 }], 0);
  return img;
}

describe('appliquerFiltre', () => {
  it('original : rend la même image', () => {
    const img = imageUnie(10, 10, 100);
    expect(appliquerFiltre(cv, img, 'original')).toBe(img);
  });

  it('gris : rouge = vert = bleu partout', () => {
    const img = imageUnie(50, 50, 0);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = 200; img.data[i + 1] = 80; img.data[i + 2] = (i / 4) % 50; }
    const sortie = appliquerFiltre(cv, img, 'gris');
    for (let i = 0; i < sortie.data.length; i += 4) {
      expect(sortie.data[i]).toBe(sortie.data[i + 1]);
      expect(sortie.data[i + 1]).toBe(sortie.data[i + 2]);
    }
  });

  it('noir & blanc : fond blanc malgré l\'ombre, écriture noire', () => {
    const sortie = appliquerFiltre(cv, papierOmbre(), 'nb');
    expect(lireGris(sortie, 53, 100)).toBe(0);
    expect(lireGris(sortie, 253, 100)).toBe(0);
    expect(lireGris(sortie, 100, 100)).toBe(255);
    expect(lireGris(sortie, 20, 30)).toBe(255);
    expect(lireGris(sortie, 200, 30)).toBe(255);
  });

  it('amélioré : l\'ombre disparaît, l\'écriture reste sombre', () => {
    const sortie = appliquerFiltre(cv, papierOmbre(), 'ameliore');
    expect(lireGris(sortie, 20, 30)).toBeGreaterThan(230);
    expect(lireGris(sortie, 280, 30)).toBeGreaterThan(230);
    // le trait clair dans l'ombre reste nettement plus sombre que le papier
    expect(lireGris(sortie, 53, 100)).toBeLessThan(120);
    expect(lireGris(sortie, 253, 100)).toBeLessThan(40);
  });
});
```

- [ ] **Step 2 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/filtres.test.ts`
Expected : FAIL — module `filtres` introuvable

- [ ] **Step 3 : Écrire `src/traitement/filtres.ts`**

```ts
import { versImg } from './mats';
import type { CV } from './opencv';
import type { Filtre, Img } from './types';

export function appliquerFiltre(cv: CV, img: Img, filtre: Filtre): Img {
  if (filtre === 'original') return img;
  const mats: CV[] = [];
  const nouvelle = () => { const m = new cv.Mat(); mats.push(m); return m; };
  const src = cv.matFromImageData(img);
  mats.push(src);
  try {
    if (filtre === 'gris') {
      const g = nouvelle();
      cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY);
      cv.normalize(g, g, 0, 255, cv.NORM_MINMAX);
      return versImg(cv, g);
    }
    if (filtre === 'nb') {
      const g = nouvelle();
      cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY);
      const propre = sansOmbre(cv, g, nouvelle);
      const binaire = nouvelle();
      cv.adaptiveThreshold(propre, binaire, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, tailleBloc(img), 10);
      return versImg(cv, binaire);
    }
    // 'ameliore' : on retire l'ombre canal par canal pour garder les couleurs
    const rgb = nouvelle();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const canaux = new cv.MatVector();
    const sortie = new cv.MatVector();
    try {
      cv.split(rgb, canaux);
      for (let i = 0; i < 3; i++) {
        const canal = canaux.get(i);
        mats.push(canal);
        sortie.push_back(sansOmbre(cv, canal, nouvelle));
      }
      const fusion = nouvelle();
      cv.merge(sortie, fusion);
      return versImg(cv, fusion);
    } finally {
      canaux.delete();
      sortie.delete();
    }
  } finally {
    mats.forEach((m) => m.delete());
  }
}

/** Estime le fond (dilatation puis flou médian) et ramène le papier au blanc. */
function sansOmbre(cv: CV, canal: CV, nouvelle: () => CV): CV {
  const fond = nouvelle();
  const diff = nouvelle();
  const noyau = cv.Mat.ones(7, 7, cv.CV_8U);
  try {
    cv.dilate(canal, fond, noyau);
    cv.medianBlur(fond, fond, 21);
    cv.absdiff(canal, fond, diff);
    cv.bitwise_not(diff, diff);
    cv.normalize(diff, diff, 0, 255, cv.NORM_MINMAX);
    return diff;
  } finally {
    noyau.delete();
  }
}

/** Taille de voisinage du seuil adaptatif : impaire, proportionnelle à l'image. */
function tailleBloc(img: Img): number {
  const t = Math.max(15, Math.round(Math.max(img.width, img.height) / 50));
  return t % 2 === 0 ? t + 1 : t;
}
```

- [ ] **Step 4 : Lancer le test, il doit passer**

Run : `npx vitest run tests/filtres.test.ts`
Expected : 4 tests PASS

- [ ] **Step 5 : Commit**

```bash
git add src/traitement/filtres.ts tests/filtres.test.ts
git commit -m "Filtres Amélioré, Noir & blanc et Gris" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : Web Worker de traitement et son client

**Files :**
- Create : `src/traitement/protocole.ts`, `src/traitement/coeur.ts`, `src/traitement/traitement.worker.ts`, `src/traitement/client.ts`
- Test : `tests/traitement.test.ts`

**Interfaces :**
- Consumes : `detecterCoins` (Task 3), `redresser` (Task 4), `appliquerFiltre` (Task 5), `chargerOpenCV`
- Produces :
  - `type Requete`, `type Reponse`, `interface PortWorker` (ci-dessous)
  - `gererRequete(cv: CV, r: Requete): Reponse`
  - `class Traitement { constructor(worker: PortWorker); preparer(): Promise<void>; detecter(img: Img): Promise<Coins | null>; traiter(img: Img, coins: Coins, rotation: Rotation, filtre: Filtre): Promise<Img> }` — **les images envoyées sont transférées** au worker : l'appelant ne doit plus les réutiliser.
  - `traitement(): Traitement` (instance unique liée au vrai worker)

- [ ] **Step 1 : Écrire `src/traitement/protocole.ts`**

```ts
import type { Coins, Filtre, Img, Rotation } from './types';

export type Requete =
  | { id: number; type: 'preparer' }
  | { id: number; type: 'detecter'; img: Img }
  | { id: number; type: 'traiter'; img: Img; coins: Coins; rotation: Rotation; filtre: Filtre };

export type Reponse =
  | { id: number; ok: true; type: 'preparer' }
  | { id: number; ok: true; type: 'detecter'; coins: Coins | null }
  | { id: number; ok: true; type: 'traiter'; img: Img }
  | { id: number; ok: false; erreur: string };

export interface PortWorker {
  onmessage: ((e: MessageEvent<Reponse>) => void) | null;
  postMessage(message: Requete, transfert?: Transferable[]): void;
}
```

- [ ] **Step 2 : Écrire le test qui échoue — `tests/traitement.test.ts`**

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { gererRequete } from '../src/traitement/coeur';
import { Traitement } from '../src/traitement/client';
import type { PortWorker, Reponse, Requete } from '../src/traitement/protocole';
import type { Coins } from '../src/traitement/types';
import { imageUnie, remplirPolygone } from './aides/images';

const vrais: Coins = [{ x: 60, y: 40 }, { x: 330, y: 55 }, { x: 350, y: 270 }, { x: 45, y: 250 }];
let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

function scene() {
  const img = imageUnie(400, 300, 40);
  remplirPolygone(img, vrais, 230);
  return img;
}

/** Faux worker : traite la requête dans le même fil, de façon asynchrone. */
class FauxWorker implements PortWorker {
  onmessage: ((e: MessageEvent<Reponse>) => void) | null = null;
  constructor(private repondre: (r: Requete) => Reponse) {}
  postMessage(r: Requete) {
    queueMicrotask(() => this.onmessage?.({ data: this.repondre(r) } as MessageEvent<Reponse>));
  }
}

describe('gererRequete', () => {
  it('détecte', () => {
    const r = gererRequete(cv, { id: 1, type: 'detecter', img: scene() });
    expect(r.ok && r.type === 'detecter' && r.coins).toBeTruthy();
  });

  it('redresse puis filtre', () => {
    const r = gererRequete(cv, { id: 2, type: 'traiter', img: scene(), coins: vrais, rotation: 0, filtre: 'nb' });
    if (!r.ok || r.type !== 'traiter') throw new Error('réponse inattendue');
    expect(r.img.width).toBeGreaterThan(250);
  });

  it('transforme une exception en réponse d\'erreur', () => {
    const casse = { data: new Uint8ClampedArray(10 * 10 * 4 + 100), width: 10, height: 10 };
    const r = gererRequete(cv, { id: 3, type: 'detecter', img: casse });
    expect(r.ok).toBe(false);
    expect(r.id).toBe(3);
  });
});

describe('Traitement (client)', () => {
  it('associe chaque réponse à sa requête', async () => {
    const t = new Traitement(new FauxWorker((r) => gererRequete(cv, r)));
    await t.preparer();
    const [coins, vide] = await Promise.all([t.detecter(scene()), t.detecter(imageUnie(400, 300, 120))]);
    expect(coins).not.toBeNull();
    expect(vide).toBeNull();
    const img = await t.traiter(scene(), vrais, 90, 'gris');
    expect(img.height).toBeGreaterThan(img.width);
  });

  it('rejette avec le message d\'erreur du worker', async () => {
    const t = new Traitement(new FauxWorker((r) => ({ id: r.id, ok: false, erreur: 'boum' })));
    await expect(t.detecter(imageUnie(4, 4, 0))).rejects.toThrow('boum');
  });
});
```

- [ ] **Step 3 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/traitement.test.ts`
Expected : FAIL — modules `coeur` / `client` introuvables

- [ ] **Step 4 : Écrire `src/traitement/coeur.ts`**

```ts
import { detecterCoins } from './detection';
import { appliquerFiltre } from './filtres';
import type { CV } from './opencv';
import type { Reponse, Requete } from './protocole';
import { redresser } from './redressement';

export function gererRequete(cv: CV, r: Requete): Reponse {
  try {
    switch (r.type) {
      case 'preparer':
        return { id: r.id, ok: true, type: 'preparer' };
      case 'detecter':
        return { id: r.id, ok: true, type: 'detecter', coins: detecterCoins(cv, r.img) };
      case 'traiter': {
        const droit = redresser(cv, r.img, r.coins, r.rotation);
        return { id: r.id, ok: true, type: 'traiter', img: appliquerFiltre(cv, droit, r.filtre) };
      }
    }
  } catch (e) {
    return { id: r.id, ok: false, erreur: e instanceof Error ? e.message : `Erreur de traitement (${String(e)})` };
  }
}
```

- [ ] **Step 5 : Écrire `src/traitement/client.ts`**

```ts
import type { PortWorker, Reponse, Requete } from './protocole';
import type { Coins, Filtre, Img, Rotation } from './types';

export class Traitement {
  private suivant = 1;
  private attente = new Map<number, (r: Reponse) => void>();

  constructor(private worker: PortWorker) {
    worker.onmessage = (e) => {
      const repondre = this.attente.get(e.data.id);
      this.attente.delete(e.data.id);
      repondre?.(e.data);
    };
  }

  private envoyer(r: Requete, transfert: Transferable[] = []): Promise<Reponse> {
    return new Promise((resolve) => {
      this.attente.set(r.id, resolve);
      this.worker.postMessage(r, transfert);
    });
  }

  async preparer(): Promise<void> {
    const r = await this.envoyer({ id: this.suivant++, type: 'preparer' });
    if (!r.ok) throw new Error(r.erreur);
  }

  async detecter(img: Img): Promise<Coins | null> {
    const r = await this.envoyer({ id: this.suivant++, type: 'detecter', img }, [img.data.buffer]);
    if (!r.ok) throw new Error(r.erreur);
    if (r.type !== 'detecter') throw new Error('Réponse inattendue du traitement');
    return r.coins;
  }

  async traiter(img: Img, coins: Coins, rotation: Rotation, filtre: Filtre): Promise<Img> {
    const r = await this.envoyer({ id: this.suivant++, type: 'traiter', img, coins, rotation, filtre }, [img.data.buffer]);
    if (!r.ok) throw new Error(r.erreur);
    if (r.type !== 'traiter') throw new Error('Réponse inattendue du traitement');
    return r.img;
  }
}

let instance: Traitement | null = null;

/** Le traitement de l'appli, lié au vrai Web Worker (créé au premier appel). */
export function traitement(): Traitement {
  if (!instance) {
    const worker = new Worker(new URL('./traitement.worker.ts', import.meta.url), { type: 'module' });
    instance = new Traitement(worker as unknown as PortWorker);
  }
  return instance;
}
```

- [ ] **Step 6 : Écrire `src/traitement/traitement.worker.ts`**

```ts
import { gererRequete } from './coeur';
import { chargerOpenCV } from './opencv';
import type { Reponse, Requete } from './protocole';

const portee = self as unknown as {
  onmessage: ((e: MessageEvent<Requete>) => void) | null;
  postMessage(message: Reponse, transfert?: Transferable[]): void;
};

portee.onmessage = async (e) => {
  const { cv } = await chargerOpenCV();
  const reponse = gererRequete(cv, e.data);
  portee.postMessage(reponse, reponse.ok && reponse.type === 'traiter' ? [reponse.img.data.buffer] : []);
};
```

- [ ] **Step 7 : Lancer le test, il doit passer**

Run : `npx vitest run tests/traitement.test.ts`
Expected : 5 tests PASS

- [ ] **Step 8 : Vérifier la compilation**

Run : `npx tsc --noEmit`
Expected : aucune erreur

- [ ] **Step 9 : Commit**

```bash
git add src/traitement tests/traitement.test.ts
git commit -m "Web Worker de traitement d'image et son client" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : Rangement des documents (IndexedDB)

**Files :**
- Create : `src/rangement/modele.ts`, `src/rangement/depot.ts`, `tests/aides/jpeg.ts`
- Test : `tests/depot.test.ts`

**Interfaces :**
- Consumes : `Coins`, `Filtre`, `Rotation` (Task 2), `coinsPleineImage` (Task 2)
- Produces :
  - types `DocumentScan`, `ImageJpeg`, `PageScan`, `NouvellePage`, `PageBrouillon` (ci-dessous)
  - `ouvrirDepot(nomBase = 'fof-scan', horloge = Date.now): Promise<Depot>`
  - `class Depot` : `listerDocuments()`, `lireDocument(id)`, `creerDocument(nom)`, `renommer(id, nom)`, `supprimerDocument(id)`, `ajouterPage(documentId, page: NouvellePage): Promise<PageScan>`, `lirePage(id)`, `lirePages(documentId)` (dans l'ordre du document), `mettreAJourPage(page)`, `supprimerPage(pageId)`, `reordonner(documentId, ordre: string[])`, `toutLire(): Promise<{ documents; pages }>`, `importer(documents, pages): Promise<{ ajoutes; ignores }>`
  - `class ErreurStockagePlein extends Error` ; `estErreurQuota(e: unknown): boolean`
  - aides de test : `jpegFactice(largeur, hauteur, gris = 200): ImageJpeg`, `pageFactice(gris = 200): NouvellePage`

- [ ] **Step 1 : Écrire `src/rangement/modele.ts`**

```ts
import type { Coins, Filtre, Rotation } from '../traitement/types';

export interface DocumentScan {
  id: string;
  nom: string;
  cree: number;
  modifie: number;
  /** Identifiants des pages, dans l'ordre. */
  pages: string[];
}

export interface ImageJpeg { octets: Uint8Array; largeur: number; hauteur: number }

export interface PageScan {
  id: string;
  documentId: string;
  /** Photo d'origine (≤ 3 000 px) : permet de refaire recadrage et filtre sans perte. */
  original: ImageJpeg;
  coins: Coins;
  rotation: Rotation;
  filtre: Filtre;
  traitee: ImageJpeg;
  miniature: ImageJpeg;
}

export type NouvellePage = Omit<PageScan, 'id' | 'documentId'>;

/** Page en cours de scan, pas encore traitée ni enregistrée. */
export interface PageBrouillon {
  original: ImageJpeg;
  coins: Coins;
  rotation: Rotation;
  filtre: Filtre;
  /** Faux quand la feuille n'a pas été trouvée et que les coins couvrent toute la photo. */
  detecte: boolean;
}
```

- [ ] **Step 2 : Écrire les aides `tests/aides/jpeg.ts`**

```ts
import jpeg from 'jpeg-js';
import type { ImageJpeg, NouvellePage } from '../../src/rangement/modele';
import { coinsPleineImage } from '../../src/traitement/geometrie';

export function jpegFactice(largeur: number, hauteur: number, gris = 200): ImageJpeg {
  const data = Buffer.alloc(largeur * hauteur * 4, gris);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { octets: new Uint8Array(jpeg.encode({ data, width: largeur, height: hauteur }, 80).data), largeur, hauteur };
}

export function pageFactice(gris = 200): NouvellePage {
  const im = jpegFactice(4, 4, gris);
  return { original: im, coins: coinsPleineImage(4, 4), rotation: 0, filtre: 'ameliore', traitee: im, miniature: im };
}
```

- [ ] **Step 3 : Écrire le test qui échoue — `tests/depot.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ErreurStockagePlein, estErreurQuota, ouvrirDepot } from '../src/rangement/depot';
import { pageFactice } from './aides/jpeg';

function depotNeuf() {
  let t = 1000;
  return ouvrirDepot(`test-${crypto.randomUUID()}`, () => t++);
}

describe('Depot', () => {
  it('crée et liste les documents, le plus récent en haut', async () => {
    const d = await depotNeuf();
    const a = await d.creerDocument('A');
    const b = await d.creerDocument('B');
    expect((await d.listerDocuments()).map((x) => x.id)).toEqual([b.id, a.id]);
    await d.renommer(a.id, 'A bis');
    const liste = await d.listerDocuments();
    expect(liste[0].nom).toBe('A bis');
  });

  it('ajoute des pages et les relit dans l\'ordre', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const p1 = await d.ajouterPage(doc.id, pageFactice(10));
    const p2 = await d.ajouterPage(doc.id, pageFactice(20));
    expect((await d.lireDocument(doc.id))!.pages).toEqual([p1.id, p2.id]);
    const pages = await d.lirePages(doc.id);
    expect(pages.map((p) => p.id)).toEqual([p1.id, p2.id]);
    expect(pages[0].original.octets).toEqual(p1.original.octets);
  });

  it('réordonne et refuse un ordre incomplet', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const p1 = await d.ajouterPage(doc.id, pageFactice());
    const p2 = await d.ajouterPage(doc.id, pageFactice());
    await d.reordonner(doc.id, [p2.id, p1.id]);
    expect((await d.lirePages(doc.id)).map((p) => p.id)).toEqual([p2.id, p1.id]);
    await expect(d.reordonner(doc.id, [p1.id])).rejects.toThrow('Ordre de pages invalide');
  });

  it('met à jour une page', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const p = await d.ajouterPage(doc.id, pageFactice());
    await d.mettreAJourPage({ ...p, filtre: 'nb', rotation: 90 });
    const relue = await d.lirePage(p.id);
    expect(relue!.filtre).toBe('nb');
    expect(relue!.rotation).toBe(90);
  });

  it('supprime une page puis un document avec ses pages', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const p1 = await d.ajouterPage(doc.id, pageFactice());
    const p2 = await d.ajouterPage(doc.id, pageFactice());
    await d.supprimerPage(p1.id);
    expect((await d.lireDocument(doc.id))!.pages).toEqual([p2.id]);
    expect(await d.lirePage(p1.id)).toBeUndefined();
    await d.supprimerDocument(doc.id);
    expect(await d.lireDocument(doc.id)).toBeUndefined();
    expect(await d.lirePage(p2.id)).toBeUndefined();
  });

  it('importe sans dupliquer un document déjà présent', async () => {
    const source = await depotNeuf();
    const doc = await source.creerDocument('Fiche');
    await source.ajouterPage(doc.id, pageFactice());
    const { documents, pages } = await source.toutLire();
    const cible = await depotNeuf();
    expect(await cible.importer(documents, pages)).toEqual({ ajoutes: 1, ignores: 0 });
    expect(await cible.importer(documents, pages)).toEqual({ ajoutes: 0, ignores: 1 });
    expect(await cible.toutLire()).toEqual({ documents, pages });
  });

  it('reconnaît une erreur de mémoire pleine', () => {
    expect(estErreurQuota(new DOMException('plein', 'QuotaExceededError'))).toBe(true);
    expect(estErreurQuota(new Error('autre'))).toBe(false);
    expect(new ErreurStockagePlein().message).toContain('pleine');
  });
});
```

- [ ] **Step 4 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/depot.test.ts`
Expected : FAIL — module `depot` introuvable

- [ ] **Step 5 : Écrire `src/rangement/depot.ts`**

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DocumentScan, NouvellePage, PageScan } from './modele';

interface Schema extends DBSchema {
  documents: { key: string; value: DocumentScan };
  pages: { key: string; value: PageScan; indexes: { parDocument: string } };
}

export class ErreurStockagePlein extends Error {
  constructor() {
    super('La mémoire du téléphone est pleine.');
    this.name = 'ErreurStockagePlein';
  }
}

export function estErreurQuota(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'QuotaExceededError';
}

async function proteger<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (estErreurQuota(e)) throw new ErreurStockagePlein();
    throw e;
  }
}

export async function ouvrirDepot(nomBase = 'fof-scan', horloge: () => number = Date.now): Promise<Depot> {
  const db = await openDB<Schema>(nomBase, 1, {
    upgrade(base) {
      base.createObjectStore('documents', { keyPath: 'id' });
      base.createObjectStore('pages', { keyPath: 'id' }).createIndex('parDocument', 'documentId');
    },
  });
  return new Depot(db, horloge);
}

export class Depot {
  constructor(private db: IDBPDatabase<Schema>, private horloge: () => number) {}

  async listerDocuments(): Promise<DocumentScan[]> {
    return (await this.db.getAll('documents')).sort((a, b) => b.modifie - a.modifie);
  }

  lireDocument(id: string): Promise<DocumentScan | undefined> {
    return this.db.get('documents', id);
  }

  creerDocument(nom: string): Promise<DocumentScan> {
    const t = this.horloge();
    const doc: DocumentScan = { id: crypto.randomUUID(), nom, cree: t, modifie: t, pages: [] };
    return proteger(async () => { await this.db.put('documents', doc); return doc; });
  }

  renommer(id: string, nom: string): Promise<void> {
    return this.modifierDocument(id, (d) => { d.nom = nom; });
  }

  async ajouterPage(documentId: string, page: NouvellePage): Promise<PageScan> {
    const complete: PageScan = { ...page, id: crypto.randomUUID(), documentId };
    await proteger(async () => {
      const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
      const doc = await tx.objectStore('documents').get(documentId);
      if (!doc) throw new Error('Document introuvable');
      doc.pages.push(complete.id);
      doc.modifie = this.horloge();
      await Promise.all([tx.objectStore('pages').put(complete), tx.objectStore('documents').put(doc), tx.done]);
    });
    return complete;
  }

  lirePage(id: string): Promise<PageScan | undefined> {
    return this.db.get('pages', id);
  }

  async lirePages(documentId: string): Promise<PageScan[]> {
    const doc = await this.lireDocument(documentId);
    if (!doc) return [];
    const pages = await this.db.getAllFromIndex('pages', 'parDocument', documentId);
    const parId = new Map(pages.map((p) => [p.id, p]));
    return doc.pages.map((id) => parId.get(id)).filter((p): p is PageScan => p !== undefined);
  }

  async mettreAJourPage(page: PageScan): Promise<void> {
    await proteger(async () => {
      const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
      const doc = await tx.objectStore('documents').get(page.documentId);
      if (!doc) throw new Error('Document introuvable');
      doc.modifie = this.horloge();
      await Promise.all([tx.objectStore('pages').put(page), tx.objectStore('documents').put(doc), tx.done]);
    });
  }

  async supprimerPage(pageId: string): Promise<void> {
    const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
    const page = await tx.objectStore('pages').get(pageId);
    if (page) {
      const doc = await tx.objectStore('documents').get(page.documentId);
      if (doc) {
        doc.pages = doc.pages.filter((id) => id !== pageId);
        doc.modifie = this.horloge();
        await tx.objectStore('documents').put(doc);
      }
      await tx.objectStore('pages').delete(pageId);
    }
    await tx.done;
  }

  reordonner(documentId: string, ordre: string[]): Promise<void> {
    return this.modifierDocument(documentId, (d) => {
      if (ordre.length !== d.pages.length || !ordre.every((id) => d.pages.includes(id))) {
        throw new Error('Ordre de pages invalide');
      }
      d.pages = [...ordre];
    });
  }

  async supprimerDocument(id: string): Promise<void> {
    const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
    const cles = await tx.objectStore('pages').index('parDocument').getAllKeys(id);
    await Promise.all([
      ...cles.map((k) => tx.objectStore('pages').delete(k)),
      tx.objectStore('documents').delete(id),
      tx.done,
    ]);
  }

  async toutLire(): Promise<{ documents: DocumentScan[]; pages: PageScan[] }> {
    return { documents: await this.db.getAll('documents'), pages: await this.db.getAll('pages') };
  }

  async importer(documents: DocumentScan[], pages: PageScan[]): Promise<{ ajoutes: number; ignores: number }> {
    let ajoutes = 0;
    let ignores = 0;
    await proteger(async () => {
      const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
      for (const doc of documents) {
        if (await tx.objectStore('documents').get(doc.id)) { ignores++; continue; }
        await tx.objectStore('documents').put(doc);
        for (const p of pages.filter((x) => x.documentId === doc.id)) await tx.objectStore('pages').put(p);
        ajoutes++;
      }
      await tx.done;
    });
    return { ajoutes, ignores };
  }

  private async modifierDocument(id: string, modifier: (d: DocumentScan) => void): Promise<void> {
    await proteger(async () => {
      const tx = this.db.transaction('documents', 'readwrite');
      const d = await tx.store.get(id);
      if (!d) throw new Error('Document introuvable');
      modifier(d);
      d.modifie = this.horloge();
      await Promise.all([tx.store.put(d), tx.done]);
    });
  }
}
```

- [ ] **Step 6 : Lancer le test, il doit passer**

Run : `npx vitest run tests/depot.test.ts`
Expected : 7 tests PASS

- [ ] **Step 7 : Commit**

```bash
git add src/rangement tests/aides/jpeg.ts tests/depot.test.ts
git commit -m "Rangement des documents et des pages dans IndexedDB" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : Sauvegarde et restauration (zip)

**Files :**
- Create : `src/rangement/sauvegarde.ts`
- Test : `tests/sauvegarde.test.ts`

**Interfaces :**
- Consumes : `DocumentScan`, `PageScan` (Task 7), `Depot` (Task 7)
- Produces : `creerSauvegarde(documents, pages): Uint8Array`, `lireSauvegarde(zip: Uint8Array): { documents; pages }`, `nomSauvegarde(d: Date): string`

- [ ] **Step 1 : Écrire le test qui échoue — `tests/sauvegarde.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ouvrirDepot } from '../src/rangement/depot';
import { creerSauvegarde, lireSauvegarde, nomSauvegarde } from '../src/rangement/sauvegarde';
import { pageFactice } from './aides/jpeg';

describe('sauvegarde', () => {
  it('nomme le fichier avec la date', () => {
    expect(nomSauvegarde(new Date(2026, 9, 5))).toBe('FOF-Scan-sauvegarde-2026-10-05.zip');
  });

  it('sauvegarde puis restaure dans un autre dépôt : tout est identique', async () => {
    const source = await ouvrirDepot(`s-${crypto.randomUUID()}`);
    const doc = await source.creerDocument('Bordereau');
    await source.ajouterPage(doc.id, pageFactice(30));
    await source.ajouterPage(doc.id, pageFactice(90));
    const avant = await source.toutLire();

    const relu = lireSauvegarde(creerSauvegarde(avant.documents, avant.pages));
    const cible = await ouvrirDepot(`c-${crypto.randomUUID()}`);
    await cible.importer(relu.documents, relu.pages);

    const apres = await cible.toutLire();
    expect(apres.documents).toEqual(avant.documents);
    const parId = (l: typeof apres.pages) => [...l].sort((a, b) => a.id.localeCompare(b.id));
    expect(parId(apres.pages)).toEqual(parId(avant.pages));
  });

  it('refuse un fichier qui n\'est pas une sauvegarde', () => {
    expect(() => lireSauvegarde(new Uint8Array([1, 2, 3]))).toThrow("n'est pas une sauvegarde FOF Scan");
    expect(() => lireSauvegarde(zipSync({ 'autre.txt': new Uint8Array([65]) }))).toThrow("n'est pas une sauvegarde FOF Scan");
  });
});
```

- [ ] **Step 2 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/sauvegarde.test.ts`
Expected : FAIL — module `sauvegarde` introuvable

- [ ] **Step 3 : Écrire `src/rangement/sauvegarde.ts`**

```ts
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { DocumentScan, PageScan } from './modele';

const VERSION = 1;
const APPLICATION = 'FOF Scan';
const SORTES = ['original', 'traitee', 'miniature'] as const;
const PAS_UNE_SAUVEGARDE = "Ce fichier n'est pas une sauvegarde FOF Scan.";

const chemin = (pageId: string, sorte: string) => `images/${pageId}-${sorte}.jpg`;

export function nomSauvegarde(d: Date): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `FOF-Scan-sauvegarde-${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}.zip`;
}

/** Un zip : `manifeste.json` (documents et pages sans les images) + toutes les images JPEG. */
export function creerSauvegarde(documents: DocumentScan[], pages: PageScan[]): Uint8Array {
  const fichiers: Record<string, Uint8Array> = {};
  const pagesManifeste = pages.map((p) => {
    const copie: Record<string, unknown> = { ...p };
    for (const s of SORTES) {
      fichiers[chemin(p.id, s)] = p[s].octets;
      copie[s] = { largeur: p[s].largeur, hauteur: p[s].hauteur };
    }
    return copie;
  });
  fichiers['manifeste.json'] = strToU8(JSON.stringify({ application: APPLICATION, version: VERSION, documents, pages: pagesManifeste }));
  // Les JPEG ne se compressent plus : on range sans compresser, c'est plus rapide.
  return zipSync(fichiers, { level: 0 });
}

export function lireSauvegarde(zip: Uint8Array): { documents: DocumentScan[]; pages: PageScan[] } {
  let fichiers: Record<string, Uint8Array>;
  try {
    fichiers = unzipSync(zip);
  } catch {
    throw new Error(PAS_UNE_SAUVEGARDE);
  }
  const brut = fichiers['manifeste.json'];
  if (!brut) throw new Error(PAS_UNE_SAUVEGARDE);
  const manifeste = JSON.parse(strFromU8(brut));
  if (manifeste.application !== APPLICATION || manifeste.version !== VERSION) throw new Error(PAS_UNE_SAUVEGARDE);

  const pages: PageScan[] = manifeste.pages.map((p: Record<string, unknown> & { id: string }) => {
    const page: Record<string, unknown> = { ...p };
    for (const s of SORTES) {
      const octets = fichiers[chemin(p.id, s)];
      if (!octets) throw new Error(`Sauvegarde incomplète : une image manque (${p.id}).`);
      page[s] = { ...(p[s] as object), octets };
    }
    return page as unknown as PageScan;
  });
  return { documents: manifeste.documents, pages };
}
```

- [ ] **Step 4 : Lancer le test, il doit passer**

Run : `npx vitest run tests/sauvegarde.test.ts`
Expected : 3 tests PASS

- [ ] **Step 5 : Commit**

```bash
git add src/rangement/sauvegarde.ts tests/sauvegarde.test.ts
git commit -m "Sauvegarde et restauration de tous les documents" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : Fabrication du PDF et préparation de l'export

**Files :**
- Create : `src/export/pdf.ts`, `src/export/preparer.ts`
- Test : `tests/export.test.ts`

**Interfaces :**
- Consumes : `ImageJpeg`, `DocumentScan`, `PageScan` (Task 7) ; `nomFichier` (Task 1)
- Produces :
  - `type FormatPdf = 'a4' | 'reel'`
  - `placement(largeur, hauteur, format): { page: { largeur; hauteur }; image: { x; y; largeur; hauteur } }`
  - `fabriquerPdf(images: ImageJpeg[], format: FormatPdf, titre: string): Promise<Uint8Array>`
  - `interface OptionsExport { type: 'pdf' | 'jpg'; format: FormatPdf; qualite: 'normale' | 'legere' }`
  - `QUALITES = { normale: { coteMax: 2480, qualite: 0.85 }, legere: { coteMax: 1654, qualite: 0.6 } }`
  - `type Reencodeur = (im: ImageJpeg, coteMax: number, qualite: number) => Promise<ImageJpeg>`
  - `preparerExport(doc, pages, options, reencoder: Reencodeur, progres?: (fait, total) => void): Promise<File[]>`

- [ ] **Step 1 : Écrire le test qui échoue — `tests/export.test.ts`**

```ts
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { fabriquerPdf, placement } from '../src/export/pdf';
import { preparerExport, QUALITES } from '../src/export/preparer';
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
```

- [ ] **Step 2 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/export.test.ts`
Expected : FAIL — modules `pdf` / `preparer` introuvables

- [ ] **Step 3 : Écrire `src/export/pdf.ts`**

```ts
import { PDFDocument } from 'pdf-lib';
import type { ImageJpeg } from '../rangement/modele';

export type FormatPdf = 'a4' | 'reel';

/** Dimensions A4 en points PDF. */
const A4 = { petit: 595.28, grand: 841.89 };

export function placement(largeur: number, hauteur: number, format: FormatPdf) {
  if (format === 'reel') {
    const f = A4.grand / Math.max(largeur, hauteur);
    const l = largeur * f;
    const h = hauteur * f;
    return { page: { largeur: l, hauteur: h }, image: { x: 0, y: 0, largeur: l, hauteur: h } };
  }
  const page = largeur > hauteur
    ? { largeur: A4.grand, hauteur: A4.petit }
    : { largeur: A4.petit, hauteur: A4.grand };
  const f = Math.min(page.largeur / largeur, page.hauteur / hauteur);
  const l = largeur * f;
  const h = hauteur * f;
  return { page, image: { x: (page.largeur - l) / 2, y: (page.hauteur - h) / 2, largeur: l, hauteur: h } };
}

export async function fabriquerPdf(images: ImageJpeg[], format: FormatPdf, titre: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(titre);
  pdf.setCreator('FOF Scan');
  pdf.setProducer('FOF Scan');
  for (const im of images) {
    const jpg = await pdf.embedJpg(im.octets);
    const p = placement(im.largeur, im.hauteur, format);
    pdf.addPage([p.page.largeur, p.page.hauteur])
      .drawImage(jpg, { x: p.image.x, y: p.image.y, width: p.image.largeur, height: p.image.hauteur });
  }
  return pdf.save();
}
```

- [ ] **Step 4 : Écrire `src/export/preparer.ts`**

```ts
import { nomFichier } from '../nommage';
import type { DocumentScan, ImageJpeg, PageScan } from '../rangement/modele';
import { fabriquerPdf, type FormatPdf } from './pdf';

export interface OptionsExport { type: 'pdf' | 'jpg'; format: FormatPdf; qualite: 'normale' | 'legere' }

export const QUALITES = {
  normale: { coteMax: 2480, qualite: 0.85 },
  legere: { coteMax: 1654, qualite: 0.6 },
} as const;

export type Reencodeur = (im: ImageJpeg, coteMax: number, qualite: number) => Promise<ImageJpeg>;

/** Réencode les pages une par une (pour ménager la mémoire de Safari), puis fabrique les fichiers. */
export async function preparerExport(
  doc: DocumentScan,
  pages: PageScan[],
  options: OptionsExport,
  reencoder: Reencodeur,
  progres?: (fait: number, total: number) => void,
): Promise<File[]> {
  const { coteMax, qualite } = QUALITES[options.qualite];
  const images: ImageJpeg[] = [];
  for (const [k, p] of pages.entries()) {
    images.push(await reencoder(p.traitee, coteMax, qualite));
    progres?.(k + 1, pages.length);
  }
  if (options.type === 'pdf') {
    const pdf = await fabriquerPdf(images, options.format, doc.nom);
    return [new File([pdf], nomFichier(doc.nom, 'pdf'), { type: 'application/pdf' })];
  }
  return images.map((im, k) => new File(
    [im.octets],
    images.length === 1 ? nomFichier(doc.nom, 'jpg') : nomFichier(`${doc.nom} - p${k + 1}`, 'jpg'),
    { type: 'image/jpeg' },
  ));
}
```

- [ ] **Step 5 : Lancer le test, il doit passer**

Run : `npx vitest run tests/export.test.ts`
Expected : 7 tests PASS

- [ ] **Step 6 : Lancer toute la suite**

Run : `npm test`
Expected : tous les tests PASS

- [ ] **Step 7 : Commit**

```bash
git add src/export tests/export.test.ts
git commit -m "Fabrication du PDF et préparation de l'export PDF ou JPG" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10 : Code navigateur — images, chaîne d'une page, partage, stockage, préférences

Ce code exige un vrai navigateur (canvas, Web Worker, partage) : il est vérifié dans la page de développement plutôt que par Vitest.

**Files :**
- Create : `src/navigateur/images.ts`, `src/navigateur/pipeline.ts`, `src/navigateur/partage.ts`, `src/navigateur/stockage.ts`, `src/navigateur/preferences.ts`, `scripts/generer-feuille-test.mjs`, `tests/aides/feuille-synthetique.jpg` (généré)

**Interfaces :**
- Consumes : `traitement()` (Task 6) ; `dimensionsReduites`, `mettreAEchelle`, `coinsPleineImage` (Task 2) ; `ImageJpeg`, `NouvellePage`, `PageBrouillon` (Task 7)
- Produces :
  - `chargerImage(source: Blob | Uint8Array): Promise<HTMLImageElement>`
  - `versCanvas(source: CanvasImageSource, largeurSrc, hauteurSrc, coteMax): HTMLCanvasElement`
  - `lireImg(c: HTMLCanvasElement): Img` ; `imgVersCanvas(img: Img): HTMLCanvasElement`
  - `canvasVersJpeg(c, qualite): Promise<ImageJpeg>` ; `reencoder(im, coteMax, qualite): Promise<ImageJpeg>` (de type `Reencodeur`) ; `urlImage(im: ImageJpeg): string`
  - `brouillonDepuisCanvas(c: HTMLCanvasElement): Promise<PageBrouillon>` ; `brouillonDepuisFichier(f: Blob): Promise<PageBrouillon>`
  - `traiterBrouillon(b: PageBrouillon, coteMax: number): Promise<HTMLCanvasElement>` ; `rendrePage(b: PageBrouillon): Promise<NouvellePage>`
  - `partagerFichiers(fichiers: File[]): Promise<'partage' | 'telecharge' | 'annule'>`
  - `demanderStockagePermanent(): Promise<boolean>`
  - `lirePreference<T>(cle, defaut: T): T` ; `ecrirePreference(cle, valeur): void`

- [ ] **Step 1 : Écrire `src/navigateur/images.ts`**

```ts
import type { ImageJpeg } from '../rangement/modele';
import { dimensionsReduites } from '../traitement/geometrie';
import type { Img } from '../traitement/types';

/** Décode une image (Safari applique l'orientation EXIF des photos de l'iPhone). */
export async function chargerImage(source: Blob | Uint8Array): Promise<HTMLImageElement> {
  const blob = source instanceof Blob ? source : new Blob([source], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function versCanvas(source: CanvasImageSource, largeurSrc: number, hauteurSrc: number, coteMax: number): HTMLCanvasElement {
  const { largeur, hauteur } = dimensionsReduites(largeurSrc, hauteurSrc, coteMax);
  const c = document.createElement('canvas');
  c.width = largeur;
  c.height = hauteur;
  c.getContext('2d')!.drawImage(source, 0, 0, largeur, hauteur);
  return c;
}

export function lireImg(c: HTMLCanvasElement): Img {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  return { data: d.data, width: d.width, height: d.height };
}

export function imgVersCanvas(img: Img): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return c;
}

export async function canvasVersJpeg(c: HTMLCanvasElement, qualite: number): Promise<ImageJpeg> {
  const blob = await new Promise<Blob>((ok, ko) =>
    c.toBlob((b) => (b ? ok(b) : ko(new Error('Encodage JPEG impossible'))), 'image/jpeg', qualite));
  return { octets: new Uint8Array(await blob.arrayBuffer()), largeur: c.width, hauteur: c.height };
}

export async function reencoder(im: ImageJpeg, coteMax: number, qualite: number): Promise<ImageJpeg> {
  const img = await chargerImage(im.octets);
  return canvasVersJpeg(versCanvas(img, img.naturalWidth, img.naturalHeight, coteMax), qualite);
}

/** Adresse temporaire pour afficher une image ; la libérer avec URL.revokeObjectURL. */
export function urlImage(im: ImageJpeg): string {
  return URL.createObjectURL(new Blob([im.octets], { type: 'image/jpeg' }));
}
```

- [ ] **Step 2 : Écrire `src/navigateur/pipeline.ts`**

```ts
import type { NouvellePage, PageBrouillon } from '../rangement/modele';
import { traitement } from '../traitement/client';
import { coinsPleineImage, mettreAEchelle } from '../traitement/geometrie';
import { canvasVersJpeg, chargerImage, imgVersCanvas, lireImg, versCanvas } from './images';

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
    filtre: 'ameliore',
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
  return imgVersCanvas(await traitement().traiter(lireImg(c), coins, b.rotation, b.filtre));
}

export async function rendrePage(b: PageBrouillon): Promise<NouvellePage> {
  const c = await traiterBrouillon(b, COTE_MAX);
  return {
    original: b.original,
    coins: b.coins,
    rotation: b.rotation,
    filtre: b.filtre,
    traitee: await canvasVersJpeg(c, 0.85),
    miniature: await canvasVersJpeg(versCanvas(c, c.width, c.height, 300), 0.7),
  };
}
```

- [ ] **Step 3 : Écrire `src/navigateur/partage.ts`**

```ts
/**
 * Ouvre le menu Partager de l'iPhone. Safari exige que l'appel suive directement un toucher :
 * il faut donc préparer les fichiers AVANT, puis appeler cette fonction depuis un bouton.
 */
export async function partagerFichiers(fichiers: File[]): Promise<'partage' | 'telecharge' | 'annule'> {
  if (navigator.canShare?.({ files: fichiers })) {
    try {
      await navigator.share({ files: fichiers });
      return 'partage';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'annule';
      throw e;
    }
  }
  for (const f of fichiers) telecharger(f);
  return 'telecharge';
}

function telecharger(f: File): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(f);
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
```

- [ ] **Step 4 : Écrire `src/navigateur/stockage.ts` et `src/navigateur/preferences.ts`**

`src/navigateur/stockage.ts` :

```ts
/** Demande à l'iPhone de ne pas vider la mémoire de l'appli quand il manque de place. */
export async function demanderStockagePermanent(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
```

`src/navigateur/preferences.ts` :

```ts
const PREFIXE = 'fof-scan:';

export function lirePreference<T>(cle: string, defaut: T): T {
  try {
    const v = localStorage.getItem(PREFIXE + cle);
    return v === null ? defaut : (JSON.parse(v) as T);
  } catch {
    return defaut;
  }
}

export function ecrirePreference(cle: string, valeur: unknown): void {
  try {
    localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
  } catch {
    // stockage indisponible (navigation privée) : la préférence n'est simplement pas retenue
  }
}
```

- [ ] **Step 5 : Créer l'image de test synthétique — `scripts/generer-feuille-test.mjs`**

```js
// Fabrique tests/aides/feuille-synthetique.jpg : une feuille ombrée, de travers, sur une table sombre.
import jpeg from 'jpeg-js';
import { writeFileSync } from 'node:fs';

const L = 1200, H = 900;
const feuille = [[180, 120], [1010, 160], [1060, 820], [140, 780]];
const data = Buffer.alloc(L * H * 4);

function dedans(x, y) {
  let d = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, yi] = feuille[i], [xj, yj] = feuille[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
  let v = 70 + ((x * 7 + y * 13) % 17); // table sombre, un peu texturée
  if (dedans(x, y)) {
    v = 225 - Math.round((60 * x) / L); // papier avec une ombre
    if (y % 60 < 4 && x > 260 && x < 960 && y > 200 && y < 760) v = 30; // lignes de texte
  }
  const i = (y * L + x) * 4;
  data[i] = v; data[i + 1] = v; data[i + 2] = Math.min(255, v + 5); data[i + 3] = 255;
}

writeFileSync('tests/aides/feuille-synthetique.jpg', jpeg.encode({ data, width: L, height: H }, 90).data);
console.log('tests/aides/feuille-synthetique.jpg écrit');
```

Run : `node scripts/generer-feuille-test.mjs`
Expected : `tests/aides/feuille-synthetique.jpg écrit`

- [ ] **Step 6 : Vérifier la compilation**

Run : `npx tsc --noEmit`
Expected : aucune erreur

- [ ] **Step 7 : Vérifier la chaîne complète dans le navigateur**

`preview_start` `fof-scan`, puis `javascript_tool` (le serveur Vite sert les fichiers du projet) :

```js
const { brouillonDepuisFichier, rendrePage } = await import('/src/navigateur/pipeline.ts');
const blob = await (await fetch('/tests/aides/feuille-synthetique.jpg')).blob();
const b = await brouillonDepuisFichier(blob);
const p = await rendrePage(b);
({ detecte: b.detecte, coins: b.coins.map((c) => [Math.round(c.x), Math.round(c.y)]),
   traitee: [p.traitee.largeur, p.traitee.hauteur, p.traitee.octets.length], miniature: p.miniature.largeur });
```

Expected : `detecte: true` ; coins proches de `[180,120] [1010,160] [1060,820] [140,780]` (± 15 px) ; page traitée d'environ 880 × 680 ; miniature de 300 px. `read_console_messages` : aucune erreur.

Si le chargement du worker échoue à cause de modules Node (`fs`, `path`, `crypto`) importés par OpenCV : créer `src/vide.ts` contenant `export default {};` et ajouter dans `vite.config.ts` `resolve: { alias: { fs: '/src/vide.ts', path: '/src/vide.ts' } }`, puis recommencer.

- [ ] **Step 8 : Commit**

```bash
git add src/navigateur scripts/generer-feuille-test.mjs tests/aides/feuille-synthetique.jpg
git commit -m "Code navigateur : images, chaîne de traitement d'une page, partage et préférences" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11 : Coquille de l'appli et écran d'accueil

**Files :**
- Create : `src/ecrans/navigation.ts`, `src/ecrans/recherche.ts`, `src/ecrans/importer.ts`, `src/ecrans/Miniature.tsx`, `src/ecrans/FichierPret.tsx`, `src/ecrans/Accueil.tsx`
- Modify : `src/app.tsx` (remplacé entièrement), `src/styles.css` (rempli)
- Test : `tests/ecrans.test.ts`

**Interfaces :**
- Consumes : `Depot`, `ErreurStockagePlein` (Task 7) ; `creerSauvegarde`, `lireSauvegarde`, `nomSauvegarde` (Task 8) ; `brouillonDepuisFichier`, `urlImage`, `partagerFichiers`, `demanderStockagePermanent` (Task 10) ; `traitement()` (Task 6) ; `dateCourte`, `tailleLisible` (Task 1)
- Produces :
  - `interface Lot { documentId: string | null; brouillons: PageBrouillon[]; pageExistante: PageScan | null }`
  - `type Ecran = { nom: 'accueil' } | { nom: 'viseur'; documentId: string | null } | { nom: 'recadrage'; lot: Lot } | { nom: 'filtres'; lot: Lot } | { nom: 'document'; id: string } | { nom: 'export'; id: string }`
  - `interface Nav { aller(e: Ecran): void; signaler(message: string): void }`
  - `retour(lot: Lot): Ecran` ; `messageErreur(e: unknown): string`
  - `filtrerDocuments(docs: DocumentScan[], recherche: string): DocumentScan[]`
  - `importerFichiers(fichiers: File[], documentId: string | null): Promise<Lot>`
  - composants `<Miniature depot pageId? />`, `<FichierPret fichiers nav onFermer />`, `<Accueil depot nav />`

- [ ] **Step 1 : Écrire le test qui échoue — `tests/ecrans.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ErreurStockagePlein } from '../src/rangement/depot';
import type { DocumentScan, PageScan } from '../src/rangement/modele';
import { messageErreur, retour } from '../src/ecrans/navigation';
import { filtrerDocuments } from '../src/ecrans/recherche';

const doc = (nom: string): DocumentScan => ({ id: nom, nom, cree: 0, modifie: 0, pages: [] });

describe('filtrerDocuments', () => {
  const docs = [doc('Bordereau Éléphant'), doc('Fiche SACO'), doc('reçu')];
  it('ignore majuscules et accents', () => {
    expect(filtrerDocuments(docs, 'elephant').map((d) => d.nom)).toEqual(['Bordereau Éléphant']);
    expect(filtrerDocuments(docs, 'RECU').map((d) => d.nom)).toEqual(['reçu']);
  });
  it('rend tout si la recherche est vide', () => {
    expect(filtrerDocuments(docs, '  ')).toHaveLength(3);
  });
});

describe('navigation', () => {
  it('retour : vers le document de la page modifiée, du lot, sinon l\'accueil', () => {
    const page = { documentId: 'p' } as PageScan;
    expect(retour({ documentId: null, brouillons: [], pageExistante: page })).toEqual({ nom: 'document', id: 'p' });
    expect(retour({ documentId: 'd', brouillons: [], pageExistante: null })).toEqual({ nom: 'document', id: 'd' });
    expect(retour({ documentId: null, brouillons: [], pageExistante: null })).toEqual({ nom: 'accueil' });
  });

  it('messageErreur : un message clair pour la mémoire pleine', () => {
    expect(messageErreur(new ErreurStockagePlein())).toContain('Sauvegarder tout');
    expect(messageErreur(new Error('Oups'))).toBe('Oups');
    expect(messageErreur(42)).toBe('Une erreur est survenue.');
  });
});
```

- [ ] **Step 2 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/ecrans.test.ts`
Expected : FAIL — modules introuvables

- [ ] **Step 3 : Écrire `src/ecrans/navigation.ts` et `src/ecrans/recherche.ts`**

`src/ecrans/navigation.ts` :

```ts
import { ErreurStockagePlein } from '../rangement/depot';
import type { PageBrouillon, PageScan } from '../rangement/modele';

/** Pages en cours : nouveau scan (documentId null = nouveau document) ou modification d'une page existante. */
export interface Lot { documentId: string | null; brouillons: PageBrouillon[]; pageExistante: PageScan | null }

export type Ecran =
  | { nom: 'accueil' }
  | { nom: 'viseur'; documentId: string | null }
  | { nom: 'recadrage'; lot: Lot }
  | { nom: 'filtres'; lot: Lot }
  | { nom: 'document'; id: string }
  | { nom: 'export'; id: string };

export interface Nav { aller(e: Ecran): void; signaler(message: string): void }

export function retour(lot: Lot): Ecran {
  if (lot.pageExistante) return { nom: 'document', id: lot.pageExistante.documentId };
  if (lot.documentId) return { nom: 'document', id: lot.documentId };
  return { nom: 'accueil' };
}

export function messageErreur(e: unknown): string {
  if (e instanceof ErreurStockagePlein) {
    return 'La mémoire est pleine. Faites « Sauvegarder tout » (menu ⋯ de l\'accueil), puis supprimez d\'anciens documents.';
  }
  return e instanceof Error ? e.message : 'Une erreur est survenue.';
}
```

`src/ecrans/recherche.ts` :

```ts
import type { DocumentScan } from '../rangement/modele';

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrerDocuments(docs: DocumentScan[], recherche: string): DocumentScan[] {
  const r = normaliser(recherche.trim());
  return r ? docs.filter((d) => normaliser(d.nom).includes(r)) : docs;
}
```

- [ ] **Step 4 : Lancer le test, il doit passer**

Run : `npx vitest run tests/ecrans.test.ts`
Expected : 4 tests PASS

- [ ] **Step 5 : Écrire `src/ecrans/importer.ts`, `Miniature.tsx`, `FichierPret.tsx`**

`src/ecrans/importer.ts` :

```ts
import { brouillonDepuisFichier } from '../navigateur/pipeline';
import type { PageBrouillon } from '../rangement/modele';
import type { Lot } from './navigation';

export async function importerFichiers(fichiers: File[], documentId: string | null): Promise<Lot> {
  const brouillons: PageBrouillon[] = [];
  for (const f of fichiers) brouillons.push(await brouillonDepuisFichier(f));
  return { documentId, brouillons, pageExistante: null };
}
```

`src/ecrans/Miniature.tsx` :

```tsx
import { useEffect, useState } from 'preact/hooks';
import { urlImage } from '../navigateur/images';
import type { Depot } from '../rangement/depot';

export function Miniature({ depot, pageId }: { depot: Depot; pageId?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pageId) return;
    let actif = true;
    let u: string | null = null;
    depot.lirePage(pageId).then((p) => {
      if (!p || !actif) return;
      u = urlImage(p.miniature);
      setUrl(u);
    });
    return () => { actif = false; if (u) URL.revokeObjectURL(u); };
  }, [pageId]);
  return url ? <img class="vignette" src={url} alt="" /> : <div class="vignette" />;
}
```

`src/ecrans/FichierPret.tsx` :

```tsx
import { partagerFichiers } from '../navigateur/partage';
import { tailleLisible } from '../nommage';
import { messageErreur, type Nav } from './navigation';

/** Fichier(s) déjà préparé(s) : le bouton Partager appelle le partage directement au toucher (exigence de Safari). */
export function FichierPret({ fichiers, nav, onFermer }: { fichiers: File[]; nav: Nav; onFermer: () => void }) {
  const taille = fichiers.reduce((s, f) => s + f.size, 0);
  async function partager() {
    try {
      if ((await partagerFichiers(fichiers)) !== 'annule') onFermer();
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }
  return (
    <>
      <div class="voile" onClick={onFermer} />
      <div class="feuille-actions">
        <strong>{fichiers.length === 1 ? fichiers[0].name : `${fichiers.length} fichiers`}</strong>
        <span class="doux">{tailleLisible(taille)}</span>
        <button class="principal" onClick={partager}>Partager</button>
        <button onClick={onFermer}>Fermer</button>
      </div>
    </>
  );
}
```

- [ ] **Step 6 : Écrire `src/ecrans/Accueil.tsx`**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { dateCourte } from '../nommage';
import type { Depot } from '../rangement/depot';
import type { DocumentScan } from '../rangement/modele';
import { creerSauvegarde, lireSauvegarde, nomSauvegarde } from '../rangement/sauvegarde';
import { FichierPret } from './FichierPret';
import { importerFichiers } from './importer';
import { Miniature } from './Miniature';
import { messageErreur, type Nav } from './navigation';
import { filtrerDocuments } from './recherche';

export function Accueil({ depot, nav }: { depot: Depot; nav: Nav }) {
  const [docs, setDocs] = useState<DocumentScan[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [menu, setMenu] = useState(false);
  const [pret, setPret] = useState<File[] | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const entreeImport = useRef<HTMLInputElement>(null);
  const entreeRestaurer = useRef<HTMLInputElement>(null);

  const recharger = () => depot.listerDocuments().then(setDocs);
  useEffect(() => { recharger(); }, []);

  async function sauvegarder() {
    setMenu(false);
    try {
      const { documents, pages } = await depot.toutLire();
      const zip = creerSauvegarde(documents, pages);
      setPret([new File([zip], nomSauvegarde(new Date()), { type: 'application/zip' })]);
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  async function restaurer(fichier: File) {
    setOccupe('Restauration…');
    try {
      const { documents, pages } = lireSauvegarde(new Uint8Array(await fichier.arrayBuffer()));
      const { ajoutes, ignores } = await depot.importer(documents, pages);
      nav.signaler(`${ajoutes} document(s) restauré(s)${ignores ? `, ${ignores} déjà présent(s)` : ''}.`);
      await recharger();
    } catch (e) {
      nav.signaler(messageErreur(e));
    } finally {
      setOccupe(null);
    }
  }

  async function importer(fichiers: File[]) {
    setOccupe('Préparation des photos…');
    try {
      nav.aller({ nom: 'recadrage', lot: await importerFichiers(fichiers, null) });
    } catch (e) {
      nav.signaler(messageErreur(e));
      setOccupe(null);
    }
  }

  const visibles = docs ? filtrerDocuments(docs, recherche) : [];
  return (
    <main class="ecran">
      <header class="entete">
        <h1>FOF Scan</h1>
        <button aria-label="Menu" onClick={() => setMenu(true)}>⋯</button>
      </header>
      <input type="search" placeholder="Rechercher un document" value={recherche}
        onInput={(e) => setRecherche(e.currentTarget.value)} />
      {occupe && <><p class="doux">{occupe}</p><div class="progression indeterminee"><div /></div></>}
      {docs?.length === 0 && <p class="doux">Aucun document pour l'instant. Touchez « Scanner » pour commencer.</p>}
      <ul class="liste">
        {visibles.map((d) => (
          <li key={d.id}>
            <button onClick={() => nav.aller({ nom: 'document', id: d.id })}>
              <Miniature depot={depot} pageId={d.pages[0]} />
              <span>
                <strong>{d.nom}</strong><br />
                <span class="doux">{dateCourte(d.modifie)} · {d.pages.length} page{d.pages.length > 1 ? 's' : ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div class="barre-bas">
        <button onClick={() => entreeImport.current?.click()}>Importer</button>
        <button class="principal" onClick={() => nav.aller({ nom: 'viseur', documentId: null })}>Scanner</button>
      </div>
      <input ref={entreeImport} type="file" accept="image/*" multiple hidden
        onChange={(e) => { const f = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; if (f.length) importer(f); }} />
      <input ref={entreeRestaurer} type="file" accept=".zip,application/zip" hidden
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) restaurer(f); }} />
      {menu && (
        <>
          <div class="voile" onClick={() => setMenu(false)} />
          <div class="feuille-actions">
            <button onClick={sauvegarder}>Sauvegarder tout</button>
            <button onClick={() => { setMenu(false); entreeRestaurer.current?.click(); }}>Restaurer une sauvegarde</button>
            <button onClick={() => setMenu(false)}>Fermer</button>
          </div>
        </>
      )}
      {pret && <FichierPret fichiers={pret} nav={nav} onFermer={() => setPret(null)} />}
    </main>
  );
}
```

- [ ] **Step 7 : Remplacer `src/app.tsx`**

Les écrans des tâches suivantes sont remplacés provisoirement par `Bientot` ; chaque tâche suivante remplace sa ligne.

```tsx
import { useEffect, useState } from 'preact/hooks';
import { Accueil } from './ecrans/Accueil';
import type { Ecran, Nav } from './ecrans/navigation';
import { demanderStockagePermanent } from './navigateur/stockage';
import { ouvrirDepot, type Depot } from './rangement/depot';
import { traitement } from './traitement/client';

function Bientot({ nav }: { nav: Nav }) {
  return <main class="ecran"><p>Écran à venir.</p><button onClick={() => nav.aller({ nom: 'accueil' })}>Retour</button></main>;
}

export function App() {
  const [depot, setDepot] = useState<Depot | null>(null);
  const [ecran, setEcran] = useState<Ecran>({ nom: 'accueil' });
  const [message, setMessage] = useState<string | null>(null);
  const [outilPret, setOutilPret] = useState(false);

  useEffect(() => {
    ouvrirDepot().then(setDepot).catch(() => setMessage("Impossible d'ouvrir la mémoire de l'appli."));
    demanderStockagePermanent();
    traitement().preparer()
      .then(() => setOutilPret(true))
      .catch(() => setMessage("L'outil de détection n'a pas pu se charger. À la première ouverture, il faut internet."));
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);

  const nav: Nav = { aller: (e) => { setEcran(e); window.scrollTo(0, 0); }, signaler: setMessage };

  return (
    <>
      {!outilPret && ecran.nom === 'accueil' && <div class="progression indeterminee haut"><div /></div>}
      {!depot ? <main class="ecran"><p class="doux">Chargement…</p></main> : (
        <>
          {ecran.nom === 'accueil' && <Accueil depot={depot} nav={nav} />}
          {ecran.nom === 'viseur' && <Bientot nav={nav} />}
          {ecran.nom === 'recadrage' && <Bientot nav={nav} />}
          {ecran.nom === 'filtres' && <Bientot nav={nav} />}
          {ecran.nom === 'document' && <Bientot nav={nav} />}
          {ecran.nom === 'export' && <Bientot nav={nav} />}
        </>
      )}
      {message && <div class="message" role="alert" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
```

- [ ] **Step 8 : Remplir `src/styles.css`**

```css
:root {
  --fond: #0f1a14; --surface: #1a2a21; --surface-2: #243a2d;
  --texte: #eef5f0; --texte-doux: #a9bdb0;
  --accent: #2fb36b; --accent-fonce: #0f5132; --danger: #e5484d; --rayon: 14px;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--fond); color: var(--texte);
  font: 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-tap-highlight-color: transparent; }
button { font: inherit; color: inherit; border: 0; border-radius: var(--rayon); padding: 12px 16px; background: var(--surface-2); cursor: pointer; }
button.principal { background: var(--accent); color: #04140b; font-weight: 600; }
button.danger { background: transparent; color: var(--danger); }
button:disabled { opacity: .5; }
button[aria-pressed=true] { background: var(--accent); color: #04140b; }
input[type=search], input[type=text] { font: inherit; width: 100%; padding: 12px 14px; border-radius: var(--rayon);
  border: 1px solid var(--surface-2); background: var(--surface); color: var(--texte); }
.ecran { min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 96px);
  display: flex; flex-direction: column; gap: 12px; }
.ecran h2 { font-size: 15px; margin: 8px 0 0; color: var(--texte-doux); font-weight: 500; }
.entete { display: flex; align-items: center; gap: 8px; }
.entete h1 { font-size: 22px; margin: 0; flex: 1; }
.liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.liste li button { width: 100%; display: flex; gap: 12px; align-items: center; text-align: left; background: var(--surface); padding: 8px; }
.vignette { width: 56px; height: 72px; object-fit: cover; border-radius: 6px; background: var(--surface-2); flex: none; }
.doux { color: var(--texte-doux); font-size: 14px; }
.barre-bas { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px);
  display: flex; gap: 8px; background: linear-gradient(transparent, var(--fond) 30%); }
.barre-bas > * { flex: 1; }
.message { position: fixed; left: 16px; right: 16px; bottom: calc(env(safe-area-inset-bottom) + 90px); background: var(--surface-2);
  padding: 14px; border-radius: var(--rayon); box-shadow: 0 6px 24px #0008; z-index: 40; }
.bandeau { position: fixed; top: env(safe-area-inset-top); left: 0; right: 0; border-radius: 0; background: var(--accent-fonce); z-index: 50; }
.progression { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
.progression > div { height: 100%; background: var(--accent); transition: width .2s; }
.progression.indeterminee > div { width: 30%; animation: aller 1.2s infinite ease-in-out; }
.progression.haut { position: fixed; top: env(safe-area-inset-top); left: 0; right: 0; z-index: 10; border-radius: 0; }
@keyframes aller { from { transform: translateX(-100%); } to { transform: translateX(330%); } }
.plein { position: fixed; inset: 0; background: #000; display: flex; flex-direction: column; }
.zone { position: relative; flex: 1; min-height: 0; touch-action: none; }
.zone video, .zone img.scene { width: 100%; height: 100%; object-fit: contain; display: block; }
.calque { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.calque-texte { position: absolute; left: 16px; right: 16px; bottom: 16px; background: #000b; padding: 12px; border-radius: 12px; text-align: center; }
.commandes { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px); background: #000; }
.commandes.colonne { flex-direction: column; align-items: stretch; }
.ligne { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.declencheur { width: 72px; height: 72px; border-radius: 50%; background: #fff; border: 4px solid var(--accent); padding: 0; }
.grille { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.grille .case { position: relative; background: var(--surface); border-radius: 8px; padding: 4px; }
.grille img { width: 100%; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 6px; display: block; }
.grille .numero { position: absolute; left: 8px; bottom: 8px; background: #000a; padding: 0 6px; border-radius: 6px; font-size: 13px; }
.choix { display: flex; gap: 8px; overflow-x: auto; }
.loupe { position: absolute; top: 12px; left: 12px; width: 120px; height: 120px; border-radius: 50%; border: 3px solid var(--accent); pointer-events: none; }
.voile { position: fixed; inset: 0; background: #0008; z-index: 24; }
.feuille-actions { position: fixed; left: 0; right: 0; bottom: 0; background: var(--surface); z-index: 25;
  padding: 16px 16px calc(env(safe-area-inset-bottom) + 16px); border-radius: 16px 16px 0 0; display: flex; flex-direction: column; gap: 8px; }
```

- [ ] **Step 9 : Vérifier dans le navigateur**

`preview_start` `fof-scan`, `resize_window` preset `mobile`, puis :
1. `read_page` : titre « FOF Scan », champ de recherche, boutons « Importer » et « Scanner », texte « Aucun document pour l'instant ».
2. Ouvrir le menu ⋯ puis « Sauvegarder tout » : la feuille « FOF-Scan-sauvegarde-AAAA-MM-JJ.zip » s'affiche avec sa taille.
3. Importer l'image de test par `javascript_tool` :

```js
const blob = await (await fetch('/tests/aides/feuille-synthetique.jpg')).blob();
const entree = document.querySelector('input[type=file][accept="image/*"]');
const dt = new DataTransfer();
dt.items.add(new File([blob], 'feuille.jpg', { type: 'image/jpeg' }));
entree.files = dt.files;
entree.dispatchEvent(new Event('change', { bubbles: true }));
```

Expected : « Préparation des photos… » puis l'écran provisoire « Écran à venir. ». `read_console_messages` (erreurs) : vide. Remettre `resize_window` preset `desktop`.

- [ ] **Step 10 : Lancer toute la suite et commit**

Run : `npm test` puis `npx tsc --noEmit` — tout PASS, aucune erreur.

```bash
git add src tests/ecrans.test.ts
git commit -m "Coquille de l'appli et écran d'accueil" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12 : Le viseur (appareil photo)

**Files :**
- Create : `src/navigateur/camera.ts`, `src/ecrans/Viseur.tsx`
- Modify : `src/app.tsx` (ligne de l'écran `viseur`)

**Interfaces :**
- Consumes : `DeclencheurAuto`, `mettreAEchelle` (Task 2) ; `traitement()` (Task 6) ; `versCanvas`, `lireImg`, `brouillonDepuisCanvas` (Task 10) ; `lirePreference`, `ecrirePreference` (Task 10) ; `importerFichiers`, `Nav`, `messageErreur` (Task 11)
- Produces :
  - `class ErreurCamera extends Error { raison: 'refusee' | 'indisponible' }`
  - `ouvrirCamera(video: HTMLVideoElement): Promise<MediaStream>` ; `fermerCamera(flux: MediaStream): void`
  - `<Viseur documentId nav outilPret />`

- [ ] **Step 1 : Écrire `src/navigateur/camera.ts`**

```ts
export class ErreurCamera extends Error {
  constructor(public raison: 'refusee' | 'indisponible') {
    super(raison === 'refusee'
      ? "L'accès à l'appareil photo est refusé. Réactivez-le dans Réglages › Safari › Appareil photo."
      : 'Appareil photo indisponible. Utilisez « Importer une photo ».');
    this.name = 'ErreurCamera';
  }
}

/** Ouvre la caméra arrière en demandant la plus grande résolution possible. */
export async function ouvrirCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new ErreurCamera('indisponible');
  let flux: MediaStream;
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    });
  } catch (e) {
    throw new ErreurCamera((e as Error).name === 'NotAllowedError' ? 'refusee' : 'indisponible');
  }
  video.srcObject = flux;
  video.muted = true;
  video.setAttribute('playsinline', '');
  await video.play();
  return flux;
}

export function fermerCamera(flux: MediaStream): void {
  flux.getTracks().forEach((t) => t.stop());
}
```

- [ ] **Step 2 : Écrire `src/ecrans/Viseur.tsx`**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { fermerCamera, ouvrirCamera } from '../navigateur/camera';
import { lireImg, versCanvas } from '../navigateur/images';
import { brouillonDepuisCanvas } from '../navigateur/pipeline';
import { ecrirePreference, lirePreference } from '../navigateur/preferences';
import type { PageBrouillon } from '../rangement/modele';
import { traitement } from '../traitement/client';
import { DeclencheurAuto, mettreAEchelle } from '../traitement/geometrie';
import type { Coins } from '../traitement/types';
import { importerFichiers } from './importer';
import { messageErreur, type Nav } from './navigation';

const COTE_APERCU = 480;

export function Viseur({ documentId, nav, outilPret }: { documentId: string | null; nav: Nav; outilPret: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const entreeImport = useRef<HTMLInputElement>(null);
  const declencheur = useRef<DeclencheurAuto | null>(null);
  const enCapture = useRef(false);
  const [coins, setCoins] = useState<Coins | null>(null);
  const [dims, setDims] = useState({ l: 0, h: 0 });
  const [brouillons, setBrouillons] = useState<PageBrouillon[]>([]);
  const [auto, setAuto] = useState(() => lirePreference('auto', true));
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [erreur, setErreur] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  async function prendre() {
    const v = video.current;
    if (!v || !v.videoWidth || enCapture.current) return;
    enCapture.current = true;
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    try {
      const b = await brouillonDepuisCanvas(versCanvas(v, v.videoWidth, v.videoHeight, 3000));
      declencheur.current?.captureManuelle(b.detecte ? mettreAEchelle(b.coins, v.videoWidth / b.original.largeur) : null);
      setBrouillons((l) => [...l, b]);
    } catch (e) {
      nav.signaler(messageErreur(e));
    } finally {
      enCapture.current = false;
    }
  }

  useEffect(() => {
    let flux: MediaStream | null = null;
    let arret = false;
    let minuterie = 0;
    ouvrirCamera(video.current!)
      .then((f) => {
        flux = f;
        if (arret) { fermerCamera(f); return; }
        const v = video.current!;
        setDims({ l: v.videoWidth, h: v.videoHeight });
        declencheur.current = new DeclencheurAuto(Math.hypot(v.videoWidth, v.videoHeight));
        const boucle = async () => {
          if (arret) return;
          if (!enCapture.current) {
            try {
              const petit = versCanvas(v, v.videoWidth, v.videoHeight, COTE_APERCU);
              const c = await traitement().detecter(lireImg(petit));
              const enGrand = c ? mettreAEchelle(c, v.videoWidth / petit.width) : null;
              if (!arret) setCoins(enGrand);
              if (autoRef.current && declencheur.current!.observer(enGrand, performance.now())) await prendre();
            } catch {
              // une image ratée n'arrête pas le viseur
            }
          }
          minuterie = window.setTimeout(boucle, 200);
        };
        boucle();
      })
      .catch((e) => setErreur(messageErreur(e)));
    return () => { arret = true; clearTimeout(minuterie); if (flux) fermerCamera(flux); };
  }, []);

  function terminer() {
    if (brouillons.length) nav.aller({ nom: 'recadrage', lot: { documentId, brouillons, pageExistante: null } });
  }

  function annuler() {
    nav.aller(documentId ? { nom: 'document', id: documentId } : { nom: 'accueil' });
  }

  async function importer(fichiers: File[]) {
    try {
      const lot = await importerFichiers(fichiers, documentId);
      nav.aller({ nom: 'recadrage', lot: { ...lot, brouillons: [...brouillons, ...lot.brouillons] } });
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  return (
    <div class="plein">
      <div class="zone">
        <video ref={video} playsInline muted autoPlay />
        {coins && dims.l > 0 && (
          <svg class="calque" viewBox={`0 0 ${dims.l} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
            <polygon points={coins.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(47,179,107,.2)" stroke="#2fb36b" stroke-width={dims.l / 200} />
          </svg>
        )}
        {flash && <div class="calque" style={{ background: '#fff8' }} />}
        {!outilPret && !erreur && <p class="calque-texte">Préparation de l'outil de détection…</p>}
        {erreur && (
          <div class="calque-texte">
            <p>{erreur}</p>
            <button class="principal" onClick={() => entreeImport.current?.click()}>Importer une photo</button>
          </div>
        )}
      </div>
      <div class="commandes">
        <button onClick={annuler}>Annuler</button>
        <button aria-pressed={auto} onClick={() => { setAuto(!auto); ecrirePreference('auto', !auto); }}>
          {auto ? 'Auto' : 'Manuel'}
        </button>
        <button class="declencheur" aria-label="Prendre la photo" onClick={prendre} disabled={!!erreur} />
        <button class="principal" onClick={terminer} disabled={!brouillons.length}>
          Terminé{brouillons.length ? ` (${brouillons.length})` : ''}
        </button>
      </div>
      <input ref={entreeImport} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; if (f.length) importer(f); }} />
    </div>
  );
}
```

- [ ] **Step 3 : Brancher l'écran dans `src/app.tsx`**

Ajouter `import { Viseur } from './ecrans/Viseur';` et remplacer

```tsx
          {ecran.nom === 'viseur' && <Bientot nav={nav} />}
```

par

```tsx
          {ecran.nom === 'viseur' && <Viseur documentId={ecran.documentId} nav={nav} outilPret={outilPret} />}
```

- [ ] **Step 4 : Vérifier dans le navigateur**

`npx tsc --noEmit` : aucune erreur. `preview_start` `fof-scan`, toucher « Scanner ».
- Sans webcam (cas habituel du panneau) : le message « Appareil photo indisponible… » ou « …refusé… » s'affiche avec le bouton « Importer une photo » ; aucun plantage (`read_console_messages`).
- Avec une webcam : l'image s'affiche ; en montrant une feuille, le contour vert apparaît.
- « Annuler » ramène à l'accueil.

Le vrai test de la caméra se fait sur l'iPhone (Task 18).

- [ ] **Step 5 : Commit**

```bash
git add src
git commit -m "Viseur : caméra, contour en direct, prise automatique et multipage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13 : Recadrage, filtres et enregistrement du lot

**Files :**
- Create : `src/ecrans/lot.ts`, `src/ecrans/Recadrage.tsx`, `src/ecrans/Filtres.tsx`
- Modify : `src/app.tsx` (lignes `recadrage` et `filtres`)
- Test : `tests/lot.test.ts`

**Interfaces :**
- Consumes : `Depot` (Task 7) ; `nomParDefaut` (Task 1) ; `ordonnerCoins`, `coinsPleineImage` (Task 2) ; `urlImage`, `traiterBrouillon`, `rendrePage` (Task 10) ; `Lot`, `Nav`, `retour`, `messageErreur` (Task 11)
- Produces :
  - `enregistrerLot(depot, lot: Lot, rendre: (b: PageBrouillon) => Promise<NouvellePage>, maintenant: Date, progres?: (fait, total) => void): Promise<string>` (renvoie l'identifiant du document)
  - `<Recadrage lot nav />`, `<Filtres lot depot nav />`

- [ ] **Step 1 : Écrire le test qui échoue — `tests/lot.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { enregistrerLot } from '../src/ecrans/lot';
import { ouvrirDepot } from '../src/rangement/depot';
import type { NouvellePage, PageBrouillon } from '../src/rangement/modele';
import { coinsPleineImage } from '../src/traitement/geometrie';
import { jpegFactice, pageFactice } from './aides/jpeg';

const brouillon = (gris: number): PageBrouillon => ({
  original: jpegFactice(4, 4, gris), coins: coinsPleineImage(4, 4), rotation: 0, filtre: 'nb', detecte: true,
});
const rendre = async (b: PageBrouillon): Promise<NouvellePage> => ({
  original: b.original, coins: b.coins, rotation: b.rotation, filtre: b.filtre, traitee: b.original, miniature: b.original,
});
const depotNeuf = () => ouvrirDepot(`l-${crypto.randomUUID()}`);

describe('enregistrerLot', () => {
  it('crée un nouveau document nommé avec la date', async () => {
    const d = await depotNeuf();
    const progres: number[] = [];
    const id = await enregistrerLot(d, { documentId: null, brouillons: [brouillon(10), brouillon(20)], pageExistante: null },
      rendre, new Date(2026, 9, 12, 8, 30), (fait) => progres.push(fait));
    const doc = await d.lireDocument(id);
    expect(doc!.nom).toBe('Scan 12-10-2026 08h30');
    expect(doc!.pages).toHaveLength(2);
    expect(progres).toEqual([1, 2]);
  });

  it('ajoute les pages à un document existant', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    await d.ajouterPage(doc.id, pageFactice());
    const id = await enregistrerLot(d, { documentId: doc.id, brouillons: [brouillon(30)], pageExistante: null }, rendre, new Date());
    expect(id).toBe(doc.id);
    expect((await d.lireDocument(doc.id))!.pages).toHaveLength(2);
  });

  it('met à jour une page existante sans en créer', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Fiche');
    const page = await d.ajouterPage(doc.id, pageFactice());
    const b = { ...brouillon(40), rotation: 180 as const };
    await enregistrerLot(d, { documentId: doc.id, brouillons: [b], pageExistante: page }, rendre, new Date());
    const pages = await d.lirePages(doc.id);
    expect(pages).toHaveLength(1);
    expect(pages[0].id).toBe(page.id);
    expect(pages[0].rotation).toBe(180);
    expect(pages[0].filtre).toBe('nb');
  });
});
```

- [ ] **Step 2 : Lancer le test, il doit échouer**

Run : `npx vitest run tests/lot.test.ts`
Expected : FAIL — module `lot` introuvable

- [ ] **Step 3 : Écrire `src/ecrans/lot.ts`**

```ts
import { nomParDefaut } from '../nommage';
import type { Depot } from '../rangement/depot';
import type { NouvellePage, PageBrouillon } from '../rangement/modele';
import type { Lot } from './navigation';

/** Traite et enregistre les pages une par une (pour ménager la mémoire), et renvoie l'id du document. */
export async function enregistrerLot(
  depot: Depot,
  lot: Lot,
  rendre: (b: PageBrouillon) => Promise<NouvellePage>,
  maintenant: Date,
  progres?: (fait: number, total: number) => void,
): Promise<string> {
  if (lot.pageExistante) {
    const rendu = await rendre(lot.brouillons[0]);
    await depot.mettreAJourPage({ ...lot.pageExistante, ...rendu });
    progres?.(1, 1);
    return lot.pageExistante.documentId;
  }
  const id = lot.documentId ?? (await depot.creerDocument(nomParDefaut(maintenant))).id;
  for (const [k, b] of lot.brouillons.entries()) {
    await depot.ajouterPage(id, await rendre(b));
    progres?.(k + 1, lot.brouillons.length);
  }
  return id;
}
```

- [ ] **Step 4 : Lancer le test, il doit passer**

Run : `npx vitest run tests/lot.test.ts`
Expected : 3 tests PASS

- [ ] **Step 5 : Écrire `src/ecrans/Recadrage.tsx`**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { urlImage } from '../navigateur/images';
import type { PageBrouillon } from '../rangement/modele';
import { coinsPleineImage, ordonnerCoins } from '../traitement/geometrie';
import type { Coins, Point, Rotation } from '../traitement/types';
import { retour, type Lot, type Nav } from './navigation';

export function Recadrage({ lot, nav }: { lot: Lot; nav: Nav }) {
  const [brouillons, setBrouillons] = useState(lot.brouillons);
  const [i, setI] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [glisse, setGlisse] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const b = brouillons[i];

  useEffect(() => {
    const u = urlImage(b.original);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [b.original]);

  const modifier = (m: Partial<PageBrouillon>) =>
    setBrouillons((l) => l.map((x, k) => (k === i ? { ...x, ...m } : x)));

  /** Convertit la position du doigt en coordonnées de la photo (le SVG suit l'affichage de l'image). */
  function pointImage(e: PointerEvent): Point {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return {
      x: Math.min(Math.max(p.x, 0), b.original.largeur),
      y: Math.min(Math.max(p.y, 0), b.original.hauteur),
    };
  }

  function dessinerLoupe(p: Point) {
    const c = loupe.current;
    const im = image.current;
    if (!c || !im) return;
    const ctx = c.getContext('2d')!;
    const cote = b.original.largeur / 12;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(im, p.x - cote / 2, p.y - cote / 2, cote, cote, 0, 0, c.width, c.height);
    ctx.strokeStyle = '#2fb36b';
    ctx.beginPath();
    ctx.moveTo(c.width / 2, 0); ctx.lineTo(c.width / 2, c.height);
    ctx.moveTo(0, c.height / 2); ctx.lineTo(c.width, c.height / 2);
    ctx.stroke();
  }

  function bouger(e: PointerEvent) {
    if (glisse === null) return;
    const p = pointImage(e);
    modifier({ coins: b.coins.map((c, k) => (k === glisse ? p : c)) as Coins });
    dessinerLoupe(p);
  }

  function valider() {
    nav.aller({ nom: 'filtres', lot: { ...lot, brouillons: brouillons.map((x) => ({ ...x, coins: ordonnerCoins(x.coins) })) } });
  }

  const r = b.original.largeur / 25;
  return (
    <div class="plein">
      <div class="zone" onPointerMove={bouger} onPointerUp={() => setGlisse(null)} onPointerCancel={() => setGlisse(null)}>
        {url && <img ref={image} class="scene" src={url} alt="" />}
        <svg ref={svg} class="calque" viewBox={`0 0 ${b.original.largeur} ${b.original.hauteur}`} preserveAspectRatio="xMidYMid meet">
          <polygon points={b.coins.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(47,179,107,.15)" stroke="#2fb36b" stroke-width={r / 4} />
          {b.coins.map((c, k) => (
            <g key={k}>
              <circle cx={c.x} cy={c.y} r={r} fill="rgba(255,255,255,.35)" stroke="#2fb36b" stroke-width={r / 4} />
              <circle cx={c.x} cy={c.y} r={r * 2} fill="transparent" style={{ pointerEvents: 'all' }}
                onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); setGlisse(k); dessinerLoupe(c); }} />
            </g>
          ))}
        </svg>
        <canvas ref={loupe} class="loupe" width={120} height={120} style={{ display: glisse === null ? 'none' : 'block' }} />
        {!b.detecte && glisse === null && <p class="calque-texte">Feuille non détectée : placez les coins à la main.</p>}
      </div>
      <div class="commandes">
        <button onClick={() => nav.aller(retour(lot))}>Annuler</button>
        <button onClick={() => modifier({ rotation: ((b.rotation + 90) % 360) as Rotation })}>↻ {b.rotation}°</button>
        <button onClick={() => modifier({ coins: coinsPleineImage(b.original.largeur, b.original.hauteur) })}>Tout</button>
        {brouillons.length > 1 && (
          <span class="ligne">
            <button onClick={() => setI(i - 1)} disabled={i === 0}>‹</button>
            <span class="doux">{i + 1}/{brouillons.length}</span>
            <button onClick={() => setI(i + 1)} disabled={i === brouillons.length - 1}>›</button>
          </span>
        )}
        <button class="principal" onClick={valider}>Valider</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6 : Écrire `src/ecrans/Filtres.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import { rendrePage, traiterBrouillon } from '../navigateur/pipeline';
import type { Depot } from '../rangement/depot';
import type { Filtre } from '../traitement/types';
import { enregistrerLot } from './lot';
import { messageErreur, type Lot, type Nav } from './navigation';

const NOMS: Record<Filtre, string> = { original: 'Original', ameliore: 'Amélioré', nb: 'Noir & blanc', gris: 'Gris' };

export function Filtres({ lot, depot, nav }: { lot: Lot; depot: Depot; nav: Nav }) {
  const [brouillons, setBrouillons] = useState(lot.brouillons);
  const [i, setI] = useState(0);
  const [apercu, setApercu] = useState<string | null>(null);
  const [calcul, setCalcul] = useState(false);
  const [enregistrement, setEnregistrement] = useState<{ fait: number; total: number } | null>(null);
  const b = brouillons[i];

  useEffect(() => {
    let actif = true;
    setCalcul(true);
    traiterBrouillon(b, 1200)
      .then((c) => { if (actif) setApercu(c.toDataURL('image/jpeg', 0.8)); })
      .catch((e) => nav.signaler(messageErreur(e)))
      .finally(() => { if (actif) setCalcul(false); });
    return () => { actif = false; };
  }, [b]);

  const choisir = (filtre: Filtre) => setBrouillons((l) => l.map((x, k) => (k === i ? { ...x, filtre } : x)));
  const pourToutes = () => setBrouillons((l) => l.map((x) => ({ ...x, filtre: b.filtre })));

  async function enregistrer() {
    setEnregistrement({ fait: 0, total: brouillons.length });
    try {
      const id = await enregistrerLot(depot, { ...lot, brouillons }, rendrePage, new Date(),
        (fait, total) => setEnregistrement({ fait, total }));
      nav.aller({ nom: 'document', id });
    } catch (e) {
      nav.signaler(messageErreur(e));
      setEnregistrement(null);
    }
  }

  return (
    <div class="plein">
      <div class="zone">
        {apercu && <img class="scene" src={apercu} alt="Aperçu de la page" />}
        {calcul && <div class="progression indeterminee calque"><div /></div>}
      </div>
      <div class="commandes colonne">
        <div class="choix">
          {(Object.keys(NOMS) as Filtre[]).map((f) => (
            <button key={f} aria-pressed={b.filtre === f} onClick={() => choisir(f)}>{NOMS[f]}</button>
          ))}
        </div>
        {brouillons.length > 1 && (
          <div class="ligne">
            <button onClick={() => setI(i - 1)} disabled={i === 0}>‹</button>
            <span class="doux">Page {i + 1}/{brouillons.length}</span>
            <button onClick={() => setI(i + 1)} disabled={i === brouillons.length - 1}>›</button>
            <button onClick={pourToutes}>Appliquer à toutes</button>
          </div>
        )}
        {enregistrement ? (
          <>
            <span class="doux">Enregistrement {enregistrement.fait}/{enregistrement.total}…</span>
            <div class="progression"><div style={{ width: `${(100 * enregistrement.fait) / enregistrement.total}%` }} /></div>
          </>
        ) : (
          <div class="ligne">
            <button onClick={() => nav.aller({ nom: 'recadrage', lot: { ...lot, brouillons } })}>Retour</button>
            <button class="principal" onClick={enregistrer}>Enregistrer</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

`.progression.calque` : la barre se place en haut de l'aperçu ; ajouter dans `src/styles.css` :

```css
.progression.calque { height: 4px; bottom: auto; }
```

- [ ] **Step 7 : Brancher les écrans dans `src/app.tsx`**

Ajouter `import { Recadrage } from './ecrans/Recadrage';` et `import { Filtres } from './ecrans/Filtres';`, puis remplacer

```tsx
          {ecran.nom === 'recadrage' && <Bientot nav={nav} />}
          {ecran.nom === 'filtres' && <Bientot nav={nav} />}
```

par

```tsx
          {ecran.nom === 'recadrage' && <Recadrage lot={ecran.lot} nav={nav} />}
          {ecran.nom === 'filtres' && <Filtres lot={ecran.lot} depot={depot} nav={nav} />}
```

- [ ] **Step 8 : Vérifier dans le navigateur**

`npx tsc --noEmit` : aucune erreur. `preview_start` `fof-scan`, `resize_window` preset `mobile`. Importer l'image de test (script `javascript_tool` de la Task 11, Step 9). Puis :
1. Recadrage : le contour vert entoure la feuille ; `computer` `left_click_drag` d'une poignée : le coin suit le doigt et la loupe apparaît pendant le glisser. « ↻ 0° » passe à « ↻ 90° ». Capture d'écran.
2. « Valider » → Filtres : l'aperçu montre la feuille droite. Toucher « Noir & blanc » : l'aperçu change. Capture d'écran.
3. « Enregistrer » : la barre « Enregistrement 1/1… » puis l'écran provisoire du document (Task 14). Retour à l'accueil : le document « Scan JJ-MM-AAAA HHhMM » est listé avec sa miniature.
4. `read_console_messages` (erreurs) : vide. Remettre `resize_window` preset `desktop`.

- [ ] **Step 9 : Commit**

```bash
git add src tests/lot.test.ts
git commit -m "Recadrage avec loupe, choix du filtre et enregistrement des pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14 : L'écran du document

**Files :**
- Create : `src/ecrans/DocumentEcran.tsx`
- Modify : `src/app.tsx` (ligne `document`)

**Interfaces :**
- Consumes : `Depot` (Task 7) ; `urlImage` (Task 10) ; `importerFichiers`, `Nav`, `messageErreur` (Task 11) ; `sortablejs`
- Produces : `<DocumentEcran id depot nav />`

- [ ] **Step 1 : Écrire `src/ecrans/DocumentEcran.tsx`**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { urlImage } from '../navigateur/images';
import type { Depot } from '../rangement/depot';
import type { DocumentScan, PageScan } from '../rangement/modele';
import { importerFichiers } from './importer';
import { messageErreur, type Nav } from './navigation';

export function DocumentEcran({ id, depot, nav }: { id: string; depot: Depot; nav: Nav }) {
  const [doc, setDoc] = useState<DocumentScan | null>(null);
  const [nom, setNom] = useState('');
  const [pages, setPages] = useState<PageScan[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [choisie, setChoisie] = useState<PageScan | null>(null);
  const [ajout, setAjout] = useState(false);
  const [occupe, setOccupe] = useState(false);
  // Changer cette clé recrée la grille : Sortable déplace les éléments lui-même, Preact doit repartir de zéro.
  const [cle, setCle] = useState(0);
  const grille = useRef<HTMLDivElement>(null);
  const entreeImport = useRef<HTMLInputElement>(null);

  async function charger() {
    const d = await depot.lireDocument(id);
    if (!d) { nav.aller({ nom: 'accueil' }); return; }
    setDoc(d);
    setNom(d.nom);
    setPages(await depot.lirePages(id));
  }
  useEffect(() => { charger(); }, [id]);

  useEffect(() => {
    const u: Record<string, string> = {};
    for (const p of pages) u[p.id] = urlImage(p.miniature);
    setUrls(u);
    return () => Object.values(u).forEach((x) => URL.revokeObjectURL(x));
  }, [pages]);

  useEffect(() => {
    if (!grille.current) return;
    const s = Sortable.create(grille.current, {
      animation: 150,
      delay: 250,
      delayOnTouchOnly: true,
      dataIdAttr: 'data-id',
      onEnd: async () => {
        try {
          await depot.reordonner(id, s.toArray());
        } catch (e) {
          nav.signaler(messageErreur(e));
        }
        await charger();
        setCle((k) => k + 1);
      },
    });
    return () => s.destroy();
  }, [cle, pages.length]);

  async function renommer() {
    const propre = nom.trim();
    if (!doc || !propre || propre === doc.nom) { setNom(doc?.nom ?? ''); return; }
    try {
      await depot.renommer(id, propre);
      await charger();
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  async function supprimerPage(p: PageScan) {
    setChoisie(null);
    if (!confirm('Supprimer cette page ?')) return;
    await depot.supprimerPage(p.id);
    await charger();
  }

  async function supprimerDocument() {
    if (!doc || !confirm(`Supprimer « ${doc.nom} » et toutes ses pages ?`)) return;
    await depot.supprimerDocument(id);
    nav.aller({ nom: 'accueil' });
  }

  function modifierPage(p: PageScan) {
    nav.aller({
      nom: 'recadrage',
      lot: {
        documentId: id,
        brouillons: [{ original: p.original, coins: p.coins, rotation: p.rotation, filtre: p.filtre, detecte: true }],
        pageExistante: p,
      },
    });
  }

  async function importer(fichiers: File[]) {
    setOccupe(true);
    try {
      nav.aller({ nom: 'recadrage', lot: await importerFichiers(fichiers, id) });
    } catch (e) {
      nav.signaler(messageErreur(e));
      setOccupe(false);
    }
  }

  return (
    <main class="ecran">
      <header class="entete">
        <button aria-label="Retour" onClick={() => nav.aller({ nom: 'accueil' })}>‹</button>
        <input type="text" value={nom} aria-label="Nom du document"
          onInput={(e) => setNom(e.currentTarget.value)} onBlur={renommer}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <button class="danger" onClick={supprimerDocument}>Supprimer</button>
      </header>
      <p class="doux">{pages.length} page{pages.length > 1 ? 's' : ''} · appui long sur une page pour la déplacer</p>
      {occupe && <div class="progression indeterminee"><div /></div>}
      <div class="grille" key={cle} ref={grille}>
        {pages.map((p, k) => (
          <div class="case" key={p.id} data-id={p.id} onClick={() => setChoisie(p)}>
            {urls[p.id] && <img src={urls[p.id]} alt={`Page ${k + 1}`} />}
            <span class="numero">{k + 1}</span>
          </div>
        ))}
      </div>
      <div class="barre-bas">
        <button onClick={() => setAjout(true)}>Ajouter</button>
        <button class="principal" onClick={() => nav.aller({ nom: 'export', id })} disabled={!pages.length}>Exporter</button>
      </div>
      <input ref={entreeImport} type="file" accept="image/*" multiple hidden
        onChange={(e) => { const f = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; if (f.length) importer(f); }} />
      {choisie && (
        <>
          <div class="voile" onClick={() => setChoisie(null)} />
          <div class="feuille-actions">
            <button onClick={() => modifierPage(choisie)}>Recadrer / changer le filtre</button>
            <button class="danger" onClick={() => supprimerPage(choisie)}>Supprimer la page</button>
            <button onClick={() => setChoisie(null)}>Fermer</button>
          </div>
        </>
      )}
      {ajout && (
        <>
          <div class="voile" onClick={() => setAjout(false)} />
          <div class="feuille-actions">
            <button class="principal" onClick={() => nav.aller({ nom: 'viseur', documentId: id })}>Scanner des pages</button>
            <button onClick={() => { setAjout(false); entreeImport.current?.click(); }}>Importer des photos</button>
            <button onClick={() => setAjout(false)}>Fermer</button>
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2 : Brancher l'écran dans `src/app.tsx`**

Ajouter `import { DocumentEcran } from './ecrans/DocumentEcran';` et remplacer

```tsx
          {ecran.nom === 'document' && <Bientot nav={nav} />}
```

par

```tsx
          {ecran.nom === 'document' && <DocumentEcran id={ecran.id} depot={depot} nav={nav} />}
```

- [ ] **Step 3 : Vérifier dans le navigateur**

`npx tsc --noEmit` : aucune erreur. `preview_start` `fof-scan`, `resize_window` preset `mobile`. Importer deux fois l'image de test dans le même document (import depuis l'accueil → Valider → Enregistrer, puis « Ajouter » → « Importer des photos » avec le même script `javascript_tool`, en ciblant `input[type=file][multiple]` de l'écran document).
1. La grille montre 2 pages numérotées 1 et 2.
2. Renommer en « Bordereau test » puis Entrée : de retour à l'accueil, le nom apparaît.
3. `left_click_drag` de la page 2 vers la place de la page 1 (glisser à la souris, sans délai) : l'ordre change et reste après `navigate` (rechargement).
4. Toucher une page → « Recadrer / changer le filtre » → changer le filtre → Enregistrer : retour au document, toujours 2 pages, miniature mise à jour.
5. Toucher une page → « Supprimer la page » (accepter la confirmation) : 1 page.
6. `read_console_messages` (erreurs) : vide. Remettre `resize_window` preset `desktop`.

- [ ] **Step 4 : Commit**

```bash
git add src
git commit -m "Écran du document : pages, ordre, renommage, ajout et suppression" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15 : Exporter et partager

**Files :**
- Create : `src/ecrans/ExportEcran.tsx`
- Modify : `src/app.tsx` (ligne `export`, suppression de `Bientot`)

**Interfaces :**
- Consumes : `preparerExport`, `OptionsExport` (Task 9) ; `reencoder`, `lirePreference`, `ecrirePreference` (Task 10) ; `FichierPret`, `Nav`, `messageErreur` (Task 11)
- Produces : `<ExportEcran id depot nav />`

- [ ] **Step 1 : Écrire `src/ecrans/ExportEcran.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks';
import { preparerExport, type OptionsExport } from '../export/preparer';
import { reencoder } from '../navigateur/images';
import { ecrirePreference, lirePreference } from '../navigateur/preferences';
import type { Depot } from '../rangement/depot';
import type { DocumentScan } from '../rangement/modele';
import { FichierPret } from './FichierPret';
import { messageErreur, type Nav } from './navigation';

const PAR_DEFAUT: OptionsExport = { type: 'pdf', format: 'a4', qualite: 'normale' };

export function ExportEcran({ id, depot, nav }: { id: string; depot: Depot; nav: Nav }) {
  const [doc, setDoc] = useState<DocumentScan | null>(null);
  const [options, setOptions] = useState<OptionsExport>(() => lirePreference('export', PAR_DEFAUT));
  const [progres, setProgres] = useState<{ fait: number; total: number } | null>(null);
  const [pret, setPret] = useState<File[] | null>(null);

  useEffect(() => {
    depot.lireDocument(id).then((d) => (d ? setDoc(d) : nav.aller({ nom: 'accueil' })));
  }, [id]);

  function changer(m: Partial<OptionsExport>) {
    const o = { ...options, ...m };
    setOptions(o);
    ecrirePreference('export', o);
  }

  function choix<K extends keyof OptionsExport>(cle: K, valeurs: [OptionsExport[K], string][]) {
    return (
      <div class="choix">
        {valeurs.map(([v, libelle]) => (
          <button key={String(v)} aria-pressed={options[cle] === v}
            onClick={() => changer({ [cle]: v } as Partial<OptionsExport>)}>{libelle}</button>
        ))}
      </div>
    );
  }

  async function preparer() {
    if (!doc) return;
    setProgres({ fait: 0, total: doc.pages.length });
    try {
      const pages = await depot.lirePages(id);
      setPret(await preparerExport(doc, pages, options, reencoder, (fait, total) => setProgres({ fait, total })));
    } catch (e) {
      nav.signaler(messageErreur(e));
    } finally {
      setProgres(null);
    }
  }

  return (
    <main class="ecran">
      <header class="entete">
        <button aria-label="Retour" onClick={() => nav.aller({ nom: 'document', id })}>‹</button>
        <h1>Exporter</h1>
      </header>
      {doc && <p class="doux">{doc.nom} · {doc.pages.length} page{doc.pages.length > 1 ? 's' : ''}</p>}
      <h2>Type</h2>
      {choix('type', [['pdf', 'PDF'], ['jpg', 'Images JPG']])}
      {options.type === 'pdf' && (<><h2>Format</h2>{choix('format', [['a4', 'A4'], ['reel', 'Taille réelle']])}</>)}
      <h2>Qualité</h2>
      {choix('qualite', [['normale', 'Normale'], ['legere', 'Légère (WhatsApp)']])}
      {progres ? (
        <>
          <span class="doux">Préparation {progres.fait}/{progres.total}…</span>
          <div class="progression"><div style={{ width: `${(100 * progres.fait) / Math.max(1, progres.total)}%` }} /></div>
        </>
      ) : (
        <div class="barre-bas">
          <button class="principal" onClick={preparer} disabled={!doc?.pages.length}>Préparer</button>
        </div>
      )}
      {pret && <FichierPret fichiers={pret} nav={nav} onFermer={() => setPret(null)} />}
    </main>
  );
}
```

- [ ] **Step 2 : Brancher l'écran et retirer `Bientot` de `src/app.tsx`**

Ajouter `import { ExportEcran } from './ecrans/ExportEcran';`, remplacer

```tsx
          {ecran.nom === 'export' && <Bientot nav={nav} />}
```

par

```tsx
          {ecran.nom === 'export' && <ExportEcran id={ecran.id} depot={depot} nav={nav} />}
```

puis supprimer la fonction `Bientot` (plus utilisée).

- [ ] **Step 3 : Vérifier dans le navigateur, avec les tailles**

`npx tsc --noEmit` : aucune erreur. `preview_start` `fof-scan` ; ouvrir le document de la Task 14 → « Exporter ».
1. PDF, A4, Légère → « Préparer » : la barre avance puis la feuille affiche « <nom>.pdf » et sa taille. **Critère : moins de 300 Ko par page.**
2. PDF, Normale : taille plus grande que la Légère.
3. Images JPG avec 2 pages : « 2 fichiers ».
4. « Partager » dans Chrome de bureau : soit le menu de partage, soit un téléchargement ; aucune erreur dans `read_console_messages`.
5. Revenir à l'écran Exporter : les derniers choix sont retenus.

Pour contrôler le PDF, `javascript_tool` avant de toucher « Partager » ne voit pas le fichier ; vérifier plutôt :

```js
const { preparerExport } = await import('/src/export/preparer.ts');
const { reencoder } = await import('/src/navigateur/images.ts');
const { ouvrirDepot } = await import('/src/rangement/depot.ts');
const d = await ouvrirDepot();
const [doc] = await d.listerDocuments();
const f = await preparerExport(doc, await d.lirePages(doc.id), { type: 'pdf', format: 'a4', qualite: 'legere' }, reencoder);
({ nom: f[0].name, koParPage: Math.round(f[0].size / 1024 / doc.pages.length) });
```

Expected : `koParPage` < 300.

- [ ] **Step 4 : Commit**

```bash
git add src
git commit -m "Export en PDF ou JPG et partage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16 : Appli installable et hors ligne

**Files :**
- Create : `scripts/generer-icones.mjs`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` (générés), `src/ecrans/BandeauMiseAJour.tsx`
- Modify : `vite.config.ts`, `index.html`, `src/app.tsx`

**Interfaces :**
- Consumes : `vite-plugin-pwa` (installé à la Task 1)
- Produces : service worker qui met en cache tout le programme (OpenCV compris) ; `<BandeauMiseAJour />`

- [ ] **Step 1 : Écrire `scripts/generer-icones.mjs`**

```js
// Dessine l'icône (feuille blanche au coin plié sur fond vert) et l'écrit en PNG, sans bibliothèque.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, crc]);
}
function png(taille, pixel) {
  const ligne = taille * 3 + 1;
  const brut = Buffer.alloc(taille * ligne);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const [r, g, b] = pixel(x / taille, y / taille);
      const i = y * ligne + 1 + x * 3;
      brut[i] = r; brut[i + 1] = g; brut[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RVB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloc('IHDR', ihdr), bloc('IDAT', deflateSync(brut)), bloc('IEND', Buffer.alloc(0)),
  ]);
}

const VERT = [15, 81, 50], BLANC = [255, 255, 255], VERT_CLAIR = [120, 190, 150];
function dessin(u, v) {
  const coinPlie = u > 0.6 && v < 0.2 + (u - 0.6);
  if (!(u > 0.28 && u < 0.72 && v > 0.2 && v < 0.8) || coinPlie) return VERT;
  const texte = u > 0.36 && u < 0.64 && [0.4, 0.5, 0.6, 0.7].some((l) => Math.abs(v - l) < 0.015);
  return texte ? VERT_CLAIR : BLANC;
}

mkdirSync('public', { recursive: true });
for (const [nom, taille] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/${nom}`, png(taille, dessin));
  console.log(`public/${nom}`);
}
```

Run : `npm run icones`
Expected : les 3 fichiers listés. Les ouvrir avec `Read` : une feuille blanche au coin plié sur fond vert.

- [ ] **Step 2 : Ajouter le plugin PWA dans `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/fof-scan/' : '/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'FOF Scan',
        short_name: 'FOF Scan',
        description: 'Scanner de documents personnel',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#0f1a14',
        theme_color: '#0f5132',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,wasm}'],
        // OpenCV pèse environ 10 Mo : sans cette limite, il ne serait pas gardé pour le hors-ligne.
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
}));
```

Si l'alias `fs`/`path` a été ajouté à la Task 10, le conserver.

- [ ] **Step 3 : Ajouter l'icône iPhone dans `index.html`**

Dans `<head>`, après la ligne `theme-color` :

```html
    <link rel="apple-touch-icon" href="%BASE_URL%apple-touch-icon.png" />
```

- [ ] **Step 4 : Écrire `src/ecrans/BandeauMiseAJour.tsx` et le brancher**

```tsx
import { useRegisterSW } from 'virtual:pwa-register/preact';

export function BandeauMiseAJour() {
  const { needRefresh: [aRecharger], updateServiceWorker } = useRegisterSW();
  if (!aRecharger) return null;
  return (
    <button class="bandeau" onClick={() => updateServiceWorker(true)}>
      Nouvelle version disponible — toucher pour recharger
    </button>
  );
}
```

Dans `src/app.tsx`, ajouter `import { BandeauMiseAJour } from './ecrans/BandeauMiseAJour';` et, juste avant la ligne du `message` :

```tsx
      <BandeauMiseAJour />
```

- [ ] **Step 5 : Construire et vérifier le hors-ligne**

Run : `npm run build`
Expected : build réussi ; la liste contient `sw.js`, `manifest.webmanifest`, et le résumé « precache » compte le gros fichier du worker (environ 10 Mo).

Ajouter dans `.claude/launch.json` une seconde configuration et la lancer :

```json
    { "name": "fof-scan-build", "runtimeExecutable": "npm", "runtimeArgs": ["run", "preview"], "port": 4173 }
```

`preview_start` `fof-scan-build`, `navigate` vers `http://localhost:4173/fof-scan/`, attendre 10 s, puis `javascript_tool` :

```js
const cles = await caches.keys();
const urls = (await Promise.all(cles.map(async (c) => (await (await caches.open(c)).keys()).map((r) => r.url)))).flat();
({ sw: !!navigator.serviceWorker.controller || (await navigator.serviceWorker.getRegistration()) !== undefined,
   fichiers: urls.length, worker: urls.some((u) => /worker/.test(u)), manifeste: !!document.querySelector('link[rel=manifest]') });
```

Expected : `sw: true`, `worker: true`, `manifeste: true`. `preview_stop` ensuite.

- [ ] **Step 6 : Commit**

```bash
git add scripts/generer-icones.mjs public vite.config.ts index.html src .claude/launch.json
git commit -m "Appli installable : icônes, manifeste, hors-ligne et bandeau de mise à jour" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17 : Réglage de la détection sur les photos réelles

**Prérequis :** l'utilisateur a déposé une dizaine de photos JPEG prises avec son iPhone dans `tests/photos/` (fiches, bordereaux, reçus ; sur une table, lumière moyenne, de travers). Les photos HEIC doivent être converties : les envoyer par WhatsApp vers le PC, ou régler l'iPhone sur Réglages › Appareil photo › Formats › « Le plus compatible ». Ce dossier n'est jamais publié.

**Files :**
- Create : `tests/photos.test.ts`
- Modify (seulement si le bilan est inférieur à 8/10) : `src/traitement/detection.ts`, `tests/detection.test.ts`

**Interfaces :**
- Consumes : `chargerOpenCV`, `detecterCoins`, `versImg` (Task 3) ; `redresser` (Task 4) ; `appliquerFiltre` (Task 5)

- [ ] **Step 1 : Écrire `tests/photos.test.ts`**

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { describe, it } from 'vitest';
import { detecterCoins } from '../src/traitement/detection';
import { appliquerFiltre } from '../src/traitement/filtres';
import { versImg } from '../src/traitement/mats';
import { chargerOpenCV } from '../src/traitement/opencv';
import { redresser } from '../src/traitement/redressement';
import type { Img } from '../src/traitement/types';

const DOSSIER = 'tests/photos';
const SORTIE = `${DOSSIER}/resultats`;
const photos = existsSync(DOSSIER) ? readdirSync(DOSSIER).filter((f) => /\.jpe?g$/i.test(f)) : [];

const ecrire = (chemin: string, img: Img) =>
  writeFileSync(chemin, jpeg.encode({ data: Buffer.from(img.data.buffer), width: img.width, height: img.height }, 85).data);

describe.skipIf(photos.length === 0)('photos réelles (dossier local, non publié)', () => {
  it('détecte la feuille et écrit des aperçus à contrôler à l\'œil', async () => {
    const { cv } = await chargerOpenCV();
    mkdirSync(SORTIE, { recursive: true });
    let trouvees = 0;
    for (const f of photos) {
      const brut = jpeg.decode(readFileSync(`${DOSSIER}/${f}`), { useTArray: true, maxMemoryUsageInMB: 2048 });
      const src = cv.matFromImageData({ data: brut.data, width: brut.width, height: brut.height });
      const petit = new cv.Mat();
      const facteur = Math.min(1, 1000 / Math.max(brut.width, brut.height));
      cv.resize(src, petit, new cv.Size(Math.round(brut.width * facteur), Math.round(brut.height * facteur)), 0, 0, cv.INTER_AREA);
      const img = versImg(cv, petit);
      const coins = detecterCoins(cv, img);
      if (coins) {
        trouvees++;
        for (let k = 0; k < 4; k++) {
          const a = coins[k], b = coins[(k + 1) % 4];
          cv.line(petit, new cv.Point(a.x, a.y), new cv.Point(b.x, b.y), new cv.Scalar(0, 255, 0, 255), 4);
        }
        ecrire(`${SORTIE}/${f}-ameliore.jpg`, appliquerFiltre(cv, redresser(cv, img, coins, 0), 'ameliore'));
      }
      ecrire(`${SORTIE}/${f}-contour.jpg`, versImg(cv, petit));
      src.delete(); petit.delete();
      console.log(`${f} : ${coins ? 'feuille trouvée' : 'NON détectée'}`);
    }
    console.log(`Bilan : ${trouvees}/${photos.length} détectées`);
  });
});
```

- [ ] **Step 2 : Lancer et contrôler**

Run : `npx vitest run tests/photos.test.ts`
Expected : une ligne par photo et le bilan. Ouvrir chaque `tests/photos/resultats/*-contour.jpg` avec `Read` et compter les contours **justes** (le trait vert suit les bords de la feuille). Une détection présente mais fausse compte comme ratée.

Critère : **au moins 8 photos sur 10 justes**. Si le critère est atteint, passer au Step 5.

- [ ] **Step 3 (seulement si < 8/10) : ajouter une seconde méthode de détection par seuil**

La méthode par bords échoue surtout quand la table est texturée ou que le contraste est faible. Ajouter dans `src/traitement/detection.ts` une seconde méthode qui isole la grande zone claire du papier, appelée quand la première ne trouve rien :

```ts
/** Seconde chance : seuil d'Otsu, puis fermeture, puis plus grand contour approché par 4 points. */
function detecterParSeuil(cv: CV, img: Img): Coins | null {
  const src = cv.matFromImageData(img);
  const gris = new cv.Mat();
  const binaire = new cv.Mat();
  const noyau = cv.Mat.ones(9, 9, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchie = new cv.Mat();
  try {
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gris, gris, new cv.Size(7, 7), 0);
    cv.threshold(gris, binaire, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(binaire, binaire, cv.MORPH_CLOSE, noyau);
    cv.findContours(binaire, contours, hierarchie, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let meilleur: Coins | null = null;
    let meilleureAire = AIRE_MIN * img.width * img.height;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const enveloppe = new cv.Mat();
      const approx = new cv.Mat();
      try {
        const aire = cv.contourArea(contour);
        if (aire <= meilleureAire || aire > 0.98 * img.width * img.height) continue;
        cv.convexHull(contour, enveloppe);
        cv.approxPolyDP(enveloppe, approx, 0.03 * cv.arcLength(enveloppe, true), true);
        if (approx.rows !== 4) continue;
        const points: Point[] = [];
        for (let k = 0; k < 4; k++) points.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
        meilleur = ordonnerCoins(points);
        meilleureAire = aire;
      } finally {
        contour.delete(); enveloppe.delete(); approx.delete();
      }
    }
    return meilleur;
  } finally {
    src.delete(); gris.delete(); binaire.delete(); noyau.delete(); contours.delete(); hierarchie.delete();
  }
}
```

Renommer la fonction actuelle `detecterCoins` en `detecterParBords` (non exportée), puis exporter :

```ts
export function detecterCoins(cv: CV, img: Img): Coins | null {
  return detecterParBords(cv, img) ?? detecterParSeuil(cv, img);
}
```

Ajouter dans `tests/detection.test.ts` le cas qui motive ce changement :

```ts
  it('trouve une feuille sur une table texturée (seconde méthode)', () => {
    const img = imageUnie(400, 300, 90);
    ajouterBruit(img, 60, 7); // table très texturée : beaucoup de faux bords
    remplirPolygone(img, vrais, 235);
    const coins = detecterCoins(cv, img);
    expect(coins).not.toBeNull();
    coins!.forEach((p, i) => expect(Math.hypot(p.x - vrais[i].x, p.y - vrais[i].y)).toBeLessThan(12));
  });
```

Run : `npx vitest run tests/detection.test.ts` → tous PASS (les 4 anciens cas, dont « image sans feuille → null », doivent rester verts).

- [ ] **Step 4 (seulement si < 8/10) : relancer le contrôle**

Run : `npx vitest run tests/photos.test.ts` puis recompter à l'œil. Si le bilan reste sous 8/10, **s'arrêter** et montrer à l'utilisateur les photos ratées, avec la cause visible (reflet, feuille coupée par le cadre, fond blanc…), avant tout autre réglage.

- [ ] **Step 5 : Commit (sans les photos)**

```bash
git status --short tests/photos
git add tests/photos.test.ts src/traitement/detection.ts tests/detection.test.ts
git commit -m "Contrôle de la détection sur des photos réelles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`git status --short tests/photos` ne doit rien afficher (dossier ignoré).

---

### Task 18 : Mise en ligne sur GitHub Pages et essai sur l'iPhone

**Files :**
- Create : `.github/workflows/publier.yml`

- [ ] **Step 1 : Écrire `.github/workflows/publier.yml`**

```yaml
name: Publier sur GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  publier:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploiement.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deploiement
        uses: actions/deploy-pages@v4
```

Commit :

```bash
git add .github/workflows/publier.yml
git commit -m "Publication automatique sur GitHub Pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2 : Connexion GitHub (faite par l'utilisateur)**

L'utilisateur crée son compte sur github.com s'il n'en a pas, puis lance dans son terminal (commande interactive : Claude ne peut pas la faire à sa place) :

```bash
gh auth login
```

Choix : GitHub.com → HTTPS → « Login with a web browser ». Vérifier ensuite : `gh auth status` affiche le compte.

- [ ] **Step 3 : Confirmer avant de publier**

Publier crée un dépôt **public** : demander à l'utilisateur une confirmation explicite (« oui ») en rappelant que seul le programme est publié, jamais les documents ni `tests/photos/`. Vérifier d'abord : `git ls-files tests/photos` ne renvoie rien.

- [ ] **Step 4 : Créer le dépôt, activer Pages, pousser**

```bash
gh repo create fof-scan --public --source . --remote origin
gh api -X POST "repos/$(gh api user -q .login)/fof-scan/pages" -f build_type=workflow
git push -u origin main
gh run watch --exit-status
```

Expected : le workflow se termine en vert (tests, build, déploiement).

- [ ] **Step 5 : Vérifier le site publié**

`preview_start` avec `url` `https://<compte>.github.io/fof-scan/` : l'accueil FOF Scan s'affiche ; `read_console_messages` (erreurs) : vide ; `javascript_tool` : `navigator.serviceWorker.getRegistration().then(r => !!r)` renvoie `true` après quelques secondes.

- [ ] **Step 6 : Essai sur l'iPhone (fait par l'utilisateur, guidé)**

Donner à l'utilisateur cette liste à suivre :

1. Ouvrir `https://<compte>.github.io/fof-scan/` dans **Safari**, attendre la fin de la barre verte en haut.
2. Partager › « Sur l'écran d'accueil » › Ajouter. Ouvrir FOF Scan depuis l'icône.
3. Scanner › autoriser l'appareil photo. Poser une fiche sur une table : le contour vert apparaît, la photo se prend seule.
4. Enchaîner 3 pages, « Terminé » › Valider › choisir « Noir & blanc » › « Appliquer à toutes » › Enregistrer.
5. Exporter › PDF › Légère › Préparer › Partager › WhatsApp (à soi-même) : le PDF arrive lisible. **Chronométrer une page seule, de « Scanner » au partage : moins de 15 secondes.**
6. Mettre l'iPhone en **mode avion**, fermer puis rouvrir FOF Scan : il s'ouvre et scanne.
7. Menu ⋯ › « Sauvegarder tout » › Partager › Enregistrer dans Fichiers.

Noter chaque point réussi ou raté ; tout point raté devient une correction (compétence systematic-debugging) avant de clore le morceau 1.

- [ ] **Step 7 : Clore**

Mettre à jour la mémoire `fof-scan` (morceau 1 livré, adresse du site, bilan des photos et de l'essai iPhone), puis proposer de passer à la conception du morceau 2 (scan → Word / Excel).
