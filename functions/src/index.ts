import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AccessToken } from 'livekit-server-sdk';

admin.initializeApp();

// ========== LIVEKIT — Token pour salle vocale ==========

export const getLiveKitToken = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Connexion requise');
  }

  const { groupeId } = data;
  if (!groupeId || typeof groupeId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'groupeId requis');
  }

  // Vérifier que le groupe existe et que le vocal est accessible
  const db = admin.firestore();
  const groupeSnap = await db.collection('groupes').doc(groupeId).get();

  if (!groupeSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Groupe introuvable');
  }

  const groupe = groupeSnap.data()!;
  const uid = context.auth.uid;

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

  // Récupérer le pseudo
  const accountSnap = await db.collection('accounts').doc(uid).get();
  const pseudo = accountSnap.exists
    ? accountSnap.data()?.pseudo || 'Parent'
    : 'Parent';

  // Déterminer si l'utilisateur est l'animateur (créateur du groupe)
  const isAnimateur = groupe.createurUid === uid;

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
    canPublishData: isAnimateur,
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
