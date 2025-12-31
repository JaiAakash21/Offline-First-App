/* Service Worker for Offline-First App
 - Precaches static assets
 - Provides offline fallback
 - Handles Background Sync ('sync-actions')
 - Simulates offline/slow network via override
*/

const CACHE = 'offline-first-cache-v1';
const PRECACHE = [
  '/',
  '/offline-first-app/',
  '/offline-first-app/index.html',
  '/offline-first-app/styles.css',
  '/offline-first-app/app.js',
  '/offline-first-app/db.js',
  '/offline-first-app/crypto.js',
  '/offline-first-app/sync.js',
  '/offline-first-app/search.js',
  '/offline-first-app/notifications.js',
  '/offline-first-app/simulator.js',
];

let override = { offline: false, delay: 0 };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  if (type === 'SIM_OVERRIDE') {
    override = payload || override;
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  event.respondWith(
    (async () => {
      if (override.offline) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('Offline (simulated)', { status: 503, statusText: 'Service Unavailable' });
      }
      if (override.delay > 0) {
        await new Promise((res) => setTimeout(res, override.delay));
      }
      try {
        const net = await fetch(request);
        return net;
      } catch (err) {
        const cached = await caches.match(request);
        return (
          cached || new Response('Offline fallback', { status: 200, headers: { 'Content-Type': 'text/plain' } })
        );
      }
    })()
  );
});

self.addEventListener('sync', async (event) => {
  if (event.tag === 'sync-actions') {
    event.waitUntil(
      (async () => {
        const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        for (const client of clientsList) {
          client.postMessage({ type: 'RUN_SYNC' });
        }
      })()
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/offline-first-app/'));
});
