import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Eye, EyeOff, Loader2, CheckCircle, User, ArrowRight, ArrowLeft, Mail, Baby, Key } from 'lucide-react';
import { markTokenAsUsed, validateToken } from '../../lib/tokenService';
import { motion, AnimatePresence } from 'framer-motion';

interface EspaceRegisterProps {
  tokenId?: string;
  onLoginInstead: () => void;
}

type Step = 'auth' | 'profile';

export const EspaceRegister: React.FC<EspaceRegisterProps> = ({ tokenId: initialTokenId, onLoginInstead }) => {
  const navigate = useNavigate();
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
  const [childToken, setChildToken] = useState(initialTokenId || '');
  const [childNickname, setChildNickname] = useState('');
  const [showTokenField, setShowTokenField] = useState(!!initialTokenId);
  const [isTokenValidating, setIsTokenValidating] = useState(false);

  useEffect(() => {
    if (initialTokenId) {
      setChildToken(initialTokenId);
    }
  }, [initialTokenId]);

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

      let finalToken = childToken.trim();
      let isTokenValid = false;

      // 1. Validate token if provided
      if (finalToken) {
        setIsTokenValidating(true);
        const result = await validateToken(finalToken);
        setIsTokenValidating(false);
        if (!result.valid) {
          setError(result.error || 'Code médecin invalide');
          setIsLoading(false);
          return;
        }
        isTokenValid = true;
      }

      // 2. Save Parent Account Info
      const accountRef = doc(db, 'accounts', user.uid);
      await setDoc(accountRef, {
        email: user.email,
        pseudo: parentPseudo.trim(),
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      }, { merge: true });

      // 3. Link Token (Child) if valid
      if (isTokenValid) {
        const childRef = doc(collection(db, 'accounts', user.uid, 'children'), finalToken);
        await setDoc(childRef, {
          nickname: childNickname.trim() || 'Mon enfant',
          addedAt: serverTimestamp()
        });
        await markTokenAsUsed(finalToken);
        navigate(`/espace/messages?childId=${finalToken}`);
      } else {
        navigate('/espace/dashboard');
      }

    } catch (err: any) {
      console.error('Registration completion error:', err);
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-20%] w-96 h-96 bg-orange-200/20 rounded-full blur-[100px] animate-float" />
      
      <div className="max-w-md w-full z-10">
        <AnimatePresence mode="wait">
          {step === 'auth' ? (
            <motion.div
              key="auth"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass p-8 rounded-[2rem] shadow-premium"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto bg-orange-100 rounded-2xl flex items-center justify-center mb-4 transform -rotate-6 shadow-sm">
                  <Mail className="w-8 h-8 text-orange-500" />
                </div>
                <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">Créer mon espace</h1>
                <p className="text-gray-500 mt-2 font-medium">Rejoignez Parent'aile</p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6 font-bold border border-red-100">
                  {error}
                </div>
              )}

              <Button
                variant="outline"
                className="w-full h-14 rounded-2xl border-2 hover:bg-gray-50 transition-all mb-4 text-gray-700 font-bold"
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
                <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                  <span className="px-4 bg-[#FFFBF0] text-gray-400">ou email</span>
                </div>
              </div>

              <form onSubmit={handleEmailRegister} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600 ml-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      className="h-14 pl-12 rounded-2xl border-2 focus:ring-orange-500 font-bold text-gray-700"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600 ml-1">Mot de passe</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-14 px-4 rounded-2xl border-2 focus:ring-orange-500 font-bold text-gray-700"
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
                  className="w-full h-14 bg-orange-500 hover:bg-orange-600 rounded-2xl shadow-premium text-lg font-bold mt-4"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Suivant
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-8 text-center space-y-4">
                <p className="text-sm text-gray-400 font-bold uppercase tracking-wider">
                  Déjà un compte ?{' '}
                  <button onClick={onLoginInstead} className="text-orange-500 hover:underline">
                    Se connecter
                  </button>
                </p>
                <Link to="/welcome" className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-600 font-bold text-xs uppercase tracking-widest transform transition-all active:scale-95">
                  <ArrowLeft className="w-4 h-4" />
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
              className="glass p-8 rounded-[2rem] shadow-premium"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto bg-green-100 rounded-2xl flex items-center justify-center mb-4 transform rotate-3 shadow-sm">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">Bienvenue !</h1>
                <p className="text-gray-500 mt-2 font-medium">Finalisez votre profil</p>
                {auth.currentUser?.email && (
                  <p className="text-[10px] text-gray-400 font-bold mt-1 italic opacity-60">
                    Connecté avec {auth.currentUser.email}
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-6 font-bold border border-red-100">
                  {error}
                </div>
              )}

              <form onSubmit={handleCompleteRegistration} className="space-y-6">
                {/* Parent Pseudo */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600 ml-1">Votre pseudo</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      type="text"
                      value={parentPseudo}
                      onChange={(e) => setParentPseudo(e.target.value)}
                      placeholder="Ex: Maman de Théo, Valérie..."
                      className="h-14 pl-12 rounded-2xl border-2 focus:ring-orange-500 font-bold"
                      required
                      maxLength={20}
                    />
                  </div>
                </div>

                {/* Child ID (Optional - Toggle) */}
                <div className="space-y-4">
                  {!showTokenField ? (
                    <button
                      type="button"
                      onClick={() => setShowTokenField(true)}
                      className="w-full py-4 border-2 border-dashed border-gray-200 rounded-3xl text-gray-400 font-bold hover:border-orange-300 hover:text-orange-500 transition-all flex items-center justify-center gap-2 group bg-white/40"
                    >
                      <Key className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                      J'ai un code médecin
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      <div className="flex justify-between items-center ml-1">
                        <label className="text-sm font-bold text-gray-600">Code médecin</label>
                        <button 
                          type="button"
                          onClick={() => { setShowTokenField(false); setChildToken('') }}
                          className="text-[10px] text-gray-400 font-bold uppercase underline hover:text-orange-500"
                        >
                          Annuler
                        </button>
                      </div>
                      <div className="relative">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          type="text"
                          value={childToken}
                          onChange={(e) => setChildToken(e.target.value)}
                          placeholder="XXXX-XXXX"
                          className="h-14 pl-12 rounded-2xl border-2 focus:ring-orange-500 font-bold"
                          maxLength={20}
                          autoFocus
                        />
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Child Nickname (shown if token is entered) */}
                <AnimatePresence>
                  {childToken.trim().length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, y: -20 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -20 }}
                      className="space-y-2"
                    >
                      <label className="text-sm font-bold text-gray-600 ml-1">Surnom de l'enfant</label>
                      <div className="relative">
                        <Baby className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          type="text"
                          value={childNickname}
                          onChange={(e) => setChildNickname(e.target.value)}
                          placeholder="Ex: Théo, Ma puce..."
                          className="h-14 pl-12 rounded-2xl border-2 focus:ring-orange-500 font-bold"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-col gap-4 mt-8">
                  <Button
                    type="submit"
                    className="w-full h-14 bg-orange-500 hover:bg-orange-600 rounded-2xl shadow-premium text-lg font-bold"
                    disabled={isLoading || parentPseudo.trim().length < 2}
                  >
                    {isLoading || isTokenValidating ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Terminer
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
                      className="text-gray-400 hover:text-gray-600 text-[10px] font-bold uppercase tracking-widest active:scale-95 transition-all"
                    >
                      <ArrowLeft className="w-3 h-3 inline mr-1" />
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
