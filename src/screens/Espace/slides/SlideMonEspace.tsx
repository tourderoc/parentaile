import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { auth, db } from '../../../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';
import { MessageSquare, Users, ChevronRight, Sparkles, LayoutGrid, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { onGroupesParole } from '../../../lib/groupeParoleService';
import type { GroupeParole } from '../../../types/groupeParole';

export const SlideMonEspace = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [myGroupsCount, setMyGroupsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) setIsLoading(false);
    });
    return () => unsub();
  }, []);

  // Unread notifications count (same logic as BottomNavSwiper)
  useEffect(() => {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }

    let unsubscribes: (() => void)[] = [];

    const setup = async () => {
      try {
        const childrenRef = collection(db, 'accounts', currentUser.uid, 'children');
        const childrenSnap = await getDocs(query(childrenRef, orderBy('addedAt', 'desc')));
        const tokenIds = childrenSnap.docs.map((d) => d.id);

        if (tokenIds.length === 0) {
          setUnreadCount(0);
          return;
        }

        const chunks: string[][] = [];
        for (let i = 0; i < tokenIds.length; i += 10) {
          chunks.push(tokenIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const notifRef = collection(db, 'notifications');
          const q = query(notifRef, where('tokenId', 'in', chunk), where('read', '==', false));
          const unsub = onSnapshot(
            q,
            (snapshot) => setUnreadCount(snapshot.docs.length),
            () => {}
          );
          unsubscribes.push(unsub);
        }
      } catch {
        // Silently ignore
      }
    };

    setup();
    return () => unsubscribes.forEach((u) => u());
  }, [currentUser]);

  // My groups count
  useEffect(() => {
    if (!currentUser) {
      setMyGroupsCount(0);
      setIsLoading(false);
      return;
    }

    const unsub = onGroupesParole((groupes: GroupeParole[]) => {
      const uid = currentUser.uid;
      const mine = groupes.filter(
        (g) =>
          g.createurUid === uid ||
          g.participants.some((p) => p.uid === uid)
      );
      setMyGroupsCount(mine.length);
      setIsLoading(false);
    });

    return () => unsub();
  }, [currentUser]);

  const handleCardClick = (path: string) => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    navigate(path);
  };

  if (isLoading) {
    return (
      <div className="h-full bg-[#FFFBF0] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="h-full bg-[#FFFBF0] overflow-y-auto pb-32">
      {/* Header */}
      <div className="pt-10 pb-6 px-6 max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-2"
        >
          <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">Mon Espace</h1>
            <p className="text-xs text-gray-400 font-medium">Votre espace personnel</p>
          </div>
        </motion.div>
      </div>

      {/* Cards */}
      <div className="px-6 max-w-md mx-auto space-y-4">
        {/* Card: Mes Messages */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => handleCardClick('/espace/mes-messages')}
          className="w-full glass rounded-3xl p-5 flex items-center gap-4 shadow-glass text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
            <MessageSquare size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-extrabold text-gray-800 tracking-tight">Mes Messages</h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Échanges avec le médecin</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <span className="min-w-[24px] h-[24px] bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1.5 shadow-sm animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </motion.button>

        {/* Card: Mes Groupes de Parole */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => handleCardClick('/espace/mes-groupes')}
          className="w-full glass rounded-3xl p-5 flex items-center gap-4 shadow-glass text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-orange-500/20">
            <Users size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-extrabold text-gray-800 tracking-tight">Mes Groupes de Parole</h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              {myGroupsCount > 0
                ? `${myGroupsCount} groupe${myGroupsCount > 1 ? 's' : ''} actif${myGroupsCount > 1 ? 's' : ''}`
                : 'Aucun groupe pour le moment'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {myGroupsCount > 0 && (
              <span className="min-w-[24px] h-[24px] bg-orange-100 text-orange-600 text-[11px] font-bold rounded-full flex items-center justify-center px-1.5">
                {myGroupsCount}
              </span>
            )}
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </motion.button>

        {/* Placeholder: Bientôt */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full glass rounded-3xl p-5 flex items-center gap-4 opacity-50 cursor-default"
        >
          <div className="w-14 h-14 bg-gray-200 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Sparkles size={24} className="text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-extrabold text-gray-400 tracking-tight">Bientôt disponible</h3>
            <p className="text-xs text-gray-300 font-medium mt-0.5">De nouvelles fonctionnalités arrivent</p>
          </div>
        </motion.div>
      </div>

      {/* Auth Modal */}
      {showAuthModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAuthModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-[32px] p-6 w-full max-w-sm shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-orange-400 to-orange-500 opacity-10" />

              <div className="relative text-center space-y-4">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto text-orange-500">
                  <LayoutGrid size={32} />
                </div>

                <div>
                  <h3 className="text-xl font-extrabold text-gray-800 tracking-tight">
                    Accédez à votre espace
                  </h3>
                  <p className="text-sm text-gray-500 mt-2 font-medium leading-relaxed">
                    Connectez-vous ou inscrivez-vous pour accéder à vos messages et groupes de parole.
                  </p>
                </div>

                <div className="pt-4 space-y-3">
                  <button
                    onClick={() => navigate('/espace?mode=register')}
                    className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/30 hover:bg-orange-600 transition-colors"
                  >
                    S'inscrire
                  </button>
                  <button
                    onClick={() => navigate('/espace?mode=login')}
                    className="w-full py-3.5 bg-orange-50 text-orange-600 rounded-2xl font-bold text-sm hover:bg-orange-100 transition-colors"
                  >
                    Se connecter
                  </button>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SlideMonEspace;
