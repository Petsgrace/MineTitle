// Land Harmony - Service Worker
// Provides offline capability, background sync, and real-time update support

const CACHE_NAME = 'land-harmony-v2';
const OFFLINE_QUEUE_DB = 'land-harmony-db';
const SYNC_TAG = 'sync-offline-queue';

// Core assets to cache on install (app shell)
const STATIC_ASSETS = [
  '/',
  '/index.html',
];

// ─── Install: Cache the app shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Land Harmony service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        // Don't fail install if some assets are missing in dev
        console.warn('[SW] Failed to cache some assets:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: Clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Land Harmony service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── Fetch: Smart caching strategy ───────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip caching during development or on Vite dev server
  if (url.port === '5173' || url.pathname.includes('@vite') || url.pathname.includes('@fs')) {
    return;
  }

  // Skip non-GET requests to API — handle them separately for offline queuing
  if (url.pathname.startsWith('/api/') && request.method !== 'GET') {
    event.respondWith(handleOfflinePost(request));
    return;
  }

  // Network-first for API GET calls (fresh data preferred)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for HTML pages (so updates propagate)
  event.respondWith(networkFirst(request));
});

// ─── Strategy: Cache First ────────────────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// ─── Strategy: Network First ──────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/index.html');
      if (offlinePage) return offlinePage;
    }
    return new Response(
      JSON.stringify({ error: 'You are offline. Your request will be sent when you reconnect.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ─── Offline POST: Queue for later sync ──────────────────────────────────────
async function handleOfflinePost(request) {
  try {
    // Try the request normally first
    const response = await fetch(request.clone());
    return response;
  } catch {
    // We're offline — save to IndexedDB queue
    const body = await request.text();
    await addToOfflineQueue({
      url: request.url,
      method: request.method,
      body: body,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString(),
    });

    // Register background sync if supported
    if (self.registration.sync) {
      try {
        await self.registration.sync.register(SYNC_TAG);
      } catch (err) {
        console.warn('[SW] Background sync registration failed:', err);
      }
    }

    // Notify all open clients that they're offline
    broadcastMessage({ type: 'OFFLINE_QUEUED', url: request.url });

    return new Response(
      JSON.stringify({
        offline: true,
        message: 'You are offline. Your data has been saved and will be uploaded automatically when you reconnect.',
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ─── Background Sync: Replay queued requests ─────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] Background sync triggered — replaying offline queue...');
    event.waitUntil(replayOfflineQueue());
  }
});

async function replayOfflineQueue() {
  const queue = await getOfflineQueue();
  if (!queue || queue.length === 0) return;

  let successCount = 0;
  let failCount = 0;

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        body: item.body,
        headers: {
          ...item.headers,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (response.ok) {
        await removeFromOfflineQueue(item.id);
        successCount++;
        console.log('[SW] Synced queued request:', item.url);
      } else {
        failCount++;
        console.warn('[SW] Failed to sync request, will retry:', item.url);
      }
    } catch (err) {
      failCount++;
      console.error('[SW] Error replaying request:', err);
    }
  }

  // Notify clients of sync result
  broadcastMessage({
    type: 'SYNC_COMPLETE',
    successCount,
    failCount,
    message: successCount > 0
      ? `${successCount} offline submission(s) successfully uploaded!`
      : 'Sync attempted but some items could not be uploaded.',
  });
}

// ─── Broadcast message to all open clients ───────────────────────────────────
function broadcastMessage(data) {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
    clients.forEach((client) => client.postMessage(data));
  });
}

// ─── IndexedDB helpers (used inside service worker) ──────────────────────────
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, 2);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('offline-queue')) {
        db.createObjectStore('offline-queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('audit-logs')) {
        db.createObjectStore('audit-logs', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('beneficiary-media')) {
        db.createObjectStore('beneficiary-media', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addToOfflineQueue(item) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline-queue', 'readwrite');
    tx.objectStore('offline-queue').add(item);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getOfflineQueue() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline-queue', 'readonly');
    const request = tx.objectStore('offline-queue').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeFromOfflineQueue(id) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline-queue', 'readwrite');
    tx.objectStore('offline-queue').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Push Notifications (for real-time status updates) ───────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'Your application status has been updated.',
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'view', title: 'View Application' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Land Harmony Update', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/dashboard')
    );
  }
});

console.log('[SW] Land Harmony service worker loaded.');
