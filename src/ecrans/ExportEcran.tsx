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
