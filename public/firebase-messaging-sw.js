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

  // Si FCM a déjà inclus un bloc "notification", le navigateur l'affiche souvent tout seul.
  // On ne déclenche showNotification manuellement que si c'est un message "data-only"
  // ou si on veut forcer nos options personnalisées (actions, etc.)
  
  if (payload.notification) {
    console.log('[firebase-messaging-sw.js] Bloc notification présent, le navigateur s\'en occupe peut-être déjà.');
    // On met quand même à jour le badge
    if (navigator.setAppBadge) {
      const badgeCount = payload.data?.badgeCount ? parseInt(payload.data.badgeCount) : 1;
      navigator.setAppBadge(badgeCount).catch(() => {});
    }
    return;
  }

  const title = payload.data?.title || 'Parent\'aile';
  const body = payload.data?.body || 'Nouveau message de votre médecin';
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
    const badgeCount = payload.data?.badgeCount ? parseInt(payload.data.badgeCount) : 1;
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
    if (navigator.setAppBadge) {
      navigator.setAppBadge(0).catch(() => {});
    }
    return;
  }

  // Effacer le badge quand on clique sur la notification
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(() => {});
  }
  if (navigator.setAppBadge) {
    navigator.setAppBadge(0).catch(() => {});
  }

  // Deep link : utiliser le lien de la notification si disponible
  const deepLink = event.notification.data?.link || '/espace/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si une fenêtre est déjà ouverte, la focaliser et naviguer
      for (const client of clientList) {
        if (client.url.includes('/espace') && 'focus' in client) {
          client.focus();
          // Naviguer vers le deep link si different de la page actuelle
          if (deepLink !== '/espace/dashboard') {
            client.postMessage({ type: 'NAVIGATE', url: deepLink });
          }
          return;
        }
      }
      // Sinon ouvrir une nouvelle fenêtre avec le deep link
      if (clients.openWindow) {
        return clients.openWindow(deepLink);
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
  if (navigator.setAppBadge) {
    navigator.setAppBadge(0).catch(() => {});
  }
});
