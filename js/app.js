/**
 * app.js - Main Application Coordinator for OpenMCR Web
 */

import { scoreSubmission } from './omr/scorer.js';
import { initKeyEditor } from './ui/keyEditor.js';
import { initScanner } from './ui/scanner.js';
import { initInspector } from './ui/inspector.js';
import { initResultsTable } from './ui/resultsTable.js';
import { initAnalytics } from './ui/analytics.js';
import { initFirebaseModal } from './ui/firebaseModal.js';

const STORAGE_STATE_KEY = 'openmcr_app_state';

class OpenMCRApp {
  constructor() {
    this.state = this.loadInitialState();
    this.ui = {};
  }

  loadInitialState() {
    try {
      const saved = localStorage.getItem(STORAGE_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          examConfig: parsed.examConfig || {
            id: `exam_${Date.now()}`,
            name: 'Physics 101 Midterm',
            variant: '75',
            courseId: 'PHY2048',
            multiAsF: false,
            emptyAsG: false,
            sortByName: true
          },
          answerKeys: parsed.answerKeys || {
            '*': Array(75).fill('A'),
            'A': Array(75).fill('A')
          },
          submissions: parsed.submissions || [],
          selectedScanId: parsed.selectedScanId || null,
          activeTab: 'setup'
        };
      }
    } catch (e) {
      console.warn("Could not load saved state:", e);
    }

    return {
      examConfig: {
        id: `exam_${Date.now()}`,
        name: 'Physics 101 Midterm',
        variant: '75',
        courseId: 'PHY2048',
        multiAsF: false,
        emptyAsG: false,
        sortByName: true
      },
      answerKeys: {
        '*': Array(75).fill('A'),
        'A': Array(75).fill('A')
      },
      submissions: [],
      selectedScanId: null,
      activeTab: 'setup'
    };
  }

  saveState() {
    try {
      const copy = {
        examConfig: this.state.examConfig,
        answerKeys: this.state.answerKeys,
        // We only persist metadata and answers to localStorage, keeping images in memory for session privacy
        submissions: this.state.submissions.map(s => ({
          ...s,
          // keep imageDataUrl in session memory
        })),
        selectedScanId: this.state.selectedScanId
      };
      localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(copy));
    } catch (e) {
      console.warn("Could not persist state to localStorage:", e);
    }
  }

  init() {
    // 1. Bind Navigation Tabs
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // 2. Bind Setup Inputs
    const inputExamName = document.getElementById('inputExamName');
    const selectVariant = document.getElementById('selectFormVariant');
    const inputCourseId = document.getElementById('inputCourseId');
    const chkMultiAsF = document.getElementById('chkMultiAsF');
    const chkEmptyAsG = document.getElementById('chkEmptyAsG');
    const chkSortByName = document.getElementById('chkSortByName');
    const badgeVariant = document.getElementById('examVariantBadge');

    inputExamName.value = this.state.examConfig.name || '';
    selectVariant.value = this.state.examConfig.variant || '75';
    inputCourseId.value = this.state.examConfig.courseId || '';
    chkMultiAsF.checked = Boolean(this.state.examConfig.multiAsF);
    chkEmptyAsG.checked = Boolean(this.state.examConfig.emptyAsG);
    chkSortByName.checked = Boolean(this.state.examConfig.sortByName);
    badgeVariant.textContent = this.state.examConfig.variant === '150' ? '150 Questions' : '75 Questions';

    inputExamName.addEventListener('input', () => {
      this.state.examConfig.name = inputExamName.value;
      this.saveState();
    });

    selectVariant.addEventListener('change', () => {
      this.state.examConfig.variant = selectVariant.value;
      badgeVariant.textContent = selectVariant.value === '150' ? '150 Questions' : '75 Questions';
      this.saveState();
      this.ui.keyEditor.renderKeyMatrix();
      this.recalculateAllScores();
    });

    inputCourseId.addEventListener('input', () => {
      this.state.examConfig.courseId = inputCourseId.value;
      this.saveState();
    });

    chkMultiAsF.addEventListener('change', () => {
      this.state.examConfig.multiAsF = chkMultiAsF.checked;
      this.saveState();
    });

    chkEmptyAsG.addEventListener('change', () => {
      this.state.examConfig.emptyAsG = chkEmptyAsG.checked;
      this.saveState();
    });

    chkSortByName.addEventListener('change', () => {
      this.state.examConfig.sortByName = chkSortByName.checked;
      this.saveState();
      this.renderResults();
    });

    document.getElementById('btnProceedToKeys').addEventListener('click', () => {
      this.switchTab('keys');
    });

    document.getElementById('btnProceedToScanner').addEventListener('click', () => {
      this.switchTab('scanner');
    });

    // 3. Initialize Child Components
    this.ui.keyEditor = initKeyEditor(this);
    this.ui.scanner = initScanner(this);
    this.ui.inspector = initInspector(this);
    this.ui.resultsTable = initResultsTable(this);
    this.ui.analytics = initAnalytics(this);
    this.ui.firebaseModal = initFirebaseModal(this);

    // Initial render
    this.renderAll();
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
    }
  }

  getAnswersForForm(formCode) {
    const code = (formCode || '').trim().toUpperCase();
    if (this.state.answerKeys[code]) return this.state.answerKeys[code];
    if (this.state.answerKeys['*']) return this.state.answerKeys['*'];
    return Object.values(this.state.answerKeys)[0] || [];
  }

  scoreExtractedData(data) {
    return scoreSubmission(data, this.state.answerKeys);
  }

  recalculateAllScores() {
    this.state.submissions.forEach(sub => {
      if (!sub.error && sub.answers) {
        const scored = this.scoreExtractedData(sub);
        sub.score = scored.percentage;
        sub.points = scored.points;
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

  renderResults() {
    if (this.ui.resultsTable) this.ui.resultsTable.renderResults();
  }

  renderAnalytics() {
    if (this.ui.analytics) this.ui.analytics.renderAnalytics();
  }

  renderInspector() {
    if (this.ui.inspector) this.ui.inspector.renderInspector();
  }

  renderAll() {
    if (this.ui.scanner) this.ui.scanner.renderBatchTable();
    this.renderResults();
    this.renderAnalytics();
    this.renderInspector();
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.openMcrApp = new OpenMCRApp();
  window.openMcrApp.init();
});
