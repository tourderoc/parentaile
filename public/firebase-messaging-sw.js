/**
 * Service Worker pour Firebase Cloud Messaging (FCM)
 *
 * Ce fichier doit être à la racine du domaine (public/)
 * Il gère les notifications push en arrière-plan.
 */

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Configuration Firebase (doit correspondre à celle de l'app)
firebase.initializeApp({
  apiKey: "AIzaSyCQysWQaf5j_-6HddVW1foRkLZN-ykr3iw",
  authDomain: "parentaile.firebaseapp.com",
  projectId: "parentaile",
  storageBucket: "parentaile.appspot.com",
  messagingSenderId: "837549100291",
  appId: "1:837549100291:web:64740c12546e4463c0ad36"
});

const messaging = firebase.messaging();

// Gestion des notifications en arrière-plan
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Notification reçue en arrière-plan:', payload);

  // Pour les messages "data-only", les infos sont dans payload.data
  const title = payload.notification?.title || payload.data?.title || 'Parent\'aile';
  const body = payload.notification?.body || payload.data?.body || 'Nouveau message de votre médecin';
  const notificationOptions = {
    body: body,
    icon: '/icons/web-app-manifest-192x192.png',
    badge: '/icons/favicon-96x96.png',
    tag: payload.data?.notificationId || 'default',
    data: payload.data,
    vibrate: [200, 100, 200],
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Voir' },
      { action: 'dismiss', title: 'Fermer' }
    ]
  };

  self.registration.showNotification(title, notificationOptions);

  // Mettre à jour le badge de l'icône de l'app
  if (navigator.setAppBadge) {
    const badgeCount = payload.data?.badgeCount ? parseInt(payload.data.badgeCount) : undefined;
    navigator.setAppBadge(badgeCount).catch(() => {});
  }
});

// Gestion du clic sur la notification
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Clic sur notification:', event);

  event.notification.close();

  if (event.action === 'dismiss') {
    // Effacer le badge même si on ferme simplement
    if (navigator.clearAppBadge) {
      navigator.clearAppBadge().catch(() => {});
    }
    return;
  }

  // Effacer le badge quand on clique sur la notification
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }

  // Ouvrir l'app sur le dashboard
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si une fenêtre est déjà ouverte, la focaliser
      for (const client of clientList) {
        if (client.url.includes('/espace') && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow('/espace/dashboard');
      }
    })
  );
});

// Effacer le badge quand on swipe/ferme la notification
self.addEventListener('notificationclose', (event) => {
  console.log('[firebase-messaging-sw.js] Notification fermée:', event);
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }
});
