/**
 * sheetViewer.js - Interactive Sheet Gallery & Fullscreen Exam Viewer
 * Allows viewing all stored scans, zooming in high-res, navigating between sheets, and inspecting scored overlays.
 */

export function initSheetViewer(app) {
  const galleryGrid = document.getElementById('sheetGalleryGrid');
  const galleryCountBadge = document.getElementById('galleryCountBadge');
  const inputSearchGallery = document.getElementById('inputSearchGallery');
  const selectSortGallery = document.getElementById('selectSortGallery');
  const selectFilterGallery = document.getElementById('selectFilterGallery');
  const selectFilterExamGallery = document.getElementById('selectFilterExamGallery');

  // Fullscreen Viewer Modal Elements
  const modal = document.getElementById('modalSheetViewer');
  const btnCloseModal = document.getElementById('btnCloseSheetViewer');
  const btnPrevSheet = document.getElementById('btnViewerPrevSheet');
  const btnNextSheet = document.getElementById('btnViewerNextSheet');
  const btnDownloadViewerImage = document.getElementById('btnDownloadViewerImage');
  const btnOpenInspectorFromViewer = document.getElementById('btnOpenInspectorFromViewer');
  const viewerTitle = document.getElementById('viewerStudentTitle');
  const viewerSubTitle = document.getElementById('viewerStudentSubtitle');
  const viewerScoreBadge = document.getElementById('viewerScoreBadge');
  const viewerPointsBadge = document.getElementById('viewerPointsBadge');
  const viewerFormBadge = document.getElementById('viewerFormBadge');
  const viewerIndexTracker = document.getElementById('viewerIndexTracker');
  const viewerQuestionList = document.getElementById('viewerQuestionList');

  // Canvas & Layers
  const viewerCanvas = document.getElementById('viewerOverlayCanvas');
  const vCtx = viewerCanvas.getContext('2d');
  const chkViewerFiducials = document.getElementById('chkViewerFiducials');
  const chkViewerBubbles = document.getElementById('chkViewerBubbles');
  const chkViewerKeyRings = document.getElementById('chkViewerKeyRings');

  // Zoom controls
  const btnViewerZoomIn = document.getElementById('btnViewerZoomIn');
  const btnViewerZoomOut = document.getElementById('btnViewerZoomOut');
  const btnViewerZoomReset = document.getElementById('btnViewerZoomReset');
  const btnViewerZoomFit = document.getElementById('btnViewerZoomFit');

  let currentSubIndex = -1;
  let activeViewerImage = null;
  let zoomScale = 1.0;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startPanX = 0;
  let startPanY = 0;

  function getFilteredSubmissions() {
    let list = app.state.submissions.slice();
    const query = (inputSearchGallery ? inputSearchGallery.value : '').trim().toLowerCase();
    const filter = selectFilterGallery ? selectFilterGallery.value : 'all';
    const sort = selectSortGallery ? selectSortGallery.value : 'name';
    const examFilter = selectFilterExamGallery ? selectFilterExamGallery.value : 'current';

    if (examFilter === 'current') {
      const active = app.getActiveExam();
      const validExamIds = new Set(app.state.exams.map(e => e.id));
      list = list.filter(s => !s.examId || s.examId === active.id || !validExamIds.has(s.examId));
    }

    if (query) {
      list = list.filter(s =>
        (s.studentName && s.studentName.toLowerCase().includes(query)) ||
        (s.studentId && s.studentId.toLowerCase().includes(query)) ||
        (s.filename && s.filename.toLowerCase().includes(query)) ||
        (s.testFormCode && s.testFormCode.toLowerCase().includes(query)) ||
        (s.examName && s.examName.toLowerCase().includes(query))
      );
    }

    if (filter === 'graded') {
      list = list.filter(s => !s.error);
    } else if (filter === 'error') {
      list = list.filter(s => Boolean(s.error));
    } else if (filter === 'passing') {
      list = list.filter(s => !s.error && s.score >= 50);
    } else if (filter === 'failing') {
      list = list.filter(s => !s.error && s.score < 50);
    }

    if (sort === 'score_desc') {
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (sort === 'score_asc') {
      list.sort((a, b) => (a.score || 0) - (b.score || 0));
    } else if (sort === 'name') {
      list.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
    } else if (sort === 'id') {
      list.sort((a, b) => (a.studentId || '').localeCompare(b.studentId || ''));
    } else if (sort === 'date_desc') {
      list.sort((a, b) => new Date(b.scannedAt || 0) - new Date(a.scannedAt || 0));
    }

    return list;
  }

  function renderGallery() {
    if (!galleryGrid) return;
    const list = getFilteredSubmissions();
    const totalCount = app.state.submissions.length;

    if (galleryCountBadge) {
      galleryCountBadge.textContent = `${list.length} / ${totalCount} Sheets`;
    }

    if (list.length === 0) {
      galleryGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 3.5rem 1rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🖼️</div>
          <h3 style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">No Scanned Sheets Found</h3>
          <p style="font-size: 0.85rem;">Upload or scan exam sheets in the <strong>Scanner</strong> tab to view them here.</p>
        </div>`;
      return;
    }

    galleryGrid.innerHTML = '';
    const activeExam = app.getActiveExam();
    const isViewingAll = (selectFilterExamGallery && selectFilterExamGallery.value === 'all');

    list.forEach((sub, idx) => {
      const card = document.createElement('div');
      card.className = 'sheet-card card';
      card.style.padding = '0.75rem';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '0.5rem';
      card.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';

      const isErr = Boolean(sub.error);
      const scoreBadgeClass = isErr ? 'badge-rose' : sub.score >= 70 ? 'badge-mint' : sub.score >= 50 ? 'badge-sky' : 'badge-amber';
      const scoreText = isErr ? 'Error' : `${sub.score !== undefined ? sub.score + '%' : 'Graded'}`;

      const thumbUrl = sub.imageDataUrl || 'assets/sample_exam_scan.png';
      const examName = sub.examName || (app.state.exams.find(e => e.id === sub.examId) || activeExam).name;

      card.innerHTML = `
        <div style="position: relative; width: 100%; height: 210px; background: #0f172a; border-radius: var(--radius-sm); overflow: hidden; display: flex; align-items: center; justify-content: center; cursor: pointer;" class="sheet-thumb-wrap">
          <img src="${thumbUrl}" alt="${sub.filename}" style="width: 100%; height: 100%; object-fit: contain; transition: transform 0.25s ease;">
          <div style="position: absolute; top: 0.5rem; right: 0.5rem;">
            <span class="badge ${scoreBadgeClass}">${scoreText}</span>
          </div>
          <div style="position: absolute; bottom: 0.5rem; left: 0.5rem; display: flex; gap: 0.25rem; flex-wrap: wrap;">
            <span class="badge badge-slate">Form ${sub.testFormCode || '-'}</span>
            ${sub.isOverridden ? '<span class="badge badge-amber" style="font-size: 0.7rem;">✏️ Overridden</span>' : ''}
            ${isViewingAll ? `<span class="badge badge-sky" style="font-size: 0.7rem;">${examName}</span>` : ''}
          </div>
          <div class="thumb-hover-overlay" style="position: absolute; inset: 0; background: rgba(15, 23, 42, 0.45); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease;">
            <button class="btn btn-sm btn-primary">🔍 View Sheet</button>
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 0.25rem;">
          <div style="overflow: hidden;">
            <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0;">${sub.studentName || 'Student Name'}</h4>
            <p style="font-size: 0.78rem; color: var(--text-secondary); margin: 0.15rem 0 0 0;">ID: <code>${sub.studentId || '-'}</code> • ${sub.filename}</p>
          </div>
        </div>
        <div style="display: flex; gap: 0.35rem; margin-top: auto; padding-top: 0.5rem; border-top: 1px solid var(--border-color); flex-wrap: wrap;">
          <button class="btn btn-sm btn-primary btn-open-viewer" style="flex: 1;">🔍 Viewer</button>
          <button class="btn btn-sm btn-subtle btn-override-card" title="Manually override scan answers/info">✏️</button>
          <button class="btn btn-sm btn-subtle btn-inspect" title="Inspect & Edit Corners">📍</button>
          <button class="btn btn-sm btn-subtle btn-delete-sub" style="color: var(--pastel-rose-text);" title="Delete Sheet">🗑️</button>
        </div>
      `;

      // Event handlers
      card.querySelector('.sheet-thumb-wrap').addEventListener('click', () => {
        openFullscreenViewer(sub.id);
      });
      card.querySelector('.btn-open-viewer').addEventListener('click', () => {
        openFullscreenViewer(sub.id);
      });
      card.querySelector('.btn-override-card').addEventListener('click', () => {
        app.openOverrideModal(sub.id);
      });
      card.querySelector('.btn-inspect').addEventListener('click', () => {
        app.openInspectorForSubmission(sub.id);
      });
      card.querySelector('.btn-delete-sub').addEventListener('click', () => {
        if (confirm(`Delete ${sub.filename} (${sub.studentName || 'Student'}) from local storage?`)) {
          app.deleteSubmission(sub.id);
        }
      });

      // Hover effect on thumb
      const thumbWrap = card.querySelector('.sheet-thumb-wrap');
      const overlay = card.querySelector('.thumb-hover-overlay');
      const imgEl = card.querySelector('img');
      thumbWrap.addEventListener('mouseenter', () => {
        overlay.style.opacity = '1';
        imgEl.style.transform = 'scale(1.04)';
      });
      thumbWrap.addEventListener('mouseleave', () => {
        overlay.style.opacity = '0';
        imgEl.style.transform = 'scale(1.0)';
      });

      galleryGrid.appendChild(card);
    });
  }

  function openFullscreenViewer(subId) {
    const list = app.state.submissions;
    currentSubIndex = list.findIndex(s => s.id === subId);
    if (currentSubIndex === -1 && list.length > 0) currentSubIndex = 0;
    if (currentSubIndex === -1) return;

    modal.classList.add('open');
    zoomScale = 1.0;
    panX = 0;
    panY = 0;
    loadViewerSubmission();
  }

  function closeFullscreenViewer() {
    modal.classList.remove('open');
    activeViewerImage = null;
  }

  function loadViewerSubmission() {
    const list = app.state.submissions;
    if (currentSubIndex < 0 || currentSubIndex >= list.length) return;
    const sub = list[currentSubIndex];

    // Navigation buttons state
    if (btnPrevSheet) btnPrevSheet.disabled = (currentSubIndex === 0);
    if (btnNextSheet) btnNextSheet.disabled = (currentSubIndex === list.length - 1);
    if (viewerIndexTracker) {
      viewerIndexTracker.textContent = `${currentSubIndex + 1} / ${list.length}`;
    }

    viewerTitle.textContent = sub.studentName || 'Student';
    viewerSubTitle.textContent = `ID: ${sub.studentId || '-'} • File: ${sub.filename}`;
    viewerFormBadge.textContent = `Form: ${sub.testFormCode || 'A'}`;
    const totalQ = sub.totalQuestions || (app.getActiveExamNumQuestions ? app.getActiveExamNumQuestions() : (sub.answers ? sub.answers.length : 75));
    viewerPointsBadge.textContent = sub.error ? 'Error' : `${sub.points || 0} / ${totalQ} pts`;

    if (sub.error) {
      viewerScoreBadge.className = 'badge badge-rose';
      viewerScoreBadge.textContent = 'Alignment Error';
    } else {
      viewerScoreBadge.className = sub.score >= 70 ? 'badge badge-mint' : sub.score >= 50 ? 'badge badge-sky' : 'badge badge-amber';
      viewerScoreBadge.textContent = `${sub.score}%`;
    }

    // Render Question Breakdown in Sidebar
    renderViewerQuestionList(sub);

    // Load Image
    const imgUrl = sub.imageDataUrl;
    if (!imgUrl) {
      // Draw placeholder
      viewerCanvas.width = 800;
      viewerCanvas.height = 600;
      vCtx.fillStyle = '#0f172a';
      vCtx.fillRect(0, 0, 800, 600);
      vCtx.fillStyle = '#94a3b8';
      vCtx.font = '16px Inter, sans-serif';
      vCtx.textAlign = 'center';
      vCtx.fillText("Image not loaded in session. Open Inspector to re-attach image.", 400, 300);
      return;
    }

    const img = new Image();
    img.onload = () => {
      activeViewerImage = img;
      drawViewerCanvas();
    };
    img.onerror = () => {
      viewerCanvas.width = 800;
      viewerCanvas.height = 600;
      vCtx.fillStyle = '#0f172a';
      vCtx.fillRect(0, 0, 800, 600);
      vCtx.fillStyle = '#ef4444';
      vCtx.font = '16px Inter, sans-serif';
      vCtx.textAlign = 'center';
      vCtx.fillText("Failed to load sheet image.", 400, 300);
    };
    img.src = imgUrl;
  }

  function renderViewerQuestionList(sub) {
    if (!viewerQuestionList) return;
    if (sub.error || !sub.answers) {
      viewerQuestionList.innerHTML = `<p style="font-size: 0.8rem; color: var(--pastel-rose-text); padding: 1rem; text-align: center;">${sub.error || 'No answers scored.'}</p>`;
      return;
    }

    const activeKey = app.getActiveAnswerKey(sub.testFormCode);
    const totalQ = sub.totalQuestions || (app.getActiveExamNumQuestions ? app.getActiveExamNumQuestions() : sub.answers.length);
    viewerQuestionList.innerHTML = '';

    sub.answers.forEach((studentAns, qIdx) => {
      const qNum = qIdx + 1;
      const keyAns = (activeKey && activeKey[qIdx]) ? activeKey[qIdx] : '';
      if (!keyAns && qNum > totalQ) return; // Skip unkeyed questions beyond test length

      const isScored = Boolean(keyAns);
      const isCorrect = isScored && (studentAns === keyAns && Boolean(studentAns));
      const isBlank = !studentAns || studentAns === '';

      const row = document.createElement('div');
      row.className = `breakdown-row ${isScored ? (isCorrect ? 'correct' : 'incorrect') : ''}`;
      row.innerHTML = `
        <span style="font-weight: 600;">Q${qNum}</span>
        <span>Student: <strong>${isBlank ? '—' : studentAns}</strong></span>
        <span>Key: <strong>${keyAns || '—'}</strong></span>
        <span>${isScored ? (isCorrect ? '✅ +1' : '❌ 0') : '(Not Scored)'}</span>
      `;
      viewerQuestionList.appendChild(row);
    });
  }

  function drawViewerCanvas() {
    if (!activeViewerImage) return;
    const sub = app.state.submissions[currentSubIndex];
    const img = activeViewerImage;

    viewerCanvas.width = img.width;
    viewerCanvas.height = img.height;

    vCtx.save();
    vCtx.clearRect(0, 0, viewerCanvas.width, viewerCanvas.height);
    vCtx.drawImage(img, 0, 0);

    // 1. Layer: Fiducial Corner Marks
    if (chkViewerFiducials && chkViewerFiducials.checked && sub && sub.corners) {
      const colors = ['#ef4444', '#3b82f6', '#10b981', '#8b5cf6'];
      vCtx.lineWidth = 4;
      vCtx.strokeStyle = '#38bdf8';
      vCtx.beginPath();
      vCtx.moveTo(sub.corners[0].x, sub.corners[0].y);
      vCtx.lineTo(sub.corners[1].x, sub.corners[1].y);
      vCtx.lineTo(sub.corners[2].x, sub.corners[2].y);
      vCtx.lineTo(sub.corners[3].x, sub.corners[3].y);
      vCtx.closePath();
      vCtx.stroke();

      sub.corners.forEach((pt, idx) => {
        vCtx.fillStyle = colors[idx];
        vCtx.beginPath();
        vCtx.arc(pt.x, pt.y, 16, 0, Math.PI * 2);
        vCtx.fill();
        vCtx.strokeStyle = '#ffffff';
        vCtx.lineWidth = 3;
        vCtx.stroke();
      });
    }

    // 2. Layer: Bubble overlays
    if (chkViewerBubbles && chkViewerBubbles.checked && sub && sub.annotatedBubbles) {
      sub.annotatedBubbles.forEach(b => {
        vCtx.lineWidth = 3;
        if (b.filled) {
          vCtx.strokeStyle = '#22c55e';
          vCtx.fillStyle = 'rgba(34, 197, 94, 0.4)';
        } else {
          vCtx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
          vCtx.fillStyle = 'transparent';
        }
        vCtx.beginPath();
        vCtx.arc(b.x, b.y, b.radius || 12, 0, Math.PI * 2);
        vCtx.fill();
        vCtx.stroke();
      });
    }

    vCtx.restore();

    // Apply CSS zoom & pan transform
    viewerCanvas.style.transform = `scale(${zoomScale}) translate(${panX}px, ${panY}px)`;
  }

  // Bind Events
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeFullscreenViewer);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeFullscreenViewer();
    });
  }

  if (btnPrevSheet) {
    btnPrevSheet.addEventListener('click', () => {
      if (currentSubIndex > 0) {
        currentSubIndex--;
        loadViewerSubmission();
      }
    });
  }

  if (btnNextSheet) {
    btnNextSheet.addEventListener('click', () => {
      const list = app.state.submissions;
      if (currentSubIndex < list.length - 1) {
        currentSubIndex++;
        loadViewerSubmission();
      }
    });
  }

  if (btnOpenInspectorFromViewer) {
    btnOpenInspectorFromViewer.addEventListener('click', () => {
      const list = app.state.submissions;
      if (currentSubIndex >= 0 && currentSubIndex < list.length) {
        const subId = list[currentSubIndex].id;
        closeFullscreenViewer();
        app.openInspectorForSubmission(subId);
      }
    });
  }

  if (btnDownloadViewerImage) {
    btnDownloadViewerImage.addEventListener('click', () => {
      const list = app.state.submissions;
      if (currentSubIndex >= 0 && currentSubIndex < list.length) {
        const sub = list[currentSubIndex];
        const link = document.createElement('a');
        link.download = `annotated_${sub.filename || 'sheet.jpg'}`;
        link.href = viewerCanvas.toDataURL('image/jpeg', 0.95);
        link.click();
      }
    });
  }

  // Keyboard shortcuts (Left/Right arrow, Escape)
  window.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return;
    if (e.key === 'Escape') {
      closeFullscreenViewer();
    } else if (e.key === 'ArrowLeft') {
      if (currentSubIndex > 0) {
        currentSubIndex--;
        loadViewerSubmission();
      }
    } else if (e.key === 'ArrowRight') {
      const list = app.state.submissions;
      if (currentSubIndex < list.length - 1) {
        currentSubIndex++;
        loadViewerSubmission();
      }
    }
  });

  // Layer checkbox changes
  if (chkViewerFiducials) chkViewerFiducials.addEventListener('change', drawViewerCanvas);
  if (chkViewerBubbles) chkViewerBubbles.addEventListener('change', drawViewerCanvas);
  if (chkViewerKeyRings) chkViewerKeyRings.addEventListener('change', drawViewerCanvas);

  // Zoom controls
  if (btnViewerZoomIn) {
    btnViewerZoomIn.addEventListener('click', () => {
      zoomScale = Math.min(3.0, zoomScale + 0.2);
      drawViewerCanvas();
    });
  }
  if (btnViewerZoomOut) {
    btnViewerZoomOut.addEventListener('click', () => {
      zoomScale = Math.max(0.3, zoomScale - 0.2);
      drawViewerCanvas();
    });
  }
  if (btnViewerZoomReset) {
    btnViewerZoomReset.addEventListener('click', () => {
      zoomScale = 1.0;
      panX = 0;
      panY = 0;
      drawViewerCanvas();
    });
  }
  if (btnViewerZoomFit) {
    btnViewerZoomFit.addEventListener('click', () => {
      zoomScale = 0.55;
      panX = 0;
      panY = 0;
      drawViewerCanvas();
    });
  }

  // Search & Filter in Gallery
  if (inputSearchGallery) inputSearchGallery.addEventListener('input', renderGallery);
  if (selectSortGallery) selectSortGallery.addEventListener('change', renderGallery);
  if (selectFilterGallery) selectFilterGallery.addEventListener('change', renderGallery);
  if (selectFilterExamGallery) selectFilterExamGallery.addEventListener('change', renderGallery);

  return {
    renderGallery,
    openFullscreenViewer,
    closeFullscreenViewer
  };
}
