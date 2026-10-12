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
