// MediCuenta Service Worker — instalabilidad + notificaciones push.
// v1.1.0
//
// CRÍTICO (gotchas de la fábrica, ya resueltos):
//  - NO incluir un handler de 'fetch': rompe las PWA en iOS Safari.
//  - Este SW habilita la instalación, limpia caches viejos y recibe push.

const CACHE_NAME = 'medicuenta-v2';

self.addEventListener('install', () => {
  // Activa esta versión de inmediato sin esperar a que se cierren las pestañas.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

// Permite que el cliente fuerce la activación de una versión nueva.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push: recibir la notificación del servidor y mostrarla.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'MediCuenta', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'MediCuenta', {
      body: payload.body || '',
      icon: payload.icon || '/icons/icon-192.png',
      badge: payload.badge || '/icons/icon-96.png',
      data: payload.data || {},
      tag: payload.tag,
      requireInteraction: payload.requireInteraction || false,
    })
  );
});

// Click en la notificación: enfocar una pestaña existente o abrir la URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client) client.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// Si el navegador invalida la suscripción, re-suscribir y avisar al servidor.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(
        event.oldSubscription?.options || {
          userVisibleOnly: true,
          applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
        }
      )
      .then((newSub) =>
        fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: newSub.toJSON(),
            oldEndpoint: event.oldSubscription?.endpoint,
          }),
        })
      )
  );
});
