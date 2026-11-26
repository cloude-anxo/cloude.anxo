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
  const type = d.type || 'trial';
  const askYesNo = d.ask || type === 'trial';          // Yes/No buttons only for the trial (and anything marked ask)
  const actions = askYesNo
    ? [{ action: 'yes', title: 'Yes' }, { action: 'no', title: 'No' }]
    : type === 'trips' ? [{ action: 'skip', title: 'Not now' }] : [];
  e.waitUntil(
    self.registration.showNotification(d.title || 'Cloude', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: type,
      renotify: true,
      requireInteraction: !!(d.emergency || askYesNo),   // emergency alerts stay until you look at them
      data: { uid: d.uid, type, url: d.url || null },
      actions
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  const { uid, type, url: link } = n.data || {};
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

  if (e.action === 'skip') {                           // "Not now" on the trips reminder: stop the reminders
    e.waitUntil(
      fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, action: 'skip' })
      }).then(() => flash('Okay', 'No more trip reminders. You can add trips any time in Cloude.')).catch(() => {})
    );
    return;
  }

  // Tap the notification itself: open the page it points to (or the big question page for old-style alerts).
  const url = link || ('/checkin.html?type=' + encodeURIComponent(type || 'trial') + '&uid=' + encodeURIComponent(uid || ''));
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});

// Tiny confirmation that removes itself after a moment.
function flash(title, body) {
  return self.registration
    .showNotification(title, { body, icon: '/icons/icon-192.png', tag: 'cloude-logged', silent: true })
    .then(() => new Promise((r) => setTimeout(r, 2500)))
    .then(() => self.registration.getNotifications({ tag: 'cloude-logged' }))
    .then((list) => list.forEach((x) => x.close()));
}
