import { useEffect, useRef, useState } from 'preact/hooks';
import { fermerCamera, ouvrirCamera } from '../navigateur/camera';
import { lireImg, versCanvas } from '../navigateur/images';
import { brouillonDepuisCanvas } from '../navigateur/pipeline';
import { ecrirePreference, lirePreference } from '../navigateur/preferences';
import type { PageBrouillon } from '../rangement/modele';
import { traitement } from '../traitement/client';
import { DeclencheurAuto, mettreAEchelle } from '../traitement/geometrie';
import type { Coins } from '../traitement/types';
import { importerFichiers } from './importer';
import { messageErreur, type Nav } from './navigation';

const COTE_APERCU = 480;

export function Viseur({ documentId, dossierId = null, nav, outilPret }: {
  documentId: string | null; dossierId?: string | null; nav: Nav; outilPret: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const entreeImport = useRef<HTMLInputElement>(null);
  const declencheur = useRef<DeclencheurAuto | null>(null);
  const enCapture = useRef(false);
  const [coins, setCoins] = useState<Coins | null>(null);
  const [dims, setDims] = useState({ l: 0, h: 0 });
  const [brouillons, setBrouillons] = useState<PageBrouillon[]>([]);
  const [auto, setAuto] = useState(() => lirePreference('auto', true));
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const [erreur, setErreur] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  async function prendre() {
    const v = video.current;
    if (!v || !v.videoWidth || enCapture.current) return;
    enCapture.current = true;
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    try {
      const b = await brouillonDepuisCanvas(versCanvas(v, v.videoWidth, v.videoHeight, 3000));
      declencheur.current?.captureManuelle(b.detecte ? mettreAEchelle(b.coins, v.videoWidth / b.original.largeur) : null);
      setBrouillons((l) => [...l, b]);
    } catch (e) {
      nav.signaler(messageErreur(e));
    } finally {
      enCapture.current = false;
    }
  }

  useEffect(() => {
    let flux: MediaStream | null = null;
    let arret = false;
    let minuterie = 0;
    ouvrirCamera(video.current!)
      .then((f) => {
        flux = f;
        if (arret) { fermerCamera(f); return; }
        const v = video.current!;
        setDims({ l: v.videoWidth, h: v.videoHeight });
        declencheur.current = new DeclencheurAuto(Math.hypot(v.videoWidth, v.videoHeight));
        const boucle = async () => {
          if (arret) return;
          if (!enCapture.current) {
            try {
              const petit = versCanvas(v, v.videoWidth, v.videoHeight, COTE_APERCU);
              const c = await traitement().detecter(lireImg(petit));
              const enGrand = c ? mettreAEchelle(c, v.videoWidth / petit.width) : null;
              if (!arret) setCoins(enGrand);
              if (autoRef.current && declencheur.current!.observer(enGrand, performance.now())) await prendre();
            } catch {
              // une image ratée n'arrête pas le viseur
            }
          }
          minuterie = window.setTimeout(boucle, 200);
        };
        boucle();
      })
      .catch((e) => setErreur(messageErreur(e)));
    return () => { arret = true; clearTimeout(minuterie); if (flux) fermerCamera(flux); };
  }, []);

  function terminer() {
    if (brouillons.length) nav.aller({ nom: 'recadrage', lot: { documentId, dossierId, brouillons, pageExistante: null } });
  }

  function annuler() {
    nav.aller(documentId ? { nom: 'document', id: documentId } : { nom: 'accueil', dossierId });
  }

  async function importer(fichiers: File[]) {
    try {
      const lot = await importerFichiers(fichiers, documentId, dossierId);
      nav.aller({ nom: 'recadrage', lot: { ...lot, brouillons: [...brouillons, ...lot.brouillons] } });
    } catch (e) {
      nav.signaler(messageErreur(e));
    }
  }

  return (
    <div class="plein">
      <div class="zone">
        <video ref={video} playsInline muted autoPlay />
        {coins && dims.l > 0 && (
          <svg class="calque" viewBox={`0 0 ${dims.l} ${dims.h}`} preserveAspectRatio="xMidYMid meet">
            <polygon points={coins.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(47,179,107,.2)" stroke="#2fb36b" stroke-width={dims.l / 200} />
          </svg>
        )}
        {flash && <div class="calque" style={{ background: '#fff8' }} />}
        {!outilPret && !erreur && <p class="calque-texte">Préparation de l'outil de détection…</p>}
        {erreur && (
          <div class="calque-texte">
            <p>{erreur}</p>
            <button class="principal" onClick={() => entreeImport.current?.click()}>Importer une photo</button>
          </div>
        )}
      </div>
      <div class="commandes">
        <button onClick={annuler}>Annuler</button>
        <button aria-pressed={auto} onClick={() => { setAuto(!auto); ecrirePreference('auto', !auto); }}>
          {auto ? 'Auto' : 'Manuel'}
        </button>
        <button class="declencheur" aria-label="Prendre la photo" onClick={prendre} disabled={!!erreur} />
        <button class="principal" onClick={terminer} disabled={!brouillons.length}>
          Terminé{brouillons.length ? ` (${brouillons.length})` : ''}
        </button>
      </div>
      <input ref={entreeImport} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = Array.from(e.currentTarget.files ?? []); e.currentTarget.value = ''; if (f.length) importer(f); }} />
    </div>
  );
}
