const CACHE_NAME = 'kai-app-v4';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/pages.js',
    '/js/constants.js',
    '/js/sanitize.js',
    '/image/logo.png',
    '/image/logo2.png',
    '/pages',
    '/pages/privacy',
    '/pages/terms',
    '/pages/pro'
];

// Install Event - Skip waiting to activate immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activate Event - Clean old caches and claim clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            self.clients.claim()
        ])
    );
});

// Fetch Event - Network-first strategy for HTML/CSS/JS
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and API calls
    if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
        return;
    }

    const url = new URL(event.request.url);

    // Skip external resources
    if (url.hostname !== self.location.hostname) {
        return;
    }

    // Network-first strategy for app resources
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache the fresh response
                if (response.ok) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache if network fails
                return caches.match(event.request);
            })
    );
});
