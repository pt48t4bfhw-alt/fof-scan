import { useRegisterSW } from 'virtual:pwa-register/preact';

export function BandeauMiseAJour() {
  const { needRefresh: [aRecharger], updateServiceWorker } = useRegisterSW();
  if (!aRecharger) return null;
  return (
    <button class="bandeau" onClick={() => updateServiceWorker(true)}>
      Nouvelle version disponible — toucher pour recharger
    </button>
  );
}
