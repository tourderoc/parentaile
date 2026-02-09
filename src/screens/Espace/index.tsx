import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { checkTokenStatus, getTokenFromCurrentUrl } from '../../lib/tokenService';
import { TokenLogin } from './TokenLogin';
import { EspaceLogin } from './EspaceLogin';
import { EspaceRegister } from './EspaceRegister';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type EspaceView = 'loading' | 'token-validation' | 'login' | 'register-with-token' | 'register-free' | 'error';

export const Espace = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<EspaceView>('loading');
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Attendre que Firebase auth soit prêt (un seul appel, pas de double-fire)
      await new Promise<void>((resolve) => {
        const unsub = onAuthStateChanged(auth, () => {
          unsub();
          resolve();
        });
      });

      if (cancelled) return;

      const user = auth.currentUser;
      const token = searchParams.get('token') || getTokenFromCurrentUrl();
      const mode = searchParams.get('mode');

      if (user) {
        try {
          const accountRef = doc(db, 'accounts', user.uid);
          const accountSnap = await getDoc(accountRef);
          if (cancelled) return;

          if (!accountSnap.exists()) {
            setView(token ? 'register-with-token' : 'register-free');
            return;
          }

          // Profile exists -> vérifier le token si présent (lecture seule)
          if (token) {
            const result = await checkTokenStatus(token);
            if (cancelled) return;
            if (result.valid) {
              navigate(`/espace/parametres?token=${token}`);
            } else {
              setTokenId(token);
              setError(result.error || 'Code médecin invalide');
              setView('error');
            }
          } else {
            navigate('/espace/dashboard');
          }
        } catch (err) {
          console.error('Auth verification error:', err);
          if (!cancelled) setView('error');
        }
        return;
      }

      // Pas connecté + token dans l'URL
      if (token) {
        setTokenId(token);
        setView('token-validation');
        const result = await checkTokenStatus(token);
        if (cancelled) return;

        if (result.valid) {
          setView('register-with-token');
        } else {
          setError(result.error || 'Code médecin invalide');
          setView('error');
        }
        return;
      }

      if (mode === 'register') {
        setView('register-free');
        return;
      }

      setView('login');
    };

    init();
    return () => { cancelled = true; };
  }, [navigate, searchParams]);

  const renderContent = () => {
    switch (view) {
      case 'token-validation':
      case 'loading':
        return (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            <Loader2 className="w-12 h-12 animate-spin text-orange-500 mb-4" />
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">
              {view === 'loading' ? 'Chargement...' : 'Vérification du code...'}
            </p>
          </motion.div>
        );

      case 'error':
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

      case 'register-with-token':
      case 'register-free':
        return (
          <EspaceRegister
            tokenId={tokenId || undefined}
            onLoginInstead={() => setView('login')}
          />
        );

      default:
        return <EspaceLogin />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {renderContent()}
      </AnimatePresence>
    </div>
  );
};

export default Espace;

