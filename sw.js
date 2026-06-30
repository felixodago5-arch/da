const CACHE_NAME = 'fj-dashboard-v1';

const SHELL_ASSETS = [
    '/da/login.html',
    '/da/index.html',
    '/da/client.html',
    '/da/style.css',
    '/da/manifest.json',
    '/da/offline.html'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(SHELL_ASSETS).catch(err =>
                console.warn('SW: Some assets failed to cache:', err)
            )
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    if (
        url.hostname.includes('firebase') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('cloudinary.com') ||
        request.method !== 'GET'
    ) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            })
            .catch(() =>
                caches.match(request).then(cached => {
                    if (cached) return cached;
                    if (request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('/dashboard/offline.html');
                    }
                })
            )
    );
});