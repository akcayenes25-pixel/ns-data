/* NSDATA - sw.js */
/* Service worker — cache version must always match app version */

var CACHE_NAME = 'nsdata-v1.0.1';

var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/style-base.css',
  '/screen-dashboard.css',
  '/screen-orders.css',
  '/screen-limits.css',
  '/screen-analysis.css',
  '/screen-customer.css',
  '/screen-country.css',
  '/screen-product.css',
  '/app.js',
  '/utils.js',
  '/db.js',
  '/calc-engine.js',
  '/import-engine.js',
  '/export-engine.js',
  '/data-products.js',
  '/data-customers.js',
  '/data-targets.js',
  '/screen-dashboard.js',
  '/screen-orders.js',
  '/screen-limits.js',
  '/screen-analysis.js',
  '/screen-settings.js',
  '/screen-settings.css',
  '/screen-customer.js',
  '/screen-country.js',
  '/screen-product.js',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-1024.png'
];

/* ============================================================
   INSTALL — cache all static assets
   ============================================================ */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ============================================================
   ACTIVATE — delete old caches
   ============================================================ */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ============================================================
   FETCH — two-door strategy
   1. Try network first for HTML (always fresh)
   2. Cache first for static assets
   3. Fallback to index.html for navigation requests
   ============================================================ */
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  // Skip non-GET and external requests (Supabase, CDN)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Navigation requests — two-door: try / then /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function() {
        return caches.match('/index.html').then(function(cached) {
          return cached || caches.match('/');
        });
      })
    );
    return;
  }

  // Static assets — cache first, network fallback
  event.respondWith(
    caches.match(request).then(function(cached) {
      if (cached) return cached;
      return fetch(request).then(function(response) {
        // Cache valid responses
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, clone);
          });
        }
        return response;
      });
    }).catch(function() {
      // Offline fallback for HTML
      if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
        return caches.match('/index.html');
      }
    })
  );
});

/* ============================================================
   MESSAGE — force update from client
   ============================================================ */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
