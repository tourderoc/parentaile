import { db } from './firebase';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
  writeBatch,
  getDocs,
} from 'firebase/firestore';

// ========== TYPES ==========

export type ParentNotifType =
  | 'group_join'        // Un parent a rejoint votre groupe
  | 'badge_earned'      // Vous avez obtenu un nouveau badge
  | 'evaluation_received' // Un participant a évalué votre groupe
  | 'session_ended'     // La session vocale est terminée
  | 'group_created'     // Votre groupe a été créé
  | 'group_cancelled'   // Votre groupe a été annulé
  | 'group_banned'      // Vous avez été banni d'un groupe
  | 'vocal_reminder';   // Rappel avant le début d'une session vocale

export interface ParentNotification {
  id: string;
  type: ParentNotifType;
  recipientUid: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
  // Contexte pour la navigation
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
    const data = {
      type,
      recipientUid,
      title,
      body,
      read: false,
      createdAt: serverTimestamp(),
      ...(context?.groupeId ? { groupeId: context.groupeId } : {}),
      ...(context?.groupeTitre ? { groupeTitre: context.groupeTitre } : {}),
    };

    if (notifId) {
      await setDoc(doc(db, 'parentNotifications', notifId), data);
    } else {
      await addDoc(collection(db, 'parentNotifications'), data);
    }
  } catch (err) {
    console.error('Erreur envoi notification parent:', err);
  }
}

// ========== PURGE ==========

const MAX_NOTIFS = 10;

async function purgeOldParentNotifs(docs: { id: string }[]): Promise<void> {
  try {
    if (docs.length <= MAX_NOTIFS) return;
    // Les docs sont triés par createdAt desc → les plus anciens sont en fin de tableau
    const toDelete = docs.slice(MAX_NOTIFS);
    await Promise.all(
      toDelete.map(d => deleteDoc(doc(db, 'parentNotifications', d.id)))
    );
  } catch (err) {
    // On ignore silencieusement car c'est une opération de maintenance non-critique
    console.warn('[parentNotificationService] Échec de la purge automatique (permissions probablement restreintes)');
  }
}

// ========== LECTURE ==========

export function onParentNotifications(
  uid: string,
  callback: (notifications: ParentNotification[]) => void
): () => void {
  const q = query(
    collection(db, 'parentNotifications'),
    where('recipientUid', '==', uid),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const notifs: ParentNotification[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.() || new Date(),
    })) as ParentNotification[];

    // Purge silencieuse : garde les 10 plus récentes, supprime les anciennes
    if (snapshot.docs.length > MAX_NOTIFS) {
      purgeOldParentNotifs(snapshot.docs.map(d => ({ id: d.id })));
    }

    callback(notifs.slice(0, MAX_NOTIFS));
  }, (err) => {
    console.error('Erreur écoute notifications parent:', err);
    callback([]);
  });
}

export function onUnreadParentNotifCount(
  uid: string,
  callback: (count: number) => void
): () => void {
  const q = query(
    collection(db, 'parentNotifications'),
    where('recipientUid', '==', uid),
    where('read', '==', false)
  );

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.length);
  }, () => {
    callback(0);
  });
}

export async function markParentNotifAsRead(notifId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'parentNotifications', notifId), { read: true });
  } catch (err) {
    console.error('Erreur marquage notification:', err);
  }
}

export async function deleteParentNotification(notifId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'parentNotifications', notifId));
  } catch (err) {
    console.error('Erreur suppression notification:', err);
  }
}

export async function deleteAllParentNotifs(uid: string): Promise<void> {
  try {
    const q = query(
      collection(db, 'parentNotifications'),
      where('recipientUid', '==', uid)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.error('Erreur suppression toutes notifs:', err);
  }
}

export async function markAllParentNotifsAsRead(uid: string): Promise<void> {
  try {
    const q = query(
      collection(db, 'parentNotifications'),
      where('recipientUid', '==', uid),
      where('read', '==', false)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  } catch (err) {
    console.error('Erreur marquage toutes notifs:', err);
  }
}
