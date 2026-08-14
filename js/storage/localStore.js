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

function openDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
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

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.warn("IndexedDB open error:", event.target.error);
      resolve(null); // Fallback gracefully
    };
  });
}

export async function saveExamsToDB(exams) {
  try {
    const db = await openDatabase();
    if (!db) return;

    const tx = db.transaction([STORE_EXAMS], 'readwrite');
    const store = tx.objectStore(STORE_EXAMS);

    await new Promise((res, rej) => {
      const clearReq = store.clear();
      clearReq.onsuccess = res;
      clearReq.onerror = rej;
    });

    for (const exam of exams) {
      store.put(exam);
    }

    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    console.warn("Error saving exams to IndexedDB:", err);
  }
}

export async function loadExamsFromDB() {
  try {
    const db = await openDatabase();
    if (!db) return [];

    return new Promise((resolve, reject) => {
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

    const tx = db.transaction([STORE_SUBMISSIONS], 'readwrite');
    const store = tx.objectStore(STORE_SUBMISSIONS);

    // Clear existing to keep exact sync
    await new Promise((res, rej) => {
      const clearReq = store.clear();
      clearReq.onsuccess = res;
      clearReq.onerror = rej;
    });

    for (const sub of submissions) {
      store.put(sub);
    }

    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    console.warn("Error saving submissions to IndexedDB:", err);
  }
}

export async function loadSubmissionsFromDB() {
  try {
    const db = await openDatabase();
    if (!db) return [];

    return new Promise((resolve, reject) => {
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

    const tx = db.transaction([STORE_SUBMISSIONS], 'readwrite');
    const store = tx.objectStore(STORE_SUBMISSIONS);
    store.put(sub);

    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    console.warn("Error saving submission to IndexedDB:", err);
  }
}

export async function deleteSubmissionFromDB(id) {
  try {
    const db = await openDatabase();
    if (!db) return;

    const tx = db.transaction([STORE_SUBMISSIONS], 'readwrite');
    const store = tx.objectStore(STORE_SUBMISSIONS);
    store.delete(id);

    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    console.warn("Error deleting submission from IndexedDB:", err);
  }
}

export async function clearSubmissionsFromDB() {
  try {
    const db = await openDatabase();
    if (!db) return;

    const tx = db.transaction([STORE_SUBMISSIONS], 'readwrite');
    const store = tx.objectStore(STORE_SUBMISSIONS);
    store.clear();

    return new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    console.warn("Error clearing submissions in IndexedDB:", err);
  }
}
