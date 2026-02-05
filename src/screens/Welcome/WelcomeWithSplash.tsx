/**
 * WelcomeWithSplash - Wrapper qui gère le splash + welcome
 *
 * Flow :
 * 1. Vérification auth Firebase
 * 2. Si connecté → redirect vers dashboard
 * 3. Sinon → Splash animation (3s, skip après 1ère visite)
 * 4. Welcome screen avec 2 boutons
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { SplashScreen } from '../../components/ui/SplashScreen';
import { Welcome } from './index';

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

  // Pendant la vérification auth, afficher le splash
  if (checkingAuth) {
    return <SplashScreen onComplete={() => {}} />;
  }

  if (!splashComplete) {
    return <SplashScreen onComplete={() => setSplashComplete(true)} />;
  }

  return <Welcome />;
};

export default WelcomeWithSplash;
