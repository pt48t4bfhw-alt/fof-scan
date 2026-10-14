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
