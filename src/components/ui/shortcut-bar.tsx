import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Home, MessageSquare, Calendar, ShoppingBag, User, HdmiPort as Admin } from 'lucide-react';

export const ShortcutBar = () => {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

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

  return (
    <div className="fixed left-0 top-1/2 -translate-y-1/2 bg-white shadow-lg rounded-r-lg p-2 z-50">
      <div className="flex flex-col gap-4">
        <Link to="/" className="text-gray-600 hover:text-primary transition-colors">
          <Home className="w-6 h-6" />
          <span className="sr-only">Accueil</span>
        </Link>
        <Link to="/partager" className="text-gray-600 hover:text-primary transition-colors">
          <MessageSquare className="w-6 h-6" />
          <span className="sr-only">Forum</span>
        </Link>
        <Link to="/ateliers" className="text-gray-600 hover:text-primary transition-colors">
          <Calendar className="w-6 h-6" />
          <span className="sr-only">Ateliers</span>
        </Link>
        <Link to="/boutique" className="text-gray-600 hover:text-primary transition-colors">
          <ShoppingBag className="w-6 h-6" />
          <span className="sr-only">Boutique</span>
        </Link>
        <Link to="/profile" className="text-gray-600 hover:text-primary transition-colors">
          <User className="w-6 h-6" />
          <span className="sr-only">Profil</span>
        </Link>
        {isAdmin && (
          <Link to="/admin" className="text-gray-600 hover:text-primary transition-colors">
            <Admin className="w-6 h-6" />
            <span className="sr-only">Administration</span>
          </Link>
        )}
      </div>
    </div>
  );
};