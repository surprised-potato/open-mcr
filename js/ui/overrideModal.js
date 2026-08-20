/**
 * overrideModal.js - Interactive Manual Override Modal Controller
 * Allows per-item answer override, student name & ID correction, test form code modification,
 * live recalculation of points/percentage scores, and reverting to raw scanned OMR values.
 */

export function initOverrideModal(app) {
  const modal = document.getElementById('modalManualOverride');
  const btnClose = document.getElementById('btnCloseOverrideModal');
  const btnCancel = document.getElementById('btnCancelOverrideModal');
  const btnSave = document.getElementById('btnSaveOverrideModal');
  const btnReset = document.getElementById('btnResetToOriginalScan');

  const titleEl = document.getElementById('overrideModalTitle');
  const subtitleEl = document.getElementById('overrideModalSubtitle');
  const badgeEl = document.getElementById('overrideModalBadge');

  const inputName = document.getElementById('overrideStudentName');
  const inputId = document.getElementById('overrideStudentId');
  const selectForm = document.getElementById('overrideFormCode');

  const liveScoreBadge = document.getElementById('overrideLiveScoreBadge');
  const livePointsBadge = document.getElementById('overrideLivePointsBadge');
  const qCountLabel = document.getElementById('overrideQuestionsCountLabel');
  const gridContainer = document.getElementById('overrideQuestionsGrid');

  let currentSubId = null;
  let draftAnswers = [];
  let numQuestions = 75;

  function closeModal() {
    if (modal) modal.classList.remove('open');
    currentSubId = null;
    draftAnswers = [];
  }

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  function openOverrideModal(subId) {
    const sub = app.state.submissions.find(s => s.id === subId);
    if (!sub) return;

    currentSubId = subId;
    const activeExam = app.getActiveExam();
    numQuestions = app.getActiveExamNumQuestions ? app.getActiveExamNumQuestions() : (activeExam.variant === '150' ? 150 : 75);

    if (qCountLabel) qCountLabel.textContent = numQuestions;

    titleEl.textContent = `✏️ Override: ${sub.filename}`;
    subtitleEl.textContent = `File: ${sub.filename} • Current Status: ${sub.error ? '⚠️ Error' : 'Graded'}`;

    if (badgeEl) {
      badgeEl.style.display = sub.isOverridden ? 'inline-block' : 'none';
      badgeEl.textContent = 'Overridden';
    }

    if (inputName) inputName.value = sub.studentName || '';
    if (inputId) inputId.value = sub.studentId || '';
    if (selectForm) selectForm.value = sub.testFormCode || 'A';

    // Clone answers or initialize
    draftAnswers = Array.isArray(sub.answers) ? [...sub.answers] : [];
    while (draftAnswers.length < numQuestions) {
      draftAnswers.push('');
    }

    renderQuestionGrid(sub);
    updateLiveScorePreview();

    if (modal) modal.classList.add('open');
  }

  function updateLiveScorePreview() {
    if (!currentSubId) return;
    const formCode = selectForm ? selectForm.value : 'A';
    const tempSub = {
      testFormCode: formCode,
      answers: draftAnswers
    };

    const scored = app.scoreExtractedData(tempSub);
    const totalQ = scored.totalQuestions || numQuestions;

    if (liveScoreBadge) {
      liveScoreBadge.textContent = `${scored.percentage}%`;
      liveScoreBadge.className = `badge ${scored.percentage >= 70 ? 'badge-mint' : scored.percentage >= 50 ? 'badge-sky' : 'badge-rose'}`;
    }
    if (livePointsBadge) {
      livePointsBadge.textContent = `${scored.points} / ${totalQ} pts`;
    }
  }

  function renderQuestionGrid(sub) {
    if (!gridContainer) return;
    gridContainer.innerHTML = '';

    const formCode = selectForm ? selectForm.value : 'A';
    const keyAnswers = app.getAnswersForForm(formCode) || [];
    const detected = sub.detectedAnswers || sub.answers || [];

    for (let q = 0; q < numQuestions; q++) {
      const qNum = q + 1;
      const currentAns = (draftAnswers[q] || '').toUpperCase();
      const detectedAns = (detected[q] || '').toUpperCase();
      const keyAns = (keyAnswers[q] || '').toUpperCase();
      const isChanged = (detectedAns !== '' || currentAns !== '') && currentAns !== detectedAns;

      const card = document.createElement('div');
      card.className = `override-q-card ${isChanged ? 'is-changed' : ''}`;
      card.id = `overrideCard_Q${qNum}`;

      card.innerHTML = `
        <div class="override-q-header">
          <strong style="color: var(--text-main);">Q${qNum}</strong>
          <span style="font-size: 0.7rem; color: var(--text-secondary);">Key: <strong style="color: var(--primary);">${keyAns || '—'}</strong></span>
        </div>
        <div class="override-btn-group">
          <button type="button" class="override-opt-btn ${currentAns === 'A' ? 'active' : ''}" data-q="${q}" data-opt="A">A</button>
          <button type="button" class="override-opt-btn ${currentAns === 'B' ? 'active' : ''}" data-q="${q}" data-opt="B">B</button>
          <button type="button" class="override-opt-btn ${currentAns === 'C' ? 'active' : ''}" data-q="${q}" data-opt="C">C</button>
          <button type="button" class="override-opt-btn ${currentAns === 'D' ? 'active' : ''}" data-q="${q}" data-opt="D">D</button>
          <button type="button" class="override-opt-btn ${currentAns === 'E' ? 'active' : ''}" data-q="${q}" data-opt="E">E</button>
          <button type="button" class="override-opt-btn ${currentAns === '' || currentAns === ' ' ? 'active' : ''}" data-q="${q}" data-opt="" title="Blank / Unanswered" style="flex: 0.8; font-weight: 400;">—</button>
        </div>
      `;

      card.querySelectorAll('.override-opt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const opt = btn.dataset.opt;
          draftAnswers[q] = opt;
          card.querySelectorAll('.override-opt-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const nowChanged = (detectedAns !== '' || opt !== '') && opt !== detectedAns;
          card.classList.toggle('is-changed', nowChanged);

          updateLiveScorePreview();
        });
      });

      gridContainer.appendChild(card);
    }
  }

  if (selectForm) {
    selectForm.addEventListener('change', () => {
      const sub = app.state.submissions.find(s => s.id === currentSubId);
      if (sub) {
        renderQuestionGrid(sub);
      }
      updateLiveScorePreview();
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', () => {
      if (!currentSubId) return;
      const sName = inputName ? inputName.value.trim() : '';
      const sId = inputId ? inputId.value.trim() : '';
      const sForm = selectForm ? selectForm.value : 'A';

      app.applySubmissionOverride(currentSubId, {
        studentName: sName,
        studentId: sId,
        testFormCode: sForm,
        answers: draftAnswers
      });

      closeModal();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (!currentSubId) return;
      if (confirm("Revert all manual edits and restore original detected OMR scan values?")) {
        app.resetSubmissionOverride(currentSubId);
        closeModal();
      }
    });
  }

  return { openOverrideModal, closeModal };
}
