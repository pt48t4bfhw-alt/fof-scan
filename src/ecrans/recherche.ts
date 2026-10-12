import type { DocumentScan } from '../rangement/modele';

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrerDocuments(docs: DocumentScan[], recherche: string): DocumentScan[] {
  const r = normaliser(recherche.trim());
  return r ? docs.filter((d) => normaliser(d.nom).includes(r)) : docs;
}
