/**
 * EspaceLogin - Connexion à l'Espace Patient
 *
 * Pour les parents qui ont déjà un compte
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../../lib/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Eye, EyeOff, Loader2, Home, Mail, X, CheckCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Clés localStorage
const REMEMBER_EMAIL_KEY = 'parentaile_remember_email';
const REMEMBERED_EMAIL_KEY = 'parentaile_saved_email';

export const EspaceLogin: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Charger l'email sauvegardé au chargement
  useEffect(() => {
    const savedRemember = localStorage.getItem(REMEMBER_EMAIL_KEY);
    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (savedRemember === 'true' && savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);

      // Sauvegarder ou effacer l'email selon "Se souvenir de moi"
      if (rememberMe) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, 'true');
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      navigate('/espace/dashboard');
    } catch (err: any) {
      console.error('Firebase Auth Error:', err.code, err.message);

      // Firebase v10+ utilise auth/invalid-credential pour login incorrect
      if (err.code === 'auth/user-not-found' ||
          err.code === 'auth/wrong-password' ||
          err.code === 'auth/invalid-credential') {
        setError('Email ou mot de passe incorrect.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Adresse email invalide');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Trop de tentatives. Réessayez dans quelques minutes.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Erreur de connexion internet.');
      } else {
        setError(`Erreur: ${err.code || err.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      navigate('/espace/dashboard');
    } catch (err: any) {
      setError('Erreur lors de la connexion avec Google');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset password handler
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setIsResetting(true);

    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetSuccess(true);
    } catch (err: any) {
      console.error('Password reset error:', err.code);
      if (err.code === 'auth/user-not-found') {
        setResetError('Aucun compte associé à cet email');
      } else if (err.code === 'auth/invalid-email') {
        setResetError('Adresse email invalide');
      } else if (err.code === 'auth/too-many-requests') {
        setResetError('Trop de tentatives. Réessayez plus tard.');
      } else {
        setResetError('Erreur lors de l\'envoi. Réessayez.');
      }
    } finally {
      setIsResetting(false);
    }
  };

  const openForgotPassword = () => {
    setResetEmail(email); // Pre-fill with email if already entered
    setResetError(null);
    setResetSuccess(false);
    setShowForgotPassword(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-10 h-10 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Connexion</h1>
          <p className="text-gray-600 mt-2">Espace Patient Parent'aile</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {/* Email/Password form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adresse email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Mot de passe
                </label>
                <button
                  type="button"
                  onClick={openForgotPassword}
                  className="text-xs text-orange-500 hover:text-orange-600 hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Se souvenir de moi */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setRememberMe(!rememberMe)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mr-2 ${
                  rememberMe
                    ? 'bg-orange-500 border-orange-500'
                    : 'border-gray-300 hover:border-orange-400'
                }`}
              >
                {rememberMe && <Check size={14} className="text-white" />}
              </button>
              <label
                onClick={() => setRememberMe(!rememberMe)}
                className="text-sm text-gray-600 cursor-pointer select-none"
              >
                Se souvenir de moi
              </label>
            </div>

            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connexion...
                </>
              ) : (
                'Se connecter'
              )}
            </Button>
          </form>

          {/* Separator */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-gray-500">ou</span>
            </div>
          </div>

          {/* Google login */}
          <Button
            variant="outline"
            className="w-full mb-4"
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4 mr-2" />
            Continuer avec Google
          </Button>
        </div>

        {/* Back to home */}
        <div className="text-center mt-6">
          <Link to="/" className="text-gray-500 hover:text-gray-700 text-sm inline-flex items-center gap-2">
            <Home className="w-4 h-4" />
            Retour à l'accueil
          </Link>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <AnimatePresence>
        {showForgotPassword && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center px-4"
            onClick={() => setShowForgotPassword(false)}
          >
            <motion.div
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 50, scale: 0.95 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl"
            >
              {!resetSuccess ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Mot de passe oublié</h3>
                    <button
                      onClick={() => setShowForgotPassword(false)}
                      className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <p className="text-gray-600 text-sm mb-4">
                    Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
                  </p>

                  {resetError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                      {resetError}
                    </div>
                  )}

                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Adresse email
                      </label>
                      <Input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="votre@email.com"
                        required
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowForgotPassword(false)}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 bg-orange-500 hover:bg-orange-600"
                        disabled={isResetting}
                      >
                        {isResetting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Envoyer'
                        )}
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">Email envoyé !</h3>
                  <p className="text-gray-600 text-sm mb-4">
                    Consultez votre boîte mail <strong>{resetEmail}</strong> et suivez les instructions pour réinitialiser votre mot de passe.
                  </p>
                  <p className="text-gray-400 text-xs mb-4">
                    Pensez à vérifier vos spams si vous ne trouvez pas l'email.
                  </p>
                  <Button
                    onClick={() => setShowForgotPassword(false)}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    Retour à la connexion
                  </Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EspaceLogin;
