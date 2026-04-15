import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { CloudTasksClient } from '@google-cloud/tasks';

admin.initializeApp();

const tasksClient = new CloudTasksClient();

// ========== CLOUD TASKS — Gestion des rappels vocaux ==========

/**
 * manageVocalTasks — Firestore onWrite sur groupes/{groupeId}
 * Crée, met à jour ou supprime les Cloud Tasks de rappel
 */
export const manageVocalTasks = functions
  .region('europe-west1')
  .firestore.document('groupes/{groupeId}')
  .onWrite(async (change, context) => {
    const groupeId = context.params.groupeId;
    const before = change.before.data();
    const after = change.after.data();

    const config = functions.config().cloudtasks || {};
    const project = config.project || process.env.GCLOUD_PROJECT;
    const location = config.location || 'europe-west1';
    const queue = config.queue || 'vocal-reminders';
    const handlerUrl = config.handler_url;

    if (!project || !handlerUrl) {
      console.error('[ManageTasks] Missing cloudtasks config (project or handler_url)');
      return;
    }

    const parent = tasksClient.queuePath(project, location, queue);
    const taskTypes = ['30min', '15min', '5min'] as const;
    const offsets: Record<string, number> = {
      '30min': 30 * 60 * 1000,
      '15min': 15 * 60 * 1000,
      '5min': 5 * 60 * 1000,
    };

    // Helper : supprimer une tâche (ignore si elle n'existe pas)
    const deleteTask = async (type: string) => {
      const taskName = `${parent}/tasks/parentaile-${groupeId}-${type}`;
      try {
        await tasksClient.deleteTask({ name: taskName });
        console.log(`[ManageTasks] Deleted task ${type} for ${groupeId}`);
      } catch (err: any) {
        if (err.code === 5) { // NOT_FOUND
          // Tâche déjà exécutée ou inexistante, c'est OK
        } else {
          console.error(`[ManageTasks] Error deleting task ${type}:`, err);
        }
      }
    };

    // Helper : créer une tâche
    const createTask = async (type: string, dateVocal: Date) => {
      const fireAt = new Date(dateVocal.getTime() - offsets[type]);

      // Ne pas créer de tâche dans le passé
      if (fireAt.getTime() <= Date.now()) {
        console.log(`[ManageTasks] Skipping task ${type} for ${groupeId} (already past)`);
        return;
      }

      const taskName = `${parent}/tasks/parentaile-${groupeId}-${type}`;
      const payload = JSON.stringify({ groupeId, type });

      try {
        await tasksClient.createTask({
          parent,
          task: {
            name: taskName,
            httpRequest: {
              httpMethod: 'POST',
              url: handlerUrl,
              headers: { 'Content-Type': 'application/json' },
              body: Buffer.from(payload).toString('base64'),
              oidcToken: {
                serviceAccountEmail: `${project}@appspot.gserviceaccount.com`,
              },
            },
            scheduleTime: {
              seconds: Math.floor(fireAt.getTime() / 1000),
            },
          },
        });
        console.log(`[ManageTasks] Created task ${type} for ${groupeId} at ${fireAt.toISOString()}`);
      } catch (err: any) {
        if (err.code === 6) { // ALREADY_EXISTS
          console.log(`[ManageTasks] Task ${type} already exists for ${groupeId}`);
        } else {
          console.error(`[ManageTasks] Error creating task ${type}:`, err);
        }
      }
    };

    // --- CAS 1 : Groupe supprimé → supprimer toutes les tâches ---
    if (!after) {
      console.log(`[ManageTasks] Group ${groupeId} deleted, removing tasks`);
      await Promise.all(taskTypes.map(t => deleteTask(t)));
      return;
    }

    // --- CAS 2 : Groupe annulé → supprimer toutes les tâches ---
    if (after.status === 'cancelled') {
      console.log(`[ManageTasks] Group ${groupeId} cancelled, removing tasks`);
      await Promise.all(taskTypes.map(t => deleteTask(t)));
      return;
    }

    // --- CAS 3 : Groupe créé ou dateVocal modifiée → (re)créer les tâches ---
    const dateVocalAfter = after.dateVocal?.toDate?.() || (after.dateVocal ? new Date(after.dateVocal) : null);
    if (!dateVocalAfter) return; // Pas de date vocale, rien à faire

    const dateVocalBefore = before?.dateVocal?.toDate?.() || (before?.dateVocal ? new Date(before.dateVocal) : null);
    const isNewGroup = !before;
    const dateChanged = !isNewGroup && dateVocalBefore && dateVocalAfter.getTime() !== dateVocalBefore.getTime();

    if (isNewGroup || dateChanged) {
      // Si la date a changé, supprimer les anciennes tâches d'abord
      if (dateChanged) {
        console.log(`[ManageTasks] dateVocal changed for ${groupeId}, re-scheduling`);
        await Promise.all(taskTypes.map(t => deleteTask(t)));
      }

      // Créer les nouvelles tâches
      console.log(`[ManageTasks] Creating tasks for ${groupeId} (dateVocal: ${dateVocalAfter.toISOString()})`);
      await Promise.all(taskTypes.map(t => createTask(t, dateVocalAfter)));
    }
  });

/**
 * handleVocalReminder — HTTP function appelée par Cloud Tasks
 * Traite les rappels : notif ou annulation selon le type et le nombre de participants
 */
export const handleVocalReminder = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    // Vérifier la méthode
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const { groupeId, type } = req.body;
    if (!groupeId || !type) {
      res.status(400).send('Missing groupeId or type');
      return;
    }

    const db = admin.firestore();

    // 1. Lire le groupe
    const groupeSnap = await db.collection('groupes').doc(groupeId).get();
    if (!groupeSnap.exists) {
      console.log(`[Reminder] Group ${groupeId} not found, skipping`);
      res.status(200).send('Group not found');
      return;
    }

    const data = groupeSnap.data()!;

    // 2. Si groupe annulé, exit
    if (data.status === 'cancelled') {
      console.log(`[Reminder] Group ${groupeId} already cancelled, skipping`);
      res.status(200).send('Group cancelled');
      return;
    }

    // 3. Déduplication
    const dedupRef = db.collection('groupes').doc(groupeId)
      .collection('notifications_sent').doc(`reminder_${type}`);
    const dedupSnap = await dedupRef.get();
    if (dedupSnap.exists) {
      console.log(`[Reminder] Already sent ${type} for ${groupeId}, skipping`);
      res.status(200).send('Already sent');
      return;
    }

    const participants: any[] = data.participants || [];

    // 4. Logique selon le type
    if (type === '30min' && participants.length < 3) {
      // --- ANNULATION ---
      console.log(`[Reminder] Group ${groupeId} has ${participants.length} participants, cancelling`);
      await db.collection('groupes').doc(groupeId).update({ status: 'cancelled' });

      // Notifier les inscrits (en parallèle)
      const cancelPromises = participants
        .filter((p: any) => p.uid)
        .map(async (p: any) => {
          // Notification in-app
          const notifId = `cancel_${groupeId}_${p.uid}`;
          await db.collection('parentNotifications').doc(notifId).set({
            type: 'group_cancelled',
            recipientUid: p.uid,
            title: 'Groupe annulé',
            body: `Le groupe "${data.titre}" n'aura malheureusement pas lieu (pas assez de participants).`,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            groupeId,
            groupeTitre: data.titre,
          });

          // FCM
          const accSnap = await db.collection('accounts').doc(p.uid).get();
          const token = accSnap.data()?.fcmToken;
          if (token) {
            await admin.messaging().send({
              token,
              notification: {
                title: 'Groupe annulé',
                body: `Votre groupe "${data.titre}" a été annulé (manque de participants).`,
              },
            }).catch(() => {});
          }
        });

      await Promise.all(cancelPromises);
      await dedupRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() });

      console.log(`[Reminder] Group ${groupeId} cancelled and participants notified`);
      res.status(200).send('Cancelled');
      return;
    }

    // --- ENVOI DE RAPPEL ---
    // Construire le message
    const title = type === '30min'
      ? 'Votre groupe dans 30 min'
      : type === '15min'
      ? 'Votre groupe dans 15 min'
      : 'Votre groupe commence !';

    const body = type === '30min'
      ? `"${data.titre}" aura bien lieu, préparez-vous !`
      : type === '15min'
      ? `"${data.titre}" — La salle d'attente est ouverte`
      : `"${data.titre}" — ${participants.length} parent${participants.length > 1 ? 's' : ''} vous attendent`;

    // Récupérer les FCM tokens en parallèle
    const accountSnaps = await Promise.all(
      participants
        .filter((p: any) => p.uid)
        .map((p: any) => db.collection('accounts').doc(p.uid).get())
    );

    // Envoyer notifs in-app + FCM en parallèle pour chaque participant
    const reminderPromises = participants
      .filter((p: any) => p.uid)
      .map(async (p: any, i: number) => {
        // Notification in-app
        const notifId = `reminder_${type}_${groupeId}_${p.uid}`;
        await db.collection('parentNotifications').doc(notifId).set({
          type: 'vocal_reminder',
          recipientUid: p.uid,
          title,
          body,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          groupeId,
          groupeTitre: data.titre,
          reminderType: type,
        });

        // FCM push
        const token = accountSnaps[i]?.data()?.fcmToken;
        if (token) {
          await admin.messaging().send({
            token,
            notification: { title, body },
            data: {
              link: `/espace/groupes/${groupeId}/vocal`,
              type: 'vocal_reminder',
              groupeId,
            },
            webpush: {
              fcmOptions: {
                link: `/espace/groupes/${groupeId}/vocal`,
              },
            },
          }).catch(() => {});
        }
      });

    await Promise.all(reminderPromises);
    console.log(`[Reminder] ${type} sent for ${groupeId} (${participants.length} participants)`);

    await dedupRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
    res.status(200).send('OK');
  });



