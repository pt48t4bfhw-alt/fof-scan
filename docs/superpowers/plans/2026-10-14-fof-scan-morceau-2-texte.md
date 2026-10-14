# FOF Scan — Morceau 2 : scan → texte, Word, Excel — Plan de travail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** lire le texte des pages scannées sur l'iPhone (PaddleOCR), le corriger ligne par ligne ou case par case, et le sortir en Word, en Excel ou en texte copié.

**Architecture :** la lecture tourne dans le worker de traitement existant (OpenCV + onnxruntime-web déjà chargés) : repérage des lignes par PP-OCRv6 *tiny*, lecture de chaque ligne par PP-OCRv6 *small*, tableau retrouvé par les traits (OpenCV). Les modèles (23 Mo) sont servis par GitHub Pages mais téléchargés à la demande dans le Cache Storage, hors précache. Les lectures sont rangées dans IndexedDB (magasin `lectures`, version 3) ; Word et Excel sont fabriqués à la main (XML + fflate).

**Tech Stack :** Vite 6, Preact, TypeScript ~5.6, Vitest 3, onnxruntime-web 1.30, @techstark/opencv-js 4.10, idb, fflate.

**Spec :** `docs/superpowers/specs/2026-10-14-fof-scan-morceau-2-texte-design.md`

## Global Constraints

- Tout le texte visible est en **français** ; explications simples.
- Gratuit, sur le téléphone, **sans internet après le premier téléchargement** du lecteur ; aucun autre serveur que GitHub Pages.
- Modèles officiels PaddleOCR (Apache-2.0) : `PP-OCRv6_tiny_det` (repérage) + `PP-OCRv6_small_rec` (lecture), **exclus du précache** du service worker.
- Repérage : image réduite à **1600 px** au plus ; seuil 0,3 ; boîte 0,6 ; élargissement 1,5. Lecture : hauteur 48, largeur ≥ 320. Pages lues en **2400 px** au plus.
- Ligne douteuse : confiance **< 0,8** (orange).
- TypeScript reste en ~5.6 ; `npx tsc --noEmit` et `npx vitest run` doivent passer à chaque tâche.
- Ne jamais versionner `tests/photos/` (vérifier `git ls-files tests/photos` = 0). Ne jamais pousser sur `main` sans « oui, publie » de l'utilisateur.
- Ne jamais réécrire un fichier avec `Get-Content`/`Set-Content` de PowerShell 5 (accents cassés) : utiliser les outils d'édition.
- L'objet OpenCV a une méthode `then` : toujours passer par `chargerOpenCV()` (enveloppe `{ cv }`).
- Branche de travail : `morceau-2-texte`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/lecture/modele.ts` | types des lectures, empreinte d'une image, seuil « douteux » |
| `src/lecture/ordre.ts` | rangées visuelles (ordre de lecture) |
| `src/lecture/ctc.ts` | dictionnaire et décodage CTC |
| `src/lecture/reperage.ts` | entrée du repérage, boîtes depuis la carte de probabilité |
| `src/lecture/ligne.ts` | découpe redressée d'une ligne, entrée de la lecture |
| `src/lecture/lecteur.ts` | le Lecteur : sessions, sens de la page, lecture des lignes |
| `src/lecture/tableau.ts` | cases par les traits, rangement des lignes, choix Texte / Tableau |
| `src/lecture/contenu.ts` | blocs d'une page (paragraphes, tableau), texte complet |
| `src/lecture/telechargement.ts` | téléchargement et lecture des fichiers du lecteur (Cache Storage) |
| `src/export/ooxml.ts`, `docx.ts`, `xlsx.ts` | fichiers Word et Excel |
| `src/navigateur/lecture.ts` | lire une page enregistrée, image de la page lue |
| `src/ecrans/lireDocument.ts` | état d'une page, lecture de plusieurs pages |
| `src/ecrans/TexteEcran.tsx`, `PageLue.tsx` | écran Texte, correction |
| `public/modeles/ocr/` | modèles, dictionnaire, licence, LISEZMOI |
| `scripts/preparer-lecteur.mjs` | copie des modèles et extraction du dictionnaire |
| modifiés | `depot.ts`, `sauvegarde.ts`, `protocole.ts`, `coeur.ts`, `client.ts`, `traitement.worker.ts`, `navigation.ts`, `app.tsx`, `DocumentEcran.tsx`, `Accueil.tsx`, `styles.css`, `vite.config.ts`, `docs/reference-camscanner.md` |

---

### Task 1 : Types, ordre de lecture, décodage CTC

**Files:**
- Create: `src/lecture/modele.ts`, `src/lecture/ordre.ts`, `src/lecture/ctc.ts`
- Test: `tests/ctc.test.ts`

**Interfaces:**
- Produces : `Rect`, `Quad`, `LigneLue`, `CaseTableau`, `Tableau`, `Sens`, `ModeLecture`, `LecturePage`, `ResultatLecture`, `CONFIANCE_DOUTEUSE`, `empreinte(im: ImageJpeg): string` ; `enRangees<T>(items: T[], rect: (t: T) => Rect): T[][]` ; `lireDictionnaire(texte: string): string[]`, `decoderCTC(probas: Float32Array, pas: number, classes: number, dict: string[]): { texte: string; confiance: number }`.

- [ ] **Step 1 : écrire les tests**

`tests/ctc.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { decoderCTC, lireDictionnaire } from '../src/lecture/ctc';
import { empreinte, type Rect } from '../src/lecture/modele';
import { enRangees } from '../src/lecture/ordre';
import { jpegFactice } from './aides/jpeg';

describe('dictionnaire', () => {
  it('un caractère par ligne, l\'espace ajoutée à la fin', () => {
    expect(lireDictionnaire('a\nb\r\né\n')).toEqual(['a', 'b', 'é', ' ']);
  });
  it('garde un caractère blanc particulier (espace idéographique)', () => {
    expect(lireDictionnaire('a\n　\nb\n')).toEqual(['a', '　', 'b', ' ']);
  });
});

describe('décodage CTC', () => {
  // classes : 0 = blanc, 1 = a, 2 = b, 3 = espace
  const dict = ['a', 'b', ' '];
  const pas = (...classes: number[]) => {
    const p = new Float32Array(classes.length * 4);
    classes.forEach((c, t) => { p[t * 4 + c] = 0.9; });
    return p;
  };

  it('saute les blancs et les répétitions, garde les doubles séparées par un blanc', () => {
    const r = decoderCTC(pas(1, 1, 0, 1, 2, 3, 2), 7, 4, dict);
    expect(r.texte).toBe('aab b');
    expect(r.confiance).toBeCloseTo(0.9);
  });

  it('une ligne vide rend un texte vide et une confiance nulle', () => {
    expect(decoderCTC(pas(0, 0, 0), 3, 4, dict)).toEqual({ texte: '', confiance: 0 });
  });
});

describe('empreinte', () => {
  it('change quand l\'image change, pas quand on la relit', () => {
    const a = jpegFactice(20, 20, 200);
    expect(empreinte(a)).toBe(empreinte({ ...a, octets: a.octets.slice() }));
    expect(empreinte(a)).not.toBe(empreinte(jpegFactice(20, 20, 50)));
  });
});

describe('rangées', () => {
  const r = (x: number, y: number, hauteur = 20): Rect => ({ x, y, largeur: 50, hauteur });
  it('regroupe les éléments d\'une même hauteur, de haut en bas puis de gauche à droite', () => {
    const items = [r(200, 104), r(10, 100), r(10, 40), r(300, 46)];
    expect(enRangees(items, (i) => i)).toEqual([[r(10, 40), r(300, 46)], [r(10, 100), r(200, 104)]]);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/ctc.test.ts` — Expected : FAIL (modules introuvables).

- [ ] **Step 3 : écrire le code**

`src/lecture/modele.ts` :

```ts
import type { ImageJpeg } from '../rangement/modele';

/** Rectangle droit, en pixels de la page lue (après remise d'aplomb). */
export interface Rect { x: number; y: number; largeur: number; hauteur: number }
/** Quadrilatère d'une ligne repérée : haut-gauche, haut-droite, bas-droite, bas-gauche. */
export type Quad = [[number, number], [number, number], [number, number], [number, number]];

export interface LigneLue { rect: Rect; texte: string; confiance: number; corrige: boolean }

export interface CaseTableau {
  rang: number;
  col: number;
  /** Nombre de rangées et de colonnes couvertes (cases fusionnées). */
  rangs: number;
  cols: number;
  rect: Rect;
  texte: string;
  /** Plus faible confiance des lignes rangées dans la case (1 si elle est vide). */
  confiance: number;
  corrige: boolean;
}
export interface Tableau { rect: Rect; rangs: number; cols: number; cases: CaseTableau[] }

/** Quart de tour appliqué à la page avant lecture (90 = vers la droite). */
export type Sens = 0 | 90 | 270;
export type ModeLecture = 'texte' | 'tableau';

export interface LecturePage {
  pageId: string;
  documentId: string;
  /** Empreinte de l'image lue : si la page change ensuite, la lecture est « à relire ». */
  empreinte: string;
  sens: Sens;
  /** Taille de l'image lue (réduite et remise d'aplomb) : les rectangles s'y rapportent. */
  largeur: number;
  hauteur: number;
  mode: ModeLecture;
  lignes: LigneLue[];
  tableau: Tableau | null;
  lu: number;
}

/** Ce que le worker rend pour une page (sans les identifiants). */
export type ResultatLecture = Pick<LecturePage, 'sens' | 'largeur' | 'hauteur' | 'mode' | 'lignes' | 'tableau'>;

/** En dessous, la ligne (ou la case) est signalée en orange. */
export const CONFIANCE_DOUTEUSE = 0.8;

/** Empreinte rapide d'une image JPEG : taille, nombre d'octets et FNV-1a sur un octet sur 61. */
export function empreinte(im: ImageJpeg): string {
  let h = 0x811c9dc5;
  const o = im.octets;
  for (let i = 0; i < o.length; i += 61) {
    h ^= o[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${im.largeur}x${im.hauteur}:${o.length}:${h.toString(16)}`;
}
```

`src/lecture/ordre.ts` :

```ts
import type { Rect } from './modele';

/**
 * Regroupe des éléments en rangées visuelles : deux éléments dont les centres sont à moins d'une
 * demi-hauteur sont sur la même rangée. Rangées de haut en bas, chacune de gauche à droite.
 */
export function enRangees<T>(items: T[], rect: (t: T) => Rect): T[][] {
  const centre = (t: T) => rect(t).y + rect(t).hauteur / 2;
  const rangees: T[][] = [];
  for (const t of [...items].sort((a, b) => centre(a) - centre(b))) {
    const r = rangees[rangees.length - 1];
    const tete = r?.[0];
    if (tete && Math.abs(centre(tete) - centre(t)) < 0.5 * Math.max(rect(tete).hauteur, rect(t).hauteur)) r.push(t);
    else rangees.push([t]);
  }
  return rangees.map((r) => r.sort((a, b) => rect(a).x - rect(b).x));
}
```

`src/lecture/ctc.ts` :

```ts
/** Dictionnaire du lecteur : un caractère par ligne ; l'espace est ajoutée à la fin, comme dans PaddleOCR. */
export function lireDictionnaire(texte: string): string[] {
  const lignes = texte.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lignes[lignes.length - 1] === '') lignes.pop();
  return [...lignes, ' '];
}

/**
 * Décodage CTC glouton : à chaque pas la classe la plus probable ; on saute le « blanc » (classe 0)
 * et les répétitions. Confiance = moyenne des probabilités des caractères gardés.
 */
export function decoderCTC(probas: Float32Array, pas: number, classes: number, dict: string[]): { texte: string; confiance: number } {
  let texte = '';
  let somme = 0;
  let n = 0;
  let avant = -1;
  for (let t = 0; t < pas; t++) {
    let meilleure = 0;
    let p = -Infinity;
    for (let c = 0; c < classes; c++) {
      const v = probas[t * classes + c];
      if (v > p) { p = v; meilleure = c; }
    }
    if (meilleure !== 0 && meilleure !== avant) {
      texte += dict[meilleure - 1] ?? '';
      somme += p;
      n++;
    }
    avant = meilleure;
  }
  return { texte: texte.trim(), confiance: n ? somme / n : 0 };
}
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/ctc.test.ts` puis `npx tsc --noEmit` — Expected : PASS, aucune erreur (hors fichiers d'essai `*.tmp.test.ts` tant qu'ils existent).

- [ ] **Step 5 : commit**

```bash
git add src/lecture tests/ctc.test.ts
git commit -m "Lecture : types, ordre de lecture et décodage CTC"
```

---

### Task 2 : Fichiers du lecteur dans l'appli

**Files:**
- Create: `scripts/preparer-lecteur.mjs`, `public/modeles/ocr/` (3 fichiers produits + `LICENCE-PaddleOCR.txt` + `LISEZMOI.txt`)
- Modify: `vite.config.ts` (bloc `workbox`)
- Test: `tests/lecteur-fichiers.test.ts`

**Interfaces:**
- Consumes : `lireDictionnaire` (Task 1).
- Produces : `public/modeles/ocr/reperage-ppocrv6-tiny.onnx` (1 780 590 o), `lecture-ppocrv6-small.onnx` (21 159 378 o), `dictionnaire-ppocrv6.txt` (74 947 o, 18 708 lignes).

Les archives officielles sont déjà téléchargées et extraites (accord de l'utilisateur) dans le scratchpad : `…/scratchpad/essai-ocr/modeles/PP-OCRv6_tiny_det/` et `…/PP-OCRv6_small_rec/`. Si elles manquent : `https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv6_tiny_det_onnx_infer.tar` et `…/PP-OCRv6_small_rec_onnx_infer.tar` (redemander l'accord avant de télécharger).

- [ ] **Step 1 : écrire le test**

`tests/lecteur-fichiers.test.ts` :

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lireDictionnaire } from '../src/lecture/ctc';

const D = 'public/modeles/ocr';

describe('fichiers du lecteur de texte', () => {
  it('les deux modèles, le dictionnaire, la licence et le mode d\'emploi sont présents', () => {
    for (const f of ['reperage-ppocrv6-tiny.onnx', 'lecture-ppocrv6-small.onnx', 'dictionnaire-ppocrv6.txt', 'LICENCE-PaddleOCR.txt', 'LISEZMOI.txt']) {
      expect(existsSync(`${D}/${f}`), f).toBe(true);
    }
  });

  it('le dictionnaire a 18 708 caractères (+ l\'espace) et connaît les accents', () => {
    const dict = lireDictionnaire(readFileSync(`${D}/dictionnaire-ppocrv6.txt`, 'utf8'));
    expect(dict).toHaveLength(18709);
    for (const c of ['é', 'è', 'ç', 'à', 'ô', '€', '　']) expect(dict).toContain(c);
    expect(dict.every((c) => [...c].length === 1)).toBe(true);
  });

  it('les modèles ne sont pas mis dans le précache (téléchargés à la demande)', () => {
    expect(readFileSync('vite.config.ts', 'utf8')).toContain("globIgnores: ['**/modeles/ocr/**']");
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/lecteur-fichiers.test.ts` — Expected : FAIL (fichiers absents).

- [ ] **Step 3 : écrire le script et préparer les fichiers**

`scripts/preparer-lecteur.mjs` :

```js
// Copie les modèles officiels PaddleOCR PP-OCRv6 (archives *_onnx_infer.tar déjà extraites) dans
// public/modeles/ocr et écrit le dictionnaire (un caractère par ligne) tiré de inference.yml.
// Usage : node scripts/preparer-lecteur.mjs <dossier contenant PP-OCRv6_tiny_det/ et PP-OCRv6_small_rec/>
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = process.argv[2];
if (!source) {
  console.error('Usage : node scripts/preparer-lecteur.mjs <dossier des modèles extraits>');
  process.exit(1);
}
const sortie = 'public/modeles/ocr';
mkdirSync(sortie, { recursive: true });
const det = join(source, 'PP-OCRv6_tiny_det', 'PP-OCRv6_tiny_det_onnx_infer');
const rec = join(source, 'PP-OCRv6_small_rec', 'PP-OCRv6_small_rec_onnx_infer');
copyFileSync(join(det, 'inference.onnx'), join(sortie, 'reperage-ppocrv6-tiny.onnx'));
copyFileSync(join(rec, 'inference.onnx'), join(sortie, 'lecture-ppocrv6-small.onnx'));

const lignes = readFileSync(join(rec, 'inference.yml'), 'utf8').split(/\r?\n/);
const debut = lignes.findIndex((l) => /^\s*character_dict:/.test(l));
const dict = [];
for (const l of lignes.slice(debut + 1)) {
  const m = /^\s*- (.*)$/.exec(l);
  if (!m) break;
  let v = m[1];
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
  else if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = JSON.parse(v);
  dict.push(v);
}
writeFileSync(join(sortie, 'dictionnaire-ppocrv6.txt'), dict.join('\n') + '\n');

for (const f of ['reperage-ppocrv6-tiny.onnx', 'lecture-ppocrv6-small.onnx', 'dictionnaire-ppocrv6.txt']) {
  const o = readFileSync(join(sortie, f));
  console.log(f, o.length, createHash('sha256').update(o).digest('hex').toUpperCase());
}
console.log('caractères :', dict.length);
```

Run (Git Bash) :

```bash
node scripts/preparer-lecteur.mjs "$TEMP/claude/C--Users-FOFANA-Desktop-ACTIVITE-2027/352e73c9-5242-449f-ab15-db512576a147/scratchpad/essai-ocr/modeles"
cp public/modeles/LICENCE-DocAligner.txt public/modeles/ocr/LICENCE-PaddleOCR.txt
```

Expected : tailles 1780590 / 21159378 / 74947 ; SHA-256 `193BAB7A04FCA699A6C82E6ABB5B81BDB28177F0ABD4062552B04908DAFB19F8` / `5435FD747C9E0EFE15A96D0B378D5BD157E9492ED8FD80EDF08F30D02FA24634` / `B5F2BFE2BDD9448429E3E82B51C789775D9B42F2403D082B00662EB77E401C5D` ; « caractères : 18708 ». (`LICENCE-DocAligner.txt` est le texte intégral de la licence Apache 2.0, celle de PaddleOCR.)

`public/modeles/ocr/LISEZMOI.txt` :

```text
Lecteur de texte de FOF Scan
============================

Modèles officiels de PaddleOCR (PaddlePaddle, https://github.com/PaddlePaddle/PaddleOCR), non modifiés,
au format ONNX (archives « *_onnx_infer.tar » du serveur PaddleX) :

  reperage-ppocrv6-tiny.onnx   = PP-OCRv6_tiny_det/inference.onnx   (repère les lignes de texte)
    SHA-256 : 193BAB7A04FCA699A6C82E6ABB5B81BDB28177F0ABD4062552B04908DAFB19F8
  lecture-ppocrv6-small.onnx   = PP-OCRv6_small_rec/inference.onnx  (lit chaque ligne)
    SHA-256 : 5435FD747C9E0EFE15A96D0B378D5BD157E9492ED8FD80EDF08F30D02FA24634
  dictionnaire-ppocrv6.txt     = liste « character_dict » de PP-OCRv6_small_rec/inference.yml,
                                 un caractère par ligne (18 708 caractères, accents compris)
    SHA-256 : B5F2BFE2BDD9448429E3E82B51C789775D9B42F2403D082B00662EB77E401C5D

Licence : Apache License 2.0 (texte complet dans LICENCE-PaddleOCR.txt).
Fichiers produits par scripts/preparer-lecteur.mjs. Téléchargés par le téléphone à la première
lecture, puis gardés pour fonctionner sans internet. Ils ne font pas partie du précache.
```

- [ ] **Step 4 : exclure les modèles du précache**

Dans `vite.config.ts`, bloc `workbox`, ajouter la ligne `globIgnores` :

```ts
      workbox: {
        // onnx : le modèle DocAligner ; wasm : le moteur onnxruntime
        globPatterns: ['**/*.{js,mjs,css,html,png,wasm,onnx}'],
        // le lecteur de texte (23 Mo) se télécharge à la demande, pas à l'installation
        globIgnores: ['**/modeles/ocr/**'],
```

- [ ] **Step 5 : vérifier la réussite**

Run : `npx vitest run tests/lecteur-fichiers.test.ts` — Expected : PASS.

- [ ] **Step 6 : commit**

```bash
git add scripts/preparer-lecteur.mjs public/modeles/ocr vite.config.ts tests/lecteur-fichiers.test.ts
git commit -m "Lecteur de texte : modèles PaddleOCR PP-OCRv6, dictionnaire et licence (hors précache)"
```

---

### Task 3 : Repérage des lignes

**Files:**
- Create: `src/lecture/reperage.ts`
- Test: `tests/reperage.test.ts`

**Interfaces:**
- Consumes : `Quad` (Task 1), `enRangees` (Task 1), `CV`, `Img`.
- Produces : `COTE_REPERAGE = 1600` ; `interface BoiteReperee { quad: Quad; score: number }` ; `preparerReperage(cv, img: Img, coteMax = COTE_REPERAGE): { donnees: Float32Array; largeur: number; hauteur: number }` ; `ordonnerQuad(p: [number, number][]): Quad` ; `boitesDepuisCarte(cv, carte: Float32Array, h: number, w: number, largeur: number, hauteur: number): BoiteReperee[]`.

- [ ] **Step 1 : écrire les tests**

`tests/reperage.test.ts` :

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { boitesDepuisCarte, ordonnerQuad, preparerReperage } from '../src/lecture/reperage';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { imageUnie } from './aides/images';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

describe('entrée du repérage', () => {
  it('côtés multiples de 32, BGR normalisé comme PaddleOCR', () => {
    const r = preparerReperage(cv, imageUnie(100, 50, 255));
    expect([r.largeur, r.hauteur]).toEqual([96, 64]);
    expect(r.donnees).toHaveLength(3 * 96 * 64);
    expect(r.donnees[0]).toBeCloseTo((1 - 0.485) / 0.229, 3);
  });
  it('réduit une grande page à 1600 px au plus', () => {
    const r = preparerReperage(cv, imageUnie(3200, 1600, 255));
    expect([r.largeur, r.hauteur]).toEqual([1600, 800]);
  });
});

describe('boîtes depuis la carte', () => {
  const h = 64, w = 128;
  function carte(zones: { x0: number; x1: number; y0: number; y1: number; v: number }[]) {
    const c = new Float32Array(h * w);
    for (const z of zones) for (let y = z.y0; y < z.y1; y++) for (let x = z.x0; x < z.x1; x++) c[y * w + x] = z.v;
    return c;
  }

  it('une bande nette donne une boîte élargie, ramenée à la taille de l\'image ; une bande pâle est écartée', () => {
    const b = boitesDepuisCarte(cv, carte([
      { x0: 10, x1: 60, y0: 30, y1: 40, v: 0.9 },
      { x0: 70, x1: 120, y0: 40, y1: 50, v: 0.5 },
    ]), h, w, 256, 128);
    expect(b).toHaveLength(1);
    expect(b[0].score).toBeGreaterThan(0.8);
    const xs = b[0].quad.map((p) => p[0]), ys = b[0].quad.map((p) => p[1]);
    expect(Math.min(...xs)).toBeLessThan(20);
    expect(Math.max(...xs)).toBeGreaterThan(118);
    expect(Math.min(...ys)).toBeLessThan(60);
    expect(Math.max(...ys)).toBeGreaterThan(78);
  });

  it('rend les boîtes dans l\'ordre de lecture', () => {
    const b = boitesDepuisCarte(cv, carte([
      { x0: 10, x1: 60, y0: 40, y1: 50, v: 0.9 },
      { x0: 70, x1: 120, y0: 5, y1: 15, v: 0.9 },
      { x0: 10, x1: 50, y0: 6, y1: 14, v: 0.9 },
    ]), h, w, w, h);
    expect(b.map((x) => Math.round(Math.min(...x.quad.map((p) => p[0]))) < 40 ? 'g' : 'd')).toEqual(['g', 'd', 'g']);
    expect(b[2].quad[0][1]).toBeGreaterThan(b[0].quad[0][1]);
  });

  it('ordonne un quadrilatère : haut-gauche, haut-droite, bas-droite, bas-gauche', () => {
    expect(ordonnerQuad([[10, 20], [0, 0], [10, 0], [0, 20]])).toEqual([[0, 0], [10, 0], [10, 20], [0, 20]]);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/reperage.test.ts` — Expected : FAIL (module introuvable).

- [ ] **Step 3 : écrire le code**

`src/lecture/reperage.ts` :

```ts
import type { CV } from '../traitement/opencv';
import type { Img } from '../traitement/types';
import type { Quad } from './modele';
import { enRangees } from './ordre';

/** Le repérage travaille sur une image réduite : bien plus rapide, et assez fin pour trouver les lignes. */
export const COTE_REPERAGE = 1600;
const MOYENNE = [0.485, 0.456, 0.406];
const ECART = [0.229, 0.224, 0.225];
/** Réglages de PaddleOCR : une case compte comme texte au-dessus de 0,3 ; une boîte est gardée si sa moyenne dépasse 0,6. */
const SEUIL = 0.3;
const SEUIL_BOITE = 0.6;
/** Le modèle repère le cœur des lettres : la boîte est élargie (« unclip » de PaddleOCR). */
const ELARGISSEMENT = 1.5;
const COTE_MIN = 3;

export interface BoiteReperee { quad: Quad; score: number }

/** Entrée du repérage : image réduite, côtés multiples de 32, ordre BGR normalisé, 1 × 3 × H × W. */
export function preparerReperage(cv: CV, img: Img, coteMax = COTE_REPERAGE): { donnees: Float32Array; largeur: number; hauteur: number } {
  const f = Math.min(1, coteMax / Math.max(img.width, img.height));
  const largeur = Math.max(32, Math.round((img.width * f) / 32) * 32);
  const hauteur = Math.max(32, Math.round((img.height * f) / 32) * 32);
  const src = cv.matFromImageData(img);
  const petit = new cv.Mat();
  try {
    cv.resize(src, petit, new cv.Size(largeur, hauteur), 0, 0, cv.INTER_AREA);
    const n = largeur * hauteur;
    const d = petit.data as Uint8Array;
    const donnees = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      donnees[i] = (d[i * 4 + 2] / 255 - MOYENNE[0]) / ECART[0];
      donnees[n + i] = (d[i * 4 + 1] / 255 - MOYENNE[1]) / ECART[1];
      donnees[2 * n + i] = (d[i * 4] / 255 - MOYENNE[2]) / ECART[2];
    }
    return { donnees, largeur, hauteur };
  } finally {
    src.delete();
    petit.delete();
  }
}

/** Ordre d'un quadrilatère : haut-gauche, haut-droite, bas-droite, bas-gauche. */
export function ordonnerQuad(p: [number, number][]): Quad {
  const s = [...p].sort((a, b) => a[0] - b[0]);
  const [g1, g2] = s[0][1] <= s[1][1] ? [s[0], s[1]] : [s[1], s[0]];
  const [d1, d2] = s[2][1] <= s[3][1] ? [s[2], s[3]] : [s[3], s[2]];
  return [g1, d1, d2, g2];
}

/** Carte de probabilité du modèle (h × w) → boîtes des lignes dans l'image d'origine, dans l'ordre de lecture. */
export function boitesDepuisCarte(cv: CV, carte: Float32Array, h: number, w: number, largeur: number, hauteur: number): BoiteReperee[] {
  const masque = new Uint8Array(h * w);
  for (let i = 0; i < masque.length; i++) masque[i] = carte[i] > SEUIL ? 255 : 0;
  const bm = cv.matFromArray(h, w, cv.CV_8UC1, masque);
  const contours = new cv.MatVector();
  const hierarchie = new cv.Mat();
  const boites: BoiteReperee[] = [];
  const fx = largeur / w;
  const fy = hauteur / h;
  try {
    cv.findContours(bm, contours, hierarchie, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let k = 0; k < contours.size(); k++) {
      const c = contours.get(k);
      const rect = c.rows >= 4 ? cv.minAreaRect(c) : null;
      c.delete();
      if (!rect || Math.min(rect.size.width, rect.size.height) < COTE_MIN) continue;
      const coeur = ordonnerQuad(cv.RotatedRect.points(rect).map((p: { x: number; y: number }) => [p.x, p.y] as [number, number]));
      const score = moyenneDans(cv, carte, h, w, coeur);
      if (score < SEUIL_BOITE) continue;
      const d = (rect.size.width * rect.size.height * ELARGISSEMENT) / (2 * (rect.size.width + rect.size.height));
      const grand = new cv.RotatedRect(rect.center, new cv.Size(rect.size.width + 2 * d, rect.size.height + 2 * d), rect.angle);
      const quad = ordonnerQuad(cv.RotatedRect.points(grand).map((p: { x: number; y: number }) => [
        Math.min(largeur, Math.max(0, p.x * fx)),
        Math.min(hauteur, Math.max(0, p.y * fy)),
      ] as [number, number]));
      boites.push({ quad, score });
    }
  } finally {
    bm.delete();
    contours.delete();
    hierarchie.delete();
  }
  return enRangees(boites, ({ quad }) => {
    const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), largeur: Math.max(...xs) - Math.min(...xs), hauteur: Math.max(...ys) - Math.min(...ys) };
  }).flat();
}

/** Moyenne de la carte à l'intérieur d'un quadrilatère. */
function moyenneDans(cv: CV, carte: Float32Array, h: number, w: number, q: Quad): number {
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)));
  if (x1 < x0 || y1 < y0) return 0;
  const lw = x1 - x0 + 1;
  const m = cv.Mat.zeros(y1 - y0 + 1, lw, cv.CV_8UC1);
  const poly = cv.matFromArray(4, 1, cv.CV_32SC2, q.flatMap((p) => [Math.round(p[0] - x0), Math.round(p[1] - y0)]));
  const polys = new cv.MatVector();
  polys.push_back(poly);
  try {
    cv.fillPoly(m, polys, new cv.Scalar(1));
    const d = m.data as Uint8Array;
    let s = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (d[(y - y0) * lw + (x - x0)]) { s += carte[y * w + x]; n++; }
    }
    return n ? s / n : 0;
  } finally {
    m.delete();
    poly.delete();
    polys.delete();
  }
}
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/reperage.test.ts` — Expected : PASS. Si le test d'ordre échoue parce que deux boîtes de la première rangée sont mal groupées, vérifier `enRangees` (centres à moins d'une demi-hauteur).

- [ ] **Step 5 : commit**

```bash
git add src/lecture/reperage.ts tests/reperage.test.ts
git commit -m "Lecture : repérage des lignes (carte de probabilité → boîtes)"
```

---

### Task 4 : Découpe et préparation d'une ligne

**Files:**
- Create: `src/lecture/ligne.ts`
- Test: `tests/ligne.test.ts`

**Interfaces:**
- Consumes : `Quad` (Task 1).
- Produces : `HAUTEUR_LIGNE = 48` ; `decouperLigne(cv, src /* Mat RGBA */, q: Quad): Mat` (l'appelant libère la Mat) ; `preparerLigne(cv, ligne /* Mat RGBA */): { donnees: Float32Array; largeur: number }`.

- [ ] **Step 1 : écrire les tests**

`tests/ligne.test.ts` :

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { decouperLigne, HAUTEUR_LIGNE, preparerLigne } from '../src/lecture/ligne';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { imageUnie } from './aides/images';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

describe('découpe d\'une ligne', () => {
  it('une boîte droite donne une découpe de sa taille', () => {
    const src = cv.matFromImageData(imageUnie(200, 100, 255));
    const m = decouperLigne(cv, src, [[20, 30], [120, 30], [120, 50], [20, 50]]);
    expect([m.cols, m.rows]).toEqual([100, 20]);
    m.delete(); src.delete();
  });
  it('une découpe bien plus haute que large est couchée', () => {
    const src = cv.matFromImageData(imageUnie(200, 100, 255));
    const m = decouperLigne(cv, src, [[10, 10], [30, 10], [30, 90], [10, 90]]);
    expect([m.cols, m.rows]).toEqual([80, 20]);
    m.delete(); src.delete();
  });
});

describe('entrée de la lecture', () => {
  it('hauteur 48, largeur au moins 320, blanc → 1, complément à 0', () => {
    const ligne = cv.matFromImageData(imageUnie(100, 20, 255));
    const { donnees, largeur } = preparerLigne(cv, ligne);
    expect(largeur).toBe(320);
    expect(donnees).toHaveLength(3 * HAUTEUR_LIGNE * 320);
    expect(donnees[0]).toBeCloseTo(1);
    expect(donnees[239]).toBeCloseTo(1); // 48 × 100 / 20 = 240 colonnes utiles
    expect(donnees[240]).toBe(0);
    ligne.delete();
  });
  it('une longue ligne garde ses proportions', () => {
    const ligne = cv.matFromImageData(imageUnie(1000, 20, 0));
    const { largeur, donnees } = preparerLigne(cv, ligne);
    expect(largeur).toBe(2400);
    expect(donnees[0]).toBeCloseTo(-1);
    ligne.delete();
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/ligne.test.ts` — Expected : FAIL.

- [ ] **Step 3 : écrire le code**

`src/lecture/ligne.ts` :

```ts
import type { CV } from '../traitement/opencv';
import type { Quad } from './modele';

export const HAUTEUR_LIGNE = 48;
const LARGEUR_MIN = 320;
const LARGEUR_MAX = 3200;

const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Découpe redressée d'une ligne dans l'image (RGBA). Une découpe bien plus haute que large est couchée : on la tourne. */
export function decouperLigne(cv: CV, src: CV, q: Quad): CV {
  const l = Math.max(1, Math.floor(Math.max(distance(q[0], q[1]), distance(q[3], q[2]))));
  const h = Math.max(1, Math.floor(Math.max(distance(q[0], q[3]), distance(q[1], q[2]))));
  const de = cv.matFromArray(4, 1, cv.CV_32FC2, q.flat());
  const vers = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, l, 0, l, h, 0, h]);
  const M = cv.getPerspectiveTransform(de, vers);
  const sortie = new cv.Mat();
  try {
    cv.warpPerspective(src, sortie, M, new cv.Size(l, h), cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
  } finally {
    de.delete();
    vers.delete();
    M.delete();
  }
  if (sortie.rows / sortie.cols < 1.5) return sortie;
  const couchee = new cv.Mat();
  cv.rotate(sortie, couchee, cv.ROTATE_90_COUNTERCLOCKWISE);
  sortie.delete();
  return couchee;
}

/**
 * Entrée du lecteur : hauteur 48, largeur proportionnelle (au moins 320, complétée de zéros comme
 * dans PaddleOCR), ordre BGR ramené de [0, 255] à [−1, 1].
 */
export function preparerLigne(cv: CV, ligne: CV): { donnees: Float32Array; largeur: number } {
  const voulue = Math.ceil((HAUTEUR_LIGNE * ligne.cols) / Math.max(1, ligne.rows));
  const largeur = Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, voulue));
  const utile = Math.max(1, Math.min(largeur, voulue));
  const r = new cv.Mat();
  try {
    cv.resize(ligne, r, new cv.Size(utile, HAUTEUR_LIGNE), 0, 0, cv.INTER_LINEAR);
    const d = r.data as Uint8Array;
    const plan = HAUTEUR_LIGNE * largeur;
    const donnees = new Float32Array(3 * plan);
    for (let y = 0; y < HAUTEUR_LIGNE; y++) {
      for (let x = 0; x < utile; x++) {
        const i = (y * utile + x) * 4;
        const j = y * largeur + x;
        donnees[j] = d[i + 2] / 127.5 - 1;
        donnees[plan + j] = d[i + 1] / 127.5 - 1;
        donnees[2 * plan + j] = d[i] / 127.5 - 1;
      }
    }
    return { donnees, largeur };
  } finally {
    r.delete();
  }
}
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/ligne.test.ts` — Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/lecture/ligne.ts tests/ligne.test.ts
git commit -m "Lecture : découpe redressée et préparation d'une ligne"
```

---

### Task 5 : Le Lecteur (sessions, sens de la page, lecture des lignes)

**Files:**
- Create: `src/lecture/lecteur.ts`
- Test: `tests/lecteur.test.ts`

**Interfaces:**
- Consumes : `preparerReperage`, `boitesDepuisCarte`, `BoiteReperee` (Task 3) ; `decouperLigne`, `preparerLigne`, `HAUTEUR_LIGNE` (Task 4) ; `decoderCTC` (Task 1) ; `Quad`, `Rect`, `Sens`.
- Produces : `interface SessionOnnx` ; `interface LigneBrute { rect: Rect; texte: string; confiance: number }` ; `interface PageBrute { sens: Sens; img: Img; lignes: LigneBrute[] }` ; `tournerImg(cv, img: Img, sens: Sens): Img` ; `rectDe(q: Quad): Rect` ; `pageCouchee(b: BoiteReperee[]): boolean` ; `class Lecteur { static creer(ort, reperage: Uint8Array, lecture: Uint8Array, dict: string[]): Promise<Lecteur>; lire(cv, img: Img): Promise<PageBrute>; liberer(): Promise<void> }`.

- [ ] **Step 1 : écrire les tests**

`tests/lecteur.test.ts` :

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { Lecteur, pageCouchee, rectDe, tournerImg, type SessionOnnx } from '../src/lecture/lecteur';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { imageUnie } from './aides/images';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

class Tensor { constructor(public type: string, public data: Float32Array, public dims: number[]) {} }
const ort = { Tensor };

/** Repérage simulé : une bande de texte horizontale si l'image est en largeur, verticale sinon. */
const reperage: SessionOnnx = {
  inputNames: ['x'], outputNames: ['y'],
  async run(e) {
    const [, , h, w] = (e.x as Tensor).dims;
    const carte = new Float32Array(h * w);
    const paysage = w > h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dedans = paysage
        ? y >= h * 0.4 && y < h * 0.6 && x >= w * 0.1 && x < w * 0.9
        : x >= w * 0.4 && x < w * 0.6 && y >= h * 0.1 && y < h * 0.9;
      if (dedans) carte[y * w + x] = 0.95;
    }
    return { y: { data: carte, dims: [1, 1, h, w] } };
  },
};

/** Lecture simulée : « ab » à 0,9 (dictionnaire a, b, espace → 4 classes). */
function lectureSimulee() {
  const s = {
    inputNames: ['x'], outputNames: ['y'], appels: 0,
    async run() {
      s.appels++;
      const p = new Float32Array(3 * 4);
      p[0 * 4 + 1] = 0.9; p[1 * 4 + 0] = 0.9; p[2 * 4 + 2] = 0.9;
      return { y: { data: p, dims: [1, 3, 4] } };
    },
  };
  return s;
}
const dict = ['a', 'b', ' '];

describe('Lecteur', () => {
  it('page droite : lit la ligne, garde le sens', async () => {
    const l = new Lecteur(ort, reperage, lectureSimulee(), dict);
    const r = await l.lire(cv, imageUnie(256, 128, 255));
    expect(r.sens).toBe(0);
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0]).toMatchObject({ texte: 'ab' });
    expect(r.lignes[0].confiance).toBeCloseTo(0.9);
    expect([r.img.width, r.img.height]).toEqual([256, 128]);
  });

  it('page couchée : essaie les deux quarts de tour et garde le meilleur', async () => {
    const l = new Lecteur(ort, reperage, lectureSimulee(), dict);
    const r = await l.lire(cv, imageUnie(128, 256, 255));
    expect(r.sens).toBe(90);
    expect([r.img.width, r.img.height]).toEqual([256, 128]);
    expect(r.lignes.map((x) => x.texte)).toEqual(['ab']);
  });

  it('deux lectures demandées en même temps passent l\'une après l\'autre', async () => {
    const l = new Lecteur(ort, reperage, lectureSimulee(), dict);
    const [a, b] = await Promise.all([l.lire(cv, imageUnie(256, 128, 255)), l.lire(cv, imageUnie(256, 128, 255))]);
    expect(a.lignes).toHaveLength(1);
    expect(b.lignes).toHaveLength(1);
  });
});

describe('outils du lecteur', () => {
  it('tourne une image d\'un quart de tour vers la droite ou la gauche', () => {
    const img = imageUnie(4, 2, 0);
    img.data.set([255, 0, 0, 255], 0); // pixel rouge en haut à gauche
    const droite = tournerImg(cv, img, 90);
    expect([droite.width, droite.height]).toEqual([2, 4]);
    expect(Array.from(droite.data.slice(4, 8))).toEqual([255, 0, 0, 255]); // en haut à droite
    const gauche = tournerImg(cv, img, 270);
    expect(Array.from(gauche.data.slice((3 * 2) * 4, (3 * 2) * 4 + 4))).toEqual([255, 0, 0, 255]); // en bas à gauche
  });

  it('rectangle englobant et page couchée', () => {
    expect(rectDe([[10, 5], [50, 7], [49, 20], [9, 18]])).toEqual({ x: 9, y: 5, largeur: 41, hauteur: 15 });
    const haute = { quad: [[0, 0], [10, 0], [10, 80], [0, 80]] as const, score: 1 };
    const large = { quad: [[0, 0], [80, 0], [80, 10], [0, 10]] as const, score: 1 };
    expect(pageCouchee([haute, haute, large] as never)).toBe(true);
    expect(pageCouchee([haute, large, large] as never)).toBe(false);
    expect(pageCouchee([])).toBe(false);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/lecteur.test.ts` — Expected : FAIL.

- [ ] **Step 3 : écrire le code**

`src/lecture/lecteur.ts` :

```ts
import type { CV } from '../traitement/opencv';
import type { Img } from '../traitement/types';
import { decoderCTC } from './ctc';
import { decouperLigne, HAUTEUR_LIGNE, preparerLigne } from './ligne';
import type { Quad, Rect, Sens } from './modele';
import { boitesDepuisCarte, preparerReperage, type BoiteReperee } from './reperage';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Le moteur onnxruntime (version web dans l'appli, simulée dans les tests). */
type Ort = any;

/** Ce qu'il faut d'une session onnxruntime. */
export interface SessionOnnx {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(entrees: Record<string, unknown>): Promise<Record<string, { data: unknown; dims: readonly number[] }>>;
  release?(): Promise<void>;
}

export interface LigneBrute { rect: Rect; texte: string; confiance: number }
export interface PageBrute { sens: Sens; img: Img; lignes: LigneBrute[] }

/** Lignes lues (les plus nettes) pour choisir le sens d'une page couchée. */
const ECHANTILLON_SENS = 12;

/** Tourne une image d'un quart de tour : 90 vers la droite, 270 vers la gauche. */
export function tournerImg(cv: CV, img: Img, sens: Sens): Img {
  if (sens === 0) return img;
  const src = cv.matFromImageData(img);
  const dst = new cv.Mat();
  try {
    cv.rotate(src, dst, sens === 90 ? cv.ROTATE_90_CLOCKWISE : cv.ROTATE_90_COUNTERCLOCKWISE);
    return { data: new Uint8ClampedArray(dst.data), width: dst.cols, height: dst.rows };
  } finally {
    src.delete();
    dst.delete();
  }
}

export function rectDe(q: Quad): Rect {
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, largeur: Math.max(...xs) - x, hauteur: Math.max(...ys) - y };
}

/** La plupart des boîtes sont bien plus hautes que larges : la page est couchée. */
export function pageCouchee(boites: BoiteReperee[]): boolean {
  const hautes = boites.filter(({ quad: q }) =>
    Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]) > 1.5 * Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1])).length;
  return boites.length > 0 && hautes > boites.length / 2;
}

/** Le lecteur de texte : repérage des lignes puis lecture de chacune. Une page à la fois. */
export class Lecteur {
  private file: Promise<unknown> = Promise.resolve();

  constructor(private ort: Ort, private reperage: SessionOnnx, private lecture: SessionOnnx, private dict: string[]) {}

  static async creer(ort: Ort, reperage: Uint8Array, lecture: Uint8Array, dict: string[]): Promise<Lecteur> {
    const options = { executionProviders: ['wasm'] };
    const r = await ort.InferenceSession.create(reperage, options);
    const l = await ort.InferenceSession.create(lecture, options);
    return new Lecteur(ort, r, l, dict);
  }

  async liberer(): Promise<void> {
    await this.reperage.release?.();
    await this.lecture.release?.();
  }

  /** Lit une page : la remet d'aplomb si elle est couchée, puis lit chaque ligne. */
  lire(cv: CV, img: Img): Promise<PageBrute> {
    const tache = this.file.then(() => this.lireMaintenant(cv, img));
    this.file = tache.catch(() => undefined);
    return tache;
  }

  private async lireMaintenant(cv: CV, img: Img): Promise<PageBrute> {
    let page = img;
    let sens: Sens = 0;
    let boites = await this.reperer(cv, img);
    if (pageCouchee(boites)) {
      let meilleure = -1;
      for (const s of [90, 270] as const) {
        const tournee = tournerImg(cv, img, s);
        const b = await this.reperer(cv, tournee);
        const echantillon = [...b].sort((x, y) => y.score - x.score).slice(0, ECHANTILLON_SENS);
        const lus = await this.lireLignes(cv, tournee, echantillon.map((e) => e.quad));
        const note = lus.reduce((t, l) => t + l.confiance, 0) / Math.max(1, lus.length);
        if (note > meilleure) { meilleure = note; page = tournee; sens = s; boites = b; }
      }
    }
    const lus = await this.lireLignes(cv, page, boites.map((b) => b.quad));
    const lignes = boites.map((b, k) => ({ rect: rectDe(b.quad), ...lus[k] })).filter((l) => l.texte);
    return { sens, img: page, lignes };
  }

  private async reperer(cv: CV, img: Img): Promise<BoiteReperee[]> {
    const { donnees, largeur, hauteur } = preparerReperage(cv, img);
    const entree = new this.ort.Tensor('float32', donnees, [1, 3, hauteur, largeur]);
    const sorties = await this.reperage.run({ [this.reperage.inputNames[0]]: entree });
    const carte = sorties[this.reperage.outputNames[0]];
    const [h, w] = carte.dims.slice(-2);
    return boitesDepuisCarte(cv, carte.data as Float32Array, h, w, img.width, img.height);
  }

  private async lireLignes(cv: CV, img: Img, quads: Quad[]): Promise<{ texte: string; confiance: number }[]> {
    const src = cv.matFromImageData(img);
    try {
      const lus: { texte: string; confiance: number }[] = [];
      for (const q of quads) {
        const ligne = decouperLigne(cv, src, q);
        let entree: { donnees: Float32Array; largeur: number };
        try {
          entree = preparerLigne(cv, ligne);
        } finally {
          ligne.delete();
        }
        const tenseur = new this.ort.Tensor('float32', entree.donnees, [1, 3, HAUTEUR_LIGNE, entree.largeur]);
        const sorties = await this.lecture.run({ [this.lecture.inputNames[0]]: tenseur });
        const p = sorties[this.lecture.outputNames[0]];
        lus.push(decoderCTC(p.data as Float32Array, p.dims[1], p.dims[2], this.dict));
      }
      return lus;
    } finally {
      src.delete();
    }
  }
}
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/lecteur.test.ts` puis `npx tsc --noEmit` — Expected : PASS. (Le test « tourne une image » fixe le sens : 90 = `ROTATE_90_CLOCKWISE`, ce qui doit correspondre au dessin de l'écran à la Task 14.)

- [ ] **Step 5 : commit**

```bash
git add src/lecture/lecteur.ts tests/lecteur.test.ts
git commit -m "Lecture : le Lecteur (repérage, sens de la page, lecture des lignes)"
```

---
### Task 6 : Tableaux (cases par les traits)

**Files:**
- Create: `src/lecture/tableau.ts`, `tests/aides/traits.ts`
- Test: `tests/tableau.test.ts`

**Interfaces:**
- Consumes : `Rect`, `LigneLue`, `CaseTableau`, `Tableau`, `ModeLecture` (Task 1) ; `enRangees` (Task 1).
- Produces : `trouverTableau(cv, img: Img): Tableau | null` (cases au texte vide) ; `plusGrandGroupe(rects: Rect[], tol: number): Rect[]` ; `tableauDepuisCases(rects: Rect[], largeurPage: number, hauteurPage: number): Tableau | null` ; `rangerDansTableau(t: Tableau, lignes: LigneLue[]): Tableau` ; `dansLeTableau(t: Tableau, l: LigneLue): boolean` ; `choisirMode(t: Tableau | null): ModeLecture`.

Réglages issus de l'essai sur les pages réelles (reçu SCOOPAB : 5 rangées × 3 colonnes repérées ; cahier Seyès : ~150 petites cases presque vides ; annexe d'audit : cases grises sans traits → pas de tableau) : traits = encre (seuil adaptatif 15/10) épaissie d'1 px puis ouverture par un segment de largeur/40 (horizontal) ou hauteur/40 (vertical) ; cadre de 3 px autour de la page (case coupée par le bord de la photo) ; case = zone vide ≥ 12 px de côté, remplie à ≥ 85 % de son rectangle, pas le fond de la page ; on garde le plus grand groupe de cases qui se touchent (une case à cocher isolée est écartée).

- [ ] **Step 1 : écrire les tests**

`tests/aides/traits.ts` (aussi utilisé à la Task 12) :

```ts
import { versImg } from '../../src/traitement/mats';
import type { CV } from '../../src/traitement/opencv';
import type { Img } from '../../src/traitement/types';

export type Trait = [number, number, number, number];

/** Page blanche avec des traits noirs de 3 px : [x1, y1, x2, y2]. */
export function pageAvecTraits(cv: CV, largeur: number, hauteur: number, traits: Trait[]): Img {
  const m = new cv.Mat(hauteur, largeur, cv.CV_8UC4, new cv.Scalar(255, 255, 255, 255));
  for (const [x1, y1, x2, y2] of traits) cv.line(m, new cv.Point(x1, y1), new cv.Point(x2, y2), new cv.Scalar(0, 0, 0, 255), 3);
  const img = versImg(cv, m);
  m.delete();
  return img;
}

/** Tableau 3 rangées × 2 colonnes (cadre 100–500 × 100–400) dont la première rangée est une case fusionnée. */
export const TABLEAU: Trait[] = [
  [100, 100, 500, 100], [100, 200, 500, 200], [100, 300, 500, 300], [100, 400, 500, 400],
  [100, 100, 100, 400], [500, 100, 500, 400], [300, 200, 300, 400],
];
```

`tests/tableau.test.ts` :

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { LigneLue } from '../src/lecture/modele';
import { choisirMode, dansLeTableau, plusGrandGroupe, rangerDansTableau, trouverTableau } from '../src/lecture/tableau';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import { pageAvecTraits, TABLEAU, type Trait } from './aides/traits';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });
const page = (largeur: number, hauteur: number, traits: Trait[]) => pageAvecTraits(cv, largeur, hauteur, traits);
const ligne = (x: number, y: number, texte: string, confiance = 0.95): LigneLue =>
  ({ rect: { x, y, largeur: 60, hauteur: 20 }, texte, confiance, corrige: false });

describe('trouverTableau', () => {
  it('retrouve les rangées, les colonnes et la case fusionnée', () => {
    const t = trouverTableau(cv, page(600, 500, TABLEAU))!;
    expect(t).not.toBeNull();
    expect([t.rangs, t.cols, t.cases.length]).toEqual([3, 2, 5]);
    expect(t.cases[0]).toMatchObject({ rang: 0, col: 0, rangs: 1, cols: 2 });
    expect(t.cases.slice(1).map((c) => [c.rang, c.col])).toEqual([[1, 0], [1, 1], [2, 0], [2, 1]]);
    expect(t.rect.x).toBeGreaterThan(95);
    expect(t.rect.x + t.rect.largeur).toBeLessThan(505);
  });

  it('écarte une case à cocher isolée', () => {
    const t = trouverTableau(cv, page(600, 500, [...TABLEAU, [540, 20, 570, 20], [540, 50, 570, 50], [540, 20, 540, 50], [570, 20, 570, 50]]))!;
    expect(t.cases).toHaveLength(5);
  });

  it('un tableau coupé par le bord de la photo garde sa première colonne', () => {
    const t = trouverTableau(cv, page(600, 500, [
      [0, 100, 500, 100], [0, 200, 500, 200], [0, 300, 500, 300], [250, 100, 250, 300], [500, 100, 500, 300],
    ]))!;
    expect([t.rangs, t.cols]).toEqual([2, 2]);
  });

  it('une page sans traits n\'a pas de tableau', () => {
    expect(trouverTableau(cv, page(600, 500, []))).toBeNull();
  });
});

describe('rangement et choix du mode', () => {
  it('range chaque ligne dans la case qui contient son centre', () => {
    const t = trouverTableau(cv, page(600, 500, TABLEAU))!;
    const lignes = [ligne(150, 140, 'Titre'), ligne(150, 240, 'Poids'), ligne(350, 240, '252', 0.7), ligne(350, 265, 'kg'), ligne(150, 450, 'Signature')];
    const r = rangerDansTableau(t, lignes);
    expect(r.cases.map((c) => c.texte)).toEqual(['Titre', 'Poids', '252\nkg', '', '']);
    expect(r.cases[2].confiance).toBeCloseTo(0.7);
    expect(r.cases[3].confiance).toBe(1);
    expect(dansLeTableau(r, lignes[4])).toBe(false);
    expect(choisirMode(r)).toBe('tableau');
  });

  it('des carreaux de cahier presque vides restent du texte', () => {
    const carreaux: Trait[] = [];
    for (let x = 25; x <= 575; x += 25) carreaux.push([x, 25, x, 775]);
    for (let y = 25; y <= 775; y += 25) carreaux.push([25, y, 575, y]);
    const t = trouverTableau(cv, page(600, 800, carreaux));
    expect(t).not.toBeNull();
    expect(choisirMode(rangerDansTableau(t!, [ligne(30, 30, 'Audit')]))).toBe('texte');
    expect(choisirMode(null)).toBe('texte');
  });

  it('plus grand groupe : les cases qui se touchent', () => {
    const r = (x: number, y: number) => ({ x, y, largeur: 50, hauteur: 30 });
    expect(plusGrandGroupe([r(0, 0), r(52, 0), r(0, 32), r(300, 300)], 6)).toEqual([r(0, 0), r(52, 0), r(0, 32)]);
    expect(plusGrandGroupe([], 6)).toEqual([]);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/tableau.test.ts` — Expected : FAIL.

- [ ] **Step 3 : écrire le code**

`src/lecture/tableau.ts` :

```ts
import type { CV } from '../traitement/opencv';
import type { Img } from '../traitement/types';
import type { CaseTableau, LigneLue, ModeLecture, Rect, Tableau } from './modele';
import { enRangees } from './ordre';

/** Au-delà, ce sont des carreaux de cahier, pas un tableau. */
const MAX_CASES = 200;
/** Un vrai tableau a au moins 30 % de cases remplies. */
const PART_PLEINE_MIN = 0.3;
const CASES_MIN = 4;
/** Le tableau couvre au moins 3 % de la page. */
const AIRE_MIN = 0.03;
const COTE_CASE_MIN = 12;
const MARGE = 4;
/** Deux bords plus proches que ça sont le même trait (un trait traité fait ~7 px d'épaisseur). */
const tolerance = (largeurPage: number) => Math.max(12, 0.01 * largeurPage);

/** Cases d'un tableau à traits (texte vide), ou null s'il n'y en a pas. */
export function trouverTableau(cv: CV, img: Img): Tableau | null {
  const W = img.width, H = img.height;
  const mats: CV[] = [];
  const garder = <T>(m: T): T => { mats.push(m); return m; };
  try {
    const src = garder(cv.matFromImageData(img));
    const gris = garder(new cv.Mat());
    cv.cvtColor(src, gris, cv.COLOR_RGBA2GRAY);
    const encre = garder(new cv.Mat());
    cv.adaptiveThreshold(gris, encre, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 15, 10);
    const horizontaux = longsTraits(cv, encre, Math.max(20, Math.round(W / 40)), 1, garder);
    const verticaux = longsTraits(cv, encre, 1, Math.max(20, Math.round(H / 40)), garder);
    const grille = garder(new cv.Mat());
    cv.bitwise_or(horizontaux, verticaux, grille);
    const k3 = garder(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
    cv.dilate(grille, grille, k3);
    // cadre autour de la page : une case coupée par le bord de la photo reste fermée
    cv.rectangle(grille, new cv.Point(0, 0), new cv.Point(W - 1, H - 1), new cv.Scalar(255), 3);
    const vide = garder(new cv.Mat());
    cv.bitwise_not(grille, vide);
    const etiquettes = garder(new cv.Mat()), stats = garder(new cv.Mat()), centres = garder(new cv.Mat());
    const n = cv.connectedComponentsWithStats(vide, etiquettes, stats, centres, 4, cv.CV_32S);
    const rects: Rect[] = [];
    for (let k = 1; k < n; k++) {
      const x = stats.intAt(k, 0), y = stats.intAt(k, 1), l = stats.intAt(k, 2), h = stats.intAt(k, 3), aire = stats.intAt(k, 4);
      if (l < COTE_CASE_MIN || h < COTE_CASE_MIN) continue;
      if (l > 0.9 * W && h > 0.9 * H) continue; // le fond de la page
      if (aire < 0.85 * l * h) continue; // pas un rectangle : le fond autour du tableau
      rects.push({ x, y, largeur: l, hauteur: h });
    }
    return tableauDepuisCases(plusGrandGroupe(rects, tolerance(W)), W, H);
  } finally {
    mats.forEach((m) => m.delete());
  }
}

/** Seuls les longs segments (l × h) de l'encre, épaissie d'un pixel pour une photo un peu de travers. */
function longsTraits(cv: CV, encre: CV, l: number, h: number, garder: <T>(m: T) => T): CV {
  const epais = garder(new cv.Mat());
  const sortie = garder(new cv.Mat());
  const k1 = garder(cv.getStructuringElement(cv.MORPH_RECT, l > 1 ? new cv.Size(1, 3) : new cv.Size(3, 1)));
  const k2 = garder(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(l, h)));
  cv.dilate(encre, epais, k1);
  cv.morphologyEx(epais, sortie, cv.MORPH_OPEN, k2);
  return sortie;
}

/** Le plus grand groupe (en surface) de cases qui se touchent, à `tol` pixels près. */
export function plusGrandGroupe(rects: Rect[], tol: number): Rect[] {
  const parent = rects.map((_, i) => i);
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
  const touche = (a: Rect, b: Rect) => a.x - tol <= b.x + b.largeur && b.x - tol <= a.x + a.largeur
    && a.y - tol <= b.y + b.hauteur && b.y - tol <= a.y + a.hauteur;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    if (touche(rects[i], rects[j])) parent[racine(i)] = racine(j);
  }
  const groupes = new Map<number, Rect[]>();
  rects.forEach((r, i) => { const g = racine(i); groupes.set(g, [...(groupes.get(g) ?? []), r]); });
  let meilleur: Rect[] = [];
  let surface = -1;
  for (const g of groupes.values()) {
    const s = g.reduce((t, r) => t + r.largeur * r.hauteur, 0);
    if (s > surface) { surface = s; meilleur = g; }
  }
  return meilleur;
}

/** Valeurs regroupées : des bords à moins de `tol` pixels n'en font qu'un (leur moyenne). */
function bords(valeurs: number[], tol: number): number[] {
  const groupes: number[][] = [];
  for (const v of [...valeurs].sort((a, b) => a - b)) {
    const g = groupes[groupes.length - 1];
    if (g && v - g[g.length - 1] <= tol) g.push(v); else groupes.push([v]);
  }
  return groupes.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
}

const plusProche = (liste: number[], v: number) =>
  liste.reduce((m, x, i) => (Math.abs(x - v) < Math.abs(liste[m] - v) ? i : m), 0);

/** Rangées et colonnes déduites des bords des cases ; une case peut en couvrir plusieurs. */
export function tableauDepuisCases(rects: Rect[], largeurPage: number, hauteurPage: number): Tableau | null {
  if (rects.length < CASES_MIN) return null;
  const tol = tolerance(largeurPage);
  const xs = bords(rects.flatMap((r) => [r.x, r.x + r.largeur]), tol);
  const ys = bords(rects.flatMap((r) => [r.y, r.y + r.hauteur]), tol);
  const cols = xs.length - 1, rangs = ys.length - 1;
  if (cols < 2 || rangs < 2) return null;
  const rect = { x: xs[0], y: ys[0], largeur: xs[cols] - xs[0], hauteur: ys[rangs] - ys[0] };
  if (rect.largeur * rect.hauteur < AIRE_MIN * largeurPage * hauteurPage) return null;
  const cases: CaseTableau[] = rects.map((r) => {
    const col = plusProche(xs, r.x);
    const fin = Math.max(col + 1, plusProche(xs, r.x + r.largeur));
    const rang = plusProche(ys, r.y);
    const bas = Math.max(rang + 1, plusProche(ys, r.y + r.hauteur));
    return { rang, col, rangs: bas - rang, cols: fin - col, rect: r, texte: '', confiance: 1, corrige: false };
  });
  cases.sort((a, b) => a.rang - b.rang || a.col - b.col);
  return { rect, rangs, cols, cases };
}

const centre = (l: LigneLue) => ({ x: l.rect.x + l.rect.largeur / 2, y: l.rect.y + l.rect.hauteur / 2 });
const contient = (r: Rect, p: { x: number; y: number }) =>
  p.x >= r.x - MARGE && p.x <= r.x + r.largeur + MARGE && p.y >= r.y - MARGE && p.y <= r.y + r.hauteur + MARGE;

/** La ligne est-elle dans le cadre du tableau ? */
export function dansLeTableau(t: Tableau, l: LigneLue): boolean {
  return contient(t.rect, centre(l));
}

/** Range chaque ligne dans la case qui contient son centre (plusieurs lignes : une par rangée). */
export function rangerDansTableau(t: Tableau, lignes: LigneLue[]): Tableau {
  const parCase = t.cases.map(() => [] as LigneLue[]);
  for (const l of lignes) {
    const k = t.cases.findIndex((c) => contient(c.rect, centre(l)));
    if (k >= 0) parCase[k].push(l);
  }
  return {
    ...t,
    cases: t.cases.map((c, k) => {
      const ls = parCase[k];
      const texte = enRangees(ls, (l) => l.rect).map((r) => r.map((l) => l.texte).join(' ')).join('\n');
      return { ...c, texte, confiance: ls.length ? Math.min(...ls.map((l) => l.confiance)) : 1 };
    }),
  };
}

/** Tableau si assez de cases sont remplies ; sinon (carreaux de cahier, pas de traits) : texte. */
export function choisirMode(t: Tableau | null): ModeLecture {
  if (!t || t.cases.length > MAX_CASES) return 'texte';
  const pleines = t.cases.filter((c) => c.texte.trim()).length;
  return pleines >= PART_PLEINE_MIN * t.cases.length ? 'tableau' : 'texte';
}
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/tableau.test.ts` — Expected : PASS. Si une case fusionnée est coupée en deux colonnes, vérifier `tolerance` : les deux bords d'un même trait (épaissi puis dilaté) sont à ~8 px l'un de l'autre.

- [ ] **Step 5 : commit**

```bash
git add src/lecture/tableau.ts tests/aides/traits.ts tests/tableau.test.ts
git commit -m "Lecture : tableaux repérés par les traits, rangement des lignes, choix Texte / Tableau"
```

---

### Task 7 : Contenu d'une page (blocs et texte)

**Files:**
- Create: `src/lecture/contenu.ts`
- Test: `tests/contenu.test.ts`

**Interfaces:**
- Consumes : `LecturePage`, `LigneLue`, `CaseTableau` (Task 1) ; `enRangees` (Task 1) ; `dansLeTableau` (Task 6).
- Produces : `type CaseBloc = Pick<CaseTableau, 'rang' | 'col' | 'rangs' | 'cols' | 'texte'>` ; `type Bloc = { type: 'paragraphe'; texte: string } | { type: 'tableau'; rangs: number; cols: number; cases: CaseBloc[] }` ; `paragraphes(lignes: LigneLue[]): string[]` ; `lignesHorsTableau(l: LecturePage): { avant: number[]; apres: number[] }` (indices dans `l.lignes`) ; `blocsDePage(l: LecturePage): Bloc[]` ; `texteDeBlocs(blocs: Bloc[]): string` ; `texteDuDocument(pages: Bloc[][]): string`.

- [ ] **Step 1 : écrire les tests**

`tests/contenu.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { blocsDePage, lignesHorsTableau, paragraphes, texteDeBlocs, texteDuDocument } from '../src/lecture/contenu';
import type { LecturePage, LigneLue, Tableau } from '../src/lecture/modele';

const ligne = (x: number, y: number, texte: string): LigneLue =>
  ({ rect: { x, y, largeur: 80, hauteur: 20 }, texte, confiance: 0.95, corrige: false });

const tableau: Tableau = {
  rect: { x: 100, y: 100, largeur: 400, hauteur: 200 }, rangs: 2, cols: 2,
  cases: [
    { rang: 0, col: 0, rangs: 1, cols: 2, rect: { x: 100, y: 100, largeur: 400, hauteur: 100 }, texte: 'Reçu', confiance: 1, corrige: false },
    { rang: 1, col: 0, rangs: 1, cols: 1, rect: { x: 100, y: 200, largeur: 200, hauteur: 100 }, texte: 'Poids', confiance: 1, corrige: false },
    { rang: 1, col: 1, rangs: 1, cols: 1, rect: { x: 300, y: 200, largeur: 200, hauteur: 100 }, texte: '252\nkg', confiance: 1, corrige: true },
  ],
};

function lecture(mode: LecturePage['mode']): LecturePage {
  return {
    pageId: 'p', documentId: 'd', empreinte: 'e', sens: 0, largeur: 600, hauteur: 500, mode, lu: 0, tableau,
    lignes: [ligne(10, 20, 'SCOOPAB'), ligne(300, 22, 'N° 1813'), ligne(150, 140, 'Reçu'), ligne(150, 240, 'Poids'), ligne(10, 400, 'Signature')],
  };
}

describe('contenu d\'une page', () => {
  it('paragraphes : une rangée par paragraphe, éléments séparés par une tabulation', () => {
    expect(paragraphes([ligne(300, 22, 'N° 1813'), ligne(10, 20, 'SCOOPAB'), ligne(10, 80, 'Bouda')])).toEqual(['SCOOPAB\tN° 1813', 'Bouda']);
  });

  it('mode Texte : toutes les lignes en paragraphes', () => {
    expect(blocsDePage(lecture('texte')).map((b) => b.type === 'paragraphe' && b.texte))
      .toEqual(['SCOOPAB\tN° 1813', 'Reçu', 'Poids', 'Signature']);
  });

  it('mode Tableau : le texte au-dessus, le tableau (cases corrigées), le texte au-dessous', () => {
    const blocs = blocsDePage(lecture('tableau'));
    expect(blocs.map((b) => b.type)).toEqual(['paragraphe', 'tableau', 'paragraphe']);
    expect(blocs[1]).toMatchObject({ rangs: 2, cols: 2 });
    expect(lignesHorsTableau(lecture('tableau'))).toEqual({ avant: [0, 1], apres: [4] });
    expect(texteDeBlocs(blocs)).toBe('SCOOPAB\tN° 1813\nReçu\nPoids\t252 kg\nSignature');
  });

  it('texte du document : pages séparées par une ligne vide, pages vides ignorées', () => {
    expect(texteDuDocument([[{ type: 'paragraphe', texte: 'A' }], [], [{ type: 'paragraphe', texte: 'B' }]])).toBe('A\n\nB');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/contenu.test.ts` — Expected : FAIL.

- [ ] **Step 3 : écrire le code**

`src/lecture/contenu.ts` :

```ts
import type { CaseTableau, LecturePage, LigneLue } from './modele';
import { enRangees } from './ordre';
import { dansLeTableau } from './tableau';

export type CaseBloc = Pick<CaseTableau, 'rang' | 'col' | 'rangs' | 'cols' | 'texte'>;
/** Ce que contient une page, dans l'ordre : de quoi fabriquer Word, Excel ou du texte. */
export type Bloc =
  | { type: 'paragraphe'; texte: string }
  | { type: 'tableau'; rangs: number; cols: number; cases: CaseBloc[] };

/** Une rangée visuelle = un paragraphe ; les morceaux d'une même rangée sont séparés par une tabulation. */
export function paragraphes(lignes: LigneLue[]): string[] {
  return enRangees(lignes, (l) => l.rect).map((r) => r.map((l) => l.texte).join('\t')).filter((t) => t.trim());
}

/** Lignes hors du tableau (indices dans `l.lignes`) : au-dessus de son milieu, ou au-dessous. */
export function lignesHorsTableau(l: LecturePage): { avant: number[]; apres: number[] } {
  if (!l.tableau) return { avant: l.lignes.map((_, k) => k), apres: [] };
  const t = l.tableau;
  const milieu = t.rect.y + t.rect.hauteur / 2;
  const hors = l.lignes.map((_, k) => k).filter((k) => !dansLeTableau(t, l.lignes[k]));
  const centreY = (k: number) => l.lignes[k].rect.y + l.lignes[k].rect.hauteur / 2;
  return { avant: hors.filter((k) => centreY(k) < milieu), apres: hors.filter((k) => centreY(k) >= milieu) };
}

export function blocsDePage(l: LecturePage): Bloc[] {
  const enParagraphes = (indices: number[]): Bloc[] =>
    paragraphes(indices.map((k) => l.lignes[k])).map((texte) => ({ type: 'paragraphe', texte }));
  if (l.mode !== 'tableau' || !l.tableau) return enParagraphes(l.lignes.map((_, k) => k));
  const { avant, apres } = lignesHorsTableau(l);
  const t = l.tableau;
  return [
    ...enParagraphes(avant),
    { type: 'tableau', rangs: t.rangs, cols: t.cols, cases: t.cases.map(({ rang, col, rangs, cols, texte }) => ({ rang, col, rangs, cols, texte })) },
    ...enParagraphes(apres),
  ];
}

/** Un tableau en texte : une rangée par ligne, cases séparées par une tabulation. */
function rangeesDuTableau(b: Extract<Bloc, { type: 'tableau' }>): string[] {
  const rangees: string[] = [];
  for (let r = 0; r < b.rangs; r++) {
    const cases = b.cases.filter((c) => c.rang === r).sort((a, c) => a.col - c.col);
    if (cases.length) rangees.push(cases.map((c) => c.texte.replace(/\n/g, ' ')).join('\t'));
  }
  return rangees;
}

export function texteDeBlocs(blocs: Bloc[]): string {
  return blocs.map((b) => (b.type === 'paragraphe' ? b.texte : rangeesDuTableau(b).join('\n'))).join('\n');
}

export function texteDuDocument(pages: Bloc[][]): string {
  return pages.map(texteDeBlocs).filter((t) => t.trim()).join('\n\n');
}
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/contenu.test.ts` — Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/lecture/contenu.ts tests/contenu.test.ts
git commit -m "Lecture : contenu d'une page (paragraphes, tableau) et texte du document"
```

---

### Task 8 : Fichier Word (.docx)

**Files:**
- Create: `src/export/ooxml.ts`, `src/export/docx.ts`
- Test: `tests/docx.test.ts`

**Interfaces:**
- Consumes : `Bloc` (Task 7) ; `fflate`.
- Produces : `xml(texte: string): string` ; `archiver(fichiers: Record<string, string>): Uint8Array` ; `TYPE_DOCX` ; `fabriquerDocx(pages: Bloc[][], titre: string): Uint8Array`.

- [ ] **Step 1 : écrire les tests**

`tests/docx.test.ts` :

```ts
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { fabriquerDocx } from '../src/export/docx';
import { xml } from '../src/export/ooxml';
import type { Bloc } from '../src/lecture/contenu';

const lire = (octets: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(octets)).map(([k, v]) => [k, strFromU8(v)]));

describe('xml', () => {
  it('échappe les caractères spéciaux et retire les caractères de contrôle', () => {
    expect(xml('A & B < C > "D"\u0007')).toBe('A &amp; B &lt; C &gt; &quot;D&quot;');
  });
});

describe('Word', () => {
  const pages: Bloc[][] = [
    [{ type: 'paragraphe', texte: 'Reçu & facture' }, { type: 'paragraphe', texte: 'Date\t21-07-2026' }],
    [
      { type: 'tableau', rangs: 3, cols: 2, cases: [
        { rang: 0, col: 0, rangs: 1, cols: 2, texte: 'RUBRIQUE' },
        { rang: 1, col: 0, rangs: 2, cols: 1, texte: 'Poids\nnet' },
        { rang: 1, col: 1, rangs: 1, cols: 1, texte: '252' },
      ] },
    ],
  ];
  const f = lire(fabriquerDocx(pages, 'Reçu Bouda'));
  const doc = f['word/document.xml'];

  it('contient les parties d\'un document Word', () => {
    for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml']) {
      expect(f[p], p).toBeDefined();
      expect(f[p].startsWith('<?xml')).toBe(true);
    }
    expect(f['docProps/core.xml']).toContain('<dc:title>Reçu Bouda</dc:title>');
  });

  it('paragraphes : texte échappé, tabulations et saut de page entre les pages', () => {
    expect(doc).toContain('<w:t xml:space="preserve">Reçu &amp; facture</w:t>');
    expect(doc).toContain('<w:t xml:space="preserve">Date</w:t><w:tab/><w:t xml:space="preserve">21-07-2026</w:t>');
    expect(doc.match(/<w:br w:type="page"\/>/g)).toHaveLength(1);
  });

  it('tableau : cases fusionnées en largeur et en hauteur, case vide comblée', () => {
    expect(doc).toContain('<w:gridSpan w:val="2"/>');
    expect(doc).toContain('<w:vMerge w:val="restart"/>');
    expect(doc).toContain('<w:tcPr><w:vMerge/></w:tcPr>');
    expect(doc).toContain('<w:tc><w:tcPr/><w:p/></w:tc>'); // rangée 3, colonne 2 : aucune case
    expect(doc.match(/<w:tr>/g)).toHaveLength(3);
    expect(doc).toContain('<w:t xml:space="preserve">Poids</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">net</w:t>');
  });

  it('un document sans page reste un Word valide', () => {
    expect(lire(fabriquerDocx([], 'Vide'))['word/document.xml']).toContain('<w:sectPr>');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/docx.test.ts` — Expected : FAIL.

- [ ] **Step 3 : écrire le code**

`src/export/ooxml.ts` :

```ts
import { strToU8, zipSync } from 'fflate';

/** Texte sûr dans du XML : caractères spéciaux échappés, caractères de contrôle retirés. */
export function xml(texte: string): string {
  return texte
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ENTETE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Fichier Office : des parties XML rangées dans un zip. */
export function archiver(fichiers: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(fichiers).map(([chemin, contenu]) => [chemin, strToU8(ENTETE + contenu)])), { level: 6 });
}

export const NS_RELATIONS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const NS_PAQUET = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const NS_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
```

`src/export/docx.ts` :

```ts
import type { Bloc } from '../lecture/contenu';
import { archiver, NS_PAQUET, NS_RELATIONS, NS_TYPES, xml } from './ooxml';

export const TYPE_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Texte d'un paragraphe : retours à la ligne et tabulations gardés. */
function morceaux(texte: string): string {
  return texte.split('\n').map((ligne, i) => (i ? '<w:br/>' : '')
    + ligne.split('\t').map((m, j) => (j ? '<w:tab/>' : '') + (m ? `<w:t xml:space="preserve">${xml(m)}</w:t>` : '')).join('')).join('');
}

const paragraphe = (texte: string) => `<w:p><w:r>${morceaux(texte)}</w:r></w:p>`;
const SAUT_DE_PAGE = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const BORDURES = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
  .map((c) => `<w:${c} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`).join('');

function tableau(b: Extract<Bloc, { type: 'tableau' }>): string {
  // quelle case couvre chaque emplacement de la grille
  const couverture: (number | undefined)[][] = Array.from({ length: b.rangs }, () => Array<number | undefined>(b.cols).fill(undefined));
  b.cases.forEach((c, k) => {
    for (let r = c.rang; r < Math.min(b.rangs, c.rang + c.rangs); r++) {
      for (let col = c.col; col < Math.min(b.cols, c.col + c.cols); col++) {
        if (couverture[r][col] === undefined) couverture[r][col] = k;
      }
    }
  });
  let rangees = '';
  for (let r = 0; r < b.rangs; r++) {
    let cellules = '';
    for (let col = 0; col < b.cols;) {
      const k = couverture[r][col];
      if (k === undefined) { cellules += '<w:tc><w:tcPr/><w:p/></w:tc>'; col++; continue; }
      const c = b.cases[k];
      const largeur = Math.max(1, Math.min(c.cols - (col - c.col), b.cols - col));
      const span = largeur > 1 ? `<w:gridSpan w:val="${largeur}"/>` : '';
      const fusion = c.rangs > 1 ? (c.rang === r ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>') : '';
      const contenu = c.rang === r ? c.texte.split('\n').map(paragraphe).join('') : '<w:p/>';
      cellules += `<w:tc><w:tcPr>${span}${fusion}</w:tcPr>${contenu}</w:tc>`;
      col += largeur;
    }
    rangees += `<w:tr>${cellules}</w:tr>`;
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${BORDURES}</w:tblBorders></w:tblPr>`
    + `<w:tblGrid>${'<w:gridCol/>'.repeat(b.cols)}</w:tblGrid>${rangees}</w:tbl><w:p/>`;
}

/** Un fichier Word pour tout le document : une page scannée = une page Word. */
export function fabriquerDocx(pages: Bloc[][], titre: string): Uint8Array {
  const corps = pages.map((blocs) => blocs.map((b) => (b.type === 'paragraphe' ? paragraphe(b.texte) : tableau(b))).join('')).join(SAUT_DE_PAGE);
  return archiver({
    '[Content_Types].xml': `<Types xmlns="${NS_TYPES}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `<Relationships xmlns="${NS_PAQUET}"><Relationship Id="rId1" Type="${NS_RELATIONS}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'docProps/core.xml': `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(titre)}</dc:title><dc:creator>FOF Scan</dc:creator></cp:coreProperties>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${NS_PAQUET}"><Relationship Id="rId1" Type="${NS_RELATIONS}/styles" Target="styles.xml"/></Relationships>`,
    'word/styles.xml': `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`,
    'word/document.xml': `<w:document xmlns:w="${W}" xmlns:r="${NS_RELATIONS}"><w:body>${corps}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  });
}
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/docx.test.ts` — Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/export/ooxml.ts src/export/docx.ts tests/docx.test.ts
git commit -m "Export : fichier Word (paragraphes, tableaux avec cases fusionnées)"
```

---

### Task 9 : Fichier Excel (.xlsx)

**Files:**
- Create: `src/export/xlsx.ts`
- Test: `tests/xlsx.test.ts`

**Interfaces:**
- Consumes : `Bloc` (Task 7) ; `archiver`, `xml`, `NS_*` (Task 8).
- Produces : `TYPE_XLSX` ; `colonne(i: number): string` ; `fabriquerXlsx(pages: Bloc[][]): Uint8Array`.

- [ ] **Step 1 : écrire les tests**

`tests/xlsx.test.ts` :

```ts
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { colonne, fabriquerXlsx } from '../src/export/xlsx';
import type { Bloc } from '../src/lecture/contenu';

const lire = (octets: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(octets)).map(([k, v]) => [k, strFromU8(v)]));

describe('Excel', () => {
  it('lettres de colonne', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(colonne)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });

  const pages: Bloc[][] = [
    [
      { type: 'paragraphe', texte: 'SCOOPAB\tN° 1813' },
      { type: 'tableau', rangs: 2, cols: 2, cases: [
        { rang: 0, col: 0, rangs: 1, cols: 2, texte: 'RUBRIQUE & VALEUR' },
        { rang: 1, col: 0, rangs: 1, cols: 1, texte: 'Poids net (Kg)' },
        { rang: 1, col: 1, rangs: 1, cols: 1, texte: '07 48 57 82 12' },
      ] },
      { type: 'paragraphe', texte: 'Signature' },
    ],
    [{ type: 'paragraphe', texte: 'Page deux' }],
  ];
  const f = lire(fabriquerXlsx(pages));

  it('un onglet par page', () => {
    expect(f['xl/workbook.xml']).toContain('<sheet name="Page 1" sheetId="1" r:id="rId1"/>');
    expect(f['xl/workbook.xml']).toContain('<sheet name="Page 2" sheetId="2" r:id="rId2"/>');
    expect(f['xl/worksheets/sheet2.xml']).toContain('>Page deux<');
    expect(f['[Content_Types].xml']).toContain('/xl/worksheets/sheet2.xml');
    expect(f['xl/_rels/workbook.xml.rels']).toContain('Target="styles.xml"');
  });

  it('texte au-dessus, tableau case par case, texte au-dessous ; nombres gardés en texte', () => {
    const s = f['xl/worksheets/sheet1.xml'];
    expect(s).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">SCOOPAB  N° 1813</t></is></c>');
    expect(s).toContain('<c r="A2" t="inlineStr" s="1"><is><t xml:space="preserve">RUBRIQUE &amp; VALEUR</t></is></c>');
    expect(s).toContain('<c r="B3" t="inlineStr" s="1"><is><t xml:space="preserve">07 48 57 82 12</t></is></c>');
    expect(s).toContain('<c r="A4"');
    expect(s).toContain('<mergeCells count="1"><mergeCell ref="A2:B2"/></mergeCells>');
  });

  it('aucune page : un classeur avec un onglet vide', () => {
    const vide = lire(fabriquerXlsx([]));
    expect(vide['xl/worksheets/sheet1.xml']).toContain('<sheetData></sheetData>');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/xlsx.test.ts` — Expected : FAIL.

- [ ] **Step 3 : écrire le code**

`src/export/xlsx.ts` :

```ts
import type { Bloc } from '../lecture/contenu';
import { archiver, NS_PAQUET, NS_RELATIONS, NS_TYPES, xml } from './ooxml';

export const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

/** Lettres de colonne : 0 → A, 25 → Z, 26 → AA. */
export function colonne(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Style 1 : texte qui revient à la ligne, aligné en haut. */
const STYLES = `<styleSheet xmlns="${S}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>`;

/** Une page = un onglet : paragraphes en colonne A, tableau case par case (cases fusionnées gardées). */
function feuille(blocs: Bloc[]): string {
  const cellules = new Map<string, { rang: number; col: number; texte: string }>();
  const poser = (rang: number, col: number, texte: string) => {
    if (!texte) return;
    const cle = `${rang}:${col}`;
    const avant = cellules.get(cle);
    cellules.set(cle, { rang, col, texte: avant ? `${avant.texte}\n${texte}` : texte });
  };
  const fusions: string[] = [];
  let rang = 0;
  let largeur = 1;
  for (const b of blocs) {
    if (b.type === 'paragraphe') { poser(rang, 0, b.texte.replace(/\t/g, '  ')); rang++; continue; }
    for (const c of b.cases) {
      poser(rang + c.rang, c.col, c.texte);
      if (c.rangs > 1 || c.cols > 1) {
        fusions.push(`${colonne(c.col)}${rang + c.rang + 1}:${colonne(c.col + c.cols - 1)}${rang + c.rang + c.rangs}`);
      }
    }
    largeur = Math.max(largeur, b.cols);
    rang += b.rangs;
  }
  const parRang = new Map<number, { col: number; texte: string }[]>();
  for (const c of cellules.values()) parRang.set(c.rang, [...(parRang.get(c.rang) ?? []), c]);
  const lignes = [...parRang.keys()].sort((a, b) => a - b).map((r) => `<row r="${r + 1}">${parRang.get(r)!
    .sort((a, b) => a.col - b.col)
    .map((c) => `<c r="${colonne(c.col)}${r + 1}" t="inlineStr" s="1"><is><t xml:space="preserve">${xml(c.texte)}</t></is></c>`)
    .join('')}</row>`).join('');
  const fus = fusions.length ? `<mergeCells count="${fusions.length}">${fusions.map((f) => `<mergeCell ref="${f}"/>`).join('')}</mergeCells>` : '';
  return `<worksheet xmlns="${S}"><cols><col min="1" max="${largeur}" width="28" customWidth="1"/></cols><sheetData>${lignes}</sheetData>${fus}</worksheet>`;
}

/** Un classeur Excel pour tout le document : un onglet par page. */
export function fabriquerXlsx(pages: Bloc[][]): Uint8Array {
  const feuilles = pages.length ? pages : [[]];
  const n = feuilles.length;
  const fichiers: Record<string, string> = {
    '[Content_Types].xml': `<Types xmlns="${NS_TYPES}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<Relationships xmlns="${NS_PAQUET}"><Relationship Id="rId1" Type="${NS_RELATIONS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${S}" xmlns:r="${NS_RELATIONS}"><sheets>${feuilles.map((_, i) => `<sheet name="Page ${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${NS_PAQUET}">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_RELATIONS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${NS_RELATIONS}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES,
  };
  feuilles.forEach((blocs, i) => { fichiers[`xl/worksheets/sheet${i + 1}.xml`] = feuille(blocs); });
  return archiver(fichiers);
}
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/xlsx.test.ts` — Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/export/xlsx.ts tests/xlsx.test.ts
git commit -m "Export : fichier Excel (un onglet par page, cases fusionnées, nombres en texte)"
```

---
### Task 10 : Mémoire des lectures (IndexedDB version 3) et sauvegarde

**Files:**
- Modify: `src/rangement/depot.ts`, `src/rangement/sauvegarde.ts`, `src/ecrans/Accueil.tsx` (fonctions `sauvegarder` et `restaurer`)
- Create: `tests/aides/lecture.ts`
- Test: `tests/depot.test.ts`, `tests/sauvegarde.test.ts`

**Interfaces:**
- Consumes : `LecturePage` (Task 1).
- Produces : `Depot.lireLectures(documentId: string): Promise<LecturePage[]>` ; `Depot.enregistrerLecture(l: LecturePage): Promise<void>` ; `Depot.toutLire()` rend aussi `lectures` ; `Depot.importer(documents, pages, dossiers = [], lectures: LecturePage[] = [])` ; `creerSauvegarde(documents, pages, dossiers = [], lectures: LecturePage[] = [])` ; `lireSauvegarde()` rend aussi `lectures` (`[]` pour une ancienne sauvegarde).

- [ ] **Step 1 : écrire les tests**

`tests/aides/lecture.ts` :

```ts
import type { LecturePage } from '../../src/lecture/modele';

export function lectureFactice(pageId: string, documentId: string, texte = 'Bonjour'): LecturePage {
  return {
    pageId, documentId, empreinte: 'e', sens: 0, largeur: 100, hauteur: 100, mode: 'texte', lu: 1, tableau: null,
    lignes: [{ rect: { x: 0, y: 0, largeur: 50, hauteur: 10 }, texte, confiance: 0.9, corrige: false }],
  };
}
```

Dans `tests/depot.test.ts`, ajouter l'import `import { lectureFactice } from './aides/lecture';` puis, dans le `describe('Depot', …)`, ces tests :

```ts
  it('lectures : relues par document, remplacées, effacées avec leur page ou leur document', async () => {
    const d = await depotNeuf();
    const doc = await d.creerDocument('Reçus');
    const p1 = await d.ajouterPage(doc.id, pageFactice());
    const p2 = await d.ajouterPage(doc.id, pageFactice());
    await d.enregistrerLecture(lectureFactice(p1.id, doc.id, 'un'));
    await d.enregistrerLecture(lectureFactice(p2.id, doc.id, 'deux'));
    await d.enregistrerLecture(lectureFactice(p2.id, doc.id, 'deux corrigé'));
    const lues = await d.lireLectures(doc.id);
    expect(lues.map((l) => l.lignes[0].texte).sort()).toEqual(['deux corrigé', 'un']);
    await d.supprimerPage(p1.id);
    expect((await d.lireLectures(doc.id)).map((l) => l.pageId)).toEqual([p2.id]);
    await d.supprimerDocument(doc.id);
    expect(await d.lireLectures(doc.id)).toEqual([]);
  });

  it('fusionner emporte les lectures des pages déplacées', async () => {
    const d = await depotNeuf();
    const a = await d.creerDocument('A');
    const b = await d.creerDocument('B');
    const pb = await d.ajouterPage(b.id, pageFactice());
    await d.enregistrerLecture(lectureFactice(pb.id, b.id));
    await d.fusionner([a.id, b.id]);
    expect((await d.lireLectures(a.id)).map((l) => l.pageId)).toEqual([pb.id]);
  });

  it('une mémoire de la version 2 (sans lectures) s\'ouvre sans perte', async () => {
    const nom = `v2-${crypto.randomUUID()}`;
    const ancien = await openDB(nom, 2, {
      upgrade(base) {
        base.createObjectStore('documents', { keyPath: 'id' });
        base.createObjectStore('pages', { keyPath: 'id' }).createIndex('parDocument', 'documentId');
        base.createObjectStore('dossiers', { keyPath: 'id' });
      },
    });
    await ancien.put('documents', { id: 'x', nom: 'Scan v2', cree: 1, modifie: 1, pages: [] });
    ancien.close();
    const d = await ouvrirDepot(nom);
    expect((await d.listerDocuments()).map((x) => x.nom)).toEqual(['Scan v2']);
    expect(await d.lireLectures('x')).toEqual([]);
  });
```

Dans `tests/sauvegarde.test.ts`, ajouter l'import `import { lectureFactice } from './aides/lecture';` et ce test :

```ts
  it('emporte les lectures ; sans lectures, la sauvegarde se relit quand même', async () => {
    const source = await ouvrirDepot(`s-${crypto.randomUUID()}`);
    const doc = await source.creerDocument('Reçu');
    const p = await source.ajouterPage(doc.id, pageFactice());
    await source.enregistrerLecture(lectureFactice(p.id, doc.id, '252'));
    const tout = await source.toutLire();
    const relu = lireSauvegarde(creerSauvegarde(tout.documents, tout.pages, tout.dossiers, tout.lectures));
    expect(relu.lectures.map((l) => l.lignes[0].texte)).toEqual(['252']);
    const cible = await ouvrirDepot(`c-${crypto.randomUUID()}`);
    await cible.importer(relu.documents, relu.pages, relu.dossiers, relu.lectures);
    expect((await cible.lireLectures(doc.id))[0].lignes[0].texte).toBe('252');
    expect(lireSauvegarde(creerSauvegarde(tout.documents, tout.pages, tout.dossiers)).lectures).toEqual([]);
  });
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/depot.test.ts tests/sauvegarde.test.ts` — Expected : FAIL (`lireLectures` / `enregistrerLecture` n'existent pas).

- [ ] **Step 3 : modifier `src/rangement/depot.ts`**

1. Imports et schéma :

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LecturePage } from '../lecture/modele';
import type { DocumentScan, DossierScan, NouvellePage, PageScan } from './modele';

interface Schema extends DBSchema {
  documents: { key: string; value: DocumentScan };
  pages: { key: string; value: PageScan; indexes: { parDocument: string } };
  dossiers: { key: string; value: DossierScan };
  lectures: { key: string; value: LecturePage; indexes: { parDocument: string } };
}
```

2. `ouvrirDepot` passe en version 3 :

```ts
  // Version 2 : dossiers. Version 3 : lectures du texte (une par page). Rien n'est perdu en montant de version.
  const db = await openDB<Schema>(nomBase, 3, {
    upgrade(base, ancienneVersion) {
      if (ancienneVersion < 1) {
        base.createObjectStore('documents', { keyPath: 'id' });
        base.createObjectStore('pages', { keyPath: 'id' }).createIndex('parDocument', 'documentId');
      }
      if (ancienneVersion < 2) base.createObjectStore('dossiers', { keyPath: 'id' });
      if (ancienneVersion < 3) base.createObjectStore('lectures', { keyPath: 'pageId' }).createIndex('parDocument', 'documentId');
    },
  });
```

3. Nouvelles méthodes (après `mettreAJourPage`) :

```ts
  // --- lectures du texte ---

  lireLectures(documentId: string): Promise<LecturePage[]> {
    return this.db.getAllFromIndex('lectures', 'parDocument', documentId);
  }

  /** Enregistre (ou remplace) la lecture d'une page, corrections comprises. */
  enregistrerLecture(l: LecturePage): Promise<void> {
    return proteger(async () => { await this.db.put('lectures', l); });
  }
```

4. `supprimerPage` efface aussi la lecture :

```ts
  async supprimerPage(pageId: string): Promise<void> {
    const tx = this.db.transaction(['documents', 'pages', 'lectures'], 'readwrite');
    const page = await tx.objectStore('pages').get(pageId);
    if (page) {
      const doc = await tx.objectStore('documents').get(page.documentId);
      if (doc) {
        doc.pages = doc.pages.filter((id) => id !== pageId);
        doc.modifie = this.horloge();
        await tx.objectStore('documents').put(doc);
      }
      await tx.objectStore('pages').delete(pageId);
      await tx.objectStore('lectures').delete(pageId);
    }
    await tx.done;
  }
```

5. `supprimerDocument` efface ses lectures :

```ts
  async supprimerDocument(id: string): Promise<void> {
    const tx = this.db.transaction(['documents', 'pages', 'lectures'], 'readwrite');
    const cles = await tx.objectStore('pages').index('parDocument').getAllKeys(id);
    const lectures = await tx.objectStore('lectures').index('parDocument').getAllKeys(id);
    await Promise.all([
      ...cles.map((k) => tx.objectStore('pages').delete(k)),
      ...lectures.map((k) => tx.objectStore('lectures').delete(k)),
      tx.objectStore('documents').delete(id),
      tx.done,
    ]);
  }
```

6. Dans `fusionner` : transaction `['documents', 'pages', 'lectures']`, et dans la boucle des pages, juste après `await tx.objectStore('pages').put({ ...page, documentId: cibleId });` :

```ts
          const lecture = await tx.objectStore('lectures').get(pageId);
          if (lecture) await tx.objectStore('lectures').put({ ...lecture, documentId: cibleId });
```

7. `toutLire` et `importer` :

```ts
  async toutLire(): Promise<{ documents: DocumentScan[]; pages: PageScan[]; dossiers: DossierScan[]; lectures: LecturePage[] }> {
    return {
      documents: await this.db.getAll('documents'),
      pages: await this.db.getAll('pages'),
      dossiers: await this.db.getAll('dossiers'),
      lectures: await this.db.getAll('lectures'),
    };
  }
```

Dans `importer` : nouvelle signature `async importer(documents: DocumentScan[], pages: PageScan[], dossiers: DossierScan[] = [], lectures: LecturePage[] = [])`, transaction `['documents', 'pages', 'dossiers', 'lectures']`, et après la boucle des pages du document ajouté :

```ts
        for (const l of lectures.filter((x) => x.documentId === doc.id)) await tx.objectStore('lectures').put(l);
```

- [ ] **Step 4 : modifier `src/rangement/sauvegarde.ts`**

```ts
import type { LecturePage } from '../lecture/modele';
```

```ts
/** Un zip : `manifeste.json` (dossiers, documents, pages sans les images, lectures) + toutes les images JPEG. */
export function creerSauvegarde(documents: DocumentScan[], pages: PageScan[], dossiers: DossierScan[] = [], lectures: LecturePage[] = []): Uint8Array {
```

et dans le manifeste : `JSON.stringify({ application: APPLICATION, version: VERSION, dossiers, documents, pages: pagesManifeste, lectures })`.

`lireSauvegarde` : type de retour `{ documents: DocumentScan[]; pages: PageScan[]; dossiers: DossierScan[]; lectures: LecturePage[] }` et dernière ligne :

```ts
  // les sauvegardes faites avant les dossiers ou avant la lecture du texte n'en ont pas
  return { documents: manifeste.documents, pages, dossiers: manifeste.dossiers ?? [], lectures: manifeste.lectures ?? [] };
```

- [ ] **Step 5 : passer les lectures dans `src/ecrans/Accueil.tsx`**

```ts
      const { documents, pages, dossiers: tous, lectures } = await depot.toutLire();
      const zip = creerSauvegarde(documents, pages, tous, lectures);
```

```ts
      const { documents, pages, dossiers: tous, lectures } = lireSauvegarde(new Uint8Array(await fichier.arrayBuffer()));
      const { ajoutes, ignores } = await depot.importer(documents, pages, tous, lectures);
```

- [ ] **Step 6 : vérifier la réussite**

Run : `npx vitest run tests/depot.test.ts tests/sauvegarde.test.ts` puis `npx tsc --noEmit` — Expected : PASS (l'ancien test « version 1 » passe aussi : il monte jusqu'à 3).

- [ ] **Step 7 : commit**

```bash
git add src/rangement/depot.ts src/rangement/sauvegarde.ts src/ecrans/Accueil.tsx tests/aides/lecture.ts tests/depot.test.ts tests/sauvegarde.test.ts
git commit -m "Mémoire : lectures du texte (IndexedDB v3), comprises dans la sauvegarde"
```

---

### Task 11 : Téléchargement du lecteur (Cache Storage)

**Files:**
- Create: `src/lecture/telechargement.ts`
- Test: `tests/telechargement.test.ts`

**Interfaces:**
- Produces : `CACHE_LECTEUR = 'fof-scan-lecteur'` ; `FICHIERS_LECTEUR: { reperage, lecture, dictionnaire }` (chacun `{ nom, taille }`) ; `TAILLE_LECTEUR` ; `adresseFichier(base: string, nom: string): string` ; `PAS_DE_RESEAU`, `NON_INSTALLE` (messages) ; `lecteurInstalle(caches, base): Promise<boolean>` ; `installerLecteur(caches, base, telecharger: (url: string) => Promise<Response>, progres?: (fait: number, total: number) => void): Promise<void>` ; `lireFichiersLecteur(caches, base): Promise<{ reperage: Uint8Array; lecture: Uint8Array; dictionnaire: string }>`. `caches` : tout objet `Pick<CacheStorage, 'open'>` (le vrai `caches` dans l'appli et le worker).

- [ ] **Step 1 : écrire les tests**

`tests/telechargement.test.ts` :

```ts
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
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/telechargement.test.ts` — Expected : FAIL.

- [ ] **Step 3 : écrire le code**

`src/lecture/telechargement.ts` :

```ts
/**
 * Le lecteur de texte (23 Mo) n'est pas dans l'installation de l'appli : il se télécharge à la
 * première lecture, puis il est gardé dans le Cache Storage du téléphone pour marcher sans internet.
 */
export const CACHE_LECTEUR = 'fof-scan-lecteur';

export const FICHIERS_LECTEUR = {
  reperage: { nom: 'reperage-ppocrv6-tiny.onnx', taille: 1_780_590 },
  lecture: { nom: 'lecture-ppocrv6-small.onnx', taille: 21_159_378 },
  dictionnaire: { nom: 'dictionnaire-ppocrv6.txt', taille: 74_947 },
} as const;
const LISTE = Object.values(FICHIERS_LECTEUR);
export const TAILLE_LECTEUR = LISTE.reduce((s, f) => s + f.taille, 0);

export const PAS_DE_RESEAU = 'Téléchargement impossible : vérifiez la connexion internet, puis réessayez.';
export const NON_INSTALLE = "Le lecteur de texte n'est pas encore téléchargé.";

type Caches = Pick<CacheStorage, 'open'>;

export const adresseFichier = (base: string, nom: string) => `${base}modeles/ocr/${nom}`;

export async function lecteurInstalle(caches: Caches, base: string): Promise<boolean> {
  const c = await caches.open(CACHE_LECTEUR);
  for (const f of LISTE) if (!(await c.match(adresseFichier(base, f.nom)))) return false;
  return true;
}

/** Télécharge ce qui manque, fichier par fichier ; un fichier n'est rangé qu'une fois reçu en entier. */
export async function installerLecteur(
  caches: Caches,
  base: string,
  telecharger: (url: string) => Promise<Response>,
  progres?: (fait: number, total: number) => void,
): Promise<void> {
  const c = await caches.open(CACHE_LECTEUR);
  let fait = 0;
  for (const f of LISTE) {
    const url = adresseFichier(base, f.nom);
    const debut = fait;
    if (!(await c.match(url))) {
      let reponse: Response;
      try {
        reponse = await telecharger(url);
      } catch {
        throw new Error(PAS_DE_RESEAU);
      }
      if (!reponse.ok) throw new Error(PAS_DE_RESEAU);
      const morceaux: Uint8Array[] = [];
      const lecteur = reponse.body?.getReader();
      try {
        if (lecteur) {
          for (;;) {
            const { done, value } = await lecteur.read();
            if (done) break;
            morceaux.push(value);
            fait += value.length;
            progres?.(Math.min(fait, debut + f.taille), TAILLE_LECTEUR);
          }
        } else {
          morceaux.push(new Uint8Array(await reponse.arrayBuffer()));
        }
      } catch {
        throw new Error(PAS_DE_RESEAU);
      }
      await c.put(url, new Response(new Blob(morceaux)));
    }
    fait = debut + f.taille;
    progres?.(fait, TAILLE_LECTEUR);
  }
}

export async function lireFichiersLecteur(caches: Caches, base: string): Promise<{ reperage: Uint8Array; lecture: Uint8Array; dictionnaire: string }> {
  const c = await caches.open(CACHE_LECTEUR);
  const lire = async (nom: string) => {
    const r = await c.match(adresseFichier(base, nom));
    if (!r) throw new Error(NON_INSTALLE);
    return r;
  };
  return {
    reperage: new Uint8Array(await (await lire(FICHIERS_LECTEUR.reperage.nom)).arrayBuffer()),
    lecture: new Uint8Array(await (await lire(FICHIERS_LECTEUR.lecture.nom)).arrayBuffer()),
    dictionnaire: await (await lire(FICHIERS_LECTEUR.dictionnaire.nom)).text(),
  };
}
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/telechargement.test.ts` puis `npx tsc --noEmit` — Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/lecture/telechargement.ts tests/telechargement.test.ts
git commit -m "Lecture : téléchargement du lecteur à la demande (Cache Storage)"
```

---

### Task 12 : Le worker lit les pages

**Files:**
- Modify: `src/traitement/protocole.ts`, `src/traitement/coeur.ts`, `src/traitement/client.ts`, `src/traitement/traitement.worker.ts`
- Test: `tests/lecture-coeur.test.ts`

**Interfaces:**
- Consumes : `Lecteur`, `PageBrute` (Task 5) ; `trouverTableau`, `rangerDansTableau`, `choisirMode` (Task 6) ; `lireFichiersLecteur` (Task 11) ; `lireDictionnaire` (Task 1) ; `ResultatLecture` (Task 1).
- Produces : requêtes `{ type: 'lire'; img }` → `{ type: 'lire'; resultat: ResultatLecture }` et `{ type: 'liberer' }` ; `interface LecteurDePage { lire(cv, img: Img): Promise<PageBrute> }` ; `gererLecture(cv, lecteur: LecteurDePage, r): Promise<Reponse>` ; `Traitement.lire(img: Img): Promise<ResultatLecture>` ; `Traitement.liberer(): Promise<void>`.

- [ ] **Step 1 : écrire les tests**

`tests/lecture-coeur.test.ts` :

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { ResultatLecture } from '../src/lecture/modele';
import { Traitement } from '../src/traitement/client';
import { gererLecture, type LecteurDePage } from '../src/traitement/coeur';
import { chargerOpenCV, type CV } from '../src/traitement/opencv';
import type { PortWorker, Reponse, Requete } from '../src/traitement/protocole';
import { imageUnie } from './aides/images';
import { pageAvecTraits, TABLEAU } from './aides/traits';

let cv: CV;
beforeAll(async () => { ({ cv } = await chargerOpenCV()); });

const ligne = (x: number, y: number, texte: string) => ({ rect: { x, y, largeur: 60, hauteur: 20 }, texte, confiance: 0.9 });

describe('gererLecture', () => {
  it('lignes lues + tableau repéré sur l\'image remise d\'aplomb → mode Tableau', async () => {
    const page = pageAvecTraits(cv, 600, 500, TABLEAU);
    const lecteur: LecteurDePage = { lire: async () => ({ sens: 90, img: page, lignes: [ligne(150, 140, 'Reçu'), ligne(150, 240, 'Poids'), ligne(350, 240, '252'), ligne(10, 450, 'Signature')] }) };
    const r = await gererLecture(cv, lecteur, { id: 3, type: 'lire', img: imageUnie(500, 600, 255) });
    expect(r.ok && r.type === 'lire').toBe(true);
    if (!r.ok || r.type !== 'lire') return;
    expect(r.id).toBe(3);
    expect(r.resultat).toMatchObject({ sens: 90, largeur: 600, hauteur: 500, mode: 'tableau' });
    expect(r.resultat.lignes.every((l) => l.corrige === false)).toBe(true);
    expect(r.resultat.tableau!.cases.map((c) => c.texte)).toEqual(['Reçu', 'Poids', '252', '', '']);
  });

  it('page sans traits → mode Texte, pas de tableau', async () => {
    const lecteur: LecteurDePage = { lire: async (_cv, img) => ({ sens: 0, img, lignes: [ligne(10, 10, 'Bonjour')] }) };
    const r = await gererLecture(cv, lecteur, { id: 1, type: 'lire', img: imageUnie(300, 200, 255) });
    expect(r.ok && r.type === 'lire' && r.resultat).toMatchObject({ mode: 'texte', tableau: null });
  });

  it('une erreur du lecteur devient une réponse d\'erreur', async () => {
    const lecteur: LecteurDePage = { lire: async () => { throw new Error('mémoire pleine'); } };
    expect(await gererLecture(cv, lecteur, { id: 2, type: 'lire', img: imageUnie(10, 10, 255) })).toEqual({ id: 2, ok: false, erreur: 'mémoire pleine' });
  });
});

describe('client : lire et libérer', () => {
  function portSimule(repondre: (r: Requete) => Reponse) {
    const envoyes: Requete[] = [];
    const port: PortWorker = {
      onmessage: null,
      postMessage(m) { envoyes.push(m); queueMicrotask(() => port.onmessage?.({ data: repondre(m) } as MessageEvent<Reponse>)); },
    };
    return { port, envoyes };
  }
  const resultat: ResultatLecture = { sens: 0, largeur: 10, hauteur: 10, mode: 'texte', lignes: [], tableau: null };

  it('lire envoie l\'image au worker et rend le résultat ; liberer est relayé', async () => {
    const { port, envoyes } = portSimule((m) => (m.type === 'lire' ? { id: m.id, ok: true, type: 'lire', resultat } : { id: m.id, ok: true, type: 'liberer' }));
    const t = new Traitement(port);
    expect(await t.lire(imageUnie(10, 10, 255))).toEqual(resultat);
    await t.liberer();
    expect(envoyes.map((m) => m.type)).toEqual(['lire', 'liberer']);
  });

  it('une erreur du worker est levée', async () => {
    const { port } = portSimule((m) => ({ id: m.id, ok: false, erreur: "Le lecteur de texte n'est pas encore téléchargé." }));
    await expect(new Traitement(port).lire(imageUnie(10, 10, 255))).rejects.toThrow('pas encore téléchargé');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/lecture-coeur.test.ts` — Expected : FAIL.

- [ ] **Step 3 : protocole**

`src/traitement/protocole.ts` (remplacer tout le fichier) :

```ts
import type { ResultatLecture } from '../lecture/modele';
import type { Coins, Filtre, Img, Reglages, Rotation } from './types';

export type Requete =
  | { id: number; type: 'preparer' }
  | { id: number; type: 'detecter'; img: Img }
  | { id: number; type: 'bords'; img: Img }
  | { id: number; type: 'traiter'; img: Img; coins: Coins; rotation: Rotation; filtre: Filtre; reglages: Reglages }
  /** Lire le texte d'une page (le lecteur doit être téléchargé). */
  | { id: number; type: 'lire'; img: Img }
  /** Libérer la mémoire du lecteur (en quittant l'écran Texte). */
  | { id: number; type: 'liberer' };

export type Reponse =
  | { id: number; ok: true; type: 'preparer' }
  | { id: number; ok: true; type: 'detecter'; coins: Coins | null }
  | { id: number; ok: true; type: 'bords'; masque: { data: Uint8Array; largeur: number; hauteur: number } }
  | { id: number; ok: true; type: 'traiter'; img: Img }
  | { id: number; ok: true; type: 'lire'; resultat: ResultatLecture }
  | { id: number; ok: true; type: 'liberer' }
  | { id: number; ok: false; erreur: string };

export interface PortWorker {
  onmessage: ((e: MessageEvent<Reponse>) => void) | null;
  postMessage(message: Requete, transfert?: Transferable[]): void;
}
```

- [ ] **Step 4 : cœur**

Dans `src/traitement/coeur.ts` :

1. imports ajoutés :

```ts
import type { PageBrute } from '../lecture/lecteur';
import { choisirMode, rangerDansTableau, trouverTableau } from '../lecture/tableau';
```

2. `gererRequete` ne reçoit plus que les requêtes simples :

```ts
/** Les requêtes traitées tout de suite, sans modèle d'IA. */
export type RequeteSimple = Extract<Requete, { type: 'preparer' | 'detecter' | 'bords' | 'traiter' }>;

export function gererRequete(cv: CV, r: RequeteSimple): Reponse {
```

3. à la fin du fichier :

```ts
/** Ce qu'il faut savoir du lecteur de texte : il lit une page et la rend remise d'aplomb. */
export interface LecteurDePage { lire(cv: CV, img: Img): Promise<PageBrute> }

/** Lecture d'une page : lignes lues, tableau repéré sur la même image, choix Texte / Tableau. */
export async function gererLecture(cv: CV, lecteur: LecteurDePage, r: Extract<Requete, { type: 'lire' }>): Promise<Reponse> {
  try {
    const lu = await lecteur.lire(cv, r.img);
    const lignes = lu.lignes.map((l) => ({ ...l, corrige: false }));
    const cadre = trouverTableau(cv, lu.img);
    const tableau = cadre ? rangerDansTableau(cadre, lignes) : null;
    return {
      id: r.id, ok: true, type: 'lire',
      resultat: { sens: lu.sens, largeur: lu.img.width, hauteur: lu.img.height, mode: choisirMode(tableau), lignes, tableau },
    };
  } catch (e) {
    return { id: r.id, ok: false, erreur: e instanceof Error ? e.message : `Erreur de lecture (${String(e)})` };
  }
}
```

- [ ] **Step 5 : client**

Dans `src/traitement/client.ts`, ajouter l'import `import type { ResultatLecture } from '../lecture/modele';` et ces méthodes dans la classe `Traitement` :

```ts
  async lire(img: Img): Promise<ResultatLecture> {
    const r = await this.envoyer({ id: this.suivant++, type: 'lire', img }, [img.data.buffer]);
    if (!r.ok) throw new Error(r.erreur);
    if (r.type !== 'lire') throw new Error('Réponse inattendue du traitement');
    return r.resultat;
  }

  async liberer(): Promise<void> {
    const r = await this.envoyer({ id: this.suivant++, type: 'liberer' });
    if (!r.ok) throw new Error(r.erreur);
  }
```

- [ ] **Step 6 : worker**

`src/traitement/traitement.worker.ts` (remplacer tout le fichier) :

```ts
import * as ort from 'onnxruntime-web/wasm';
import urlMoteur from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { lireDictionnaire } from '../lecture/ctc';
import { Lecteur } from '../lecture/lecteur';
import { lireFichiersLecteur } from '../lecture/telechargement';
import { gererDetection, gererLecture, gererRequete } from './coeur';
import { DetecteurIA } from './docaligner';
import { chargerOpenCV } from './opencv';
import type { Reponse, Requete } from './protocole';

const portee = self as unknown as {
  onmessage: ((e: MessageEvent<Requete>) => void) | null;
  postMessage(message: Reponse, transfert?: Transferable[]): void;
};

function configurerMoteur() {
  // un seul fil : GitHub Pages ne permet pas le partage de mémoire entre fils
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: urlMoteur };
}

let chargementIA: Promise<DetecteurIA | null> | null = null;

/** Charge le modèle DocAligner une seule fois ; s'il est indisponible, la méthode classique suffira. */
function chargerIA(): Promise<DetecteurIA | null> {
  if (!chargementIA) {
    chargementIA = (async () => {
      try {
        configurerMoteur();
        const reponse = await fetch(`${import.meta.env.BASE_URL}modeles/docaligner-lc100.onnx`);
        if (!reponse.ok) throw new Error(`modèle introuvable (${reponse.status})`);
        return await DetecteurIA.creer(ort, new Uint8Array(await reponse.arrayBuffer()));
      } catch (e) {
        console.warn('Détection par IA indisponible, méthode classique utilisée :', e);
        return null;
      }
    })();
  }
  return chargementIA;
}

let chargementLecteur: Promise<Lecteur> | null = null;

/** Charge le lecteur de texte depuis le Cache Storage (téléchargé par l'écran Texte). Un échec n'est pas gardé. */
function chargerLecteur(): Promise<Lecteur> {
  if (!chargementLecteur) {
    const enCours = (async () => {
      configurerMoteur();
      const f = await lireFichiersLecteur(caches, import.meta.env.BASE_URL);
      return Lecteur.creer(ort, f.reperage, f.lecture, lireDictionnaire(f.dictionnaire));
    })();
    chargementLecteur = enCours;
    enCours.catch(() => { if (chargementLecteur === enCours) chargementLecteur = null; });
  }
  return chargementLecteur;
}

async function repondre(r: Requete): Promise<Reponse> {
  const { cv } = await chargerOpenCV();
  switch (r.type) {
    case 'detecter':
      return gererDetection(cv, await chargerIA(), r);
    case 'lire':
      try {
        return await gererLecture(cv, await chargerLecteur(), r);
      } catch (e) {
        return { id: r.id, ok: false, erreur: e instanceof Error ? e.message : String(e) };
      }
    case 'liberer': {
      const enCours = chargementLecteur;
      chargementLecteur = null;
      const lecteur = enCours ? await enCours.catch(() => null) : null;
      await lecteur?.liberer();
      return { id: r.id, ok: true, type: 'liberer' };
    }
    default:
      if (r.type === 'preparer') void chargerIA(); // l'IA se charge en arrière-plan dès l'ouverture de l'appli
      return gererRequete(cv, r);
  }
}

portee.onmessage = async (e) => {
  const reponse = await repondre(e.data);
  const transfert = !reponse.ok ? []
    : reponse.type === 'traiter' ? [reponse.img.data.buffer]
    : reponse.type === 'bords' ? [reponse.masque.data.buffer]
    : [];
  portee.postMessage(reponse, transfert);
};
```

- [ ] **Step 7 : vérifier la réussite**

Run : `npx vitest run tests/lecture-coeur.test.ts tests/traitement.test.ts` puis `npx tsc --noEmit` — Expected : PASS (si `tsc` signale `gererRequete` appelé avec une requête non simple dans un test existant, typer l'appel avec `RequeteSimple`).

- [ ] **Step 8 : commit**

```bash
git add src/traitement tests/lecture-coeur.test.ts
git commit -m "Worker : lecture du texte d'une page (lecteur chargé depuis le cache) et libération"
```

---

### Task 13 : Contrôle sur les photos réelles (local, non publié)

**Files:**
- Create: `tests/lecture-photos.test.ts`
- Delete: `tests/essai-ocr.tmp.test.ts`, `tests/essai-ocr-pages.tmp.test.ts` (essais jetables non versionnés) ; retirer `tesseract.js` installé en `--no-save`

**Interfaces:**
- Consumes : `Lecteur` (Task 5), `gererLecture` (Task 12), `tournerImg` (Task 5), `lireDictionnaire` (Task 1), `FICHIERS_LECTEUR` (Task 11), `blocsDePage`, `texteDeBlocs` (Task 7), fonctions du morceau 1 (`DetecteurIA`, `detecterCoins`, `redresser`, `appliquerFiltre`).

- [ ] **Step 1 : écrire le test**

`tests/lecture-photos.test.ts` :

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { blocsDePage, texteDeBlocs } from '../src/lecture/contenu';
import { lireDictionnaire } from '../src/lecture/ctc';
import { Lecteur, tournerImg } from '../src/lecture/lecteur';
import { CONFIANCE_DOUTEUSE, type LecturePage } from '../src/lecture/modele';
import { FICHIERS_LECTEUR } from '../src/lecture/telechargement';
import { gererLecture } from '../src/traitement/coeur';
import { detecterCoins } from '../src/traitement/detection';
import { DetecteurIA } from '../src/traitement/docaligner';
import { appliquerFiltre } from '../src/traitement/filtres';
import { coinsPleineImage } from '../src/traitement/geometrie';
import { chargerOpenCV } from '../src/traitement/opencv';
import { redresser } from '../src/traitement/redressement';

const DOSSIER = 'tests/photos/sauvegarde';
const SORTIE = 'tests/photos/resultats/lecture';
const OCR = 'public/modeles/ocr';
const photos = existsSync(DOSSIER) ? readdirSync(DOSSIER).filter((n) => n.endsWith(' - original.jpg')) : [];

const lire = (chemin: string) => {
  const b = jpeg.decode(readFileSync(chemin), { useTArray: true, maxMemoryUsageInMB: 2048 });
  return { data: new Uint8ClampedArray(b.data.buffer), width: b.width, height: b.height };
};

describe.skipIf(photos.length === 0)('lecture des photos réelles (dossier local, non publié)', () => {
  it('lit chaque page, écrit textes et planches, retrouve les chiffres du reçu', async () => {
    const { cv } = await chargerOpenCV();
    const ort = createRequire(import.meta.url)('onnxruntime-web');
    ort.env.wasm.numThreads = 1;
    const ia = await DetecteurIA.creer(ort, new Uint8Array(readFileSync('public/modeles/docaligner-lc100.onnx')));
    const lecteur = await Lecteur.creer(ort,
      new Uint8Array(readFileSync(`${OCR}/${FICHIERS_LECTEUR.reperage.nom}`)),
      new Uint8Array(readFileSync(`${OCR}/${FICHIERS_LECTEUR.lecture.nom}`)),
      lireDictionnaire(readFileSync(`${OCR}/${FICHIERS_LECTEUR.dictionnaire.nom}`, 'utf8')));
    mkdirSync(SORTIE, { recursive: true });
    const textes: Record<string, string> = {};
    const bilan: string[] = [];
    for (const nom of photos) {
      const photo = lire(`${DOSSIER}/${nom}`);
      const coins = (await ia.detecter(cv, photo)) ?? detecterCoins(cv, photo) ?? coinsPleineImage(photo.width, photo.height);
      const page = appliquerFiltre(cv, redresser(cv, photo, coins, 0, 2400), 'ameliore');
      const debut = Date.now();
      const r = await gererLecture(cv, lecteur, { id: 1, type: 'lire', img: page });
      if (!r.ok || r.type !== 'lire') throw new Error(`${nom} : ${r.ok ? 'réponse inattendue' : r.erreur}`);
      const lecture: LecturePage = { ...r.resultat, pageId: nom, documentId: 'd', empreinte: '', lu: 0 };
      const court = nom.replace(' - original.jpg', '');
      textes[court] = texteDeBlocs(blocsDePage(lecture));
      writeFileSync(`${SORTIE}/${court}.txt`, textes[court]);
      // planche : lignes en vert (orange si douteuses), cases du tableau en bleu
      const droite = cv.matFromImageData(tournerImg(cv, page, lecture.sens));
      for (const l of lecture.lignes) {
        const couleur = l.confiance < CONFIANCE_DOUTEUSE ? new cv.Scalar(255, 150, 0, 255) : new cv.Scalar(0, 180, 0, 255);
        cv.rectangle(droite, new cv.Point(l.rect.x, l.rect.y), new cv.Point(l.rect.x + l.rect.largeur, l.rect.y + l.rect.hauteur), couleur, 3);
      }
      for (const c of lecture.tableau?.cases ?? []) {
        cv.rectangle(droite, new cv.Point(c.rect.x, c.rect.y), new cv.Point(c.rect.x + c.rect.largeur, c.rect.y + c.rect.hauteur), new cv.Scalar(0, 0, 255, 255), 4);
      }
      const petit = new cv.Mat();
      cv.resize(droite, petit, new cv.Size(Math.round(droite.cols / 2), Math.round(droite.rows / 2)), 0, 0, cv.INTER_AREA);
      writeFileSync(`${SORTIE}/${court}.jpg`, jpeg.encode({ data: Buffer.from(petit.data), width: petit.cols, height: petit.rows }, 80).data);
      droite.delete();
      petit.delete();
      bilan.push(`${court} | sens ${lecture.sens} | ${lecture.lignes.length} lignes | mode ${lecture.mode}`
        + `${lecture.tableau ? ` (${lecture.tableau.rangs}×${lecture.tableau.cols})` : ''} | ${((Date.now() - debut) / 1000).toFixed(1)} s`);
    }
    writeFileSync(`${SORTIE}/bilan.txt`, bilan.join('\n'));
    console.log(bilan.join('\n'));
    const recu = textes['Scan 12-10-2026 17h45 - p6'];
    if (recu !== undefined) for (const chiffre of ['252', '1200', '302400']) expect(recu).toContain(chiffre);
  }, 900000);
});
```

- [ ] **Step 2 : lancer et contrôler à l'œil**

Run : `npx vitest run tests/lecture-photos.test.ts` — Expected : PASS ; le bilan affiche 7 pages. Ouvrir `tests/photos/resultats/lecture/*.jpg` (outil Read) et les `.txt` :
- reçu p6 et p7 : mode `tableau`, colonnes RUBRIQUE / VALEUR / Nature produit en bleu ;
- cahier p5 : sens 90, mode `texte` ;
- annexe p4 : mode `texte` (cases grises sans traits) ;
- textes imprimés lisibles.
Si le reçu n'est pas en mode tableau, ajuster les réglages de `tableau.ts` (tolérance, `PART_PLEINE_MIN`) en gardant les tests de la Task 6 au vert, et relancer.

- [ ] **Step 3 : retirer les essais jetables**

```bash
rm tests/essai-ocr.tmp.test.ts tests/essai-ocr-pages.tmp.test.ts
npm prune
git status --short
```

Expected : `npm prune` retire `tesseract.js` (installé en `--no-save`) ; `git status` ne montre que `tests/lecture-photos.test.ts` ; `git ls-files tests/photos` est vide.

- [ ] **Step 4 : vérifier toute la suite**

Run : `npx vitest run` puis `npx tsc --noEmit` — Expected : PASS, aucune erreur.

- [ ] **Step 5 : commit**

```bash
git add tests/lecture-photos.test.ts
git commit -m "Lecture : contrôle sur les photos réelles (planches et textes locaux)"
```

---
### Task 14 : Écran Texte — télécharger, lire, suivre

**Files:**
- Create: `src/navigateur/lecture.ts`, `src/ecrans/lireDocument.ts`, `src/ecrans/TexteEcran.tsx`
- Modify: `src/ecrans/navigation.ts`, `src/app.tsx`, `src/ecrans/DocumentEcran.tsx` (barre du bas), `src/styles.css`
- Test: `tests/lire-document.test.ts`

**Interfaces:**
- Consumes : `Traitement.lire`, `Traitement.liberer` (Task 12) ; `empreinte`, `LecturePage` (Task 1) ; `lecteurInstalle`, `installerLecteur`, `TAILLE_LECTEUR` (Task 11) ; `Depot.lireLectures`, `Depot.enregistrerLecture` (Task 10).
- Produces : écran `{ nom: 'texte'; id: string }` ; `COTE_LECTURE = 2400` ; `lirePageScan(page: PageScan, maintenant?: () => number): Promise<LecturePage>` ; `canvasDePageLue(page: PageScan, l: LecturePage): Promise<HTMLCanvasElement>` ; `type EtatPage = 'non-lue' | 'a-relire' | 'lue'` ; `etatPage(page, l?): EtatPage` ; `lirePages(pages, lire, enregistrer, progres, annule): Promise<{ lues: LecturePage[]; echecs: string[] }>` ; composant `TexteEcran` (la partie correction et sorties arrive à la Task 15).

- [ ] **Step 1 : écrire les tests**

`tests/lire-document.test.ts` :

```ts
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
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run tests/lire-document.test.ts` — Expected : FAIL.

- [ ] **Step 3 : écrire `src/ecrans/lireDocument.ts`**

```ts
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
```

- [ ] **Step 4 : vérifier la réussite**

Run : `npx vitest run tests/lire-document.test.ts` — Expected : PASS.

- [ ] **Step 5 : écrire `src/navigateur/lecture.ts`**

```ts
import { empreinte, type LecturePage } from '../lecture/modele';
import type { PageScan } from '../rangement/modele';
import { traitement } from '../traitement/client';
import { chargerImage, lireImg, versCanvas } from './images';

/** Pages lues en 2 400 px au plus : assez fin pour l'écriture, raisonnable pour la mémoire de Safari. */
export const COTE_LECTURE = 2400;

export async function lirePageScan(page: PageScan, maintenant: () => number = Date.now): Promise<LecturePage> {
  const img = await chargerImage(page.traitee.octets);
  const c = versCanvas(img, img.naturalWidth, img.naturalHeight, COTE_LECTURE);
  const r = await traitement().lire(lireImg(c));
  return { ...r, pageId: page.id, documentId: page.documentId, empreinte: empreinte(page.traitee), lu: maintenant() };
}

/** La page telle qu'elle a été lue (même taille, même sens), pour découper les morceaux de photo. */
export async function canvasDePageLue(page: PageScan, l: LecturePage): Promise<HTMLCanvasElement> {
  const img = await chargerImage(page.traitee.octets);
  const c = document.createElement('canvas');
  c.width = l.largeur;
  c.height = l.hauteur;
  const ctx = c.getContext('2d')!;
  // taille avant le quart de tour ; 90 = vers la droite, comme ROTATE_90_CLOCKWISE du lecteur
  const [lw, lh] = l.sens === 0 ? [l.largeur, l.hauteur] : [l.hauteur, l.largeur];
  ctx.translate(l.largeur / 2, l.hauteur / 2);
  ctx.rotate((l.sens * Math.PI) / 180);
  ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh);
  return c;
}
```

- [ ] **Step 6 : navigation, application, bouton « Texte »**

`src/ecrans/navigation.ts`, dans `Ecran`, après la ligne `document` :

```ts
  /** Lecture du texte d'un document, correction, Word / Excel. */
  | { nom: 'texte'; id: string }
```

`src/app.tsx` : `import { TexteEcran } from './ecrans/TexteEcran';` et, après la ligne `export` :

```tsx
          {ecran.nom === 'texte' && <TexteEcran id={ecran.id} depot={depot} nav={nav} />}
```

`src/ecrans/DocumentEcran.tsx`, barre du bas :

```tsx
      <div class="barre-bas">
        <button onClick={() => setAjout(true)}>Ajouter</button>
        <button onClick={() => nav.aller({ nom: 'texte', id })} disabled={!pages.length}>Texte</button>
        <button class="principal" onClick={() => nav.aller({ nom: 'export', ids: [id] })} disabled={!pages.length}>Exporter</button>
      </div>
```

- [ ] **Step 7 : écrire `src/ecrans/TexteEcran.tsx` (lecture et suivi)**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import type { LecturePage } from '../lecture/modele';
import { installerLecteur, lecteurInstalle, TAILLE_LECTEUR } from '../lecture/telechargement';
import { lirePageScan } from '../navigateur/lecture';
import { tailleLisible } from '../nommage';
import type { Depot } from '../rangement/depot';
import type { DocumentScan, PageScan } from '../rangement/modele';
import { traitement } from '../traitement/client';
import { etatPage, lirePages } from './lireDocument';
import { messageErreur, type Nav } from './navigation';

const BASE = import.meta.env.BASE_URL;

/** Texte d'un document : téléchargement du lecteur (une fois), lecture des pages, correction, sorties. */
export function TexteEcran({ id, depot, nav }: { id: string; depot: Depot; nav: Nav }) {
  const [doc, setDoc] = useState<DocumentScan | null>(null);
  const [pages, setPages] = useState<PageScan[]>([]);
  const [lectures, setLectures] = useState<Record<string, LecturePage>>({});
  const [installe, setInstalle] = useState<boolean | null>(null);
  const [telechargement, setTelechargement] = useState<{ fait: number; total: number } | null>(null);
  const [lecture, setLecture] = useState<{ fait: number; total: number } | null>(null);
  const [index, setIndex] = useState(0);
  const annuler = useRef(false);

  useEffect(() => {
    (async () => {
      const d = await depot.lireDocument(id);
      if (!d) { nav.aller({ nom: 'accueil' }); return; }
      const ps = await depot.lirePages(id);
      const ls = await depot.lireLectures(id);
      setDoc(d);
      setPages(ps);
      setLectures(Object.fromEntries(ls.map((l) => [l.pageId, l])));
      const ok = await lecteurInstalle(caches, BASE).catch(() => false);
      setInstalle(ok);
      if (ok) await lire(ps.filter((p) => !ls.some((l) => l.pageId === p.id)));
    })();
    // en quittant l'écran : on arrête après la page en cours et on rend la mémoire du lecteur
    return () => { annuler.current = true; void traitement().liberer().catch(() => undefined); };
  }, [id]);

  async function lire(aLire: PageScan[]) {
    if (!aLire.length) return;
    annuler.current = false;
    const { echecs } = await lirePages(aLire, (p) => lirePageScan(p),
      async (l) => { await depot.enregistrerLecture(l); setLectures((x) => ({ ...x, [l.pageId]: l })); },
      (fait, total) => setLecture({ fait, total }), () => annuler.current);
    setLecture(null);
    if (echecs.length) nav.signaler(`${echecs.length} page(s) n'ont pas pu être lues. Réessayez avec « Relire cette page ».`);
  }

  async function telecharger() {
    setTelechargement({ fait: 0, total: TAILLE_LECTEUR });
    try {
      await installerLecteur(caches, BASE, (u) => fetch(u), (fait, total) => setTelechargement({ fait, total }));
      setInstalle(true);
      setTelechargement(null);
      await lire(pages.filter((p) => !lectures[p.id]));
    } catch (e) {
      setTelechargement(null);
      nav.signaler(messageErreur(e));
    }
  }

  async function relire(p: PageScan) {
    if (lectures[p.id] && !confirm('Relire cette page ? Ses corrections seront perdues.')) return;
    await lire([p]);
  }

  const page = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const lu = page ? lectures[page.id] : undefined;
  const etat = page ? etatPage(page, lu) : 'non-lue';

  return (
    <main class="ecran">
      <header class="entete">
        <button aria-label="Retour" onClick={() => nav.aller({ nom: 'document', id })}>‹</button>
        <h1>Texte</h1>
      </header>
      {doc && <p class="doux">{doc.nom}</p>}
      {installe === false && (
        <div class="carte">
          <p>Le lecteur de texte n'est pas encore sur ce téléphone. Il se télécharge une seule fois
            ({tailleLisible(TAILLE_LECTEUR)}), ensuite il marche sans internet.</p>
          {telechargement ? (
            <>
              <span class="doux">Téléchargement… {tailleLisible(telechargement.fait)} sur {tailleLisible(telechargement.total)}</span>
              <div class="progression"><div style={{ width: `${(100 * telechargement.fait) / telechargement.total}%` }} /></div>
            </>
          ) : <button class="principal" onClick={telecharger}>Télécharger le lecteur</button>}
        </div>
      )}
      {lecture && (
        <div class="carte">
          <span class="doux">Lecture de la page {Math.min(lecture.fait + 1, lecture.total)} sur {lecture.total}…</span>
          <div class="progression"><div style={{ width: `${(100 * lecture.fait) / Math.max(1, lecture.total)}%` }} /></div>
          <button onClick={() => { annuler.current = true; }}>Annuler</button>
        </div>
      )}
      {page && pages.length > 1 && (
        <div class="ligne">
          <button aria-label="Page précédente" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹</button>
          <span>Page {index + 1} / {pages.length}</span>
          <button aria-label="Page suivante" disabled={index >= pages.length - 1} onClick={() => setIndex(index + 1)}>›</button>
        </div>
      )}
      {page && etat === 'a-relire' && <p class="doux">Cette page a été modifiée depuis sa lecture.</p>}
      {page && lu && (
        <ul class="liste-brute">
          {lu.lignes.map((l, k) => <li key={k}>{l.texte}</li>)}
        </ul>
      )}
      {page && etat === 'non-lue' && installe && !lecture && <p class="doux">Page pas encore lue.</p>}
      {page && installe && !lecture && (
        <button onClick={() => relire(page)}>{etat === 'non-lue' ? 'Lire cette page' : 'Relire cette page'}</button>
      )}
    </main>
  );
}
```

(La liste `liste-brute` est provisoire : la Task 15 la remplace par la correction ligne par ligne et ajoute les sorties.)

- [ ] **Step 8 : styles**

À la fin de `src/styles.css` :

```css
.carte { background: var(--surface); border-radius: var(--rayon); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.carte p { margin: 0; }
.liste-brute { margin: 0; padding-left: 18px; }
```

- [ ] **Step 9 : vérifier**

Run : `npx vitest run` puis `npx tsc --noEmit` — Expected : PASS. Puis dans le navigateur (config « fof-scan », taille mobile) : ouvrir un document → « Texte » → carte « Télécharger le lecteur (21,9 Mo) » → toucher → progression → lecture page par page → lignes lues affichées ; quitter et revenir : pas de nouveau téléchargement ni de relecture. Contrôler les erreurs de la console (`read_console_messages`).

- [ ] **Step 10 : commit**

```bash
git add src/navigateur/lecture.ts src/ecrans/lireDocument.ts src/ecrans/TexteEcran.tsx src/ecrans/navigation.ts src/app.tsx src/ecrans/DocumentEcran.tsx src/styles.css tests/lire-document.test.ts
git commit -m "Écran Texte : téléchargement du lecteur, lecture des pages avec progression"
```

---

### Task 15 : Correction (ligne par ligne, case par case) et sorties Word / Excel / Copier

**Files:**
- Create: `src/ecrans/PageLue.tsx`
- Modify: `src/ecrans/TexteEcran.tsx`, `src/styles.css`

**Interfaces:**
- Consumes : `canvasDePageLue` (Task 14) ; `lignesHorsTableau`, `blocsDePage`, `texteDuDocument`, `Bloc` (Task 7) ; `fabriquerDocx`, `TYPE_DOCX` (Task 8) ; `fabriquerXlsx`, `TYPE_XLSX` (Task 9) ; `CONFIANCE_DOUTEUSE`, `LecturePage`, `ModeLecture`, `Rect` (Task 1) ; `FichierPret` (morceau 1) ; `nomFichier`.
- Produces : `PageLue({ page, lecture, onChanger })`.

- [ ] **Step 1 : écrire `src/ecrans/PageLue.tsx`**

```tsx
import { useEffect, useRef, useState } from 'preact/hooks';
import { lignesHorsTableau } from '../lecture/contenu';
import { CONFIANCE_DOUTEUSE, type LecturePage, type ModeLecture, type Rect } from '../lecture/modele';
import { canvasDePageLue } from '../navigateur/lecture';
import type { PageScan } from '../rangement/modele';

/** Largeur maximale d'un morceau de photo (mémoire de Safari). */
const LARGEUR_MORCEAU = 900;

/** Morceau de la page lue autour d'une ligne ou d'une case. */
function Morceau({ source, rect }: { source: HTMLCanvasElement | null; rect: Rect }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !source) return;
    const marge = 4;
    const x = Math.max(0, rect.x - marge), y = Math.max(0, rect.y - marge);
    const l = Math.max(1, Math.min(source.width - x, rect.largeur + 2 * marge));
    const h = Math.max(1, Math.min(source.height - y, rect.hauteur + 2 * marge));
    const f = Math.min(1, LARGEUR_MORCEAU / l);
    c.width = Math.max(1, Math.round(l * f));
    c.height = Math.max(1, Math.round(h * f));
    c.getContext('2d')!.drawImage(source, x, y, l, h, 0, 0, c.width, c.height);
  }, [source, rect.x, rect.y, rect.largeur, rect.hauteur]);
  return <canvas ref={ref} class="morceau" />;
}

/** Texte lu : toucher pour le corriger ; il est enregistré en quittant le champ. */
function TexteModifiable({ texte, douteux, onValider }: { texte: string; douteux: boolean; onValider: (t: string) => void }) {
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(texte);
  useEffect(() => setValeur(texte), [texte]);
  if (!edition) {
    return <button class={`texte-lu${douteux ? ' douteux' : ''}`} onClick={() => setEdition(true)}>{texte || '—'}</button>;
  }
  const finir = () => { setEdition(false); if (valeur !== texte) onValider(valeur); };
  return (
    <textarea class="texte-lu" value={valeur} rows={Math.max(1, valeur.split('\n').length)} autoFocus
      onInput={(e) => setValeur(e.currentTarget.value)} onBlur={finir}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
  );
}

/** Correction d'une page lue : interrupteur Texte / Tableau, lignes sous leur morceau de photo, grille des cases. */
export function PageLue({ page, lecture, onChanger }: { page: PageScan; lecture: LecturePage; onChanger: (l: LecturePage) => void }) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [caseOuverte, setCaseOuverte] = useState<number | null>(null);
  const [saisieCase, setSaisieCase] = useState('');

  useEffect(() => {
    let actif = true;
    canvasDePageLue(page, lecture).then((c) => { if (actif) setSource(c); }).catch(() => undefined);
    return () => { actif = false; };
  }, [page.id, page.traitee.octets.length, lecture.sens, lecture.largeur, lecture.hauteur]);

  const changerLigne = (k: number, texte: string) =>
    onChanger({ ...lecture, lignes: lecture.lignes.map((l, i) => (i === k ? { ...l, texte, corrige: true } : l)) });
  const changerCase = (k: number, texte: string) => {
    if (!lecture.tableau) return;
    onChanger({ ...lecture, tableau: { ...lecture.tableau, cases: lecture.tableau.cases.map((c, i) => (i === k ? { ...c, texte, corrige: true } : c)) } });
  };
  const changerMode = (mode: ModeLecture) => onChanger({ ...lecture, mode });

  const t = lecture.mode === 'tableau' ? lecture.tableau : null;
  const { avant, apres } = t ? lignesHorsTableau(lecture) : { avant: lecture.lignes.map((_, k) => k), apres: [] as number[] };

  const carte = (k: number) => {
    const l = lecture.lignes[k];
    return (
      <div class="carte-ligne" key={k}>
        <Morceau source={source} rect={l.rect} />
        <TexteModifiable texte={l.texte} douteux={!l.corrige && l.confiance < CONFIANCE_DOUTEUSE} onValider={(x) => changerLigne(k, x)} />
      </div>
    );
  };

  return (
    <>
      <div class="choix">
        <button aria-pressed={lecture.mode === 'texte'} onClick={() => changerMode('texte')}>Texte</button>
        <button aria-pressed={lecture.mode === 'tableau'} disabled={!lecture.tableau} onClick={() => changerMode('tableau')}>Tableau</button>
      </div>
      {!lecture.lignes.length && <p class="doux">Aucun texte trouvé sur cette page.</p>}
      {avant.map(carte)}
      {t && (
        <div class="defile">
          <div class="grille-tableau" style={{ gridTemplateColumns: `repeat(${t.cols}, minmax(90px, 1fr))` }}>
            {t.cases.map((c, k) => (
              <button key={k} class={`case-tableau${!c.corrige && c.confiance < CONFIANCE_DOUTEUSE ? ' douteux' : ''}`}
                style={{ gridRow: `${c.rang + 1} / span ${c.rangs}`, gridColumn: `${c.col + 1} / span ${c.cols}` }}
                onClick={() => { setCaseOuverte(k); setSaisieCase(c.texte); }}>{c.texte}</button>
            ))}
          </div>
        </div>
      )}
      {apres.map(carte)}
      {t && caseOuverte !== null && t.cases[caseOuverte] && (
        <>
          <div class="voile" onClick={() => setCaseOuverte(null)} />
          <div class="feuille-actions">
            <Morceau source={source} rect={t.cases[caseOuverte].rect} />
            <textarea class="texte-lu" rows={3} value={saisieCase} autoFocus onInput={(e) => setSaisieCase(e.currentTarget.value)} />
            <button class="principal" onClick={() => { changerCase(caseOuverte, saisieCase); setCaseOuverte(null); }}>Valider</button>
            <button onClick={() => setCaseOuverte(null)}>Annuler</button>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2 : brancher la correction et les sorties dans `TexteEcran.tsx`**

1. Imports ajoutés :

```tsx
import { fabriquerDocx, TYPE_DOCX } from '../export/docx';
import { fabriquerXlsx, TYPE_XLSX } from '../export/xlsx';
import { blocsDePage, texteDuDocument, type Bloc } from '../lecture/contenu';
import { nomFichier, tailleLisible } from '../nommage';
import { FichierPret } from './FichierPret';
import { PageLue } from './PageLue';
```

(et retirer l'ancien `import { tailleLisible } from '../nommage';`).

2. État et fonctions, après `const annuler = useRef(false);` :

```tsx
  const [pret, setPret] = useState<File[] | null>(null);
```

et après `relire` :

```tsx
  async function enregistrer(l: LecturePage) {
    setLectures((x) => ({ ...x, [l.pageId]: l }));
    try {
      await depot.enregistrerLecture(l);
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  /** Pages lues, dans l'ordre du document (les pages pas encore lues sont sautées). */
  const blocsParPage = (): Bloc[][] => pages.map((p) => lectures[p.id]).filter((l): l is LecturePage => !!l).map(blocsDePage);

  function preparer(sorte: 'docx' | 'xlsx') {
    if (!doc) return;
    try {
      const octets = sorte === 'docx' ? fabriquerDocx(blocsParPage(), doc.nom) : fabriquerXlsx(blocsParPage());
      setPret([new File([octets], nomFichier(doc.nom, sorte), { type: sorte === 'docx' ? TYPE_DOCX : TYPE_XLSX })]);
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  async function copier() {
    try {
      await navigator.clipboard.writeText(texteDuDocument(blocsParPage()));
      nav.signaler('Texte copié : collez-le où vous voulez.');
    } catch {
      nav.signaler('Copie impossible sur cet appareil.');
    }
  }

  const nbLues = pages.filter((p) => lectures[p.id]).length;
```

3. Remplacer le bloc provisoire `{page && lu && (<ul class="liste-brute">…</ul>)}` par :

```tsx
      {page && lu && <PageLue key={page.id} page={page} lecture={lu} onChanger={enregistrer} />}
```

4. Avant `</main>` :

```tsx
      <div class="barre-bas compacte">
        <button disabled={!nbLues || !!lecture} onClick={() => preparer('docx')}>Word</button>
        <button disabled={!nbLues || !!lecture} onClick={() => preparer('xlsx')}>Excel</button>
        <button class="principal" disabled={!nbLues || !!lecture} onClick={copier}>Copier le texte</button>
      </div>
      {pret && <FichierPret fichiers={pret} nav={nav} onFermer={() => setPret(null)} />}
```

- [ ] **Step 3 : styles**

Dans `src/styles.css`, remplacer `.liste-brute { … }` par :

```css
.carte-ligne { display: flex; flex-direction: column; gap: 4px; background: var(--surface); border-radius: 10px; padding: 6px; }
.morceau { display: block; max-width: 100%; height: auto; border-radius: 6px; background: #fff; }
.texte-lu { text-align: left; background: transparent; padding: 6px 8px; white-space: pre-wrap; font: inherit; color: var(--texte);
  border-radius: 8px; width: 100%; }
textarea.texte-lu { border: 1px solid var(--accent); background: var(--fond); resize: vertical; }
.texte-lu.douteux, .case-tableau.douteux { color: #ffb347; outline: 1px solid #ffb34766; }
.defile { overflow-x: auto; }
.grille-tableau { display: grid; gap: 2px; background: var(--surface-2); padding: 2px; border-radius: 8px; min-width: min-content; }
.case-tableau { background: var(--surface); border-radius: 4px; padding: 6px; text-align: left; white-space: pre-wrap; font-size: 14px; min-height: 36px; }
```

- [ ] **Step 4 : vérifier**

Run : `npx vitest run` puis `npx tsc --noEmit` — Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/ecrans/PageLue.tsx src/ecrans/TexteEcran.tsx src/styles.css
git commit -m "Écran Texte : correction ligne par ligne et case par case, sorties Word, Excel et Copier"
```

---

### Task 16 : Vérification complète, version construite, documentation

**Files:**
- Modify: `docs/reference-camscanner.md` (section 7), mémoire `fof-scan.md`

- [ ] **Step 1 : parcours dans le navigateur (dev, taille mobile 375 × 812)**

Avec la config « fof-scan » :
1. Ouvrir « Reçu Bobo » → « Texte ». Si le lecteur est déjà en cache (essai de la Task 14), vider le cache `fof-scan-lecteur` par `javascript_tool` (`await caches.delete('fof-scan-lecteur')`) pour revoir la carte de téléchargement.
2. Télécharger → progression jusqu’à 21,9 Mo → lecture page 1 sur 2, puis 2 sur 2.
3. Page 1 : interrupteur sur « Tableau », grille RUBRIQUE / VALEUR / Nature produit ; toucher la case du poids → morceau de photo + champ → corriger → Valider ; la case n'est plus orange.
4. Passer en « Texte » : cartes ligne par ligne, morceaux de photo nets ; corriger une ligne orange → quitter le champ → la couleur disparaît ; revenir sur l'écran : correction conservée.
5. « Word », « Excel » : la feuille « Partager » s'ouvre avec `Reçu Bobo.docx` / `Reçu Bobo.xlsx`. Vérifier les fichiers par `javascript_tool` : remplacer `navigator.share` pour capter le fichier, le dézipper avec `fflate` (`/node_modules/.vite/deps/fflate.js`), passer chaque partie XML dans `new DOMParser().parseFromString(x, 'application/xml')` → aucune balise `parsererror` ; le texte corrigé est présent.
6. « Copier le texte » → message « Texte copié » (lire `navigator.clipboard.readText()` si permis).
7. Revenir au document, modifier le filtre d'une page lue → « Texte » : message « modifiée depuis sa lecture », bouton « Relire cette page ».
8. `read_console_messages` (erreurs seulement) : aucune.
9. Capture d'écran de l'écran Texte (preuve).

- [ ] **Step 2 : version construite et hors ligne**

```bash
npm run build
grep -c "modeles/ocr" dist/sw.js
```

Expected : build sans erreur ; `0` (le lecteur n'est pas dans le précache). Puis config « fof-scan-build » (port 4173, `/fof-scan/`) : ouvrir un document → Texte → télécharger le lecteur (servi depuis `dist/modeles/ocr/`) → lecture OK. Arrêter le serveur (`preview_stop`), recharger : l'appli s'ouvre hors ligne et « Relire cette page » fonctionne (lecteur pris dans le cache).

- [ ] **Step 3 : documentation**

Dans `docs/reference-camscanner.md`, section 7, remplacer les deux lignes :

```markdown
| Reconnaissance du texte (OCR) | ✅ morceau 2 : PaddleOCR PP-OCRv6 sur le téléphone (téléchargé une fois, 23 Mo), correction ligne par ligne |
| PDF ↔ Word / Excel | 🟡 scan → Word / Excel fait (morceau 2) ; PDF ↔ Word / Excel : morceau 3 |
```

- [ ] **Step 4 : suite complète et commit**

Run : `npx vitest run` puis `npx tsc --noEmit` ; `git ls-files tests/photos` (vide) — Expected : tout passe.

```bash
git add docs/reference-camscanner.md
git commit -m "Référence CamScanner : OCR et scan vers Word / Excel faits"
```

- [ ] **Step 5 : mémoire et demande de publication**

Mettre à jour `memory/fof-scan.md` (morceau 2 fait, branche, nombre de tests, réglages du tableau, temps de lecture mesurés) et l'index `MEMORY.md`. Expliquer simplement le résultat à l'utilisateur (ce qui marche, temps de lecture, limites : écriture attachée à corriger, tableaux sans traits lus en lignes), puis demander : « Je publie ? Répondez « oui, publie » ». Ne pas pousser sans cette réponse.
