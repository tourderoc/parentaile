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
  deleteDoc,
  doc,
  getDocs,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';

const MAX_NOTIFS = 10;

async function purgeOldDoctorNotifs(ids: string[]): Promise<void> {
  if (ids.length <= MAX_NOTIFS) return;
  const toDelete = ids.slice(MAX_NOTIFS);
  await Promise.all(toDelete.map(id => deleteDoc(doc(db, 'notifications', id))));
}

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

    // Purge silencieuse : garde les 10 plus récentes, supprime les anciennes
    if (snapshot.docs.length > MAX_NOTIFS) {
      purgeOldDoctorNotifs(snapshot.docs.map(d => d.id));
    }

    callback(notifications.slice(0, MAX_NOTIFS));
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
 * Marque toutes les notifications comme lues pour un ensemble de tokens
 * @param tokenIds - Liste des IDs de tokens
 */
export async function markAllAsReadForTokens(tokenIds: string[]): Promise<void> {
  if (tokenIds.length === 0) return;
  
  try {
    const notifications = await getNotificationsForTokens(tokenIds);
    const unread = notifications.filter(n => !n.read);
    
    if (unread.length === 0) return;

    // Faire les mises à jour en parallèle pour plus de rapidité
    await Promise.all(unread.map(notif => markNotificationAsRead(notif.id)));
    
    console.log(`[DoctorNotifications] ${unread.length} notifications marquées comme lues`);
  } catch (error) {
    console.error('[DoctorNotifications] Erreur marquage global lu:', error);
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
 * Récupère les notifications liées à un message spécifique
 * @param messageId - L'ID du message
 * @returns Liste des notifications liées à ce message
 */
export async function getNotificationsForMessage(messageId: string): Promise<DoctorNotification[]> {
  if (!messageId) return [];

  try {
    const notificationsRef = collection(db, 'notifications');
    // Note: Pas de orderBy pour éviter de nécessiter un index composite
    const q = query(
      notificationsRef,
      where('replyToMessageId', '==', messageId)
    );

    console.log('[DoctorNotifications] Recherche notifications pour messageId:', messageId);
    const snapshot = await getDocs(q);
    console.log('[DoctorNotifications] Trouvé:', snapshot.docs.length, 'notifications');

    const notifications = snapshot.docs.map(docSnap => {
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

    // Trier par date décroissante (fait en JS car pas d'orderBy dans la query)
    return notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  } catch (error: any) {
    console.error('[DoctorNotifications] Erreur récupération par message:', error);
    console.error('[DoctorNotifications] Code erreur:', error?.code);
    console.error('[DoctorNotifications] Message:', error?.message);
    return [];
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
  getNotificationsForMessage,
  markNotificationAsRead,
  markAllAsReadForTokens,
  getUnreadCount,
  getNotificationIcon,
  getNotificationColor
};
