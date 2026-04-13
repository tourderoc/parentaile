/**
 * Couche d'aiguillage Firebase <-> VPS pour les comptes utilisateurs.
 *
 * Choix du backend via VITE_STORAGE_BACKEND (`firebase` | `vps`).
 * Tous les fichiers consommateurs de `accounts` passent par cette couche.
 * La bascule `vps` active le tunnel HTTPS vers account.parentaile.fr.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
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
  last_activity?: string;
}

export interface AccountCreate {
  uid: string;
  email?: string | null;
  pseudo: string;
  avatar?: any | null;
  points?: number;
  badge?: string | null;
  participation_history?: any[];
  avatar_gen_count?: number;
  last_avatar_gen_date?: string | null;
  fcm_token?: string | null;
  fcm_token_updated_at?: string | null;
  role?: string | null;
}

export interface AccountStorage {
  backend: 'firebase' | 'vps';
  getAccount(uid: string): Promise<AccountData | null>;
  createAccount(data: AccountCreate): Promise<AccountData>;
  updateAccount(uid: string, patch: AccountUpdate): Promise<AccountData>;
  deleteAccount(uid: string): Promise<void>;
  listChildren(uid: string): Promise<ChildData[]>;
  addChild(uid: string, tokenId: string, nickname: string): Promise<ChildData>;
  updateChild(uid: string, tokenId: string, nickname: string): Promise<ChildData>;
  removeChild(uid: string, tokenId: string): Promise<void>;
  batchGetAccounts(uids: string[]): Promise<AccountData[]>;
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

/** Maps camelCase AccountUpdate keys to snake_case VPS field names. */
function mapToVpsFields(patch: Record<string, any>): Record<string, any> {
  const mapping: Record<string, string> = {
    email: 'email',
    pseudo: 'pseudo',
    avatar: 'avatar',
    avatar_gen_count: 'avatar_gen_count',
    avatarGenCount: 'avatar_gen_count',
    last_avatar_gen_date: 'last_avatar_gen_date',
    lastAvatarGenDate: 'last_avatar_gen_date',
    points: 'points',
    badge: 'badge',
    participation_history: 'participation_history',
    participationHistory: 'participation_history',
    fcm_token: 'fcm_token',
    fcmToken: 'fcm_token',
    fcm_token_updated_at: 'fcm_token_updated_at',
    fcmTokenUpdatedAt: 'fcm_token_updated_at',
    role: 'role',
    last_activity: 'last_activity',
    lastActivity: 'last_activity',
  };
  const mapped: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    const targetKey = mapping[k] || k;
    if (v !== undefined) {
      // Handle Date objects (like serverTimestamp fallback or new Date())
      if (v instanceof Date) {
        mapped[targetKey] = v.toISOString();
      } else {
        mapped[targetKey] = v;
      }
    }
  }
  return mapped;
}

const vpsStorage: AccountStorage = {
  backend: 'vps',

  async getAccount(uid) {
    const res = await vpsFetch(`/accounts/${encodeURIComponent(uid)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`VPS getAccount failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async createAccount(data) {
    const res = await vpsFetch('/accounts', {
      method: 'POST',
      body: JSON.stringify(mapToVpsFields(data)),
    });
    if (!res.ok) throw new Error(`VPS createAccount failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async updateAccount(uid, patch) {
    const res = await vpsFetch(`/accounts/${encodeURIComponent(uid)}`, {
      method: 'PUT',
      body: JSON.stringify(mapToVpsFields(patch)),
    });
    if (!res.ok) throw new Error(`VPS updateAccount failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async deleteAccount(uid) {
    const res = await vpsFetch(`/accounts/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`VPS deleteAccount failed: ${res.status} ${await res.text()}`);
    }
  },

  async listChildren(uid) {
    const res = await vpsFetch(`/accounts/${encodeURIComponent(uid)}/children`);
    if (!res.ok) throw new Error(`VPS listChildren failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async addChild(uid, tokenId, nickname) {
    const res = await vpsFetch(`/accounts/${encodeURIComponent(uid)}/children`, {
      method: 'POST',
      body: JSON.stringify({ token_id: tokenId, nickname }),
    });
    if (!res.ok) throw new Error(`VPS addChild failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async updateChild(uid, tokenId, nickname) {
    const res = await vpsFetch(
      `/accounts/${encodeURIComponent(uid)}/children/${encodeURIComponent(tokenId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ nickname }),
      }
    );
    if (!res.ok) throw new Error(`VPS updateChild failed: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async removeChild(uid, tokenId) {
    const res = await vpsFetch(
      `/accounts/${encodeURIComponent(uid)}/children/${encodeURIComponent(tokenId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`VPS removeChild failed: ${res.status} ${await res.text()}`);
    }
  },

  async batchGetAccounts(uids) {
    if (uids.length === 0) return [];
    const res = await vpsFetch('/accounts/batch', {
      method: 'POST',
      body: JSON.stringify({ uids }),
    });
    if (!res.ok) throw new Error(`VPS batchGetAccounts failed: ${res.status} ${await res.text()}`);
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

function firebaseRowToAccountData(uid: string, d: Record<string, any>): AccountData {
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
}

/** Maps snake_case AccountUpdate keys to camelCase Firebase field names. */
function patchToFirebaseFields(patch: Record<string, any>): Record<string, any> {
  const mapping: Record<string, string> = {
    email: 'email',
    pseudo: 'pseudo',
    avatar: 'avatar',
    avatar_gen_count: 'avatarGenCount',
    last_avatar_gen_date: 'lastAvatarGenDate',
    points: 'points',
    badge: 'badge',
    participation_history: 'participationHistory',
    fcm_token: 'fcmToken',
    fcm_token_updated_at: 'fcmTokenUpdatedAt',
    role: 'role',
    last_activity: 'lastActivity',
  };
  const mapped: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && mapping[k]) {
      mapped[mapping[k]] = v;
    }
  }
  return mapped;
}

const firebaseStorage: AccountStorage = {
  backend: 'firebase',

  async getAccount(uid) {
    const snap = await getDoc(doc(db, 'accounts', uid));
    if (!snap.exists()) return null;
    return firebaseRowToAccountData(uid, snap.data());
  },

  async createAccount(data) {
    const firebaseDoc: Record<string, any> = {
      email: data.email ?? null,
      pseudo: data.pseudo,
      avatar: data.avatar ?? null,
      avatarGenCount: data.avatar_gen_count ?? 0,
      lastAvatarGenDate: data.last_avatar_gen_date ?? null,
      points: data.points ?? 0,
      badge: data.badge ?? null,
      participationHistory: data.participation_history ?? [],
      fcmToken: data.fcm_token ?? null,
      fcmTokenUpdatedAt: data.fcm_token_updated_at ?? null,
      role: data.role ?? null,
      createdAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
    };
    await setDoc(doc(db, 'accounts', data.uid), firebaseDoc, { merge: true });
    const created = await firebaseStorage.getAccount(data.uid);
    if (!created) throw new Error(`Account ${data.uid} vanished after creation`);
    return created;
  },

  async updateAccount(uid, patch) {
    const mapped = patchToFirebaseFields(patch);
    if (Object.keys(mapped).length > 0) {
      await updateDoc(doc(db, 'accounts', uid), mapped);
    }
    const next = await firebaseStorage.getAccount(uid);
    if (!next) throw new Error(`Account ${uid} vanished after update`);
    return next;
  },

  async deleteAccount(uid) {
    // Delete children sub-collection first (Firebase requires manual sub-collection cleanup)
    const childrenRef = collection(db, 'accounts', uid, 'children');
    const childrenSnap = await getDocs(childrenRef);
    const deletes = childrenSnap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletes);
    // Delete the account document
    await deleteDoc(doc(db, 'accounts', uid));
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

  async addChild(uid, tokenId, nickname) {
    const childRef = doc(db, 'accounts', uid, 'children', tokenId);
    await setDoc(childRef, {
      nickname,
      addedAt: serverTimestamp(),
    });
    // Read back to get the server timestamp
    const snap = await getDoc(childRef);
    const data = snap.data();
    return {
      token_id: tokenId,
      nickname,
      added_at: firebaseTsToIso(data?.addedAt) ?? new Date().toISOString(),
    };
  },

  async updateChild(uid, tokenId, nickname) {
    const childRef = doc(db, 'accounts', uid, 'children', tokenId);
    await updateDoc(childRef, { nickname });
    const snap = await getDoc(childRef);
    const data = snap.data();
    return {
      token_id: tokenId,
      nickname,
      added_at: firebaseTsToIso(data?.addedAt) ?? new Date().toISOString(),
    };
  },

  async removeChild(uid, tokenId) {
    await deleteDoc(doc(db, 'accounts', uid, 'children', tokenId));
  },

  async batchGetAccounts(uids) {
    // Firebase doesn't have batch get — fetch in parallel
    const results = await Promise.all(
      uids.map(async (uid) => {
        const snap = await getDoc(doc(db, 'accounts', uid));
        if (!snap.exists()) return null;
        return firebaseRowToAccountData(uid, snap.data());
      })
    );
    return results.filter((r): r is AccountData => r !== null);
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
