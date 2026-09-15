import type { OverlaysByPage, PageDimensionsMap } from '../types';

// Crash-safe backups live in IndexedDB (localStorage's ~5MB string-only quota
// can't hold PDF binaries). Each browser tab gets its own session id, stored in
// sessionStorage, so multiple tabs editing different PDFs never overwrite each other.

const DB_NAME = 'pdf-editor-pro-backups';
const DB_VERSION = 1;
const META_STORE = 'meta';   // overlay edits + pdf name (small, saved on every change)
const FILE_STORE = 'files';  // raw PDF bytes (large, saved once per upload)
const SESSION_KEY = 'pdf-editor-pro-session-id';
const MAX_BACKUPS = 20;

export interface BackupMeta {
  sessionId: string;
  pdfName: string;
  totalPages: number;
  overlays: OverlaysByPage;
  pageDimensions: PageDimensionsMap;
  updatedAt: number;
}

export interface BackupRecord extends BackupMeta {
  pdfBytes: Uint8Array;
}

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Per-tab session id: unique across tabs, survives reloads of the same tab. */
export function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateId();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Start a fresh backup slot (used when uploading a new PDF so the old backup survives). */
export function newSessionId(): string {
  const id = generateId();
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'sessionId' });
        }
        if (!db.objectStoreNames.contains(FILE_STORE)) {
          db.createObjectStore(FILE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// 'strict' flushes to disk before onsuccess — matters when the machine hangs/crashes
function writeTx(db: IDBDatabase, stores: string | string[]): IDBTransaction {
  return db.transaction(stores, 'readwrite', { durability: 'strict' });
}

export async function savePdfBytes(sessionId: string, bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  const tx = writeTx(db, FILE_STORE);
  tx.objectStore(FILE_STORE).put(bytes, sessionId);
  await txDone(tx);
}

export async function saveBackupMeta(meta: BackupMeta): Promise<void> {
  const db = await openDb();
  const tx = writeTx(db, META_STORE);
  tx.objectStore(META_STORE).put(meta);
  await txDone(tx);
  await pruneOldBackups(db);
}

async function pruneOldBackups(db: IDBDatabase): Promise<void> {
  const metas = await requestToPromise(
    db.transaction(META_STORE).objectStore(META_STORE).getAll() as IDBRequest<BackupMeta[]>
  );
  if (metas.length <= MAX_BACKUPS) return;
  metas.sort((a, b) => b.updatedAt - a.updatedAt);
  const stale = metas.slice(MAX_BACKUPS);
  const tx = writeTx(db, [META_STORE, FILE_STORE]);
  for (const m of stale) {
    tx.objectStore(META_STORE).delete(m.sessionId);
    tx.objectStore(FILE_STORE).delete(m.sessionId);
  }
  await txDone(tx);
}

/** All available backups, newest first (PDF bytes not included). */
export async function listBackups(): Promise<BackupMeta[]> {
  const db = await openDb();
  const metas = await requestToPromise(
    db.transaction(META_STORE).objectStore(META_STORE).getAll() as IDBRequest<BackupMeta[]>
  );
  return metas.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getBackup(sessionId: string): Promise<BackupRecord | null> {
  const db = await openDb();
  const meta = await requestToPromise(
    db.transaction(META_STORE).objectStore(META_STORE).get(sessionId) as IDBRequest<BackupMeta | undefined>
  );
  const bytes = await requestToPromise(
    db.transaction(FILE_STORE).objectStore(FILE_STORE).get(sessionId) as IDBRequest<Uint8Array | undefined>
  );
  if (!meta || !bytes) return null;
  return { ...meta, pdfBytes: bytes };
}

export async function deleteBackup(sessionId: string): Promise<void> {
  const db = await openDb();
  const tx = writeTx(db, [META_STORE, FILE_STORE]);
  tx.objectStore(META_STORE).delete(sessionId);
  tx.objectStore(FILE_STORE).delete(sessionId);
  await txDone(tx);
}
