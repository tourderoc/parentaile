/**
 * Espace Patient - Point d'entrée
 *
 * Ce composant gère l'accès à l'Espace Patient :
 * 1. Vérifie s'il y a un token dans l'URL
 * 2. Si token : valide et affiche inscription/erreur
 * 3. Si connecté : redirige vers le dashboard
 * 4. Sinon : affiche formulaire de connexion
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { validateToken, getTokenFromCurrentUrl } from '../../lib/tokenService';
import { TokenLogin } from './TokenLogin';
import { EspaceLogin } from './EspaceLogin';
import { EspaceRegister } from './EspaceRegister';
import { Loader2 } from 'lucide-react';

type EspaceView = 'loading' | 'token-validation' | 'login' | 'register' | 'error';

export const Espace = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<EspaceView>('loading');
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthAndToken = async () => {
      // Vérifier si l'utilisateur est déjà connecté
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          // Utilisateur connecté → dashboard
          navigate('/espace/dashboard');
          return;
        }

        // Pas connecté : vérifier s'il y a un token
        const token = searchParams.get('token') || getTokenFromCurrentUrl();

        if (token) {
          setTokenId(token);
          setView('token-validation');

          // Valider le token
          const result = await validateToken(token);

          if (result.valid) {
            // Token valide → afficher inscription
            setView('register');
          } else {
            // Token invalide → afficher erreur
            setError(result.error || 'Token invalide');
            setView('error');
          }
        } else {
          // Pas de token → afficher login
          setView('login');
        }
      });

      return () => unsubscribe();
    };

    checkAuthAndToken();
  }, [navigate, searchParams]);

  // Loading
  if (view === 'loading' || view === 'token-validation') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-600">
            {view === 'loading' ? 'Chargement...' : 'Vérification du token...'}
          </p>
        </div>
      </div>
    );
  }

  // Erreur token
  if (view === 'error') {
    return (
      <TokenLogin
        error={error}
        onRetry={() => setView('login')}
        onManualToken={(token) => {
          setTokenId(token);
          navigate(`/espace?token=${token}`);
          window.location.reload();
        }}
      />
    );
  }

  // Inscription avec token valide
  if (view === 'register' && tokenId) {
    return (
      <EspaceRegister
        tokenId={tokenId}
        onLoginInstead={() => setView('login')}
      />
    );
  }

  // Login classique
  return (
    <EspaceLogin
      onRegisterWithToken={(token) => {
        setTokenId(token);
        navigate(`/espace?token=${token}`);
        window.location.reload();
      }}
    />
  );
};

export default Espace;
