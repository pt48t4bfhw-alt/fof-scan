import { useEffect, useRef, useState } from 'preact/hooks';
import { fabriquerDocx, TYPE_DOCX } from '../export/docx';
import { fabriquerXlsx, TYPE_XLSX } from '../export/xlsx';
import { blocsDePage, texteDuDocument, type Bloc } from '../lecture/contenu';
import type { LecturePage } from '../lecture/modele';
import { installerLecteur, lecteurInstalle, TAILLE_LECTEUR } from '../lecture/telechargement';
import { lirePageScan } from '../navigateur/lecture';
import { copierTexte } from '../navigateur/pressePapiers';
import { nomFichier, tailleLisible } from '../nommage';
import type { Depot } from '../rangement/depot';
import type { DocumentScan, PageScan } from '../rangement/modele';
import { traitement } from '../traitement/client';
import { FichierPret } from './FichierPret';
import { etatPage, lirePages } from './lireDocument';
import { messageErreur, type Nav } from './navigation';
import { PageLue } from './PageLue';

const BASE = import.meta.env.BASE_URL;

/** Texte d'un document : téléchargement du lecteur (une fois), lecture des pages, correction, sorties. */
export function TexteEcran({ id, depot, nav }: { id: string; depot: Depot; nav: Nav }) {
  const [doc, setDoc] = useState<DocumentScan | null>(null);
  const [pages, setPages] = useState<PageScan[]>([]);
  const [lectures, setLectures] = useState<Record<string, LecturePage>>({});
  const [installe, setInstalle] = useState<boolean | null>(null);
  const [telechargement, setTelechargement] = useState<{ fait: number; total: number } | null>(null);
  const [lecture, setLecture] = useState<{ fait: number; total: number } | null>(null);
  const [index, setIndex] = useState(0);
  const annuler = useRef(false);
  const [pret, setPret] = useState<File[] | null>(null);

  useEffect(() => {
    (async () => {
      const d = await depot.lireDocument(id);
      if (!d) { nav.aller({ nom: 'accueil' }); return; }
      const ps = await depot.lirePages(id);
      const ls = await depot.lireLectures(id);
      setDoc(d);
      setPages(ps);
      setLectures(Object.fromEntries(ls.map((l) => [l.pageId, l])));
      const ok = await lecteurInstalle(caches, BASE).catch(() => false);
      setInstalle(ok);
      if (ok) await lire(ps.filter((p) => !ls.some((l) => l.pageId === p.id)));
    })();
    // en quittant l'écran : on arrête après la page en cours et on rend la mémoire du lecteur
    return () => { annuler.current = true; void traitement().liberer().catch(() => undefined); };
  }, [id]);

  async function lire(aLire: PageScan[]) {
    if (!aLire.length) return;
    annuler.current = false;
    const { echecs } = await lirePages(aLire, (p) => lirePageScan(p),
      async (l) => { await depot.enregistrerLecture(l); setLectures((x) => ({ ...x, [l.pageId]: l })); },
      (fait, total) => setLecture({ fait, total }), () => annuler.current);
    setLecture(null);
    if (echecs.length) nav.signaler(`${echecs.length} page(s) n'ont pas pu être lues. Réessayez avec « Relire cette page ».`);
  }

  async function telecharger() {
    setTelechargement({ fait: 0, total: TAILLE_LECTEUR });
    try {
      await installerLecteur(caches, BASE, (u) => fetch(u), (fait, total) => setTelechargement({ fait, total }));
      setInstalle(true);
      setTelechargement(null);
      await lire(pages.filter((p) => !lectures[p.id]));
    } catch (e) {
      setTelechargement(null);
      nav.signaler(messageErreur(e));
    }
  }

  async function relire(p: PageScan) {
    if (lectures[p.id] && !confirm('Relire cette page ? Ses corrections seront perdues.')) return;
    await lire([p]);
  }

  async function enregistrer(l: LecturePage) {
    setLectures((x) => ({ ...x, [l.pageId]: l }));
    try {
      await depot.enregistrerLecture(l);
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  /** Pages lues, dans l'ordre du document (les pages pas encore lues sont sautées). */
  const blocsParPage = (): Bloc[][] => pages.map((p) => lectures[p.id]).filter((l): l is LecturePage => !!l).map(blocsDePage);

  function preparer(sorte: 'docx' | 'xlsx') {
    if (!doc) return;
    try {
      const octets = sorte === 'docx' ? fabriquerDocx(blocsParPage(), doc.nom) : fabriquerXlsx(blocsParPage());
      setPret([new File([octets], nomFichier(doc.nom, sorte), { type: sorte === 'docx' ? TYPE_DOCX : TYPE_XLSX })]);
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  async function copier() {
    try {
      await copierTexte(texteDuDocument(blocsParPage()));
      nav.signaler('Texte copié : collez-le où vous voulez.');
    } catch {
      nav.signaler('Copie impossible sur cet appareil.');
    }
  }

  const nbLues = pages.filter((p) => lectures[p.id]).length;

  const page = pages[Math.min(index, Math.max(0, pages.length - 1))];
  const lu = page ? lectures[page.id] : undefined;
  const etat = page ? etatPage(page, lu) : 'non-lue';

  return (
    <main class="ecran">
      <header class="entete">
        <button aria-label="Retour" onClick={() => nav.aller({ nom: 'document', id })}>‹</button>
        <h1>Texte</h1>
      </header>
      {doc && <p class="doux">{doc.nom}</p>}
      {installe === false && (
        <div class="carte">
          <p>Le lecteur de texte n'est pas encore sur ce téléphone. Il se télécharge une seule fois
            ({tailleLisible(TAILLE_LECTEUR)}), ensuite il marche sans internet.</p>
          {telechargement ? (
            <>
              <span class="doux">Téléchargement… {tailleLisible(telechargement.fait)} sur {tailleLisible(telechargement.total)}</span>
              <div class="progression"><div style={{ width: `${(100 * telechargement.fait) / telechargement.total}%` }} /></div>
            </>
          ) : <button class="principal" onClick={telecharger}>Télécharger le lecteur</button>}
        </div>
      )}
      {lecture && (
        <div class="carte">
          <span class="doux">Lecture de la page {Math.min(lecture.fait + 1, lecture.total)} sur {lecture.total}…</span>
          <div class="progression"><div style={{ width: `${(100 * lecture.fait) / Math.max(1, lecture.total)}%` }} /></div>
          <button onClick={() => { annuler.current = true; }}>Annuler</button>
        </div>
      )}
      {page && pages.length > 1 && (
        <div class="ligne">
          <button aria-label="Page précédente" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹</button>
          <span>Page {index + 1} / {pages.length}</span>
          <button aria-label="Page suivante" disabled={index >= pages.length - 1} onClick={() => setIndex(index + 1)}>›</button>
        </div>
      )}
      {page && etat === 'a-relire' && <p class="doux">Cette page a été modifiée depuis sa lecture.</p>}
      {page && lu && <PageLue key={page.id} page={page} lecture={lu} onChanger={enregistrer} />}
      {page && etat === 'non-lue' && installe && !lecture && <p class="doux">Page pas encore lue.</p>}
      {page && installe && !lecture && (
        <button onClick={() => relire(page)}>{etat === 'non-lue' ? 'Lire cette page' : 'Relire cette page'}</button>
      )}
      <div class="barre-bas compacte">
        <button disabled={!nbLues || !!lecture} onClick={() => preparer('docx')}>Word</button>
        <button disabled={!nbLues || !!lecture} onClick={() => preparer('xlsx')}>Excel</button>
        <button class="principal" disabled={!nbLues || !!lecture} onClick={copier}>Copier le texte</button>
      </div>
      {pret && <FichierPret fichiers={pret} nav={nav} onFermer={() => setPret(null)} />}
    </main>
  );
}
