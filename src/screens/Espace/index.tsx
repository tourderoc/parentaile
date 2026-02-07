import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { validateToken, checkTokenStatus, getTokenFromCurrentUrl } from '../../lib/tokenService';
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
    const checkAuthAndToken = async () => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        const token = searchParams.get('token') || getTokenFromCurrentUrl();
        const mode = searchParams.get('mode');

        if (user) {
          try {
            // Check if profile exists
            const accountRef = doc(db, 'accounts', user.uid);
            const accountSnap = await getDoc(accountRef);
            
            if (!accountSnap.exists()) {
              // User is authenticated but profile is missing -> must be registration Step 2
              setView(token ? 'register-with-token' : 'register-free');
              return;
            }

            // Profile exists -> vérifier le token si présent (lecture seule, sans le brûler)
            if (token) {
              const result = await checkTokenStatus(token);
              if (result.valid) {
                // Token valide → rediriger vers dashboard pour ajout enfant
                navigate(`/espace/dashboard?token=${token}`);
              } else {
                // Token déjà utilisé ou invalide → afficher l'erreur
                setTokenId(token);
                setError(result.error || 'Code médecin invalide');
                setView('error');
              }
            } else {
              navigate('/espace/dashboard');
            }
          } catch (err) {
            console.error('Auth verification error:', err);
            setView('error');
          }
          return;
        }

        // Deep Link: Token in URL
        if (token) {
          setTokenId(token);
          setView('token-validation');
          const result = await validateToken(token);

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
      });

      return () => unsubscribe();
    };

    checkAuthAndToken();
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

