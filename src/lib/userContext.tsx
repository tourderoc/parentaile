import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, collection, query, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
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
  /** Pseudo affiché (temps réel) */
  pseudo: string;
  /** Config avatar (temps réel) */
  avatarConfig: any | null;
  /** Points de participation (temps réel) */
  points: number;
  /** Badge actuel (temps réel) */
  badge: BadgeLevel;
  /** Historique de participation (temps réel) */
  participationHistory: any[];
  /** Enfants liés (tokenIds) — chargé une seule fois */
  children: ChildToken[];
  /** IDs des tokens uniquement */
  tokenIds: string[];
  /** True pendant le chargement initial */
  loading: boolean;
  /** Recharger les enfants (après ajout/suppression) */
  reloadChildren: () => Promise<void>;
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
  children: [],
  tokenIds: [],
  loading: true,
  reloadChildren: async () => {},
});

export const useUser = () => useContext(UserContext);

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
  const [childTokens, setChildTokens] = useState<ChildToken[]>([]);
  const [loading, setLoading] = useState(true);
  const accountUnsubRef = useRef<(() => void) | null>(null);

  const loadChildren = async (user: FirebaseUser) => {
    try {
      const childrenRef = collection(db, 'accounts', user.uid, 'children');
      const snap = await getDocs(query(childrenRef, orderBy('addedAt', 'desc')));
      setChildTokens(snap.docs.map(d => ({
        tokenId: d.id,
        nickname: d.data().nickname || '',
        addedAt: d.data().addedAt?.toDate?.() || new Date(),
      })));
    } catch {
      setChildTokens([]);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);

      // Cleanup previous account listener
      if (accountUnsubRef.current) {
        accountUnsubRef.current();
        accountUnsubRef.current = null;
      }

      if (!user) {
        setPseudo('');
        setAvatarConfig(null);
        setPoints(0);
        setBadge('none');
        setParticipationHistory([]);
        setChildTokens([]);
        setLoading(false);
        return;
      }

      // Single real-time listener for pseudo + avatar + progression
      accountUnsubRef.current = onSnapshot(doc(db, 'accounts', user.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setPseudo(data.pseudo || '');
          setAvatarConfig(data.avatar || null);
          const p = data.points || 0;
          setPoints(p);
          setBadge((data.badge as BadgeLevel) || getBadgeForPoints(p));
          setParticipationHistory(data.participationHistory || []);
        }
        setLoading(false);
      });

      // Children loaded once (stable data)
      loadChildren(user);
    });

    return () => {
      unsub();
      if (accountUnsubRef.current) accountUnsubRef.current();
    };
  }, []);

  const reloadChildren = async () => {
    if (currentUser) await loadChildren(currentUser);
  };

  const tokenIds = childTokens.map(c => c.tokenId);

  return (
    <UserContext.Provider value={{
      currentUser,
      pseudo,
      avatarConfig,
      points,
      badge,
      participationHistory,
      children: childTokens,
      tokenIds,
      loading,
      reloadChildren,
    }}>
      {reactChildren}
    </UserContext.Provider>
  );
};

export default UserContext;
