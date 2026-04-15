/**
 * Couche d'accès VPS pour les comptes utilisateurs.
 * Tunnel HTTPS vers account.parentaile.fr.
 */

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
  backend: 'vps';
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
    throw new Error('VITE_ACCOUNT_API_URL / VITE_ACCOUNT_API_KEY not configured');
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
    skip_charte: 'skip_charte',
    skipCharte: 'skip_charte',
  };
  const mapped: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    const targetKey = mapping[k] || k;
    if (v !== undefined) {
      if (v instanceof Date) {
        mapped[targetKey] = v.toISOString();
      } else {
        mapped[targetKey] = v;
      }
    }
  }
  return mapped;
}

export const accountStorage: AccountStorage = {
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
    if (res.status === 404) return [];
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

if (typeof window !== 'undefined') {
  (window as any).__accountStorage = accountStorage;
  console.log(`[accountStorage] backend = ${accountStorage.backend}`);
}
