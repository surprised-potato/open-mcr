/**
 * firebaseModal.js - UI modal controller for Firestore credentials and sync
 */

import { getSavedFirebaseConfig, saveFirebaseConfig, clearFirebaseConfig, initFirebase } from '../firebase/config.js';
import { saveExamToCloud, loadExamsFromCloud } from '../firebase/firestoreService.js';

export function initFirebaseModal(app) {
  const modal = document.getElementById('firebaseModal');
  const btnOpen = document.getElementById('btnOpenFirebaseModal');
  const btnClose = document.getElementById('btnCloseFirebaseModal');
  const btnSave = document.getElementById('btnSaveFirebaseConfig');
  const btnDisconnect = document.getElementById('btnDisconnectFirebase');
  const btnSync = document.getElementById('btnSyncCloudNow');

  const inputApiKey = document.getElementById('fbApiKey');
  const inputProjectId = document.getElementById('fbProjectId');
  const inputAppId = document.getElementById('fbAppId');

  const cloudStatusDot = document.getElementById('cloudStatusDot');
  const cloudStatusText = document.getElementById('cloudStatusText');

  function updateStatusUI(connected, projectName = '') {
    if (connected) {
      cloudStatusDot.style.backgroundColor = '#16a34a'; // green
      cloudStatusText.textContent = `Firestore: ${projectName || 'Connected'}`;
    } else {
      cloudStatusDot.style.backgroundColor = '#94a3b8'; // slate
      cloudStatusText.textContent = 'Local Storage';
    }
  }

  // Load existing config on init
  const saved = getSavedFirebaseConfig();
  if (saved) {
    inputApiKey.value = saved.apiKey || '';
    inputProjectId.value = saved.projectId || '';
    inputAppId.value = saved.appId || '';
    initFirebase(saved).then(res => {
      if (res.connected) {
        updateStatusUI(true, saved.projectId);
      }
    });
  }

  btnOpen.addEventListener('click', () => {
    modal.classList.add('open');
  });

  btnClose.addEventListener('click', () => {
    modal.classList.remove('open');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  btnSave.addEventListener('click', async () => {
    const apiKey = inputApiKey.value.trim();
    const projectId = inputProjectId.value.trim();
    const appId = inputAppId.value.trim();

    if (!apiKey || !projectId) {
      alert("Please fill in at least the Firebase API Key and Project ID.");
      return;
    }

    const config = { apiKey, projectId, appId };
    saveFirebaseConfig(config);

    btnSave.textContent = 'Connecting...';
    btnSave.disabled = true;

    try {
      const res = await initFirebase(config);
      if (res.connected) {
        updateStatusUI(true, projectId);
        alert(`Successfully connected to Firebase Project: ${projectId}`);
        modal.classList.remove('open');
      } else {
        alert(`Failed to connect: ${res.error}`);
        updateStatusUI(false);
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      btnSave.textContent = 'Save & Connect';
      btnSave.disabled = false;
    }
  });

  btnDisconnect.addEventListener('click', () => {
    clearFirebaseConfig();
    inputApiKey.value = '';
    inputProjectId.value = '';
    inputAppId.value = '';
    updateStatusUI(false);
    alert("Firebase credentials disconnected. Running in Local Storage mode.");
  });

  btnSync.addEventListener('click', async () => {
    btnSync.textContent = '⏳ Syncing...';
    btnSync.disabled = true;
    try {
      const validSubs = app.state.submissions.filter(s => !s.error);
      const res = await saveExamToCloud(app.state.examConfig, app.state.answerKeys, validSubs);
      alert(`Exam data & ${validSubs.length} graded scores synced to Firestore!`);
    } catch (err) {
      alert("Sync failed: " + err.message);
    } finally {
      btnSync.textContent = '☁️ Sync Now';
      btnSync.disabled = false;
    }
  });

  return { updateStatusUI };
}
