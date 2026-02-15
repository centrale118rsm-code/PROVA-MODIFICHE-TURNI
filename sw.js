const CACHE_NAME = 'turni-autisti-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Icons+Round'
];

// Installazione del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aperta');
        return cache.addAll(urlsToCache);
      })
  );
});

// Attivazione e pulizia vecchie cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Intercettazione richieste (Strategia: Network First per il file Excel, Cache First per il resto)
self.addEventListener('fetch', (event) => {
  
  // Se la richiesta è per il file Excel, prova sempre a scaricarlo fresco dalla rete
  if (event.request.url.includes('.xlsx')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Se sei offline, restituisci quello in cache se c'è, altrimenti errore
          return caches.match(event.request);
        })
    );
    return;
  }

  // Per tutto il resto (HTML, CSS, JS), usa la cache se disponibile
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Restituisci la risorsa dalla cache se c'è
        if (response) {
          return response;
        }
        // Altrimenti scaricala dalla rete
        return fetch(event.request);
      })
  );
});