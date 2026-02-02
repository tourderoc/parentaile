import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, User, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    {
      id: 'messages',
      label: 'Messages',
      icon: MessageSquare,
      path: '/espace/messages',
    },
    {
      id: 'profile',
      label: 'Mon Profil',
      icon: User,
      path: '/espace/dashboard', // Dashboard acts as the primary profile/home view
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
              <item.icon
                size={24}
                className={`transition-colors duration-300 ${
                  active ? 'text-orange-500' : 'text-gray-400'
                }`}
              />
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
