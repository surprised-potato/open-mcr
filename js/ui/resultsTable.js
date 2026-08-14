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
    let submissions = [...app.state.submissions].filter(s => !s.error);

    // Apply sorting
    if (app.state.examConfig.sortByName) {
      submissions.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
    } else {
      submissions.sort((a, b) => (a.studentId || '').localeCompare(b.studentId || ''));
    }

    if (query) {
      submissions = submissions.filter(s =>
        (s.studentId && s.studentId.toLowerCase().includes(query)) ||
        (s.studentName && s.studentName.toLowerCase().includes(query)) ||
        (s.testFormCode && s.testFormCode.toLowerCase().includes(query))
      );
    }

    countBadge.textContent = `${submissions.length} Students`;

    if (submissions.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No graded results to display.</td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = '';
    const numQ = app.state.examConfig.variant === '150' ? 150 : 75;

    submissions.forEach(sub => {
      const tr = document.createElement('tr');
      const scoreBadge = sub.score >= 70
        ? `<span class="badge badge-mint">${sub.score}%</span>`
        : `<span class="badge badge-rose">${sub.score}%</span>`;

      tr.innerHTML = `
        <td><strong><code>${sub.studentId || 'Unknown'}</code></strong></td>
        <td>${sub.studentName || 'Unknown'}</td>
        <td><span class="badge badge-slate">${sub.testFormCode || 'A'}</span></td>
        <td>${sub.points !== undefined ? sub.points : 0} / ${numQ}</td>
        <td>${scoreBadge}</td>
        <td><code>${sub.threshold ? (sub.threshold * 100).toFixed(1) + '%' : '-'}</code></td>
        <td>
          <div style="display: flex; gap: 0.35rem;">
            <button class="btn btn-sm btn-primary btn-view-row" data-id="${sub.id}">🖼️ View</button>
            <button class="btn btn-sm btn-subtle btn-inspect-row" data-id="${sub.id}">📍 Inspect</button>
          </div>
        </td>
      `;

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
    const numQ = app.state.examConfig.variant === '150' ? 150 : 75;
    exportToExcel(
      app.state.examConfig.name,
      app.state.submissions.filter(s => !s.error),
      app.state.answerKeys,
      numQ
    );
  });

  btnExportCsv.addEventListener('click', () => {
    const numQ = app.state.examConfig.variant === '150' ? 150 : 75;
    exportToCSV(
      app.state.examConfig.name,
      app.state.submissions.filter(s => !s.error),
      numQ
    );
  });

  return { renderResults };
}
