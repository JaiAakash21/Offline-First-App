// IndexedDB wrapper with encrypted records per store
// Stores only encrypted blobs; no plaintext persisted.

const DB_NAME = 'offlineFirstApp';
const DB_VER = 1;

let dbPromise;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Encrypted stores
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('actions')) db.createObjectStore('actions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('timeline')) db.createObjectStore('timeline', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('notifications')) db.createObjectStore('notifications', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('searchIndex')) db.createObjectStore('searchIndex', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(db, store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}

export async function putEncrypted(store, encrypted) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = tx(db, store, 'readwrite').put(encrypted);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function del(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, store, 'readwrite').delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function clear(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, store, 'readwrite').clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
