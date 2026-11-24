// Cloude service worker: the "background helper" that lets the site install and show notifications.
const CACHE = 'cloude-v1';
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

// LATER: your backend will send push messages here.
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(showCloude(d.title, d.body, d.id));
});

function showCloude(title, body, id) {
  return self.registration.showNotification(title || 'Cloude', {
    body: body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: id || 'cloude-checkin',
    data: { id: id || 'demo' },
    actions: [            // Yes/No buttons show on Android. iPhone ignores them.
      { action: 'yes', title: 'Yes' },
      { action: 'no', title: 'No' }
    ]
  });
}

// When you tap the notification or one of its buttons.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const answer = e.action || 'ask';   // 'yes', 'no', or 'ask' (tapped the body: show buttons in app)
  const url = '/?checkin=' + answer + '&id=' + encodeURIComponent(e.notification.data.id);
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});
