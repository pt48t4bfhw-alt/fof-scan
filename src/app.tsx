import { useEffect, useState } from 'preact/hooks';
import { Accueil } from './ecrans/Accueil';
import type { Ecran, Nav } from './ecrans/navigation';
import { Viseur } from './ecrans/Viseur';
import { Recadrage } from './ecrans/Recadrage';
import { Filtres } from './ecrans/Filtres';
import { DocumentEcran } from './ecrans/DocumentEcran';
import { ExportEcran } from './ecrans/ExportEcran';
import { MiseAJourAuto } from './ecrans/MiseAJourAuto';
import { demanderStockagePermanent } from './navigateur/stockage';
import { ouvrirDepot, type Depot } from './rangement/depot';
import { traitement } from './traitement/client';

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
          {ecran.nom === 'viseur' && <Viseur documentId={ecran.documentId} nav={nav} outilPret={outilPret} />}
          {ecran.nom === 'recadrage' && <Recadrage lot={ecran.lot} nav={nav} />}
          {ecran.nom === 'filtres' && <Filtres lot={ecran.lot} depot={depot} nav={nav} />}
          {ecran.nom === 'document' && <DocumentEcran id={ecran.id} depot={depot} nav={nav} />}
          {ecran.nom === 'export' && <ExportEcran ids={ecran.ids} depot={depot} nav={nav} />}
        </>
      )}
      <MiseAJourAuto surAccueil={ecran.nom === 'accueil'} />
      {message && <div class="message" role="alert" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
