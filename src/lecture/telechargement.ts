/**
 * Le lecteur de texte (23 Mo) n'est pas dans l'installation de l'appli : il se télécharge à la
 * première lecture, puis il est gardé dans le Cache Storage du téléphone pour marcher sans internet.
 */
export const CACHE_LECTEUR = 'fof-scan-lecteur';

export const FICHIERS_LECTEUR = {
  reperage: { nom: 'reperage-ppocrv6-tiny.onnx', taille: 1_780_590 },
  lecture: { nom: 'lecture-ppocrv6-small.onnx', taille: 21_159_378 },
  dictionnaire: { nom: 'dictionnaire-ppocrv6.txt', taille: 74_947 },
} as const;
const LISTE = Object.values(FICHIERS_LECTEUR);
export const TAILLE_LECTEUR = LISTE.reduce((s, f) => s + f.taille, 0);

export const PAS_DE_RESEAU = 'Téléchargement impossible : vérifiez la connexion internet, puis réessayez.';
export const NON_INSTALLE = "Le lecteur de texte n'est pas encore téléchargé.";

type Caches = Pick<CacheStorage, 'open'>;

export const adresseFichier = (base: string, nom: string) => `${base}modeles/ocr/${nom}`;

export async function lecteurInstalle(caches: Caches, base: string): Promise<boolean> {
  const c = await caches.open(CACHE_LECTEUR);
  for (const f of LISTE) if (!(await c.match(adresseFichier(base, f.nom)))) return false;
  return true;
}

/** Télécharge ce qui manque, fichier par fichier ; un fichier n'est rangé qu'une fois reçu en entier. */
export async function installerLecteur(
  caches: Caches,
  base: string,
  telecharger: (url: string) => Promise<Response>,
  progres?: (fait: number, total: number) => void,
): Promise<void> {
  const c = await caches.open(CACHE_LECTEUR);
  let fait = 0;
  for (const f of LISTE) {
    const url = adresseFichier(base, f.nom);
    const debut = fait;
    if (!(await c.match(url))) {
      let reponse: Response;
      try {
        reponse = await telecharger(url);
      } catch {
        throw new Error(PAS_DE_RESEAU);
      }
      if (!reponse.ok) throw new Error(PAS_DE_RESEAU);
      const morceaux: Uint8Array[] = [];
      const lecteur = reponse.body?.getReader();
      try {
        if (lecteur) {
          for (;;) {
            const { done, value } = await lecteur.read();
            if (done) break;
            morceaux.push(value);
            fait += value.length;
            progres?.(Math.min(fait, debut + f.taille), TAILLE_LECTEUR);
          }
        } else {
          morceaux.push(new Uint8Array(await reponse.arrayBuffer()));
        }
      } catch {
        throw new Error(PAS_DE_RESEAU);
      }
      await c.put(url, new Response(new Blob(morceaux)));
    }
    fait = debut + f.taille;
    progres?.(fait, TAILLE_LECTEUR);
  }
}

export async function lireFichiersLecteur(caches: Caches, base: string): Promise<{ reperage: Uint8Array; lecture: Uint8Array; dictionnaire: string }> {
  const c = await caches.open(CACHE_LECTEUR);
  const lire = async (nom: string) => {
    const r = await c.match(adresseFichier(base, nom));
    if (!r) throw new Error(NON_INSTALLE);
    return r;
  };
  return {
    reperage: new Uint8Array(await (await lire(FICHIERS_LECTEUR.reperage.nom)).arrayBuffer()),
    lecture: new Uint8Array(await (await lire(FICHIERS_LECTEUR.lecture.nom)).arrayBuffer()),
    dictionnaire: await (await lire(FICHIERS_LECTEUR.dictionnaire.nom)).text(),
  };
}
