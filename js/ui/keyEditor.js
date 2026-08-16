/**
 * keyEditor.js - Answer key builder and matrix UI controller
 * Clean 5-column layout mirroring the physical exam sheet without cramped bubbles or overflow.
 */

export function initKeyEditor(app) {
  const container = document.getElementById('keyMatrixContainer');
  const selectKeyForm = document.getElementById('selectKeyForm');
  const keyStatusSummary = document.getElementById('keyStatusSummary');

  function getNumQuestions() {
    const activeExam = app.getActiveExam();
    return activeExam.variant === '150' ? 150 : 75;
  }

  function renderKeyMatrix() {
    const numQ = getNumQuestions();
    const activeForm = selectKeyForm.value;
    const activeExam = app.getActiveExam();
    
    // Ensure array exists in active exam
    if (!activeExam.answerKeys[activeForm]) {
      activeExam.answerKeys[activeForm] = Array(numQ).fill('');
    }
    const currentKey = activeExam.answerKeys[activeForm];

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
    const perColumn = activeExam.variant === '150' ? 30 : 15;
    const numColumns = Math.ceil(numQ / perColumn);

    let totalAnswered = 0;

    for (let col = 0; col < numColumns; col++) {
      const startQ = col * perColumn;
      const endQ = Math.min(numQ, (col + 1) * perColumn);

      const colCard = document.createElement('div');
      colCard.className = 'key-column-card';

      // Column Header
      const colHeader = document.createElement('div');
      colHeader.className = 'key-column-header';
      colHeader.innerHTML = `
        <span>Questions ${startQ + 1} – ${endQ}</span>
        <span class="badge badge-slate" id="colBadge_${col}">0 / ${endQ - startQ}</span>
      `;
      colCard.appendChild(colHeader);

      const colBody = document.createElement('div');
      colBody.className = 'key-column-body';

      let colAnswered = 0;

      for (let i = startQ; i < endQ; i++) {
        const qBox = document.createElement('div');
        const currentVal = (currentKey[i] || '').toUpperCase();
        if (currentVal) {
          totalAnswered++;
          colAnswered++;
        }

        qBox.className = `key-q-box ${currentVal ? 'has-answer' : ''}`;

        const qNum = document.createElement('span');
        qNum.className = 'key-q-num';
        qNum.textContent = `Q${i + 1}`;
        qBox.appendChild(qNum);

        const btnsGroup = document.createElement('div');
        btnsGroup.className = 'key-bubble-btns';

        choices.forEach(ch => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `key-bubble-btn ${currentVal === ch ? 'selected' : ''}`;
          btn.textContent = ch;
          btn.title = `Question ${i + 1}: Choice ${ch}`;
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
        colBody.appendChild(qBox);
      }

      const colBadge = colCard.querySelector(`#colBadge_${col}`);
      if (colBadge) {
        colBadge.textContent = `${colAnswered} / ${endQ - startQ}`;
        if (colAnswered === (endQ - startQ)) {
          colBadge.className = 'badge badge-mint';
        }
      }

      colCard.appendChild(colBody);
      container.appendChild(colCard);
    }

    if (keyStatusSummary) {
      if (activeForm !== '*' && totalAnswered === 0) {
        keyStatusSummary.textContent = `0 / ${numQ} Keyed • Form ${activeForm} (Uses Default Key *)`;
        keyStatusSummary.className = 'badge badge-slate';
      } else {
        keyStatusSummary.textContent = `${totalAnswered} / ${numQ} Questions Answered • Form ${activeForm}`;
        keyStatusSummary.className = (totalAnswered === numQ) ? 'badge badge-mint' : 'badge badge-sky';
      }
    }
  }

  // Event Listeners
  selectKeyForm.addEventListener('change', () => {
    renderKeyMatrix();
  });

  function quickFill(choice) {
    const activeForm = selectKeyForm.value;
    const numQ = getNumQuestions();
    const activeExam = app.getActiveExam();
    activeExam.answerKeys[activeForm] = Array(numQ).fill(choice);
    app.saveState();
    renderKeyMatrix();
    app.recalculateAllScores();
  }

  const btnA = document.getElementById('btnQuickFillA');
  const btnB = document.getElementById('btnQuickFillB');
  const btnC = document.getElementById('btnQuickFillC');
  const btnD = document.getElementById('btnQuickFillD');
  const btnE = document.getElementById('btnQuickFillE');
  const btnClear = document.getElementById('btnClearKey') || document.getElementById('btnClearActiveKey');

  if (btnA) btnA.addEventListener('click', () => quickFill('A'));
  if (btnB) btnB.addEventListener('click', () => quickFill('B'));
  if (btnC) btnC.addEventListener('click', () => quickFill('C'));
  if (btnD) btnD.addEventListener('click', () => quickFill('D'));
  if (btnE) btnE.addEventListener('click', () => quickFill('E'));
  if (btnClear) btnClear.addEventListener('click', () => quickFill(''));

  // CSV Export & Import
  const fileImport = document.getElementById('fileImportKeysCsv');
  const btnImportCsv = document.getElementById('btnImportKeysCsv');
  const btnExportCsv = document.getElementById('btnExportKeysCsv');

  if (btnImportCsv && fileImport) {
    btnImportCsv.addEventListener('click', () => fileImport.click());
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

      const activeExam = app.getActiveExam();
      for (let r = 1; r < lines.length; r++) {
        const row = lines[r].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const formCode = (row[0] || '*').toUpperCase();
        const answers = row.slice(q1Idx);
        activeExam.answerKeys[formCode] = answers;
      }

      app.saveState();
      renderKeyMatrix();
      app.recalculateAllScores();
      alert("Answer keys imported successfully!");
      fileImport.value = '';
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const numQ = getNumQuestions();
      const activeExam = app.getActiveExam();
      const headers = ['Form Code'];
      for (let i = 1; i <= numQ; i++) headers.push(`Q${i}`);

      const rows = Object.entries(activeExam.answerKeys).map(([formCode, answers]) => {
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
      a.download = `AnswerKeys_${(activeExam.name || 'Exam').replace(/\s+/g, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const btnProceedToScanner = document.getElementById('btnProceedToScanner');
  if (btnProceedToScanner) {
    btnProceedToScanner.addEventListener('click', () => {
      app.switchTab('scanner');
    });
  }

  renderKeyMatrix();

  return { renderKeyMatrix };
}
