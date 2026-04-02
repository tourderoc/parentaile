import { db } from './firebase';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  onSnapshot,
  arrayUnion,
  increment,
  deleteField,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import type { GroupeParole, MessageGroupe, ThemeGroupe, StructureEtape, EvaluationGroupe, EvaluationPendante, BadgeLevel, ParticipationEntry, UserProgression } from '../types/groupeParole';
import { getBadgeForPoints, BADGE_THRESHOLDS } from '../types/groupeParole';
import { sendParentNotification } from './parentNotificationService';

export interface CreateGroupeData {
  titre: string;
  description: string;
  theme: ThemeGroupe;
  createurUid: string;
  createurPseudo: string;
  dateVocal: Date;
  structureType: 'libre' | 'structuree';
  structure?: StructureEtape[];
  reprogrammedFromId?: string;
}

/**
 * Crée un nouveau groupe de parole dans Firestore.
 * Le créateur est automatiquement ajouté comme premier participant et inscrit au vocal.
 * L'expiration est calculée à dateCreation + 7 jours.
 */
export async function createGroupeParole(data: CreateGroupeData): Promise<string> {
  const dateExpiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const groupeDoc = {
    titre: data.titre,
    description: data.description,
    theme: data.theme,
    createurUid: data.createurUid,
    createurPseudo: data.createurPseudo,
    dateCreation: serverTimestamp(),
    dateVocal: Timestamp.fromDate(data.dateVocal),
    dateExpiration: Timestamp.fromDate(dateExpiration),
    participantsMax: 5,
    structureType: data.structureType,
    ...(data.structureType === 'structuree' && data.structure
      ? { structure: data.structure }
      : {}),
    status: 'scheduled',
    participants: [
      {
        uid: data.createurUid,
        pseudo: data.createurPseudo,
        inscritVocal: true,
        dateInscription: Timestamp.now(),
      },
    ],
  };

  const docRef = await addDoc(collection(db, 'groupes'), groupeDoc);

  // Si c'est une reprogrammation, mettre à jour l'ancien groupe
  if (data.reprogrammedFromId) {
    try {
      await updateDoc(doc(db, 'groupes', data.reprogrammedFromId), {
        status: 'reprogrammed',
        reprogrammedToId: docRef.id,
      });
    } catch (err) {
      console.error('Erreur mise à jour groupe original:', err);
    }
  }

  // +30 points pour la création d'un groupe
  addPoints(data.createurUid, 30, {
    groupeId: docRef.id,
    groupeTitre: data.titre,
    date: new Date(),
    type: 'creation',
  }).catch(() => {}); // fire and forget

  // Notification de confirmation
  sendParentNotification(
    data.createurUid,
    'group_created',
    'Groupe créé',
    `Votre groupe "${data.titre}" est prêt. Partagez-le pour inviter d'autres parents !`,
    { groupeId: docRef.id, groupeTitre: data.titre }
  );

  return docRef.id;
}

/**
 * Écoute en temps réel les groupes de parole non expirés.
 * Retourne une fonction unsubscribe pour arrêter l'écoute.
 */
export function onGroupesParole(
  callback: (groupes: GroupeParole[]) => void
): () => void {
  const q = query(
    collection(db, 'groupes'),
    orderBy('dateCreation', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const now = new Date();
    const groupes: GroupeParole[] = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          titre: d.titre || '',
          description: d.description || '',
          theme: d.theme || 'autre',
          createurUid: d.createurUid || '',
          createurPseudo: d.createurPseudo || '',
          dateCreation: d.dateCreation?.toDate?.() || new Date(),
          dateVocal: d.dateVocal?.toDate?.() || new Date(),
          dateExpiration: d.dateExpiration?.toDate?.() || new Date(),
          participantsMax: d.participantsMax || 5,
          structureType: d.structureType || 'libre',
          structure: d.structure,
          participants: (d.participants || []).map((p: any) => ({
            uid: p.uid,
            pseudo: p.pseudo,
            inscritVocal: p.inscritVocal ?? false,
            dateInscription: p.dateInscription?.toDate?.() || new Date(),
            banni: !!p.banni
          })),
          messages: [],
          messageCount: d.messageCount || 0,
          passwordVocal: d.passwordVocal,
          isTestGroup: d.isTestGroup || false,
          status: d.status || undefined,
          sessionState: d.sessionState ? {
            currentPhaseIndex: d.sessionState.currentPhaseIndex ?? 0,
            extendedMinutes: d.sessionState.extendedMinutes ?? 0,
            sessionActive: d.sessionState.sessionActive ?? true,
            phaseStartedAt: d.sessionState.phaseStartedAt?.toDate?.() || new Date(),
            sessionStartedAt: d.sessionState.sessionStartedAt?.toDate?.() || new Date(),
          } : undefined,
        } as GroupeParole;
      })
      .filter((g) => g.dateExpiration > now);

    callback(groupes);
  }, (error) => {
    console.error('Erreur chargement groupes:', error);
    callback([]);
  });
}

/**
 * Écoute en temps réel un seul groupe de parole.
 */
export function onGroupeParole(
  groupeId: string,
  callback: (groupe: GroupeParole | null) => void
): () => void {
  return onSnapshot(doc(db, 'groupes', groupeId), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    const d = snapshot.data();
    callback({
      id: snapshot.id,
      titre: d.titre || '',
      description: d.description || '',
      theme: d.theme || 'autre',
      createurUid: d.createurUid || '',
      createurPseudo: d.createurPseudo || '',
      dateCreation: d.dateCreation?.toDate?.() || new Date(),
      dateVocal: d.dateVocal?.toDate?.() || new Date(),
      dateExpiration: d.dateExpiration?.toDate?.() || new Date(),
      participantsMax: d.participantsMax || 5,
      structureType: d.structureType || 'libre',
      structure: d.structure,
      participants: (d.participants || []).map((p: any) => ({
        uid: p.uid,
        pseudo: p.pseudo,
        inscritVocal: p.inscritVocal ?? false,
        dateInscription: p.dateInscription?.toDate?.() || new Date(),
        banni: !!p.banni
      })),
      messages: [],
      messageCount: d.messageCount || 0,
      passwordVocal: d.passwordVocal,
      isTestGroup: d.isTestGroup || false,
    } as GroupeParole);
  }, (error) => {
    console.error('Erreur chargement groupe:', error);
    callback(null);
  });
}

/**
 * Écoute en temps réel les messages d'un groupe (sous-collection).
 */
export function onGroupeMessages(
  groupeId: string,
  callback: (messages: MessageGroupe[]) => void
): () => void {
  const q = query(
    collection(db, 'groupes', groupeId, 'messages'),
    orderBy('dateEnvoi', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const messages: MessageGroupe[] = snapshot.docs.map((d) => ({
      id: d.id,
      auteurUid: d.data().auteurUid || '',
      auteurPseudo: d.data().auteurPseudo || '',
      contenu: d.data().contenu || '',
      dateEnvoi: d.data().dateEnvoi?.toDate?.() || new Date(),
    }));
    callback(messages);
  }, (error) => {
    console.error('Erreur chargement messages:', error);
    callback([]);
  });
}

/**
 * Envoie un message dans un groupe.
 */
export async function sendGroupeMessage(
  groupeId: string,
  message: { auteurUid: string; auteurPseudo: string; contenu: string }
): Promise<string> {
  const docRef = await addDoc(collection(db, 'groupes', groupeId, 'messages'), {
    auteurUid: message.auteurUid,
    auteurPseudo: message.auteurPseudo,
    contenu: message.contenu,
    dateEnvoi: serverTimestamp(),
  });

  await updateDoc(doc(db, 'groupes', groupeId), {
    messageCount: increment(1),
  });

  return docRef.id;
}

/**
 * Supprime un message d'un groupe (modération par le créateur).
 */
export async function deleteGroupeMessage(
  groupeId: string,
  messageId: string
): Promise<void> {
  await deleteDoc(doc(db, 'groupes', groupeId, 'messages', messageId));
  await updateDoc(doc(db, 'groupes', groupeId), {
    messageCount: increment(-1),
  });
}

/**
 * Rejoint un groupe de parole.
 */
export async function rejoindreGroupe(
  groupeId: string,
  participant: { uid: string; pseudo: string }
): Promise<void> {
  await updateDoc(doc(db, 'groupes', groupeId), {
    participants: arrayUnion({
      uid: participant.uid,
      pseudo: participant.pseudo,
      inscritVocal: true,
      dateInscription: Timestamp.now(),
    }),
  });

  // Notifier le créateur du groupe aux jalons importants
  try {
    const groupeSnap = await getDoc(doc(db, 'groupes', groupeId));
    if (groupeSnap.exists()) {
      const data = groupeSnap.data();
      const currentCount = (data.participants || []).length;
      
      if (data.createurUid && data.createurUid !== participant.uid) {
        if (currentCount === 3) {
          const notifId = `milestone_min_${groupeId}_${data.createurUid}`;
          sendParentNotification(
            data.createurUid,
            'group_join',
            'Minimum atteint !',
            `Bonne nouvelle, 3 parents sont inscrits à "${data.titre}", le groupe aura bien lieu.`,
            { groupeId, groupeTitre: data.titre },
            notifId
          );
        } else if (currentCount === data.participantsMax) {
          const notifId = `milestone_full_${groupeId}_${data.createurUid}`;
          sendParentNotification(
            data.createurUid,
            'group_join',
            'Groupe complet !',
            `Le groupe "${data.titre}" est complet (${data.participantsMax} inscrits).`,
            { groupeId, groupeTitre: data.titre },
            notifId
          );
        }
      }
    }
  } catch {
    // Non-bloquant
  }
}

/**
 * Quitte un groupe de parole.
 */
export async function quitterGroupe(
  groupeId: string,
  participantUid: string
): Promise<void> {
  const snapshot = await getDoc(doc(db, 'groupes', groupeId));
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  const updatedParticipants = (data.participants || []).filter(
    (p: any) => p.uid !== participantUid
  );
  await updateDoc(doc(db, 'groupes', groupeId), {
    participants: updatedParticipants,
  });
}

// ========== PRESENCE TEMPS REEL ==========

/**
 * Marque un utilisateur comme present dans la salle d'un groupe.
 * Ecrit dans groupes/{groupeId}/presence/{uid}
 */
export async function setPresence(
  groupeId: string,
  uid: string,
  data?: { pseudo?: string; mood?: string; ready?: boolean; status?: string }
): Promise<void> {
  const presenceRef = doc(db, 'groupes', groupeId, 'presence', uid);
  await setDoc(presenceRef, {
    uid,
    lastSeen: serverTimestamp(),
    ...data,
  }, { merge: true });
}

/**
 * Supprime la presence d'un utilisateur.
 */
export async function removePresence(
  groupeId: string,
  uid: string
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'groupes', groupeId, 'presence', uid));
  } catch {
    // Ignorer si le doc n'existe pas
  }
}

/**
 * Ecoute le nombre de participants presents en temps reel.
 * Retourne une fonction unsubscribe.
 */
export function onPresenceCount(
  groupeId: string,
  callback: (count: number) => void
): () => void {
  return onSnapshot(
    collection(db, 'groupes', groupeId, 'presence'),
    (snapshot) => callback(snapshot.size),
    () => callback(0)
  );
}

/**
 * Retourne la liste complète des présences.
 */
export function onPresenceList(
  groupeId: string,
  callback: (presences: { uid: string; pseudo: string; status?: string; mood?: string; ready?: boolean }[]) => void
): () => void {
  return onSnapshot(
    collection(db, 'groupes', groupeId, 'presence'),
    (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        uid: doc.id,
        pseudo: doc.data().pseudo || '',
        status: doc.data().status,
        mood: doc.data().mood,
        ready: doc.data().ready,
      }));
      callback(list);
    },
    () => callback([])
  );
}

// ========== ÉVALUATIONS ==========

/**
 * Envoie l'évaluation d'un participant pour un groupe.
 * Stockée dans groupes/{groupeId}/evaluations/{uid}
 */
export async function submitEvaluation(
  evaluation: Omit<EvaluationGroupe, 'id' | 'dateEvaluation'>
): Promise<void> {
  const evalDoc: Record<string, unknown> = {
    groupeId: evaluation.groupeId,
    participantUid: evaluation.participantUid,
    participantPseudo: evaluation.participantPseudo,
    noteAmbiance: evaluation.noteAmbiance,
    noteTheme: evaluation.noteTheme,
    noteTechnique: evaluation.noteTechnique,
    dateEvaluation: serverTimestamp(),
  };
  if (evaluation.ressenti) evalDoc.ressenti = evaluation.ressenti;
  if (evaluation.signalement) evalDoc.signalement = evaluation.signalement;
  await setDoc(
    doc(db, 'groupes', evaluation.groupeId, 'evaluations', evaluation.participantUid),
    evalDoc
  );

  // Notifier le créateur du groupe
  try {
    const groupeSnap = await getDoc(doc(db, 'groupes', evaluation.groupeId));
    if (groupeSnap.exists()) {
      const data = groupeSnap.data();
      if (data.createurUid && data.createurUid !== evaluation.participantUid) {
        sendParentNotification(
          data.createurUid,
          'evaluation_received',
          'Nouvel avis reçu',
          `${evaluation.participantPseudo} a donné son avis sur "${data.titre}"`,
          { groupeId: evaluation.groupeId, groupeTitre: data.titre }
        );
      }
    }
  } catch {
    // Non-bloquant
  }
}

/**
 * Marque qu'un participant veut évaluer plus tard.
 * Stocke un doc minimal dans groupes/{groupeId}/evaluations/{uid} avec status 'pending'.
 */
export async function markEvaluationPending(
  groupeId: string,
  participantUid: string,
  participantPseudo: string
): Promise<void> {
  await setDoc(
    doc(db, 'groupes', groupeId, 'evaluations', participantUid),
    {
      groupeId,
      participantUid,
      participantPseudo,
      status: 'pending',
      dateCreation: serverTimestamp(),
    }
  );
}

/**
 * Ignorer une évaluation pendante (le parent ne souhaite pas donner son avis).
 */
export async function dismissEvaluation(
  groupeId: string,
  participantUid: string
): Promise<void> {
  await updateDoc(
    doc(db, 'groupes', groupeId, 'evaluations', participantUid),
    { status: 'dismissed' }
  );
}

/**
 * Vérifie si un participant a déjà évalué un groupe (ou a une évaluation pendante).
 */
export async function getEvaluationStatus(
  groupeId: string,
  participantUid: string
): Promise<'none' | 'pending' | 'done'> {
  try {
    const snap = await getDoc(doc(db, 'groupes', groupeId, 'evaluations', participantUid));
    if (!snap.exists()) return 'none';
    return snap.data().status === 'pending' ? 'pending' : 'done';
  } catch {
    return 'none';
  }
}

/**
 * Récupère les évaluations pendantes d'un utilisateur (tous les groupes non expirés).
 */
export function onPendingEvaluations(
  uid: string,
  callback: (pending: EvaluationPendante[]) => void
): () => void {
  // Listen to all active groups where user is participant
  return onGroupesParole((groupes) => {
    const myGroupes = groupes.filter(
      (g) => g.participants.some((p) => p.uid === uid) || g.createurUid === uid
    );

    // For each group, check if user has a pending evaluation
    const checks = myGroupes.map(async (g) => {
      const status = await getEvaluationStatus(g.id, uid);
      if (status === 'pending') {
        return {
          groupeId: g.id,
          groupeTitre: g.titre,
          groupeTheme: g.theme,
          dateVocal: g.dateVocal,
          dateExpiration: g.dateExpiration,
        } as EvaluationPendante;
      }
      return null;
    });

    Promise.all(checks).then((results) => {
      callback(results.filter((r): r is EvaluationPendante => r !== null));
    });
  });
}

/**
 * Récupère la note moyenne d'un groupe (toutes les évaluations complétées).
 * Retourne null si aucune évaluation.
 */
export async function getGroupeAverageRating(
  groupeId: string
): Promise<{ average: number; count: number } | null> {
  const evalsRef = collection(db, 'groupes', groupeId, 'evaluations');
  const snapshot = await getDocs(evalsRef);

  const completed = snapshot.docs.filter(
    (d) => d.data().status !== 'pending' && d.data().noteAmbiance
  );

  if (completed.length === 0) return null;

  let totalAmbiance = 0;
  let totalTheme = 0;
  let totalTechnique = 0;

  for (const d of completed) {
    const data = d.data();
    totalAmbiance += data.noteAmbiance || 0;
    totalTheme += data.noteTheme || 0;
    totalTechnique += data.noteTechnique || 0;
  }

  const count = completed.length;
  const average = (totalAmbiance + totalTheme + totalTechnique) / (count * 3);

  return { average: Math.round(average * 10) / 10, count };
}

/**
 * Écoute en temps réel la note moyenne d'un groupe.
 */
export function onGroupeRating(
  groupeId: string,
  callback: (rating: { average: number; count: number } | null) => void
): () => void {
  const evalsRef = collection(db, 'groupes', groupeId, 'evaluations');
  return onSnapshot(evalsRef, (snapshot) => {
    const completed = snapshot.docs.filter(
      (d) => d.data().status !== 'pending' && d.data().noteAmbiance
    );

    if (completed.length === 0) {
      callback(null);
      return;
    }

    let totalAmbiance = 0;
    let totalTheme = 0;
    let totalTechnique = 0;

    for (const d of completed) {
      const data = d.data();
      totalAmbiance += data.noteAmbiance || 0;
      totalTheme += data.noteTheme || 0;
      totalTechnique += data.noteTechnique || 0;
    }

    const count = completed.length;
    const average = (totalAmbiance + totalTheme + totalTechnique) / (count * 3);
    callback({ average: Math.round(average * 10) / 10, count });
  }, () => {
    // Firestore rules may not allow reading evaluations — fail silently
    callback(null);
  });
}

// ========== POINTS & BADGES ==========

/**
 * Ajoute des points à un utilisateur et enregistre l'entrée dans l'historique.
 * Met à jour le badge automatiquement.
 */
export async function addPoints(
  uid: string,
  points: number,
  entry: Omit<ParticipationEntry, 'points'>
): Promise<void> {
  const ref = doc(db, 'accounts', uid);
  try {
    await updateDoc(ref, {
      points: increment(points),
      participationHistory: arrayUnion({
        ...entry,
        points,
        date: Timestamp.now(),
      }),
    });
    // Update badge based on new points total
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const newPoints = snap.data().points || 0;
      const newBadge = getBadgeForPoints(newPoints);
      const currentBadge = snap.data().badge || 'none';
      if (newBadge !== currentBadge) {
        await updateDoc(ref, { badge: newBadge });
        // Notifier le badge obtenu
        const badgeInfo = BADGE_THRESHOLDS.find(b => b.level === newBadge);
        if (badgeInfo) {
          sendParentNotification(
            uid,
            'badge_earned',
            `Badge "${badgeInfo.label}" obtenu !`,
            `Félicitations ! Vous avez atteint ${newPoints} points et obtenu le badge ${badgeInfo.label}.`
          );
        }
      }
    }
  } catch {
    // Account may not have these fields yet — initialize them
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const currentPoints = data.points || 0;
      const newPoints = currentPoints + points;
      await updateDoc(ref, {
        points: newPoints,
        badge: getBadgeForPoints(newPoints),
        participationHistory: [
          ...(data.participationHistory || []),
          { ...entry, points, date: Timestamp.now() },
        ],
      });
    }
  }
}

/**
 * Récupère la progression d'un utilisateur (points, badge, historique).
 */
export async function getUserProgression(uid: string): Promise<UserProgression> {
  try {
    const snap = await getDoc(doc(db, 'accounts', uid));
    if (!snap.exists()) return { points: 0, badge: 'none', history: [] };
    const data = snap.data();
    return {
      points: data.points || 0,
      badge: (data.badge as BadgeLevel) || getBadgeForPoints(data.points || 0),
      history: (data.participationHistory || []).map((h: any) => ({
        groupeId: h.groupeId || '',
        groupeTitre: h.groupeTitre || '',
        date: h.date?.toDate?.() || new Date(),
        type: h.type || 'participation',
        points: h.points || 0,
      })),
    };
  } catch {
    return { points: 0, badge: 'none', history: [] };
  }
}

/**
 * Écoute en temps réel la progression d'un utilisateur.
 */
export function onUserProgression(
  uid: string,
  callback: (prog: UserProgression) => void
): () => void {
  return onSnapshot(doc(db, 'accounts', uid), (snap) => {
    if (!snap.exists()) {
      callback({ points: 0, badge: 'none', history: [] });
      return;
    }
    const data = snap.data();
    callback({
      points: data.points || 0,
      badge: (data.badge as BadgeLevel) || getBadgeForPoints(data.points || 0),
      history: (data.participationHistory || []).map((h: any) => ({
        groupeId: h.groupeId || '',
        groupeTitre: h.groupeTitre || '',
        date: h.date?.toDate?.() || new Date(),
        type: h.type || 'participation',
        points: h.points || 0,
      })),
    });
  }, () => {
    callback({ points: 0, badge: 'none', history: [] });
  });
}

/**
 * Récupère le badge d'un utilisateur (lecture rapide pour la salle vocale).
 */
export async function getUserBadge(uid: string): Promise<BadgeLevel> {
  try {
    const snap = await getDoc(doc(db, 'accounts', uid));
    if (!snap.exists()) return 'none';
    const data = snap.data();
    return (data.badge as BadgeLevel) || getBadgeForPoints(data.points || 0);
  } catch {
    return 'none';
  }
}

// ========== ROBUSTESSE ET CYCLE DE VIE (PHASE 1) ==========

/**
 * Annule un groupe de parole et notifie les inscrits.
 */
export async function cancelGroup(groupeId: string, reason: string): Promise<void> {
  const ref = doc(db, 'groupes', groupeId);
  let shouldNotify = false;
  let participantsToNotify: any[] = [];
  let groupTitre = '';

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    // Idempotency: skip if already terminal
    if (data.status === 'cancelled' || data.status === 'completed') return;

    // Execute update atomically
    const updates: Record<string, any> = {
      status: 'cancelled',
      cancelReason: reason,
    };

    // Si sessionState n'existe pas encore (groupe jamais démarré), on l'initialise en terminal
    if (!data.sessionState) {
      updates.sessionState = {
        sessionActive: false,
        suspended: false,
        suspensionCount: 0,
        currentPhaseIndex: 0,
        replacementUsed: false,
      };
    } else {
      updates['sessionState.sessionActive'] = false;
    }

    transaction.update(ref, updates);

    // Capture context for post-transaction notifications
    shouldNotify = true;
    participantsToNotify = data.participants || [];
    groupTitre = data.titre || 'Groupe de parole';
  });

  // Send notifications only AFTER the transaction successfully commits
  if (shouldNotify) {
    for (const p of participantsToNotify) {
      if (!p.uid) continue;

      // Deterministic ID: ensures that even with simultaneous triggers, 
      // only ONE notification document is created/updated per participant.
      const notifId = `cancel_${groupeId}_${p.uid}`;

      sendParentNotification(
        p.uid,
        'group_cancelled',
        'Groupe annulé',
        `Le groupe "${groupTitre}" n'aura malheureusement pas lieu (${reason}).`,
        { groupeId, groupeTitre: groupTitre },
        notifId
      ).catch(() => {});
    }
  }
}

/**
 * Suspend une session en cours.
 */
export async function suspendSession(
  groupeId: string,
  reason: 'animateur_left' | 'below_minimum'
): Promise<void> {
  const ref = doc(db, 'groupes', groupeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.status === 'cancelled' || data.status === 'completed') return; // Garde terminale

  const state = data.sessionState;
  if (!state) return;

  if (state.suspended) return; // Déjà suspendu

  const count = state.suspensionCount || 0;
  
  if (count >= 2 || (state.replacementUsed && reason === 'animateur_left')) {
    // Si c'est la 3ème tentative de suspension OU l'animateur de remplacement vient de partir
    // => Fin automatique pure et simple
    await updateDoc(ref, {
      status: 'completed',
      'sessionState.sessionActive': false,
    });
    return;
  }

  await updateDoc(ref, {
    'sessionState.suspended': true,
    'sessionState.suspendedAt': serverTimestamp(),
    'sessionState.suspensionReason': reason,
    'sessionState.suspensionCount': count + 1,
  });
}

/**
 * Reprend une session suspendue.
 */
export async function resumeSession(groupeId: string): Promise<void> {
  const ref = doc(db, 'groupes', groupeId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const status = snap.data().status;
    if (status === 'cancelled' || status === 'completed') return;
  }
  await updateDoc(ref, {
    'sessionState.suspended': false,
    'sessionState.suspendedAt': deleteField(),
    'sessionState.suspensionReason': deleteField(),
  });
}

/**
 * Initialisation V2 du state de la salle vocale avec tracking du role d'animateur.
 */
export async function initSessionStateV2(
  groupeId: string,
  animateurUid: string,
  animateurPseudo: string
): Promise<void> {
  const ref = doc(db, 'groupes', groupeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  // Ne pas réinitialiser si le groupe est déjà en cours, terminé ou annulé
  if (data.status === 'in_progress' || data.status === 'completed' || data.status === 'cancelled') {
    console.warn(`[SERVICE] initSessionStateV2 ignored: group ${groupeId} is already ${data.status}`);
    return;
  }

  // Ne pas réinitialiser si la session est déjà ACTIVE (ex: relay déjà pris)
  if (data.sessionState?.sessionActive) {
    console.warn(`[SERVICE] initSessionStateV2 ignored: session is already active for ${groupeId}`);
    return;
  }

  await updateDoc(ref, {
    status: 'in_progress',
    sessionState: {
      currentPhaseIndex: 0,
      extendedMinutes: 0,
      sessionActive: true,
      phaseStartedAt: serverTimestamp(),
      sessionStartedAt: serverTimestamp(),
      suspended: false,
      suspensionCount: 0,
      replacementUsed: false,
      currentAnimateurUid: animateurUid,
      currentAnimateurPseudo: animateurPseudo,
    },
  });
}

/**
 * Transaction pour proposer de reprendre l'animation du groupe.
 */
export async function proposeAsAnimateur(
  groupeId: string,
  uid: string,
  pseudo: string
): Promise<boolean> {
  const ref = doc(db, 'groupes', groupeId);
  
  try {
    await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(ref);
      if (!docSnap.exists()) throw new Error('Groupe inexistant');

      const data = docSnap.data();
      if (data.status === 'cancelled' || data.status === 'completed') throw new Error('Groupe terminé');
      const state = data.sessionState;

      if (state?.replacementUsed) throw new Error('Remplacement déjà utilisé');

      if (!state) {
        // L'animateur original n'a jamais lance — on cree le sessionState
        transaction.update(ref, {
          sessionState: {
            currentPhaseIndex: 0,
            extendedMinutes: 0,
            sessionActive: true,
            phaseStartedAt: serverTimestamp(),
            sessionStartedAt: serverTimestamp(),
            suspended: false,
            suspensionCount: 0,
            replacementUsed: true,
            currentAnimateurUid: uid,
            currentAnimateurPseudo: pseudo,
          },
          status: 'in_progress',
        });
      } else {
        // Session existante — mise a jour atomique préservant la progression
        transaction.update(ref, {
          'sessionState.currentAnimateurUid': uid,
          'sessionState.currentAnimateurPseudo': pseudo,
          'sessionState.replacementUsed': true,
          'sessionState.suspended': false,
          'sessionState.suspendedAt': deleteField(),
          'sessionState.suspensionReason': deleteField(),
          'sessionState.sessionActive': true,
          // IMPORTANT: we do NOT touch currentPhaseIndex or phaseStartedAt here
          // unless phaseStartedAt needs to be refreshed to reset the local phase timer
          'sessionState.phaseStartedAt': serverTimestamp(), 
        });
      }
    });
    return true; // Sucesss
  } catch (err) {
    console.error("ProposeAnimateur echouée:", err);
    return false; // Transaction ratée
  }
}

/**
 * Incrémente le compteur de déconnexions de l'animateur.
 * Retourne le nouveau count.
 */
export async function incrementAnimateurDisconnect(groupeId: string): Promise<number> {
  const ref = doc(db, 'groupes', groupeId);
  let newCount = 0;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    const state = snap.data().sessionState;
    newCount = (state?.animateurDisconnectCount || 0) + 1;
    transaction.update(ref, {
      'sessionState.animateurDisconnectCount': newCount,
    });
  });
  return newCount;
}

// ========== GROUPE TEST ==========
const TEST_GROUP_ID = 'groupe-test-vocal';

/**
 * Seed un groupe de parole test dans Firestore s'il n'existe pas déjà.
 * - Pas de contrainte horaire (isTestGroup = true)
 * - Mot de passe : "tunisien"
 * - Expiration en 2027
 * - Le premier inscrit devient le créateur
 */
export async function seedTestGroup(): Promise<void> {
  const ref = doc(db, 'groupes', TEST_GROUP_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Créer le groupe test
    await setDoc(ref, {
      titre: 'Salle de test vocal',
      description:
        'Groupe de test pour vérifier le fonctionnement de la salle vocale. Acces par mot de passe.',
      theme: 'autre',
      createurUid: '__test__',
      createurPseudo: 'Systeme',
      dateCreation: serverTimestamp(),
      dateVocal: Timestamp.fromDate(new Date('2027-01-01T00:00:00')),
      dateExpiration: Timestamp.fromDate(new Date('2027-12-31T23:59:59')),
      participantsMax: 5,
      structureType: 'libre',
      participants: [],
      isTestGroup: true,
      passwordVocal: 'tunisien',
    });
    console.log('[SEED] Groupe test vocal créé:', TEST_GROUP_ID);
  }
}

/**
 * Reset complet du groupe test : participants, sessionState, presence, evaluations, status.
 */
export async function resetTestGroup(): Promise<void> {
  const ref = doc(db, 'groupes', TEST_GROUP_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  // Clear subcollections: presence, evaluations, notifications_sent
  const batch = writeBatch(db);
  for (const sub of ['presence', 'evaluations', 'notifications_sent']) {
    const subSnap = await getDocs(collection(db, 'groupes', TEST_GROUP_ID, sub));
    subSnap.docs.forEach((d) => batch.delete(d.ref));
  }
  await batch.commit();

  await updateDoc(ref, {
    participants: [],
    createurUid: '__test__',
    createurPseudo: 'Systeme',
    status: deleteField(),
    sessionState: deleteField(),
  });
  console.log('[RESET] Groupe test vocal réinitialisé (complet)');
}

/**
 * Met à jour la configuration du groupe test.
 */
export async function updateTestGroup(config: {
  theme: ThemeGroupe;
  structureType: 'libre' | 'structuree';
  structure?: StructureEtape[];
  durationMin?: number;
  titre?: string;
  createurUid?: string;
  createurPseudo?: string;
  dateVocal?: Date;
  status?: string;
  fakeParticipantCount?: number;
}): Promise<void> {
  const ref = doc(db, 'groupes', TEST_GROUP_ID);
  const updates: Record<string, unknown> = {
    theme: config.theme,
    structureType: config.structureType,
  };
  if (config.structureType === 'structuree' && config.structure) {
    updates.structure = config.structure;
    updates.durationMin = deleteField();
  } else {
    updates.structure = deleteField();
    if (config.durationMin) updates.durationMin = config.durationMin;
  }
  if (config.titre) updates.titre = config.titre;
  if (config.createurUid) {
    updates.createurUid = config.createurUid;
    updates.createurPseudo = config.createurPseudo || 'Parent';
  }
  if (config.dateVocal) {
    updates.dateVocal = Timestamp.fromDate(config.dateVocal);
  }
  if (config.status) {
    updates.status = config.status;
  } else {
    updates.status = deleteField();
  }

  // Build participants array with fakes
  const fakeCount = config.fakeParticipantCount ?? 0;
  const fakeParticipants = Array.from({ length: fakeCount }, (_, i) => ({
    uid: `fake-parent-${i + 1}`,
    pseudo: `Parent ${i + 1}`,
    inscritVocal: true,
    dateInscription: new Date(),
  }));
  updates.participants = fakeParticipants;

  await updateDoc(ref, updates);
}

/**
 * Ajoute des presences fictives dans la subcollection presence du groupe test.
 */
export async function addFakePresences(count: number): Promise<void> {
  // Clear existing presences first
  const presSnap = await getDocs(collection(db, 'groupes', TEST_GROUP_ID, 'presence'));
  const batch = writeBatch(db);
  presSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  // Add fake presences
  for (let i = 0; i < count; i++) {
    const uid = `fake-parent-${i + 1}`;
    await setDoc(doc(db, 'groupes', TEST_GROUP_ID, 'presence', uid), {
      uid,
      pseudo: `Parent ${i + 1}`,
      joinedAt: serverTimestamp(),
      mood: ['😊', '😐', '😔', '💪', '🤗'][i % 5],
    });
  }
}

/**
 * Simule un sessionState specifique sur le groupe test.
 */
export async function simulateSessionState(state: {
  suspended?: boolean;
  suspensionReason?: 'animateur_left' | 'below_minimum';
  suspensionCount?: number;
  sessionActive?: boolean;
}): Promise<void> {
  const updates: Record<string, unknown> = {
    'sessionState.currentPhaseIndex': 0,
    'sessionState.extendedMinutes': 0,
    'sessionState.sessionActive': state.sessionActive ?? true,
    'sessionState.phaseStartedAt': serverTimestamp(),
    'sessionState.sessionStartedAt': serverTimestamp(),
  };
  if (state.suspended !== undefined) updates['sessionState.suspended'] = state.suspended;
  if (state.suspensionReason) updates['sessionState.suspensionReason'] = state.suspensionReason;
  if (state.suspensionCount !== undefined) updates['sessionState.suspensionCount'] = state.suspensionCount;

  await updateDoc(doc(db, 'groupes', TEST_GROUP_ID), updates);
}

// ========== Signalement de bannissement ==========

export async function submitBanFeedback(
  groupeId: string,
  participantUid: string,
  participantPseudo: string,
  feedback: string
): Promise<void> {
  await addDoc(collection(db, 'banReports'), {
    groupeId,
    participantUid,
    participantPseudo,
    feedback,
    dateReport: serverTimestamp(),
    reviewed: false,
  });
}

// ========== Session vocale en temps réel ==========

// initSessionState supprimée — remplacée par initSessionStateV2 (avec tracking animateur)

export async function advancePhase(groupeId: string, newIndex: number): Promise<void> {
  await updateDoc(doc(db, 'groupes', groupeId), {
    'sessionState.currentPhaseIndex': newIndex,
    'sessionState.phaseStartedAt': serverTimestamp(),
  });
}

export async function extendSession(groupeId: string, extraMinutes: number): Promise<void> {
  await updateDoc(doc(db, 'groupes', groupeId), {
    'sessionState.extendedMinutes': extraMinutes,
  });
}

export async function endSession(groupeId: string): Promise<void> {
  const ref = doc(db, 'groupes', groupeId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const status = snap.data().status;
    if (status === 'cancelled' || status === 'completed') return; // Garde terminale
  }
  await updateDoc(ref, {
    'sessionState.sessionActive': false,
    status: 'completed',
  });
}

// ========== PARTICIPANT EXITS (PHASE 5 REFACTOR) ==========

/**
 * Incrémente atomiquement le compteur de sorties d'un participant.
 * Si le count dépasse le seuil (2), marque le participant comme banni.
 * Retourne le nouveau count.
 */
export async function incrementParticipantExit(
  groupeId: string,
  uid: string
): Promise<number> {
  const exitRef = doc(db, 'groupes', groupeId, 'participantExits', uid);
  let newCount = 0;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(exitRef);
    if (snap.exists()) {
      newCount = (snap.data().count || 0) + 1;
      const banned = newCount > 2; // MAX_PARTICIPANT_EXITS = 2
      transaction.update(exitRef, {
        count: newCount,
        lastExitAt: serverTimestamp(),
        ...(banned ? { banned: true } : {}),
      });
    } else {
      newCount = 1;
      transaction.set(exitRef, {
        count: 1,
        lastExitAt: serverTimestamp(),
        banned: false,
      });
    }
  });

  return newCount;
}

/**
 * Vérifie si un participant est banni d'un groupe.
 * Lecture rapide du flag banned dans participantExits/{uid}.
 */
export async function isParticipantBanned(
  groupeId: string,
  uid: string
): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'groupes', groupeId, 'participantExits', uid));
    if (!snap.exists()) return false;
    return snap.data().banned === true;
  } catch {
    return false;
  }
}

/**
 * Banni explicitement de maniere permanente un participant (Action animateur).
 * Modifie le sous-document participantExits ET met le flag banni:true dans l'array participants du groupe.
 */
export async function banParticipantExplicit(
  groupeId: string,
  uid: string
): Promise<void> {
  // 1. Marquer comme banni dans participantExits
  const exitRef = doc(db, 'groupes', groupeId, 'participantExits', uid);
  await setDoc(exitRef, {
    count: 3,
    lastExitAt: serverTimestamp(),
    banned: true,
  }, { merge: true });

  // 2. Mettre à jour l'array participants pour propager l'état banni immédiatement (UI + Banner)
  const groupeRef = doc(db, 'groupes', groupeId);
  const snap = await getDoc(groupeRef);
  if (snap.exists()) {
    const groupeData = snap.data();
    const participants = groupeData.participants || [];
    const updatedParticipants = participants.map((p: any) =>
      p.uid === uid ? { ...p, banni: true } : p
    );
    await updateDoc(groupeRef, { participants: updatedParticipants });

    // 3. Notifier le banni
    const groupeTitre: string = groupeData.titre || 'ce groupe';
    await sendParentNotification(
      uid,
      'group_banned',
      'Vous avez été exclu du groupe',
      `Vous avez été définitivement banni du groupe "${groupeTitre}" par l'animateur.`,
      { groupeId, groupeTitre }
    );
  }
}

