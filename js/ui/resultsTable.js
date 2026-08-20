/**
 * resultsTable.js - Student grade roster controller with search, sort, and export
 */

import { exportToExcel, exportToCSV } from '../export/excelExport.js';

export function initResultsTable(app) {
  const tableBody = document.getElementById('rosterTableBody');
  const searchInput = document.getElementById('inputSearchRoster');
  const countBadge = document.getElementById('rosterCountBadge');
  const btnExportExcel = document.getElementById('btnExportExcel');
  const btnExportCsv = document.getElementById('btnExportCsv');

  function renderResults() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const activeExam = app.getActiveExam();
    let submissions = app.getActiveSubmissions();

    // Apply sorting
    if (activeExam.sortByName) {
      submissions.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
    } else {
      submissions.sort((a, b) => (a.studentId || '').localeCompare(b.studentId || ''));
    }

    if (query) {
      submissions = submissions.filter(s =>
        (s.studentId && s.studentId.toLowerCase().includes(query)) ||
        (s.studentName && s.studentName.toLowerCase().includes(query)) ||
        (s.testFormCode && s.testFormCode.toLowerCase().includes(query)) ||
        (s.filename && s.filename.toLowerCase().includes(query))
      );
    }

    countBadge.textContent = `${submissions.length} Students`;

    if (submissions.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No results found for "${activeExam.name}". Scan sheets in the <strong>Scanner</strong> tab to begin.</td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = '';
    const examNumQ = app.getActiveExamNumQuestions ? app.getActiveExamNumQuestions() : (activeExam.variant === '150' ? 150 : 75);

    submissions.forEach(sub => {
      const tr = document.createElement('tr');
      const isErr = Boolean(sub.error);
      const totalQ = sub.totalQuestions || examNumQ;
      const scoreBadge = isErr
        ? `<span class="badge badge-rose" title="${sub.error || 'Scan error'}">Error</span>`
        : sub.score >= 70
        ? `<span class="badge badge-mint">${sub.score}%</span>`
        : `<span class="badge badge-rose">${sub.score}%</span>`;

      if (sub.isOverridden) {
        tr.className = 'row-overridden';
      }

      tr.innerHTML = `
        <td><strong><code>${sub.studentId || '-'}</code></strong></td>
        <td>
          ${sub.studentName || '-'}
          ${sub.isOverridden ? '<span class="badge badge-amber" style="margin-left: 0.25rem; font-size: 0.7rem;">✏️ Overridden</span>' : ''}
        </td>
        <td><span class="badge badge-slate">${sub.testFormCode || '-'}</span></td>
        <td>${isErr ? '—' : `${sub.points !== undefined ? sub.points : 0} / ${totalQ}`}</td>
        <td>${scoreBadge}</td>
        <td><code>${sub.threshold ? (sub.threshold * 100).toFixed(1) + '%' : '-'}</code></td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-sm btn-subtle btn-override-row" data-id="${sub.id}" title="Edit / Override student data or answers">✏️ Override</button>
            <button class="btn btn-sm btn-primary btn-view-row" data-id="${sub.id}">🖼️ View</button>
            <button class="btn btn-sm btn-subtle btn-inspect-row" data-id="${sub.id}">📍 Inspect</button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-override-row').addEventListener('click', () => {
        app.openOverrideModal(sub.id);
      });

      tr.querySelector('.btn-view-row').addEventListener('click', () => {
        if (app.ui.sheetViewer) app.ui.sheetViewer.openFullscreenViewer(sub.id);
      });

      tr.querySelector('.btn-inspect-row').addEventListener('click', () => {
        app.openInspectorForSubmission(sub.id);
      });

      tableBody.appendChild(tr);
    });
  }

  searchInput.addEventListener('input', renderResults);

  btnExportExcel.addEventListener('click', () => {
    const activeExam = app.getActiveExam();
    const numQ = app.getActiveExamNumQuestions ? app.getActiveExamNumQuestions() : (activeExam.variant === '150' ? 150 : 75);
    exportToExcel(
      activeExam.name,
      app.getActiveSubmissions().filter(s => !s.error),
      activeExam.answerKeys,
      numQ
    );
  });

  btnExportCsv.addEventListener('click', () => {
    const activeExam = app.getActiveExam();
    const numQ = app.getActiveExamNumQuestions ? app.getActiveExamNumQuestions() : (activeExam.variant === '150' ? 150 : 75);
    exportToCSV(
      activeExam.name,
      app.getActiveSubmissions().filter(s => !s.error),
      numQ
    );
  });

  return { renderResults };
}
