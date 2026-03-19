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
  where,
  onSnapshot,
  arrayUnion,
  increment,
  deleteField,
} from 'firebase/firestore';
import type { GroupeParole, MessageGroupe, ThemeGroupe, StructureEtape, EvaluationGroupe, EvaluationPendante, BadgeLevel, ParticipationEntry, UserProgression } from '../types/groupeParole';
import { getBadgeForPoints } from '../types/groupeParole';

export interface CreateGroupeData {
  titre: string;
  description: string;
  theme: ThemeGroupe;
  createurUid: string;
  createurPseudo: string;
  dateVocal: Date;
  structureType: 'libre' | 'structuree';
  structure?: StructureEtape[];
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

  // +30 points pour la création d'un groupe
  addPoints(data.createurUid, 30, {
    groupeId: docRef.id,
    groupeTitre: data.titre,
    date: new Date(),
    type: 'creation',
  }).catch(() => {}); // fire and forget

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
          })),
          messages: [],
          messageCount: d.messageCount || 0,
          passwordVocal: d.passwordVocal,
          isTestGroup: d.isTestGroup || false,
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
  data?: { pseudo?: string; mood?: string; ready?: boolean }
): Promise<void> {
  const presenceRef = doc(db, 'groupes', groupeId, 'presence', uid);
  await setDoc(presenceRef, {
    uid,
    joinedAt: serverTimestamp(),
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
 * Reset le groupe test : vide les participants et remet le créateur à __test__
 * pour que le prochain qui entre devienne animateur.
 */
export async function resetTestGroup(): Promise<void> {
  const ref = doc(db, 'groupes', TEST_GROUP_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  await updateDoc(ref, {
    participants: [],
    createurUid: '__test__',
    createurPseudo: 'Systeme',
  });
  console.log('[RESET] Groupe test vocal réinitialisé');
}

/**
 * Met à jour la configuration du groupe test (thème, structure, durée, titre).
 */
export async function updateTestGroup(config: {
  theme: ThemeGroupe;
  structureType: 'libre' | 'structuree';
  structure?: StructureEtape[];
  durationMin?: number;
  titre?: string;
  createurUid?: string;
  createurPseudo?: string;
}): Promise<void> {
  const ref = doc(db, 'groupes', TEST_GROUP_ID);
  const updates: Record<string, unknown> = {
    theme: config.theme,
    structureType: config.structureType,
    // Reset participants so role assignment works fresh
    participants: [],
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
  await updateDoc(ref, updates);
}
