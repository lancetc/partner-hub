"use client";

/*
  The hub's IndexedDB database on this device: the outbox of saves waiting to sync, and the list
  of lessons downloaded for offline use. The service worker (public/sw.js) opens the same database
  to send the outbox in the background, so the names here must match it.
*/

export const DB_NAME = "partner-hub";
export const DB_VERSION = 1;
export type StoreName = "outbox" | "downloads";

let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("downloads")) db.createObjectStore("downloads", { keyPath: "slug" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const idbAll = <T>(store: StoreName) => run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>).then((r) => r ?? []);
export const idbPut = (store: StoreName, value: unknown) => run(store, "readwrite", (s) => void s.put(value));
export const idbDelete = (store: StoreName, key: IDBValidKey) => run(store, "readwrite", (s) => void s.delete(key));
export const idbClear = (store: StoreName) => run(store, "readwrite", (s) => void s.clear());
