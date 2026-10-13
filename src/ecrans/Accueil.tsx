import { useEffect, useRef, useState } from 'preact/hooks';
import { filtreParDefaut } from '../navigateur/pipeline';
import { ecrirePreference, lirePreference } from '../navigateur/preferences';
import { dateCourte } from '../nommage';
import type { Depot } from '../rangement/depot';
import type { DocumentScan, DossierScan } from '../rangement/modele';
import { creerSauvegarde, lireSauvegarde, nomSauvegarde } from '../rangement/sauvegarde';
import type { Filtre } from '../traitement/types';
import { FichierPret } from './FichierPret';
import { importerFichiers } from './importer';
import { Miniature } from './Miniature';
import { MODES, nomDuMode } from './modes';
import { messageErreur, type Nav } from './navigation';
import { filtrerDocuments } from './recherche';
import { SaisieNom } from './SaisieNom';
import { TRIS, trierDocuments, trierDossiers, type Tri } from './tri';

/** Durée d'un appui long (ms) : cocher un document, ou ouvrir les actions d'un dossier. */
const APPUI_LONG_MS = 500;

interface Saisie { titre: string; initial?: string; valider: (nom: string) => Promise<void> }

/** L'accueil (dossierId null) ou l'intérieur d'un dossier. */
export function Accueil({ depot, nav, dossierId }: { depot: Depot; nav: Nav; dossierId: string | null }) {
  const [docs, setDocs] = useState<DocumentScan[] | null>(null);
  const [dossiers, setDossiers] = useState<DossierScan[]>([]);
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<Tri>(() => lirePreference<Tri>('tri', 'modifie'));
  const [menu, setMenu] = useState(false);
  const [choixTri, setChoixTri] = useState(false);
  const [pret, setPret] = useState<File[] | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [choixFiltre, setChoixFiltre] = useState(false);
  const [filtreDefaut, setFiltreDefaut] = useState<Filtre>(filtreParDefaut);
  // Mode sélection : null = désactivé ; sinon les documents cochés, dans l'ordre où on les a cochés.
  const [selection, setSelection] = useState<string[] | null>(null);
  const [choixDeplacement, setChoixDeplacement] = useState(false);
  const [actionsDossier, setActionsDossier] = useState<DossierScan | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const minuterieAppui = useRef(0);
  const appuiLongFait = useRef(false);
  const entreeImport = useRef<HTMLInputElement>(null);
  const entreeRestaurer = useRef<HTMLInputElement>(null);

  const recharger = async () => {
    const [d, f] = await Promise.all([depot.listerDocuments(), depot.listerDossiers()]);
    setDocs(d);
    setDossiers(f);
  };
  useEffect(() => { recharger(); }, []);

  const connus = new Set(dossiers.map((d) => d.id));
  /** Dossier réel d'un document (un dossier disparu compte comme « à l'accueil »). */
  const dossierDe = (d: DocumentScan) => (d.dossierId && connus.has(d.dossierId) ? d.dossierId : null);
  const dossierCourant = dossierId ? dossiers.find((d) => d.id === dossierId) ?? null : null;
  useEffect(() => { if (docs && dossierId && !dossierCourant) nav.aller({ nom: 'accueil', dossierId: null }); }, [docs, dossiers]);

  async function sauvegarder() {
    setMenu(false);
    try {
      const { documents, pages, dossiers: tous } = await depot.toutLire();
      const zip = creerSauvegarde(documents, pages, tous);
      setPret([new File([zip], nomSauvegarde(new Date()), { type: 'application/zip' })]);
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  async function restaurer(fichier: File) {
    setOccupe('Restauration…');
    try {
      const { documents, pages, dossiers: tous } = lireSauvegarde(new Uint8Array(await fichier.arrayBuffer()));
      const { ajoutes, ignores } = await depot.importer(documents, pages, tous);
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
      nav.aller({ nom: 'recadrage', lot: await importerFichiers(fichiers, null, dossierId) });
    } catch (e) {
      nav.signaler(messageErreur(e));
      setOccupe(null);
    }
  }

  // --- appui long : cocher un document / actions d'un dossier ---
  function debutAppui(action: () => void) {
    appuiLongFait.current = false;
    clearTimeout(minuterieAppui.current);
    minuterieAppui.current = window.setTimeout(() => { appuiLongFait.current = true; action(); }, APPUI_LONG_MS);
  }
  const finAppui = () => clearTimeout(minuterieAppui.current);
  /** Un toucher qui suit un appui long ne compte pas (l'appui long a déjà agi). */
  function apresAppui(action: () => void) {
    if (appuiLongFait.current) { appuiLongFait.current = false; return; }
    action();
  }
  const appuis = (long: () => void, court: () => void) => ({
    onPointerDown: () => debutAppui(long), onPointerUp: finAppui, onPointerLeave: finAppui, onPointerCancel: finAppui,
    onClick: () => apresAppui(court),
  });

  // --- sélection de plusieurs documents ---
  const basculer = (id: string) =>
    setSelection((s) => (s ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  const cocher = (id: string) => setSelection((s) => (s ? (s.includes(id) ? s : [...s, id]) : [id]));

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

  async function deplacerVers(cible: string | null, nomCible: string) {
    if (!selection?.length) return;
    try {
      await depot.deplacer(selection, cible);
      nav.signaler(`${selection.length} document(s) rangé(s) dans « ${nomCible} ».`);
      setChoixDeplacement(false);
      setSelection(null);
      await recharger();
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  // --- dossiers ---
  const nouveauDossier = (puis?: (d: DossierScan) => Promise<void>) => setSaisie({
    titre: 'Nouveau dossier',
    valider: async (nom) => { const d = await depot.creerDossier(nom); if (puis) await puis(d); await recharger(); },
  });
  const renommerDossier = (d: DossierScan) => setSaisie({
    titre: 'Renommer le dossier', initial: d.nom,
    valider: async (nom) => { await depot.renommerDossier(d.id, nom); await recharger(); },
  });
  async function supprimerDossier(d: DossierScan) {
    if (!confirm(`Supprimer le dossier « ${d.nom} » ? Ses documents reviendront à l'accueil.`)) return;
    await depot.supprimerDossier(d.id);
    if (dossierId === d.id) nav.aller({ nom: 'accueil', dossierId: null });
    else await recharger();
  }

  // --- ce qu'on affiche ---
  const recherchant = recherche.trim() !== '';
  const documentsVus = !docs ? [] : trierDocuments(
    recherchant ? filtrerDocuments(docs, recherche) : docs.filter((d) => dossierDe(d) === dossierId),
    tri,
  );
  const dossiersVus = !recherchant && !dossierId && !selection ? trierDossiers(dossiers, tri) : [];
  const nombreDans = (id: string) => (docs ?? []).filter((d) => dossierDe(d) === id).length;
  const toutCoche = !!selection && documentsVus.length > 0 && documentsVus.every((d) => selection.includes(d.id));

  return (
    <main class="ecran">
      {selection ? (
        <header class="entete">
          <button onClick={() => setSelection(null)}>Annuler</button>
          <h1>{selection.length} sélectionné{selection.length > 1 ? 's' : ''}</h1>
          <button onClick={() => setSelection(toutCoche ? [] : documentsVus.map((d) => d.id))}>{toutCoche ? 'Aucun' : 'Tout'}</button>
        </header>
      ) : (
        <header class="entete">
          {dossierCourant && <button aria-label="Retour à l'accueil" onClick={() => nav.aller({ nom: 'accueil', dossierId: null })}>‹</button>}
          <h1>{dossierCourant ? dossierCourant.nom : 'FOF Scan'}</h1>
          {documentsVus.length > 0 && <button onClick={() => setSelection([])}>Sélectionner</button>}
          <button aria-label="Menu" onClick={() => setMenu(true)}>⋯</button>
        </header>
      )}
      <div class="ligne">
        <input type="search" placeholder={dossierCourant ? 'Rechercher partout' : 'Rechercher un document'}
          value={recherche} onInput={(e) => setRecherche(e.currentTarget.value)} />
        <button aria-label="Trier" onClick={() => setChoixTri(true)}>⇅</button>
      </div>
      {occupe && <><p class="doux">{occupe}</p><div class="progression indeterminee"><div /></div></>}
      {docs?.length === 0 && !dossiers.length && <p class="doux">Aucun document pour l'instant. Touchez « Scanner » pour commencer.</p>}
      {dossierCourant && docs && documentsVus.length === 0 && !recherchant && (
        <p class="doux">Ce dossier est vide. Scannez ici, ou cochez des documents à l'accueil puis « Déplacer ».</p>
      )}
      <ul class="liste">
        {dossiersVus.map((d) => (
          <li key={d.id}>
            <button class="dossier" {...appuis(() => setActionsDossier(d), () => nav.aller({ nom: 'accueil', dossierId: d.id }))}>
              <span class="vignette icone-dossier" aria-hidden="true">📁</span>
              <span>
                <strong>{d.nom}</strong><br />
                <span class="doux">{nombreDans(d.id)} document{nombreDans(d.id) > 1 ? 's' : ''}</span>
              </span>
            </button>
          </li>
        ))}
        {documentsVus.map((d) => {
          const coche = !!selection?.includes(d.id);
          const dossierDuDoc = recherchant ? dossiers.find((f) => f.id === dossierDe(d)) : undefined;
          return (
            <li key={d.id}>
              <button class={selection ? 'selectionnable' : undefined} aria-pressed={selection ? coche : undefined}
                {...appuis(() => cocher(d.id), () => (selection ? basculer(d.id) : nav.aller({ nom: 'document', id: d.id })))}>
                {selection && <span class={`case-a-cocher${coche ? ' cochee' : ''}`} aria-hidden="true">{coche ? '✓' : ''}</span>}
                <Miniature depot={depot} pageId={d.pages[0]} />
                <span>
                  <strong>{d.nom}</strong><br />
                  <span class="doux">
                    {dateCourte(tri === 'cree' ? d.cree : d.modifie)} · {d.pages.length} page{d.pages.length > 1 ? 's' : ''}
                    {dossierDuDoc ? ` · 📁 ${dossierDuDoc.nom}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selection ? (
        <div class="barre-bas compacte">
          <button class="principal" disabled={!selection.length} onClick={() => nav.aller({ nom: 'export', ids: selection })}>Partager</button>
          <button disabled={!selection.length} onClick={() => setChoixDeplacement(true)}>Déplacer</button>
          <button disabled={selection.length < 2} onClick={fusionner}>Fusionner</button>
          <button class="danger" disabled={!selection.length} onClick={supprimer}>Supprimer</button>
        </div>
      ) : (
        <div class="barre-bas">
          <button onClick={() => entreeImport.current?.click()}>Importer</button>
          <button class="principal" onClick={() => nav.aller({ nom: 'viseur', documentId: null, dossierId })}>Scanner</button>
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
            {dossierCourant ? (
              <>
                <button onClick={() => { setMenu(false); renommerDossier(dossierCourant); }}>Renommer ce dossier</button>
                <button class="danger" onClick={() => { setMenu(false); supprimerDossier(dossierCourant); }}>Supprimer ce dossier</button>
              </>
            ) : (
              <button onClick={() => { setMenu(false); nouveauDossier(); }}>Nouveau dossier</button>
            )}
            <button onClick={() => { setMenu(false); setChoixFiltre(true); }}>Filtre par défaut : {nomDuMode(filtreDefaut)}</button>
            <button onClick={sauvegarder}>Sauvegarder tout</button>
            <button onClick={() => { setMenu(false); entreeRestaurer.current?.click(); }}>Restaurer une sauvegarde</button>
            <button onClick={() => setMenu(false)}>Fermer</button>
          </div>
        </>
      )}
      {choixTri && (
        <>
          <div class="voile" onClick={() => setChoixTri(false)} />
          <div class="feuille-actions">
            <strong>Trier par</strong>
            {TRIS.map(({ tri: t, nom }) => (
              <button key={t} aria-pressed={tri === t} onClick={() => { setTri(t); ecrirePreference('tri', t); setChoixTri(false); }}>{nom}</button>
            ))}
          </div>
        </>
      )}
      {choixDeplacement && (
        <>
          <div class="voile" onClick={() => setChoixDeplacement(false)} />
          <div class="feuille-actions">
            <strong>Ranger {selection?.length} document(s) dans…</strong>
            {dossierId && <button onClick={() => deplacerVers(null, 'Accueil')}>Accueil (hors dossier)</button>}
            {trierDossiers(dossiers, 'nomAZ').filter((d) => d.id !== dossierId).map((d) => (
              <button key={d.id} onClick={() => deplacerVers(d.id, d.nom)}>📁 {d.nom}</button>
            ))}
            <button onClick={() => { setChoixDeplacement(false); nouveauDossier((d) => deplacerVers(d.id, d.nom)); }}>Nouveau dossier…</button>
            <button onClick={() => setChoixDeplacement(false)}>Fermer</button>
          </div>
        </>
      )}
      {actionsDossier && (
        <>
          <div class="voile" onClick={() => setActionsDossier(null)} />
          <div class="feuille-actions">
            <strong>📁 {actionsDossier.nom}</strong>
            <button onClick={() => { const d = actionsDossier; setActionsDossier(null); renommerDossier(d); }}>Renommer</button>
            <button class="danger" onClick={() => { const d = actionsDossier; setActionsDossier(null); supprimerDossier(d); }}>Supprimer</button>
            <button onClick={() => setActionsDossier(null)}>Fermer</button>
          </div>
        </>
      )}
      {saisie && (
        <SaisieNom titre={saisie.titre} initial={saisie.initial} onFermer={() => setSaisie(null)}
          onValider={(nom) => { const s = saisie; setSaisie(null); s.valider(nom).catch((e) => nav.signaler(messageErreur(e))); }} />
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
