import { useEffect, useRef, useState } from 'preact/hooks';
import { tournerJpeg, urlImage } from '../navigateur/images';
import type { PageBrouillon } from '../rangement/modele';
import { coinsPleineImage, deplacerCote, milieuCote, ordonnerCoins, tournerCoins } from '../traitement/geometrie';
import type { Coins, Point } from '../traitement/types';
import { messageErreur, retour, type Lot, type Nav } from './navigation';

export function Recadrage({ lot, nav }: { lot: Lot; nav: Nav }) {
  const [brouillons, setBrouillons] = useState(lot.brouillons);
  const [i, setI] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [glisse, setGlisse] = useState<number | null>(null);
  // Glisser d'une poignée de milieu : tout le côté bouge, à partir des coins du début du geste.
  const [glisseCote, setGlisseCote] = useState<{ cote: number; depart: Point; base: Coins } | null>(null);
  // La loupe se place du côté opposé au doigt, pour ne pas cacher le coin qu'on déplace.
  const [loupeADroite, setLoupeADroite] = useState(false);
  const [rotationEnCours, setRotationEnCours] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const b = brouillons[i];

  useEffect(() => {
    const u = urlImage(b.original);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [b.original]);

  const modifier = (m: Partial<PageBrouillon>) =>
    setBrouillons((l) => l.map((x, k) => (k === i ? { ...x, ...m } : x)));

  /** Convertit la position du doigt en coordonnées de la photo (le SVG suit l'affichage de l'image). */
  function pointImage(e: PointerEvent): Point {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return {
      x: Math.min(Math.max(p.x, 0), b.original.largeur),
      y: Math.min(Math.max(p.y, 0), b.original.hauteur),
    };
  }

  function dessinerLoupe(p: Point) {
    const c = loupe.current;
    const im = image.current;
    if (!c || !im) return;
    setLoupeADroite(p.x < b.original.largeur / 2);
    const ctx = c.getContext('2d')!;
    const cote = b.original.largeur / 12;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(im, p.x - cote / 2, p.y - cote / 2, cote, cote, 0, 0, c.width, c.height);
    ctx.strokeStyle = '#2fb36b';
    ctx.beginPath();
    ctx.moveTo(c.width / 2, 0); ctx.lineTo(c.width / 2, c.height);
    ctx.moveTo(0, c.height / 2); ctx.lineTo(c.width, c.height / 2);
    ctx.stroke();
  }

  const dansImage = (p: Point): Point => ({
    x: Math.min(Math.max(p.x, 0), b.original.largeur),
    y: Math.min(Math.max(p.y, 0), b.original.hauteur),
  });

  function bouger(e: PointerEvent) {
    if (glisseCote) {
      const coins = deplacerCote(glisseCote.base, glisseCote.cote, glisseCote.depart, pointImage(e)).map(dansImage) as Coins;
      modifier({ coins });
      dessinerLoupe(milieuCote(coins, glisseCote.cote));
      return;
    }
    if (glisse === null) return;
    const p = pointImage(e);
    modifier({ coins: b.coins.map((c, k) => (k === glisse ? p : c)) as Coins });
    dessinerLoupe(p);
  }

  function lacher() {
    setGlisse(null);
    setGlisseCote(null);
  }

  /** Tourne réellement la photo (et le contour) d'un quart de tour : on voit tout de suite le résultat. */
  async function pivoter() {
    if (rotationEnCours) return;
    setRotationEnCours(true);
    try {
      const original = await tournerJpeg(b.original);
      const coins = tournerCoins(b.coins, b.original.hauteur);
      setBrouillons((l) => l.map((x, k) => (k === i ? { ...x, original, coins } : x)));
    } catch (e) {
      nav.signaler(messageErreur(e));
    } finally {
      setRotationEnCours(false);
    }
  }

  function valider() {
    nav.aller({ nom: 'filtres', lot: { ...lot, brouillons: brouillons.map((x) => ({ ...x, coins: ordonnerCoins(x.coins) })) } });
  }

  const r = b.original.largeur / 25;
  return (
    <div class="plein">
      <div class="zone" onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher}>
        {url && <img ref={image} class="scene" src={url} alt="" />}
        <svg ref={svg} class="calque" viewBox={`0 0 ${b.original.largeur} ${b.original.hauteur}`} preserveAspectRatio="xMidYMid meet">
          <polygon points={b.coins.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(47,179,107,.15)" stroke="#2fb36b" stroke-width={r / 4} />
          {[0, 1, 2, 3].map((cote) => {
            const m = milieuCote(b.coins, cote);
            return (
              <g key={`cote-${cote}`}>
                <circle cx={m.x} cy={m.y} r={r * 0.7} fill="#2fb36b" stroke="#fff" stroke-width={r / 5} />
                <circle cx={m.x} cy={m.y} r={r * 1.6} fill="transparent" style={{ pointerEvents: 'all' }}
                  onPointerDown={(e) => {
                    (e.currentTarget as Element).setPointerCapture(e.pointerId);
                    setGlisseCote({ cote, depart: pointImage(e), base: b.coins });
                    dessinerLoupe(m);
                  }} />
              </g>
            );
          })}
          {b.coins.map((c, k) => (
            <g key={k}>
              <circle cx={c.x} cy={c.y} r={r} fill="rgba(255,255,255,.35)" stroke="#2fb36b" stroke-width={r / 4} />
              <circle cx={c.x} cy={c.y} r={r * 2} fill="transparent" style={{ pointerEvents: 'all' }}
                onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); setGlisse(k); dessinerLoupe(c); }} />
            </g>
          ))}
        </svg>
        <canvas ref={loupe} class="loupe" width={120} height={120} style={{ display: glisse === null && !glisseCote ? 'none' : 'block', ...(loupeADroite ? { left: 'auto', right: '12px' } : {}) }} />
        {!b.detecte && glisse === null && !glisseCote && <p class="calque-texte">Feuille non détectée : placez les coins à la main.</p>}
      </div>
      <div class="commandes">
        <button onClick={() => nav.aller(retour(lot))}>Annuler</button>
        <button onClick={pivoter} disabled={rotationEnCours} aria-label="Tourner d'un quart de tour">↻</button>
        <button onClick={() => modifier({ coins: coinsPleineImage(b.original.largeur, b.original.hauteur) })}>Tout</button>
        {brouillons.length > 1 && (
          <span class="ligne">
            <button onClick={() => setI(i - 1)} disabled={i === 0}>‹</button>
            <span class="doux">{i + 1}/{brouillons.length}</span>
            <button onClick={() => setI(i + 1)} disabled={i === brouillons.length - 1}>›</button>
          </span>
        )}
        <button class="principal" onClick={valider}>Valider</button>
      </div>
    </div>
  );
}
