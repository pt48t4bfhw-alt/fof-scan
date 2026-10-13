import { useEffect, useRef, useState } from 'preact/hooks';
import { filtreParDefaut } from '../navigateur/pipeline';
import { ecrirePreference } from '../navigateur/preferences';
import { dateCourte } from '../nommage';
import type { Depot } from '../rangement/depot';
import type { DocumentScan } from '../rangement/modele';
import { creerSauvegarde, lireSauvegarde, nomSauvegarde } from '../rangement/sauvegarde';
import type { Filtre } from '../traitement/types';
import { FichierPret } from './FichierPret';
import { importerFichiers } from './importer';
import { Miniature } from './Miniature';
import { MODES, nomDuMode } from './modes';
import { messageErreur, type Nav } from './navigation';
import { filtrerDocuments } from './recherche';

/** Durée d'un appui long (ms) pour passer en mode sélection. */
const APPUI_LONG_MS = 500;

export function Accueil({ depot, nav }: { depot: Depot; nav: Nav }) {
  const [docs, setDocs] = useState<DocumentScan[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [menu, setMenu] = useState(false);
  const [pret, setPret] = useState<File[] | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [choixFiltre, setChoixFiltre] = useState(false);
  const [filtreDefaut, setFiltreDefaut] = useState<Filtre>(filtreParDefaut);
  // Mode sélection : null = désactivé ; sinon les documents cochés, dans l'ordre où on les a cochés.
  const [selection, setSelection] = useState<string[] | null>(null);
  const minuterieAppui = useRef(0);
  const appuiLongFait = useRef(false);
  const entreeImport = useRef<HTMLInputElement>(null);
  const entreeRestaurer = useRef<HTMLInputElement>(null);

  const recharger = () => depot.listerDocuments().then(setDocs);
  useEffect(() => { recharger(); }, []);

  async function sauvegarder() {
    setMenu(false);
    try {
      const { documents, pages } = await depot.toutLire();
      const zip = creerSauvegarde(documents, pages);
      setPret([new File([zip], nomSauvegarde(new Date()), { type: 'application/zip' })]);
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  async function restaurer(fichier: File) {
    setOccupe('Restauration…');
    try {
      const { documents, pages } = lireSauvegarde(new Uint8Array(await fichier.arrayBuffer()));
      const { ajoutes, ignores } = await depot.importer(documents, pages);
      nav.signaler(`${ajoutes} document(s) restauré(s)${ignores ? `, ${ignores} déjà présent(s)` : ''}.`);
      await recharger();
    } catch (e) {
      nav.signaler(messageErreur(e));
    } finally {
      setOccupe(null);
    }
  }

  async function importer(fichiers: File[]) {
    setOccupe('Préparation des photos…');
    try {
      nav.aller({ nom: 'recadrage', lot: await importerFichiers(fichiers, null) });
    } catch (e) {
      nav.signaler(messageErreur(e));
      setOccupe(null);
    }
  }

  // --- sélection de plusieurs documents ---
  const basculer = (id: string) =>
    setSelection((s) => (s ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));

  function debutAppui(id: string) {
    appuiLongFait.current = false;
    clearTimeout(minuterieAppui.current);
    minuterieAppui.current = window.setTimeout(() => {
      appuiLongFait.current = true;
      setSelection((s) => (s ? (s.includes(id) ? s : [...s, id]) : [id]));
    }, APPUI_LONG_MS);
  }
  const finAppui = () => clearTimeout(minuterieAppui.current);

  function toucherDocument(id: string) {
    if (appuiLongFait.current) { appuiLongFait.current = false; return; } // l'appui long a déjà coché
    if (selection) basculer(id);
    else nav.aller({ nom: 'document', id });
  }

  async function fusionner() {
    if (!selection || selection.length < 2 || !docs) return;
    const premier = docs.find((d) => d.id === selection[0]);
    if (!confirm(`Réunir ${selection.length} documents en un seul, « ${premier?.nom} » ?`)) return;
    try {
      await depot.fusionner(selection);
      nav.signaler(`${selection.length} documents réunis dans « ${premier?.nom} ».`);
      setSelection(null);
      await recharger();
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  async function supprimer() {
    if (!selection?.length) return;
    if (!confirm(`Supprimer ${selection.length} document(s) et toutes leurs pages ?`)) return;
    try {
      for (const id of selection) await depot.supprimerDocument(id);
      setSelection(null);
      await recharger();
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  const visibles = docs ? filtrerDocuments(docs, recherche) : [];
  const toutCoche = !!selection && visibles.length > 0 && visibles.every((d) => selection.includes(d.id));

  return (
    <main class="ecran">
      {selection ? (
        <header class="entete">
          <button onClick={() => setSelection(null)}>Annuler</button>
          <h1>{selection.length} sélectionné{selection.length > 1 ? 's' : ''}</h1>
          <button onClick={() => setSelection(toutCoche ? [] : visibles.map((d) => d.id))}>{toutCoche ? 'Aucun' : 'Tout'}</button>
        </header>
      ) : (
        <header class="entete">
          <h1>FOF Scan</h1>
          {!!docs?.length && <button onClick={() => setSelection([])}>Sélectionner</button>}
          <button aria-label="Menu" onClick={() => setMenu(true)}>⋯</button>
        </header>
      )}
      <input type="search" placeholder="Rechercher un document" value={recherche}
        onInput={(e) => setRecherche(e.currentTarget.value)} />
      {occupe && <><p class="doux">{occupe}</p><div class="progression indeterminee"><div /></div></>}
      {docs?.length === 0 && <p class="doux">Aucun document pour l'instant. Touchez « Scanner » pour commencer.</p>}
      <ul class="liste">
        {visibles.map((d) => {
          const coche = !!selection?.includes(d.id);
          return (
            <li key={d.id}>
              <button class={selection ? 'selectionnable' : undefined} aria-pressed={selection ? coche : undefined}
                onPointerDown={() => debutAppui(d.id)} onPointerUp={finAppui} onPointerLeave={finAppui} onPointerCancel={finAppui}
                onClick={() => toucherDocument(d.id)}>
                {selection && <span class={`case-a-cocher${coche ? ' cochee' : ''}`} aria-hidden="true">{coche ? '✓' : ''}</span>}
                <Miniature depot={depot} pageId={d.pages[0]} />
                <span>
                  <strong>{d.nom}</strong><br />
                  <span class="doux">{dateCourte(d.modifie)} · {d.pages.length} page{d.pages.length > 1 ? 's' : ''}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selection ? (
        <div class="barre-bas">
          <button class="principal" disabled={!selection.length} onClick={() => nav.aller({ nom: 'export', ids: selection })}>Partager</button>
          <button disabled={selection.length < 2} onClick={fusionner}>Fusionner</button>
          <button class="danger" disabled={!selection.length} onClick={supprimer}>Supprimer</button>
        </div>
      ) : (
        <div class="barre-bas">
          <button onClick={() => entreeImport.current?.click()}>Importer</button>
          <button class="principal" onClick={() => nav.aller({ nom: 'viseur', documentId: null })}>Scanner</button>
        </div>
      )}
      <input ref={entreeImport} type="file" accept="image/*" multiple hidden
        onChange={(e) => { const f = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; if (f.length) importer(f); }} />
      <input ref={entreeRestaurer} type="file" accept=".zip,application/zip" hidden
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) restaurer(f); }} />
      {menu && (
        <>
          <div class="voile" onClick={() => setMenu(false)} />
          <div class="feuille-actions">
            <button onClick={() => { setMenu(false); setChoixFiltre(true); }}>Filtre par défaut : {nomDuMode(filtreDefaut)}</button>
            <button onClick={sauvegarder}>Sauvegarder tout</button>
            <button onClick={() => { setMenu(false); entreeRestaurer.current?.click(); }}>Restaurer une sauvegarde</button>
            <button onClick={() => setMenu(false)}>Fermer</button>
          </div>
        </>
      )}
      {choixFiltre && (
        <>
          <div class="voile" onClick={() => setChoixFiltre(false)} />
          <div class="feuille-actions">
            <strong>Filtre appliqué aux nouveaux scans</strong>
            {MODES.map(({ filtre, nom }) => (
              <button key={filtre} aria-pressed={filtreDefaut === filtre}
                onClick={() => { ecrirePreference('filtreParDefaut', filtre); setFiltreDefaut(filtre); setChoixFiltre(false); }}>
                {nom}
              </button>
            ))}
          </div>
        </>
      )}
      {pret && <FichierPret fichiers={pret} nav={nav} onFermer={() => setPret(null)} />}
    </main>
  );
}
