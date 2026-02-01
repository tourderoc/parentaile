import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Home, MessageSquare, Calendar, ShoppingBag, User, HdmiPort as Admin, Mail } from 'lucide-react';

// Configuration V0 : fonctionnalités grisées
const DISABLED_FEATURES = {
  forum: true,      // /partager - Grisé
  ateliers: true,   // /ateliers - Grisé
  boutique: true,   // /boutique - Grisé
  teleconsultation: true, // /teleconsultation - Grisé
};

interface NavLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}

const NavLink: React.FC<NavLinkProps> = ({ to, icon, label, disabled = false }) => {
  if (disabled) {
    return (
      <div
        className="relative group cursor-not-allowed"
        title="Bientôt disponible"
      >
        <div className="text-gray-300 opacity-50">
          {icon}
        </div>
        <span className="sr-only">{label} (Bientôt disponible)</span>
        {/* Tooltip */}
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
          Bientôt disponible
        </div>
      </div>
    );
  }

  return (
    <Link to={to} className="text-gray-600 hover:text-primary transition-colors">
      {icon}
      <span className="sr-only">{label}</span>
    </Link>
  );
};

export const ShortcutBar = () => {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

  // Cacher sur la page d'accueil, admin et espace patient
  const hideShortcutBar = location.pathname === "/" ||
                          location.pathname.startsWith("/admin") ||
                          location.pathname.startsWith("/espace");

  useEffect(() => {
    const checkUserRole = async () => {
      if (!auth.currentUser) {
        setIsAdmin(false);
        return;
      }

      try {
        const userDoc = await getDocs(query(
          collection(db, 'users'),
          where('uid', '==', auth.currentUser.uid),
          where('role', '==', 'admin')
        ));

        setIsAdmin(!userDoc.empty);
      } catch (error) {
        console.error('Error checking user role:', error);
        setIsAdmin(false);
      }
    };

    const unsubscribe = auth.onAuthStateChanged(checkUserRole);
    return () => unsubscribe();
  }, []);

  if (hideShortcutBar) {
    return null;
  }

  return (
    <div className="fixed left-0 top-1/2 -translate-y-1/2 bg-white shadow-lg rounded-r-lg p-2 z-50">
      <div className="flex flex-col gap-4">
        {/* Accueil - Toujours actif */}
        <NavLink
          to="/"
          icon={<Home className="w-6 h-6" />}
          label="Accueil"
        />

        {/* Forum - Grisé V0 */}
        <NavLink
          to="/partager"
          icon={<MessageSquare className="w-6 h-6" />}
          label="Forum"
          disabled={DISABLED_FEATURES.forum}
        />

        {/* Ateliers - Grisé V0 */}
        <NavLink
          to="/ateliers"
          icon={<Calendar className="w-6 h-6" />}
          label="Ateliers"
          disabled={DISABLED_FEATURES.ateliers}
        />

        {/* Boutique - Grisé V0 */}
        <NavLink
          to="/boutique"
          icon={<ShoppingBag className="w-6 h-6" />}
          label="Boutique"
          disabled={DISABLED_FEATURES.boutique}
        />

        {/* Espace Personnel - Actif V0 (futur: /espace) */}
        <NavLink
          to="/profile"
          icon={<User className="w-6 h-6" />}
          label="Mon espace"
        />

        {/* Admin - Conditionnel */}
        {isAdmin && (
          <NavLink
            to="/admin"
            icon={<Admin className="w-6 h-6" />}
            label="Administration"
          />
        )}
      </div>
    </div>
  );
};
