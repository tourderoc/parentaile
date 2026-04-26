import { db } from './firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import type { 
  GroupeParole, MessageGroupe, ThemeGroupe, StructureEtape, 
  EvaluationGroupe, EvaluationPendante, BadgeLevel, 
  ParticipationEntry, UserProgression 
} from '../types/groupeParole';
import { getBadgeForPoints, BADGE_THRESHOLDS } from '../types/groupeParole';
import { accountStorage } from './accountStorage';
import { groupStorage } from './groupStorage';
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
  const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  const groupeDoc = {
    id: id,
    titre: data.titre,
    description: data.description,
    theme: data.theme,
    createurUid: data.createurUid,
    createurPseudo: data.createurPseudo,
    dateVocal: data.dateVocal,
    dateExpiration: dateExpiration,
    participantsMax: 5,
    structureType: data.structureType,
    structure: data.structure || [],
  };

  const createdId = await groupStorage.createGroup(groupeDoc);

  // Si c'est une reprogrammation, mettre à jour l'ancien groupe
  if (data.reprogrammedFromId) {
    try {
      await groupStorage.updateGroup(data.reprogrammedFromId, {
        status: 'reprogrammed',
        reprogrammedToId: id,
      });
    } catch (err) {
      console.error('Erreur mise à jour groupe original:', err);
    }
  }

  // +30 points pour la création d'un groupe
  addPoints(data.createurUid, 30, {
    groupeId: id,
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
    { groupeId: id, groupeTitre: data.titre }
  );

  return id;
}

/**
 * Écoute en temps réel les groupes de parole non expirés.
 * Filtre : groupes des 3 derniers jours + futurs (max 100).
 * Retourne une fonction unsubscribe pour arrêter l'écoute.
 */
export function onGroupesParole(
  callback: (groupes: GroupeParole[]) => void
): () => void {
  const poll = async () => {
    try {
      const groups = await groupStorage.listGroups();
      callback(groups);
    } catch (err) {
      console.error('Erreur Polling Groupes:', err);
    }
  };
  poll();
  const interval = setInterval(poll, 3000);
  return () => clearInterval(interval);
}

/**
 * Écoute en temps réel un seul groupe de parole.
 */
export function onGroupeParole(
  groupeId: string,
  callback: (groupe: GroupeParole | null) => void
): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  const poll = async () => {
    try {
      const group = await groupStorage.getGroup(groupeId);
      callback(group);
      if (group === null && interval) {
        clearInterval(interval);
        interval = null;
      }
    } catch (err) {
      console.error('Erreur Polling Groupe Unique:', err);
    }
  };
  poll();
  interval = setInterval(poll, 5000);
  return () => { if (interval) clearInterval(interval); };
}

/**
 * Écoute en temps réel les messages d'un groupe (sous-collection).
 */
export function onGroupeMessages(
  groupeId: string,
  callback: (messages: MessageGroupe[]) => void
): () => void {
  const poll = async () => {
    try {
      const msgs = await groupStorage.listMessages(groupeId);
      callback(msgs);
    } catch (err) {
      console.error('Erreur Polling Messages:', err);
    }
  };
  poll();
  const interval = setInterval(poll, 3000);
  return () => clearInterval(interval);
}

/**
 * Envoie un message dans un groupe.
 */
export async function sendGroupeMessage(
  groupeId: string,
  message: { auteurUid: string; auteurPseudo: string; contenu: string }
): Promise<string> {
  return groupStorage.sendMessage(groupeId, message);
}

/**
 * Supprime un message d'un groupe (modération par le créateur).
 */
export async function deleteGroupeMessage(
  groupeId: string,
  messageId: string
): Promise<void> {
  await groupStorage.deleteMessage(groupeId, messageId);
}

/**
 * Rejoint un groupe de parole.
 */
export async function rejoindreGroupe(
  groupeId: string,
  participant: { uid: string; pseudo: string }
): Promise<void> {
  await groupStorage.joinGroup(groupeId, participant);

  // Notifier le créateur du groupe aux jalons importants (3 inscrits = minimum
  // atteint, N inscrits = complet). Fonctionne sur les deux backends via
  // l'abstraction groupStorage — pas de lecture directe de Firestore.
  try {
    const groupe = await groupStorage.getGroup(groupeId);
    if (groupe && groupe.createurUid && groupe.createurUid !== participant.uid) {
      const currentCount = (groupe.participants || []).length;
      if (currentCount === 3) {
        const notifId = `milestone_min_${groupeId}_${groupe.createurUid}`;
        sendParentNotification(
          groupe.createurUid,
          'group_join',
          'Minimum atteint !',
          `Bonne nouvelle, 3 parents sont inscrits à "${groupe.titre}", le groupe aura bien lieu.`,
          { groupeId, groupeTitre: groupe.titre },
          notifId
        );
      } else if (currentCount === groupe.participantsMax) {
        const notifId = `milestone_full_${groupeId}_${groupe.createurUid}`;
        sendParentNotification(
          groupe.createurUid,
          'group_join',
          'Groupe complet !',
          `Le groupe "${groupe.titre}" est complet (${groupe.participantsMax} inscrits).`,
          { groupeId, groupeTitre: groupe.titre },
          notifId
        );
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
  await groupStorage.leaveGroup(groupeId, participantUid);
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
    ...evaluation,
    dateEvaluation: new Date().toISOString(),
  };
  
  await groupStorage.submitEvaluation(evaluation.groupeId, evalDoc);

  // Notifier le créateur du groupe
  try {
    const groupe = await groupStorage.getGroup(evaluation.groupeId);
    if (groupe && groupe.createurUid && groupe.createurUid !== evaluation.participantUid) {
      sendParentNotification(
        groupe.createurUid,
        'evaluation_received',
        'Nouvel avis reçu',
        `${evaluation.participantPseudo} a donné son avis sur "${groupe.titre}"`,
        { groupeId: evaluation.groupeId, groupeTitre: groupe.titre }
      );
    }
  } catch {
    // Non-bloquant
  }
}

export async function markEvaluationPending(
  groupeId: string,
  participantUid: string,
  participantPseudo: string
): Promise<void> {
  await groupStorage.submitEvaluation(groupeId, {
    groupeId,
    participantUid,
    participantPseudo,
    status: 'pending',
    dateCreation: new Date().toISOString(),
  });
}

export async function dismissEvaluation(
  groupeId: string,
  participantUid: string
): Promise<void> {
  await groupStorage.submitEvaluation(groupeId, {
    participantUid,
    status: 'dismissed'
  });
}

export async function getEvaluationStatus(
  groupeId: string,
  participantUid: string
): Promise<'none' | 'pending' | 'done'> {
  return groupStorage.getEvaluationStatus(groupeId, participantUid);
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
 */
export async function getGroupeAverageRating(
  groupeId: string
): Promise<{ average: number; count: number } | null> {
  return groupStorage.getEvaluationsAverage(groupeId);
}

/**
 * Écoute la note moyenne d'un groupe (polling 30s).
 */
export function onGroupeRating(
  groupeId: string,
  callback: (rating: { average: number; count: number } | null) => void
): () => void {
  const poll = async () => {
    const result = await groupStorage.getEvaluationsAverage(groupeId);
    callback(result);
  };
  poll();
  const interval = setInterval(poll, 30000);
  return () => clearInterval(interval);
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
  try {
    const account = await accountStorage.getAccount(uid);
    const currentPoints = account ? (account.points || 0) : 0;
    const currentHistory = account ? (account.participationHistory || account.participation_history || []) : [];
    
    const newPoints = currentPoints + points;
    const newBadge = getBadgeForPoints(newPoints);
    
    // Add entry with a raw string date for compatibility
    const newEntry = {
      ...entry,
      points,
      date: new Date().toISOString()
    };
    
    await accountStorage.updateAccount(uid, {
      points: newPoints,
      badge: newBadge,
      participation_history: [...currentHistory, newEntry]
    });

    if (account) {
      const currentBadge = account.badge || 'none';
      if (newBadge !== currentBadge) {
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
  } catch (err) {
    console.error('Erreur addPoints:', err);
  }
}

/**
 * Récupère la progression d'un utilisateur (points, badge, historique).
 */
export async function getUserProgression(uid: string): Promise<UserProgression> {
  try {
    const account = await accountStorage.getAccount(uid);
    if (!account) return { points: 0, badge: 'none', history: [] };
    
    return {
      points: account.points || 0,
      badge: (account.badge as BadgeLevel) || getBadgeForPoints(account.points || 0),
      history: (account.participationHistory || account.participation_history || []).map((h: any) => ({
        groupeId: h.groupeId || '',
        groupeTitre: h.groupeTitre || '',
        date: typeof h.date === 'string' ? new Date(h.date) : (h.date?.toDate?.() || new Date()),
        type: h.type || 'participation',
        points: h.points || 0,
      })),
    };
  } catch {
    return { points: 0, badge: 'none', history: [] };
  }
}

/**
 * Écoute la progression d'un utilisateur (polling 30s).
 */
export function onUserProgression(
  uid: string,
  callback: (prog: UserProgression) => void
): () => void {
  const poll = async () => {
    const prog = await getUserProgression(uid);
    callback(prog);
  };
  poll();
  const interval = setInterval(poll, 30000);
  return () => clearInterval(interval);
}

/**
 * Récupère le badge d'un utilisateur (lecture rapide pour la salle vocale).
 */
export async function getUserBadge(uid: string): Promise<BadgeLevel> {
  try {
    const account = await accountStorage.getAccount(uid);
    if (!account) return 'none';
    return (account.badge as BadgeLevel) || getBadgeForPoints(account.points || 0);
  } catch {
    return 'none';
  }
}

// ========== ROBUSTESSE ET CYCLE DE VIE (PHASE 1) ==========

/**
 * Annule un groupe de parole et notifie les inscrits.
 */
export async function cancelGroup(groupeId: string, reason: string): Promise<void> {
  const current = await groupStorage.getGroup(groupeId);
  if (!current) return;
  if (current.status === 'cancelled' || current.status === 'completed') return;

  const sessionStatePatch = current.sessionState
    ? { ...current.sessionState, sessionActive: false }
    : { sessionActive: false, suspended: false, suspensionCount: 0, currentPhaseIndex: 0, replacementUsed: false };

  await groupStorage.updateGroup(groupeId, {
    status: 'cancelled',
    cancel_reason: reason,
    cancelReason: reason,
    session_state: sessionStatePatch,
  });

  for (const p of current.participants || []) {
    if (!p.uid) continue;
    const notifId = `cancel_${groupeId}_${p.uid}`;
    sendParentNotification(
      p.uid,
      'group_cancelled',
      'Groupe annulé',
      `Le groupe "${current.titre}" n'aura malheureusement pas lieu (${reason}).`,
      { groupeId, groupeTitre: current.titre },
      notifId
    ).catch(() => {});
  }
}

/**
 * Suspend une session en cours.
 */
export async function suspendSession(
  groupeId: string,
  reason: 'animateur_left' | 'below_minimum'
): Promise<void> {
  const current = await groupStorage.getGroup(groupeId);
  if (!current) return;
  if (current.status === 'cancelled' || current.status === 'completed') return;

  const state = current.sessionState;
  if (!state) return;
  if (state.suspended) return; // Déjà suspendu

  const count = state.suspensionCount ?? 0;

  if (count >= 2 || (state.replacementUsed && reason === 'animateur_left')) {
    // 3ème tentative ou animateur de remplacement parti → fin automatique
    await groupStorage.updateGroup(groupeId, {
      status: 'completed',
      session_state: { ...state, sessionActive: false },
    });
    return;
  }

  await groupStorage.updateSessionState(groupeId, {
    ...state,
    suspended: true,
    suspendedAt: new Date().toISOString(),
    suspensionReason: reason,
    suspensionCount: count + 1,
  });
}

/**
 * Reprend une session suspendue.
 */
export async function resumeSession(groupeId: string): Promise<void> {
  const current = await groupStorage.getGroup(groupeId);
  if (!current) return;
  if (current.status === 'cancelled' || current.status === 'completed') return;
  if (!current.sessionState) return;

  const { suspendedAt: _a, suspensionReason: _b, ...rest } = current.sessionState as any;
  await groupStorage.updateSessionState(groupeId, {
    ...rest,
    suspended: false,
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
  const current = await groupStorage.getGroup(groupeId);
  if (!current) return;

  // Ne pas réinitialiser si le groupe est déjà en cours, terminé ou annulé
  if (current.status === 'in_progress' || current.status === 'completed' || current.status === 'cancelled') {
    console.warn(`[SERVICE] initSessionStateV2 ignored: group ${groupeId} is already ${current.status}`);
    return;
  }

  // Ne pas réinitialiser si la session est déjà ACTIVE
  if (current.sessionState?.sessionActive) {
    console.warn(`[SERVICE] initSessionStateV2 ignored: session is already active`);
    return;
  }

  await groupStorage.updateGroup(groupeId, {
    status: 'in_progress',
    session_state: {
      currentPhaseIndex: 0,
      extendedMinutes: 0,
      sessionActive: true,
      phaseStartedAt: new Date().toISOString(),
      sessionStartedAt: new Date().toISOString(),
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
  try {
    const current = await groupStorage.getGroup(groupeId);
    if (!current) throw new Error('Groupe inexistant');

    if (current.status === 'cancelled' || current.status === 'completed') throw new Error('Groupe terminé');
    const state = current.sessionState;

    if (state?.replacementUsed) throw new Error('Remplacement déjà utilisé');

    if (!state) {
      // Pas de session lancée
      await groupStorage.updateGroup(groupeId, {
        session_state: {
          currentPhaseIndex: 0,
          extendedMinutes: 0,
          sessionActive: true,
          phaseStartedAt: new Date().toISOString(),
          sessionStartedAt: new Date().toISOString(),
          suspended: false,
          suspensionCount: 0,
          replacementUsed: true,
          currentAnimateurUid: uid,
          currentAnimateurPseudo: pseudo,
        },
        status: 'in_progress',
      });
    } else {
      // Session déjà en cours
      await groupStorage.updateGroup(groupeId, {
        session_state: {
            ...state,
            currentAnimateurUid: uid,
            currentAnimateurPseudo: pseudo,
            replacementUsed: true,
            suspended: false,
            phaseStartedAt: new Date().toISOString(),
            sessionActive: true
        }
      });
    }
    return true;
  } catch (err) {
    console.error("ProposeAnimateur echouée:", err);
    return false;
  }
}

/**
 * Incrémente le compteur de déconnexions de l'animateur.
 * Retourne le nouveau count.
 */
export async function incrementAnimateurDisconnect(groupeId: string): Promise<number> {
  const current = await groupStorage.getGroup(groupeId);
  if (!current?.sessionState) return 0;

  const newCount = (current.sessionState.animateurDisconnectCount ?? 0) + 1;
  await groupStorage.updateSessionState(groupeId, {
    ...current.sessionState,
    animateurDisconnectCount: newCount,
  });
  return newCount;
}

// ========== Signalement de bannissement ==========

export async function submitBanFeedback(
  groupeId: string,
  participantUid: string,
  participantPseudo: string,
  feedback: string
): Promise<void> {
  // Optionnel: on peut garder Firebase pour les reports de ban car c'est de l'admin
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
  const current = await groupStorage.getGroup(groupeId);
  if (!current?.sessionState) return;

  await groupStorage.updateSessionState(groupeId, {
    ...current.sessionState,
    currentPhaseIndex: newIndex,
    phaseStartedAt: new Date().toISOString(),
  });
}

export async function extendSession(groupeId: string, extraMinutes: number): Promise<void> {
  const current = await groupStorage.getGroup(groupeId);
  if (!current?.sessionState) return;

  await groupStorage.updateSessionState(groupeId, {
    ...current.sessionState,
    extendedMinutes: extraMinutes,
  });
}

export async function endSession(groupeId: string): Promise<void> {
  const current = await groupStorage.getGroup(groupeId);
  if (current?.status === 'completed' || current?.status === 'cancelled') return;

  await groupStorage.updateGroup(groupeId, {
    status: 'completed',
    session_state: {
        ...(current?.sessionState || {}),
        sessionActive: false
    }
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
  const result = await groupStorage.incrementParticipantExit(groupeId, uid);
  return result.count;
}

/**
 * Vérifie si un participant est banni d'un groupe.
 * Lecture rapide du flag banned dans participantExits/{uid}.
 */
export async function isParticipantBanned(
  groupeId: string,
  uid: string
): Promise<boolean> {
  return groupStorage.isBanned(groupeId, uid);
}

/**
 * Banni explicitement de maniere permanente un participant (Action animateur).
 * Modifie le sous-document participantExits ET met le flag banni:true dans l'array participants du groupe.
 */
export async function banParticipantExplicit(
  groupeId: string,
  uid: string
): Promise<void> {
  await groupStorage.banParticipant(groupeId, uid);
  
  const groupe = await groupStorage.getGroup(groupeId);
  if (groupe) {
    const groupeTitre: string = groupe.titre || 'ce groupe';
    await sendParentNotification(
      uid,
      'group_banned',
      'Vous avez été exclu du groupe',
      `Vous avez été définitivement banni du groupe "${groupeTitre}" par l'animateur.`,
      { groupeId, groupeTitre }
    );
  }
}

