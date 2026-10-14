import { useEffect, useRef, useState } from 'preact/hooks';
import { urlImage } from '../navigateur/images';
import type { PageScan } from '../rangement/modele';
import { borner, doubleToucher, pageApresGlisser, tailleContenue, VUE_INITIALE, zoomerAutour, type Taille, type Vue } from './zoom';

/** Un toucher bref, presque immobile ; deux à moins de 300 ms font un double toucher. */
const TOUCHER_MS = 300;
const TOUCHER_PX = 12;

type Point = { x: number; y: number };
type Geste =
  | { type: 'un'; depart: Point; vue: Vue; t: number; bouge: boolean }
  | { type: 'pincer'; distance: number; milieu: Point };

/**
 * Pages d'un document en plein écran : glisser pour changer de page, deux doigts ou double toucher
 * pour zoomer. Seules la page affichée et ses voisines sont chargées en grand (mémoire de Safari).
 */
export function Visionneuse({ pages, depart, onFermer, onModifier, onSupprimer }: {
  pages: PageScan[];
  depart: number;
  onFermer: () => void;
  onModifier: (p: PageScan) => void;
  onSupprimer: (p: PageScan) => void;
}) {
  const [index, setIndex] = useState(depart);
  const [vue, setVue] = useState<Vue>(VUE_INITIALE);
  const [decalage, setDecalage] = useState(0);
  const [glisse, setGlisse] = useState(false);
  const [cadre, setCadre] = useState<Taille>({ largeur: 1, hauteur: 1 });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const zone = useRef<HTMLDivElement>(null);
  const doigts = useRef(new Map<number, Point>());
  const geste = useRef<Geste | null>(null);
  const dernierToucher = useRef<{ t: number; p: Point } | null>(null);
  const cache = useRef(new Map<string, string>());
  const vueActuelle = useRef(vue);
  vueActuelle.current = vue;

  const i = Math.min(index, pages.length - 1);
  const page = pages[i];

  useEffect(() => { if (!pages.length) onFermer(); }, [pages.length]);
  useEffect(() => { setVue(VUE_INITIALE); }, [i]);

  // la page affichée et ses deux voisines ; les autres images sont libérées
  useEffect(() => {
    const voulues = new Set(pages.slice(Math.max(0, i - 1), i + 2).map((p) => p.id));
    for (const [id, u] of cache.current) if (!voulues.has(id)) { URL.revokeObjectURL(u); cache.current.delete(id); }
    for (const p of pages) if (voulues.has(p.id) && !cache.current.has(p.id)) cache.current.set(p.id, urlImage(p.traitee));
    setUrls(Object.fromEntries(cache.current));
  }, [i, pages]);
  useEffect(() => () => { for (const u of cache.current.values()) URL.revokeObjectURL(u); }, []);

  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const mesurer = () => setCadre({ largeur: el.clientWidth || 1, hauteur: el.clientHeight || 1 });
    mesurer();
    const o = new ResizeObserver(mesurer);
    o.observe(el);
    return () => o.disconnect();
  }, []);

  if (!page) return null;
  const contenue = tailleContenue({ largeur: page.traitee.largeur, hauteur: page.traitee.hauteur }, cadre);

  /** Position du doigt depuis le centre de l'écran. */
  function position(e: PointerEvent): Point {
    const r = zone.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  }

  function debutPincement() {
    const [a, b] = [...doigts.current.values()];
    geste.current = { type: 'pincer', distance: Math.hypot(a.x - b.x, a.y - b.y), milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    setDecalage(0);
  }

  function appui(e: PointerEvent) {
    // la capture échoue pour un doigt déjà levé : sans importance, le geste continue sans elle
    try { zone.current?.setPointerCapture(e.pointerId); } catch { /* rien */ }
    doigts.current.set(e.pointerId, position(e));
    if (doigts.current.size === 2) debutPincement();
    else if (doigts.current.size === 1) {
      geste.current = { type: 'un', depart: position(e), vue, t: Date.now(), bouge: false };
      setGlisse(true);
    }
  }

  function mouvement(e: PointerEvent) {
    if (!doigts.current.has(e.pointerId)) return;
    doigts.current.set(e.pointerId, position(e));
    const g = geste.current;
    if (!g) return;
    if (g.type === 'pincer' && doigts.current.size >= 2) {
      const [a, b] = [...doigts.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // valeurs figées ici : la mise à jour de la vue s'exécute plus tard, après le changement de `g`
      const facteur = distance / Math.max(1, g.distance);
      const dx = milieu.x - g.milieu.x, dy = milieu.y - g.milieu.y;
      setVue((v) => {
        const z = zoomerAutour(v, facteur, milieu, contenue, cadre);
        return borner({ ...z, x: z.x + dx, y: z.y + dy }, contenue, cadre);
      });
      g.distance = distance;
      g.milieu = milieu;
    } else if (g.type === 'un') {
      const p = position(e);
      const dx = p.x - g.depart.x, dy = p.y - g.depart.y;
      if (Math.hypot(dx, dy) > TOUCHER_PX) g.bouge = true;
      if (g.vue.echelle > 1) setVue(borner({ ...g.vue, x: g.vue.x + dx, y: g.vue.y + dy }, contenue, cadre));
      else setDecalage(dx);
    }
  }

  function relache(e: PointerEvent) {
    if (!doigts.current.delete(e.pointerId)) return;
    const g = geste.current;
    if (g?.type === 'pincer') {
      // un doigt reste posé : il continue à déplacer l'image sans la faire sauter
      if (doigts.current.size === 1) {
        const [reste] = [...doigts.current.values()];
        geste.current = { type: 'un', depart: reste, vue: vueActuelle.current, t: 0, bouge: true };
      } else {
        geste.current = null;
        setGlisse(false);
      }
      return;
    }
    geste.current = null;
    setGlisse(false);
    if (g?.type !== 'un') return;
    if (!g.bouge && Date.now() - g.t < TOUCHER_MS) {
      const p = position(e);
      const avant = dernierToucher.current;
      if (avant && Date.now() - avant.t < TOUCHER_MS && Math.hypot(p.x - avant.p.x, p.y - avant.p.y) < 3 * TOUCHER_PX) {
        setVue((v) => doubleToucher(v, p, contenue, cadre));
        dernierToucher.current = null;
      } else dernierToucher.current = { t: Date.now(), p };
    }
    if (g.vue.echelle === 1) setIndex(pageApresGlisser(i, pages.length, decalage, cadre.largeur));
    setDecalage(0);
  }

  return (
    <div class="plein visionneuse">
      <div class="ligne entete-visionneuse">
        <button aria-label="Fermer" onClick={onFermer}>✕</button>
        <span>{i + 1} / {pages.length}</span>
        <span class="vide" />
      </div>
      <div class="zone" ref={zone}
        onPointerDown={appui} onPointerMove={mouvement} onPointerUp={relache} onPointerCancel={relache}>
        <div class="piste" style={{ transform: `translateX(${-i * cadre.largeur + decalage}px)`, transition: glisse ? 'none' : 'transform .25s ease-out' }}>
          {pages.map((p, k) => (
            <div class="diapo" key={p.id}>
              {urls[p.id] && (
                <img src={urls[p.id]} alt={`Page ${k + 1}`} draggable={false}
                  style={k === i ? { transform: `translate(${vue.x}px, ${vue.y}px) scale(${vue.echelle})` } : undefined} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div class="commandes">
        <button onClick={() => onModifier(page)}>Recadrer / filtre</button>
        <button class="danger" onClick={() => onSupprimer(page)}>Supprimer</button>
      </div>
    </div>
  );
}
