/**
 * WelcomeWithSplash - Wrapper qui gère le splash + welcome
 *
 * Flow :
 * 1. Vérification auth Firebase
 * 2. Si connecté → redirect vers dashboard (skip animation si "Se souvenir de moi")
 * 3. Sinon → Splash animation (3s, skip après 1ère visite)
 * 4. Welcome screen avec 2 boutons
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { SplashScreen } from '../../components/ui/SplashScreen';
import { Welcome } from './index';

// Vérifier si "Se souvenir de moi" est actif
const isRemembered = localStorage.getItem('parentaile_remember_email') === 'true';

export const WelcomeWithSplash: React.FC = () => {
  const navigate = useNavigate();
  const [splashComplete, setSplashComplete] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Vérifier si l'utilisateur est déjà connecté
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Utilisateur déjà connecté → aller directement au dashboard
        navigate('/espace/dashboard', { replace: true });
      } else {
        // Pas connecté → afficher le splash/welcome
        setCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Si "Se souvenir de moi" est actif, afficher un écran de chargement minimal
  // au lieu de l'animation Lottie (plus fluide)
  if (checkingAuth && isRemembered) {
    return (
      <div className="fixed inset-0 z-[100] bg-gradient-to-b from-orange-50 via-white to-orange-100 flex items-center justify-center">
        <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-200 animate-pulse">
          <span className="text-white font-bold text-lg">P</span>
        </div>
      </div>
    );
  }

  // Sinon, afficher le splash Lottie normalement
  if (checkingAuth) {
    return <SplashScreen onComplete={() => {}} />;
  }

  if (!splashComplete) {
    return <SplashScreen onComplete={() => setSplashComplete(true)} />;
  }

  return <Welcome />;
};

export default WelcomeWithSplash;
