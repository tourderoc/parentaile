/**
 * Service de notifications internes Parent'aile.
 * Backend : VPS account-service (PostgreSQL).
 */

const VPS_URL = import.meta.env.VITE_GROUP_API_URL || import.meta.env.VITE_ACCOUNT_API_URL;
const VPS_KEY = import.meta.env.VITE_ACCOUNT_API_KEY;

async function notifFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${VPS_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': VPS_KEY,
      ...(init.headers || {}),
    },
  });
}

// ========== TYPES ==========

export type ParentNotifType =
  | 'group_join'
  | 'badge_earned'
  | 'evaluation_received'
  | 'session_ended'
  | 'group_created'
  | 'group_cancelled'
  | 'group_banned'
  | 'vocal_reminder';

export interface ParentNotification {
  id: string;
  type: ParentNotifType;
  recipientUid: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
  groupeId?: string;
  groupeTitre?: string;
}

// ========== ICÔNES ET COULEURS PAR TYPE ==========

export const NOTIF_CONFIG: Record<ParentNotifType, { icon: string; color: string; bg: string }> = {
  group_join:          { icon: '👤', color: 'text-orange-600', bg: 'bg-orange-50' },
  badge_earned:        { icon: '⭐', color: 'text-amber-600',  bg: 'bg-amber-50' },
  evaluation_received: { icon: '💬', color: 'text-pink-600',   bg: 'bg-pink-50' },
  session_ended:       { icon: '🎙️', color: 'text-violet-600', bg: 'bg-violet-50' },
  group_created:       { icon: '✅', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  group_cancelled:     { icon: '❌', color: 'text-red-600',     bg: 'bg-red-50' },
  group_banned:        { icon: '🚫', color: 'text-red-700',     bg: 'bg-red-100' },
  vocal_reminder:      { icon: '🔔', color: 'text-blue-600',    bg: 'bg-blue-50' },
};

// ========== HELPERS ==========

function mapNotif(raw: any): ParentNotification {
  return {
    id: raw.id,
    type: raw.type as ParentNotifType,
    recipientUid: raw.recipient_uid,
    title: raw.title,
    body: raw.body,
    read: raw.read,
    createdAt: new Date(raw.created_at),
    groupeId: raw.groupe_id || undefined,
    groupeTitre: raw.groupe_titre || undefined,
  };
}

// ========== ÉCRITURE ==========

export async function sendParentNotification(
  recipientUid: string,
  type: ParentNotifType,
  title: string,
  body: string,
  context?: { groupeId?: string; groupeTitre?: string },
  notifId?: string
): Promise<void> {
  try {
    await notifFetch('/notifications', {
      method: 'POST',
      body: JSON.stringify({
        type,
        recipient_uid: recipientUid,
        title,
        body,
        groupe_id: context?.groupeId || null,
        groupe_titre: context?.groupeTitre || null,
        notif_id: notifId || null,
        send_push: false,
      }),
    });
  } catch (err) {
    console.error('Erreur envoi notification parent:', err);
  }
}

// ========== LECTURE (polling) ==========

export function onParentNotifications(
  uid: string,
  callback: (notifications: ParentNotification[]) => void
): () => void {
  const poll = async () => {
    try {
      const res = await notifFetch(`/notifications/${encodeURIComponent(uid)}`);
      if (!res.ok) { callback([]); return; }
      const items = await res.json();
      callback(items.map(mapNotif));
    } catch {
      callback([]);
    }
  };
  poll();
  const interval = setInterval(poll, 15000);
  return () => clearInterval(interval);
}

export function onUnreadParentNotifCount(
  uid: string,
  callback: (count: number) => void
): () => void {
  const poll = async () => {
    try {
      const res = await notifFetch(`/notifications/${encodeURIComponent(uid)}/unread-count`);
      if (!res.ok) { callback(0); return; }
      const data = await res.json();
      callback(data.count || 0);
    } catch {
      callback(0);
    }
  };
  poll();
  const interval = setInterval(poll, 15000);
  return () => clearInterval(interval);
}

// ========== ACTIONS ==========

export async function markParentNotifAsRead(notifId: string): Promise<void> {
  try {
    await notifFetch(`/notifications/${encodeURIComponent(notifId)}/read`, { method: 'PUT' });
  } catch (err) {
    console.error('Erreur marquage notification:', err);
  }
}

export async function deleteParentNotification(notifId: string): Promise<void> {
  try {
    await notifFetch(`/notifications/${encodeURIComponent(notifId)}`, { method: 'DELETE' });
  } catch (err) {
    console.error('Erreur suppression notification:', err);
  }
}

export async function deleteAllParentNotifs(uid: string): Promise<void> {
  try {
    await notifFetch(`/notifications/${encodeURIComponent(uid)}/all`, { method: 'DELETE' });
  } catch (err) {
    console.error('Erreur suppression toutes notifs:', err);
  }
}

export async function markAllParentNotifsAsRead(uid: string): Promise<void> {
  try {
    await notifFetch(`/notifications/${encodeURIComponent(uid)}/read-all`, { method: 'PUT' });
  } catch (err) {
    console.error('Erreur marquage toutes notifs:', err);
  }
}
