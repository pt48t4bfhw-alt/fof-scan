import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DocumentScan, DossierScan, NouvellePage, PageScan } from './modele';

interface Schema extends DBSchema {
  documents: { key: string; value: DocumentScan };
  pages: { key: string; value: PageScan; indexes: { parDocument: string } };
  dossiers: { key: string; value: DossierScan };
}

export class ErreurStockagePlein extends Error {
  constructor() {
    super('La mémoire du téléphone est pleine.');
    this.name = 'ErreurStockagePlein';
  }
}

export function estErreurQuota(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'QuotaExceededError';
}

async function proteger<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (estErreurQuota(e)) throw new ErreurStockagePlein();
    throw e;
  }
}

export async function ouvrirDepot(nomBase = 'fof-scan', horloge: () => number = Date.now): Promise<Depot> {
  // Version 2 : ajout des dossiers. Une mémoire de la version 1 garde ses documents (hors dossier).
  const db = await openDB<Schema>(nomBase, 2, {
    upgrade(base, ancienneVersion) {
      if (ancienneVersion < 1) {
        base.createObjectStore('documents', { keyPath: 'id' });
        base.createObjectStore('pages', { keyPath: 'id' }).createIndex('parDocument', 'documentId');
      }
      if (ancienneVersion < 2) base.createObjectStore('dossiers', { keyPath: 'id' });
    },
  });
  return new Depot(db, horloge);
}

export class Depot {
  constructor(private db: IDBPDatabase<Schema>, private horloge: () => number) {}

  async listerDocuments(): Promise<DocumentScan[]> {
    return (await this.db.getAll('documents')).sort((a, b) => b.modifie - a.modifie);
  }

  lireDocument(id: string): Promise<DocumentScan | undefined> {
    return this.db.get('documents', id);
  }

  creerDocument(nom: string, dossierId: string | null = null): Promise<DocumentScan> {
    const t = this.horloge();
    const doc: DocumentScan = { id: crypto.randomUUID(), nom, cree: t, modifie: t, pages: [], dossierId };
    return proteger(async () => { await this.db.put('documents', doc); return doc; });
  }

  // --- dossiers ---

  async listerDossiers(): Promise<DossierScan[]> {
    return (await this.db.getAll('dossiers')).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }

  creerDossier(nom: string): Promise<DossierScan> {
    const dossier: DossierScan = { id: crypto.randomUUID(), nom, cree: this.horloge() };
    return proteger(async () => { await this.db.put('dossiers', dossier); return dossier; });
  }

  async renommerDossier(id: string, nom: string): Promise<void> {
    await proteger(async () => {
      const tx = this.db.transaction('dossiers', 'readwrite');
      const d = await tx.store.get(id);
      if (!d) throw new Error('Dossier introuvable');
      await Promise.all([tx.store.put({ ...d, nom }), tx.done]);
    });
  }

  /** Supprime le dossier ; ses documents reviennent à l'accueil (aucun document n'est perdu). */
  async supprimerDossier(id: string): Promise<void> {
    const tx = this.db.transaction(['dossiers', 'documents'], 'readwrite');
    for (const doc of await tx.objectStore('documents').getAll()) {
      if (doc.dossierId === id) await tx.objectStore('documents').put({ ...doc, dossierId: null });
    }
    await tx.objectStore('dossiers').delete(id);
    await tx.done;
  }

  /** Range des documents dans un dossier (ou à l'accueil avec null). */
  async deplacer(ids: string[], dossierId: string | null): Promise<void> {
    await proteger(async () => {
      const tx = this.db.transaction('documents', 'readwrite');
      for (const id of ids) {
        const doc = await tx.store.get(id);
        if (doc) await tx.store.put({ ...doc, dossierId });
      }
      await tx.done;
    });
  }

  renommer(id: string, nom: string): Promise<void> {
    return this.modifierDocument(id, (d) => { d.nom = nom; });
  }

  async ajouterPage(documentId: string, page: NouvellePage): Promise<PageScan> {
    const complete: PageScan = { ...page, id: crypto.randomUUID(), documentId };
    await proteger(async () => {
      const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
      const doc = await tx.objectStore('documents').get(documentId);
      if (!doc) throw new Error('Document introuvable');
      doc.pages.push(complete.id);
      doc.modifie = this.horloge();
      await Promise.all([tx.objectStore('pages').put(complete), tx.objectStore('documents').put(doc), tx.done]);
    });
    return complete;
  }

  lirePage(id: string): Promise<PageScan | undefined> {
    return this.db.get('pages', id);
  }

  async lirePages(documentId: string): Promise<PageScan[]> {
    const doc = await this.lireDocument(documentId);
    if (!doc) return [];
    const pages = await this.db.getAllFromIndex('pages', 'parDocument', documentId);
    const parId = new Map(pages.map((p) => [p.id, p]));
    return doc.pages.map((id) => parId.get(id)).filter((p): p is PageScan => p !== undefined);
  }

  async mettreAJourPage(page: PageScan): Promise<void> {
    await proteger(async () => {
      const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
      const doc = await tx.objectStore('documents').get(page.documentId);
      if (!doc) throw new Error('Document introuvable');
      doc.modifie = this.horloge();
      await Promise.all([tx.objectStore('pages').put(page), tx.objectStore('documents').put(doc), tx.done]);
    });
  }

  async supprimerPage(pageId: string): Promise<void> {
    const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
    const page = await tx.objectStore('pages').get(pageId);
    if (page) {
      const doc = await tx.objectStore('documents').get(page.documentId);
      if (doc) {
        doc.pages = doc.pages.filter((id) => id !== pageId);
        doc.modifie = this.horloge();
        await tx.objectStore('documents').put(doc);
      }
      await tx.objectStore('pages').delete(pageId);
    }
    await tx.done;
  }

  reordonner(documentId: string, ordre: string[]): Promise<void> {
    return this.modifierDocument(documentId, (d) => {
      if (ordre.length !== d.pages.length || !ordre.every((id) => d.pages.includes(id))) {
        throw new Error('Ordre de pages invalide');
      }
      d.pages = [...ordre];
    });
  }

  async supprimerDocument(id: string): Promise<void> {
    const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
    const cles = await tx.objectStore('pages').index('parDocument').getAllKeys(id);
    await Promise.all([
      ...cles.map((k) => tx.objectStore('pages').delete(k)),
      tx.objectStore('documents').delete(id),
      tx.done,
    ]);
  }

  /**
   * Fusionne les documents dans le premier de la liste : ses pages d'abord, puis celles des
   * suivants dans l'ordre donné ; les autres documents disparaissent. Renvoie l'id du document gardé.
   */
  async fusionner(ids: string[]): Promise<string> {
    if (ids.length < 2) throw new Error('Il faut au moins deux documents à fusionner.');
    const [cibleId, ...autres] = ids;
    await proteger(async () => {
      const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
      const cible = await tx.objectStore('documents').get(cibleId);
      if (!cible) throw new Error('Document introuvable');
      for (const id of autres) {
        const doc = await tx.objectStore('documents').get(id);
        if (!doc) continue;
        for (const pageId of doc.pages) {
          const page = await tx.objectStore('pages').get(pageId);
          if (!page) continue;
          await tx.objectStore('pages').put({ ...page, documentId: cibleId });
          cible.pages.push(pageId);
        }
        await tx.objectStore('documents').delete(id);
      }
      cible.modifie = this.horloge();
      await tx.objectStore('documents').put(cible);
      await tx.done;
    });
    return cibleId;
  }

  async toutLire(): Promise<{ documents: DocumentScan[]; pages: PageScan[]; dossiers: DossierScan[] }> {
    return {
      documents: await this.db.getAll('documents'),
      pages: await this.db.getAll('pages'),
      dossiers: await this.db.getAll('dossiers'),
    };
  }

  /**
   * Restauration : ajoute les dossiers et documents absents (rien n'est dupliqué). Un document
   * dont le dossier n'existe ni ici ni dans la sauvegarde revient à l'accueil.
   */
  async importer(documents: DocumentScan[], pages: PageScan[], dossiers: DossierScan[] = []): Promise<{ ajoutes: number; ignores: number }> {
    let ajoutes = 0;
    let ignores = 0;
    await proteger(async () => {
      const tx = this.db.transaction(['documents', 'pages', 'dossiers'], 'readwrite');
      for (const dossier of dossiers) {
        if (!(await tx.objectStore('dossiers').get(dossier.id))) await tx.objectStore('dossiers').put(dossier);
      }
      for (const doc of documents) {
        if (await tx.objectStore('documents').get(doc.id)) { ignores++; continue; }
        const dossierConnu = !doc.dossierId || (await tx.objectStore('dossiers').get(doc.dossierId));
        await tx.objectStore('documents').put(dossierConnu ? doc : { ...doc, dossierId: null });
        for (const p of pages.filter((x) => x.documentId === doc.id)) await tx.objectStore('pages').put(p);
        ajoutes++;
      }
      await tx.done;
    });
    return { ajoutes, ignores };
  }

  private async modifierDocument(id: string, modifier: (d: DocumentScan) => void): Promise<void> {
    await proteger(async () => {
      const tx = this.db.transaction('documents', 'readwrite');
      const d = await tx.store.get(id);
      if (!d) throw new Error('Document introuvable');
      modifier(d);
      d.modifie = this.horloge();
      await Promise.all([tx.store.put(d), tx.done]);
    });
  }
}
