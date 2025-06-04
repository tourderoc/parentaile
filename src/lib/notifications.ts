import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface Notification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category?: 'consultation' | 'forum' | 'workshop';
  createdAt: Date;
  read: boolean;
  postId?: string;
  link?: string;
  consultationId?: string;
  expiresAt?: Date;
}

export const createNotification = async (notification: Omit<Notification, 'createdAt' | 'read'>) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      ...notification,
      createdAt: serverTimestamp(),
      read: false,
      expiresAt: notification.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Default 7 days expiry
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

export const createConsultationNotification = async (
  userId: string,
  consultationId: string,
  date: Date,
  time: string,
  type: 'scheduled' | 'reminder' | 'cancelled' | 'rescheduled' | 'custom' | 'summary',
  newDate?: Date,
  newTime?: string,
  customMessage?: string
) => {
  let title: string;
  let message: string;
  let notificationType: 'info' | 'success' | 'warning' | 'error';
  let expiresAt = new Date(date);
  expiresAt.setDate(expiresAt.getDate() + 1); // Expire 24h after consultation

  switch (type) {
    case 'scheduled':
      title = 'Consultation programmée';
      message = `Votre rendez-vous du ${date.toLocaleDateString('fr-FR')} à ${time} est confirmé. Le lien de la visioconférence sera disponible dans l'espace Mes consultations 10 minutes avant le début.`;
      notificationType = 'success';
      break;
    case 'reminder':
      title = 'Rappel de consultation';
      message = `Votre consultation est prévue ${date.toLocaleDateString('fr-FR')} à ${time}.`;
      notificationType = 'info';
      break;
    case 'cancelled':
      title = 'Consultation annulée';
      message = `Votre rendez-vous du ${date.toLocaleDateString('fr-FR')} à ${time} a été annulé. N'hésitez pas à réserver un autre créneau.`;
      notificationType = 'error';
      break;
    case 'rescheduled':
      title = 'Consultation déplacée';
      message = `Votre rendez-vous du ${date.toLocaleDateString('fr-FR')} à ${time} a été déplacé au ${newDate?.toLocaleDateString('fr-FR')} à ${newTime}.`;
      notificationType = 'warning';
      break;
    case 'summary':
      title = 'Résumé de consultation disponible';
      message = 'Le résumé de votre consultation est maintenant disponible dans votre espace personnel.';
      notificationType = 'info';
      break;
    case 'custom':
      title = 'Notification consultation';
      message = customMessage || 'Notification de consultation';
      notificationType = 'info';
      break;
    default:
      throw new Error('Invalid notification type');
  }

  await createNotification({
    userId,
    title,
    message,
    type: notificationType,
    category: 'consultation',
    consultationId,
    link: '/my-consultations',
    expiresAt
  });
};

export const markNotificationAsRead = async (notificationId: string) => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, {
      read: true
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

export const getUserNotifications = async (userId: string) => {
  try {
    const now = new Date();
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('expiresAt', '>', now),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(notificationsQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Notification[];
  } catch (error) {
    console.error('Error fetching notifications:', error);
    throw error;
  }
};

export const ignoreNotification = async (notificationId: string) => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await deleteDoc(notificationRef);
  } catch (error) {
    console.error('Error ignoring notification:', error);
    throw error;
  }
};

export const viewNotification = async (notificationId: string) => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await deleteDoc(notificationRef);
  } catch (error) {
    console.error('Error viewing notification:', error);
    throw error;
  }
};

export const getUnreadNotificationsCount = async (userId: string) => {
  try {
    const now = new Date();
    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('expiresAt', '>', now),
      where('read', '==', false)
    );

    const snapshot = await getDocs(notificationsQuery);
    return snapshot.docs.length;
  } catch (error) {
    console.error('Error getting unread notifications count:', error);
    throw error;
  }
};

export const deleteExpiredNotifications = async () => {
  try {
    const now = new Date();
    const expiredNotificationsQuery = query(
      collection(db, 'notifications'),
      where('expiresAt', '<=', now)
    );

    const snapshot = await getDocs(expiredNotificationsQuery);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error deleting expired notifications:', error);
    throw error;
  }
};