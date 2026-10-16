// Guarda la app para que funcione sin conexión.
// Con internet siempre carga la versión más reciente; sin internet, la guardada.
// Al publicar cambios, sube el número de versión.
const CACHE = 'misgastos-v5';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' evita copiar archivos antiguos de la caché del navegador
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (sin caché del navegador); si falla o tarda más de 4 s, la copia guardada
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    const timeout = new Promise(r => setTimeout(r, 4000));
    try {
      const res = await Promise.race([network, timeout]);
      if (res) return res;
    } catch (err) { /* sin conexión */ }
    return (await cache.match(e.request, { ignoreSearch: true })) || network;
  })());
});
