/**
 * Service pour les notifications push (FCM Web)
 *
 * Gère:
 * - Demande de permission
 * - Récupération du token FCM
 * - Enregistrement du token dans Firestore
 * - Écoute des notifications en premier plan
 */

import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore'; // @FIREBASE_LEGACY
import { db } from './firebase'; // @FIREBASE_LEGACY
import { getApps } from 'firebase/app';
import { areNotificationsEnabled, playNotificationSound } from './userPreferences';
import { accountStorage } from './accountStorage';

const VPS_URL = import.meta.env.VITE_GROUP_API_URL || import.meta.env.VITE_ACCOUNT_API_URL;
const VPS_KEY = import.meta.env.VITE_ACCOUNT_API_KEY;
const USE_FIREBASE = import.meta.env.VITE_FIREBASE_BRIDGE !== 'false'; // @FIREBASE_LEGACY

// Clé VAPID publique (Firebase Console > Cloud Messaging > Web Push certificates)
const VAPID_KEY = 'BM_HWgoaVmHT8E44P9D4gHEf52594f6xUKO67r_HEnwmFusTwGP04BRy-fBxSw1YwLOTYicQOeXLOA1B5L94gLA';

// ============================================
// TYPES
// ============================================

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

type NotificationCallback = (payload: PushNotificationPayload) => void;

// ============================================
// VARIABLES
// ============================================

let messaging: ReturnType<typeof getMessaging> | null = null;
let foregroundCallbacks: NotificationCallback[] = [];

// Guard: n'initialiser le token FCM qu'une seule fois par session browser
// Promise-lock pour éviter la race condition si 2 appels simultanés au démarrage
let pushInitPromise: Promise<boolean> | null = null;

// ============================================
// FONCTIONS
// ============================================

/**
 * Vérifie si les notifications push sont supportées
 */
export async function isPushSupported(): Promise<boolean> {
  try {
    // Vérifier le support de base
    if (!('Notification' in window)) {
      console.log('[PushNotifications] Notification API non supportée');
      return false;
    }

    if (!('serviceWorker' in navigator)) {
      console.log('[PushNotifications] Service Worker non supporté');
      return false;
    }

    // Vérifier le support FCM
    const supported = await isSupported();
    if (!supported) {
      console.log('[PushNotifications] FCM non supporté');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[PushNotifications] Erreur vérification support:', error);
    return false;
  }
}

/**
 * Initialise le service de messaging FCM
 */
async function initMessaging(): Promise<boolean> {
  if (messaging) return true;

  try {
    const supported = await isPushSupported();
    if (!supported) return false;

    // S'assurer que l'app Firebase est initialisée
    if (getApps().length === 0) {
      console.error('[PushNotifications] Firebase non initialisé');
      return false;
    }

    messaging = getMessaging();
    return true;
  } catch (error) {
    console.error('[PushNotifications] Erreur initialisation messaging:', error);
    return false;
  }
}

/**
 * Demande la permission pour les notifications
 * @returns 'granted', 'denied', ou 'default'
 */
export async function requestPermission(): Promise<NotificationPermission> {
  try {
    const permission = await Notification.requestPermission();
    console.log('[PushNotifications] Permission:', permission);
    return permission;
  } catch (error) {
    console.error('[PushNotifications] Erreur demande permission:', error);
    return 'default';
  }
}

/**
 * Récupère le token FCM pour ce navigateur
 * @returns Le token FCM ou null si échec
 */
export async function getFcmToken(): Promise<string | null> {
  try {
    const initialized = await initMessaging();
    if (!initialized || !messaging) {
      return null;
    }

    // Vérifier la permission
    if (Notification.permission !== 'granted') {
      const permission = await requestPermission();
      if (permission !== 'granted') {
        console.log('[PushNotifications] Permission refusée');
        return null;
      }
    }

    // Enregistrer le service worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    console.log('[PushNotifications] Service Worker enregistré');

    // Récupérer le token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    console.log('[PushNotifications] Token FCM obtenu:', token?.substring(0, 20) + '...');
    return token;
  } catch (error) {
    console.error('[PushNotifications] Erreur récupération token:', error);
    return null;
  }
}

/**
 * Enregistre le token FCM pour un token parent (enfant)
 * @param tokenId - L'ID du token parent dans Firestore
 * @param fcmToken - Le token FCM à enregistrer
 */
export async function registerFcmTokenForParent(tokenId: string, fcmToken: string): Promise<boolean> {
  try {
    // VPS bridge
    await fetch(`${VPS_URL}/bridge/tokens/${encodeURIComponent(tokenId)}/fcm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': VPS_KEY },
      body: JSON.stringify({ fcm_token: fcmToken }),
    });

    // @FIREBASE_LEGACY — aussi écrire sur Firestore
    if (USE_FIREBASE) {
      try {
        const tokenRef = doc(db, 'tokens', tokenId);
        await updateDoc(tokenRef, { fcmToken, fcmTokenUpdatedAt: new Date() });
      } catch { /* ignore */ }
    }

    console.log('[PushNotifications] Token FCM enregistré pour:', tokenId);
    return true;
  } catch (error) {
    console.error('[PushNotifications] Erreur enregistrement token FCM:', error);
    return false;
  }
}

/**
 * Enregistre le token FCM sur le compte utilisateur (accounts/{uid})
 * Permet aux Cloud Functions d'envoyer des notifications par uid (rappels groupes vocaux)
 * @param uid - L'UID Firebase Auth de l'utilisateur
 * @param fcmToken - Le token FCM à enregistrer
 */
export async function registerFcmTokenForAccount(uid: string, fcmToken: string): Promise<boolean> {
  try {
    await accountStorage.updateAccount(uid, {
      fcmToken: fcmToken,
      fcmTokenUpdatedAt: new Date()
    });
    console.log('[PushNotifications] Token FCM enregistré sur account:', uid);
    return true;
  } catch (error) {
    console.error('[PushNotifications] Erreur enregistrement FCM account:', error);
    return false;
  }
}

/**
 * Configure l'écoute des notifications en premier plan
 * @param callback - Fonction appelée quand une notification arrive
 * @returns Fonction pour arrêter l'écoute
 */
export function onForegroundNotification(callback: NotificationCallback): () => void {
  foregroundCallbacks.push(callback);

  // Initialiser l'écoute FCM si pas déjà fait
  initMessaging().then(initialized => {
    if (initialized && messaging) {
      onMessage(messaging, (payload) => {
        console.log('[PushNotifications] Notification en premier plan:', payload);

        // Vérifier si les notifications sont activées
        if (!areNotificationsEnabled()) {
          console.log('[PushNotifications] Notifications désactivées par l\'utilisateur');
          return;
        }

        const notificationPayload: PushNotificationPayload = {
          title: payload.notification?.title || payload.data?.title || 'Notification',
          body: payload.notification?.body || payload.data?.body || '',
          data: payload.data as Record<string, string>
        };

        // Jouer le son de notification
        playNotificationSound();

        // Mettre à jour le badge de l'icône de l'app (PWA)
        // Utiliser le badgeCount envoyé par le serveur, ou 1 par défaut (jamais undefined)
        const badgeCount = payload.data?.badgeCount ? parseInt(payload.data.badgeCount) : 1;
        updateAppBadge(badgeCount);

        // Afficher une notification système même en premier plan
        showForegroundNotification(notificationPayload);

        // Appeler tous les callbacks enregistrés
        foregroundCallbacks.forEach(cb => cb(notificationPayload));
      });
    }
  });

  // Retourner la fonction de désinscription
  return () => {
    foregroundCallbacks = foregroundCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Initialise les notifications push pour un parent
 * Demande la permission et enregistre le token FCM
 * @param tokenIds - Liste des tokenIds des enfants du parent
 * @param uid - UID Firebase Auth (optionnel, pour les rappels groupes vocaux)
 */
export async function initializePushNotifications(tokenIds: string[], uid?: string): Promise<boolean> {
  // Si déjà en cours ou terminé, retourner la même Promise — pas de double exécution
  if (pushInitPromise) return pushInitPromise;

  pushInitPromise = (async () => {
    try {
      const supported = await isPushSupported();
      if (!supported) {
        console.log('[PushNotifications] Push non supporté sur ce navigateur');
        return false;
      }

      const fcmToken = await getFcmToken();
      if (!fcmToken) {
        console.log('[PushNotifications] Impossible d\'obtenir le token FCM');
        return false;
      }

      let success = true;
      for (const tokenId of tokenIds) {
        const registered = await registerFcmTokenForParent(tokenId, fcmToken);
        if (!registered) success = false;
      }

      if (uid) {
        await registerFcmTokenForAccount(uid, fcmToken);
      }

      return success;
    } catch (error) {
      console.error('[PushNotifications] Erreur initialisation:', error);
      pushInitPromise = null; // Permettre retry si erreur
      return false;
    }
  })();

  return pushInitPromise;
}

/**
 * Affiche une notification système quand l'app est en premier plan
 * (En arrière-plan, c'est le service worker qui gère)
 */
function showForegroundNotification(payload: PushNotificationPayload): void {
  if (Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: '/icons/web-app-manifest-192x192.png',
      badge: '/icons/favicon-96x96.png',
      tag: payload.data?.notificationId || 'foreground',
      renotify: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      // Deep link : utiliser le lien de la notification si disponible
      const deepLink = payload.data?.link;
      if (deepLink) {
        window.location.href = deepLink;
      } else if (window.location.pathname !== '/espace/dashboard') {
        window.location.href = '/espace/dashboard';
      }
    };
  } catch {
    // Fallback pour les environnements qui ne supportent pas new Notification()
    // (ex: certains navigateurs mobiles qui nécessitent ServiceWorker)
    navigator.serviceWorker?.ready?.then(registration => {
      registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/web-app-manifest-192x192.png',
        badge: '/icons/favicon-96x96.png',
        tag: payload.data?.notificationId || 'foreground',
        renotify: true,
      });
    }).catch(() => {});
  }
}

/**
 * Met à jour le badge de l'icône de l'app (PWA)
 * @param count - Nombre à afficher (0 pour un point, undefined pour incrémenter)
 */
export function updateAppBadge(count?: number): void {
  if ('setAppBadge' in navigator) {
    (navigator as any).setAppBadge(count).catch(() => {});
  }
}

/**
 * Efface le badge de l'icône de l'app
 */
export function clearAppBadge(): void {
  if ('clearAppBadge' in navigator) {
    (navigator as any).clearAppBadge().catch(() => {});
  }
  // Fallback: setAppBadge(0) clears it on some platforms
  if ('setAppBadge' in navigator) {
    (navigator as any).setAppBadge(0).catch(() => {});
  }
}

export default {
  isPushSupported,
  requestPermission,
  getFcmToken,
  registerFcmTokenForParent,
  registerFcmTokenForAccount,
  onForegroundNotification,
  initializePushNotifications,
  updateAppBadge,
  clearAppBadge
};
