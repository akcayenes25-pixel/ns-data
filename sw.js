/* NSDATA - sw.js */
/* Service worker — network-first strategy */

var CACHE_NAME = 'nsdata-v2.0.7';

/* INSTALL — skip caching on install, just activate */
self.addEventListener('install', function(event) {
  event.waitUntil(self.skipWaiting());
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function() {
        return caches.match('/index.html').then(function(c) { return c || caches.match('/'); });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).then(function(response) {
      if (response && response.status === 200 && response.type === 'basic') {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(request, clone); });
      }
      return response;
    }).catch(function() {
      return caches.match(request);
    })
  );
});

/* MESSAGE */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
