/**
 * keyEditor.js - Answer key builder and matrix UI controller
 */

export function initKeyEditor(app) {
  const container = document.getElementById('keyMatrixContainer');
  const selectKeyForm = document.getElementById('selectKeyForm');
  const keyStatusSummary = document.getElementById('keyStatusSummary');

  function getNumQuestions() {
    return app.state.examConfig.variant === '150' ? 150 : 75;
  }

  function renderKeyMatrix() {
    const numQ = getNumQuestions();
    const activeForm = selectKeyForm.value;
    
    // Ensure array exists
    if (!app.state.answerKeys[activeForm]) {
      app.state.answerKeys[activeForm] = Array(numQ).fill('');
    }
    const currentKey = app.state.answerKeys[activeForm];

    // Adjust length if variant changed
    if (currentKey.length !== numQ) {
      if (currentKey.length < numQ) {
        currentKey.push(...Array(numQ - currentKey.length).fill(''));
      } else {
        currentKey.length = numQ;
      }
    }

    container.innerHTML = '';
    const choices = ['A', 'B', 'C', 'D', 'E'];

    let answeredCount = 0;

    for (let i = 0; i < numQ; i++) {
      const qBox = document.createElement('div');
      qBox.className = 'key-q-box';

      const qNum = document.createElement('span');
      qNum.className = 'key-q-num';
      qNum.textContent = `Q${i + 1}`;
      qBox.appendChild(qNum);

      const btnsGroup = document.createElement('div');
      btnsGroup.className = 'key-bubble-btns';

      const currentVal = (currentKey[i] || '').toUpperCase();
      if (currentVal) answeredCount++;

      choices.forEach(ch => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `key-bubble-btn ${currentVal === ch ? 'selected' : ''}`;
        btn.textContent = ch;
        btn.addEventListener('click', () => {
          if (currentKey[i] === ch) {
            currentKey[i] = ''; // toggle off
          } else {
            currentKey[i] = ch;
          }
          app.saveState();
          renderKeyMatrix();
          app.recalculateAllScores();
        });
        btnsGroup.appendChild(btn);
      });

      qBox.appendChild(btnsGroup);
      container.appendChild(qBox);
    }

    keyStatusSummary.textContent = `${answeredCount} / ${numQ} Questions Answered`;
  }

  // Event Listeners
  selectKeyForm.addEventListener('change', () => {
    renderKeyMatrix();
  });

  document.getElementById('btnQuickFillA').addEventListener('click', () => {
    const activeForm = selectKeyForm.value;
    const numQ = getNumQuestions();
    app.state.answerKeys[activeForm] = Array(numQ).fill('A');
    app.saveState();
    renderKeyMatrix();
    app.recalculateAllScores();
  });

  document.getElementById('btnQuickFillB').addEventListener('click', () => {
    const activeForm = selectKeyForm.value;
    const numQ = getNumQuestions();
    app.state.answerKeys[activeForm] = Array(numQ).fill('B');
    app.saveState();
    renderKeyMatrix();
    app.recalculateAllScores();
  });

  document.getElementById('btnQuickFillC').addEventListener('click', () => {
    const activeForm = selectKeyForm.value;
    const numQ = getNumQuestions();
    app.state.answerKeys[activeForm] = Array(numQ).fill('C');
    app.saveState();
    renderKeyMatrix();
    app.recalculateAllScores();
  });

  document.getElementById('btnClearActiveKey').addEventListener('click', () => {
    const activeForm = selectKeyForm.value;
    const numQ = getNumQuestions();
    app.state.answerKeys[activeForm] = Array(numQ).fill('');
    app.saveState();
    renderKeyMatrix();
    app.recalculateAllScores();
  });

  // CSV Export & Import
  const fileImport = document.getElementById('fileImportKeysCsv');
  document.getElementById('btnImportKeysCsv').addEventListener('click', () => {
    fileImport.click();
  });

  fileImport.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return;

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const q1Idx = headers.findIndex(h => h.toUpperCase() === 'Q1');
    if (q1Idx === -1) {
      alert("Invalid answer key CSV: missing 'Q1' header column.");
      return;
    }

    for (let r = 1; r < lines.length; r++) {
      const row = lines[r].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const formCode = (row[0] || '*').toUpperCase();
      const answers = row.slice(q1Idx);
      app.state.answerKeys[formCode] = answers;
    }

    app.saveState();
    renderKeyMatrix();
    app.recalculateAllScores();
    alert("Answer keys imported successfully!");
    fileImport.value = '';
  });

  document.getElementById('btnExportKeysCsv').addEventListener('click', () => {
    const numQ = getNumQuestions();
    const headers = ['Form Code'];
    for (let i = 1; i <= numQ; i++) headers.push(`Q${i}`);

    const rows = Object.entries(app.state.answerKeys).map(([formCode, answers]) => {
      const r = [formCode];
      for (let i = 0; i < numQ; i++) {
        r.push(answers[i] || '');
      }
      return r.join(',');
    });

    const csv = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AnswerKeys_${app.state.examConfig.name || 'Exam'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  renderKeyMatrix();

  return { renderKeyMatrix };
}
