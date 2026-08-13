/**
 * config.js - Firebase configuration and modular SDK initialization
 */

const STORAGE_KEY = 'openmcr_firebase_config';

let firebaseApp = null;
let firestoreDb = null;
let firebaseModules = null;

export function getSavedFirebaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveFirebaseConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save Firebase config:", e);
  }
}

export function clearFirebaseConfig() {
  localStorage.removeItem(STORAGE_KEY);
  firebaseApp = null;
  firestoreDb = null;
}

export async function initFirebase(config = null) {
  const cfg = config || getSavedFirebaseConfig();
  if (!cfg || !cfg.apiKey || !cfg.projectId) {
    return { connected: false, error: 'Firebase not configured.' };
  }

  try {
    if (!firebaseModules) {
      const [appMod, firestoreMod] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js')
      ]);
      firebaseModules = { appMod, firestoreMod };
    }

    const { appMod, firestoreMod } = firebaseModules;
    firebaseApp = appMod.initializeApp(cfg, 'OpenMCR_App_' + Date.now());
    firestoreDb = firestoreMod.getFirestore(firebaseApp);

    return { connected: true, db: firestoreDb, modules: firebaseModules };
  } catch (err) {
    console.error("Firebase connection error:", err);
    return { connected: false, error: err.message };
  }
}

export function getFirestore() {
  return { db: firestoreDb, modules: firebaseModules };
}
