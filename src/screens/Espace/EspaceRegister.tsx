import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { accountStorage } from '../../lib/accountStorage';
import { useUser } from '../../lib/userContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Eye, EyeOff, Loader2, CheckCircle, User, ArrowRight, ArrowLeft, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface EspaceRegisterProps {
  tokenId?: string;
  onLoginInstead: () => void;
}

type Step = 'auth' | 'profile';

export const EspaceRegister: React.FC<EspaceRegisterProps> = ({ onLoginInstead }) => {
  const navigate = useNavigate();
  const { setLocalData } = useUser();
  const [step, setStep] = useState<Step>(auth.currentUser ? 'profile' : 'auth');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync step if auth changes (e.g. after Step 1)
  useEffect(() => {
    if (auth.currentUser && step === 'auth') {
      setStep('profile');
    }
  }, [auth.currentUser, step]);

  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Profile states
  const [parentPseudo, setParentPseudo] = useState('');

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setStep('profile');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        try {
          // Attempt to login if they already have an account but landed here
          await signInWithEmailAndPassword(auth, email, password);
          setStep('profile');
        } catch {
          setError('Cet email est déjà utilisé. Essayez de vous connecter.');
        }
      } else {
        setError('Une erreur est survenue lors de la création du compte.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setStep('profile');
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Erreur lors de la connexion avec Google');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Utilisateur non connecté');

        // Save Parent Account Info via accountStorage
        await accountStorage.createAccount({
          uid: user.uid,
          email: user.email,
          pseudo: parentPseudo.trim(),
        });
  
        // Optimistic Update: Prime the context with registration data
        // to avoid 404 race condition during dashboard load.
        setLocalData({
          pseudo: parentPseudo.trim(),
          points: 0,
          badge: 'none',
          loading: false
        });
  
        navigate('/espace/dashboard');

    } catch (err: any) {
      console.error('Registration completion error:', err);
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col pt-4">
      <div className="max-w-md mx-auto w-full px-6 flex flex-col min-h-screen">
        
        {/* Hero Header - Premium Dark Cartouche matching Login/Settings */}
        <div className="relative border border-white/20 shadow-premium overflow-hidden bg-gray-900 rounded-[2.5rem] mb-8">
          <div className="absolute inset-0 opacity-80">
            <img 
              src="/assets/backgrounds/slide_bg_settings.png" 
              alt="Register Background"
              className="w-full h-full object-cover transform translate-y-[-5%] scale-110"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10 pointer-events-none" />

          <div className="relative px-6 py-8 flex items-center gap-5">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex flex-shrink-0 items-center justify-center shadow-glass border border-white/20">
              <User size={32} className="text-white drop-shadow-md" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-md leading-tight">
                {step === 'auth' ? 'Inscription' : 'Profil'}
              </h1>
              <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-1 drop-shadow-sm line-clamp-1">
                {step === 'auth' ? 'Rejoignez la communauté Parent\'aile' : 'Finalisez votre inscription'}
              </p>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 'auth' ? (
            <motion.div
              key="auth"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-premium p-8 mb-32"
            >
              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm mb-6 font-bold border border-red-100 flex items-center gap-2">
                  <X size={18} />
                  {error}
                </div>
              )}

              <Button
                variant="outline"
                className="w-full h-14 rounded-2xl border-2 border-gray-100 hover:bg-gray-50 hover:border-gray-200 transition-all font-bold text-gray-700 shadow-sm mb-6"
                onClick={handleGoogleRegister}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin text-orange-500" />
                ) : (
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 mr-3" />
                )}
                Continuer avec Google
              </Button>

              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-100"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-black tracking-[0.2em]">
                  <span className="px-4 bg-transparent text-gray-400/60">Ou par email</span>
                </div>
              </div>

              <form onSubmit={handleEmailRegister} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="h-14 pl-5 rounded-2xl border-2 border-gray-100 focus:border-orange-500 font-bold"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Mot de passe</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-14 pl-5 pr-12 rounded-2xl border-2 border-gray-100 focus:border-orange-500 font-bold"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold shadow-premium active:scale-[0.98] transition-all text-lg mt-4"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      Continuer
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-8 text-center space-y-6">
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                  Déjà un compte ?{' '}
                  <button onClick={onLoginInstead} className="text-orange-500 hover:underline">
                    Se connecter
                  </button>
                </p>
                <Link to="/welcome" className="inline-flex items-center gap-2 text-gray-400 hover:text-orange-500 font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95 group">
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  Retour
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white/40 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-premium p-8 mb-32"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto bg-green-100 rounded-2xl flex items-center justify-center mb-4 transform rotate-3 shadow-sm text-green-500">
                  <CheckCircle size={32} />
                </div>
                <h2 className="text-2xl font-black text-gray-800 tracking-tight leading-tight">Bienvenue !</h2>
                <p className="text-sm text-gray-500 mt-2 font-medium">Finalisez votre profil Parent'aile</p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm mb-6 font-bold border border-red-100">
                  {error}
                </div>
              )}

              <form onSubmit={handleCompleteRegistration} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Votre pseudo</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="text"
                      value={parentPseudo}
                      onChange={(e) => setParentPseudo(e.target.value)}
                      placeholder="Ex: Maman de Théo, Valérie..."
                      className="h-14 pl-12 rounded-2xl border-2 border-gray-100 focus:border-orange-500 font-bold shadow-sm"
                      required
                      maxLength={20}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-4 mt-8">
                  <Button
                    type="submit"
                    className="w-full h-14 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold shadow-premium active:scale-[0.98] transition-all text-lg"
                    disabled={isLoading || parentPseudo.trim().length < 2}
                  >
                    {isLoading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        Commencer l'aventure
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </Button>
                  
                  {!isLoading && (
                    <button
                      type="button"
                      onClick={async () => {
                        await signOut(auth);
                        setStep('auth');
                      }}
                      className="text-gray-400 hover:text-orange-500 text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all text-center"
                    >
                      Utiliser un autre email
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default EspaceRegister;
