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
