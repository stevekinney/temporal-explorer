/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const worker = self;
const cacheName = `temporal-explorer-${version}`;
const assets = [...build, ...files];

worker.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      await cache.addAll(assets);
    })(),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((candidate) => candidate !== cacheName)
          .map((candidate) => caches.delete(candidate)),
      );
    })(),
  );
});

worker.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    (async () => {
      const url = new URL(event.request.url);
      const cache = await caches.open(cacheName);
      const isStaticAsset = assets.includes(url.pathname);
      const cachedAsset = isStaticAsset ? await cache.match(event.request) : undefined;

      if (cachedAsset) {
        return cachedAsset;
      }

      const response = await fetch(event.request);

      if (response.ok && isStaticAsset) {
        await cache.put(event.request, response.clone());
      }

      return response;
    })(),
  );
});
