/**
 * localStore.js - Robust IndexedDB & localStorage persistence for OpenMCR
 * Stores full-resolution scanned sheet images, scores, answer keys, and exam metadata locally on the user's device.
 */

const DB_NAME = 'OpenMCR_LocalDB';
const DB_VERSION = 2;
const STORE_SUBMISSIONS = 'submissions';
const STORE_EXAMS = 'exams';
const STORE_CONFIG = 'config';

let dbInstance = null;

export function openDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      console.warn("IndexedDB not supported in this browser. Falling back to memory/localStorage.");
      return resolve(null);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SUBMISSIONS)) {
        db.createObjectStore(STORE_SUBMISSIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_EXAMS)) {
        db.createObjectStore(STORE_EXAMS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
      }
    };

    const timer = setTimeout(() => {
      console.warn("IndexedDB open timed out, proceeding with localStorage.");
      resolve(null);
    }, 2000);

    request.onblocked = () => {
      clearTimeout(timer);
      console.warn("IndexedDB open blocked by another tab.");
      resolve(null);
    };

    request.onsuccess = (event) => {
      clearTimeout(timer);
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      clearTimeout(timer);
      console.warn("IndexedDB open error:", event.target.error);
      resolve(null); // Fallback gracefully
    };
  });
}

export async function saveExamsToDB(exams) {
  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_EXAMS], 'readwrite');
      const store = tx.objectStore(STORE_EXAMS);

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => {
        console.warn("IndexedDB exams tx error:", e.target.error);
        resolve(); // don't crash caller
      };
      tx.onabort = (e) => {
        console.warn("IndexedDB exams tx aborted:", e.target.error);
        resolve();
      };

      store.clear();
      for (const exam of exams) {
        store.put(exam);
      }
    });
  } catch (err) {
    console.warn("Error saving exams to IndexedDB:", err);
  }
}

export async function loadExamsFromDB() {
  try {
    const db = await openDatabase();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_EXAMS], 'readonly');
      const store = tx.objectStore(STORE_EXAMS);
      const req = store.getAll();

      req.onsuccess = () => {
        resolve(req.result || []);
      };

      req.onerror = () => {
        console.warn("Could not read exams from IndexedDB:", req.error);
        resolve([]);
      };
    });
  } catch (err) {
    console.warn("Error loading exams from IndexedDB:", err);
    return [];
  }
}

export async function saveSubmissionsToDB(submissions) {
  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_SUBMISSIONS], 'readwrite');
      const store = tx.objectStore(STORE_SUBMISSIONS);

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => {
        console.warn("IndexedDB submissions tx error:", e.target.error);
        resolve();
      };
      tx.onabort = (e) => {
        console.warn("IndexedDB submissions tx aborted:", e.target.error);
        resolve();
      };

      for (const sub of submissions) {
        if (!sub.imageDataUrl) {
          const req = store.get(sub.id);
          req.onsuccess = () => {
            const existing = req.result;
            if (existing && existing.imageDataUrl) {
              store.put({ ...sub, imageDataUrl: existing.imageDataUrl });
            } else {
              store.put(sub);
            }
          };
        } else {
          store.put(sub);
        }
      }
    });
  } catch (err) {
    console.warn("Error saving submissions to IndexedDB:", err);
  }
}

export async function loadSubmissionsFromDB() {
  try {
    const db = await openDatabase();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_SUBMISSIONS], 'readonly');
      const store = tx.objectStore(STORE_SUBMISSIONS);
      const req = store.getAll();

      req.onsuccess = () => {
        resolve(req.result || []);
      };

      req.onerror = () => {
        console.warn("Could not read submissions from IndexedDB:", req.error);
        resolve([]);
      };
    });
  } catch (err) {
    console.warn("Error loading submissions from IndexedDB:", err);
    return [];
  }
}

export async function saveSingleSubmissionToDB(sub) {
  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_SUBMISSIONS], 'readwrite');
      const store = tx.objectStore(STORE_SUBMISSIONS);

      if (!sub.imageDataUrl) {
        const req = store.get(sub.id);
        req.onsuccess = () => {
          const existing = req.result;
          if (existing && existing.imageDataUrl) {
            store.put({ ...sub, imageDataUrl: existing.imageDataUrl });
          } else {
            store.put(sub);
          }
        };
      } else {
        store.put(sub);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => {
        console.warn("IndexedDB save single submission error:", e.target.error);
        resolve();
      };
    });
  } catch (err) {
    console.warn("Error saving submission to IndexedDB:", err);
  }
}

export async function deleteSubmissionFromDB(id) {
  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_SUBMISSIONS], 'readwrite');
      const store = tx.objectStore(STORE_SUBMISSIONS);
      store.delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => {
        console.warn("IndexedDB delete submission error:", e.target.error);
        resolve();
      };
    });
  } catch (err) {
    console.warn("Error deleting submission from IndexedDB:", err);
  }
}

export async function clearSubmissionsFromDB() {
  try {
    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_SUBMISSIONS], 'readwrite');
      const store = tx.objectStore(STORE_SUBMISSIONS);
      store.clear();

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => {
        console.warn("IndexedDB clear submissions error:", e.target.error);
        resolve();
      };
    });
  } catch (err) {
    console.warn("Error clearing submissions in IndexedDB:", err);
  }
}
