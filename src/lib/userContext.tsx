import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, collection, query, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';

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
        setChildTokens([]);
        setLoading(false);
        return;
      }

      // Single real-time listener for pseudo + avatar
      accountUnsubRef.current = onSnapshot(doc(db, 'accounts', user.uid), (snap) => {
        if (snap.exists()) {
          setPseudo(snap.data().pseudo || '');
          setAvatarConfig(snap.data().avatar || null);
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
