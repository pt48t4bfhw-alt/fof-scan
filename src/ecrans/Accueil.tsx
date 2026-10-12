import { useEffect, useRef, useState } from 'preact/hooks';
import { dateCourte } from '../nommage';
import type { Depot } from '../rangement/depot';
import type { DocumentScan } from '../rangement/modele';
import { creerSauvegarde, lireSauvegarde, nomSauvegarde } from '../rangement/sauvegarde';
import { FichierPret } from './FichierPret';
import { importerFichiers } from './importer';
import { Miniature } from './Miniature';
import { messageErreur, type Nav } from './navigation';
import { filtrerDocuments } from './recherche';

export function Accueil({ depot, nav }: { depot: Depot; nav: Nav }) {
  const [docs, setDocs] = useState<DocumentScan[] | null>(null);
  const [recherche, setRecherche] = useState('');
  const [menu, setMenu] = useState(false);
  const [pret, setPret] = useState<File[] | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
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

  const visibles = docs ? filtrerDocuments(docs, recherche) : [];
  return (
    <main class="ecran">
      <header class="entete">
        <h1>FOF Scan</h1>
        <button aria-label="Menu" onClick={() => setMenu(true)}>⋯</button>
      </header>
      <input type="search" placeholder="Rechercher un document" value={recherche}
        onInput={(e) => setRecherche(e.currentTarget.value)} />
      {occupe && <><p class="doux">{occupe}</p><div class="progression indeterminee"><div /></div></>}
      {docs?.length === 0 && <p class="doux">Aucun document pour l'instant. Touchez « Scanner » pour commencer.</p>}
      <ul class="liste">
        {visibles.map((d) => (
          <li key={d.id}>
            <button onClick={() => nav.aller({ nom: 'document', id: d.id })}>
              <Miniature depot={depot} pageId={d.pages[0]} />
              <span>
                <strong>{d.nom}</strong><br />
                <span class="doux">{dateCourte(d.modifie)} · {d.pages.length} page{d.pages.length > 1 ? 's' : ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div class="barre-bas">
        <button onClick={() => entreeImport.current?.click()}>Importer</button>
        <button class="principal" onClick={() => nav.aller({ nom: 'viseur', documentId: null })}>Scanner</button>
      </div>
      <input ref={entreeImport} type="file" accept="image/*" multiple hidden
        onChange={(e) => { const f = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; if (f.length) importer(f); }} />
      <input ref={entreeRestaurer} type="file" accept=".zip,application/zip" hidden
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) restaurer(f); }} />
      {menu && (
        <>
          <div class="voile" onClick={() => setMenu(false)} />
          <div class="feuille-actions">
            <button onClick={sauvegarder}>Sauvegarder tout</button>
            <button onClick={() => { setMenu(false); entreeRestaurer.current?.click(); }}>Restaurer une sauvegarde</button>
            <button onClick={() => setMenu(false)}>Fermer</button>
          </div>
        </>
      )}
      {pret && <FichierPret fichiers={pret} nav={nav} onFermer={() => setPret(null)} />}
    </main>
  );
}
