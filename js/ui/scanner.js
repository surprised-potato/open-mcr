/**
 * scanner.js - Batch scan file processor and Web Worker dispatcher
 */

/* global pdfjsLib */

export function initScanner(app) {
  const dropzone = document.getElementById('scannerDropzone');
  const fileInput = document.getElementById('fileScanInput');
  const progressContainer = document.getElementById('scannerProgressContainer');
  const progressFill = document.getElementById('scannerProgressFill');
  const progressLabel = document.getElementById('scannerProgressLabel');
  const progressPercent = document.getElementById('scannerProgressPercent');
  const scansTableBody = document.getElementById('scansTableBody');
  const batchCount = document.getElementById('batchCount');
  const btnClearBatch = document.getElementById('btnClearBatch');
  const btnLoadSample = document.getElementById('btnLoadSampleScan');

  let worker = null;

  function initWorker() {
    if (worker) return worker;
    try {
      worker = new Worker('js/omr/worker.js', { type: 'module' });
      worker.postMessage({ id: 'init', type: 'INIT' });
    } catch (err) {
      console.warn("Could not start Web Worker module:", err);
    }
    return worker;
  }

  initWorker();

  // Dropzone interactions
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleIncomingFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleIncomingFiles(Array.from(e.target.files));
      fileInput.value = '';
    }
  });

  btnClearBatch.addEventListener('click', () => {
    if (confirm("Clear all scanned sheets in current batch?")) {
      app.state.submissions = [];
      app.state.selectedScanId = null;
      app.saveState();
      renderBatchTable();
      app.renderResults();
      app.renderAnalytics();
      app.renderInspector();
    }
  });

  const btnLoadBatch = document.getElementById('btnLoadBatchSample');

  // Load single sample test scan
  btnLoadSample.addEventListener('click', async () => {
    btnLoadSample.disabled = true;
    btnLoadSample.textContent = '⏳ Loading...';
    try {
      const sampleUrl = 'assets/sample_exam_scan.png';
      const res = await fetch(sampleUrl);
      if (!res.ok) throw new Error("Could not load sample file.");
      const blob = await res.blob();
      const file = new File([blob], 'sample_student_exam.png', { type: 'image/png' });
      await handleIncomingFiles([file]);
    } catch (err) {
      alert("Error loading sample: " + err.message);
    } finally {
      btnLoadSample.disabled = false;
      btnLoadSample.textContent = '🧪 Load 1 Sample Scan';
    }
  });

  // Load multi-sheet batch demo
  if (btnLoadBatch) {
    btnLoadBatch.addEventListener('click', async () => {
      btnLoadBatch.disabled = true;
      btnLoadBatch.textContent = '⏳ Loading 3 sheets...';
      try {
        const sampleUrls = [
          { url: 'assets/sample_scan_1.png', name: 'student_scan_01.png' },
          { url: 'assets/sample_scan_2.png', name: 'student_scan_02.png' },
          { url: 'assets/sample_scan_3.png', name: 'student_scan_03.png' }
        ];
        const files = [];
        for (const item of sampleUrls) {
          const res = await fetch(item.url);
          if (!res.ok) continue;
          const blob = await res.blob();
          files.push(new File([blob], item.name, { type: 'image/png' }));
        }
        if (files.length > 0) {
          await handleIncomingFiles(files);
        }
      } catch (err) {
        alert("Error loading batch samples: " + err.message);
      } finally {
        btnLoadBatch.disabled = false;
        btnLoadBatch.textContent = '🧪 Load Batch Demo (3 Sheets)';
      }
    });
  }

  async function handleIncomingFiles(files) {
    const tasks = [];

    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressLabel.textContent = `Preparing ${files.length} file(s)...`;

    for (const file of files) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const pages = await extractPdfPages(file);
        tasks.push(...pages);
      } else if (file.type.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tiff)$/i.test(file.name)) {
        const imgDataObj = await readImageFile(file);
        tasks.push(imgDataObj);
      }
    }

    const total = tasks.length;
    let completed = 0;

    for (let i = 0; i < total; i++) {
      const task = tasks[i];
      progressLabel.textContent = `Scanning sheet ${i + 1} of ${total} (${task.filename})...`;
      progressPercent.textContent = `${Math.round(((i) / total) * 100)}%`;
      progressFill.style.width = `${Math.round(((i) / total) * 100)}%`;

      try {
        const scanResult = await processSingleScan(task);
        
        // Score the scanned result
        const scored = app.scoreExtractedData(scanResult);

        const submission = {
          id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          filename: task.filename,
          imageDataUrl: task.dataUrl,
          studentId: scanResult.studentId || 'Unknown',
          studentName: scanResult.studentName || 'Unknown',
          testFormCode: scanResult.testFormCode || 'A',
          courseId: scanResult.courseId || '',
          answers: scanResult.answers,
          threshold: scanResult.threshold,
          score: scored.percentage,
          points: scored.points,
          scoredStatus: scored.scored,
          scoredError: scored.error,
          corners: scanResult.corners,
          lMark: scanResult.lMark,
          squares: scanResult.squares,
          annotatedBubbles: scanResult.annotatedBubbles,
          imageWidth: scanResult.imageWidth,
          imageHeight: scanResult.imageHeight,
          scannedAt: new Date().toISOString()
        };

        app.state.submissions.push(submission);
        app.saveState();
        renderBatchTable();
      } catch (err) {
        console.error("Scan error on", task.filename, err);
        const failedSub = {
          id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_failed`,
          filename: task.filename,
          imageDataUrl: task.dataUrl,
          studentId: 'ERROR',
          studentName: 'Failed to read sheet',
          testFormCode: '-',
          answers: [],
          score: 0,
          points: 0,
          error: err.message || 'Alignment fiducials not found',
          scannedAt: new Date().toISOString()
        };
        app.state.submissions.push(failedSub);
        app.saveState();
        renderBatchTable();
      }

      completed++;
      progressFill.style.width = `${Math.round((completed / total) * 100)}%`;
      progressPercent.textContent = `${Math.round((completed / total) * 100)}%`;
    }

    progressLabel.textContent = `Completed scanning ${completed} sheet(s).`;
    setTimeout(() => {
      progressContainer.style.display = 'none';
    }, 2000);

    app.renderResults();
    app.renderAnalytics();
    app.renderInspector();
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          resolve({ filename: file.name, imageData, dataUrl });
        };
        img.onerror = reject;
        img.src = dataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function extractPdfPages(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error("PDF.js is not available to read PDF files.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x resolution for crisp OMR
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      pages.push({
        filename: `${file.name} (Page ${p})`,
        imageData,
        dataUrl
      });
    }
    return pages;
  }

  function processSingleScan(task) {
    return new Promise((resolve, reject) => {
      const currentWorker = initWorker();
      const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

      const handler = (e) => {
        const { id, type, filename, result, error } = e.data;
        if (id !== jobId) return;

        if (type === 'SCAN_SUCCESS') {
          currentWorker.removeEventListener('message', handler);
          resolve(result);
        } else if (type === 'SCAN_ERROR') {
          currentWorker.removeEventListener('message', handler);
          reject(new Error(error || 'OMR processing failed'));
        }
      };

      currentWorker.addEventListener('message', handler);

      currentWorker.postMessage({
        id: jobId,
        type: 'PROCESS_SCAN',
        payload: {
          imageData: task.imageData,
          filename: task.filename,
          options: {
            variant: app.state.examConfig.variant,
            multiAsF: app.state.examConfig.multiAsF,
            emptyAsG: app.state.examConfig.emptyAsG,
            manualCorners: task.manualCorners || undefined
          }
        }
      });
    });
  }

  function renderBatchTable() {
    const list = app.state.submissions;
    batchCount.textContent = list.length;

    if (list.length === 0) {
      scansTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">No sheets scanned yet. Drop images or PDFs above to begin.</td>
        </tr>`;
      return;
    }

    scansTableBody.innerHTML = '';
    list.forEach((sub, idx) => {
      const tr = document.createElement('tr');

      const isErr = Boolean(sub.error);
      const scoreBadge = isErr
        ? `<span class="badge badge-rose">Error</span>`
        : `<span class="badge badge-mint">${sub.score}%</span>`;
      const statusBadge = isErr
        ? `<span class="badge badge-rose">${sub.error}</span>`
        : `<span class="badge badge-sky">Graded</span>`;

      tr.innerHTML = `
        <td><strong>${sub.filename}</strong></td>
        <td><code>${sub.studentId || '-'}</code></td>
        <td>${sub.studentName || '-'}</td>
        <td>${sub.testFormCode || '-'}</td>
        <td>${scoreBadge}</td>
        <td>${isErr ? '-' : `${sub.points} / ${sub.answers ? sub.answers.length : 75}`}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-sm btn-subtle btn-inspect-sub" data-id="${sub.id}">🔍 Inspect</button>
        </td>
      `;

      tr.querySelector('.btn-inspect-sub').addEventListener('click', () => {
        app.openInspectorForSubmission(sub.id);
      });

      scansTableBody.appendChild(tr);
    });
  }

  renderBatchTable();

  return { renderBatchTable, handleIncomingFiles, processSingleScan };
}
