// v3: nuova app (generata dall'app infermieri PROVA), si butta la cache vecchia
const CACHE_NAME = 'turni-autisti-cache-v3';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

// Installazione del Service Worker
self.addEventListener('install', (event) => {
  // Forza il nuovo service worker a prendere il controllo immediatamente
  self.skipWaiting();
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
            console.log('Cancellazione vecchia cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Dice al service worker di controllare le pagine attive immediatamente
  return self.clients.claim();
});

// STRATEGIA DI RECUPERO DATI
self.addEventListener('fetch', (event) => {
  
  // STRATEGIA: NETWORK FIRST (Internet prima, Cache se offline)
  // La usiamo per il file Excel E per la pagina principale (index.html)
  // Così se fai modifiche al codice, l'utente le vede subito.
  if (event.request.url.includes('.xlsx') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
            // Se scarichiamo con successo una nuova versione, aggiorniamo la cache
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
            });
            return response;
        })
        .catch(() => {
          // Se sei offline o GitHub non va, usa la cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // STRATEGIA: CACHE FIRST (Cache prima, Internet se manca)
  // Per immagini, librerie, font (cose che non cambiano mai)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
