// Cloude service worker: installs the site, receives live alerts, and saves Yes/No answers
// straight from the notification (no need to open the app on Android).
const CACHE = 'cloude-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (always fresh), fall back to saved copy when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// A real alert arrives from the server.
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(d.title || 'Cloude', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: d.type || 'cloude',
      renotify: true,
      requireInteraction: true,          // stays until you answer
      data: { uid: d.uid, type: d.type || 'trial' },
      actions: [                         // Yes/No buttons show on Android. iPhone ignores them.
        { action: 'yes', title: 'Yes' },
        { action: 'no', title: 'No' }
      ]
    })
  );
});

// Tap Yes/No on the notification: save in the background, never open the app.
// Tap the notification itself: open the big question page.
self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  const { uid, type } = n.data || {};
  n.close();

  if (e.action === 'yes' || e.action === 'no') {
    e.waitUntil(
      fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, type, answer: e.action })
      })
        .then((r) => { if (!r.ok) throw new Error('save failed'); return flash('Logged: ' + e.action.toUpperCase(), 'Thanks, Cloude saved your answer.'); })
        .catch(() => self.registration.showNotification('Could not save your answer', {
          body: 'Tap here to answer inside Cloude.',
          icon: '/icons/icon-192.png',
          data: { uid, type, open: true }
        }))
    );
    return;
  }

  const url = '/checkin.html?type=' + encodeURIComponent(type || 'trial') + '&uid=' + encodeURIComponent(uid || '');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});

// Tiny "Logged" confirmation that removes itself after a moment.
function flash(title, body) {
  return self.registration
    .showNotification(title, { body, icon: '/icons/icon-192.png', tag: 'cloude-logged', silent: true })
    .then(() => new Promise((r) => setTimeout(r, 2500)))
    .then(() => self.registration.getNotifications({ tag: 'cloude-logged' }))
    .then((list) => list.forEach((x) => x.close()));
}
