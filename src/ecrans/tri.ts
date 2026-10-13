import type { DocumentScan, DossierScan } from '../rangement/modele';

export type Tri = 'modifie' | 'cree' | 'nomAZ' | 'nomZA';

export const TRIS: { tri: Tri; nom: string }[] = [
  { tri: 'modifie', nom: 'Date de modification' },
  { tri: 'cree', nom: 'Date de création' },
  { tri: 'nomAZ', nom: 'Nom A → Z' },
  { tri: 'nomZA', nom: 'Nom Z → A' },
];

/** Comparaison des noms à la française, sans tenir compte des majuscules ni des accents. */
const parNom = (a: { nom: string }, b: { nom: string }) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });

export function trierDocuments(docs: DocumentScan[], tri: Tri): DocumentScan[] {
  const l = [...docs];
  switch (tri) {
    case 'modifie': return l.sort((a, b) => b.modifie - a.modifie);
    case 'cree': return l.sort((a, b) => b.cree - a.cree);
    case 'nomAZ': return l.sort(parNom);
    case 'nomZA': return l.sort((a, b) => parNom(b, a));
  }
}

/** Les dossiers suivent le tri par nom ; pour un tri par date, le plus récent en haut. */
export function trierDossiers(dossiers: DossierScan[], tri: Tri): DossierScan[] {
  const l = [...dossiers];
  if (tri === 'nomAZ') return l.sort(parNom);
  if (tri === 'nomZA') return l.sort((a, b) => parNom(b, a));
  return l.sort((a, b) => b.cree - a.cree);
}
