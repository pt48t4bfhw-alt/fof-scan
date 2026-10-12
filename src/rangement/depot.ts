import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DocumentScan, NouvellePage, PageScan } from './modele';

interface Schema extends DBSchema {
  documents: { key: string; value: DocumentScan };
  pages: { key: string; value: PageScan; indexes: { parDocument: string } };
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
  const db = await openDB<Schema>(nomBase, 1, {
    upgrade(base) {
      base.createObjectStore('documents', { keyPath: 'id' });
      base.createObjectStore('pages', { keyPath: 'id' }).createIndex('parDocument', 'documentId');
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

  creerDocument(nom: string): Promise<DocumentScan> {
    const t = this.horloge();
    const doc: DocumentScan = { id: crypto.randomUUID(), nom, cree: t, modifie: t, pages: [] };
    return proteger(async () => { await this.db.put('documents', doc); return doc; });
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

  async toutLire(): Promise<{ documents: DocumentScan[]; pages: PageScan[] }> {
    return { documents: await this.db.getAll('documents'), pages: await this.db.getAll('pages') };
  }

  async importer(documents: DocumentScan[], pages: PageScan[]): Promise<{ ajoutes: number; ignores: number }> {
    let ajoutes = 0;
    let ignores = 0;
    await proteger(async () => {
      const tx = this.db.transaction(['documents', 'pages'], 'readwrite');
      for (const doc of documents) {
        if (await tx.objectStore('documents').get(doc.id)) { ignores++; continue; }
        await tx.objectStore('documents').put(doc);
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
