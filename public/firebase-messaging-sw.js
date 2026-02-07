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

  const notificationTitle = payload.notification?.title || 'Parent\'aile';
  const notificationOptions = {
    body: payload.notification?.body || 'Nouveau message de votre médecin',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: payload.data?.notificationId || 'default',
    data: payload.data,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: 'Voir' },
      { action: 'dismiss', title: 'Fermer' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);

  // Mettre à jour le badge de l'icône de l'app
  if (navigator.setAppBadge) {
    const badgeCount = payload.data?.badgeCount ? parseInt(payload.data.badgeCount, 10) : undefined;
    
    if (!isNaN(badgeCount)) {
      navigator.setAppBadge(badgeCount).catch((error) => {
        console.error('[firebase-messaging-sw.js] Erreur setAppBadge avec count:', error);
      });
    } else {
      navigator.setAppBadge().catch((error) => {
        console.error('[firebase-messaging-sw.js] Erreur setAppBadge sans count:', error);
      });
    }
  }
});

// Gestion du clic sur la notification
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Clic sur notification:', event);

  event.notification.close();

  if (event.action === 'dismiss') {
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
