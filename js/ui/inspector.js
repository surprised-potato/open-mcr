/**
 * inspector.js - Visual canvas sheet inspector with interactive manual corner correction
 */

import { saveSingleSubmissionToDB } from '../storage/localStore.js';

export function initInspector(app) {
  const selectSub = document.getElementById('selectInspectSubmission');
  const canvas = document.getElementById('inspectorCanvas');
  const ctx = canvas.getContext('2d');

  const chkFiducials = document.getElementById('chkLayerFiducials');
  const chkBubbles = document.getElementById('chkLayerBubbles');
  const chkLabels = document.getElementById('chkLayerLabels');

  const btnToggleEditCorners = document.getElementById('btnToggleEditCorners');
  const btnApplyManualCorners = document.getElementById('btnApplyManualCorners');
  const btnResetCorners = document.getElementById('btnResetCorners');
  const cornerHelpBanner = document.getElementById('cornerHelpBanner');
  const inspectErrorBanner = document.getElementById('inspectErrorBanner');
  const inspectErrorMessage = document.getElementById('inspectErrorMessage');

  const attachImageContainer = document.getElementById('attachImageContainer');
  const btnAttachImage = document.getElementById('btnAttachImage');
  const fileAttachImage = document.getElementById('fileAttachImage');

  const studentNameEl = document.getElementById('inspectStudentName');
  const studentDetailsEl = document.getElementById('inspectStudentDetails');
  const scoreBadgeEl = document.getElementById('inspectScoreBadge');
  const thresholdBadgeEl = document.getElementById('inspectThresholdBadge');
  const qListEl = document.getElementById('inspectorQuestionList');

  // Navigation Arrows & Tracker
  const btnPrev = document.getElementById('btnInspectPrevSheet');
  const btnNext = document.getElementById('btnInspectNextSheet');
  const indexTracker = document.getElementById('inspectIndexTracker');

  const canvasWrapper = document.getElementById('canvasWrapper');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomReset = document.getElementById('btnZoomReset');
  const inspectZoomLevel = document.getElementById('inspectZoomLevel');

  let currentImage = null;
  let zoomScale = 1.0;
  let isEditingCorners = false;
  let activeCorners = null; // Array of 4 points: [TL, TR, BR, BL]
  let draggingCornerIdx = -1;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panScrollLeft = 0;
  let panScrollTop = 0;

  function updateCanvasDimensions() {
    if (!currentImage) {
      canvas.width = 600;
      canvas.height = 400;
      canvas.style.width = '100%';
      canvas.style.maxWidth = '600px';
      canvas.style.height = 'auto';
      if (inspectZoomLevel) inspectZoomLevel.textContent = '100%';
      return;
    }

    if (canvas.width !== currentImage.width || canvas.height !== currentImage.height) {
      canvas.width = currentImage.width;
      canvas.height = currentImage.height;
    }

    const wrapW = canvasWrapper ? Math.max(280, canvasWrapper.clientWidth - 24) : 700;
    const wrapH = canvasWrapper ? Math.max(280, canvasWrapper.clientHeight - 24) : 600;

    const baseScale = Math.min(wrapW / currentImage.width, wrapH / currentImage.height);
    const displayW = Math.round(currentImage.width * baseScale * zoomScale);
    const displayH = Math.round(currentImage.height * baseScale * zoomScale);

    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
    canvas.style.maxWidth = 'none';
    canvas.style.maxHeight = 'none';

    if (inspectZoomLevel) {
      inspectZoomLevel.textContent = `${Math.round(zoomScale * 100)}%`;
    }
  }

  function setZoom(newScale, centerPoint = null) {
    const clamped = Math.max(0.4, Math.min(4.0, Number(newScale.toFixed(2))));
    if (Math.abs(clamped - zoomScale) < 0.001) return;

    const oldScale = zoomScale;
    zoomScale = clamped;

    if (canvasWrapper && currentImage) {
      const prevScrollX = canvasWrapper.scrollLeft;
      const prevScrollY = canvasWrapper.scrollTop;
      const ratio = zoomScale / oldScale;

      updateCanvasDimensions();
      drawCanvas();

      if (centerPoint) {
        canvasWrapper.scrollLeft = (centerPoint.x + prevScrollX) * ratio - centerPoint.x;
        canvasWrapper.scrollTop = (centerPoint.y + prevScrollY) * ratio - centerPoint.y;
      } else {
        const centerX = prevScrollX + canvasWrapper.clientWidth / 2;
        const centerY = prevScrollY + canvasWrapper.clientHeight / 2;
        canvasWrapper.scrollLeft = centerX * ratio - canvasWrapper.clientWidth / 2;
        canvasWrapper.scrollTop = centerY * ratio - canvasWrapper.clientHeight / 2;
      }
    } else {
      updateCanvasDimensions();
      drawCanvas();
    }
  }

  function navigateSheet(delta) {
    const list = app.getActiveSubmissions();
    if (list.length === 0) return;
    let currentIndex = list.findIndex(s => s.id === app.state.selectedScanId);
    if (currentIndex === -1) currentIndex = 0;
    const newIndex = Math.max(0, Math.min(list.length - 1, currentIndex + delta));
    if (list[newIndex]) {
      app.state.selectedScanId = list[newIndex].id;
      isEditingCorners = false;
      renderInspector();
    }
  }

  function populateSelector() {
    selectSub.innerHTML = '<option value="">Select a scanned sheet...</option>';
    const list = app.getActiveSubmissions();
    list.forEach((sub, idx) => {
      const opt = document.createElement('option');
      opt.value = sub.id;
      const statusText = sub.error ? `⚠️ Error (${sub.error})` : `${sub.score !== undefined ? sub.score + '%' : 'Graded'}`;
      opt.textContent = `${idx + 1}. ${sub.filename} — ${sub.studentName || 'Student'} (${statusText})`;
      if (sub.id === app.state.selectedScanId) {
        opt.selected = true;
      }
      selectSub.appendChild(opt);
    });
  }

  function getSelectedSubmission() {
    return app.state.submissions.find(s => s.id === app.state.selectedScanId);
  }

  function initCornersForSub(sub, imgWidth, imgHeight) {
    if (sub && sub.corners && Array.isArray(sub.corners) && sub.corners.length === 4) {
      activeCorners = JSON.parse(JSON.stringify(sub.corners));
    } else {
      // Default 5% inset corners
      const padX = imgWidth * 0.05;
      const padY = imgHeight * 0.05;
      activeCorners = [
        { x: padX, y: padY },
        { x: imgWidth - padX, y: padY },
        { x: imgWidth - padX, y: imgHeight - padY },
        { x: padX, y: imgHeight - padY }
      ];
    }
  }

  function updateCornerUIState() {
    if (isEditingCorners) {
      btnToggleEditCorners.classList.add('btn-primary');
      btnToggleEditCorners.classList.remove('btn-subtle');
      btnToggleEditCorners.textContent = '❌ Cancel Editing';
      btnApplyManualCorners.style.display = 'inline-flex';
      btnResetCorners.style.display = 'inline-flex';
      cornerHelpBanner.style.display = 'block';
    } else {
      btnToggleEditCorners.classList.remove('btn-primary');
      btnToggleEditCorners.classList.add('btn-subtle');
      btnToggleEditCorners.textContent = '📍 Edit Corners';
      btnApplyManualCorners.style.display = 'none';
      btnResetCorners.style.display = 'none';
      cornerHelpBanner.style.display = 'none';
    }
  }

  async function renderInspector() {
    const list = app.getActiveSubmissions();
    if ((!app.state.selectedScanId || !list.some(s => s.id === app.state.selectedScanId)) && list.length > 0) {
      app.state.selectedScanId = list[0].id;
    }

    populateSelector();
    renderCornerLogsUI();
    const currentIndex = list.findIndex(s => s.id === app.state.selectedScanId);

    // Update Index Tracker and Arrow button states
    if (indexTracker) {
      if (list.length === 0) {
        indexTracker.textContent = '0 / 0';
      } else if (currentIndex === -1) {
        indexTracker.textContent = `- / ${list.length}`;
      } else {
        indexTracker.textContent = `${currentIndex + 1} / ${list.length}`;
      }
    }
    if (btnPrev) btnPrev.disabled = (currentIndex <= 0 || list.length === 0);
    if (btnNext) btnNext.disabled = (currentIndex === -1 || currentIndex >= list.length - 1 || list.length === 0);

    const sub = getSelectedSubmission();

    if (!sub) {
      studentNameEl.textContent = 'No Sheet Selected';
      studentDetailsEl.textContent = 'Select a sheet from the dropdown or batch list';
      scoreBadgeEl.textContent = 'Score: -';
      scoreBadgeEl.className = 'badge badge-slate';
      thresholdBadgeEl.textContent = 'Threshold: -';
      qListEl.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin-top: 2rem;">No sheet selected.</p>';
      inspectErrorBanner.style.display = 'none';
      attachImageContainer.style.display = 'none';
      isEditingCorners = false;
      updateCornerUIState();

      updateCanvasDimensions();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select a sheet above to view visual inspection overlay', 300, 200);
      return;
    }

    // Update Sidebar details
    studentNameEl.innerHTML = `
      ${sub.studentName || (sub.error ? 'Failed to read sheet' : 'Unknown Student')}
      ${sub.isOverridden ? '<span class="badge badge-amber" style="margin-left: 0.35rem; font-size: 0.7rem;">✏️ Overridden</span>' : ''}
    `;
    studentDetailsEl.innerHTML = `
      ID: ${sub.studentId || '-'} • Form: ${sub.testFormCode || '-'} • File: ${sub.filename}
      <button class="btn btn-sm btn-subtle" id="btnInspectorOverrideSub" style="margin-left: 0.5rem; padding: 0.15rem 0.45rem; font-size: 0.72rem;">✏️ Edit / Override</button>
    `;
    
    const btnOverride = document.getElementById('btnInspectorOverrideSub');
    if (btnOverride) {
      btnOverride.addEventListener('click', () => {
        app.openOverrideModal(sub.id);
      });
    }
    
    // Render Question Sidebar Breakdown
    const scored = app.scoreExtractedData(sub);
    const totalQ = scored.totalQuestions || sub.totalQuestions || (sub.answers ? sub.answers.length : 75);

    if (sub.error) {
      scoreBadgeEl.textContent = 'Status: Error';
      scoreBadgeEl.className = 'badge badge-rose';
      inspectErrorBanner.style.display = 'block';
      inspectErrorMessage.textContent = sub.error;
    } else {
      scoreBadgeEl.textContent = `Score: ${sub.score !== undefined ? sub.score : 0}% (${sub.points || 0} / ${totalQ} pts)`;
      scoreBadgeEl.className = `badge ${(sub.score >= 70) ? 'badge-mint' : 'badge-rose'}`;
      inspectErrorBanner.style.display = 'none';
    }

    thresholdBadgeEl.textContent = `Threshold: ${sub.threshold ? (sub.threshold * 100).toFixed(1) + '%' : '-'}`;

    qListEl.innerHTML = '';
    
    if (scored && scored.questionScores && scored.questionScores.length > 0) {
      // Display only scored questions (e.g. Q1..Q60 if 60 answers on test)
      const visibleScores = scored.questionScores.filter(qItem => qItem.isScored !== false || qItem.q <= totalQ);
      visibleScores.forEach(qItem => {
        const isScored = qItem.isScored !== false;
        const qIdx = qItem.q - 1;
        const currentAns = (sub.answers && sub.answers[qIdx] ? sub.answers[qIdx] : '').trim().toUpperCase();
        const keyAns = (qItem.correctAnswer || '—').trim().toUpperCase();
        const isCorrect = isScored && (currentAns !== '' && currentAns === keyAns);

        const row = document.createElement('div');
        row.className = `breakdown-row ${isScored ? (isCorrect ? 'correct' : 'incorrect') : ''}`;
        row.id = `inspectRow_Q${qItem.q}`;

        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.35rem; min-width: 90px;">
            <strong style="min-width: 26px; color: var(--text-main);">Q${qItem.q}:</strong>
            <span style="font-size: 0.72rem; color: var(--text-secondary);">Key: <strong>${keyAns}</strong> ${isScored ? (isCorrect ? '✓' : '✗') : ''}</span>
          </div>
          <div class="sidebar-answer-picker" title="Click to override marked answer for Q${qItem.q}">
            <button type="button" class="sidebar-opt-btn ${currentAns === 'A' ? 'active' : ''}" data-opt="A">A</button>
            <button type="button" class="sidebar-opt-btn ${currentAns === 'B' ? 'active' : ''}" data-opt="B">B</button>
            <button type="button" class="sidebar-opt-btn ${currentAns === 'C' ? 'active' : ''}" data-opt="C">C</button>
            <button type="button" class="sidebar-opt-btn ${currentAns === 'D' ? 'active' : ''}" data-opt="D">D</button>
            <button type="button" class="sidebar-opt-btn ${currentAns === 'E' ? 'active' : ''}" data-opt="E">E</button>
            <button type="button" class="sidebar-opt-btn ${currentAns === '' || currentAns === ' ' ? 'active' : ''}" data-opt="" title="Blank / Clear">—</button>
          </div>
        `;

        row.querySelectorAll('.sidebar-opt-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newOpt = btn.dataset.opt;

            if (!sub.answers) sub.answers = [];
            while (sub.answers.length <= qIdx) sub.answers.push('');

            sub.answers[qIdx] = newOpt;

            // 1. Instant local DOM highlight
            row.querySelectorAll('.sidebar-opt-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.opt === newOpt);
            });

            // 2. Instant row correctness state
            const isNowCorrect = isScored && (newOpt !== '' && newOpt === keyAns);
            row.className = `breakdown-row ${isScored ? (isNowCorrect ? 'correct' : 'incorrect') : ''}`;
            const keyLabel = row.querySelector('span');
            if (keyLabel) {
              keyLabel.innerHTML = `Key: <strong>${keyAns}</strong> ${isScored ? (isNowCorrect ? '✓' : '✗') : ''}`;
            }

            // 3. Instant score calculation and badge update
            const newScored = app.scoreExtractedData(sub);
            sub.score = newScored.percentage;
            sub.points = newScored.points;
            sub.totalQuestions = newScored.totalQuestions;
            if (scoreBadgeEl) {
              scoreBadgeEl.textContent = `Score: ${sub.score !== undefined ? sub.score : 0}% (${sub.points || 0} / ${totalQ} pts)`;
              scoreBadgeEl.className = `badge ${(sub.score >= 70) ? 'badge-mint' : 'badge-rose'}`;
            }

            // 4. Debounced storage save in background without disrupting current view
            app.applySubmissionOverride(sub.id, {
              answers: sub.answers
            }, { debounce: true, skipRender: true });
          });
        });

        qListEl.appendChild(row);
      });
    } else {
      qListEl.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin-top: 1.5rem;">${sub.error ? `Error: ${sub.error}. Adjust corners to re-process.` : 'No answers recorded.'}</p>`;
    }

    // Check if image data is available
    if (!sub.imageDataUrl) {
      attachImageContainer.style.display = 'block';
      currentImage = null;
      updateCanvasDimensions();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ef4444';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Image not loaded in session memory.', 300, 180);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('Use the button in the sidebar to select the image file.', 300, 210);
      return;
    }

    attachImageContainer.style.display = 'none';

    // Auto-enable corner edit mode if submission has alignment error or missing corners
    if (sub.error || !sub.corners) {
      isEditingCorners = true;
    }
    updateCornerUIState();

    // Clear stale placeholder & show loading state on canvas
    updateCanvasDimensions();
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`⏳ Loading sheet preview (${sub.filename})...`, 300, 200);

    // Load image
    const img = new Image();
    if (typeof sub.imageDataUrl === 'string' && (sub.imageDataUrl.startsWith('http://') || sub.imageDataUrl.startsWith('https://'))) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      currentImage = img;
      initCornersForSub(sub, img.width, img.height);
      drawCanvas();
    };
    img.onerror = (err) => {
      console.error("Failed to load scan image into canvas:", err);
      attachImageContainer.style.display = 'block';
      currentImage = null;
      updateCanvasDimensions();
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ef4444';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ Failed to load scan image preview.', 300, 180);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('Use "📷 Select Image for This Sheet" in the sidebar to select the image file.', 300, 210);
    };
    img.src = sub.imageDataUrl;
    if (img.complete && img.naturalWidth > 0) {
      currentImage = img;
      initCornersForSub(sub, img.width, img.height);
      drawCanvas();
    }
  }

  function drawCanvas() {
    if (!currentImage) return;
    const sub = getSelectedSubmission();
    if (!sub) return;

    updateCanvasDimensions();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw raw scan
    ctx.drawImage(currentImage, 0, 0);

    const scored = app.scoreExtractedData(sub);
    const keyAnswers = app.getAnswersForForm(sub.testFormCode || 'A');

    // 2. Draw Fiducial Marks / Interactive Manual Corners
    if ((chkFiducials.checked || isEditingCorners) && activeCorners && activeCorners.length === 4) {
      const lineWidth = Math.max(3, currentImage.width / 350);
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = isEditingCorners ? '#f59e0b' : '#4f46e5';
      if (isEditingCorners) {
        ctx.setLineDash([lineWidth * 3, lineWidth * 1.5]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(activeCorners[0].x, activeCorners[0].y);
      for (let i = 1; i < activeCorners.length; i++) {
        ctx.lineTo(activeCorners[i].x, activeCorners[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      // Corner handle nodes (TL, TR, BR, BL)
      const handleRadius = Math.max(12, currentImage.width / 65);
      const cornerColors = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7'];
      const cornerLabels = ['TL', 'TR', 'BR', 'BL'];

      activeCorners.forEach((c, idx) => {
        // Dragging halo
        if (draggingCornerIdx === idx) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.beginPath();
          ctx.arc(c.x, c.y, handleRadius * 1.8, 0, 2 * Math.PI);
          ctx.fill();
        }

        ctx.fillStyle = cornerColors[idx];
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, lineWidth * 0.8);
        ctx.beginPath();
        ctx.arc(c.x, c.y, handleRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Label
        ctx.fillStyle = '#ffffff';
        const fontSize = Math.max(11, Math.round(handleRadius * 0.85));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cornerLabels[idx], c.x, c.y);
      });
    }

    // 3. Draw Bubble Overlays
    if (chkBubbles.checked && sub.annotatedBubbles && !isEditingCorners) {
      sub.annotatedBubbles.forEach(b => {
        if (b.type === 'question') {
          const isCorrectChoice = keyAnswers && keyAnswers[b.qNumber - 1] === b.choice;

          if (b.isFilled) {
            if (isCorrectChoice) {
              ctx.fillStyle = 'rgba(34, 197, 94, 0.55)';
              ctx.strokeStyle = '#16a34a';
            } else {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.55)';
              ctx.strokeStyle = '#dc2626';
            }
            ctx.lineWidth = Math.max(2, currentImage.width / 500);
            ctx.beginPath();
            ctx.arc(b.center.x, b.center.y, b.radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
          }

          if (chkLabels.checked && isCorrectChoice && !b.isFilled) {
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = Math.max(2.5, currentImage.width / 400);
            ctx.setLineDash([4, 2]);
            ctx.beginPath();
            ctx.arc(b.center.x, b.center.y, b.radius + 2, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else if (b.type === 'metadata' && b.isFilled) {
          ctx.fillStyle = 'rgba(168, 85, 247, 0.45)';
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = Math.max(1.5, currentImage.width / 600);
          ctx.beginPath();
          ctx.arc(b.center.x, b.center.y, b.radius, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      });
    }
  }

  // Pointer & Dragging Helpers for Canvas
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;

    if (!rect.width || !rect.height || !currentImage) {
      return { x: 0, y: 0 };
    }

    // Scale CSS viewport position directly to full image resolution space
    const scaleX = currentImage.width / rect.width;
    const scaleY = currentImage.height / rect.height;

    const imgX = (clientX - rect.left) * scaleX;
    const imgY = (clientY - rect.top) * scaleY;

    return { x: imgX, y: imgY };
  }

  function findCornerUnderPoint(pt) {
    if (!activeCorners || !currentImage) return -1;
    const rect = canvas.getBoundingClientRect();
    const hitRadiusCss = 30; // 30px comfortable screen hit radius
    const hitRadiusImage = hitRadiusCss * (rect.width ? (currentImage.width / rect.width) : 1);

    for (let i = 0; i < activeCorners.length; i++) {
      const c = activeCorners[i];
      const dist = Math.hypot(c.x - pt.x, c.y - pt.y);
      if (dist <= hitRadiusImage) {
        return i;
      }
    }
    return -1;
  }

  // Mouse & Touch Event Listeners for Corner Dragging & Panning
  function handlePointerDown(e) {
    if (!currentImage) return;
    const pt = getCanvasCoords(e);
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;

    if (isEditingCorners) {
      const idx = findCornerUnderPoint(pt);
      if (idx !== -1) {
        draggingCornerIdx = idx;
        canvas.style.cursor = 'grabbing';
        drawCanvas();
        e.preventDefault();
        return;
      }
    }

    // Drag-to-pan when clicking canvas background
    if (e.button === 0 || e.button === 1 || (e.touches && e.touches.length > 0)) {
      isPanning = true;
      panStartX = clientX;
      panStartY = clientY;
      if (canvasWrapper) {
        panScrollLeft = canvasWrapper.scrollLeft;
        panScrollTop = canvasWrapper.scrollTop;
      }
      canvas.style.cursor = 'grabbing';
      if (canvasWrapper) canvasWrapper.style.cursor = 'grabbing';
    }
  }

  function handlePointerMove(e) {
    if (!currentImage) return;
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;

    if (draggingCornerIdx !== -1 && isEditingCorners) {
      const pt = getCanvasCoords(e);
      activeCorners[draggingCornerIdx].x = Math.max(0, Math.min(currentImage.width, pt.x));
      activeCorners[draggingCornerIdx].y = Math.max(0, Math.min(currentImage.height, pt.y));
      canvas.style.cursor = 'grabbing';
      drawCanvas();
      e.preventDefault();
      return;
    }

    if (isPanning && canvasWrapper) {
      const dx = clientX - panStartX;
      const dy = clientY - panStartY;
      canvasWrapper.scrollLeft = panScrollLeft - dx;
      canvasWrapper.scrollTop = panScrollTop - dy;
      e.preventDefault();
      return;
    }

    if (isEditingCorners) {
      const pt = getCanvasCoords(e);
      const idx = findCornerUnderPoint(pt);
      canvas.style.cursor = idx !== -1 ? 'grab' : (zoomScale > 1.0 ? 'grab' : 'default');
      if (canvasWrapper) canvasWrapper.style.cursor = idx !== -1 ? 'grab' : (zoomScale > 1.0 ? 'grab' : 'default');
    } else {
      canvas.style.cursor = zoomScale > 1.0 ? 'grab' : 'default';
      if (canvasWrapper) canvasWrapper.style.cursor = zoomScale > 1.0 ? 'grab' : 'default';
    }
  }

  function handlePointerUp() {
    if (draggingCornerIdx !== -1) {
      draggingCornerIdx = -1;
      canvas.style.cursor = isEditingCorners ? 'grab' : 'default';
      drawCanvas();
    }
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = isEditingCorners ? 'default' : (zoomScale > 1.0 ? 'grab' : 'default');
      if (canvasWrapper) canvasWrapper.style.cursor = 'default';
    }
  }

  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);

  canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
  window.addEventListener('touchmove', handlePointerMove, { passive: false });
  window.addEventListener('touchend', handlePointerUp);

  if (canvasWrapper) {
    canvasWrapper.addEventListener('wheel', (e) => {
      // Zoom with wheel
      if (e.ctrlKey || e.metaKey || !isEditingCorners) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        const rect = canvasWrapper.getBoundingClientRect();
        const mousePos = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
        setZoom(zoomScale + delta, mousePos);
      }
    }, { passive: false });
  }

  window.addEventListener('resize', () => {
    if (zoomScale === 1.0 && currentImage) {
      updateCanvasDimensions();
      drawCanvas();
    }
  });

  // Button Interactions
  selectSub.addEventListener('change', (e) => {
    app.state.selectedScanId = e.target.value;
    isEditingCorners = false;
    renderInspector();
  });

  btnToggleEditCorners.addEventListener('click', () => {
    isEditingCorners = !isEditingCorners;
    const sub = getSelectedSubmission();
    if (isEditingCorners && currentImage && !activeCorners) {
      initCornersForSub(sub, currentImage.width, currentImage.height);
    }
    updateCornerUIState();
    drawCanvas();
  });

  btnResetCorners.addEventListener('click', () => {
    if (!currentImage) return;
    const sub = getSelectedSubmission();
    initCornersForSub(sub ? { ...sub, corners: null } : null, currentImage.width, currentImage.height);
    drawCanvas();
  });

  const cornerLogCountBadge = document.getElementById('cornerLogCountBadge');
  const btnCopyLatestCornerLog = document.getElementById('btnCopyLatestCornerLog');
  const btnCopyAllCornerLogs = document.getElementById('btnCopyAllCornerLogs');
  const btnClearCornerLogs = document.getElementById('btnClearCornerLogs');
  const cornerLogContainer = document.getElementById('cornerLogContainer');

  const CORNER_LOGS_STORAGE_KEY = 'openmcr_corner_correction_logs';

  function getCornerLogs() {
    try {
      const raw = localStorage.getItem(CORNER_LOGS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCornerLogs(logs) {
    try {
      localStorage.setItem(CORNER_LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      console.warn("Could not save corner correction logs to localStorage:", e);
    }
  }

  function formatSingleLogMarkdown(entry) {
    const b = entry.before;
    const a = entry.after;
    let cornerLines = '';
    entry.after.deltas.forEach(d => {
      if (d.before) {
        const signX = d.dx >= 0 ? `+${d.dx}` : `${d.dx}`;
        const signY = d.dy >= 0 ? `+${d.dy}` : `${d.dy}`;
        cornerLines += `  - **${d.corner}**: (${d.before.x}, ${d.before.y}) ➔ (${d.after.x}, ${d.after.y}) [Δx: ${signX}, Δy: ${signY}, dist: ${d.dist}px]\n`;
      } else {
        cornerLines += `  - **${d.corner}**: [no auto-detect] ➔ (${d.after.x}, ${d.after.y})\n`;
      }
    });

    return `### 📍 Corner Correction Log: \`${entry.filename}\` (${new Date(entry.timestamp).toLocaleString()})
- **Image Size**: ${entry.imageWidth} × ${entry.imageHeight} px | **Form Variant**: ${entry.formVariant}
- **Before Status**: ${b.error ? `⚠️ Error: "${b.error}"` : `Graded (${b.score}%, ${b.points} pts), ID: \`${b.studentId}\`, Form: \`${b.testFormCode}\``}
- **Corner Shifts**:
${cornerLines.trimEnd()}
- **After Re-process**: Score: **${a.score}%** (${a.points} pts) | Student ID: \`${a.studentId}\` | Form: \`${a.testFormCode}\` | Filled Answers: ${a.answersCount} | Threshold: ${(a.threshold * 100).toFixed(1)}%
\`\`\`json
${JSON.stringify({
  filename: entry.filename,
  imageWidth: entry.imageWidth,
  imageHeight: entry.imageHeight,
  beforeCorners: b.corners,
  afterCorners: a.corners
}, null, 2)}
\`\`\``;
  }

  function renderCornerLogsUI() {
    if (!cornerLogCountBadge || !cornerLogContainer) return;
    const logs = getCornerLogs();
    cornerLogCountBadge.textContent = `${logs.length} correction${logs.length === 1 ? '' : 's'}`;

    if (logs.length === 0) {
      if (btnCopyLatestCornerLog) btnCopyLatestCornerLog.disabled = true;
      if (btnCopyAllCornerLogs) btnCopyAllCornerLogs.disabled = true;
      cornerLogContainer.textContent = 'No corner corrections recorded yet. When you adjust corner handles and click "⚡ Re-process Sheet", the before and after coordinates and scoring deltas will be logged here.';
      return;
    }

    if (btnCopyLatestCornerLog) btnCopyLatestCornerLog.disabled = false;
    if (btnCopyAllCornerLogs) btnCopyAllCornerLogs.disabled = false;

    const displayText = logs.slice().reverse().map((entry, idx) => {
      return `[#${logs.length - idx}] ${entry.filename} (${new Date(entry.timestamp).toLocaleTimeString()})\n` +
        `  Image: ${entry.imageWidth}x${entry.imageHeight} | Form: ${entry.formVariant}\n` +
        `  Before: ${entry.before.error ? 'Error: ' + entry.before.error : 'Score: ' + entry.before.score + '% (' + entry.before.points + ' pts)'}\n` +
        `  After:  Score: ${entry.after.score}% (${entry.after.points} pts) | ID: ${entry.after.studentId} | Form: ${entry.after.testFormCode} | Answers: ${entry.after.answersCount}\n` +
        `  Corners (TL, TR, BR, BL):\n` +
        entry.after.deltas.map(d => {
          if (d.before) {
            const sx = d.dx >= 0 ? `+${d.dx}` : `${d.dx}`;
            const sy = d.dy >= 0 ? `+${d.dy}` : `${d.dy}`;
            return `    ${d.corner}: (${d.before.x}, ${d.before.y}) -> (${d.after.x}, ${d.after.y}) [Δx: ${sx}, Δy: ${sy}, dist: ${d.dist}px]`;
          }
          return `    ${d.corner}: -> (${d.after.x}, ${d.after.y})`;
        }).join('\n');
    }).join('\n\n' + '—'.repeat(60) + '\n\n');

    cornerLogContainer.textContent = displayText;
  }

  if (btnCopyLatestCornerLog) {
    btnCopyLatestCornerLog.addEventListener('click', async () => {
      const logs = getCornerLogs();
      if (logs.length === 0) return;
      const latest = logs[logs.length - 1];
      const md = formatSingleLogMarkdown(latest);
      try {
        await navigator.clipboard.writeText(md);
        const origText = btnCopyLatestCornerLog.textContent;
        btnCopyLatestCornerLog.textContent = '✅ Copied!';
        setTimeout(() => { btnCopyLatestCornerLog.textContent = origText; }, 2000);
      } catch (err) {
        alert("Could not copy to clipboard. Log content:\n\n" + md);
      }
    });
  }

  if (btnCopyAllCornerLogs) {
    btnCopyAllCornerLogs.addEventListener('click', async () => {
      const logs = getCornerLogs();
      if (logs.length === 0) return;
      const allMd = logs.map(formatSingleLogMarkdown).join('\n\n---\n\n');
      try {
        await navigator.clipboard.writeText(allMd);
        const origText = btnCopyAllCornerLogs.textContent;
        btnCopyAllCornerLogs.textContent = '✅ Copied All!';
        setTimeout(() => { btnCopyAllCornerLogs.textContent = origText; }, 2000);
      } catch (err) {
        alert("Could not copy to clipboard. Log content:\n\n" + allMd);
      }
    });
  }

  if (btnClearCornerLogs) {
    btnClearCornerLogs.addEventListener('click', () => {
      if (confirm("Clear all corner correction logs?")) {
        saveCornerLogs([]);
        renderCornerLogsUI();
      }
    });
  }

  renderCornerLogsUI();

  btnApplyManualCorners.addEventListener('click', async () => {
    const sub = getSelectedSubmission();
    if (!sub || !currentImage || !activeCorners) return;

    btnApplyManualCorners.disabled = true;
    btnApplyManualCorners.textContent = '⏳ Processing OMR...';

    // Prepare snapshot of before state
    const beforeCorners = sub.detectedCorners || sub.corners || null;
    const beforeError = sub.error || null;
    const beforeScore = sub.score !== undefined ? sub.score : null;
    const beforePoints = sub.points !== undefined ? sub.points : null;
    const beforeStudentId = sub.studentId || '-';
    const beforeForm = sub.testFormCode || '-';
    const beforeAnswersCount = sub.answers ? sub.answers.filter(Boolean).length : 0;

    const afterCorners = JSON.parse(JSON.stringify(activeCorners));

    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = currentImage.width;
      tempCanvas.height = currentImage.height;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.drawImage(currentImage, 0, 0);
      const imageData = tCtx.getImageData(0, 0, currentImage.width, currentImage.height);

      const scanResult = await app.ui.scanner.processSingleScan({
        filename: sub.filename,
        imageData,
        manualCorners: activeCorners
      });

      // Update submission data
      sub.studentId = scanResult.studentId || 'Unknown';
      sub.studentName = scanResult.studentName || 'Unknown';
      sub.testFormCode = scanResult.testFormCode || 'A';
      sub.courseId = scanResult.courseId || '';
      sub.answers = scanResult.answers;
      sub.threshold = scanResult.threshold;
      sub.corners = scanResult.corners || activeCorners;
      sub.lMark = scanResult.lMark;
      sub.squares = scanResult.squares;
      sub.annotatedBubbles = scanResult.annotatedBubbles;
      sub.imageWidth = scanResult.imageWidth;
      sub.imageHeight = scanResult.imageHeight;

      delete sub.error; // Clear error!

      // Re-score submission
      const scored = app.scoreExtractedData(sub);
      sub.score = scored.percentage;
      sub.points = scored.points;
      sub.scoredStatus = scored.scored;
      delete sub.scoredError;

      // Calculate corner deltas
      const cornerLabels = ['TL', 'TR', 'BR', 'BL'];
      const deltas = afterCorners.map((afterPt, idx) => {
        if (!beforeCorners || !beforeCorners[idx]) {
          return {
            corner: cornerLabels[idx],
            before: null,
            after: { x: Number(afterPt.x.toFixed(1)), y: Number(afterPt.y.toFixed(1)) },
            dx: null,
            dy: null,
            dist: null
          };
        }
        const beforePt = beforeCorners[idx];
        const dx = Number((afterPt.x - beforePt.x).toFixed(1));
        const dy = Number((afterPt.y - beforePt.y).toFixed(1));
        const dist = Number(Math.hypot(dx, dy).toFixed(1));
        return {
          corner: cornerLabels[idx],
          before: { x: Number(beforePt.x.toFixed(1)), y: Number(beforePt.y.toFixed(1)) },
          after: { x: Number(afterPt.x.toFixed(1)), y: Number(afterPt.y.toFixed(1)) },
          dx,
          dy,
          dist
        };
      });

      const logEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toISOString(),
        filename: sub.filename,
        imageWidth: currentImage.width,
        imageHeight: currentImage.height,
        formVariant: app.state.examConfig.variant === '150' ? '150q' : '75q',
        before: {
          status: beforeError ? 'error' : 'detected',
          error: beforeError,
          corners: beforeCorners ? beforeCorners.map(p => ({ x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)) })) : null,
          score: beforeScore,
          points: beforePoints,
          studentId: beforeStudentId,
          testFormCode: beforeForm,
          answersCount: beforeAnswersCount
        },
        after: {
          status: 'reprocessed_success',
          corners: afterCorners.map(p => ({ x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)) })),
          deltas,
          score: scored.percentage,
          points: scored.points,
          studentId: scanResult.studentId || 'Unknown',
          testFormCode: scanResult.testFormCode || 'A',
          answersCount: scanResult.answers ? scanResult.answers.filter(Boolean).length : 0,
          threshold: scanResult.threshold
        }
      };

      const existingLogs = getCornerLogs();
      existingLogs.push(logEntry);
      saveCornerLogs(existingLogs);
      console.log('[OpenMCR Corner Correction Log]', logEntry);

      renderCornerLogsUI();
      app.saveState();
      isEditingCorners = false;
      app.renderAll();
    } catch (err) {
      alert("Error re-processing sheet with manual corners: " + err.message);
    } finally {
      btnApplyManualCorners.disabled = false;
      btnApplyManualCorners.textContent = '⚡ Re-process Sheet';
    }
  });

  // Re-attach Image handler
  btnAttachImage.addEventListener('click', () => fileAttachImage.click());
  fileAttachImage.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const sub = getSelectedSubmission();
    if (!file || !sub) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      sub.imageDataUrl = evt.target.result;
      await saveSingleSubmissionToDB(sub);
      app.saveState();
      renderInspector();
    };
    reader.readAsDataURL(file);
    fileAttachImage.value = '';
  });

  chkFiducials.addEventListener('change', drawCanvas);
  chkBubbles.addEventListener('change', drawCanvas);
  chkLabels.addEventListener('change', drawCanvas);

  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => setZoom(zoomScale + 0.25));
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => setZoom(zoomScale - 0.25));
  }

  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => {
      zoomScale = 1.0;
      updateCanvasDimensions();
      drawCanvas();
      if (canvasWrapper) {
        canvasWrapper.scrollLeft = (canvasWrapper.scrollWidth - canvasWrapper.clientWidth) / 2;
        canvasWrapper.scrollTop = (canvasWrapper.scrollHeight - canvasWrapper.clientHeight) / 2;
      }
    });
  }

  if (btnPrev) btnPrev.addEventListener('click', () => navigateSheet(-1));
  if (btnNext) btnNext.addEventListener('click', () => navigateSheet(1));

  // Keyboard navigation when inspector tab is active
  window.addEventListener('keydown', (e) => {
    const inspectorPane = document.getElementById('pane-inspector');
    if (!inspectorPane || !inspectorPane.classList.contains('active')) return;
    
    // Ignore if typing in input, select, textarea, etc.
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateSheet(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateSheet(1);
    }
  });

  return {
    renderInspector,
    renderCornerLogsUI,
    selectSubmission: (id) => {
      app.state.selectedScanId = id;
      isEditingCorners = false;
      renderInspector();
    }
  };
}
