export class ErreurCamera extends Error {
  constructor(public raison: 'refusee' | 'indisponible') {
    super(raison === 'refusee'
      ? "L'accès à l'appareil photo est refusé. Réactivez-le dans Réglages › Safari › Appareil photo."
      : 'Appareil photo indisponible. Utilisez « Importer une photo ».');
    this.name = 'ErreurCamera';
  }
}

/** Ouvre la caméra arrière en demandant la plus grande résolution possible. */
export async function ouvrirCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new ErreurCamera('indisponible');
  let flux: MediaStream;
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    });
  } catch (e) {
    throw new ErreurCamera((e as Error).name === 'NotAllowedError' ? 'refusee' : 'indisponible');
  }
  video.srcObject = flux;
  video.muted = true;
  video.setAttribute('playsinline', '');
  await video.play();
  return flux;
}

export function fermerCamera(flux: MediaStream): void {
  flux.getTracks().forEach((t) => t.stop());
}
