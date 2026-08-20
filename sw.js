/**
 * sw.js - OpenMCR PWA Service Worker
 * Provides offline caching for seamless execution in remote/offline classrooms.
 */

const CACHE_NAME = 'openmcr-cache-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage/localStore.js',
  './js/storage/backupManager.js',
  './js/omr/geometry.js',
  './js/omr/imageUtils.js',
  './js/omr/cornerFinder.js',
  './js/omr/gridReader.js',
  './js/omr/perspective.js',
  './js/omr/pipeline.js',
  './js/omr/scorer.js',
  './js/omr/worker.js',
  './js/omr/workerPool.js',
  './js/ui/keyEditor.js',
  './js/ui/scanner.js',
  './js/ui/sheetViewer.js',
  './js/ui/inspector.js',
  './js/ui/resultsTable.js',
  './js/ui/analytics.js',
  './js/ui/overrideModal.js',
  './js/ui/firebaseModal.js',
  './js/export/excelExport.js',
  './vendor/opencv.js',
  './assets/sample_exam_scan.png',
  './assets/sample_scan_1.png',
  './assets/sample_scan_2.png',
  './assets/sample_scan_3.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Some assets could not be pre-cached:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached asset, fetch update in background (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback to offline index.html if html navigation
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
