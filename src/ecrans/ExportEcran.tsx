import { useEffect, useState } from 'preact/hooks';
import { OPTIONS_PAR_DEFAUT, preparerExportPlusieurs, type OptionsExport } from '../export/preparer';
import { reencoder } from '../navigateur/images';
import { ecrirePreference, lirePreference } from '../navigateur/preferences';
import type { Depot } from '../rangement/depot';
import type { DocumentScan } from '../rangement/modele';
import { FichierPret } from './FichierPret';
import { messageErreur, type Nav } from './navigation';

/** Choix retenus ; une préférence enregistrée avant l'orientation et les marges reçoit leurs valeurs par défaut. */
const optionsRetenues = (): OptionsExport => ({ ...OPTIONS_PAR_DEFAUT, ...lirePreference<Partial<OptionsExport>>('export', {}) });

/** Export d'un document, ou de plusieurs documents cochés sur l'accueil (un fichier par document). */
export function ExportEcran({ ids, depot, nav }: { ids: string[]; depot: Depot; nav: Nav }) {
  const [docs, setDocs] = useState<DocumentScan[] | null>(null);
  const [options, setOptions] = useState<OptionsExport>(optionsRetenues);
  const [progres, setProgres] = useState<{ fait: number; total: number } | null>(null);
  const [pret, setPret] = useState<File[] | null>(null);
  const retour = () => nav.aller(ids.length === 1 ? { nom: 'document', id: ids[0] } : { nom: 'accueil' });

  useEffect(() => {
    Promise.all(ids.map((id) => depot.lireDocument(id))).then((l) => {
      const trouves = l.filter((d): d is DocumentScan => d !== undefined);
      if (trouves.length) setDocs(trouves); else nav.aller({ nom: 'accueil' });
    });
  }, [ids.join(',')]);

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

  const nbPages = docs?.reduce((s, d) => s + d.pages.length, 0) ?? 0;

  async function preparer() {
    if (!docs) return;
    setProgres({ fait: 0, total: nbPages });
    try {
      const lots = await Promise.all(docs.map(async (doc) => ({ doc, pages: await depot.lirePages(doc.id) })));
      setPret(await preparerExportPlusieurs(lots, options, reencoder, (fait, total) => setProgres({ fait, total })));
    } catch (e) {
      nav.signaler(messageErreur(e));
    } finally {
      setProgres(null);
    }
  }

  return (
    <main class="ecran">
      <header class="entete">
        <button aria-label="Retour" onClick={retour}>‹</button>
        <h1>Exporter</h1>
      </header>
      {docs && (
        <p class="doux">
          {docs.length === 1 ? docs[0].nom : `${docs.length} documents`} · {nbPages} page{nbPages > 1 ? 's' : ''}
          {docs.length > 1 && options.type === 'pdf' ? ' · un PDF par document' : ''}
        </p>
      )}
      <h2>Type</h2>
      {choix('type', [['pdf', 'PDF'], ['jpg', 'Images JPG']])}
      {options.type === 'pdf' && (
        <>
          <h2>Format de page</h2>
          {choix('format', [['a4', 'A4'], ['a5', 'A5'], ['lettre', 'Lettre'], ['legal', 'Légal'], ['reel', 'Taille réelle']])}
          {options.format !== 'reel' && (<><h2>Orientation</h2>{choix('orientation', [['auto', 'Auto'], ['portrait', 'Portrait'], ['paysage', 'Paysage']])}</>)}
          <h2>Marges</h2>
          {choix('marge', [['aucune', 'Aucune'], ['petite', 'Petite (1 cm)'], ['grande', 'Grande (2 cm)']])}
        </>
      )}
      <h2>Qualité</h2>
      {choix('qualite', [['normale', 'Normale'], ['legere', 'Légère (WhatsApp)']])}
      {progres ? (
        <>
          <span class="doux">Préparation {progres.fait}/{progres.total}…</span>
          <div class="progression"><div style={{ width: `${(100 * progres.fait) / Math.max(1, progres.total)}%` }} /></div>
        </>
      ) : (
        <div class="barre-bas">
          <button class="principal" onClick={preparer} disabled={!nbPages}>Préparer</button>
        </div>
      )}
      {pret && <FichierPret fichiers={pret} nav={nav} onFermer={() => setPret(null)} />}
    </main>
  );
}
