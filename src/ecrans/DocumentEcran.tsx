import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { urlImage } from '../navigateur/images';
import type { Depot } from '../rangement/depot';
import type { DocumentScan, PageScan } from '../rangement/modele';
import { importerFichiers } from './importer';
import { messageErreur, type Nav } from './navigation';

export function DocumentEcran({ id, depot, nav }: { id: string; depot: Depot; nav: Nav }) {
  const [doc, setDoc] = useState<DocumentScan | null>(null);
  const [nom, setNom] = useState('');
  const [pages, setPages] = useState<PageScan[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [choisie, setChoisie] = useState<PageScan | null>(null);
  const [ajout, setAjout] = useState(false);
  const [occupe, setOccupe] = useState(false);
  // Changer cette clé recrée la grille : Sortable déplace les éléments lui-même, Preact doit repartir de zéro.
  const [cle, setCle] = useState(0);
  const grille = useRef<HTMLDivElement>(null);
  const entreeImport = useRef<HTMLInputElement>(null);

  async function charger() {
    const d = await depot.lireDocument(id);
    if (!d) { nav.aller({ nom: 'accueil' }); return; }
    setDoc(d);
    setNom(d.nom);
    setPages(await depot.lirePages(id));
  }
  useEffect(() => { charger(); }, [id]);

  useEffect(() => {
    const u: Record<string, string> = {};
    for (const p of pages) u[p.id] = urlImage(p.miniature);
    setUrls(u);
    return () => Object.values(u).forEach((x) => URL.revokeObjectURL(x));
  }, [pages]);

  useEffect(() => {
    if (!grille.current) return;
    const s = Sortable.create(grille.current, {
      animation: 150,
      delay: 250,
      delayOnTouchOnly: true,
      // Glisser géré par Sortable lui-même (souris et doigt), plutôt que par le glisser-déposer natif.
      forceFallback: true,
      dataIdAttr: 'data-id',
      onEnd: async () => {
        try {
          await depot.reordonner(id, s.toArray());
        } catch (e) {
          nav.signaler(messageErreur(e));
        }
        await charger();
        setCle((k) => k + 1);
      },
    });
    return () => s.destroy();
  }, [cle, pages.length]);

  async function renommer() {
    const propre = nom.trim();
    if (!doc || !propre || propre === doc.nom) { setNom(doc?.nom ?? ''); return; }
    try {
      await depot.renommer(id, propre);
      await charger();
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  async function supprimerPage(p: PageScan) {
    setChoisie(null);
    if (!confirm('Supprimer cette page ?')) return;
    await depot.supprimerPage(p.id);
    await charger();
  }

  async function supprimerDocument() {
    if (!doc || !confirm(`Supprimer « ${doc.nom} » et toutes ses pages ?`)) return;
    await depot.supprimerDocument(id);
    nav.aller({ nom: 'accueil' });
  }

  function modifierPage(p: PageScan) {
    nav.aller({
      nom: 'recadrage',
      lot: {
        documentId: id,
        brouillons: [{ original: p.original, coins: p.coins, rotation: p.rotation, filtre: p.filtre, detecte: true }],
        pageExistante: p,
      },
    });
  }

  async function importer(fichiers: File[]) {
    setOccupe(true);
    try {
      nav.aller({ nom: 'recadrage', lot: await importerFichiers(fichiers, id) });
    } catch (e) {
      nav.signaler(messageErreur(e));
      setOccupe(false);
    }
  }

  return (
    <main class="ecran">
      <header class="entete">
        <button aria-label="Retour" onClick={() => nav.aller({ nom: 'accueil' })}>‹</button>
        <input type="text" value={nom} aria-label="Nom du document"
          onInput={(e) => setNom(e.currentTarget.value)} onBlur={renommer}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <button class="danger" onClick={supprimerDocument}>Supprimer</button>
      </header>
      <p class="doux">{pages.length} page{pages.length > 1 ? 's' : ''} · appui long sur une page pour la déplacer</p>
      {occupe && <div class="progression indeterminee"><div /></div>}
      <div class="grille" key={cle} ref={grille}>
        {pages.map((p, k) => (
          <div class="case" key={p.id} data-id={p.id} onClick={() => setChoisie(p)}>
            {urls[p.id] && <img src={urls[p.id]} alt={`Page ${k + 1}`} />}
            <span class="numero">{k + 1}</span>
          </div>
        ))}
      </div>
      <div class="barre-bas">
        <button onClick={() => setAjout(true)}>Ajouter</button>
        <button class="principal" onClick={() => nav.aller({ nom: 'export', id })} disabled={!pages.length}>Exporter</button>
      </div>
      <input ref={entreeImport} type="file" accept="image/*" multiple hidden
        onChange={(e) => { const f = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; if (f.length) importer(f); }} />
      {choisie && (
        <>
          <div class="voile" onClick={() => setChoisie(null)} />
          <div class="feuille-actions">
            <button onClick={() => modifierPage(choisie)}>Recadrer / changer le filtre</button>
            <button class="danger" onClick={() => supprimerPage(choisie)}>Supprimer la page</button>
            <button onClick={() => setChoisie(null)}>Fermer</button>
          </div>
        </>
      )}
      {ajout && (
        <>
          <div class="voile" onClick={() => setAjout(false)} />
          <div class="feuille-actions">
            <button class="principal" onClick={() => nav.aller({ nom: 'viseur', documentId: id })}>Scanner des pages</button>
            <button onClick={() => { setAjout(false); entreeImport.current?.click(); }}>Importer des photos</button>
            <button onClick={() => setAjout(false)}>Fermer</button>
          </div>
        </>
      )}
    </main>
  );
}
