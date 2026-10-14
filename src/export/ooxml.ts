import { strToU8, zipSync } from 'fflate';

/** Texte sûr dans du XML : caractères spéciaux échappés, caractères de contrôle retirés. */
export function xml(texte: string): string {
  return texte
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ENTETE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Fichier Office : des parties XML rangées dans un zip. */
export function archiver(fichiers: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(fichiers).map(([chemin, contenu]) => [chemin, strToU8(ENTETE + contenu)])), { level: 6 });
}

export const NS_RELATIONS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const NS_PAQUET = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const NS_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types';
