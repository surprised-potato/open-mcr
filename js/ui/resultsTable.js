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
  const filterPills = document.getElementById('rosterFilterPills');
  const btnFilterFlagged = document.getElementById('btnRosterFilterFlagged');

  let activeFilter = 'all';

  function renderResults() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const activeExam = app.getActiveExam();
    let allSubmissions = app.getActiveSubmissions();
    const duplicateIds = app.getDuplicateStudentIds ? app.getDuplicateStudentIds() : new Set();

    // Update Flagged count in filter pill button
    const flaggedCount = allSubmissions.filter(s => app.isSubmissionFlagged(s)).length;
    if (btnFilterFlagged) {
      btnFilterFlagged.textContent = flaggedCount > 0 ? `⚠️ Needs Review (${flaggedCount})` : '⚠️ Needs Review';
    }

    // Apply active filter
    let submissions = allSubmissions.slice();
    if (activeFilter === 'flagged') {
      submissions = submissions.filter(s => app.isSubmissionFlagged(s));
    } else if (activeFilter === 'graded') {
      submissions = submissions.filter(s => !s.error);
    } else if (activeFilter === 'errors') {
      submissions = submissions.filter(s => Boolean(s.error));
    }

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

    countBadge.textContent = `${submissions.length} / ${allSubmissions.length} Students`;

    if (submissions.length === 0) {
      const msg = activeFilter === 'flagged'
        ? '🎉 No sheets require review for this exam!'
        : `No results found for "${activeExam.name}".`;
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">${msg}</td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = '';
    const examNumQ = app.getActiveExamNumQuestions ? app.getActiveExamNumQuestions() : (activeExam.variant === '150' ? 150 : 75);

    submissions.forEach(sub => {
      const tr = document.createElement('tr');
      const isErr = Boolean(sub.error);
      const isFlagged = app.isSubmissionFlagged(sub);
      const isDup = sub.studentId && duplicateIds.has(sub.studentId.trim());
      const totalQ = sub.totalQuestions || examNumQ;

      const scoreBadge = isErr
        ? `<span class="badge badge-rose" title="${sub.error || 'Scan error'}">Error</span>`
        : sub.score >= 70
        ? `<span class="badge badge-mint">${sub.score}%</span>`
        : `<span class="badge badge-rose">${sub.score}%</span>`;

      if (sub.isOverridden) {
        tr.className = 'row-overridden';
      } else if (isFlagged) {
        tr.className = 'row-flagged';
      }

      // Generate Flag Pills
      let flagBadgesHtml = '';
      if (isDup) {
        flagBadgesHtml += `<span class="badge-flag badge-flag-rose" title="Duplicate Student ID detected in this exam">⚠️ Duplicate ID</span> `;
      }
      if (sub.flags) {
        if (sub.flags.multipleMarks > 0) {
          flagBadgesHtml += `<span class="badge-flag badge-flag-amber" title="${sub.flags.multipleMarks} question(s) marked with multiple choices">⚠️ ${sub.flags.multipleMarks} Multi-mark${sub.flags.multipleMarks > 1 ? 's' : ''}</span> `;
        }
        if (sub.flags.faintMarks > 0) {
          flagBadgesHtml += `<span class="badge-flag badge-flag-sky" title="${sub.flags.faintMarks} question(s) with faint/low-contrast pencil marks">⚠️ ${sub.flags.faintMarks} Faint</span> `;
        }
      }

      tr.innerHTML = `
        <td>
          <strong><code>${sub.studentId || '-'}</code></strong>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
            <span>${sub.studentName || '-'}</span>
            ${sub.isOverridden ? '<span class="badge badge-amber" style="font-size: 0.68rem;">✏️ Overridden</span>' : ''}
            ${flagBadgesHtml}
          </div>
        </td>
        <td><span class="badge badge-slate">${sub.testFormCode || '-'}</span></td>
        <td>${isErr ? '—' : `${sub.points !== undefined ? sub.points : 0} / ${totalQ}`}</td>
        <td>${scoreBadge}</td>
        <td><code>${sub.threshold ? (sub.threshold * 100).toFixed(1) + '%' : '-'}</code></td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-sm btn-subtle btn-override-row" data-id="${sub.id}" title="Edit / Override student data or answers">✏️ Override</button>
            <button class="btn btn-sm btn-primary btn-view-row" data-id="${sub.id}">🖼️ View</button>
            <button class="btn btn-sm btn-subtle btn-inspect-row" data-id="${sub.id}" style="${isFlagged ? 'border-color: #fcd34d; color: #92400e; background-color: #fef3c7;' : ''}">📍 Inspect</button>
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

  if (filterPills) {
    filterPills.querySelectorAll('.filter-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filterPills.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter || 'all';
        renderResults();
      });
    });
  }

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
