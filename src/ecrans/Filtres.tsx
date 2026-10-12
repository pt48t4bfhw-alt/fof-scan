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
