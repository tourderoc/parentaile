import React, { useState, useEffect } from 'react';
import { Home, MessageSquarePlus, Inbox, Mic, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, orderBy, getDocs, onSnapshot } from 'firebase/firestore';

interface BottomNavSwiperProps {
  activeIndex: number;
  onNavigate: (index: number) => void;
}

export const BottomNavSwiper: React.FC<BottomNavSwiperProps> = ({ activeIndex, onNavigate }) => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    let unsubscribes: (() => void)[] = [];

    const setupListeners = async () => {
      try {
        const childrenRef = collection(db, 'accounts', user.uid, 'children');
        const childrenSnap = await getDocs(query(childrenRef, orderBy('addedAt', 'desc')));
        const tokenIds = childrenSnap.docs.map(d => d.id);

        if (tokenIds.length === 0) return;

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
          }, () => {});

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
    { id: 'accueil', label: 'Accueil', icon: Home },
    { id: 'contact', label: 'Contact', icon: MessageSquarePlus },
    { id: 'messages', label: 'Messages', icon: Inbox },
    { id: 'forum', label: 'Forum', icon: Mic },
    { id: 'settings', label: 'Param.', icon: Settings },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
      <nav className="max-w-md mx-auto glass shadow-premium rounded-3xl p-1.5 flex justify-around items-center">
        {navItems.map((item, index) => {
          const active = activeIndex === index;
          const showBadge = item.id === 'messages' && unreadCount > 0;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(index)}
              className="relative flex flex-col items-center gap-0.5 p-1.5 min-w-[56px] transition-colors"
            >
              {active && (
                <motion.div
                  layoutId="active-pill-swiper"
                  className="absolute inset-0 bg-orange-100 rounded-2xl -z-10"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <div className="relative">
                <item.icon
                  size={20}
                  className={`transition-colors duration-300 ${
                    active ? 'text-orange-500' : 'text-gray-400'
                  }`}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 shadow-sm animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[8px] font-bold uppercase tracking-wider transition-colors duration-300 ${
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

export default BottomNavSwiper;
