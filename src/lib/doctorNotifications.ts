/**
 * Service pour les notifications envoyées par le médecin via MedCompanion
 *
 * Ces notifications sont stockées dans la collection 'notifications' de Firebase
 * et sont créées par le médecin depuis MedCompanion (WPF).
 *
 * Types de notifications:
 * - EmailReply: Le médecin a répondu par email
 * - Quick: Notification rapide (RDV, info Doctolib, etc.)
 * - Info: Information générale
 * - Broadcast: Message envoyé à tous les parents
 */

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';

// ============================================
// TYPES
// ============================================

export type DoctorNotificationType = 'EmailReply' | 'Quick' | 'Info' | 'Broadcast';

export interface DoctorNotification {
  id: string;
  type: DoctorNotificationType;
  title: string;
  body: string;
  targetParentId: string;
  tokenId: string;
  replyToMessageId?: string;
  createdAt: Date;
  read: boolean;
  senderName: string;
}

// ============================================
// FONCTIONS
// ============================================

/**
 * Écoute les notifications pour un token spécifique (en temps réel)
 * @param tokenId - L'ID du token de l'enfant
 * @param callback - Fonction appelée à chaque changement
 * @returns Fonction pour arrêter l'écoute
 */
export function subscribeToNotifications(
  tokenId: string,
  callback: (notifications: DoctorNotification[]) => void
): Unsubscribe {
  const notificationsRef = collection(db, 'notifications');

  // Écouter les notifications pour ce token OU les broadcasts
  const q = query(
    notificationsRef,
    where('tokenId', '==', tokenId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const notifications: DoctorNotification[] = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        type: data.type as DoctorNotificationType,
        title: data.title || '',
        body: data.body || '',
        targetParentId: data.targetParentId || '',
        tokenId: data.tokenId || '',
        replyToMessageId: data.replyToMessageId,
        createdAt: data.createdAt instanceof Timestamp
          ? data.createdAt.toDate()
          : new Date(data.createdAt || Date.now()),
        read: data.read || false,
        senderName: data.senderName || 'Votre médecin'
      };
    });

    callback(notifications);
  }, (error) => {
    console.error('[DoctorNotifications] Erreur écoute:', error);
    callback([]);
  });
}

/**
 * Récupère les notifications pour plusieurs tokens (enfants)
 * @param tokenIds - Liste des IDs de tokens
 * @returns Liste des notifications
 */
export async function getNotificationsForTokens(tokenIds: string[]): Promise<DoctorNotification[]> {
  if (tokenIds.length === 0) return [];

  try {
    const allNotifications: DoctorNotification[] = [];

    // Firebase limite 'in' à 10 éléments, donc on fait plusieurs requêtes si nécessaire
    const chunks = [];
    for (let i = 0; i < tokenIds.length; i += 10) {
      chunks.push(tokenIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('tokenId', 'in', chunk),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);

      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        allNotifications.push({
          id: docSnap.id,
          type: data.type as DoctorNotificationType,
          title: data.title || '',
          body: data.body || '',
          targetParentId: data.targetParentId || '',
          tokenId: data.tokenId || '',
          replyToMessageId: data.replyToMessageId,
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt || Date.now()),
          read: data.read || false,
          senderName: data.senderName || 'Votre médecin'
        });
      });
    }

    // Trier par date décroissante
    return allNotifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  } catch (error) {
    console.error('[DoctorNotifications] Erreur récupération:', error);
    return [];
  }
}

/**
 * Marque une notification comme lue
 * @param notificationId - L'ID de la notification
 */
export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, { read: true });
    return true;
  } catch (error) {
    console.error('[DoctorNotifications] Erreur marquage lu:', error);
    return false;
  }
}

/**
 * Compte les notifications non lues pour un ensemble de tokens
 * @param tokenIds - Liste des IDs de tokens
 * @returns Nombre de notifications non lues
 */
export async function getUnreadCount(tokenIds: string[]): Promise<number> {
  if (tokenIds.length === 0) return 0;

  try {
    let count = 0;

    const chunks = [];
    for (let i = 0; i < tokenIds.length; i += 10) {
      chunks.push(tokenIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const notificationsRef = collection(db, 'notifications');
      const q = query(
        notificationsRef,
        where('tokenId', 'in', chunk),
        where('read', '==', false)
      );

      const snapshot = await getDocs(q);
      count += snapshot.docs.length;
    }

    return count;

  } catch (error) {
    console.error('[DoctorNotifications] Erreur comptage:', error);
    return 0;
  }
}

/**
 * Retourne l'icône appropriée selon le type de notification
 */
export function getNotificationIcon(type: DoctorNotificationType): string {
  switch (type) {
    case 'EmailReply': return '📧';
    case 'Quick': return '⚡';
    case 'Info': return 'ℹ️';
    case 'Broadcast': return '📢';
    default: return '🔔';
  }
}

/**
 * Retourne la couleur appropriée selon le type de notification
 */
export function getNotificationColor(type: DoctorNotificationType): string {
  switch (type) {
    case 'EmailReply': return 'bg-green-100 text-green-700 border-green-200';
    case 'Quick': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'Info': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Broadcast': return 'bg-purple-100 text-purple-700 border-purple-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export default {
  subscribeToNotifications,
  getNotificationsForTokens,
  markNotificationAsRead,
  getUnreadCount,
  getNotificationIcon,
  getNotificationColor
};
