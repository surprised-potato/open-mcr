/**
 * worker.js - Web Worker for background image processing with OpenCV.js
 */

/* global cv, importScripts */

let cvReady = false;
let cvInitPromise = null;

function initOpenCV() {
  if (cvReady) return Promise.resolve();
  if (cvInitPromise) return cvInitPromise;

  cvInitPromise = new Promise(async (resolve, reject) => {
    try {
      if (typeof self.cv === 'undefined') {
        const response = await fetch('../../vendor/opencv.js');
        if (!response.ok) throw new Error("Could not load opencv.js from vendor directory.");
        const code = await response.text();
        const fn = new Function(code);
        fn.call(self);
      }

      const cvObj = self.cv;
      if (typeof cvObj !== 'undefined') {
        if (cvObj.Mat) {
          cvReady = true;
          resolve();
        } else {
          cvObj['onRuntimeInitialized'] = () => {
            cvReady = true;
            resolve();
          };
        }
      } else {
        reject(new Error("OpenCV.js script failed to initialize."));
      }
    } catch (err) {
      reject(err);
    }
  });

  return cvInitPromise;
}

// Dynamically import pipeline module in worker
let pipelineModule = null;

async function getPipeline() {
  if (!pipelineModule) {
    pipelineModule = await import('./pipeline.js');
  }
  return pipelineModule;
}

self.onmessage = async function(e) {
  const { id, type, payload } = e.data;

  if (type === 'INIT') {
    try {
      await initOpenCV();
      await getPipeline();
      self.postMessage({ id, type: 'INIT_SUCCESS' });
    } catch (error) {
      self.postMessage({ id, type: 'INIT_ERROR', error: error.message });
    }
    return;
  }

  if (type === 'PROCESS_SCAN') {
    const { imageData, options, filename } = payload;
    try {
      await initOpenCV();
      const pipeline = await getPipeline();

      self.postMessage({
        id,
        type: 'PROGRESS',
        filename,
        progress: 30,
        status: 'Detecting fiducials & grid...'
      });

      // Construct OpenCV Mat from ImageData
      const mat = self.cv.matFromImageData(imageData);

      self.postMessage({
        id,
        type: 'PROGRESS',
        filename,
        progress: 60,
        status: 'Reading bubbles & decoding fields...'
      });

      const result = pipeline.processScanImage(self.cv, mat, options);

      mat.delete();

      self.postMessage({
        id,
        type: 'PROGRESS',
        filename,
        progress: 100,
        status: 'Complete'
      });

      self.postMessage({
        id,
        type: 'SCAN_SUCCESS',
        filename,
        result
      });
    } catch (error) {
      self.postMessage({
        id,
        type: 'SCAN_ERROR',
        filename,
        error: error.message || 'Scanning failed'
      });
    }
  }
};
