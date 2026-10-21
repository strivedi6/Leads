// Opens instantly: the app files are served from the phone, then quietly refreshed in the background
// (the next open picks up any new version). Lead data never goes through here – it comes from
// Google Sheets and is kept by the app itself.
var CACHE = 'leads-v8';
var SHELL = ['./', './index.html', './app.js', './config.js', './manifest.webmanifest',
  './icons/logo.png', './icons/icon-192.png', './icons/icon-512.png', './favicon.ico'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/onesignal/') >= 0 || /OneSignalSDK/.test(url.pathname)) return;
  var key = e.request.mode === 'navigate' ? './index.html' : e.request;
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(key, { ignoreSearch: true }).then(function (hit) {
      var fresh = fetch(e.request).then(function (res) {
        if (res && res.ok) c.put(key, res.clone());
        return res;
      });
      if (hit) { e.waitUntil(fresh.catch(function () {})); return hit; }
      return fresh.catch(function () { return c.match('./index.html'); });
    });
  }));
});
