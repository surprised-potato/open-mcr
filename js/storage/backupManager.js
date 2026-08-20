/**
 * backupManager.js - Comprehensive Backup, Restore, and Storage Management for OpenMCR
 * Handles full workspace exports (.openmcr), migration imports, storage estimation, and cache pruning.
 */

import {
  saveExamsToDB,
  saveSubmissionsToDB,
  clearSubmissionsFromDB,
  loadExamsFromDB,
  loadSubmissionsFromDB
} from './localStore.js';

export class BackupManager {
  constructor(app) {
    this.app = app;
  }

  /**
   * Export full workspace backup containing all exams, answer keys, submissions, and configs
   */
  async exportFullBackup() {
    const exams = this.app.state.exams || [];
    const submissions = this.app.state.submissions || [];
    const activeExamId = this.app.state.activeExamId;

    const payload = {
      format: 'openmcr_archive',
      version: 2,
      exportedAt: new Date().toISOString(),
      activeExamId,
      exams,
      submissions,
      totalExams: exams.length,
      totalSubmissions: submissions.length
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `OpenMCR_Full_Backup_${dateStr}_${Date.now().toString(36)}.openmcr`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { filename, totalExams: exams.length, totalSubmissions: submissions.length };
  }

  /**
   * Export single active exam and its associated submissions
   */
  async exportActiveExamBackup() {
    const activeExam = this.app.getActiveExam();
    if (!activeExam) throw new Error("No active exam to export.");

    const submissions = this.app.getActiveSubmissions();
    const payload = {
      format: 'openmcr_exam_archive',
      version: 2,
      exportedAt: new Date().toISOString(),
      activeExamId: activeExam.id,
      exams: [activeExam],
      submissions,
      totalExams: 1,
      totalSubmissions: submissions.length
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const sanitizedName = (activeExam.name || 'Exam').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `OpenMCR_${sanitizedName}_${new Date().toISOString().slice(0, 10)}.openmcr`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { filename, totalSubmissions: submissions.length };
  }

  /**
   * Import and restore data from an .openmcr / .json backup file
   * @param {File} file - The file to import
   * @param {'merge'|'replace'} mode - Whether to merge with existing data or replace
   */
  async importBackup(file, mode = 'merge') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target.result;
          const parsed = JSON.parse(content);

          if (!parsed.exams || !Array.isArray(parsed.exams)) {
            throw new Error("Invalid backup file: Missing exam definitions.");
          }

          const importedExams = parsed.exams;
          const importedSubmissions = Array.isArray(parsed.submissions) ? parsed.submissions : [];

          if (mode === 'replace') {
            // Replace full state
            this.app.state.exams = importedExams;
            this.app.state.submissions = importedSubmissions;
            this.app.state.activeExamId = parsed.activeExamId || (importedExams[0] ? importedExams[0].id : null);
            this.app.state.selectedScanId = importedSubmissions[0] ? importedSubmissions[0].id : null;

            await saveExamsToDB(this.app.state.exams);
            await clearSubmissionsFromDB();
            await saveSubmissionsToDB(this.app.state.submissions);
          } else {
            // Merge mode: Add missing exams and submissions, update existing
            const existingExamIds = new Set(this.app.state.exams.map(e => e.id));
            const existingSubIds = new Set(this.app.state.submissions.map(s => s.id));

            for (const exam of importedExams) {
              if (existingExamIds.has(exam.id)) {
                // Update existing exam
                const idx = this.app.state.exams.findIndex(e => e.id === exam.id);
                if (idx !== -1) this.app.state.exams[idx] = exam;
              } else {
                this.app.state.exams.push(exam);
              }
            }

            for (const sub of importedSubmissions) {
              if (existingSubIds.has(sub.id)) {
                const idx = this.app.state.submissions.findIndex(s => s.id === sub.id);
                if (idx !== -1) this.app.state.submissions[idx] = sub;
              } else {
                this.app.state.submissions.push(sub);
              }
            }

            if (parsed.activeExamId && this.app.state.exams.some(e => e.id === parsed.activeExamId)) {
              this.app.state.activeExamId = parsed.activeExamId;
            }

            await saveExamsToDB(this.app.state.exams);
            await saveSubmissionsToDB(this.app.state.submissions);
          }

          this.app.saveState();
          this.app.renderAll();

          resolve({
            mode,
            examsCount: importedExams.length,
            submissionsCount: importedSubmissions.length
          });
        } catch (err) {
          reject(new Error(`Failed to parse backup file: ${err.message}`));
        }
      };

      reader.onerror = () => reject(new Error("File reading failed"));
      reader.readAsText(file);
    });
  }

  /**
   * Query IndexedDB storage quota and usage
   */
  async getStorageQuota() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usageMB = (estimate.usage || 0) / (1024 * 1024);
        const quotaMB = (estimate.quota || 0) / (1024 * 1024);
        const percent = quotaMB > 0 ? (usageMB / quotaMB) * 100 : 0;
        return {
          usageMB: usageMB.toFixed(2),
          quotaMB: (quotaMB / 1024).toFixed(1) + ' GB',
          percent: percent.toFixed(1),
          rawUsage: estimate.usage,
          rawQuota: estimate.quota
        };
      } catch (err) {
        console.warn("Storage quota estimate failed:", err);
      }
    }
    return { usageMB: '—', quotaMB: '—', percent: '0' };
  }

  /**
   * Prune and optimize local storage footprint
   */
  async pruneStorage() {
    let prunedCount = 0;
    const subs = this.app.state.submissions || [];

    for (const sub of subs) {
      // Remove temporary runtime fields if any
      if (sub._tempData) {
        delete sub._tempData;
        prunedCount++;
      }
    }

    await saveSubmissionsToDB(subs);
    this.app.saveState();
    return { prunedCount };
  }
}

export function initBackupUI(app) {
  const manager = new BackupManager(app);

  const btnExportFull = document.getElementById('btnExportFullBackup');
  const btnExportActive = document.getElementById('btnExportActiveExamBackup');
  const btnImportBackup = document.getElementById('btnImportBackupFile');
  const fileImportBackup = document.getElementById('fileImportBackupInput');
  const storageUsageText = document.getElementById('storageUsageText');
  const storageProgressFill = document.getElementById('storageProgressFill');
  const btnOptimizeStorage = document.getElementById('btnOptimizeStorage');
  const btnFactoryReset = document.getElementById('btnFactoryResetDB');
  const offlineStatusBadge = document.getElementById('offlineStatusBadge');

  async function updateStorageDisplay() {
    if (!storageUsageText) return;
    const quota = await manager.getStorageQuota();
    storageUsageText.textContent = `${quota.usageMB} MB Used / ${quota.quotaMB} Quota (${quota.percent}%)`;
    if (storageProgressFill) {
      storageProgressFill.style.width = `${Math.min(100, Math.max(1, parseFloat(quota.percent) || 1))}%`;
    }
  }

  if (btnExportFull) {
    btnExportFull.addEventListener('click', async () => {
      try {
        btnExportFull.disabled = true;
        btnExportFull.textContent = '⏳ Exporting...';
        const res = await manager.exportFullBackup();
        alert(`✅ Full workspace backup exported successfully!\n${res.totalExams} Exam(s), ${res.totalSubmissions} Student Sheet(s).`);
      } catch (err) {
        alert("Export failed: " + err.message);
      } finally {
        btnExportFull.disabled = false;
        btnExportFull.textContent = '📤 Export Full Workspace Backup (.openmcr)';
      }
    });
  }

  if (btnExportActive) {
    btnExportActive.addEventListener('click', async () => {
      try {
        btnExportActive.disabled = true;
        btnExportActive.textContent = '⏳ Exporting...';
        const res = await manager.exportActiveExamBackup();
        alert(`✅ Active exam backup exported successfully!\n${res.totalSubmissions} Student Sheet(s).`);
      } catch (err) {
        alert("Export failed: " + err.message);
      } finally {
        btnExportActive.disabled = false;
        btnExportActive.textContent = '📦 Export Active Exam Only';
      }
    });
  }

  if (btnImportBackup && fileImportBackup) {
    btnImportBackup.addEventListener('click', () => fileImportBackup.click());
    fileImportBackup.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const mode = confirm("Restore Mode:\n\nClick [OK] to MERGE with existing exams.\nClick [Cancel] to completely REPLACE current database.") ? 'merge' : 'replace';
      
      try {
        const res = await manager.importBackup(file, mode);
        alert(`✅ Backup imported successfully (${res.mode.toUpperCase()})!\n${res.examsCount} Exam(s) loaded, ${res.submissionsCount} Sheet(s) ready.`);
        updateStorageDisplay();
      } catch (err) {
        alert("Import error: " + err.message);
      } finally {
        fileImportBackup.value = '';
      }
    });
  }

  if (btnOptimizeStorage) {
    btnOptimizeStorage.addEventListener('click', async () => {
      btnOptimizeStorage.disabled = true;
      btnOptimizeStorage.textContent = '⏳ Optimizing...';
      try {
        await manager.pruneStorage();
        await updateStorageDisplay();
        alert("✅ Local storage optimized and cache refreshed.");
      } catch (err) {
        alert("Optimization error: " + err.message);
      } finally {
        btnOptimizeStorage.disabled = false;
        btnOptimizeStorage.textContent = '🧹 Optimize & Refresh Storage';
      }
    });
  }

  if (btnFactoryReset) {
    btnFactoryReset.addEventListener('click', async () => {
      if (confirm("⚠️ WARNING: This will permanently delete ALL exams, answer keys, and scanned sheets from this device.\n\nAre you sure you want to reset OpenMCR to default factory state?")) {
        localStorage.clear();
        await clearSubmissionsFromDB();
        location.reload();
      }
    });
  }

  // Update offline status
  function updateOfflineStatus() {
    if (!offlineStatusBadge) return;
    if (navigator.onLine) {
      offlineStatusBadge.textContent = '🟢 Online / Offline-Ready';
      offlineStatusBadge.className = 'badge badge-mint';
      offlineStatusBadge.title = 'OpenMCR works completely offline without an internet connection.';
    } else {
      offlineStatusBadge.textContent = '⚡ Offline Mode (Active)';
      offlineStatusBadge.className = 'badge badge-sky';
      offlineStatusBadge.title = 'Running locally from browser offline cache.';
    }
  }

  window.addEventListener('online', updateOfflineStatus);
  window.addEventListener('offline', updateOfflineStatus);
  updateOfflineStatus();
  updateStorageDisplay();

  return { manager, updateStorageDisplay };
}
