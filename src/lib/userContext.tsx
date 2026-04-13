import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from './firebase';
import { accountStorage } from './accountStorage';
import type { BadgeLevel } from '../types/groupeParole';
import { getBadgeForPoints } from '../types/groupeParole';

// ============================================
// TYPES
// ============================================

export interface ChildToken {
  tokenId: string;
  nickname: string;
  addedAt: Date;
}

export interface UserContextType {
  /** Utilisateur Firebase Auth courant */
  currentUser: FirebaseUser | null;
  /** Pseudo affiché */
  pseudo: string;
  /** Config avatar */
  avatarConfig: any | null;
  /** Points de participation */
  points: number;
  /** Badge actuel */
  badge: BadgeLevel;
  /** Historique de participation */
  participationHistory: any[];
  /** Quota d'avatar IA */
  avatarGenCount: number;
  lastAvatarGenDate: string;
  /** Enfants liés (tokenIds) */
  children: ChildToken[];
  /** IDs des tokens uniquement */
  tokenIds: string[];
  /** True pendant le chargement initial */
  loading: boolean;
  /** Recharger les enfants (après ajout/suppression) */
  reloadChildren: () => Promise<void>;
  /** Recharger le compte immédiatement (après mutation dans Settings, etc.) */
  refreshAccount: () => Promise<void>;
  /** Mise à jour immédiate et optimiste de l'état (ex: après inscription) */
  setLocalData: (data: Partial<UserContextType>) => void;
}

// ============================================
// CONTEXT
// ============================================

const UserContext = createContext<UserContextType>({
  currentUser: null,
  pseudo: '',
  avatarConfig: null,
  points: 0,
  badge: 'none',
  participationHistory: [],
  avatarGenCount: 0,
  lastAvatarGenDate: '',
  children: [],
  tokenIds: [],
  loading: true,
  reloadChildren: async () => {},
  refreshAccount: async () => {},
  setLocalData: () => {},
});

export const useUser = () => useContext(UserContext);

// ============================================
// CONSTANTS
// ============================================

/** Intervalle de polling pour le profil (en ms). 60s suffit pour pseudo/points/avatar. */
const ACCOUNT_POLL_INTERVAL = 60_000;

/** Intervalle minimal entre deux fetches (debounce contre refreshAccount + polling simultanés). */
const MIN_FETCH_GAP = 2_000;

// ============================================
// PROVIDER
// ============================================

export const UserProvider = ({ children: reactChildren }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [pseudo, setPseudo] = useState('');
  const [avatarConfig, setAvatarConfig] = useState<any | null>(null);
  const [points, setPoints] = useState(0);
  const [badge, setBadge] = useState<BadgeLevel>('none');
  const [participationHistory, setParticipationHistory] = useState<any[]>([]);
  const [avatarGenCount, setAvatarGenCount] = useState(0);
  const [lastAvatarGenDate, setLastAvatarGenDate] = useState('');
  const [childTokens, setChildTokens] = useState<ChildToken[]>([]);
  const [loading, setLoading] = useState(true);

  const lastFetchRef = useRef(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Core fetch : reads account from accountStorage ----
  const fetchAccount = useCallback(async (uid: string) => {
    const now = Date.now();
    if (now - lastFetchRef.current < MIN_FETCH_GAP) return; // debounce
    lastFetchRef.current = now;

    try {
      const data = await accountStorage.getAccount(uid);
      if (data) {
        setPseudo(data.pseudo || '');
        setAvatarConfig(data.avatar || null);
        const p = data.points || 0;
        setPoints(p);
        setBadge((data.badge as BadgeLevel) || getBadgeForPoints(p));
        setParticipationHistory(data.participation_history || []);
        setAvatarGenCount(data.avatar_gen_count || 0);
        setLastAvatarGenDate(data.last_avatar_gen_date || '');
      }
    } catch (err) {
      console.error('[UserContext] fetchAccount error:', err);
    }
  }, []);

  // ---- Children loader ----
  const loadChildren = useCallback(async (uid: string) => {
    try {
      const items = await accountStorage.listChildren(uid);
      setChildTokens(
        items.map((c) => ({
          tokenId: c.token_id,
          nickname: c.nickname || '',
          addedAt: c.added_at ? new Date(c.added_at) : new Date(),
        }))
      );
    } catch {
      setChildTokens([]);
    }
  }, []);

  // ---- Auth state listener ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      // Cleanup previous polling
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }

      if (!user) {
        setPseudo('');
        setAvatarConfig(null);
        setPoints(0);
        setBadge('none');
        setParticipationHistory([]);
        setAvatarGenCount(0);
        setLastAvatarGenDate('');
        setChildTokens([]);
        setLoading(false);
        return;
      }

      // Initial fetch
      lastFetchRef.current = 0; // reset debounce for initial
      fetchAccount(user.uid).then(() => setLoading(false));

      // Children loaded once (stable data)
      loadChildren(user.uid);

      // Start polling
      pollingRef.current = setInterval(() => {
        fetchAccount(user.uid);
      }, ACCOUNT_POLL_INTERVAL);
    });

    return () => {
      unsub();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchAccount, loadChildren]);

  // ---- Public helpers ----
  const reloadChildren = useCallback(async () => {
    if (currentUser) await loadChildren(currentUser.uid);
  }, [currentUser, loadChildren]);

  const refreshAccount = useCallback(async () => {
    if (currentUser) {
      lastFetchRef.current = 0; // bypass debounce
      await fetchAccount(currentUser.uid);
    }
  }, [currentUser, fetchAccount]);
  const setLocalData = useCallback((data: Partial<UserContextType>) => {
    if (data.pseudo !== undefined) setPseudo(data.pseudo);
    if (data.avatarConfig !== undefined) setAvatarConfig(data.avatarConfig);
    if (data.points !== undefined) setPoints(data.points);
    if (data.badge !== undefined) setBadge(data.badge);
    if (data.avatarGenCount !== undefined) setAvatarGenCount(data.avatarGenCount);
    if (data.lastAvatarGenDate !== undefined) setLastAvatarGenDate(data.lastAvatarGenDate);
    if (data.participationHistory !== undefined) setParticipationHistory(data.participationHistory);
    // On peut forcer loading false si on injecte des données
    setLoading(false);
  }, []);

  const tokenIds = childTokens.map((c) => c.tokenId);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        pseudo,
        avatarConfig,
        points,
        badge,
        participationHistory,
        avatarGenCount,
        lastAvatarGenDate,
        children: childTokens,
        tokenIds,
        loading,
        reloadChildren,
        refreshAccount,
        setLocalData,
      }}
    >
      {reactChildren}
    </UserContext.Provider>
  );
};

export default UserContext;
