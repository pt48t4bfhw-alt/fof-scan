import { useEffect, useState } from 'preact/hooks';
import { rendrePage, traiterBrouillon } from '../navigateur/pipeline';
import type { Depot } from '../rangement/depot';
import type { PageBrouillon } from '../rangement/modele';
import { REGLAGES_NEUTRES, estNeutre, type Filtre, type Reglages, type Rotation } from '../traitement/types';
import { enregistrerLot } from './lot';
import { MODES } from './modes';
import { messageErreur, type Lot, type Nav } from './navigation';

const CURSEURS: { cle: keyof Reglages; nom: string; min: number; max: number }[] = [
  { cle: 'luminosite', nom: 'Luminosité', min: -50, max: 50 },
  { cle: 'contraste', nom: 'Contraste', min: -50, max: 50 },
  { cle: 'detail', nom: 'Détail', min: 0, max: 100 },
];

export function Filtres({ lot, depot, nav }: { lot: Lot; depot: Depot; nav: Nav }) {
  const [brouillons, setBrouillons] = useState(lot.brouillons);
  const [i, setI] = useState(0);
  const [apercu, setApercu] = useState<string | null>(null);
  const [vignettes, setVignettes] = useState<Partial<Record<Filtre, string>>>({});
  const [calcul, setCalcul] = useState(false);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const [enregistrement, setEnregistrement] = useState<{ fait: number; total: number } | null>(null);
  const b = brouillons[i];

  // Aperçu : recalculé un court instant après le dernier changement (curseurs en mouvement).
  useEffect(() => {
    let actif = true;
    const minuterie = setTimeout(() => {
      setCalcul(true);
      traiterBrouillon(b, 1200)
        .then((c) => { if (actif) setApercu(c.toDataURL('image/jpeg', 0.8)); })
        .catch((e) => nav.signaler(messageErreur(e)))
        .finally(() => { if (actif) setCalcul(false); });
    }, 250);
    return () => { actif = false; clearTimeout(minuterie); };
  }, [b]);

  // Vignettes des 5 modes : seulement quand la page, ses coins ou sa rotation changent.
  useEffect(() => {
    let actif = true;
    setVignettes({});
    (async () => {
      for (const { filtre } of MODES) {
        try {
          const c = await traiterBrouillon({ ...b, filtre, reglages: REGLAGES_NEUTRES }, 220);
          if (!actif) return;
          const url = c.toDataURL('image/jpeg', 0.7);
          setVignettes((v) => ({ ...v, [filtre]: url }));
        } catch {
          // une vignette ratée n'empêche pas de choisir le mode
        }
      }
    })();
    return () => { actif = false; };
  }, [b.original, b.coins, b.rotation]);

  const modifier = (m: Partial<PageBrouillon>) => setBrouillons((l) => l.map((x, k) => (k === i ? { ...x, ...m } : x)));
  const changerReglage = (cle: keyof Reglages, valeur: number) =>
    setBrouillons((l) => l.map((x, k) => (k === i ? { ...x, reglages: { ...x.reglages, [cle]: valeur } } : x)));
  /** Tourne la page d'un quart de tour ; part de l'angle à jour pour que les touchers rapides s'additionnent. */
  const pivoter = () =>
    setBrouillons((l) => l.map((x, k) => (k === i ? { ...x, rotation: ((x.rotation + 90) % 360) as Rotation } : x)));
  const pourToutes = () => setBrouillons((l) => l.map((x) => ({ ...x, filtre: b.filtre, reglages: b.reglages })));

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
        <div class="modes">
          {MODES.map(({ filtre, nom }) => (
            <button key={filtre} class="mode" aria-pressed={b.filtre === filtre} onClick={() => modifier({ filtre })}>
              {vignettes[filtre] ? <img src={vignettes[filtre]} alt="" /> : <span class="vignette-vide" />}
              <span>{nom}</span>
            </button>
          ))}
        </div>
        {reglagesOuverts && (
          <div class="curseurs">
            {CURSEURS.map(({ cle, nom, min, max }) => (
              <label key={cle}>
                <span>{nom} <span class="doux">{b.reglages[cle]}</span></span>
                <input type="range" min={min} max={max} step={1} value={b.reglages[cle]}
                  onInput={(e) => changerReglage(cle, Number(e.currentTarget.value))} />
              </label>
            ))}
            <button onClick={() => modifier({ reglages: REGLAGES_NEUTRES })} disabled={estNeutre(b.reglages)}>Remettre à zéro</button>
          </div>
        )}
        <div class="ligne">
          <button aria-pressed={reglagesOuverts} onClick={() => setReglagesOuverts(!reglagesOuverts)}>Réglages</button>
          <button onClick={pivoter} aria-label="Tourner la page d'un quart de tour">↻</button>
          {brouillons.length > 1 && (
            <>
              <button onClick={() => setI(i - 1)} disabled={i === 0}>‹</button>
              <span class="doux">{i + 1}/{brouillons.length}</span>
              <button onClick={() => setI(i + 1)} disabled={i === brouillons.length - 1}>›</button>
              <button onClick={pourToutes}>À toutes</button>
            </>
          )}
        </div>
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
