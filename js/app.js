/**
 * app.js - Main Application Coordinator for OpenMCR Web
 * Organizes multiple exams, answer keys, scan queues, and student rosters by Exam Title.
 */

import { scoreSubmission } from './omr/scorer.js';
import { initKeyEditor } from './ui/keyEditor.js';
import { initScanner } from './ui/scanner.js';
import { initInspector } from './ui/inspector.js';
import { initResultsTable } from './ui/resultsTable.js';
import { initAnalytics } from './ui/analytics.js';
import { initFirebaseModal } from './ui/firebaseModal.js';
import { initSheetViewer } from './ui/sheetViewer.js';
import {
  saveExamsToDB,
  loadExamsFromDB,
  saveSubmissionsToDB,
  loadSubmissionsFromDB,
  deleteSubmissionFromDB,
  clearSubmissionsFromDB
} from './storage/localStore.js';

const STORAGE_STATE_KEY = 'openmcr_app_state';

class OpenMCRApp {
  constructor() {
    this.state = this.loadInitialState();
    this.ui = {};
  }

  loadInitialState() {
    const defaultExam = {
      id: `exam_${Date.now()}`,
      name: 'Physics 101 Midterm',
      variant: '75',
      courseId: 'PHY2048',
      multiAsF: false,
      emptyAsG: false,
      sortByName: true,
      answerKeys: {
        '*': Array(75).fill('A'),
        'A': Array(75).fill('A')
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const saved = localStorage.getItem(STORAGE_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        let exams = parsed.exams;
        if (!exams || exams.length === 0) {
          if (parsed.examConfig) {
            exams = [{
              id: parsed.examConfig.id || `exam_${Date.now()}`,
              name: parsed.examConfig.name || 'Physics 101 Midterm',
              variant: parsed.examConfig.variant || '75',
              courseId: parsed.examConfig.courseId || 'PHY2048',
              multiAsF: Boolean(parsed.examConfig.multiAsF),
              emptyAsG: Boolean(parsed.examConfig.emptyAsG),
              sortByName: parsed.examConfig.sortByName !== undefined ? parsed.examConfig.sortByName : true,
              answerKeys: parsed.answerKeys || { '*': Array(75).fill('A'), 'A': Array(75).fill('A') },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }];
          } else {
            exams = [defaultExam];
          }
        }

        const activeExamId = parsed.activeExamId && exams.some(e => e.id === parsed.activeExamId)
          ? parsed.activeExamId
          : exams[0].id;

        const submissions = (parsed.submissions || []).map(s => ({
          ...s,
          examId: s.examId || activeExamId
        }));

        const stateObj = {
          activeExamId,
          exams,
          submissions,
          selectedScanId: parsed.selectedScanId || null,
          activeTab: 'setup'
        };

        this.bindStateProxies(stateObj);
        return stateObj;
      }
    } catch (e) {
      console.warn("Could not load saved state:", e);
    }

    const stateObj = {
      activeExamId: defaultExam.id,
      exams: [defaultExam],
      submissions: [],
      selectedScanId: null,
      activeTab: 'setup'
    };
    this.bindStateProxies(stateObj);
    return stateObj;
  }

  bindStateProxies(stateObj) {
    const self = this;
    Object.defineProperty(stateObj, 'examConfig', {
      get() {
        if (self.state) return self.getActiveExam() || (stateObj.exams && stateObj.exams[0]);
        return (stateObj.exams || []).find(e => e.id === stateObj.activeExamId) || (stateObj.exams && stateObj.exams[0]);
      },
      configurable: true
    });
    Object.defineProperty(stateObj, 'answerKeys', {
      get() {
        const exam = self.state ? self.getActiveExam() : ((stateObj.exams || []).find(e => e.id === stateObj.activeExamId) || (stateObj.exams && stateObj.exams[0]));
        return exam ? exam.answerKeys : {};
      },
      set(newKeys) {
        const exam = self.state ? self.getActiveExam() : ((stateObj.exams || []).find(e => e.id === stateObj.activeExamId) || (stateObj.exams && stateObj.exams[0]));
        if (exam) exam.answerKeys = newKeys;
      },
      configurable: true
    });
  }

  getActiveExam() {
    const exams = (this.state && this.state.exams) || [];
    if (exams.length === 0) return null;
    return exams.find(e => e.id === (this.state && this.state.activeExamId)) || exams[0];
  }

  getActiveSubmissions() {
    const active = this.getActiveExam();
    if (!active) return (this.state && this.state.submissions) || [];
    const validExamIds = new Set(((this.state && this.state.exams) || []).map(e => e.id));
    return ((this.state && this.state.submissions) || []).filter(s => !s.examId || s.examId === active.id || !validExamIds.has(s.examId));
  }

  saveState() {
    try {
      const active = this.getActiveExam();
      if (active) {
        active.updatedAt = new Date().toISOString();
      }
      const copy = {
        activeExamId: this.state.activeExamId,
        exams: this.state.exams,
        submissions: this.state.submissions.map(s => {
          const { imageDataUrl, ...rest } = s;
          return rest;
        }),
        selectedScanId: this.state.selectedScanId
      };
      localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(copy));

      saveExamsToDB(this.state.exams);
      saveSubmissionsToDB(this.state.submissions);
    } catch (e) {
      console.warn("Could not persist state:", e);
    }
  }

  async init() {
    // 1. Bind Navigation Tabs
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // 2. Bind Exam Session Bar Controls
    const selectActiveExam = document.getElementById('selectActiveExam');
    const btnNewExamPrompt = document.getElementById('btnNewExamPrompt');
    const btnNewExamInSetup = document.getElementById('btnNewExamInSetup');
    const btnRenameExam = document.getElementById('btnRenameExam');
    const btnDeleteExam = document.getElementById('btnDeleteExam');

    if (selectActiveExam) {
      selectActiveExam.addEventListener('change', (e) => {
        this.switchExam(e.target.value);
      });
    }

    const handleCreateExam = () => {
      const title = prompt("Enter new Exam Title (e.g. 'Chemistry Quiz 2', 'Calculus Final Exam'):");
      if (title && title.trim()) {
        this.createExam(title.trim());
      }
    };

    if (btnNewExamPrompt) btnNewExamPrompt.addEventListener('click', handleCreateExam);
    if (btnNewExamInSetup) btnNewExamInSetup.addEventListener('click', handleCreateExam);

    if (btnRenameExam) {
      btnRenameExam.addEventListener('click', () => {
        const active = this.getActiveExam();
        const newTitle = prompt("Rename active exam title:", active.name);
        if (newTitle && newTitle.trim() && newTitle.trim() !== active.name) {
          this.renameActiveExam(newTitle.trim());
        }
      });
    }

    if (btnDeleteExam) {
      btnDeleteExam.addEventListener('click', () => {
        this.deleteActiveExam();
      });
    }

    // 3. Bind Setup Inputs
    const inputExamName = document.getElementById('inputExamName');
    const selectVariant = document.getElementById('selectFormVariant');
    const inputCourseId = document.getElementById('inputCourseId');
    const chkMultiAsF = document.getElementById('chkMultiAsF');
    const chkEmptyAsG = document.getElementById('chkEmptyAsG');
    const chkSortByName = document.getElementById('chkSortByName');

    inputExamName.addEventListener('input', () => {
      this.getActiveExam().name = inputExamName.value;
      this.saveState();
      this.renderExamBar();
    });

    selectVariant.addEventListener('change', () => {
      const active = this.getActiveExam();
      active.variant = selectVariant.value;
      const numQ = active.variant === '150' ? 150 : 75;
      // Adjust answer keys size
      for (const form of Object.keys(active.answerKeys)) {
        if (active.answerKeys[form].length !== numQ) {
          active.answerKeys[form] = Array(numQ).fill('A');
        }
      }
      this.saveState();
      this.renderExamBar();
      this.ui.keyEditor.renderKeyMatrix();
      this.recalculateAllScores();
    });

    inputCourseId.addEventListener('input', () => {
      this.getActiveExam().courseId = inputCourseId.value;
      this.saveState();
      this.renderAllExamsTable();
    });

    chkMultiAsF.addEventListener('change', () => {
      this.getActiveExam().multiAsF = chkMultiAsF.checked;
      this.saveState();
    });

    chkEmptyAsG.addEventListener('change', () => {
      this.getActiveExam().emptyAsG = chkEmptyAsG.checked;
      this.saveState();
    });

    chkSortByName.addEventListener('change', () => {
      this.getActiveExam().sortByName = chkSortByName.checked;
      this.saveState();
      this.renderResults();
    });

    document.getElementById('btnProceedToKeys').addEventListener('click', () => {
      this.switchTab('keys');
    });

    // Immediate initial sync and render from localStorage
    this.syncActiveExamToInputs();
    this.renderExamBar();
    this.renderAllExamsTable();

    // 4. Initialize Child Components
    this.ui.keyEditor = initKeyEditor(this);
    this.ui.scanner = initScanner(this);
    this.ui.inspector = initInspector(this);
    this.ui.resultsTable = initResultsTable(this);
    this.ui.analytics = initAnalytics(this);
    this.ui.firebaseModal = initFirebaseModal(this);
    this.ui.sheetViewer = initSheetViewer(this);

    // 5. Restore Exams & Submissions from IndexedDB
    try {
      const storedExams = await loadExamsFromDB();
      if (storedExams && storedExams.length > 0) {
        const examMap = new Map();
        for (const e of storedExams) examMap.set(e.id, e);
        if (this.state.exams) {
          for (const e of this.state.exams) {
            if (!examMap.has(e.id)) {
              examMap.set(e.id, e);
            } else {
              const dbExam = examMap.get(e.id);
              const stateTime = new Date(e.updatedAt || 0).getTime();
              const dbTime = new Date(dbExam.updatedAt || 0).getTime();
              if (stateTime > dbTime) {
                examMap.set(e.id, e);
              }
            }
          }
        }
        this.state.exams = Array.from(examMap.values());
        if (!this.state.exams.some(e => e.id === this.state.activeExamId)) {
          this.state.activeExamId = this.state.exams[0].id;
        }
      }

      const storedSubs = await loadSubmissionsFromDB();
      if (storedSubs && storedSubs.length > 0) {
        const subMap = new Map();
        for (const s of storedSubs) subMap.set(s.id, s);
        for (const s of this.state.submissions) {
          if (!subMap.has(s.id)) {
            subMap.set(s.id, s);
          } else {
            const dbSub = subMap.get(s.id);
            subMap.set(s.id, {
              ...dbSub,
              ...s,
              imageDataUrl: s.imageDataUrl || dbSub.imageDataUrl || null
            });
          }
        }
        this.state.submissions = Array.from(subMap.values());
      }
    } catch (e) {
      console.warn("Could not restore data from IndexedDB:", e);
    }

    this.syncActiveExamToInputs();
    this.renderAll();
  }

  syncActiveExamToInputs() {
    const active = this.getActiveExam();
    if (!active) return;
    const inputExamName = document.getElementById('inputExamName');
    const selectVariant = document.getElementById('selectFormVariant');
    const inputCourseId = document.getElementById('inputCourseId');
    const chkMultiAsF = document.getElementById('chkMultiAsF');
    const chkEmptyAsG = document.getElementById('chkEmptyAsG');
    const chkSortByName = document.getElementById('chkSortByName');

    if (inputExamName) inputExamName.value = active.name || '';
    if (selectVariant) selectVariant.value = active.variant || '75';
    if (inputCourseId) inputCourseId.value = active.courseId || '';
    if (chkMultiAsF) chkMultiAsF.checked = Boolean(active.multiAsF);
    if (chkEmptyAsG) chkEmptyAsG.checked = Boolean(active.emptyAsG);
    if (chkSortByName) chkSortByName.checked = Boolean(active.sortByName);

    this.renderExamBar();
    this.renderAllExamsTable();
    if (this.ui.keyEditor) this.ui.keyEditor.renderKeyMatrix();
  }

  createExam(title, variant = '75', courseId = '') {
    const numQ = variant === '150' ? 150 : 75;
    const newExam = {
      id: `exam_${Date.now()}`,
      name: (title || 'New Exam').trim(),
      variant,
      courseId,
      multiAsF: false,
      emptyAsG: false,
      sortByName: true,
      answerKeys: {
        '*': Array(numQ).fill('A'),
        'A': Array(numQ).fill('A')
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.state.exams.push(newExam);
    this.state.activeExamId = newExam.id;
    this.saveState();
    this.syncActiveExamToInputs();
    if (this.ui.keyEditor) this.ui.keyEditor.renderKeyMatrix();
    this.renderAll();
  }

  switchExam(examId) {
    if (!this.state.exams.some(e => e.id === examId)) return;
    this.state.activeExamId = examId;
    this.state.selectedScanId = null;
    this.saveState();
    this.syncActiveExamToInputs();
    if (this.ui.keyEditor) this.ui.keyEditor.renderKeyMatrix();
    this.renderAll();
  }

  renameActiveExam(newTitle) {
    const active = this.getActiveExam();
    active.name = (newTitle || active.name).trim();
    active.updatedAt = new Date().toISOString();
    this.state.submissions.forEach(s => {
      if (s.examId === active.id) {
        s.examName = active.name;
      }
    });
    this.saveState();
    this.syncActiveExamToInputs();
    this.renderAll();
  }

  deleteActiveExam(examIdToDelete = null) {
    const targetId = examIdToDelete || this.state.activeExamId;
    if (this.state.exams.length <= 1) {
      alert("Cannot delete the only exam session. Create another exam first.");
      return;
    }
    const targetExam = this.state.exams.find(e => e.id === targetId);
    if (!targetExam) return;

    const count = this.state.submissions.filter(s => s.examId === targetExam.id).length;
    if (!confirm(`Delete exam "${targetExam.name}" and all its ${count} scanned sheets?`)) return;

    const deletedSubIds = this.state.submissions.filter(s => s.examId === targetExam.id).map(s => s.id);
    deletedSubIds.forEach(id => deleteSubmissionFromDB(id));
    this.state.submissions = this.state.submissions.filter(s => s.examId !== targetExam.id);
    this.state.exams = this.state.exams.filter(e => e.id !== targetExam.id);

    if (this.state.activeExamId === targetExam.id) {
      this.state.activeExamId = this.state.exams[0].id;
      this.state.selectedScanId = null;
    }

    this.saveState();
    this.syncActiveExamToInputs();
    if (this.ui.keyEditor) this.ui.keyEditor.renderKeyMatrix();
    this.renderAll();
  }

  renderExamBar() {
    const select = document.getElementById('selectActiveExam');
    const sheetCountBadge = document.getElementById('activeExamSheetCount');
    const variantBadge = document.getElementById('activeExamVariantBadge');
    const mainVariantBadge = document.getElementById('examVariantBadge');
    const active = this.getActiveExam();

    if (select) {
      select.innerHTML = '';
      const exams = (this.state && this.state.exams) || [];
      if (exams.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No exams available';
        select.appendChild(opt);
      } else {
        exams.forEach(exam => {
          const count = (this.state.submissions || []).filter(s => s.examId === exam.id).length;
          const opt = document.createElement('option');
          opt.value = exam.id;
          opt.textContent = `${exam.name} (${count} sheets)`;
          if (exam.id === (active ? active.id : this.state.activeExamId)) opt.selected = true;
          select.appendChild(opt);
        });
      }
    }

    const activeCount = this.getActiveSubmissions().length;
    if (sheetCountBadge) sheetCountBadge.textContent = `${activeCount} Sheets`;
    const variantText = (active && active.variant === '150') ? '150 Questions' : '75 Questions';
    if (variantBadge) variantBadge.textContent = variantText;
    if (mainVariantBadge) mainVariantBadge.textContent = variantText;
  }

  renderAllExamsTable() {
    const tbody = document.getElementById('allExamsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    this.state.exams.forEach(exam => {
      const examSubs = this.state.submissions.filter(s => s.examId === exam.id && !s.error);
      const avgScore = examSubs.length > 0
        ? (examSubs.reduce((sum, s) => sum + (s.score || 0), 0) / examSubs.length).toFixed(1) + '%'
        : '—';
      const isActive = (exam.id === this.state.activeExamId);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${exam.name}</strong> ${isActive ? '<span class="badge badge-mint" style="margin-left: 0.25rem;">Active</span>' : ''}</td>
        <td><code>${exam.courseId || '-'}</code></td>
        <td><span class="badge badge-slate">${exam.variant === '150' ? '150Q' : '75Q'}</span></td>
        <td><strong>${examSubs.length}</strong> sheets</td>
        <td>${avgScore}</td>
        <td><span style="font-size: 0.75rem; color: var(--text-secondary);">${new Date(exam.updatedAt || exam.createdAt).toLocaleDateString()}</span></td>
        <td>
          <div style="display: flex; gap: 0.35rem;">
            ${!isActive ? `<button class="btn btn-sm btn-primary btn-switch-exam" data-id="${exam.id}">Switch</button>` : ''}
            <button class="btn btn-sm btn-subtle btn-delete-exam-row" data-id="${exam.id}" style="color: var(--pastel-rose-text);">🗑️</button>
          </div>
        </td>
      `;

      const btnSwitch = tr.querySelector('.btn-switch-exam');
      if (btnSwitch) {
        btnSwitch.addEventListener('click', () => this.switchExam(exam.id));
      }

      const btnDelete = tr.querySelector('.btn-delete-exam-row');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => this.deleteActiveExam(exam.id));
      }

      tbody.appendChild(tr);
    });
  }

  switchTab(tabId) {
    this.state.activeTab = tabId;

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${tabId}`);
    });

    if (tabId === 'inspector') {
      this.renderInspector();
    } else if (tabId === 'results') {
      this.renderResults();
    } else if (tabId === 'analytics') {
      this.renderAnalytics();
    } else if (tabId === 'gallery') {
      this.renderGallery();
    }
  }

  getActiveExamNumQuestions() {
    const active = this.getActiveExam();
    if (!active) return 75;
    if (active.answerKeys) {
      let maxKeyed = 0;
      for (const formCode of Object.keys(active.answerKeys)) {
        const key = active.answerKeys[formCode] || [];
        for (let i = 0; i < key.length; i++) {
          if ((key[i] || '').trim() !== '') {
            if (i + 1 > maxKeyed) maxKeyed = i + 1;
          }
        }
      }
      if (maxKeyed > 0) return maxKeyed;
    }
    return active.variant === '150' ? 150 : 75;
  }

  getAnswersForForm(formCode) {
    const active = this.getActiveExam();
    if (!active || !active.answerKeys) return [];
    const code = (formCode || '').trim().toUpperCase();
    const hasKeyAnswers = (key) => Array.isArray(key) && key.some(a => (a || '').trim() !== '');

    if (code && hasKeyAnswers(active.answerKeys[code])) {
      return active.answerKeys[code];
    }
    if (hasKeyAnswers(active.answerKeys['*'])) {
      return active.answerKeys['*'];
    }
    const populated = Object.values(active.answerKeys).find(hasKeyAnswers);
    if (populated) return populated;
    return active.answerKeys[code] || active.answerKeys['*'] || Object.values(active.answerKeys)[0] || [];
  }

  getActiveAnswerKey(formCode) {
    return this.getAnswersForForm(formCode);
  }

  scoreExtractedData(data) {
    const active = this.getActiveExam();
    return scoreSubmission(data, active ? active.answerKeys : {});
  }

  recalculateAllScores() {
    const active = this.getActiveExam();
    if (!active) return;
    this.state.submissions.forEach(sub => {
      if (sub.examId === active.id && !sub.error && sub.answers) {
        const scored = this.scoreExtractedData(sub);
        sub.score = scored.percentage;
        sub.points = scored.points;
        sub.totalQuestions = scored.totalQuestions;
        sub.scoredStatus = scored.scored;
      }
    });
    this.saveState();
    this.renderAll();
  }

  openInspectorForSubmission(submissionId) {
    this.state.selectedScanId = submissionId;
    this.switchTab('inspector');
  }

  deleteSubmission(id) {
    this.state.submissions = this.state.submissions.filter(s => s.id !== id);
    if (this.state.selectedScanId === id) {
      this.state.selectedScanId = this.getActiveSubmissions()[0] ? this.getActiveSubmissions()[0].id : null;
    }
    deleteSubmissionFromDB(id);
    this.saveState();
    this.renderAll();
  }

  clearAllSubmissions() {
    const active = this.getActiveExam();
    const deletedSubIds = this.state.submissions.filter(s => s.examId === active.id).map(s => s.id);
    deletedSubIds.forEach(id => deleteSubmissionFromDB(id));
    this.state.submissions = this.state.submissions.filter(s => s.examId !== active.id);
    this.state.selectedScanId = null;
    this.saveState();
    this.renderAll();
  }

  renderResults() {
    if (this.ui.resultsTable) this.ui.resultsTable.renderResults();
  }

  renderAnalytics() {
    if (this.ui.analytics) this.ui.analytics.renderAnalytics();
  }

  renderInspector() {
    if (this.ui.inspector) this.ui.inspector.renderInspector();
  }

  renderGallery() {
    if (this.ui.sheetViewer) this.ui.sheetViewer.renderGallery();
  }

  renderAll() {
    try { this.renderExamBar(); } catch (e) { console.error("renderExamBar error:", e); }
    try { this.renderAllExamsTable(); } catch (e) { console.error("renderAllExamsTable error:", e); }
    try { if (this.ui.keyEditor) this.ui.keyEditor.renderKeyMatrix(); } catch (e) { console.error("renderKeyMatrix error:", e); }
    try { if (this.ui.scanner) this.ui.scanner.renderBatchTable(); } catch (e) { console.error("renderBatchTable error:", e); }
    try { this.renderGallery(); } catch (e) { console.error("renderGallery error:", e); }
    try { this.renderResults(); } catch (e) { console.error("renderResults error:", e); }
    try { this.renderAnalytics(); } catch (e) { console.error("renderAnalytics error:", e); }
    try { this.renderInspector(); } catch (e) { console.error("renderInspector error:", e); }
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.openMcrApp = new OpenMCRApp();
  window.openMcrApp.init();
});
