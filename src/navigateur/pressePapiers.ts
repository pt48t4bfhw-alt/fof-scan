/**
 * Copie du texte dans le presse-papiers. Si le navigateur refuse la méthode moderne, on passe par
 * l'ancienne (un champ caché sélectionné puis « copier »), acceptée par Safari après un toucher.
 */
export async function copierTexte(texte: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texte);
    return;
  } catch {
    // méthode de secours ci-dessous
  }
  const champ = document.createElement('textarea');
  champ.value = texte;
  champ.setAttribute('readonly', '');
  champ.style.position = 'fixed';
  champ.style.opacity = '0';
  document.body.appendChild(champ);
  try {
    champ.select();
    champ.setSelectionRange(0, texte.length);
    if (!document.execCommand('copy')) throw new Error('copie refusée');
  } finally {
    champ.remove();
  }
}
