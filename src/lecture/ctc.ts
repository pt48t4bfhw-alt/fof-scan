/** Dictionnaire du lecteur : un caractère par ligne ; l'espace est ajoutée à la fin, comme dans PaddleOCR. */
export function lireDictionnaire(texte: string): string[] {
  const lignes = texte.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lignes[lignes.length - 1] === '') lignes.pop();
  return [...lignes, ' '];
}

/**
 * Décodage CTC glouton : à chaque pas la classe la plus probable ; on saute le « blanc » (classe 0)
 * et les répétitions. Confiance = moyenne des probabilités des caractères gardés.
 */
export function decoderCTC(probas: Float32Array, pas: number, classes: number, dict: string[]): { texte: string; confiance: number } {
  let texte = '';
  let somme = 0;
  let n = 0;
  let avant = -1;
  for (let t = 0; t < pas; t++) {
    let meilleure = 0;
    let p = -Infinity;
    for (let c = 0; c < classes; c++) {
      const v = probas[t * classes + c];
      if (v > p) { p = v; meilleure = c; }
    }
    if (meilleure !== 0 && meilleure !== avant) {
      texte += dict[meilleure - 1] ?? '';
      somme += p;
      n++;
    }
    avant = meilleure;
  }
  return { texte: texte.trim(), confiance: n ? somme / n : 0 };
}
