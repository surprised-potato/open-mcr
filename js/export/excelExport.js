/**
 * excelExport.js - Client-side Excel (.xlsx) and CSV exporter
 */

/* global XLSX */

export function exportToExcel(examName, submissions, answerKeys, numQuestions) {
  if (typeof XLSX === 'undefined') {
    throw new Error("XLSX library is not loaded.");
  }

  const wb = XLSX.utils.book_new();

  // 1. Graded Results Sheet
  const resultsHeaders = [
    'Student ID',
    'Student Name',
    'Test Form',
    'Course ID',
    'Score (%)',
    'Points',
    'Total Questions'
  ];
  for (let i = 1; i <= numQuestions; i++) {
    resultsHeaders.push(`Q${i}`);
  }

  const resultsRows = submissions.map(sub => {
    const row = [
      sub.studentId || '',
      sub.studentName || '',
      sub.testFormCode || '',
      sub.courseId || '',
      sub.score !== undefined ? sub.score : '',
      sub.points !== undefined ? sub.points : '',
      numQuestions
    ];
    for (let i = 0; i < numQuestions; i++) {
      row.push(sub.answers ? (sub.answers[i] || '') : '');
    }
    return row;
  });

  const wsResults = XLSX.utils.aoa_to_sheet([resultsHeaders, ...resultsRows]);
  XLSX.utils.book_append_sheet(wb, wsResults, 'Graded Results');

  // 2. Answer Keys Sheet
  const keysHeaders = ['Form Code'];
  for (let i = 1; i <= numQuestions; i++) {
    keysHeaders.push(`Q${i}`);
  }
  const keysRows = Object.entries(answerKeys).map(([formCode, answers]) => {
    const row = [formCode];
    for (let i = 0; i < numQuestions; i++) {
      row.push(answers[i] || '');
    }
    return row;
  });
  const wsKeys = XLSX.utils.aoa_to_sheet([keysHeaders, ...keysRows]);
  XLSX.utils.book_append_sheet(wb, wsKeys, 'Answer Keys');

  // 3. Item Analysis Sheet (Kelly's 27% Rule & Psychometrics)
  const itemHeaders = [
    'Question',
    'Key',
    'Difficulty P-Value (%)',
    'Upper 27% Correct (%)',
    'Lower 27% Correct (%)',
    'Discrimination (D-Index)',
    'Count A',
    'Count B',
    'Count C',
    'Count D',
    'Count E',
    'Blank/Other',
    'Diagnostic Status'
  ];
  const defaultKey = answerKeys['*'] || Object.values(answerKeys)[0] || [];
  const itemRows = [];

  const validSubs = submissions.filter(s => !s.error && s.score !== undefined);
  const sortedSubs = [...validSubs].sort((a, b) => (b.score || 0) - (a.score || 0));
  const cohortSize = Math.max(1, Math.round(sortedSubs.length * 0.27));
  const topCohort = sortedSubs.slice(0, cohortSize);
  const bottomCohort = sortedSubs.slice(-cohortSize);

  for (let i = 0; i < numQuestions; i++) {
    const correctAns = (defaultKey[i] || '').toUpperCase();
    let correctCount = 0;
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, other: 0 };

    validSubs.forEach(sub => {
      const ans = (sub.answers && sub.answers[i]) ? sub.answers[i].toUpperCase() : '';
      if (counts[ans] !== undefined) {
        counts[ans]++;
      } else {
        counts.other++;
      }
      const subKey = answerKeys[sub.testFormCode || 'A'] || answerKeys['*'];
      const expected = subKey ? (subKey[i] || '') : correctAns;
      if (ans && expected && ans === expected) {
        correctCount++;
      }
    });

    const percentCorrect = validSubs.length > 0
      ? Number(((correctCount / validSubs.length) * 100).toFixed(1))
      : 0;

    let topPercent = 0;
    let bottomPercent = 0;
    let dVal = 0;
    let dFormatted = '0.00';

    if (topCohort.length > 0 && bottomCohort.length > 0) {
      let topCorrect = 0;
      topCohort.forEach(sub => {
        const ans = (sub.answers && sub.answers[i]) ? sub.answers[i].toUpperCase() : '';
        const subKey = answerKeys[sub.testFormCode || 'A'] || answerKeys['*'];
        const expected = subKey ? (subKey[i] || '') : correctAns;
        if (ans && expected && ans === expected) {
          topCorrect++;
        }
      });
      topPercent = Number(((topCorrect / topCohort.length) * 100).toFixed(1));

      let bottomCorrect = 0;
      bottomCohort.forEach(sub => {
        const ans = (sub.answers && sub.answers[i]) ? sub.answers[i].toUpperCase() : '';
        const subKey = answerKeys[sub.testFormCode || 'A'] || answerKeys['*'];
        const expected = subKey ? (subKey[i] || '') : correctAns;
        if (ans && expected && ans === expected) {
          bottomCorrect++;
        }
      });
      bottomPercent = Number(((bottomCorrect / bottomCohort.length) * 100).toFixed(1));

      dVal = (topCorrect / topCohort.length) - (bottomCorrect / bottomCohort.length);
      dFormatted = (dVal >= 0 ? '+' : '') + dVal.toFixed(2);
    }

    let status = 'Good';
    if (dVal < 0) status = 'Check Key / Negative D';
    else if (dVal >= 0.40) status = 'Excellent';
    else if (dVal < 0.15) status = 'Low Discrimination';

    itemRows.push([
      `Q${i + 1}`,
      correctAns,
      `${percentCorrect}%`,
      `${topPercent}%`,
      `${bottomPercent}%`,
      dFormatted,
      counts.A,
      counts.B,
      counts.C,
      counts.D,
      counts.E,
      counts.other,
      status
    ]);
  }

  const wsItems = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Item Analysis');

  const filename = `${(examName || 'OpenMCR_Exam').replace(/[^a-zA-Z0-9_-]/g, '_')}_Results.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportItemAnalysisToExcel(examName, formCode, questionStats, summaryStats = {}) {
  if (typeof XLSX === 'undefined') {
    throw new Error("XLSX library is not loaded.");
  }

  const wb = XLSX.utils.book_new();

  // Summary Metadata Rows
  const summaryRows = [
    ['OpenMCR Classical Item Analysis Report'],
    ['Exam Name', examName || 'Exam'],
    ['Form Filter', formCode === 'all' ? 'All Forms Combined' : `Form ${formCode}`],
    ['Total Graded', summaryStats.totalGraded || 0],
    ['Class Mean (%)', `${(summaryStats.meanScore || 0).toFixed(1)}%`],
    ['Standard Deviation (σ)', (summaryStats.stdDev || 0).toFixed(2)],
    ['KR-20 Reliability', (summaryStats.kr20 || 0).toFixed(2)],
    ['Generated At', new Date().toLocaleString()],
    []
  ];

  // Item Analysis Headers
  const itemHeaders = [
    'Question',
    'Correct Key',
    'P-Value (%)',
    'Upper 27% (%)',
    'Lower 27% (%)',
    'Discrimination (D)',
    'r(pbis)',
    'Choice A',
    'Choice B',
    'Choice C',
    'Choice D',
    'Choice E',
    'Blank/Multi',
    'Distractor Traps',
    'Mastery Recommendation'
  ];

  const itemRows = questionStats.map(q => {
    const traps = (q.distractorTraps || []).map(t => `${t.opt}:${t.pct}%`).join('; ') || 'None';
    let recommendation = 'Good item';
    if (q.dIndex < 0) recommendation = '🚨 Negative D — Check Answer Key';
    else if (q.pPercent < 30) recommendation = '⚠️ Low Class Mastery (<30%)';
    else if (q.pPercent >= 85) recommendation = '⭐ Mastery Achieved (>85%)';
    else if (q.dIndex >= 0.40) recommendation = '⭐ Highly Discriminating Item';
    else if (q.dIndex < 0.15) recommendation = '⚠️ Low Discrimination Index';

    return [
      `Q${q.qNum}`,
      q.correctAns || '',
      q.pPercent,
      q.pUpper,
      q.pLower,
      q.dIndex,
      q.rPbis,
      q.counts.A || 0,
      q.counts.B || 0,
      q.counts.C || 0,
      q.counts.D || 0,
      q.counts.E || 0,
      q.counts.other || 0,
      traps,
      recommendation
    ];
  });

  const fullData = [...summaryRows, itemHeaders, ...itemRows];
  const ws = XLSX.utils.aoa_to_sheet(fullData);
  XLSX.utils.book_append_sheet(wb, ws, 'Item Analysis');

  const formSuffix = formCode === 'all' ? 'AllForms' : `Form_${formCode}`;
  const filename = `Item_Analysis_${(examName || 'Exam').replace(/[^a-zA-Z0-9_-]/g, '_')}_${formSuffix}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportToCSV(examName, submissions, numQuestions) {
  const headers = [
    'Student ID',
    'Student Name',
    'Test Form',
    'Course ID',
    'Score (%)',
    'Points'
  ];
  for (let i = 1; i <= numQuestions; i++) {
    headers.push(`Q${i}`);
  }

  const rows = submissions.map(sub => {
    const row = [
      `"${sub.studentId || ''}"`,
      `"${sub.studentName || ''}"`,
      `"${sub.testFormCode || ''}"`,
      `"${sub.courseId || ''}"`,
      sub.score !== undefined ? sub.score : '',
      sub.points !== undefined ? sub.points : ''
    ];
    for (let i = 0; i < numQuestions; i++) {
      row.push(`"${sub.answers ? (sub.answers[i] || '') : ''}"`);
    }
    return row.join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(examName || 'OpenMCR_Exam').replace(/[^a-zA-Z0-9_-]/g, '_')}_Results.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
