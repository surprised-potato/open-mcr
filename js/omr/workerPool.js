/**
 * workerPool.js - Multi-threaded Web Worker Pool for OpenMCR
 * Distributes OMR scanning tasks across multiple workers concurrently.
 */

export class WorkerPool {
  constructor(options = {}) {
    // Determine pool size: min 2, max 4 (or based on hardwareConcurrency)
    const concurrency = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    this.maxWorkers = options.maxWorkers || Math.max(2, Math.min(concurrency - 1, 4));
    this.workerScript = options.workerScript || `js/omr/worker.js?t=${Date.now()}`;
    
    this.workers = []; // { id, worker, busy, currentJob, timeoutHandle }
    this.taskQueue = []; // { id, task, resolve, reject, onProgress }
    this.jobCounter = 0;
    this.jobTimeoutMs = options.jobTimeoutMs || 30000; // 30s timeout safety
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    
    const initPromises = [];
    for (let i = 0; i < this.maxWorkers; i++) {
      initPromises.push(this._createWorker(i));
    }
    
    await Promise.allSettled(initPromises);
    this.isInitialized = true;
  }

  _createWorker(index) {
    return new Promise((resolve) => {
      try {
        const worker = new Worker(this.workerScript, { type: 'module' });
        const workerEntry = {
          id: index,
          worker,
          busy: false,
          currentJob: null,
          timeoutHandle: null
        };

        const initHandler = (e) => {
          if (e.data && (e.data.type === 'INIT_SUCCESS' || e.data.type === 'INIT_ERROR')) {
            worker.removeEventListener('message', initHandler);
            resolve(workerEntry);
          }
        };

        worker.addEventListener('message', initHandler);
        worker.addEventListener('message', (e) => this._handleWorkerMessage(workerEntry, e));
        worker.addEventListener('error', (err) => this._handleWorkerCrash(workerEntry, err));

        worker.postMessage({ id: `init_${index}`, type: 'INIT' });
        this.workers[index] = workerEntry;

        // Fallback resolve after 3s if worker initializes silently
        setTimeout(() => resolve(workerEntry), 3000);
      } catch (err) {
        console.warn(`Could not create Web Worker #${index}:`, err);
        resolve(null);
      }
    });
  }

  _handleWorkerMessage(workerEntry, e) {
    const { id, type, filename, result, error, progress, status } = e.data || {};
    const job = workerEntry.currentJob;

    if (!job || job.id !== id) return;

    if (type === 'PROGRESS') {
      if (job.onProgress) {
        job.onProgress({ filename, progress, status, jobId: id, workerId: workerEntry.id });
      }
      return;
    }

    // Clear timeout safeguard
    if (workerEntry.timeoutHandle) {
      clearTimeout(workerEntry.timeoutHandle);
      workerEntry.timeoutHandle = null;
    }

    workerEntry.busy = false;
    workerEntry.currentJob = null;

    if (type === 'SCAN_SUCCESS') {
      job.resolve(result);
    } else if (type === 'SCAN_ERROR') {
      job.reject(new Error(error || 'OMR processing failed'));
    }

    // Dispatch next task from queue
    this._dispatchNext();
  }

  _handleWorkerCrash(workerEntry, err) {
    console.error(`Worker #${workerEntry.id} encountered an error/crash:`, err);
    
    if (workerEntry.timeoutHandle) {
      clearTimeout(workerEntry.timeoutHandle);
      workerEntry.timeoutHandle = null;
    }

    const failedJob = workerEntry.currentJob;
    workerEntry.busy = false;
    workerEntry.currentJob = null;

    if (failedJob) {
      failedJob.reject(new Error(`Worker crash during processing of ${failedJob.task.filename}: ${err.message || 'Worker error'}`));
    }

    // Re-instantiate crashed worker
    try {
      workerEntry.worker.terminate();
    } catch {}
    this._createWorker(workerEntry.id);

    this._dispatchNext();
  }

  _dispatchNext() {
    if (this.taskQueue.length === 0) return;

    // Find first idle worker
    const idleWorker = this.workers.find(w => w && !w.busy);
    if (!idleWorker) return;

    const job = this.taskQueue.shift();
    idleWorker.busy = true;
    idleWorker.currentJob = job;

    // Set timeout safeguard
    idleWorker.timeoutHandle = setTimeout(() => {
      console.warn(`Job ${job.id} timed out on worker #${idleWorker.id}`);
      this._handleWorkerCrash(idleWorker, new Error("OMR processing timed out"));
    }, this.jobTimeoutMs);

    idleWorker.worker.postMessage({
      id: job.id,
      type: 'PROCESS_SCAN',
      payload: {
        imageData: job.task.imageData,
        filename: job.task.filename,
        options: job.task.options || {}
      }
    });
  }

  /**
   * Process a single scan task using the worker pool
   * @param {Object} task - { filename, imageData, options }
   * @param {Function} onProgress - Optional callback(progressData)
   * @returns {Promise<Object>} Scan result
   */
  processScan(task, onProgress = null) {
    return new Promise((resolve, reject) => {
      this.jobCounter++;
      const jobId = `job_${Date.now()}_${this.jobCounter}_${Math.random().toString(36).substr(2, 4)}`;

      this.taskQueue.push({
        id: jobId,
        task,
        onProgress,
        resolve,
        reject
      });

      this._dispatchNext();
    });
  }

  /**
   * Process multiple scan tasks in parallel with progress tracking
   * @param {Array<Object>} tasks - List of scan tasks
   * @param {Object} callbacks - { onProgress(overallPct, currentMsg), onSheetComplete(task, result, err, index, total) }
   * @returns {Promise<Array<Object>>} List of completed items
   */
  async processBatch(tasks, callbacks = {}) {
    await this.init();

    const total = tasks.length;
    let completed = 0;

    const promises = tasks.map((task, index) => {
      return this.processScan(task, (prog) => {
        if (callbacks.onProgress) {
          const approxOverall = Math.round(((completed + (prog.progress / 100)) / total) * 100);
          callbacks.onProgress(approxOverall, `[${prog.filename}] ${prog.status}`);
        }
      })
      .then((scanResult) => {
        completed++;
        if (callbacks.onProgress) {
          callbacks.onProgress(Math.round((completed / total) * 100), `Completed ${completed} of ${total} sheets`);
        }
        if (callbacks.onSheetComplete) {
          callbacks.onSheetComplete(task, scanResult, null, index, total);
        }
        return { task, result: scanResult, error: null };
      })
      .catch((err) => {
        completed++;
        if (callbacks.onProgress) {
          callbacks.onProgress(Math.round((completed / total) * 100), `Error on ${task.filename}`);
        }
        if (callbacks.onSheetComplete) {
          callbacks.onSheetComplete(task, null, err, index, total);
        }
        return { task, result: null, error: err };
      });
    });

    return Promise.all(promises);
  }

  terminate() {
    this.workers.forEach(w => {
      if (w && w.worker) {
        try { w.worker.terminate(); } catch {}
      }
    });
    this.workers = [];
    this.taskQueue = [];
    this.isInitialized = false;
  }
}
