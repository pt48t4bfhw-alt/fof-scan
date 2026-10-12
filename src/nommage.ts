const deux = (n: number) => String(n).padStart(2, '0');

export function nomParDefaut(d: Date): string {
  return `Scan ${deux(d.getDate())}-${deux(d.getMonth() + 1)}-${d.getFullYear()} ${deux(d.getHours())}h${deux(d.getMinutes())}`;
}

export function nomFichier(nom: string, extension: string): string {
  const propre = nom.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() || 'Scan';
  return `${propre}.${extension}`;
}

export function dateCourte(ms: number): string {
  const d = new Date(ms);
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} ${deux(d.getHours())}h${deux(d.getMinutes())}`;
}

export function tailleLisible(octets: number): string {
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
