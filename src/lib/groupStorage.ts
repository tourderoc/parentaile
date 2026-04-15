/**
 * Couche d'accès VPS pour les groupes de parole.
 */

import type { GroupeParole, MessageGroupe } from '../types/groupeParole';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface GroupStorage {
  backend: 'vps';

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

export const groupStorage: GroupStorage = {
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
