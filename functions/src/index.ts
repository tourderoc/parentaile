import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AccessToken } from 'livekit-server-sdk';

admin.initializeApp();

// ========== RAPPELS VOCAUX — Notifications 15min et 5min avant ==========

export const sendVocalReminders = functions
  .region('europe-west1')
  .pubsub.schedule('every 1 minutes')
  .timeZone('Europe/Paris')
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();

    // Chercher les groupes avec dateVocal dans [now+4min, now+32min]
    const minDate = new Date(now + 4 * 60000);
    const maxDate = new Date(now + 32 * 60000);

    const snapshot = await db
      .collection('groupes')
      .where('dateVocal', '>=', admin.firestore.Timestamp.fromDate(minDate))
      .where('dateVocal', '<=', admin.firestore.Timestamp.fromDate(maxDate))
      .get();

    if (snapshot.empty) return null;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Exclure les groupes test
      if (data.isTestGroup) continue;

      const dateVocal = data.dateVocal?.toDate?.() || new Date(data.dateVocal);
      const minutesLeft = Math.round((dateVocal.getTime() - now) / 60000);

      // Determiner le type de rappel
      let reminderType: '30min' | '15min' | '5min' | null = null;
      if (minutesLeft >= 28 && minutesLeft <= 32) reminderType = '30min';
      else if (minutesLeft >= 13 && minutesLeft <= 16) reminderType = '15min';
      else if (minutesLeft >= 4 && minutesLeft <= 6) reminderType = '5min';
      else continue;

      // Verifier la deduplication
      const dedupRef = db.collection('groupes').doc(doc.id)
        .collection('notifications_sent').doc(`reminder_${reminderType}`);
      const dedupSnap = await dedupRef.get();
      if (dedupSnap.exists) continue;

      // --- VERIFICATION J-30MIN ET ANNULATION ---
      if (reminderType === '30min') {
        const pCount = (data.participants || []).length;
        if (pCount < 3) {
          // Annuler le groupe
          await db.collection('groupes').doc(doc.id).update({ status: 'cancelled' });
          
          // Notifier les inscrits de l'annulation
          for (const p of data.participants || []) {
            if (!p.uid) continue;
            
            // Notification in-app
            await db.collection('parentNotifications').add({
              type: 'group_cancelled',
              recipientUid: p.uid,
              title: 'Groupe annulé',
              body: `Le groupe "${data.titre}" n'aura malheureusement pas lieu (pas assez de participants).`,
              read: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              groupeId: doc.id,
              groupeTitre: data.titre
            });
            
            // FCM Notification
            const accSnap = await db.collection('accounts').doc(p.uid).get();
            const token = accSnap.data()?.fcmToken;
            if (token) {
              await admin.messaging().send({
                token,
                notification: { title: 'Groupe annulé', body: `Votre groupe "${data.titre}" a été annulé (manque de participants).` }
              }).catch(() => {});
            }
          }
          
          await dedupRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
          continue; // On passe au groupe suivant, le groupe est annulé
        }
      }

      // Recuperer les FCM tokens des participants
      const participants: any[] = data.participants || [];
      const fcmTokens: string[] = [];

      for (const p of participants) {
        if (!p.uid) continue;
        const accountSnap = await db.collection('accounts').doc(p.uid).get();
        const fcmToken = accountSnap.data()?.fcmToken;
        if (fcmToken) fcmTokens.push(fcmToken);
      }

      if (fcmTokens.length === 0) continue;

      // Construire le message
      const title = reminderType === '30min'
        ? `Votre groupe dans 30 min`
        : reminderType === '15min'
        ? `Votre groupe dans ${minutesLeft} min`
        : 'Votre groupe commence !';
        
      const body = reminderType === '30min'
        ? `"${data.titre}" aura bien lieu, préparez-vous !`
        : reminderType === '15min'
        ? `"${data.titre}" — La salle d'attente est ouverte`
        : `"${data.titre}" — ${participants.length} parent${participants.length > 1 ? 's' : ''} vous attendent`;

      // Envoyer les notifications
      try {
        await admin.messaging().sendEachForMulticast({
          tokens: fcmTokens,
          notification: {
            title,
            body,
          },
          data: {
            link: `/espace/groupes/${doc.id}/vocal`,
            type: 'vocal_reminder',
            groupeId: doc.id,
          },
          webpush: {
            fcmOptions: {
              link: `/espace/groupes/${doc.id}/vocal`,
            },
          },
        });

        console.log(`[Reminders] ${reminderType} sent for ${doc.id} to ${fcmTokens.length} tokens`);
      } catch (err) {
        console.error(`[Reminders] Error sending for ${doc.id}:`, err);
      }

      // Marquer comme envoye
      await dedupRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    return null;
  });

// ========== LIVEKIT — Token pour salle vocale ==========

export const getLiveKitToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Connexion requise');
  }

  const { groupeId, password } = data;
  if (!groupeId || typeof groupeId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'groupeId requis');
  }

  // Vérifier que le groupe existe et que le vocal est accessible
  const db = admin.firestore();
  const groupeRef = db.collection('groupes').doc(groupeId);
  const groupeSnap = await groupeRef.get();

  if (!groupeSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Groupe introuvable');
  }

  const groupe = groupeSnap.data()!;
  const uid = context.auth.uid;
  const isTestGroup = groupe.isTestGroup === true;

  // --- Groupe test : vérifier mot de passe, skip timing ---
  if (isTestGroup) {
    if (groupe.passwordVocal && password !== groupe.passwordVocal) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Mot de passe incorrect'
      );
    }

    // Auto-inscrire le participant s'il ne l'est pas déjà
    const isAlreadyParticipant = (groupe.participants || []).some(
      (p: any) => p.uid === uid
    );
    if (!isAlreadyParticipant) {
      // Récupérer le pseudo pour l'inscription
      const accSnap = await db.collection('accounts').doc(uid).get();
      const accPseudo = accSnap.exists ? accSnap.data()?.pseudo || 'Parent' : 'Parent';

      // Premier vrai inscrit → devient créateur/animateur
      const shouldBecomeCreator =
        groupe.participants.length === 0 ||
        groupe.createurUid === '__test__';

      await groupeRef.update({
        participants: admin.firestore.FieldValue.arrayUnion({
          uid,
          pseudo: accPseudo,
          inscritVocal: true,
          dateInscription: admin.firestore.Timestamp.now(),
        }),
        ...(shouldBecomeCreator ? {
          createurUid: uid,
          createurPseudo: accPseudo,
        } : {}),
      });
    }
  } else {
    // --- Groupe normal : vérifications standard ---

    // Vérifier que l'utilisateur est inscrit
    const isParticipant = (groupe.participants || []).some(
      (p: any) => p.uid === uid
    );
    if (!isParticipant) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Vous devez être inscrit au groupe pour rejoindre le vocal'
      );
    }

    // Vérifier la fenêtre temporelle (15 min avant → 60 min après le début)
    const dateVocal = groupe.dateVocal?.toDate?.() || new Date(groupe.dateVocal);
    const now = Date.now();
    const diff = dateVocal.getTime() - now;
    const minutesBefore = diff / 60000;

    if (minutesBefore > 15) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'La salle ouvre 15 minutes avant le vocal'
      );
    }
    if (minutesBefore < -60) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Le vocal est terminé'
      );
    }
  }

  // Récupérer le pseudo
  const accountSnap = await db.collection('accounts').doc(uid).get();
  const pseudo = accountSnap.exists
    ? accountSnap.data()?.pseudo || 'Parent'
    : 'Parent';

  // Déterminer si l'utilisateur est l'animateur (créateur du groupe ou de remplacement)
  let isAnimateur = false;
  if (isTestGroup) {
     const freshGroupe = (await groupeRef.get()).data()!;
     isAnimateur = freshGroupe.createurUid === uid || freshGroupe.sessionState?.currentAnimateurUid === uid;
  } else {
     isAnimateur = groupe.createurUid === uid || groupe.sessionState?.currentAnimateurUid === uid;
  }

  // Générer le token LiveKit
  const apiKey = functions.config().livekit?.api_key || process.env.LIVEKIT_API_KEY;
  const apiSecret = functions.config().livekit?.api_secret || process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('LiveKit API credentials not configured');
    throw new functions.https.HttpsError(
      'internal',
      'Configuration LiveKit manquante'
    );
  }

  const roomName = `parentaile-${groupeId}`;

  const token = new AccessToken(apiKey, apiSecret, {
    identity: uid,
    name: pseudo,
    ttl: '1h',
    metadata: JSON.stringify({ isAnimateur, groupeId }),
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true, // All participants can send data (raise hand, etc.)
  });

  const jwt = await token.toJwt();

  return {
    token: jwt,
    roomName,
    wsUrl: functions.config().livekit?.url || process.env.LIVEKIT_URL || '',
    isAnimateur,
    pseudo,
  };
});
