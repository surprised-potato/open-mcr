/**
 * inspector.js - Visual canvas sheet inspector with interactive manual corner correction
 */

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

  let currentImage = null;
  let zoomScale = 1.0;
  let isEditingCorners = false;
  let activeCorners = null; // Array of 4 points: [TL, TR, BR, BL]
  let draggingCornerIdx = -1;

  function populateSelector() {
    selectSub.innerHTML = '<option value="">Select a scanned sheet...</option>';
    app.state.submissions.forEach((sub, idx) => {
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
    populateSelector();
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

      canvas.width = 600;
      canvas.height = 400;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select a sheet above to view visual inspection overlay', 300, 200);
      return;
    }

    // Update Sidebar details
    studentNameEl.textContent = sub.studentName || (sub.error ? 'Failed to read sheet' : 'Unknown Student');
    studentDetailsEl.textContent = `ID: ${sub.studentId || '-'} • Form: ${sub.testFormCode || '-'} • File: ${sub.filename}`;
    
    if (sub.error) {
      scoreBadgeEl.textContent = 'Status: Error';
      scoreBadgeEl.className = 'badge badge-rose';
      inspectErrorBanner.style.display = 'block';
      inspectErrorMessage.textContent = sub.error;
    } else {
      scoreBadgeEl.textContent = `Score: ${sub.score !== undefined ? sub.score : 0}% (${sub.points || 0} pts)`;
      scoreBadgeEl.className = `badge ${(sub.score >= 70) ? 'badge-mint' : 'badge-rose'}`;
      inspectErrorBanner.style.display = 'none';
    }

    thresholdBadgeEl.textContent = `Threshold: ${sub.threshold ? (sub.threshold * 100).toFixed(1) + '%' : '-'}`;

    // Render Question Sidebar Breakdown
    const scored = app.scoreExtractedData(sub);
    qListEl.innerHTML = '';
    
    if (scored && scored.questionScores && scored.questionScores.length > 0) {
      scored.questionScores.forEach(qItem => {
        const row = document.createElement('div');
        row.className = `breakdown-row ${qItem.isCorrect ? 'correct' : 'incorrect'}`;
        row.innerHTML = `
          <span><strong>Q${qItem.q}:</strong> Marked <code>${qItem.studentAnswer || '—'}</code></span>
          <span>Key: <strong>${qItem.correctAnswer || '?'}</strong> ${qItem.isCorrect ? '✓' : '✗'}</span>
        `;
        qListEl.appendChild(row);
      });
    } else {
      qListEl.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin-top: 1.5rem;">${sub.error ? `Error: ${sub.error}. Adjust corners to re-process.` : 'No answers recorded.'}</p>`;
    }

    // Check if image data is available
    if (!sub.imageDataUrl) {
      attachImageContainer.style.display = 'block';
      currentImage = null;
      canvas.width = 600;
      canvas.height = 400;
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
    canvas.width = 600;
    canvas.height = 400;
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
      canvas.width = 600;
      canvas.height = 400;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ef4444';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ Failed to load scan image preview.', 300, 180);
      ctx.fillStyle = '#64748b';
      ctx.font = '12px Inter, sans-serif';
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

    canvas.width = currentImage.width * zoomScale;
    canvas.height = currentImage.height * zoomScale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(zoomScale, zoomScale);

    // 1. Draw raw scan
    ctx.drawImage(currentImage, 0, 0);

    const scored = app.scoreExtractedData(sub);
    const keyAnswers = app.getAnswersForForm(sub.testFormCode || 'A');

    // 2. Draw Fiducial Marks / Interactive Manual Corners
    if ((chkFiducials.checked || isEditingCorners) && activeCorners && activeCorners.length === 4) {
      // Quadrilateral outline
      ctx.lineWidth = Math.max(2, 3 / zoomScale);
      ctx.strokeStyle = isEditingCorners ? '#f59e0b' : '#4f46e5';
      if (isEditingCorners) {
        ctx.setLineDash([8 / zoomScale, 4 / zoomScale]);
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
      const handleRadius = Math.max(7, 12 / zoomScale);
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
        ctx.lineWidth = Math.max(1.5, 2.5 / zoomScale);
        ctx.beginPath();
        ctx.arc(c.x, c.y, handleRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(9, Math.round(11 / zoomScale))}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cornerLabels[idx], c.x, c.y);
      });
    }

    // 3. Draw Bubble Overlays
    if (chkBubbles.checked && sub.annotatedBubbles && !isEditingCorners) {
      sub.annotatedBubbles.forEach(b => {
        if (b.type === 'question') {
          const qScore = scored.questionScores ? scored.questionScores[b.qNumber - 1] : null;
          const isCorrectChoice = keyAnswers && keyAnswers[b.qNumber - 1] === b.choice;

          if (b.isFilled) {
            if (isCorrectChoice) {
              ctx.fillStyle = 'rgba(34, 197, 94, 0.55)';
              ctx.strokeStyle = '#16a34a';
            } else {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.55)';
              ctx.strokeStyle = '#dc2626';
            }
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(b.center.x, b.center.y, b.radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
          }

          if (chkLabels.checked && isCorrectChoice && !b.isFilled) {
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([4, 2]);
            ctx.beginPath();
            ctx.arc(b.center.x, b.center.y, b.radius + 2, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else if (b.type === 'metadata' && b.isFilled) {
          ctx.fillStyle = 'rgba(168, 85, 247, 0.45)';
          ctx.strokeStyle = '#7c3aed';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(b.center.x, b.center.y, b.radius, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      });
    }

    ctx.restore();
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

  // Mouse & Touch Event Listeners for Corner Dragging
  function handlePointerDown(e) {
    if (!isEditingCorners || !currentImage) return;
    const pt = getCanvasCoords(e);
    const idx = findCornerUnderPoint(pt);
    if (idx !== -1) {
      draggingCornerIdx = idx;
      canvas.style.cursor = 'grabbing';
      drawCanvas();
      e.preventDefault();
    }
  }

  function handlePointerMove(e) {
    if (!isEditingCorners || !currentImage) return;
    const pt = getCanvasCoords(e);

    if (draggingCornerIdx !== -1) {
      activeCorners[draggingCornerIdx].x = Math.max(0, Math.min(currentImage.width, pt.x));
      activeCorners[draggingCornerIdx].y = Math.max(0, Math.min(currentImage.height, pt.y));
      canvas.style.cursor = 'grabbing';
      drawCanvas();
      e.preventDefault();
    } else {
      const idx = findCornerUnderPoint(pt);
      canvas.style.cursor = idx !== -1 ? 'grab' : 'default';
    }
  }

  function handlePointerUp() {
    if (draggingCornerIdx !== -1) {
      draggingCornerIdx = -1;
      canvas.style.cursor = 'grab';
      drawCanvas();
    }
  }

  canvas.addEventListener('mousedown', handlePointerDown);
  window.addEventListener('mousemove', handlePointerMove);
  window.addEventListener('mouseup', handlePointerUp);

  canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
  window.addEventListener('touchmove', handlePointerMove, { passive: false });
  window.addEventListener('touchend', handlePointerUp);

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

  btnApplyManualCorners.addEventListener('click', async () => {
    const sub = getSelectedSubmission();
    if (!sub || !currentImage || !activeCorners) return;

    btnApplyManualCorners.disabled = true;
    btnApplyManualCorners.textContent = '⏳ Processing OMR...';

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
    reader.onload = (evt) => {
      sub.imageDataUrl = evt.target.result;
      renderInspector();
    };
    reader.readAsDataURL(file);
  });

  chkFiducials.addEventListener('change', drawCanvas);
  chkBubbles.addEventListener('change', drawCanvas);
  chkLabels.addEventListener('change', drawCanvas);

  document.getElementById('btnZoomIn').addEventListener('click', () => {
    zoomScale = Math.min(2.5, zoomScale + 0.2);
    drawCanvas();
  });

  document.getElementById('btnZoomOut').addEventListener('click', () => {
    zoomScale = Math.max(0.4, zoomScale - 0.2);
    drawCanvas();
  });

  document.getElementById('btnZoomReset').addEventListener('click', () => {
    zoomScale = 1.0;
    drawCanvas();
  });

  return {
    renderInspector,
    selectSubmission: (id) => {
      app.state.selectedScanId = id;
      isEditingCorners = false;
      renderInspector();
    }
  };
}
