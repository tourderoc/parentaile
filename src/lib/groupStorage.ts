/**
 * Couche d'aiguillage Firebase <-> VPS pour les groupes de parole.
 * 
 * Bascule via VITE_STORAGE_BACKEND.
 * Gère le stockage normalisé (VPS) vs dénormalisé (Firebase).
 */

import { 
  doc, getDoc, setDoc, updateDoc, deleteDoc, 
  collection, getDocs, addDoc, query, where, orderBy, limit,
  serverTimestamp, Timestamp, increment, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { db } from './firebase';
import type { GroupeParole, MessageGroupe, ThemeGroupe, StructureEtape } from '../types/groupeParole';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface GroupStorage {
  backend: 'firebase' | 'vps';

  // Groupes
  getGroup(id: string): Promise<GroupeParole | null>;
  listGroups(filters?: { status?: string; creatorUid?: string }): Promise<GroupeParole[]>;
  createGroup(data: any): Promise<string>;
  updateGroup(id: string, patch: any): Promise<void>;
  deleteGroup(id: string): Promise<void>;

  // Participants
  joinGroup(id: string, user: { uid: string; pseudo: string }): Promise<void>;
  leaveGroup(id: string, uid: string): Promise<void>;

  // Chat
  listMessages(id: string): Promise<MessageGroupe[]>;
  sendMessage(id: string, message: { auteurUid: string; auteurPseudo: string; contenu: string }): Promise<string>;
  deleteMessage(id: string, messageId: string): Promise<void>;

  // Session State
  updateSessionState(id: string, state: any): Promise<void>;

  // Évaluations
  submitEvaluation(id: string, evaluation: any): Promise<void>;
  getEvaluationStatus(id: string, uid: string): Promise<'none' | 'pending' | 'done'>;
  getEvaluationsAverage(id: string): Promise<{ average: number; count: number } | null>;

  // Sorties & Bannissement
  incrementParticipantExit(id: string, uid: string): Promise<{ count: number; banned: boolean }>;
  banParticipant(id: string, uid: string): Promise<void>;
  isBanned(id: string, uid: string): Promise<boolean>;
}

// ============================================
// HELPERS
// ============================================

const VPS_URL = import.meta.env.VITE_GROUP_API_URL || import.meta.env.VITE_ACCOUNT_API_URL;
const VPS_KEY = import.meta.env.VITE_ACCOUNT_API_KEY;

async function vpsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${VPS_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': VPS_KEY,
      ...(init.headers || {}),
    },
  });
  return res;
}

function mapFromVps(data: any): GroupeParole {
    let participantsRaw = data.participants || [];
    if (typeof participantsRaw === 'string') {
        try { participantsRaw = JSON.parse(participantsRaw); } catch (e) { participantsRaw = []; }
    }
    if (!Array.isArray(participantsRaw)) participantsRaw = [];

    return {
        ...data,
        id: data.id,
        titre: data.titre,
        description: data.description,
        theme: data.theme,
        createurUid: data.createur_uid,
        createurPseudo: data.createur_pseudo,
        dateCreation: new Date(data.created_at || Date.now()),
        dateVocal: new Date(data.date_vocal),
        dateExpiration: new Date(data.date_expiration),
        participantsMax: data.participants_max,
        structureType: data.structure_type,
        structure: data.structure,
        participants: participantsRaw.map((p: any) => ({
            uid: p.user_uid || p.uid,
            pseudo: p.pseudo,
            inscritVocal: p.inscrit_vocal ?? true,
            dateInscription: new Date(p.date_inscription || Date.now()),
            banni: !!p.banni
        })),
        messageCount: data.message_count || 0,
        status: data.status,
        sessionState: data.session_state ? {
            currentPhaseIndex: data.session_state.currentPhaseIndex ?? 0,
            extendedMinutes: data.session_state.extendedMinutes ?? 0,
            sessionActive: data.session_state.sessionActive ?? true,
            phaseStartedAt: data.session_state.phaseStartedAt
                ? new Date(data.session_state.phaseStartedAt)
                : new Date(),
            sessionStartedAt: data.session_state.sessionStartedAt
                ? new Date(data.session_state.sessionStartedAt)
                : new Date(),
            suspended: data.session_state.suspended ?? false,
            suspendedAt: data.session_state.suspendedAt
                ? new Date(data.session_state.suspendedAt)
                : undefined,
            suspensionReason: data.session_state.suspensionReason,
            suspensionCount: data.session_state.suspensionCount ?? 0,
            replacementUsed: data.session_state.replacementUsed ?? false,
            currentAnimateurUid: data.session_state.currentAnimateurUid,
            currentAnimateurPseudo: data.session_state.currentAnimateurPseudo,
            animateurDisconnectCount: data.session_state.animateurDisconnectCount ?? 0,
        } : undefined,
    } as GroupeParole;
}

// ============================================
// VPS IMPLEMENTATION
// ============================================

const vpsStorage: GroupStorage = {
  backend: 'vps',

  async getGroup(id) {
    const res = await vpsFetch(`/groupes/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return mapFromVps(data);
  },

  async listGroups(filters) {
    // include_ended=true : on laisse les groupes 'completed' dans la liste
    // pour que le chat post-vocal reste accessible pendant la fenêtre
    // dateExpiration (7 jours). Le filtrage 'cancelled' est fait côté
    // client (upcomingGroupContext) selon le contexte d'affichage.
    let url = '/groupes?include_ended=true&';
    if (filters?.status) url += `status=${filters.status}&`;
    const res = await vpsFetch(url);
    if (!res.ok) return [];
    const items = await res.json();
    const now = new Date();
    return items
      .map(mapFromVps)
      .filter((g: any) => !g.dateExpiration || g.dateExpiration > now);
  },

  async createGroup(data) {
    const payload = {
        id: data.id,
        titre: data.titre,
        description: data.description || "",
        theme: data.theme || "autre",
        createur_uid: data.createurUid,
        createur_pseudo: data.createurPseudo,
        date_vocal: data.dateVocal.toISOString(),
        date_expiration: data.dateExpiration.toISOString(),
        structure_type: data.structureType,
        structure: (data.structure || []).map((s: any) => ({
            label: s.label,
            dureeMinutes: s.dureeMinutes,
            micMode: s.micMode || 'free'
        })),
        participants_max: data.participantsMax || 5
    };

    const res = await vpsFetch('/groupes', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erreur création groupe: ${res.status} ${errText}`);
    }
    
    const result = await res.json();
    return result.id;
  },

  async updateGroup(id, patch) {
    await vpsFetch(`/groupes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch)
    });
  },

  async deleteGroup(id) {
    await vpsFetch(`/groupes/${id}`, { method: 'DELETE' });
  },

  async joinGroup(id, user) {
    const res = await vpsFetch(`/groupes/${id}/join?user_uid=${user.uid}`, { method: 'POST' });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erreur inscription');
    }
  },

  async leaveGroup(id, uid) {
    await vpsFetch(`/groupes/${id}/leave?user_uid=${uid}`, { method: 'POST' });
  },

  async listMessages(id) {
    const res = await vpsFetch(`/groupes/${id}/messages`);
    if (!res.ok) return [];
    const items = await res.json();
    return items.map((m: any) => ({
        ...m,
        dateEnvoi: new Date(m.date_envoi)
    }));
  },

  async sendMessage(id, message) {
    const res = await vpsFetch(`/groupes/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
            id: Math.random().toString(36).substr(2, 9), // ID temporaire
            auteur_uid: message.auteurUid,
            auteur_pseudo: message.auteurPseudo,
            contenu: message.contenu
        })
    });
    const result = await res.json();
    return result.id;
  },

  async deleteMessage(id, messageId) {
    await vpsFetch(`/groupes/${id}/messages/${messageId}`, { method: 'DELETE' });
  },

  async updateSessionState(id, state) {
    await vpsFetch(`/groupes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ session_state: state })
    });
  },

  async submitEvaluation(id, evaluation) {
    await vpsFetch(`/groupes/${id}/evaluations`, {
        method: 'POST',
        body: JSON.stringify(evaluation)
    });
  },

  async getEvaluationStatus(id, uid) {
    const res = await vpsFetch(`/groupes/${id}/evaluations/${uid}`);
    if (!res.ok) return 'none';
    const data = await res.json();
    return data.status || 'none';
  },

  async getEvaluationsAverage(id) {
    const res = await vpsFetch(`/groupes/${id}/evaluations/average`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.average === null || data.count === 0) return null;
    return { average: data.average, count: data.count };
  },

  async incrementParticipantExit(id, uid) {
    const res = await vpsFetch(`/groupes/${id}/exits/${encodeURIComponent(uid)}`, {
      method: 'POST',
    });
    if (!res.ok) return { count: 1, banned: false };
    return res.json();
  },

  async banParticipant(id, uid) {
    await vpsFetch(`/groupes/${id}/ban?uid=${encodeURIComponent(uid)}`, { method: 'POST' });
  },

  async isBanned(id, uid) {
    const res = await vpsFetch(`/groupes/${id}/banned/${encodeURIComponent(uid)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.banned;
  },
};

// ============================================
// FIREBASE IMPLEMENTATION
// ============================================

const firebaseStorage: GroupStorage = {
    backend: 'firebase',

    async getGroup(id) {
        const snap = await getDoc(doc(db, 'groupes', id));
        if (!snap.exists()) return null;
        const d = snap.data();
        return { id: snap.id, ...d, 
                 dateVocal: d.dateVocal?.toDate(),
                 dateExpiration: d.dateExpiration?.toDate(),
                 dateCreation: d.dateCreation?.toDate() } as any;
    },

    async listGroups(filters) {
        let q = query(collection(db, 'groupes'), orderBy('dateVocal', 'asc'));
        if (filters?.status) q = query(q, where('status', '==', filters.status));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    },

    async createGroup(data) {
        const docRef = await addDoc(collection(db, 'groupes'), {
            ...data,
            dateCreation: serverTimestamp(),
            dateVocal: Timestamp.fromDate(data.dateVocal),
            dateExpiration: Timestamp.fromDate(data.dateExpiration),
            status: 'scheduled',
            participants: [
                {
                  uid: data.createurUid,
                  pseudo: data.createurPseudo,
                  inscritVocal: true,
                  dateInscription: Timestamp.now(),
                },
              ],
        });
        return docRef.id;
    },

    async updateGroup(id, patch) {
        await updateDoc(doc(db, 'groupes', id), patch);
    },

    async deleteGroup(id) {
        await deleteDoc(doc(db, 'groupes', id));
    },

    async joinGroup(id, user) {
        await updateDoc(doc(db, 'groupes', id), {
            participants: arrayUnion({
                uid: user.uid,
                pseudo: user.pseudo,
                inscritVocal: true,
                dateInscription: Timestamp.now(),
            }),
        });
    },

    async leaveGroup(id, uid) {
        const snap = await getDoc(doc(db, 'groupes', id));
        if (!snap.exists()) return;
        const data = snap.data();
        const updated = (data.participants || []).filter((p: any) => p.uid !== uid);
        await updateDoc(doc(db, 'groupes', id), { participants: updated });
    },

    async listMessages(id) {
        const q = query(collection(db, 'groupes', id, 'messages'), orderBy('dateEnvoi', 'asc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    },

    async sendMessage(id, message) {
        const res = await addDoc(collection(db, 'groupes', id, 'messages'), {
            ...message,
            dateEnvoi: serverTimestamp()
        });
        await updateDoc(doc(db, 'groupes', id), { messageCount: increment(1) });
        return res.id;
    },

    async deleteMessage(id, messageId) {
        await deleteDoc(doc(db, 'groupes', id, 'messages', messageId));
        await updateDoc(doc(db, 'groupes', id), { messageCount: increment(-1) });
    },

    async updateSessionState(id, state) {
        await updateDoc(doc(db, 'groupes', id), { sessionState: state });
    },

    async submitEvaluation(id, evaluation) {
        await setDoc(doc(db, 'groupes', id, 'evaluations', evaluation.participantUid), evaluation);
    },

    async getEvaluationStatus(id, uid) {
        const snap = await getDoc(doc(db, 'groupes', id, 'evaluations', uid));
        if (!snap.exists()) return 'none';
        return snap.data().status === 'pending' ? 'pending' : 'done';
    },

    async getEvaluationsAverage(id) {
        const snap = await getDocs(collection(db, 'groupes', id, 'evaluations'));
        const completed = snap.docs.filter(
            (d) => d.data().status !== 'pending' && d.data().noteAmbiance
        );
        if (completed.length === 0) return null;
        let total = 0;
        for (const d of completed) {
            const data = d.data();
            total += (data.noteAmbiance || 0) + (data.noteTheme || 0) + (data.noteTechnique || 0);
        }
        const count = completed.length;
        return { average: Math.round(total / (count * 3) * 10) / 10, count };
    },

    async incrementParticipantExit(id, uid) {
        const exitRef = doc(db, 'groupes', id, 'participantExits', uid);
        let newCount = 1;
        let banned = false;
        const snap = await getDoc(exitRef);
        if (snap.exists()) {
            newCount = (snap.data().count || 0) + 1;
        }
        banned = newCount > 2;
        await setDoc(exitRef, {
            count: newCount,
            lastExitAt: new Date(),
            banned,
        }, { merge: true });
        return { count: newCount, banned };
    },

    async banParticipant(id, uid) {
        await setDoc(doc(db, 'groupes', id, 'participantExits', uid), { banned: true }, { merge: true });
    },

    async isBanned(id, uid) {
        const snap = await getDoc(doc(db, 'groupes', id, 'participantExits', uid));
        return snap?.exists() ? snap.data().banned === true : false;
    },
};

// ============================================
// EXPORT
// ============================================

const choice = import.meta.env.VITE_STORAGE_BACKEND || 'firebase';
export const groupStorage: GroupStorage = choice === 'vps' ? vpsStorage : firebaseStorage;
