/* ═══════════════════════════════════════════════════════════════════
   APEX Academy Global Schools Portal — Service Worker
   Build: __BUILD__   ← Render stamps this with the commit SHA
   ─────────────────────────────────────────────────────────────────
   Cache names in sync with index.html:
     apex-shell-__BUILD__  → app shell (auto-versioned per deploy)
     apex-face-v2          → face-api model files (page fetch interceptor)
     apex-pages-v3         → rendered page HTML (page cache helpers)
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'apex-shell-__BUILD__';   // changes every deploy → triggers update banner
const FACE_CACHE = 'apex-face-v2';            // in sync with page fetch interceptor
const PAGE_CACHE = 'apex-pages-v3';           // in sync with _PAGE_CACHE_NAME

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/manifest.json',
];

// ── Install: pre-cache the app shell ─────────────────────────────────
// Do NOT skipWaiting here — the update banner in index.html controls
// activation so users explicitly choose when to reload.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
});

// ── Activate: delete stale shell caches, keep face + page caches ─────
self.addEventListener('activate', event => {
  const keep = [CACHE_NAME, FACE_CACHE, PAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Messages from the page ────────────────────────────────────────────
self.addEventListener('message', event => {

  // _applyUpdate() sends this string to activate the waiting SW
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Online-restore handler sends {type:'SYNC_NOW'} when device reconnects.
  // The page's own 2.2s refresh already reloads live data, so we stay
  // silent here. When a real mutation queue is added later, flush it
  // here and reply: event.source.postMessage({type:'SYNC_COMPLETE', flushed: N})
  if (event.data?.type === 'SYNC_NOW') {
    return;
  }
});

// ── Fetch ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET and all cross-origin requests
  // (Supabase, CDNs, face-api — the page fetch interceptor handles those)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // 1. HTML navigation → Network First so fresh deploys load immediately;
  //    fall back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 2. Shell assets (icons, manifest) → Cache First for instant loads
  if (SHELL_ASSETS.some(a => url.pathname === a)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }

  // 3. Everything else on same origin → Network First, cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
