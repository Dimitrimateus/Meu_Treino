/// <reference lib="webworker" />
// Service worker próprio (vite-plugin-pwa, injectManifest): precache do app shell,
// Web Push (sempre chama showNotification — exigência do iOS) e clique na notificação.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA: navegações caem no index.html (funciona offline)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Imagens/GIFs dos exercícios (bucket público): CacheFirst com limite
registerRoute(
  ({ url }) => url.pathname.includes('/storage/v1/object/public/exercise-media/'),
  new CacheFirst({
    cacheName: 'exercise-media',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 })],
  }),
);
// Fotos de evolução (URLs assinadas) NÃO são cacheadas aqui.

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

interface PushPayload { title?: string; body?: string; url?: string; tag?: string }

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || 'Treinos';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data?.url as string) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        if ('navigate' in c) await (c as WindowClient).navigate(target).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
