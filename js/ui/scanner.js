/**
 * scanner.js - Batch scan file processor and Web Worker Pool dispatcher
 */

/* global pdfjsLib */

import { saveSingleSubmissionToDB } from '../storage/localStore.js';
import { WorkerPool } from '../omr/workerPool.js';

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

  // Initialize parallel worker pool
  const workerPool = new WorkerPool();
  workerPool.init().catch(err => console.warn("WorkerPool initialization warning:", err));

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
    if (confirm("Clear all scanned sheets in current batch from local storage?")) {
      app.clearAllSubmissions();
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

  async function rotateDataUrl(dataUrl, rotationCode) {
    if (rotationCode === null || rotationCode === undefined) return dataUrl;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (rotationCode === 0) { // 90 CW
          canvas.width = img.height;
          canvas.height = img.width;
          ctx.translate(canvas.width, 0);
          ctx.rotate(Math.PI / 2);
        } else if (rotationCode === 1) { // 180
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.translate(canvas.width, canvas.height);
          ctx.rotate(Math.PI);
        } else if (rotationCode === 2) { // 270 CW / 90 CCW
          canvas.width = img.height;
          canvas.height = img.width;
          ctx.translate(0, canvas.height);
          ctx.rotate(-Math.PI / 2);
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.90));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function compressImageForStorage(canvasOrDataUrl, maxDim = 1600, quality = 0.90) {
    return new Promise((resolve) => {
      if (typeof canvasOrDataUrl !== 'string' && canvasOrDataUrl && canvasOrDataUrl.toDataURL) {
        const w = canvasOrDataUrl.width;
        const h = canvasOrDataUrl.height;
        if (w <= maxDim && h <= maxDim) {
          return resolve(canvasOrDataUrl.toDataURL('image/jpeg', quality));
        }
        const scale = Math.min(maxDim / w, maxDim / h);
        const c = document.createElement('canvas');
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        const ctx = c.getContext('2d');
        ctx.drawImage(canvasOrDataUrl, 0, 0, c.width, c.height);
        return resolve(c.toDataURL('image/jpeg', quality));
      }

      if (typeof canvasOrDataUrl === 'string') {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (w <= maxDim && h <= maxDim) {
            return resolve(canvasOrDataUrl);
          }
          const scale = Math.min(maxDim / w, maxDim / h);
          const c = document.createElement('canvas');
          c.width = Math.round(w * scale);
          c.height = Math.round(h * scale);
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(canvasOrDataUrl);
        img.src = canvasOrDataUrl;
      } else {
        resolve('');
      }
    });
  }

  async function handleIncomingFiles(files) {
    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressLabel.textContent = `Preparing ${files.length} file(s)...`;

    // Process regular image files and stream multi-page PDFs
    const tasks = [];

    for (const file of files) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // Stream PDF pages
        await streamPdfFile(file, (task) => tasks.push(task));
      } else if (file.type.startsWith('image/') || /\.(png|jpg|jpeg|bmp|tiff)$/i.test(file.name)) {
        const imgDataObj = await readImageFile(file);
        tasks.push(imgDataObj);
      }
    }

    if (tasks.length === 0) {
      progressContainer.style.display = 'none';
      return;
    }

    const total = tasks.length;
    let completed = 0;
    progressLabel.textContent = `Processing ${total} sheet(s) in parallel...`;

    // Dispatch all tasks across parallel worker pool
    const activeExam = app.getActiveExam();
    const examConfig = app.state.examConfig || {};

    await workerPool.processBatch(
      tasks.map(t => ({
        filename: t.filename,
        imageData: t.imageData,
        dataUrl: t.dataUrl,
        options: {
          variant: examConfig.variant,
          multiAsF: examConfig.multiAsF,
          emptyAsG: examConfig.emptyAsG,
          manualCorners: t.manualCorners || undefined
        }
      })),
      {
        onProgress: (pct, msg) => {
          progressPercent.textContent = `${pct}%`;
          progressFill.style.width = `${pct}%`;
          progressLabel.textContent = msg;
        },
        onSheetComplete: async (task, scanResult, err, idx) => {
          completed++;
          if (scanResult) {
            const scored = app.scoreExtractedData(scanResult);

            let finalDataUrl = task.dataUrl;
            if (scanResult.rotation !== null && scanResult.rotation !== undefined) {
              finalDataUrl = await rotateDataUrl(task.dataUrl, scanResult.rotation);
            }

            // Downsample stored preview for storage efficiency
            finalDataUrl = await compressImageForStorage(finalDataUrl, 1600, 0.90);

            const submission = {
              id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              examId: activeExam.id,
              examName: activeExam.name,
              filename: task.filename,
              imageDataUrl: finalDataUrl,
              studentId: scanResult.studentId || 'Unknown',
              studentName: scanResult.studentName || 'Unknown',
              testFormCode: scanResult.testFormCode || 'A',
              courseId: scanResult.courseId || activeExam.courseId || '',
              answers: scanResult.answers,
              detectedStudentId: scanResult.studentId || 'Unknown',
              detectedStudentName: scanResult.studentName || 'Unknown',
              detectedFormCode: scanResult.testFormCode || 'A',
              detectedAnswers: scanResult.answers ? [...scanResult.answers] : [],
              isOverridden: false,
              threshold: scanResult.threshold,
              score: scored.percentage,
              points: scored.points,
              scoredStatus: scored.scored,
              scoredError: scored.error,
              corners: scanResult.corners,
              detectedCorners: scanResult.corners ? JSON.parse(JSON.stringify(scanResult.corners)) : null,
              lMark: scanResult.lMark,
              squares: scanResult.squares,
              rotation: scanResult.rotation,
              annotatedBubbles: scanResult.annotatedBubbles,
              questionDetails: scanResult.questionDetails || null,
              flags: scanResult.flags || null,
              hasFlags: scanResult.hasFlags || false,
              imageWidth: scanResult.imageWidth,
              imageHeight: scanResult.imageHeight,
              scannedAt: new Date().toISOString()
            };

            app.state.submissions.push(submission);
            await saveSingleSubmissionToDB(submission);
          } else {
            console.error("Scan error on", task.filename, err);
            const failedSub = {
              id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}_failed`,
              examId: activeExam.id,
              examName: activeExam.name,
              filename: task.filename,
              imageDataUrl: task.dataUrl,
              studentId: 'ERROR',
              studentName: 'Failed to read sheet',
              testFormCode: '-',
              answers: [],
              score: 0,
              points: 0,
              corners: null,
              detectedCorners: null,
              error: err ? err.message || 'Alignment fiducials not found' : 'Scan failed',
              scannedAt: new Date().toISOString()
            };
            app.state.submissions.push(failedSub);
            await saveSingleSubmissionToDB(failedSub);
          }

          app.saveState();
          renderBatchTable();
        }
      }
    );

    progressLabel.textContent = `Completed scanning ${completed} sheet(s).`;
    setTimeout(() => {
      progressContainer.style.display = 'none';
    }, 1800);

    const activeSubs = app.getActiveSubmissions();
    if ((!app.state.selectedScanId || !activeSubs.some(s => s.id === app.state.selectedScanId)) && activeSubs.length > 0) {
      app.state.selectedScanId = activeSubs[0].id;
    }

    app.renderAll();
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

  async function streamPdfFile(file, onPageExtracted) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error("PDF.js is not available to read PDF files.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x resolution for crisp OMR
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      onPageExtracted({
        filename: `${file.name} (Page ${p})`,
        imageData,
        dataUrl
      });

      // Allow GC to free page resources
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  function processSingleScan(task) {
    const examConfig = app.state.examConfig || {};
    return workerPool.processScan({
      filename: task.filename,
      imageData: task.imageData,
      options: {
        variant: examConfig.variant,
        multiAsF: examConfig.multiAsF,
        emptyAsG: examConfig.emptyAsG,
        manualCorners: task.manualCorners || undefined
      }
    });
  }

  function renderBatchTable() {
    const list = app.getActiveSubmissions();
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
      if (sub.isOverridden) {
        tr.className = 'row-overridden';
      }

      const isErr = Boolean(sub.error);
      const scoreBadge = isErr
        ? `<span class="badge badge-rose">Error</span>`
        : `<span class="badge badge-mint">${sub.score}%</span>`;
      
      let statusBadge = isErr
        ? `<span class="badge badge-rose">${sub.error}</span>`
        : `<span class="badge badge-sky">Graded</span>`;
      
      if (sub.isOverridden) {
        statusBadge += ` <span class="badge badge-amber" title="Manual scan overrides applied">✏️ Overridden</span>`;
      }

      const totalQ = sub.totalQuestions || (app.getActiveExamNumQuestions ? app.getActiveExamNumQuestions() : (sub.answers ? sub.answers.length : 75));
      tr.innerHTML = `
        <td>
          <strong>${sub.filename}</strong>
          ${sub.isOverridden ? '<div style="font-size: 0.7rem; color: var(--pastel-amber-text); font-weight: 600;">(Manual Overrides)</div>' : ''}
        </td>
        <td><code>${sub.studentId || '-'}</code></td>
        <td>${sub.studentName || '-'}</td>
        <td><span class="badge badge-slate">${sub.testFormCode || '-'}</span></td>
        <td>${scoreBadge}</td>
        <td>${isErr ? '-' : `${sub.points !== undefined ? sub.points : 0} / ${totalQ}`}</td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-sm btn-subtle btn-override-sub" data-id="${sub.id}" title="Manually edit student info or answers">✏️ Override</button>
            <button class="btn btn-sm btn-primary btn-view-sub" data-id="${sub.id}">🖼️ View</button>
            <button class="btn btn-sm btn-subtle btn-inspect-sub" data-id="${sub.id}">📍 Inspect</button>
            <button class="btn btn-sm btn-subtle btn-delete-sub" data-id="${sub.id}" style="color: var(--pastel-rose-text);" title="Delete sheet">🗑️</button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-override-sub').addEventListener('click', () => {
        app.openOverrideModal(sub.id);
      });

      tr.querySelector('.btn-view-sub').addEventListener('click', () => {
        if (app.ui.sheetViewer) app.ui.sheetViewer.openFullscreenViewer(sub.id);
      });

      tr.querySelector('.btn-inspect-sub').addEventListener('click', () => {
        app.openInspectorForSubmission(sub.id);
      });

      tr.querySelector('.btn-delete-sub').addEventListener('click', () => {
        if (confirm(`Delete scanned sheet "${sub.filename}"?`)) {
          app.deleteSubmission(sub.id);
        }
      });

      scansTableBody.appendChild(tr);
    });
  }

  async function reprocessAllSheets() {
    const list = app.getActiveSubmissions();
    if (list.length === 0) {
      alert("No sheets to reprocess in the active exam.");
      return;
    }

    const activeExam = app.getActiveExam();
    const examName = activeExam ? activeExam.name : 'Active Exam';
    if (!confirm(`Reprocess all ${list.length} sheet(s) in "${examName}" using the latest multi-threaded OMR pipeline?`)) {
      return;
    }

    const btnReprocessAll = document.getElementById('btnReprocessAll');
    if (btnReprocessAll) {
      btnReprocessAll.disabled = true;
      btnReprocessAll.textContent = '⏳ Reprocessing...';
    }

    progressContainer.style.display = 'block';
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressLabel.textContent = `Preparing sheets for parallel reprocessing...`;

    const tasks = [];
    for (const sub of list) {
      if (!sub.imageDataUrl) continue;
      try {
        const img = new Image();
        if (typeof sub.imageDataUrl === 'string' && (sub.imageDataUrl.startsWith('http://') || sub.imageDataUrl.startsWith('https://'))) {
          img.crossOrigin = 'anonymous';
        }
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = sub.imageDataUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        tasks.push({
          sub,
          filename: sub.filename,
          imageData,
          manualCorners: sub.corners || undefined
        });
      } catch (err) {
        console.warn(`Could not prepare image data for ${sub.filename}:`, err);
      }
    }

    const total = tasks.length;
    let completed = 0;
    let failed = 0;

    await workerPool.processBatch(
      tasks.map(t => ({
        filename: t.filename,
        imageData: t.imageData,
        sub: t.sub,
        options: {
          variant: app.state.examConfig.variant,
          multiAsF: app.state.examConfig.multiAsF,
          emptyAsG: app.state.examConfig.emptyAsG,
          manualCorners: t.manualCorners
        }
      })),
      {
        onProgress: (pct, msg) => {
          progressPercent.textContent = `${pct}%`;
          progressFill.style.width = `${pct}%`;
          progressLabel.textContent = msg;
        },
        onSheetComplete: async (task, scanResult, err) => {
          completed++;
          const sub = task.sub;
          if (scanResult) {
            sub.studentId = scanResult.studentId || 'Unknown';
            sub.studentName = scanResult.studentName || 'Unknown';
            sub.testFormCode = scanResult.testFormCode || 'A';
            sub.courseId = scanResult.courseId || (app.getActiveExam() ? app.getActiveExam().courseId : '') || '';
            sub.answers = scanResult.answers;
            sub.threshold = scanResult.threshold;
            sub.corners = scanResult.corners || sub.corners;
            sub.lMark = scanResult.lMark;
            sub.squares = scanResult.squares;
            sub.annotatedBubbles = scanResult.annotatedBubbles;
            sub.questionDetails = scanResult.questionDetails || null;
            sub.flags = scanResult.flags || null;
            sub.hasFlags = scanResult.hasFlags || false;
            sub.imageWidth = scanResult.imageWidth;
            sub.imageHeight = scanResult.imageHeight;
            delete sub.error;

            const scored = app.scoreExtractedData(sub);
            sub.score = scored.percentage;
            sub.points = scored.points;
            sub.scoredStatus = scored.scored;
            delete sub.scoredError;

            await saveSingleSubmissionToDB(sub);
          } else {
            console.warn(`Error reprocessing ${sub.filename}:`, err);
            sub.error = err ? err.message || 'OMR reprocess failed' : 'Failed';
            await saveSingleSubmissionToDB(sub);
            failed++;
          }
        }
      }
    );

    app.saveState();
    app.renderAll();

    progressLabel.textContent = `Finished reprocessing ${completed} sheet(s)${failed > 0 ? ` (${failed} with errors)` : ''}.`;
    setTimeout(() => {
      progressContainer.style.display = 'none';
      if (btnReprocessAll) {
        btnReprocessAll.disabled = false;
        btnReprocessAll.textContent = '⚡ Reprocess All Sheets';
      }
    }, 2000);
  }

  const btnReprocessAll = document.getElementById('btnReprocessAll');
  if (btnReprocessAll) {
    btnReprocessAll.addEventListener('click', reprocessAllSheets);
  }

  const btnGoToGallery = document.getElementById('btnGoToGallery');
  if (btnGoToGallery) {
    btnGoToGallery.addEventListener('click', () => {
      app.switchTab('gallery');
    });
  }

  renderBatchTable();

  return { renderBatchTable, handleIncomingFiles, processSingleScan, reprocessAllSheets, workerPool };
}
