/**
 * Service pour les notifications envoyées par le médecin via MedCompanion.
 * Source : VPS bridge (/bridge/notifications)
 * @FIREBASE_LEGACY — dual-read Firebase activé si VITE_FIREBASE_BRIDGE !== 'false'
 */

import { // @FIREBASE_LEGACY
  collection, query, where, orderBy, onSnapshot, // @FIREBASE_LEGACY
  updateDoc, deleteDoc, doc, getDocs, Timestamp, // @FIREBASE_LEGACY
  type Unsubscribe // @FIREBASE_LEGACY
} from 'firebase/firestore'; // @FIREBASE_LEGACY
import { db } from './firebase'; // @FIREBASE_LEGACY

const VPS_URL = import.meta.env.VITE_GROUP_API_URL || import.meta.env.VITE_ACCOUNT_API_URL;
const VPS_KEY = import.meta.env.VITE_ACCOUNT_API_KEY;
const USE_FIREBASE = import.meta.env.VITE_FIREBASE_BRIDGE !== 'false'; // @FIREBASE_LEGACY

async function bridgeFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${VPS_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': VPS_KEY,
      ...(init.headers || {}),
    },
  });
}

const MAX_NOTIFS = 10;

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
// HELPERS
// ============================================

function mapNotifFromVps(raw: any): DoctorNotification {
  return {
    id: raw.id,
    type: raw.type as DoctorNotificationType,
    title: raw.title || '',
    body: raw.body || '',
    targetParentId: raw.target_parent_id || '',
    tokenId: raw.token_id || '',
    replyToMessageId: raw.reply_to_message_id || undefined,
    createdAt: new Date(raw.created_at),
    read: raw.read || false,
    senderName: raw.sender_name || 'Votre médecin',
  };
}

// ============================================
// ÉCOUTE (polling VPS, fallback Firebase)
// ============================================

export function subscribeToNotifications(
  tokenId: string,
  callback: (notifications: DoctorNotification[]) => void
): () => void {
  // @FIREBASE_LEGACY — si Firebase activé et VPS pas encore alimenté, écouter Firebase
  if (USE_FIREBASE) {
    return _subscribeFirebase(tokenId, callback);
  }

  // VPS polling
  const poll = async () => {
    try {
      const res = await bridgeFetch(`/bridge/notifications/token/${encodeURIComponent(tokenId)}?limit=${MAX_NOTIFS}`);
      if (!res.ok) { callback([]); return; }
      const items = await res.json();
      callback(items.map(mapNotifFromVps));
    } catch {
      callback([]);
    }
  };
  poll();
  const interval = setInterval(poll, 15000);
  return () => clearInterval(interval);
}

// ============================================
// LECTURE
// ============================================

export async function getNotificationsForTokens(tokenIds: string[]): Promise<DoctorNotification[]> {
  if (tokenIds.length === 0) return [];

  // @FIREBASE_LEGACY
  if (USE_FIREBASE) {
    return _getNotificationsForTokensFirebase(tokenIds);
  }

  try {
    const all: DoctorNotification[] = [];
    for (const tokenId of tokenIds) {
      const res = await bridgeFetch(`/bridge/notifications/token/${encodeURIComponent(tokenId)}?limit=${MAX_NOTIFS}`);
      if (res.ok) {
        const items = await res.json();
        all.push(...items.map(mapNotifFromVps));
      }
    }
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (error) {
    console.error('[DoctorNotifications] Erreur récupération VPS:', error);
    return [];
  }
}

export async function getNotificationsForMessage(messageId: string): Promise<DoctorNotification[]> {
  if (!messageId) return [];

  // @FIREBASE_LEGACY
  if (USE_FIREBASE) {
    return _getNotificationsForMessageFirebase(messageId);
  }

  // VPS : pas d'endpoint dédié par messageId, on filtre côté client
  // (les notifications liées à un message ont reply_to_message_id = messageId)
  // Pour l'instant, retourner vide — sera alimenté quand MedCompanion basculera
  return [];
}

// ============================================
// ACTIONS
// ============================================

export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  try {
    await bridgeFetch(`/bridge/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PUT' });

    // @FIREBASE_LEGACY
    if (USE_FIREBASE) {
      try {
        const ref = doc(db, 'notifications', notificationId);
        await updateDoc(ref, { read: true });
      } catch { /* ignore */ }
    }

    return true;
  } catch (error) {
    console.error('[DoctorNotifications] Erreur marquage lu:', error);
    return false;
  }
}

export async function markAllAsReadForTokens(tokenIds: string[]): Promise<void> {
  if (tokenIds.length === 0) return;
  const notifications = await getNotificationsForTokens(tokenIds);
  const unread = notifications.filter(n => !n.read);
  await Promise.all(unread.map(n => markNotificationAsRead(n.id)));
}

export async function getUnreadCount(tokenIds: string[]): Promise<number> {
  if (tokenIds.length === 0) return 0;

  // @FIREBASE_LEGACY
  if (USE_FIREBASE) {
    return _getUnreadCountFirebase(tokenIds);
  }

  try {
    let count = 0;
    for (const tokenId of tokenIds) {
      const res = await bridgeFetch(`/bridge/notifications/unread/${encodeURIComponent(tokenId)}`);
      if (res.ok) {
        const data = await res.json();
        count += data.count || 0;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// ============================================
// ICÔNES ET COULEURS
// ============================================

export function getNotificationIcon(type: DoctorNotificationType): string {
  switch (type) {
    case 'EmailReply': return '📧';
    case 'Quick': return '⚡';
    case 'Info': return 'ℹ️';
    case 'Broadcast': return '📢';
    default: return '🔔';
  }
}

export function getNotificationColor(type: DoctorNotificationType): string {
  switch (type) {
    case 'EmailReply': return 'bg-green-100 text-green-700 border-green-200';
    case 'Quick': return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'Info': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Broadcast': return 'bg-purple-100 text-purple-700 border-purple-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

// ============================================
// @FIREBASE_LEGACY — Fonctions Firebase (à supprimer au merge)
// ============================================

function _mapFirebaseNotif(docSnap: any): DoctorNotification {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    type: data.type as DoctorNotificationType,
    title: data.title || '',
    body: data.body || '',
    targetParentId: data.targetParentId || '',
    tokenId: data.tokenId || '',
    replyToMessageId: data.replyToMessageId,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
    read: data.read || false,
    senderName: data.senderName || 'Votre médecin',
  };
}

function _subscribeFirebase(tokenId: string, callback: (n: DoctorNotification[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'notifications'),
    where('tokenId', '==', tokenId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const notifs = snapshot.docs.map(_mapFirebaseNotif);
    if (snapshot.docs.length > MAX_NOTIFS) {
      const toDelete = snapshot.docs.slice(MAX_NOTIFS).map(d => d.id);
      Promise.all(toDelete.map(id => deleteDoc(doc(db, 'notifications', id))));
    }
    callback(notifs.slice(0, MAX_NOTIFS));
  }, () => callback([]));
}

async function _getNotificationsForTokensFirebase(tokenIds: string[]): Promise<DoctorNotification[]> {
  const all: DoctorNotification[] = [];
  const chunks = [];
  for (let i = 0; i < tokenIds.length; i += 10) chunks.push(tokenIds.slice(i, i + 10));
  for (const chunk of chunks) {
    const q = query(collection(db, 'notifications'), where('tokenId', 'in', chunk), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    all.push(...snapshot.docs.map(_mapFirebaseNotif));
  }
  return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function _getNotificationsForMessageFirebase(messageId: string): Promise<DoctorNotification[]> {
  const q = query(collection(db, 'notifications'), where('replyToMessageId', '==', messageId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(_mapFirebaseNotif).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function _getUnreadCountFirebase(tokenIds: string[]): Promise<number> {
  let count = 0;
  const chunks = [];
  for (let i = 0; i < tokenIds.length; i += 10) chunks.push(tokenIds.slice(i, i + 10));
  for (const chunk of chunks) {
    const q = query(collection(db, 'notifications'), where('tokenId', 'in', chunk), where('read', '==', false));
    const snapshot = await getDocs(q);
    count += snapshot.docs.length;
  }
  return count;
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
