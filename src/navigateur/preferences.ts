const PREFIXE = 'fof-scan:';

export function lirePreference<T>(cle: string, defaut: T): T {
  try {
    const v = localStorage.getItem(PREFIXE + cle);
    return v === null ? defaut : (JSON.parse(v) as T);
  } catch {
    return defaut;
  }
}

export function ecrirePreference(cle: string, valeur: unknown): void {
  try {
    localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
  } catch {
    // stockage indisponible (navigation privée) : la préférence n'est simplement pas retenue
  }
}
