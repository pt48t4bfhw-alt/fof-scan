/**
 * Ouvre le menu Partager de l'iPhone. Safari exige que l'appel suive directement un toucher :
 * il faut donc préparer les fichiers AVANT, puis appeler cette fonction depuis un bouton.
 */
export async function partagerFichiers(fichiers: File[]): Promise<'partage' | 'telecharge' | 'annule'> {
  if (navigator.canShare?.({ files: fichiers })) {
    try {
      await navigator.share({ files: fichiers });
      return 'partage';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'annule';
      throw e;
    }
  }
  for (const f of fichiers) telecharger(f);
  return 'telecharge';
}

function telecharger(f: File): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(f);
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
