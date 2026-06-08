/* NSDATA - sw.js */
/* Service worker — network-first strategy */

var CACHE_NAME = 'nsdata-v2.0.7';

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

/* INSTALL */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* ACTIVATE — delete old caches */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* FETCH — network-first, cache fallback */
self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Navigation — network first, fallback to cached index
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

  // All assets — network first, update cache, fallback to cache
  event.respondWith(
    fetch(request).then(function(response) {
      if (response && response.status === 200 && response.type === 'basic') {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(request).then(function(cached) {
        if (cached) return cached;
        if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* MESSAGE — force update */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
