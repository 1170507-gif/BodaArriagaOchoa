/**
 * Utility to store large files (like videos) in the browser's IndexedDB
 * so they persist across sessions and page reloads.
 */

const DB_NAME = 'WeddingVideoDB';
const DB_VERSION = 1;
const STORE_NAME = 'video_store';
const VIDEO_KEY = 'uploaded_wedding_video';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveVideoToIndexedDB(file: File | Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(file, VIDEO_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getVideoFromIndexedDB(): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(VIDEO_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

export async function clearVideoFromIndexedDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(VIDEO_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
