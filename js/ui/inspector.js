/**
 * inspector.js - Visual canvas sheet inspector with color-coded bubble overlay
 */

export function initInspector(app) {
  const selectSub = document.getElementById('selectInspectSubmission');
  const canvas = document.getElementById('inspectorCanvas');
  const ctx = canvas.getContext('2d');

  const chkFiducials = document.getElementById('chkLayerFiducials');
  const chkBubbles = document.getElementById('chkLayerBubbles');
  const chkLabels = document.getElementById('chkLayerLabels');

  const studentNameEl = document.getElementById('inspectStudentName');
  const studentDetailsEl = document.getElementById('inspectStudentDetails');
  const scoreBadgeEl = document.getElementById('inspectScoreBadge');
  const thresholdBadgeEl = document.getElementById('inspectThresholdBadge');
  const qListEl = document.getElementById('inspectorQuestionList');

  let currentImage = null;
  let zoomScale = 1.0;

  function populateSelector() {
    selectSub.innerHTML = '<option value="">Select a scanned sheet...</option>';
    app.state.submissions.forEach((sub, idx) => {
      const opt = document.createElement('option');
      opt.value = sub.id;
      opt.textContent = `${idx + 1}. ${sub.studentName || 'Student'} (${sub.studentId || 'No ID'}) - ${sub.score !== undefined ? sub.score + '%' : 'Error'}`;
      if (sub.id === app.state.selectedScanId) {
        opt.selected = true;
      }
      selectSub.appendChild(opt);
    });
  }

  function getSelectedSubmission() {
    return app.state.submissions.find(s => s.id === app.state.selectedScanId);
  }

  async function renderInspector() {
    populateSelector();
    const sub = getSelectedSubmission();

    if (!sub || !sub.imageDataUrl) {
      studentNameEl.textContent = 'No Sheet Selected';
      studentDetailsEl.textContent = 'Select a sheet from the dropdown or batch list';
      scoreBadgeEl.textContent = 'Score: -';
      thresholdBadgeEl.textContent = 'Threshold: -';
      qListEl.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin-top: 2rem;">No sheet selected.</p>';
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
    studentNameEl.textContent = sub.studentName || 'Unknown Student';
    studentDetailsEl.textContent = `ID: ${sub.studentId || '-'} • Form: ${sub.testFormCode || 'A'} • File: ${sub.filename}`;
    scoreBadgeEl.textContent = `Score: ${sub.score !== undefined ? sub.score : 0}% (${sub.points || 0} pts)`;
    scoreBadgeEl.className = `badge ${(sub.score >= 70) ? 'badge-mint' : 'badge-rose'}`;
    thresholdBadgeEl.textContent = `Threshold: ${sub.threshold ? (sub.threshold * 100).toFixed(1) + '%' : '-'}`;

    // Render Question Sidebar Breakdown
    const scored = app.scoreExtractedData(sub);
    qListEl.innerHTML = '';
    
    if (scored.questionScores) {
      scored.questionScores.forEach(qItem => {
        const row = document.createElement('div');
        row.className = `breakdown-row ${qItem.isCorrect ? 'correct' : 'incorrect'}`;
        
        row.innerHTML = `
          <span><strong>Q${qItem.q}:</strong> Marked <code>${qItem.studentAnswer || '—'}</code></span>
          <span>Key: <strong>${qItem.correctAnswer || '?'}</strong> ${qItem.isCorrect ? '✓' : '✗'}</span>
        `;
        qListEl.appendChild(row);
      });
    }

    // Load and draw image with overlays
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      currentImage = img;
      drawCanvas();
    };
    img.src = sub.imageDataUrl;
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

    // 2. Draw Fiducial Marks
    if (chkFiducials.checked && sub.corners) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#4f46e5';
      ctx.beginPath();
      ctx.moveTo(sub.corners[0].x, sub.corners[0].y);
      for (let i = 1; i < sub.corners.length; i++) {
        ctx.lineTo(sub.corners[i].x, sub.corners[i].y);
      }
      ctx.closePath();
      ctx.stroke();

      // Highlight 4 corners
      sub.corners.forEach((c, idx) => {
        ctx.fillStyle = idx === 0 ? '#ef4444' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 8, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // 3. Draw Bubble Overlays
    if (chkBubbles.checked && sub.annotatedBubbles) {
      sub.annotatedBubbles.forEach(b => {
        if (b.type === 'question') {
          const qScore = scored.questionScores ? scored.questionScores[b.qNumber - 1] : null;
          const isCorrectChoice = keyAnswers && keyAnswers[b.qNumber - 1] === b.choice;

          if (b.isFilled) {
            // Student filled this bubble
            if (isCorrectChoice) {
              // Correct mark: Pastel Mint
              ctx.fillStyle = 'rgba(34, 197, 94, 0.55)';
              ctx.strokeStyle = '#16a34a';
            } else {
              // Incorrect mark: Pastel Rose
              ctx.fillStyle = 'rgba(239, 68, 68, 0.55)';
              ctx.strokeStyle = '#dc2626';
            }
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(b.center.x, b.center.y, b.radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
          }

          // Draw Answer Key Ring
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
          // Metadata filled bubble: Pastel Violet
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

  // Event Listeners
  selectSub.addEventListener('change', (e) => {
    app.state.selectedScanId = e.target.value;
    renderInspector();
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

  return { renderInspector, selectSubmission: (id) => {
    app.state.selectedScanId = id;
    renderInspector();
  }};
}
