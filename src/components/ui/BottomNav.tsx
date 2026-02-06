import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, User, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, orderBy, getDocs, onSnapshot } from 'firebase/firestore';

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  // Écouter les messages avec réponse non consultés
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    let unsubscribes: (() => void)[] = [];

    const setupListeners = async () => {
      try {
        // Récupérer les enfants du parent
        const childrenRef = collection(db, 'accounts', user.uid, 'children');
        const childrenSnap = await getDocs(query(childrenRef, orderBy('addedAt', 'desc')));
        const tokenIds = childrenSnap.docs.map(d => d.id);

        if (tokenIds.length === 0) return;

        // Écouter les notifications non lues (temps réel)
        const chunks: string[][] = [];
        for (let i = 0; i < tokenIds.length; i += 10) {
          chunks.push(tokenIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const notifRef = collection(db, 'notifications');
          const q = query(
            notifRef,
            where('tokenId', 'in', chunk),
            where('read', '==', false)
          );

          const unsub = onSnapshot(q, (snapshot) => {
            setUnreadCount(snapshot.docs.length);
          }, () => {
            // Silently ignore errors
          });

          unsubscribes.push(unsub);
        }
      } catch {
        // Silently ignore
      }
    };

    setupListeners();

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, []);

  const navItems = [
    {
      id: 'messages',
      label: 'Messages',
      icon: MessageSquare,
      path: '/espace/messages',
    },
    {
      id: 'contact',
      label: 'Contact',
      icon: User,
      path: '/espace/dashboard',
    },
    {
      id: 'settings',
      label: 'Paramètres',
      icon: Settings,
      path: '/espace/parametres',
    },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
      <nav className="max-w-md mx-auto glass shadow-premium rounded-3xl p-2 flex justify-around items-center">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const showBadge = item.id === 'messages' && unreadCount > 0;

          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center gap-1 p-2 min-w-[80px] transition-colors"
            >
              {active && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 bg-orange-100 rounded-2xl -z-10"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <div className="relative">
                <item.icon
                  size={24}
                  className={`transition-colors duration-300 ${
                    active ? 'text-orange-500' : 'text-gray-400'
                  }`}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${
                  active ? 'text-orange-600' : 'text-gray-400'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;
