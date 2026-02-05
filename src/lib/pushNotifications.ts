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
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { initializeApp, getApps } from 'firebase/app';

// Clé VAPID publique (Firebase Console > Cloud Messaging > Web Push certificates)
const VAPID_KEY = '_t8Tx0kzw5-8bjiZ-0nUtOLYPpuAjCBVHSpE-nxqzFk';

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
    const tokenRef = doc(db, 'tokens', tokenId);
    await updateDoc(tokenRef, {
      fcmToken: fcmToken,
      fcmTokenUpdatedAt: new Date()
    });
    console.log('[PushNotifications] Token FCM enregistré pour:', tokenId);
    return true;
  } catch (error) {
    console.error('[PushNotifications] Erreur enregistrement token FCM:', error);
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

        const notificationPayload: PushNotificationPayload = {
          title: payload.notification?.title || 'Notification',
          body: payload.notification?.body || '',
          data: payload.data as Record<string, string>
        };

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
 */
export async function initializePushNotifications(tokenIds: string[]): Promise<boolean> {
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

    // Enregistrer le token FCM pour chaque enfant
    let success = true;
    for (const tokenId of tokenIds) {
      const registered = await registerFcmTokenForParent(tokenId, fcmToken);
      if (!registered) success = false;
    }

    return success;
  } catch (error) {
    console.error('[PushNotifications] Erreur initialisation:', error);
    return false;
  }
}

export default {
  isPushSupported,
  requestPermission,
  getFcmToken,
  registerFcmTokenForParent,
  onForegroundNotification,
  initializePushNotifications
};
