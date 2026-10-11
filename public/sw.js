// Advertising service worker removed. Keep this file harmless for any existing registration.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
