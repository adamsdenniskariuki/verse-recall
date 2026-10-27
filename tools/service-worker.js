// Verse Recall service worker. Built by vite.config.ts; placeholders are replaced at build time.
// Bible chapters and the Find a verse index are immutable per version and cached the first time they are used.
const VERSION = __VERSION__;
const SHELL = __SHELL__;
const SNAPSHOTS = __SNAPSHOTS__;
const SEARCH = __SEARCH__;
const isBible = path => SNAPSHOTS.some(snapshot => path.startsWith(`/bibles/${snapshot}/`));
const isSearch = path => path.startsWith(SEARCH);
const APP_CACHE = `verse-recall-app-${VERSION}`;
const BIBLE_CACHE = 'verse-recall-bibles';
const SEARCH_CACHE = 'verse-recall-search';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('verse-recall-app-') && key !== APP_CACHE) await caches.delete(key);
    }
    const bibles = await caches.open(BIBLE_CACHE);
    for (const request of await bibles.keys()) {
      if (!isBible(new URL(request.url).pathname)) await bibles.delete(request);
    }
    const search = await caches.open(SEARCH_CACHE);
    for (const request of await search.keys()) {
      if (!isSearch(new URL(request.url).pathname)) await search.delete(request);
    }
    await self.clients.claim();
  })());
});

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put('/', response.clone());
    return response;
  } catch {
    return (await cache.match('/')) ?? Response.error();
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') return event.respondWith(networkFirstPage(request));
  if (isBible(url.pathname)) return event.respondWith(cacheFirst(request, BIBLE_CACHE));
  if (isSearch(url.pathname)) return event.respondWith(cacheFirst(request, SEARCH_CACHE));
  if (SHELL.includes(url.pathname)) return event.respondWith(cacheFirst(request, APP_CACHE));
});
