import { useEffect, useRef, useState } from 'preact/hooks';
import { lignesHorsTableau } from '../lecture/contenu';
import { CONFIANCE_DOUTEUSE, type LecturePage, type ModeLecture, type Rect } from '../lecture/modele';
import { canvasDePageLue } from '../navigateur/lecture';
import type { PageScan } from '../rangement/modele';

/** Largeur maximale d'un morceau de photo (mémoire de Safari). */
const LARGEUR_MORCEAU = 900;

/**
 * Morceau de la page lue autour d'une ligne ou d'une case. Une ligne écrite à la verticale (texte
 * en marge, comme la référence imprimée au bord des reçus) est tournée d'un quart de tour vers la
 * droite pour se lire à l'horizontale.
 */
function Morceau({ source, rect }: { source: HTMLCanvasElement | null; rect: Rect }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !source) return;
    const marge = 4;
    const x = Math.max(0, rect.x - marge), y = Math.max(0, rect.y - marge);
    const l = Math.max(1, Math.min(source.width - x, rect.largeur + 2 * marge));
    const h = Math.max(1, Math.min(source.height - y, rect.hauteur + 2 * marge));
    const debout = h > 1.5 * l;
    const f = Math.min(1, LARGEUR_MORCEAU / (debout ? h : l));
    const [lf, hf] = [Math.max(1, Math.round(l * f)), Math.max(1, Math.round(h * f))];
    c.width = debout ? hf : lf;
    c.height = debout ? lf : hf;
    const ctx = c.getContext('2d')!;
    if (debout) {
      ctx.translate(c.width, 0);
      ctx.rotate(Math.PI / 2);
    }
    ctx.drawImage(source, x, y, l, h, 0, 0, lf, hf);
  }, [source, rect.x, rect.y, rect.largeur, rect.hauteur]);
  return <canvas ref={ref} class="morceau" />;
}

/** Texte lu : toucher pour le corriger ; il est enregistré en quittant le champ. */
function TexteModifiable({ texte, douteux, onValider }: { texte: string; douteux: boolean; onValider: (t: string) => void }) {
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(texte);
  const champ = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValeur(texte), [texte]);
  // « autofocus » ne vaut que pour un champ présent au chargement de la page : on place le curseur nous-mêmes
  useEffect(() => { if (edition) champ.current?.focus(); }, [edition]);
  if (!edition) {
    return <button class={`texte-lu${douteux ? ' douteux' : ''}`} onClick={() => setEdition(true)}>{texte || '—'}</button>;
  }
  const finir = () => { setEdition(false); if (valeur !== texte) onValider(valeur); };
  return (
    <textarea ref={champ} class="texte-lu" value={valeur} rows={Math.max(1, valeur.split('\n').length)}
      onInput={(e) => setValeur(e.currentTarget.value)} onBlur={finir}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
  );
}

/** Correction d'une case : son morceau de photo au-dessus du champ. */
function EditionCase({ source, rect, texte, onValider, onFermer }: {
  source: HTMLCanvasElement | null; rect: Rect; texte: string; onValider: (t: string) => void; onFermer: () => void;
}) {
  const [valeur, setValeur] = useState(texte);
  const champ = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { champ.current?.focus(); }, []);
  return (
    <>
      <div class="voile" onClick={onFermer} />
      <div class="feuille-actions">
        <Morceau source={source} rect={rect} />
        <textarea ref={champ} class="texte-lu" rows={3} value={valeur} onInput={(e) => setValeur(e.currentTarget.value)} />
        <button class="principal" onClick={() => { onValider(valeur); onFermer(); }}>Valider</button>
        <button onClick={onFermer}>Annuler</button>
      </div>
    </>
  );
}

/** Correction d'une page lue : interrupteur Texte / Tableau, lignes sous leur morceau de photo, grille des cases. */
export function PageLue({ page, lecture, onChanger }: { page: PageScan; lecture: LecturePage; onChanger: (l: LecturePage) => void }) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [caseOuverte, setCaseOuverte] = useState<number | null>(null);

  useEffect(() => {
    let actif = true;
    canvasDePageLue(page, lecture).then((c) => { if (actif) setSource(c); }).catch(() => undefined);
    return () => { actif = false; };
  }, [page.id, page.traitee.octets.length, lecture.sens, lecture.largeur, lecture.hauteur]);

  const changerLigne = (k: number, texte: string) =>
    onChanger({ ...lecture, lignes: lecture.lignes.map((l, i) => (i === k ? { ...l, texte, corrige: true } : l)) });
  const changerCase = (k: number, texte: string) => {
    if (!lecture.tableau) return;
    onChanger({ ...lecture, tableau: { ...lecture.tableau, cases: lecture.tableau.cases.map((c, i) => (i === k ? { ...c, texte, corrige: true } : c)) } });
  };
  const changerMode = (mode: ModeLecture) => onChanger({ ...lecture, mode });

  const t = lecture.mode === 'tableau' ? lecture.tableau : null;
  const { avant, apres } = t ? lignesHorsTableau(lecture) : { avant: lecture.lignes.map((_, k) => k), apres: [] as number[] };

  const carte = (k: number) => {
    const l = lecture.lignes[k];
    return (
      <div class="carte-ligne" key={k}>
        <Morceau source={source} rect={l.rect} />
        <TexteModifiable texte={l.texte} douteux={!l.corrige && l.confiance < CONFIANCE_DOUTEUSE} onValider={(x) => changerLigne(k, x)} />
      </div>
    );
  };

  return (
    <>
      <div class="choix">
        <button aria-pressed={lecture.mode === 'texte'} onClick={() => changerMode('texte')}>Texte</button>
        <button aria-pressed={lecture.mode === 'tableau'} disabled={!lecture.tableau} onClick={() => changerMode('tableau')}>Tableau</button>
      </div>
      {!lecture.lignes.length && <p class="doux">Aucun texte trouvé sur cette page.</p>}
      {avant.map(carte)}
      {t && (
        <div class="defile">
          <div class="grille-tableau" style={{ gridTemplateColumns: `repeat(${t.cols}, minmax(90px, 1fr))` }}>
            {t.cases.map((c, k) => (
              <button key={k} class={`case-tableau${!c.corrige && c.confiance < CONFIANCE_DOUTEUSE ? ' douteux' : ''}`}
                style={{ gridRow: `${c.rang + 1} / span ${c.rangs}`, gridColumn: `${c.col + 1} / span ${c.cols}` }}
                onClick={() => setCaseOuverte(k)}>{c.texte}</button>
            ))}
          </div>
        </div>
      )}
      {apres.map(carte)}
      {t && caseOuverte !== null && t.cases[caseOuverte] && (
        <EditionCase source={source} rect={t.cases[caseOuverte].rect} texte={t.cases[caseOuverte].texte}
          onValider={(x) => changerCase(caseOuverte, x)} onFermer={() => setCaseOuverte(null)} />
      )}
    </>
  );
}
