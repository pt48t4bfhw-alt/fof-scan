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
