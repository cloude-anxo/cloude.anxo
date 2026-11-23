// Minimal service worker: makes the app installable. Always asks the network first, so you never get stale data.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) { if (e.request.method === 'GET') e.respondWith(fetch(e.request).catch(function () { return new Response('You are offline. Cloude needs the internet to read the sky.', { status: 503 }); })); });
