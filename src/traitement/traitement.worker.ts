import * as ort from 'onnxruntime-web/wasm';
import urlMoteur from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { gererDetection, gererRequete } from './coeur';
import { DetecteurIA } from './docaligner';
import { chargerOpenCV } from './opencv';
import type { Reponse, Requete } from './protocole';

const portee = self as unknown as {
  onmessage: ((e: MessageEvent<Requete>) => void) | null;
  postMessage(message: Reponse, transfert?: Transferable[]): void;
};

let chargementIA: Promise<DetecteurIA | null> | null = null;

/** Charge le modèle DocAligner une seule fois ; s'il est indisponible, la méthode classique suffira. */
function chargerIA(): Promise<DetecteurIA | null> {
  if (!chargementIA) {
    chargementIA = (async () => {
      try {
        // un seul fil : GitHub Pages ne permet pas le partage de mémoire entre fils
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.wasmPaths = { wasm: urlMoteur };
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

portee.onmessage = async (e) => {
  const { cv } = await chargerOpenCV();
  const r = e.data;
  if (r.type === 'preparer') void chargerIA(); // l'IA se charge en arrière-plan dès l'ouverture de l'appli
  const reponse = r.type === 'detecter' ? await gererDetection(cv, await chargerIA(), r) : gererRequete(cv, r);
  portee.postMessage(reponse, reponse.ok && reponse.type === 'traiter' ? [reponse.img.data.buffer] : []);
};
