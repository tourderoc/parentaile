/**
 * Couche d'aiguillage Firebase <-> VPS pour les comptes utilisateurs.
 *
 * Choix du backend via VITE_STORAGE_BACKEND (`firebase` | `vps`).
 * Tant que les 13 fichiers consommateurs ne sont pas migres, cette couche
 * reste optionnelle : on peut l'utiliser en parallele du code Firebase
 * existant pour tester le tunnel VPS sans toucher a la prod.
 */

import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';

// ============================================
// TYPES
// ============================================

export interface AccountData {
  uid: string;
  email: string | null;
  pseudo: string;
  avatar: any | null;
  avatar_gen_count: number;
  last_avatar_gen_date: string | null;
  points: number;
  badge: string | null;
  participation_history: any[];
  fcm_token: string | null;
  fcm_token_updated_at: string | null;
  role: string | null;
  created_at?: string;
  last_activity?: string;
  updated_at?: string;
}

export interface ChildData {
  token_id: string;
  nickname: string;
  added_at: string;
}

export interface AccountUpdate {
  email?: string | null;
  pseudo?: string;
  avatar?: any | null;
  avatar_gen_count?: number;
  last_avatar_gen_date?: string | null;
  points?: number;
  badge?: string | null;
  participation_history?: any[];
  fcm_token?: string | null;
  fcm_token_updated_at?: string | null;
  role?: string | null;
}

export interface AccountStorage {
  backend: 'firebase' | 'vps';
  getAccount(uid: string): Promise<AccountData | null>;
  updateAccount(uid: string, patch: AccountUpdate): Promise<AccountData>;
  listChildren(uid: string): Promise<ChildData[]>;
}

// ============================================
// VPS IMPLEMENTATION (HTTP)
// ============================================

const VPS_URL = import.meta.env.VITE_ACCOUNT_API_URL as string | undefined;
const VPS_KEY = import.meta.env.VITE_ACCOUNT_API_KEY as string | undefined;

async function vpsFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!VPS_URL || !VPS_KEY) {
    throw new Error('VPS backend selected but VITE_ACCOUNT_API_URL / VITE_ACCOUNT_API_KEY not configured');
  }
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

const vpsStorage: AccountStorage = {
  backend: 'vps',

  async getAccount(uid) {
    const res = await vpsFetch(`/accounts/${encodeURIComponent(uid)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`VPS getAccount failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async updateAccount(uid, patch) {
    const res = await vpsFetch(`/accounts/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`VPS updateAccount failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async listChildren(uid) {
    const res = await vpsFetch(`/accounts/${encodeURIComponent(uid)}/children`);
    if (!res.ok) throw new Error(`VPS listChildren failed: ${res.status} ${await res.text()}`);
    return res.json();
  },
};

// ============================================
// FIREBASE IMPLEMENTATION (legacy)
// ============================================

function firebaseTsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : null;
}

const firebaseStorage: AccountStorage = {
  backend: 'firebase',

  async getAccount(uid) {
    const snap = await getDoc(doc(db, 'accounts', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid,
      email: d.email ?? null,
      pseudo: d.pseudo ?? '',
      avatar: d.avatar ?? null,
      avatar_gen_count: d.avatarGenCount ?? 0,
      last_avatar_gen_date: d.lastAvatarGenDate ?? null,
      points: d.points ?? 0,
      badge: d.badge ?? null,
      participation_history: d.participationHistory ?? [],
      fcm_token: d.fcmToken ?? null,
      fcm_token_updated_at: firebaseTsToIso(d.fcmTokenUpdatedAt),
      role: d.role ?? null,
      created_at: firebaseTsToIso(d.createdAt) ?? undefined,
      last_activity: firebaseTsToIso(d.lastActivity) ?? undefined,
      updated_at: firebaseTsToIso(d.updatedAt) ?? undefined,
    };
  },

  async updateAccount(uid, patch) {
    const mapped: Record<string, any> = {};
    if (patch.email !== undefined) mapped.email = patch.email;
    if (patch.pseudo !== undefined) mapped.pseudo = patch.pseudo;
    if (patch.avatar !== undefined) mapped.avatar = patch.avatar;
    if (patch.avatar_gen_count !== undefined) mapped.avatarGenCount = patch.avatar_gen_count;
    if (patch.last_avatar_gen_date !== undefined) mapped.lastAvatarGenDate = patch.last_avatar_gen_date;
    if (patch.points !== undefined) mapped.points = patch.points;
    if (patch.badge !== undefined) mapped.badge = patch.badge;
    if (patch.participation_history !== undefined) mapped.participationHistory = patch.participation_history;
    if (patch.fcm_token !== undefined) mapped.fcmToken = patch.fcm_token;
    if (patch.fcm_token_updated_at !== undefined) mapped.fcmTokenUpdatedAt = patch.fcm_token_updated_at;
    if (patch.role !== undefined) mapped.role = patch.role;
    await updateDoc(doc(db, 'accounts', uid), mapped);
    const next = await firebaseStorage.getAccount(uid);
    if (!next) throw new Error(`Account ${uid} vanished after update`);
    return next;
  },

  async listChildren(uid) {
    const q = query(collection(db, 'accounts', uid, 'children'), orderBy('addedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      token_id: d.id,
      nickname: d.data().nickname ?? '',
      added_at: firebaseTsToIso(d.data().addedAt) ?? new Date().toISOString(),
    }));
  },
};

// ============================================
// FACTORY / SWITCH
// ============================================

const backendChoice = (import.meta.env.VITE_STORAGE_BACKEND as string | undefined) ?? 'firebase';

export const accountStorage: AccountStorage =
  backendChoice === 'vps' ? vpsStorage : firebaseStorage;

if (typeof window !== 'undefined') {
  (window as any).__accountStorage = accountStorage;
  console.log(`[accountStorage] backend = ${accountStorage.backend}`);
}
