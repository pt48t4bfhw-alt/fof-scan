import { useEffect } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';

/** Vérifie s'il existe une nouvelle version toutes les 30 minutes et à chaque retour dans l'appli. */
const INTERVALLE_MS = 30 * 60 * 1000;

/**
 * Mises à jour automatiques : la nouvelle version est téléchargée en arrière-plan, puis
 * installée d'elle-même dès qu'on est sur l'accueil, pour ne jamais couper un scan en cours.
 */
export function MiseAJourAuto({ surAccueil }: { surAccueil: boolean }) {
  const { needRefresh: [prete], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, enregistrement) {
      if (!enregistrement) return;
      const verifier = () => { enregistrement.update().catch(() => { /* hors ligne : on réessaiera */ }); };
      setInterval(verifier, INTERVALLE_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier(); });
    },
  });

  useEffect(() => {
    if (prete && surAccueil) updateServiceWorker(true);
  }, [prete, surAccueil]);

  if (!prete || surAccueil) return null;
  return (
    <button class="bandeau" onClick={() => updateServiceWorker(true)}>
      Mise à jour prête : elle s'installera au retour à l'accueil (ou touchez ici)
    </button>
  );
}
