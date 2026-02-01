/**
 * EspaceRegister - Inscription Espace Patient avec token valide
 *
 * Flux d'inscription :
 * 1. Token validé ✓
 * 2. Choix méthode auth (email ou Google)
 * 3. Création compte
 * 4. Demande nickname enfant
 * 5. Lien token → compte → nickname
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Eye, EyeOff, Loader2, Home, CheckCircle, User, ArrowRight, ArrowLeft } from 'lucide-react';
import { markTokenAsUsed } from '../../lib/tokenService';
import { validateNickname } from '../../lib/pseudoFilter';

interface EspaceRegisterProps {
  tokenId: string;
  onLoginInstead: () => void;
}

type Step = 'auth' | 'nickname';

export const EspaceRegister: React.FC<EspaceRegisterProps> = ({ tokenId, onLoginInstead }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('auth');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authMethod, setAuthMethod] = useState<'email' | 'google' | null>(null);

  // Nickname state
  const [nickname, setNickname] = useState('');

  // Handle email registration
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setIsLoading(true);
    setAuthMethod('email');

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setStep('nickname');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        // Try to login instead
        try {
          await signInWithEmailAndPassword(auth, email, password);
          setStep('nickname');
        } catch {
          setError('Cet email est déjà utilisé. Essayez de vous connecter.');
        }
      } else if (err.code === 'auth/invalid-email') {
        setError('Adresse email invalide');
      } else {
        setError('Une erreur est survenue. Veuillez réessayer.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google registration
  const handleGoogleRegister = async () => {
    setError(null);
    setIsLoading(true);
    setAuthMethod('google');

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setStep('nickname');
    } catch (err: any) {
      setError('Erreur lors de la connexion avec Google');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle nickname submission
  const handleNicknameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Valider le nickname
    const validation = validateNickname(nickname);
    if (!validation.valid) {
      setError(validation.error || 'Surnom invalide');
      return;
    }

    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Utilisateur non connecté');
      }

      // Créer le compte dans Firestore (collection accounts)
      const accountRef = doc(db, 'accounts', user.uid);
      await setDoc(accountRef, {
        email: user.email,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      }, { merge: true });

      // Ajouter l'enfant (sous-collection children)
      const childRef = doc(collection(db, 'accounts', user.uid, 'children'), tokenId);
      await setDoc(childRef, {
        nickname: nickname.trim(),
        addedAt: serverTimestamp()
      });

      // Marquer le token comme utilisé
      await markTokenAsUsed(tokenId);

      // Rediriger vers le dashboard
      navigate('/espace/dashboard');

    } catch (err: any) {
      console.error('Erreur création compte:', err);
      setError('Une erreur est survenue lors de la création du compte');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Authentication
  if (step === 'auth') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Code validé !</h1>
            <p className="text-gray-600 mt-2">Créez votre compte pour continuer</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            {/* Error message */}
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                {error}
              </div>
            )}

            {/* Google registration */}
            <Button
              variant="outline"
              className="w-full mb-4"
              onClick={handleGoogleRegister}
              disabled={isLoading}
            >
              {isLoading && authMethod === 'google' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4 mr-2" />
              )}
              Continuer avec Google
            </Button>

            {/* Separator */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-gray-500">ou avec email</span>
              </div>
            </div>

            {/* Email/Password form */}
            <form onSubmit={handleEmailRegister} className="space-y-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mot de passe
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmer le mot de passe
                </label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600"
                disabled={isLoading}
              >
                {isLoading && authMethod === 'email' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Création du compte...
                  </>
                ) : (
                  <>
                    Créer mon compte
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            {/* Already have account */}
            <p className="text-center text-sm text-gray-500 mt-4">
              Déjà un compte ?{' '}
              <button
                onClick={onLoginInstead}
                className="text-orange-500 hover:underline"
              >
                Se connecter
              </button>
            </p>
          </div>

          {/* Back to home */}
          <div className="text-center mt-6">
            <Link to="/" className="text-gray-500 hover:text-gray-700 text-sm inline-flex items-center gap-2">
              <Home className="w-4 h-4" />
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Nickname
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <User className="w-10 h-10 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Dernière étape !</h1>
          <p className="text-gray-600 mt-2">Comment s'appelle votre enfant ?</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          {/* Error message */}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          <p className="text-gray-600 text-sm mb-6">
            Ce prénom ou surnom sera utilisé pour identifier votre enfant dans l'application.
            Vous seul(e) le verrez.
          </p>

          <form onSubmit={handleNicknameSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prénom ou surnom
              </label>
              <Input
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setError(null);
                }}
                placeholder="Ex: Théo, Ma puce, Loulou..."
                autoFocus
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Finalisation...
                </>
              ) : (
                <>
                  Terminer l'inscription
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Back button */}
          <button
            onClick={() => setStep('auth')}
            className="mt-4 text-gray-500 hover:text-gray-700 text-sm inline-flex items-center gap-2 mx-auto w-full justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
        </div>
      </div>
    </div>
  );
};

export default EspaceRegister;
