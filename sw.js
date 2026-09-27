// v3: nuova app (generata dall'app infermieri PROVA), si butta la cache vecchia
const CACHE_NAME = 'turni-autisti-cache-v5';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
  './icon-118.png',
  './icon-118-192.png'
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

// ═══ NOTIFICHE SUL TELEFONO (Web Push) ═══
// Le manda il motore su GitHub (.github/motore): arrivano anche ad app chiusa.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Turni 118';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: 'icon-118-192.png',
    badge: 'icon-118-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
